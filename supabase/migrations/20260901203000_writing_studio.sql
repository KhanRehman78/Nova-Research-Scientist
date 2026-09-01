-- NOVA Writing & Validation Studio
-- Private manuscripts, immutable provenance, evidence checks and server-enforced
-- submission-readiness gates.

create table if not exists public.manuscripts (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  research_run_id uuid references public.research_runs(id) on delete set null,
  title text not null default 'Untitled manuscript',
  target_journal text not null default '',
  article_type text not null default 'research_article',
  citation_style text not null default 'apa7',
  writing_mode text not null default 'human_authored'
    check (writing_mode in ('human_authored', 'ai_assisted')),
  status text not null default 'draft'
    check (status in ('draft', 'validating', 'needs_revision', 'submission_ready')),
  content text not null default '',
  abstract text not null default '',
  keywords text[] not null default '{}',
  journal_requirements jsonb not null default '{}'::jsonb,
  ai_disclosure text not null default '',
  readiness jsonb not null default '{}'::jsonb,
  validation_completed_at timestamptz,
  last_validated_sha256 text,
  last_edit_source text not null default 'human'
    check (last_edit_source in ('human', 'imported', 'ai_generated', 'ai_assisted')),
  last_change_summary text not null default 'Manuscript created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manuscript_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content text not null,
  source text not null check (source in ('human', 'imported', 'ai_generated', 'ai_assisted')),
  change_summary text not null default '',
  content_sha256 text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (manuscript_id, version_number)
);

create table if not exists public.manuscript_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  storage_path text not null unique,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes between 0 and 26214400),
  kind text not null default 'manuscript'
    check (kind in ('manuscript', 'source', 'supplement', 'guidelines', 'data')),
  extracted_text text not null default '',
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'complete', 'partial', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.writing_suggestions (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  category text not null
    check (category in ('grammar', 'clarity', 'academic_tone', 'structure', 'citation', 'integrity')),
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'blocking')),
  original_excerpt text not null default '',
  suggested_text text not null default '',
  explanation text not null,
  status text not null default 'open'
    check (status in ('open', 'accepted', 'dismissed')),
  generated_by text not null default 'ai' check (generated_by in ('ai', 'rule')),
  content_sha256 text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.validation_findings (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  category text not null
    check (category in ('citation_integrity', 'evidence_support', 'methodology', 'statistics', 'journal_compliance', 'ethics', 'language', 'originality', 'provenance')),
  severity text not null
    check (severity in ('pass', 'info', 'warning', 'blocking', 'human_review')),
  title text not null,
  description text not null,
  recommendation text not null default '',
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'accepted_risk')),
  content_sha256 text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.author_signoffs (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'author',
  approved boolean not null default false,
  statement text not null,
  content_sha256 text not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manuscript_id, profile_id)
);

create index if not exists manuscripts_project_idx
  on public.manuscripts(project_id, updated_at desc);
create index if not exists manuscripts_run_idx
  on public.manuscripts(research_run_id) where research_run_id is not null;
create index if not exists manuscript_versions_manuscript_idx
  on public.manuscript_versions(manuscript_id, version_number desc);
create index if not exists manuscript_documents_manuscript_idx
  on public.manuscript_documents(manuscript_id, created_at desc);
create index if not exists writing_suggestions_open_idx
  on public.writing_suggestions(manuscript_id, status, created_at desc);
create index if not exists validation_findings_open_idx
  on public.validation_findings(manuscript_id, status, severity);

drop trigger if exists manuscripts_set_updated_at on public.manuscripts;
create trigger manuscripts_set_updated_at before update on public.manuscripts
for each row execute function public.set_updated_at();
drop trigger if exists author_signoffs_set_updated_at on public.author_signoffs;
create trigger author_signoffs_set_updated_at before update on public.author_signoffs
for each row execute function public.set_updated_at();

create or replace function public.can_access_manuscript(p_manuscript_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.manuscripts m
    where m.id = p_manuscript_id
      and public.can_access_project(m.project_id)
  );
$$;

revoke all on function public.can_access_manuscript(uuid) from public;
grant execute on function public.can_access_manuscript(uuid) to authenticated, service_role;

-- Every substantive content change is preserved as an immutable version. A
-- separate BEFORE trigger invalidates stale checks, then an AFTER trigger
-- records the committed content once its parent row exists.
create or replace function public.invalidate_manuscript_validation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.content is distinct from old.content then
    new.status := 'draft';
    new.readiness := '{}'::jsonb;
    new.validation_completed_at := null;
    new.last_validated_sha256 := null;
  end if;
  return new;
end;
$$;

