-- Auditable source-overlap screening. The score is deliberately named
-- similarity, not plagiarism: plagiarism requires contextual human judgment
-- and a licensed comparison corpus for comprehensive coverage.

alter table public.manuscripts
  add column if not exists similarity_score numeric(5,2),
  add column if not exists similarity_screened_at timestamptz;

create table if not exists public.similarity_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null unique references public.manuscripts(id) on delete cascade,
  content_sha256 text not null,
  overall_similarity numeric(5,2) not null check (overall_similarity between 0 and 100),
  matched_word_count integer not null default 0 check (matched_word_count >= 0),
  total_word_count integer not null check (total_word_count > 0),
  match_count integer not null default 0 check (match_count >= 0),
  section_scores jsonb not null default '[]'::jsonb,
  corpus_scope jsonb not null default '{}'::jsonb,
  methodology jsonb not null default '{}'::jsonb,
  disclaimer text not null,
  status text not null default 'limited_corpus'
    check (status in ('limited_corpus', 'review_required', 'screened')),
  created_at timestamptz not null default now()
);

create table if not exists public.similarity_matches (
  id uuid primary key default extensions.gen_random_uuid(),
  report_id uuid not null references public.similarity_reports(id) on delete cascade,
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  section text not null default 'Unsectioned',
  manuscript_excerpt text not null,
  source_type text not null check (source_type in ('linked_paper', 'uploaded_source')),
  source_title text not null,
  source_reference text,
  source_excerpt text not null,
  similarity numeric(5,2) not null check (similarity between 0 and 100),
  matched_word_count integer not null check (matched_word_count > 0),
  classification text not null check (classification in (
    'quoted_or_cited', 'near_verbatim', 'substantial_overlap', 'phrase_overlap'
  )),
  requires_human_review boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists similarity_reports_manuscript_idx
  on public.similarity_reports(manuscript_id, created_at desc);
create index if not exists similarity_matches_report_idx
  on public.similarity_matches(report_id, similarity desc);
create index if not exists similarity_matches_manuscript_idx
  on public.similarity_matches(manuscript_id, created_at desc);

alter table public.similarity_reports enable row level security;
alter table public.similarity_matches enable row level security;

create policy "similarity_reports_read_manuscript" on public.similarity_reports
for select to authenticated using (public.can_access_manuscript(manuscript_id));
create policy "similarity_matches_read_manuscript" on public.similarity_matches
for select to authenticated using (public.can_access_manuscript(manuscript_id));

revoke insert, update, delete on public.similarity_reports from authenticated;
revoke insert, update, delete on public.similarity_matches from authenticated;
grant select on public.similarity_reports, public.similarity_matches to authenticated;

-- Preserve the hardened manuscript write surface: similarity fields are
-- server-owned and intentionally absent from authenticated column grants.

