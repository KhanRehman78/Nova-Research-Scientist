// NOVA search-agent — queries 5 academic sources, normalizes + dedupes, saves papers.
import {
  fetchWithRetry,
  getAuthedClient,
  json,
  ok,
  sleep,
  stripHtml,
  abstractFromInvertedIndex,
  normalizeTitle,
  firstDefined,
  decodeEntities,
} from "../_shared/mod.ts";

type Paper = {
  run_id: string;
  source: string;
  source_id: string | null;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  abstract: string | null;
  url: string | null;
  citation_count: number;
  open_access_pdf: string | null;
};

type SourceResult = {
  source: string;
  status: "ok" | "failed" | "empty";
  count: number;
  error?: string;
};

const LIMITS: Record<string, number> = {
  arxiv: 25,
  semantic_scholar: 30,
  pubmed: 25,
  openalex: 25,
  crossref: 25,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return ok();

  let authed;
  try {
    authed = await getAuthedClient(req);
  } catch (e: any) {
    return json({ error: e.message }, e.status ?? 401);
  }
  const { supabase } = authed;

  let body: { run_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const runId = body.run_id;
  if (!runId) return json({ error: "run_id is required" }, 400);

  // Load the run (RLS protects access).
  const { data: run, error: runErr } = await supabase
    .from("research_runs")
    .select("id, query, mode, project_id")
    .eq("id", runId)
    .single();
  if (runErr || !run) return json({ error: "Run not found or forbidden" }, 404);

  await supabase
    .from("research_runs")
    .update({ current_stage: "search", status: "running" })
    .eq("id", runId);

  // Upsert task row for this stage.
  const { data: task } = await supabase
    .from("run_tasks")
    .select("id")
    .eq("run_id", runId)
    .eq("stage", "search")
    .maybeSingle();

  const taskId = task?.id ?? crypto.randomUUID();
  await supabase.from("run_tasks").upsert({
    id: taskId,
    run_id: runId,
    stage: "search",
    status: "running",
    input: { query: run.query, mode: run.mode },
    error: null,
    updated_at: new Date().toISOString(),
  });

  const query = run.query;
  let queryUsed = query;
  let widened = false;
  let results = await searchSources(query);

  // A very specific natural-language question can be empty across every
  // provider. Retry once with its most informative terms before returning an
  // actionable empty state to the client.
  if (results.every((result) => result.status === "fulfilled" && result.value.length === 0)) {
    const broaderQuery = widenQuery(query);
    if (broaderQuery !== query) {
      results = await searchSources(broaderQuery);
      queryUsed = broaderQuery;
      widened = true;
    }
  }

  const papers: Paper[] = [];
  const sourceStatus: SourceResult[] = [];

  const sources = ["arxiv", "semantic_scholar", "pubmed", "openalex", "crossref"];
  results.forEach((res, i) => {
    const name = sources[i];
    if (res.status === "rejected") {
      sourceStatus.push({
        source: name,
        status: "failed",
        count: 0,
        error: (res.reason as Error)?.message ?? "unknown error",
      });
      return;
    }
    const list = res.value as Paper[];
    if (list.length === 0) {
      sourceStatus.push({ source: name, status: "empty", count: 0 });
    } else {
      papers.push(...list);
      sourceStatus.push({ source: name, status: "ok", count: list.length });
    }
  });

  // Dedupe by DOI first, then normalized title.
  const seen = new Map<string, Paper>();
  for (const p of papers) {
    const key = p.doi
      ? `doi:${p.doi.toLowerCase()}`
      : `title:${normalizeTitle(p.title)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, p);
    } else {
      // Merge: prefer richer metadata + higher citations.
      existing.citation_count = Math.max(
        existing.citation_count,
        p.citation_count,
      );
      if (!existing.abstract && p.abstract) existing.abstract = p.abstract;
      if (!existing.open_access_pdf && p.open_access_pdf) {
        existing.open_access_pdf = p.open_access_pdf;
      }
      if (!existing.year && p.year) existing.year = p.year;
      if (!existing.doi && p.doi) existing.doi = p.doi;
      if (!existing.url && p.url) existing.url = p.url;
      if (existing.authors.length === 0 && p.authors.length > 0) {
        existing.authors = p.authors;
      }
    }
  }

  const deduped = [...seen.values()].sort(
    (a, b) => b.citation_count - a.citation_count,
  );

  // Refresh: clear this run's papers, then insert the fresh set.
  await supabase.from("papers").delete().eq("run_id", runId);
  if (deduped.length > 0) {
    const { error: insertErr } = await supabase.from("papers").insert(
      deduped.map((p) => ({
        run_id: runId,
        source: p.source,
        source_id: p.source_id,
        title: p.title,
        authors: p.authors,
        year: p.year,
        doi: p.doi,
        abstract: p.abstract,
        url: p.url,
        citation_count: p.citation_count,
        open_access_pdf: p.open_access_pdf,
      })),
    );
    if (insertErr) {
      await supabase
        .from("run_tasks")
        .update({ status: "failed", error: insertErr.message })
        .eq("id", taskId);
      return json({ error: `Could not save papers: ${insertErr.message}` }, 500);
    }
  }

  const summary = {
    total: deduped.length,
    sources: sourceStatus,
    query_used: queryUsed,
    widened,
    saved_at: new Date().toISOString(),
  };

  await supabase
    .from("run_tasks")
    .update({
      status: deduped.length > 0 ? "done" : "done",
      output: summary,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  return json({ run_id: runId, ...summary });
});

function searchSources(query: string) {
  return Promise.allSettled([
    searchArxiv(query),
    searchSemanticScholar(query),
    searchPubmed(query),
    searchOpenAlex(query),
    searchCrossref(query),
  ]);
}

function widenQuery(query: string): string {
  const stop = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "for",
    "from", "how", "in", "is", "of", "on", "or", "the", "to", "using", "what",
    "when", "where", "which", "with",
  ]);
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !stop.has(term));
  return [...new Set(terms)].slice(0, 8).join(" ") || query;
}

// ---------------- arXiv (Atom XML) ----------------
async function searchArxiv(query: string): Promise<Paper[]> {
  const url =
    `https://export.arxiv.org/api/query?search_query=all:${
      encodeURIComponent(query)
    }&start=0&max_results=${LIMITS.arxiv}&sortBy=relevance`;
  const res = await fetchWithRetry(url, {}, 2, 12_000);
  const xml = await res.text();
  const entries = xml.split("<entry>").slice(1);
  const out: Paper[] = [];
  for (const entry of entries) {
    const grab = (re: RegExp) => {
      const m = entry.match(re);
      return m ? decodeEntities(m[1].trim()) : "";
    };
    const title = grab(/<title>([\s\S]*?)<\/title>/);
    const absId = grab(/<id>[\s\S]*?abs\/([^<]+)<\/id>/);
    const summary = stripHtml(grab(/<summary>([\s\S]*?)<\/summary>/));
    const year = Number(grab(/<published>(\d{4})/)) || null;
    const doi = grab(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/);
    const authors = [...entry.matchAll(/<name>([^<]+)<\/name>/g)].map((m) =>
      decodeEntities(m[1].trim())
    );
    const pdf = absId
      ? `https://arxiv.org/pdf/${absId}`
      : grab(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/);
    if (!title) continue;
    out.push({
      run_id: "",
      source: "arxiv",
      source_id: absId || null,
      title,
      authors,
      year,
      doi: doi || null,
      abstract: summary || null,
      url: absId ? `https://arxiv.org/abs/${absId}` : null,
      citation_count: 0,
      open_access_pdf: pdf || null,
    });
  }
  return out;
}