create or replace function public.capture_manuscript_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.id::text));
  select coalesce(max(v.version_number), 0) + 1
    into next_version
    from public.manuscript_versions v
   where v.manuscript_id = new.id;

  insert into public.manuscript_versions (
    manuscript_id, version_number, content, source, change_summary,
    content_sha256, created_by
  ) values (
    new.id,
    next_version,
    new.content,
    new.last_edit_source,
    new.last_change_summary,
    encode(extensions.digest(new.content, 'sha256'), 'hex'),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists manuscripts_capture_initial_version on public.manuscripts;
create trigger manuscripts_capture_initial_version
after insert on public.manuscripts
for each row execute function public.capture_manuscript_version();
drop trigger if exists manuscripts_invalidate_validation on public.manuscripts;
create trigger manuscripts_invalidate_validation
before update of content on public.manuscripts
for each row execute function public.invalidate_manuscript_validation();
drop trigger if exists manuscripts_capture_content_version on public.manuscripts;
create trigger manuscripts_capture_content_version
after update of content on public.manuscripts
for each row execute function public.capture_manuscript_version();

-- Final readiness is evaluated on the server so a client cannot simply change
-- the status badge. Warnings may be accepted, but blocking and required human
-- review findings must be resolved first.
create or replace function public.finalize_manuscript(p_manuscript_id uuid)
returns public.manuscripts
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.manuscripts;
  current_hash text;
begin
  if not public.can_access_manuscript(p_manuscript_id) then
    raise exception 'Manuscript not found or forbidden';
  end if;

  select * into item from public.manuscripts where id = p_manuscript_id for update;
  current_hash := encode(extensions.digest(item.content, 'sha256'), 'hex');

  if length(btrim(item.content)) < 500 then
    raise exception 'Manuscript is too short for submission readiness';
  end if;
  if item.validation_completed_at is null or item.last_validated_sha256 is distinct from current_hash then
    raise exception 'Validate the current manuscript before finalizing';
  end if;
  if exists (
    select 1 from public.validation_findings f
    where f.manuscript_id = item.id
      and f.content_sha256 = current_hash
      and f.status = 'open'
      and f.severity in ('blocking', 'human_review')
  ) then
    raise exception 'Resolve all blocking and human-review findings first';
  end if;
  if not exists (
    select 1 from public.author_signoffs s
    where s.manuscript_id = item.id
      and s.profile_id = auth.uid()
      and s.approved
      and s.content_sha256 = current_hash
  ) then
    raise exception 'Author attestation for the current manuscript is required';
  end if;

  update public.manuscripts
     set status = 'submission_ready',
         readiness = coalesce(readiness, '{}'::jsonb) || jsonb_build_object(
           'finalized_at', now(),
           'finalized_by', auth.uid(),
           'content_sha256', current_hash
         )
   where id = item.id
   returning * into item;
  return item;
end;
$$;

revoke all on function public.finalize_manuscript(uuid) from public;
grant execute on function public.finalize_manuscript(uuid) to authenticated, service_role;

alter table public.manuscripts enable row level security;
alter table public.manuscript_versions enable row level security;
alter table public.manuscript_documents enable row level security;
alter table public.writing_suggestions enable row level security;
alter table public.validation_findings enable row level security;
alter table public.author_signoffs enable row level security;

create policy "manuscripts_read_project" on public.manuscripts
for select to authenticated using (public.can_access_project(project_id));
create policy "manuscripts_insert_project" on public.manuscripts
for insert to authenticated with check (
  public.can_access_project(project_id) and owner_id = auth.uid()
  and (research_run_id is null or public.can_access_run(research_run_id))
);
create policy "manuscripts_update_project" on public.manuscripts
for update to authenticated using (public.can_access_project(project_id))
with check (
  public.can_access_project(project_id)
  and (research_run_id is null or public.can_access_run(research_run_id))
);
create policy "manuscripts_delete_owner" on public.manuscripts
for delete to authenticated using (owner_id = auth.uid() or public.owns_project(project_id));

create policy "versions_read_manuscript" on public.manuscript_versions
for select to authenticated using (public.can_access_manuscript(manuscript_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'manuscript_documents', 'writing_suggestions',
    'validation_findings'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_access_manuscript(manuscript_id))',
      table_name || '_read_manuscript', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_access_manuscript(manuscript_id))',
      table_name || '_insert_manuscript', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_access_manuscript(manuscript_id)) with check (public.can_access_manuscript(manuscript_id))',
      table_name || '_update_manuscript', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_access_manuscript(manuscript_id))',
      table_name || '_delete_manuscript', table_name
    );
  end loop;
end $$;

create policy "signoffs_read_manuscript" on public.author_signoffs
for select to authenticated using (public.can_access_manuscript(manuscript_id));
create policy "signoffs_insert_self" on public.author_signoffs
for insert to authenticated with check (
  public.can_access_manuscript(manuscript_id) and profile_id = auth.uid()
);
create policy "signoffs_update_self" on public.author_signoffs
for update to authenticated using (
  public.can_access_manuscript(manuscript_id) and profile_id = auth.uid()
) with check (
  public.can_access_manuscript(manuscript_id) and profile_id = auth.uid()
);
create policy "signoffs_delete_self" on public.author_signoffs
for delete to authenticated using (
  public.can_access_manuscript(manuscript_id) and profile_id = auth.uid()
);

grant select, insert, update, delete on public.manuscripts to authenticated, service_role;
grant select on public.manuscript_versions to authenticated, service_role;
grant select, insert, update, delete on public.manuscript_documents to authenticated, service_role;
grant select, insert, update, delete on public.writing_suggestions to authenticated, service_role;
grant select, insert, update, delete on public.validation_findings to authenticated, service_role;
grant select, insert, update, delete on public.author_signoffs to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manuscripts',
  'manuscripts',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "manuscript_files_read" on storage.objects
for select to authenticated using (
  bucket_id = 'manuscripts'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and public.can_access_manuscript(((storage.foldername(name))[1])::uuid)
);
create policy "manuscript_files_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'manuscripts'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and public.can_access_manuscript(((storage.foldername(name))[1])::uuid)
);
create policy "manuscript_files_update" on storage.objects
for update to authenticated using (
  bucket_id = 'manuscripts'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and public.can_access_manuscript(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id = 'manuscripts'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and public.can_access_manuscript(((storage.foldername(name))[1])::uuid)
);
create policy "manuscript_files_delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'manuscripts'
  and name ~ '^[0-9a-fA-F-]{36}/'
  and public.can_access_manuscript(((storage.foldername(name))[1])::uuid)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'manuscripts', 'manuscript_documents', 'writing_suggestions',
    'validation_findings', 'author_signoffs'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
