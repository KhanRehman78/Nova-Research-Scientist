-- NOVA professional university ecosystem: role-aware profiles, auditable
-- professional-agent outputs, supervision workflows, and lab analytics.

alter table public.profiles
  add column if not exists institution text not null default '',
  add column if not exists department text not null default '',
  add column if not exists research_interests text[] not null default '{}',
  add column if not exists expertise_level text not null default 'developing'
    check (expertise_level in ('developing', 'intermediate', 'advanced', 'expert')),
  add column if not exists onboarding_completed boolean not null default false;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('professor', 'student', 'research_assistant', 'lab_admin'));

alter table public.project_members drop constraint if exists project_members_role_check;
alter table public.project_members add constraint project_members_role_check
  check (role in ('professor', 'student', 'research_assistant', 'lab_admin'));

create table if not exists public.role_agent_outputs (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_run_id uuid references public.research_runs(id) on delete set null,
  action text not null check (action in (
    'topic_finder', 'paper_simplifier', 'research_roadmap', 'thesis_coach',
    'professor_discovery', 'literature_intelligence', 'peer_review',
    'grant_proposal', 'collaborator_finder', 'supervision_feedback'
  )),
  title text not null,
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  evidence_quality text not null default 'grounded'
    check (evidence_quality in ('verified', 'grounded', 'requires_verification')),
  model text,
  created_at timestamptz not null default now()
);

create table if not exists public.supervision_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  supervisor_id uuid not null references public.profiles(id) on delete cascade,
  research_title text not null,
  status text not null default 'active'
    check (status in ('proposed', 'active', 'on_hold', 'completed')),
  progress integer not null default 0 check (progress between 0 and 100),
  risk_summary text not null default '',
  next_milestone text not null default '',
  due_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, student_id, supervisor_id)
);