// ---------------- Semantic Scholar ----------------
async function searchSemanticScholar(query: string): Promise<Paper[]> {
  const fields =
    "title,authors,year,abstract,externalIds,url,openAccessPdf,citationCount";
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${
      encodeURIComponent(query)
    }&limit=${LIMITS.semantic_scholar}&fields=${fields}`;
  const apiKey = Deno.env.get("S2_API_KEY");
  const res = await fetchWithRetry(
    url,
    apiKey ? { headers: { "x-api-key": apiKey } } : {},
    2,
    12_000,
  );
  const data = await res.json();
  const items = data?.data ?? [];
  return items.map((it: any): Paper => ({
    run_id: "",
    source: "semantic_scholar",
    source_id: it.paperId ?? null,
    title: it.title ?? "",
    authors: (it.authors ?? []).map((a: any) => a.name),
    year: it.year ?? null,
    doi: it.externalIds?.DOI ?? null,
    abstract: it.abstract ?? null,
    url: it.url ?? null,
    citation_count: it.citationCount ?? 0,
    open_access_pdf: it.openAccessPdf?.url ?? null,
  })).filter((p: Paper) => p.title);
}

// ---------------- PubMed (E-utilities) ----------------
async function searchPubmed(query: string): Promise<Paper[]> {
  const apiKey = Deno.env.get("PUBMED_API_KEY");
  const keyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
  const esearch =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${
      encodeURIComponent(query)
    }&retmax=${LIMITS.pubmed}&retmode=json&sort=relevance${keyParam}`;
  const s = await fetchWithRetry(esearch, {}, 2, 12_000);
  const sj = await s.json();
  const ids: string[] = sj?.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const efetch =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${
      ids.join(",")
    }&rettype=abstract&retmode=xml${keyParam}`;
  const f = await fetchWithRetry(efetch, {}, 2, 15_000);
  const xml = await f.text();
  const articles = xml.split("<PubmedArticle>").slice(1);
  const out: Paper[] = [];
  for (const a of articles) {
    const grab = (re: RegExp) => {
      const m = a.match(re);
      return m ? m[1].trim() : "";
    };
    const pmid = grab(/<PMID[^>]*>([^<]+)<\/PMID>/);
    const title = stripHtml(grab(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/));
    const abstract = stripHtml(
      [...a.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
        .map((m) => m[1])
        .join(" "),
    );
    const year = Number(grab(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)) || null;
    const doi =
      grab(/<ELocationID[^>]*EIdType="doi"[^>]*>([^<]+)<\/ELocationID>/) ||
      grab(/<ArticleId[^>]*IdType="doi"[^>]*>([^<]+)<\/ArticleId>/) || null;
    const authors = [...a.matchAll(/<Author[\s\S]*?<LastName>([^<]+)<\/LastName>\s*<ForeName>([^<]*)<\/ForeName>/g)]
      .map((m) => `${m[2]} ${m[1]}`.trim());
    if (!title) continue;
    out.push({
      run_id: "",
      source: "pubmed",
      source_id: pmid || null,
      title,
      authors,
      year,
      doi,
      abstract: abstract || null,
      url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null,
      citation_count: 0,
      open_access_pdf: null,
    });
  }
  return out;
}

// ---------------- OpenAlex ----------------
async function searchOpenAlex(query: string): Promise<Paper[]> {
  const apiKey = Deno.env.get("OPENALEX_API_KEY");
  const keyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
  const url =
    `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${
      LIMITS.openalex
    }${keyParam}`;
  const res = await fetchWithRetry(url, {}, 2, 12_000);
  const data = await res.json();
  const items = data?.results ?? [];
  return items.map((it: any): Paper => ({
    run_id: "",
    source: "openalex",
    source_id: it.id?.replace("https://openalex.org/", "") ?? null,
    title: it.display_name ?? "",
    authors: (it.authorships ?? []).map((a: any) => a.author?.display_name).filter(Boolean),
    year: it.publication_year ?? null,
    doi: it.doi?.replace("https://doi.org/", "") ?? null,
    abstract: abstractFromInvertedIndex(it.abstract_inverted_index) || null,
    url: it.doi ?? null,
    citation_count: it.cited_by_count ?? 0,
    open_access_pdf: it.primary_location?.pdf_url ?? it.open_access?.oa_url ?? null,
  })).filter((p: Paper) => p.title);
}

// ---------------- Crossref ----------------
async function searchCrossref(query: string): Promise<Paper[]> {
  const url =
    `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=${
      LIMITS.crossref
    }&select=DOI,title,abstract,author,published,is-referenced-by-count,URL,link&mailto=hello@nova.research`;
  const res = await fetchWithRetry(url, {}, 2, 12_000);
  const data = await res.json();
  const items = data?.message?.items ?? [];
  return items.map((it: any): Paper => {
    const authors = (it.author ?? []).map(
      (a: any) => `${a.given ?? ""} ${a.family ?? ""}`.trim(),
    );
    const year = firstDefined(
      it.published?.["date-parts"]?.[0]?.[0],
      it.published?.year,
    );
    const pdf = (it.link ?? []).find((l: any) =>
      l?.["content-type"] === "application/pdf"
    );
    return {
      run_id: "",
      source: "crossref",
      source_id: it.DOI ?? null,
      title: it.title?.[0] ?? "",
      authors,
      year: Number(year) || null,
      doi: it.DOI ?? null,
      abstract: it.abstract ? stripHtml(it.abstract) : null,
      url: it.URL ?? (it.DOI ? `https://doi.org/${it.DOI}` : null),
      citation_count: it["is-referenced-by-count"] ?? 0,
      open_access_pdf: pdf?.URL ?? null,
    };
  }).filter((p: Paper) => p.title);
}
