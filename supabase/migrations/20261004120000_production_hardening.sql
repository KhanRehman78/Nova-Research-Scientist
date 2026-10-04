-- Production authorization, audit-integrity and abuse-control hardening.

-- Public onboarding may create only non-privileged roles. Professor and Lab
-- Admin roles must be assigned through a trusted administrative process.
alter table public.profiles
  add column if not exists privileged_role_verified boolean not null default false,
  add column if not exists role_verified_at timestamptz;

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
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 160),
    case
      when new.raw_user_meta_data ->> 'role' in ('student', 'research_assistant')
        then new.raw_user_meta_data ->> 'role'
      else 'student'
    end
  )
  on conflict (id) do update set full_name = excluded.full_name;
  return new;
end;
$$;

create or replace function public.has_professor_privileges()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('professor', 'lab_admin')
      and p.privileged_role_verified
  );
$$;

revoke all on function public.has_professor_privileges() from public;
grant execute on function public.has_professor_privileges() to authenticated, service_role;

create or replace function public.set_verified_professional_role(
  p_profile_id uuid,
  p_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.profiles;
begin
  if auth.role() <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if p_role not in ('student', 'research_assistant', 'professor', 'lab_admin') then
    raise exception 'Invalid professional role';
  end if;
  update public.profiles
     set role = p_role,
         privileged_role_verified = p_role in ('professor', 'lab_admin'),
         role_verified_at = case when p_role in ('professor', 'lab_admin') then now() else null end
   where id = p_profile_id
   returning * into saved;
  if saved.id is null then raise exception 'Profile not found'; end if;
  return saved;
end;
$$;

revoke all on function public.set_verified_professional_role(uuid, text) from public, anon, authenticated;
grant execute on function public.set_verified_professional_role(uuid, text) to service_role;

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id = auth.uid() or exists (
    select 1
    from public.projects project
    where public.can_access_project(project.id)
      and (
        project.owner_id = p_profile_id
        or exists (
          select 1 from public.project_members member
          where member.project_id = project.id and member.profile_id = p_profile_id
        )
      )
  );
$$;

revoke all on function public.can_view_profile(uuid) from public;
grant execute on function public.can_view_profile(uuid) to authenticated, service_role;

create or replace function public.is_project_student(p_project_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members member
    join public.profiles profile on profile.id = member.profile_id
    where member.project_id = p_project_id
      and member.profile_id = p_student_id
      and profile.role = 'student'
  );
$$;

revoke all on function public.is_project_student(uuid, uuid) from public;
grant execute on function public.is_project_student(uuid, uuid) to authenticated, service_role;

drop policy if exists "profiles_read_authenticated" on public.profiles;
create policy "profiles_read_collaborators" on public.profiles
for select to authenticated using (public.can_view_profile(id));

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
  current_role text;
  saved public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select role into current_role from public.profiles where id = auth.uid() for update;
  if current_role is null then
    raise exception 'Profile not found';
  end if;
  if current_role in ('professor', 'lab_admin') then
    if p_role <> current_role then
      raise exception 'Verified roles can be changed only by an administrator';
    end if;
  elsif p_role not in ('student', 'research_assistant') then
    raise exception 'Professor and Lab Admin roles require administrator verification';
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
  return saved;
end;
$$;

revoke all on function public.set_own_professional_profile(text, text, text, text, text[], text) from public;
grant execute on function public.set_own_professional_profile(text, text, text, text, text[], text) to authenticated;

create or replace function public.can_manage_supervision(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_professor_privileges() and exists (
    select 1
    from public.supervision_assignments assignment
    join public.projects project on project.id = assignment.project_id
    where assignment.id = p_assignment_id
      and (project.owner_id = auth.uid() or assignment.supervisor_id = auth.uid())
  );
$$;

drop policy if exists "supervision_insert_owner" on public.supervision_assignments;
create policy "supervision_insert_verified_professor" on public.supervision_assignments
for insert to authenticated with check (
  public.has_professor_privileges()
  and public.can_access_project(project_id)
  and supervisor_id = auth.uid()
  and public.is_project_student(project_id, student_id)
);

-- Audit authorship is immutable. Collaborators may resolve comments, but they
-- cannot rewrite the author, body, selection or content-version binding.
revoke update on public.manuscript_comments from authenticated;
grant update (status, resolved_at) on public.manuscript_comments to authenticated;

drop policy if exists "manuscript_documents_insert_manuscript" on public.manuscript_documents;
create policy "manuscript_documents_insert_self" on public.manuscript_documents
for insert to authenticated with check (
  public.can_access_manuscript(manuscript_id) and created_by = auth.uid()
);
drop policy if exists "manuscript_documents_update_manuscript" on public.manuscript_documents;
create policy "manuscript_documents_update_author" on public.manuscript_documents
for update to authenticated using (
  public.can_access_manuscript(manuscript_id) and created_by = auth.uid()
) with check (
  public.can_access_manuscript(manuscript_id) and created_by = auth.uid()
);

-- Suggestions are generated only by trusted Edge Functions. Browser clients
-- can accept or dismiss them without forging their content or provenance.
revoke insert, delete, update on public.writing_suggestions from authenticated;
grant update (status, resolved_at) on public.writing_suggestions to authenticated;
drop policy if exists "writing_suggestions_insert_manuscript" on public.writing_suggestions;
drop policy if exists "writing_suggestions_delete_manuscript" on public.writing_suggestions;

-- Professional AI history is server-generated. Authenticated clients may read
-- authorized project history but cannot forge or erase agent records.
revoke insert, delete on public.role_agent_outputs from authenticated;
drop policy if exists "role_outputs_insert_self" on public.role_agent_outputs;
drop policy if exists "role_outputs_delete_self" on public.role_agent_outputs;

-- Keep supervision identity and AI feedback immutable while allowing verified
-- supervisors to update the operational fields used by the UI.
revoke update on public.supervision_assignments from authenticated;
grant update (research_title, status, progress, risk_summary, next_milestone, due_at)
  on public.supervision_assignments to authenticated;
revoke insert on public.supervision_updates from authenticated;
grant insert (assignment_id, author_id, section, status, progress, note)
  on public.supervision_updates to authenticated;

-- A run cannot be reassigned to another user/project after creation.
revoke update on public.research_runs from authenticated;
grant update (status, current_stage, started_at, finished_at, updated_at) on public.research_runs to authenticated;

-- Atomic fixed-window limiter used by authenticated Edge Functions before
-- invoking paid or resource-intensive providers.
create table if not exists public.api_rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  observed_count integer;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if p_bucket !~ '^[a-z0-9:_-]{1,80}$' then raise exception 'Invalid rate-limit bucket'; end if;
  if p_limit < 1 or p_limit > 1000 then raise exception 'Invalid rate limit'; end if;
  if p_window_seconds < 10 or p_window_seconds > 86400 then raise exception 'Invalid rate-limit window'; end if;

  insert into public.api_rate_limits (user_id, bucket, window_started_at, request_count, updated_at)
  values (caller, p_bucket, now(), 1, now())
  on conflict (user_id, bucket) do update set
    request_count = case
      when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then 1
      else public.api_rate_limits.request_count + 1
    end,
    window_started_at = case
      when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then now()
      else public.api_rate_limits.window_started_at
    end,
    updated_at = now()
  returning request_count into observed_count;

  return observed_count <= p_limit;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated, service_role;

-- Prevent duplicate multi-tab pipeline execution while allowing a stale run to
-- be resumed after fifteen minutes.
create or replace function public.claim_research_run(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  if not public.can_access_run(p_run_id) then
    raise exception 'Run not found or forbidden';
  end if;
  update public.research_runs
     set status = 'running',
         current_stage = 'search',
         finished_at = null,
         updated_at = now()
   where id = p_run_id
     and (
       status in ('pending', 'planning', 'failed')
       or (status = 'running' and updated_at < now() - interval '15 minutes')
     )
   returning id into claimed_id;
  return claimed_id is not null;
end;
$$;

revoke all on function public.claim_research_run(uuid) from public;
grant execute on function public.claim_research_run(uuid) to authenticated, service_role;

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
  if not public.has_professor_privileges() then
    raise exception 'Professor or Lab Admin access required';
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