create table if not exists public.supervision_updates (
  id uuid primary key default extensions.gen_random_uuid(),
  assignment_id uuid not null references public.supervision_assignments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  section text not null check (section in (
    'topic', 'proposal', 'literature', 'methodology', 'data', 'analysis',
    'writing', 'submission'
  )),
  status text not null default 'in_progress'
    check (status in ('not_started', 'in_progress', 'needs_review', 'approved', 'blocked')),
  progress integer not null default 0 check (progress between 0 and 100),
  note text not null default '',
  ai_feedback jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists role_agent_outputs_project_idx
  on public.role_agent_outputs(project_id, created_at desc);
create index if not exists role_agent_outputs_user_idx
  on public.role_agent_outputs(user_id, created_at desc);
create index if not exists supervision_assignments_project_idx
  on public.supervision_assignments(project_id, updated_at desc);
create index if not exists supervision_assignments_student_idx
  on public.supervision_assignments(student_id, updated_at desc);
create index if not exists supervision_assignments_supervisor_idx
  on public.supervision_assignments(supervisor_id, updated_at desc);
create index if not exists supervision_updates_assignment_idx
  on public.supervision_updates(assignment_id, created_at desc);

drop trigger if exists supervision_assignments_set_updated_at on public.supervision_assignments;
create trigger supervision_assignments_set_updated_at
before update on public.supervision_assignments
for each row execute function public.set_updated_at();

create or replace function public.can_manage_supervision(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.supervision_assignments a
    join public.projects p on p.id = a.project_id
    where a.id = p_assignment_id
      and (p.owner_id = auth.uid() or a.supervisor_id = auth.uid())
  );
$$;

revoke all on function public.can_manage_supervision(uuid) from public;
grant execute on function public.can_manage_supervision(uuid) to authenticated, service_role;

create or replace function public.set_own_professional_profile(
  p_role text,
  p_full_name text,
  p_institution text,
  p_department text,
  p_research_interests text[],
  p_expertise_level text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_role not in ('student', 'professor', 'research_assistant') then
    raise exception 'Role is not self-selectable';
  end if;
  if p_expertise_level not in ('developing', 'intermediate', 'advanced', 'expert') then
    raise exception 'Invalid expertise level';
  end if;
  update public.profiles
     set role = p_role,
         full_name = left(btrim(coalesce(p_full_name, '')), 160),
         institution = left(btrim(coalesce(p_institution, '')), 240),
         department = left(btrim(coalesce(p_department, '')), 240),
         research_interests = coalesce(p_research_interests[1:12], '{}'),
         expertise_level = p_expertise_level,
         onboarding_completed = true
   where id = auth.uid()
   returning * into saved;
  if saved.id is null then
    raise exception 'Profile not found';
  end if;
  return saved;
end;
$$;

revoke all on function public.set_own_professional_profile(text, text, text, text, text[], text) from public;
grant execute on function public.set_own_professional_profile(text, text, text, text, text[], text) to authenticated;

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
    'members', (
      select count(*) from (
        select p.owner_id from public.projects p where p.id = p_project_id
        union
        select pm.profile_id from public.project_members pm where pm.project_id = p_project_id
      ) people
    ),
    'active_runs', (select count(*) from public.research_runs r where r.project_id = p_project_id and r.status in ('pending','planning','running')),
    'completed_runs', (select count(*) from public.research_runs r where r.project_id = p_project_id and r.status = 'completed'),
    'papers', (select count(*) from public.papers p join public.research_runs r on r.id = p.run_id where r.project_id = p_project_id),
    'reports', (select count(*) from public.reports rp join public.research_runs r on r.id = rp.run_id where r.project_id = p_project_id),
    'manuscripts', (select count(*) from public.manuscripts m where m.project_id = p_project_id),
    'submission_ready', (select count(*) from public.manuscripts m where m.project_id = p_project_id and m.status = 'submission_ready'),
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

alter table public.role_agent_outputs enable row level security;
alter table public.supervision_assignments enable row level security;
alter table public.supervision_updates enable row level security;

create policy "role_outputs_read_project" on public.role_agent_outputs
for select to authenticated using (public.can_access_project(project_id));
create policy "role_outputs_insert_self" on public.role_agent_outputs
for insert to authenticated with check (public.can_access_project(project_id) and user_id = auth.uid());
create policy "role_outputs_delete_self" on public.role_agent_outputs
for delete to authenticated using (user_id = auth.uid());

create policy "supervision_read_project" on public.supervision_assignments
for select to authenticated using (public.can_access_project(project_id));
create policy "supervision_insert_owner" on public.supervision_assignments
for insert to authenticated with check (public.owns_project(project_id));
create policy "supervision_update_manager" on public.supervision_assignments
for update to authenticated using (public.can_manage_supervision(id))
with check (public.can_manage_supervision(id));
create policy "supervision_delete_owner" on public.supervision_assignments
for delete to authenticated using (public.owns_project(project_id));

create policy "supervision_updates_read" on public.supervision_updates
for select to authenticated using (
  exists (
    select 1 from public.supervision_assignments a
    where a.id = assignment_id and public.can_access_project(a.project_id)
  )
);
create policy "supervision_updates_insert_member" on public.supervision_updates
for insert to authenticated with check (
  author_id = auth.uid() and exists (
    select 1 from public.supervision_assignments a
    where a.id = assignment_id and public.can_access_project(a.project_id)
  )
);
create policy "supervision_updates_delete_author" on public.supervision_updates
for delete to authenticated using (author_id = auth.uid() or public.can_manage_supervision(assignment_id));

-- Profile rows are created by the trusted auth trigger. Role changes go only
-- through the constrained RPC above; clients cannot self-assign lab_admin.
revoke insert, update on public.profiles from authenticated;
grant update (full_name, institution, department, research_interests, expertise_level, onboarding_completed)
  on public.profiles to authenticated;

grant select, insert, delete on public.role_agent_outputs to authenticated;
grant select, insert, update, delete on public.supervision_assignments to authenticated;
grant select, insert, delete on public.supervision_updates to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.supervision_assignments;
exception when duplicate_object then null;
end $$;

