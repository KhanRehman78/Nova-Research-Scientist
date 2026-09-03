-- Third-party web similarity scans remain separate from NOVA's deterministic
-- research-corpus score because the providers use different comparison sets.

create table if not exists public.external_similarity_scans (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  provider text not null check (provider in ('plagaware')),
  content_sha256 text not null,
  provider_report_id text not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'completed', 'error')),
  overall_similarity numeric(5,2) check (overall_similarity is null or overall_similarity between 0 and 100),
  total_words integer check (total_words is null or total_words >= 0),
  matched_words integer check (matched_words is null or matched_words >= 0),
  credits_used numeric check (credits_used is null or credits_used >= 0),
  sources jsonb not null default '[]'::jsonb,
  report_html_url text,
  report_pdf_url text,
  provider_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  disclaimer text not null default 'External similarity indicates text overlap in the provider corpus. It is not proof of plagiarism, authorship, misconduct, or publication acceptance.',
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (manuscript_id, provider, content_sha256)
);

create index if not exists external_similarity_scans_manuscript_idx
  on public.external_similarity_scans(manuscript_id, requested_at desc);
create index if not exists external_similarity_scans_provider_report_idx
  on public.external_similarity_scans(provider, provider_report_id);

drop trigger if exists external_similarity_scans_set_updated_at on public.external_similarity_scans;
create trigger external_similarity_scans_set_updated_at before update on public.external_similarity_scans
for each row execute function public.set_updated_at();

alter table public.external_similarity_scans enable row level security;

create policy "external_similarity_scans_read_manuscript"
on public.external_similarity_scans for select to authenticated
using (public.can_access_manuscript(manuscript_id));

revoke insert, update, delete on public.external_similarity_scans from authenticated;
grant select on public.external_similarity_scans to authenticated;

