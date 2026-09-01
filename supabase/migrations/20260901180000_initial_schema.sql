create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'student' check (role in ('professor', 'student', 'research_assistant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  description text not null default '',
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'student' check (role in ('professor', 'student', 'research_assistant')),
  invited_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);

create table if not exists public.research_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  query text not null check (length(btrim(query)) > 0),
  mode text not null default 'quick' check (mode in ('quick', 'deep', 'expert')),
  status text not null default 'pending' check (status in ('pending', 'planning', 'running', 'completed', 'failed', 'cancelled')),
  current_stage text check (current_stage is null or current_stage in ('plan', 'search', 'paper-reader', 'gap', 'hypothesis', 'experiment', 'report')),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.run_tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  stage text not null check (stage in ('plan', 'search', 'paper-reader', 'gap', 'hypothesis', 'experiment', 'report')),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, stage)
);

create table if not exists public.papers (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  source text not null,
  source_id text,
  title text not null,
  authors text[] not null default '{}',
  year integer check (year is null or year between 1000 and 2200),
  doi text,
  abstract text,
  url text,
  citation_count integer not null default 0 check (citation_count >= 0),
  open_access_pdf text,
  created_at timestamptz not null default now()
);

create table if not exists public.literature_matrix (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  method text,
  dataset text,
  result text,
  problem text,
  extracted_at timestamptz not null default now(),
  unique (run_id, paper_id)
);

create table if not exists public.gaps (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  title text not null,
  statement text not null,
  existing_coverage text,
  opportunity text,
  gap_map_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id)
);

create table if not exists public.hypotheses (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  title text not null,
  hypothesis text not null,
  objectives text[] not null default '{}',
  expected_contribution text,
  confidence double precision not null default 0 check (confidence between 0 and 1),
  novelty double precision not null default 0 check (novelty between 0 and 1),
  created_at timestamptz not null default now(),
  unique (run_id)
);

create table if not exists public.experiments (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  dataset text,
  architecture_json jsonb not null default '{}'::jsonb,
  algorithm text,
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id)
);

create table if not exists public.reports (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  title text not null,
  abstract text,
  sections_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'run_tasks_run_id_stage_key') then
    alter table public.run_tasks add constraint run_tasks_run_id_stage_key unique (run_id, stage);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'literature_matrix_run_id_paper_id_key') then
    alter table public.literature_matrix add constraint literature_matrix_run_id_paper_id_key unique (run_id, paper_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gaps_run_id_key') then
    alter table public.gaps add constraint gaps_run_id_key unique (run_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hypotheses_run_id_key') then
    alter table public.hypotheses add constraint hypotheses_run_id_key unique (run_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'experiments_run_id_key') then
    alter table public.experiments add constraint experiments_run_id_key unique (run_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reports_run_id_key') then
    alter table public.reports add constraint reports_run_id_key unique (run_id);
  end if;
end $$;

alter table public.research_runs drop constraint if exists research_runs_status_check;
alter table public.research_runs add constraint research_runs_status_check
  check (status in ('pending', 'planning', 'running', 'completed', 'failed', 'cancelled'));
alter table public.research_runs drop constraint if exists research_runs_current_stage_check;
alter table public.research_runs add constraint research_runs_current_stage_check
  check (current_stage is null or current_stage in ('plan', 'search', 'paper-reader', 'gap', 'hypothesis', 'experiment', 'report'));

create index if not exists projects_owner_idx on public.projects(owner_id);
create index if not exists project_members_profile_idx on public.project_members(profile_id);
create index if not exists research_runs_project_idx on public.research_runs(project_id, created_at desc);
create index if not exists research_runs_user_idx on public.research_runs(user_id, created_at desc);
create index if not exists run_tasks_run_idx on public.run_tasks(run_id, stage);
create index if not exists papers_run_idx on public.papers(run_id, citation_count desc);
create index if not exists papers_doi_idx on public.papers(run_id, doi) where doi is not null;
create index if not exists literature_matrix_run_idx on public.literature_matrix(run_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();
drop trigger if exists research_runs_set_updated_at on public.research_runs;
create trigger research_runs_set_updated_at before update on public.research_runs
for each row execute function public.set_updated_at();
drop trigger if exists run_tasks_set_updated_at on public.run_tasks;
create trigger run_tasks_set_updated_at before update on public.run_tasks
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when new.raw_user_meta_data ->> 'role' in ('professor', 'student', 'research_assistant')
        then new.raw_user_meta_data ->> 'role'
      else 'student'
    end
  )
  on conflict (id) do update set full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, full_name, role)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  case
    when u.raw_user_meta_data ->> 'role' in ('professor', 'student', 'research_assistant')
      then u.raw_user_meta_data ->> 'role'
    else 'student'
  end
from auth.users u
on conflict (id) do nothing;

create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = auth.uid()
  ) or exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.profile_id = auth.uid()
  );
