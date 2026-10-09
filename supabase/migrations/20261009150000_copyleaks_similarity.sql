-- Production Copyleaks integration. Provider results remain version-bound
-- decision support and detailed ranges are readable only through manuscript RLS.

alter table public.external_similarity_scans
  drop constraint if exists external_similarity_scans_provider_check;
alter table public.external_similarity_scans
  add constraint external_similarity_scans_provider_check
  check (provider in ('plagaware', 'copyleaks'));

alter table public.external_similarity_scans
  drop constraint if exists external_similarity_scans_status_check;
alter table public.external_similarity_scans
  add constraint external_similarity_scans_status_check
  check (status in ('scheduled', 'active', 'exporting', 'completed', 'error'));

alter table public.external_similarity_scans
  add column if not exists identical_words integer check (identical_words is null or identical_words >= 0),
  add column if not exists minor_changed_words integer check (minor_changed_words is null or minor_changed_words >= 0),
  add column if not exists related_meaning_words integer check (related_meaning_words is null or related_meaning_words >= 0),
  add column if not exists sandbox boolean not null default false,
  add column if not exists purged_at timestamptz;

alter table public.external_similarity_scans
  drop constraint if exists external_similarity_scans_manuscript_id_provider_content_sha256_key;
alter table public.external_similarity_scans
  add constraint external_similarity_scans_version_provider_mode_key
  unique (manuscript_id, provider, content_sha256, sandbox);

create table if not exists public.external_similarity_matches (
  id uuid primary key default extensions.gen_random_uuid(),
  scan_id uuid not null references public.external_similarity_scans(id) on delete cascade,
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  provider_result_id text not null,
  source_rank integer not null default 0 check (source_rank >= 0),
  source_title text not null default '',
  source_url text,
  match_type text not null check (match_type in ('exact', 'minor_change', 'paraphrased')),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset),
  line_start integer not null check (line_start > 0),
  line_end integer not null check (line_end >= line_start),
  matched_text text not null default '',
  source_excerpt text not null default '',
  matched_words integer check (matched_words is null or matched_words >= 0),
  created_at timestamptz not null default now(),
  unique (scan_id, provider_result_id, match_type, start_offset, end_offset)
);

create index if not exists external_similarity_matches_scan_idx
  on public.external_similarity_matches(scan_id, start_offset);
create index if not exists external_similarity_matches_manuscript_idx
  on public.external_similarity_matches(manuscript_id, created_at desc);

alter table public.external_similarity_matches enable row level security;

drop policy if exists "external_similarity_matches_read_manuscript"
  on public.external_similarity_matches;
create policy "external_similarity_matches_read_manuscript"
on public.external_similarity_matches for select to authenticated
using (public.can_access_manuscript(manuscript_id));

revoke insert, update, delete on public.external_similarity_matches from authenticated;
grant select on public.external_similarity_matches to authenticated;
