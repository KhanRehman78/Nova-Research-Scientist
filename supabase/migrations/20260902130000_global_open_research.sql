-- Global open-research enrichment for NOVA.
-- Adds auditable open-access metadata/full text, journal rule profiles,
-- manuscript citations/comments, live grant records and richer analytics.

alter table public.papers
  add column if not exists openalex_id text,
  add column if not exists oa_status text not null default 'unknown'
    check (oa_status in ('unknown', 'closed', 'bronze', 'green', 'gold', 'hybrid', 'diamond')),
  add column if not exists full_text_status text not null default 'unknown'
    check (full_text_status in ('unknown', 'available', 'metadata_only', 'unavailable', 'restricted', 'failed')),
  add column if not exists full_text_url text,
  add column if not exists full_text_source text,
  add column if not exists full_text_license text,
  add column if not exists full_text_checked_at timestamptz,
  add column if not exists enriched_metadata jsonb not null default '{}'::jsonb;

alter table public.literature_matrix
  add column if not exists evidence_scope text not null default 'abstract'
    check (evidence_scope in ('title', 'abstract', 'full_text')),
  add column if not exists evidence_excerpt text not null default '',
  add column if not exists source_url text;

create table if not exists public.paper_fulltexts (
  id uuid primary key default extensions.gen_random_uuid(),
  paper_id uuid not null unique references public.papers(id) on delete cascade,
  run_id uuid not null references public.research_runs(id) on delete cascade,
  source text not null,
  source_url text not null,
  license text,
  content text not null default '',
  content_sha256 text not null default '',
  word_count integer not null default 0 check (word_count >= 0),
  retrieval_status text not null default 'available'
    check (retrieval_status in ('available', 'metadata_only', 'unavailable', 'restricted', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  retrieved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null unique references public.manuscripts(id) on delete cascade,
  journal_name text not null,
  guidelines_document_id uuid references public.manuscript_documents(id) on delete set null,
  content_sha256 text not null,
  rules jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'extracted'
    check (status in ('extracted', 'requires_review', 'confirmed')),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manuscript_citations (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  paper_id uuid references public.papers(id) on delete set null,
  citation_key text not null,
  csl_json jsonb not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (manuscript_id, citation_key)
);

create table if not exists public.manuscript_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  content_sha256 text not null,
  selected_text text not null default '',
  start_offset integer check (start_offset is null or start_offset >= 0),
  end_offset integer check (end_offset is null or end_offset >= 0),
  body text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.grant_opportunities (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source text not null,
  source_id text not null,
  title text not null,
  funder text not null default '',
  region text not null default '',
  status text not null default '',
  open_date text,
  close_date text,
  amount_floor numeric,
  amount_ceiling numeric,
  currency text,
  url text not null,
  eligibility jsonb not null default '[]'::jsonb,
  disciplines jsonb not null default '[]'::jsonb,
  description text not null default '',
  source_payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (project_id, source, source_id)
);

create index if not exists paper_fulltexts_run_idx on public.paper_fulltexts(run_id, retrieved_at desc);
create index if not exists journal_profiles_manuscript_idx on public.journal_profiles(manuscript_id);
create index if not exists manuscript_citations_manuscript_idx on public.manuscript_citations(manuscript_id, created_at);
create index if not exists manuscript_comments_manuscript_idx on public.manuscript_comments(manuscript_id, status, created_at desc);
create index if not exists grant_opportunities_project_idx on public.grant_opportunities(project_id, fetched_at desc);

drop trigger if exists paper_fulltexts_set_updated_at on public.paper_fulltexts;
create trigger paper_fulltexts_set_updated_at before update on public.paper_fulltexts
for each row execute function public.set_updated_at();
drop trigger if exists journal_profiles_set_updated_at on public.journal_profiles;
create trigger journal_profiles_set_updated_at before update on public.journal_profiles
for each row execute function public.set_updated_at();

alter table public.paper_fulltexts enable row level security;
alter table public.journal_profiles enable row level security;
alter table public.manuscript_citations enable row level security;
alter table public.manuscript_comments enable row level security;
alter table public.grant_opportunities enable row level security;

create policy "paper_fulltexts_read_run" on public.paper_fulltexts
for select to authenticated using (public.can_access_run(run_id));
create policy "journal_profiles_read_manuscript" on public.journal_profiles
for select to authenticated using (public.can_access_manuscript(manuscript_id));
create policy "citations_read_manuscript" on public.manuscript_citations
for select to authenticated using (public.can_access_manuscript(manuscript_id));
create policy "citations_insert_member" on public.manuscript_citations
for insert to authenticated with check (public.can_access_manuscript(manuscript_id) and created_by = auth.uid());
create policy "citations_delete_member" on public.manuscript_citations
for delete to authenticated using (public.can_access_manuscript(manuscript_id));
create policy "comments_read_manuscript" on public.manuscript_comments
for select to authenticated using (public.can_access_manuscript(manuscript_id));
create policy "comments_insert_member" on public.manuscript_comments
for insert to authenticated with check (public.can_access_manuscript(manuscript_id) and created_by = auth.uid());
create policy "comments_update_member" on public.manuscript_comments
for update to authenticated using (public.can_access_manuscript(manuscript_id))
with check (public.can_access_manuscript(manuscript_id));
create policy "comments_delete_author" on public.manuscript_comments
for delete to authenticated using (created_by = auth.uid());
create policy "grants_read_project" on public.grant_opportunities
for select to authenticated using (public.can_access_project(project_id));

revoke insert, update, delete on public.paper_fulltexts from authenticated;
revoke insert, update, delete on public.journal_profiles from authenticated;
revoke insert, update, delete on public.grant_opportunities from authenticated;
grant select on public.paper_fulltexts, public.journal_profiles, public.grant_opportunities to authenticated;
grant select, insert, delete on public.manuscript_citations to authenticated;
grant select, insert, update, delete on public.manuscript_comments to authenticated;

alter table public.role_agent_outputs drop constraint if exists role_agent_outputs_action_check;
alter table public.role_agent_outputs add constraint role_agent_outputs_action_check
  check (action in (
    'topic_finder', 'paper_simplifier', 'research_roadmap', 'thesis_coach',
    'professor_discovery', 'literature_intelligence', 'peer_review',
    'grant_proposal', 'global_grant_search', 'collaborator_finder', 'supervision_feedback'
  ));

create or replace function public.get_lab_analytics(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.can_access_project(p_project_id) then
    raise exception 'Project not found or forbidden';
  end if;
  select jsonb_build_object(
    'members', (select count(*) from (select p.owner_id from public.projects p where p.id = p_project_id union select pm.profile_id from public.project_members pm where pm.project_id = p_project_id) people),
    'active_runs', (select count(*) from public.research_runs r where r.project_id = p_project_id and r.status in ('pending','planning','running')),
    'completed_runs', (select count(*) from public.research_runs r where r.project_id = p_project_id and r.status = 'completed'),
    'papers', (select count(*) from public.papers p join public.research_runs r on r.id = p.run_id where r.project_id = p_project_id),
    'open_access_papers', (select count(*) from public.papers p join public.research_runs r on r.id = p.run_id where r.project_id = p_project_id and p.oa_status <> 'closed' and p.oa_status <> 'unknown'),
    'full_text_papers', (select count(*) from public.paper_fulltexts f join public.research_runs r on r.id = f.run_id where r.project_id = p_project_id and f.retrieval_status = 'available'),
    'reports', (select count(*) from public.reports rp join public.research_runs r on r.id = rp.run_id where r.project_id = p_project_id),
    'manuscripts', (select count(*) from public.manuscripts m where m.project_id = p_project_id),
    'submission_ready', (select count(*) from public.manuscripts m where m.project_id = p_project_id and m.status = 'submission_ready'),
    'similarity_review_required', (select count(*) from public.similarity_reports sr join public.manuscripts m on m.id = sr.manuscript_id where m.project_id = p_project_id and sr.status = 'review_required'),
    'grant_opportunities', (select count(*) from public.grant_opportunities g where g.project_id = p_project_id),
    'supervised_students', (select count(distinct a.student_id) from public.supervision_assignments a where a.project_id = p_project_id),
    'average_student_progress', coalesce((select round(avg(a.progress), 1) from public.supervision_assignments a where a.project_id = p_project_id), 0),
    'open_risks', (select count(*) from public.supervision_assignments a where a.project_id = p_project_id and length(btrim(a.risk_summary)) > 0 and a.status <> 'completed'),
    'generated_at', now()
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_lab_analytics(uuid) from public;
grant execute on function public.get_lab_analytics(uuid) to authenticated;