$$;

create or replace function public.owns_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = auth.uid()
  );
$$;

create or replace function public.can_access_run(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.research_runs r
    where r.id = p_run_id and public.can_access_project(r.project_id)
  );
$$;

revoke all on function public.can_access_project(uuid) from public;
revoke all on function public.owns_project(uuid) from public;
revoke all on function public.can_access_run(uuid) from public;
grant execute on function public.can_access_project(uuid) to authenticated, service_role;
grant execute on function public.owns_project(uuid) to authenticated, service_role;
grant execute on function public.can_access_run(uuid) to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.research_runs enable row level security;
alter table public.run_tasks enable row level security;
alter table public.papers enable row level security;
alter table public.literature_matrix enable row level security;
alter table public.gaps enable row level security;
alter table public.hypotheses enable row level security;
alter table public.experiments enable row level security;
alter table public.reports enable row level security;

drop policy if exists "profiles_read_authenticated" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_read_authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "projects_read_members" on public.projects;
drop policy if exists "projects_select_member" on public.projects;
drop policy if exists "projects_update_member" on public.projects;
create policy "projects_read_members" on public.projects for select to authenticated using (public.can_access_project(id));
drop policy if exists "projects_insert_owner" on public.projects;
create policy "projects_insert_owner" on public.projects for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "projects_update_owner" on public.projects;
create policy "projects_update_owner" on public.projects for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner" on public.projects for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "members_read_project" on public.project_members;
drop policy if exists "members_select" on public.project_members;
drop policy if exists "members_insert" on public.project_members;
drop policy if exists "members_update" on public.project_members;
drop policy if exists "members_delete" on public.project_members;
create policy "members_read_project" on public.project_members for select to authenticated using (public.can_access_project(project_id));
drop policy if exists "members_insert_owner" on public.project_members;
create policy "members_insert_owner" on public.project_members for insert to authenticated with check (public.owns_project(project_id));
drop policy if exists "members_update_owner" on public.project_members;
create policy "members_update_owner" on public.project_members for update to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id));
drop policy if exists "members_delete_owner" on public.project_members;
create policy "members_delete_owner" on public.project_members for delete to authenticated using (public.owns_project(project_id));

drop policy if exists "runs_read_project" on public.research_runs;
drop policy if exists "runs_select" on public.research_runs;
drop policy if exists "runs_insert" on public.research_runs;
drop policy if exists "runs_update" on public.research_runs;
drop policy if exists "runs_delete" on public.research_runs;
create policy "runs_read_project" on public.research_runs for select to authenticated using (public.can_access_project(project_id));
drop policy if exists "runs_insert_project" on public.research_runs;
create policy "runs_insert_project" on public.research_runs for insert to authenticated with check (public.can_access_project(project_id) and user_id = auth.uid());
drop policy if exists "runs_update_project" on public.research_runs;
create policy "runs_update_project" on public.research_runs for update to authenticated using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
drop policy if exists "runs_delete_project" on public.research_runs;
create policy "runs_delete_project" on public.research_runs for delete to authenticated using (public.can_access_project(project_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['run_tasks','papers','literature_matrix','gaps','hypotheses','experiments','reports']
  loop
    execute format('drop policy if exists %I on public.%I', case when table_name = 'literature_matrix' then 'matrix_select' else table_name || '_select' end, table_name);
    execute format('drop policy if exists %I on public.%I', case when table_name = 'literature_matrix' then 'matrix_insert' else table_name || '_insert' end, table_name);
    execute format('drop policy if exists %I on public.%I', case when table_name = 'literature_matrix' then 'matrix_update' else table_name || '_update' end, table_name);
    execute format('drop policy if exists %I on public.%I', case when table_name = 'literature_matrix' then 'matrix_delete' else table_name || '_delete' end, table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_read_run', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_access_run(run_id))', table_name || '_read_run', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_run', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_access_run(run_id))', table_name || '_insert_run', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_run', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_access_run(run_id)) with check (public.can_access_run(run_id))', table_name || '_update_run', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_run', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_access_run(run_id))', table_name || '_delete_run', table_name);
  end loop;
end $$;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['research_runs','run_tasks','papers','literature_matrix','gaps','hypotheses','experiments','reports','project_members']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
