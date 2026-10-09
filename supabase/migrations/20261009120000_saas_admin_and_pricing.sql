-- SaaS control plane: secure owner administration, professional-role requests,
-- public editable pricing, and aggregate platform reporting.

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.professional_role_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  requested_role text not null check (requested_role in ('professor', 'lab_admin')),
  institution text not null default '',
  evidence_note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_plans (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  audience text not null default '',
  description text not null default '',
  monthly_price_pkr integer check (monthly_price_pkr is null or monthly_price_pkr >= 0),
  yearly_price_pkr integer check (yearly_price_pkr is null or yearly_price_pkr >= 0),
  features text[] not null default '{}',
  cta_label text not null default 'Get started',
  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan_id text not null references public.pricing_plans(id) on update cascade,
  status text not null default 'selected'
    check (status in ('selected', 'trialing', 'active', 'past_due', 'cancelled')),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'yearly', 'manual')),
  starts_at timestamptz,
  ends_at timestamptz,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_usage_daily (
  usage_date date not null default current_date,
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null,
  request_count integer not null default 0 check (request_count >= 0),
  allowed_count integer not null default 0 check (allowed_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (usage_date, user_id, bucket)
);

drop trigger if exists professional_role_requests_set_updated_at on public.professional_role_requests;
create trigger professional_role_requests_set_updated_at before update on public.professional_role_requests
for each row execute function public.set_updated_at();

drop trigger if exists pricing_plans_set_updated_at on public.pricing_plans;
create trigger pricing_plans_set_updated_at before update on public.pricing_plans
for each row execute function public.set_updated_at();

drop trigger if exists account_subscriptions_set_updated_at on public.account_subscriptions;
create trigger account_subscriptions_set_updated_at before update on public.account_subscriptions
for each row execute function public.set_updated_at();

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins admin
    where admin.user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated, service_role;

alter table public.platform_admins enable row level security;
alter table public.professional_role_requests enable row level security;
alter table public.pricing_plans enable row level security;
alter table public.account_subscriptions enable row level security;
alter table public.api_usage_daily enable row level security;

create policy "platform_admins_read_self" on public.platform_admins
for select to authenticated using (user_id = auth.uid());

create policy "role_requests_read_self_or_admin" on public.professional_role_requests
for select to authenticated using (profile_id = auth.uid() or public.is_platform_admin());
create policy "role_requests_insert_self" on public.professional_role_requests
for insert to authenticated with check (profile_id = auth.uid());
create policy "role_requests_update_admin" on public.professional_role_requests
for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "pricing_plans_public_read" on public.pricing_plans
for select to anon, authenticated using (is_active or public.is_platform_admin());
create policy "pricing_plans_admin_insert" on public.pricing_plans
for insert to authenticated with check (public.is_platform_admin());
create policy "pricing_plans_admin_update" on public.pricing_plans
for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "pricing_plans_admin_delete" on public.pricing_plans
for delete to authenticated using (public.is_platform_admin());

create policy "subscriptions_read_self_or_admin" on public.account_subscriptions
for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
create policy "subscriptions_admin_insert" on public.account_subscriptions
for insert to authenticated with check (public.is_platform_admin());
create policy "subscriptions_admin_update" on public.account_subscriptions
for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "api_usage_read_admin" on public.api_usage_daily
for select to authenticated using (public.is_platform_admin());

drop policy if exists "profiles_read_platform_admin" on public.profiles;
create policy "profiles_read_platform_admin" on public.profiles
for select to authenticated using (public.is_platform_admin());

grant select on public.platform_admins to authenticated;
grant select, insert, update on public.professional_role_requests to authenticated;
grant select on public.pricing_plans to anon, authenticated;
grant insert, update, delete on public.pricing_plans to authenticated;
grant select, insert, update on public.account_subscriptions to authenticated;
grant select on public.api_usage_daily to authenticated;
grant select, insert, update, delete on public.platform_admins, public.professional_role_requests, public.pricing_plans, public.account_subscriptions, public.api_usage_daily to service_role;

insert into public.pricing_plans
  (id, name, audience, description, monthly_price_pkr, yearly_price_pkr, features, cta_label, is_featured, sort_order)
values
  ('starter', 'Starter', 'Students exploring research', 'Start a structured research workflow and test NOVA on individual projects.', 0, 0,
    array['Quick research workflow', 'Saved research projects', 'Literature and gap workspace', 'Basic report generation'], 'Start free', false, 10),
  ('researcher-pro', 'Researcher Pro', 'Postgraduate researchers and assistants', 'Deeper evidence workflows, professional agents and writing support for active researchers.', 2999, 29990,
    array['Deep and Expert research modes', 'Writing Studio and readiness checks', 'Professional research agents', 'Priority project capacity'], 'Choose Researcher Pro', true, 20),
  ('lab', 'Lab & Supervisor', 'Professors and research laboratories', 'Supervision, collaboration and lab intelligence for research teams.', 9999, 99990,
    array['Professor and lab workflows', 'Student supervision records', 'Team collaboration and analytics', 'Grant and peer-review tools'], 'Start lab workspace', false, 30),
  ('institution', 'Institution', 'Universities and research organizations', 'Custom onboarding, governance and capacity for institution-wide deployment.', null, null,
    array['Custom user and project capacity', 'Institutional onboarding', 'Governance and deployment planning', 'Priority support'], 'Contact for pricing', false, 40)
on conflict (id) do nothing;

-- Preserve the current limiter state as the first daily usage snapshot, then
-- keep a historical per-user/per-endpoint record on every future API call.
insert into public.api_usage_daily (usage_date, user_id, bucket, request_count, allowed_count, blocked_count)
select current_date, user_id, bucket, request_count, request_count, 0
from public.api_rate_limits
on conflict (usage_date, user_id, bucket) do nothing;

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
  allowed boolean;
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

  allowed := observed_count <= p_limit;
  insert into public.api_usage_daily
    (usage_date, user_id, bucket, request_count, allowed_count, blocked_count, updated_at)
  values (current_date, caller, p_bucket, 1, case when allowed then 1 else 0 end, case when allowed then 0 else 1 end, now())
  on conflict (usage_date, user_id, bucket) do update set
    request_count = public.api_usage_daily.request_count + 1,
    allowed_count = public.api_usage_daily.allowed_count + case when allowed then 1 else 0 end,
    blocked_count = public.api_usage_daily.blocked_count + case when allowed then 0 else 1 end,
    updated_at = now();
  return allowed;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated, service_role;

-- Keep public signup simple: users may request a privileged role, but the
-- actual profile role remains non-privileged until an owner approves it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := new.raw_user_meta_data ->> 'requested_role';
  requested_plan text := new.raw_user_meta_data ->> 'requested_plan';
begin
  insert into public.profiles (id, full_name, role, institution)
  values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 160),
    case
      when new.raw_user_meta_data ->> 'role' in ('student', 'research_assistant')
        then new.raw_user_meta_data ->> 'role'
      else 'student'
    end,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'institution', '')), 240)
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    institution = case when excluded.institution <> '' then excluded.institution else public.profiles.institution end;

  if requested in ('professor', 'lab_admin') then
    insert into public.professional_role_requests
      (profile_id, requested_role, institution, evidence_note, status)
    values (
      new.id,
      requested,
      left(btrim(coalesce(new.raw_user_meta_data ->> 'institution', '')), 240),
      'Requested during account creation',
      'pending'
    )
    on conflict (profile_id) do update set
      requested_role = excluded.requested_role,
      institution = excluded.institution,
      evidence_note = excluded.evidence_note,
      status = 'pending',
      review_note = '',
      reviewed_by = null,
      reviewed_at = null;
  end if;

  if exists (select 1 from public.pricing_plans plan where plan.id = requested_plan and plan.is_active) then
    insert into public.account_subscriptions (user_id, plan_id, status, billing_cycle)
    values (new.id, requested_plan, 'selected', 'monthly')
    on conflict (user_id) do update set plan_id = excluded.plan_id, status = 'selected', updated_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.request_professional_role(
  p_requested_role text,
  p_institution text,
  p_evidence_note text default ''
)
returns public.professional_role_requests
language plpgsql
security definer
set search_path = ''
as $$
declare saved public.professional_role_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_requested_role not in ('professor', 'lab_admin') then raise exception 'Invalid privileged role'; end if;

  update public.profiles
     set institution = left(btrim(coalesce(p_institution, '')), 240)
   where id = auth.uid();

  insert into public.professional_role_requests
    (profile_id, requested_role, institution, evidence_note, status)
  values (
    auth.uid(), p_requested_role,
    left(btrim(coalesce(p_institution, '')), 240),
    left(btrim(coalesce(p_evidence_note, '')), 1000), 'pending'
  )
  on conflict (profile_id) do update set
    requested_role = excluded.requested_role,
    institution = excluded.institution,
    evidence_note = excluded.evidence_note,
    status = 'pending', review_note = '', reviewed_by = null, reviewed_at = null
  returning * into saved;
  return saved;
end;
$$;

revoke all on function public.request_professional_role(text, text, text) from public;
grant execute on function public.request_professional_role(text, text, text) to authenticated;

create or replace function public.review_professional_role_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text default ''
)
returns public.professional_role_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.professional_role_requests;
begin
  if not public.is_platform_admin() then raise exception 'Owner Admin access required'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Invalid decision'; end if;

  select * into target from public.professional_role_requests where id = p_request_id for update;
  if target.id is null then raise exception 'Role request not found'; end if;

  if p_decision = 'approved' then
    update public.profiles
       set role = target.requested_role,
           privileged_role_verified = true,
           role_verified_at = now(),
           institution = case when target.institution <> '' then target.institution else institution end
     where id = target.profile_id;
  end if;

  update public.professional_role_requests
     set status = p_decision,
         review_note = left(btrim(coalesce(p_review_note, '')), 1000),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_request_id
   returning * into target;
  return target;
end;
$$;

revoke all on function public.review_professional_role_request(uuid, text, text) from public;
grant execute on function public.review_professional_role_request(uuid, text, text) to authenticated;

create or replace function public.get_platform_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Owner Admin access required'; end if;

  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'active_users_30d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days'),
    'projects', (select count(*) from public.projects),
    'research_runs', (select count(*) from public.research_runs),
    'completed_runs', (select count(*) from public.research_runs where status = 'completed'),
    'papers', (select count(*) from public.papers),
    'manuscripts', (select count(*) from public.manuscripts),
    'professional_outputs', (select count(*) from public.role_agent_outputs),
    'pending_role_requests', (select count(*) from public.professional_role_requests where status = 'pending'),
    'active_pricing_plans', (select count(*) from public.pricing_plans where is_active),
    'active_subscriptions', (select count(*) from public.account_subscriptions where status in ('trialing', 'active')),
    'package_selections', (select count(*) from public.account_subscriptions),
    'api_requests_today', (select coalesce(sum(request_count), 0) from public.api_usage_daily where usage_date = current_date),
    'api_requests_30d', (select coalesce(sum(request_count), 0) from public.api_usage_daily where usage_date >= current_date - 29),
    'api_blocked_30d', (select coalesce(sum(blocked_count), 0) from public.api_usage_daily where usage_date >= current_date - 29),
    'subscriptions_by_plan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'plan_id', plan.id,
        'plan_name', plan.name,
        'total', coalesce(counts.total, 0),
        'active', coalesce(counts.active, 0)
      ) order by plan.sort_order), '[]'::jsonb)
      from public.pricing_plans plan
      left join (
        select subscription.plan_id, count(*) as total,
               count(*) filter (where subscription.status in ('trialing', 'active')) as active
        from public.account_subscriptions subscription
        group by subscription.plan_id
      ) counts on counts.plan_id = plan.id
    ),
    'recent_events', (
      select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row.event_at desc), '[]'::jsonb)
      from (
        select 'signup'::text as event_type,
               coalesce(nullif(profile.full_name, ''), auth_user.email, 'New user') as title,
               'Account created'::text as detail,
               auth_user.created_at as event_at
          from auth.users auth_user
          left join public.profiles profile on profile.id = auth_user.id
        union all
        select 'research_run', left(run.query, 120), run.status, run.created_at
          from public.research_runs run
        union all
        select 'manuscript', left(manuscript.title, 120), manuscript.status, manuscript.created_at
          from public.manuscripts manuscript
        order by event_at desc
        limit 20
      ) event_row
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_platform_admin_dashboard() from public;
grant execute on function public.get_platform_admin_dashboard() to authenticated;

drop function if exists public.get_platform_admin_users();
create function public.get_platform_admin_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  privileged_role_verified boolean,
  institution text,
  requested_role text,
  request_status text,
  plan_id text,
  plan_name text,
  subscription_status text,
  billing_cycle text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then raise exception 'Owner Admin access required'; end if;
  return query
    select auth_user.id, auth_user.email::text, profile.full_name, profile.role,
           profile.privileged_role_verified, profile.institution,
           request.requested_role, request.status,
           subscription.plan_id, plan.name, subscription.status, subscription.billing_cycle,
           auth_user.created_at, auth_user.last_sign_in_at
      from auth.users auth_user
      join public.profiles profile on profile.id = auth_user.id
      left join public.professional_role_requests request on request.profile_id = profile.id
      left join public.account_subscriptions subscription on subscription.user_id = profile.id
      left join public.pricing_plans plan on plan.id = subscription.plan_id
     order by auth_user.created_at desc;
end;
$$;

revoke all on function public.get_platform_admin_users() from public;
grant execute on function public.get_platform_admin_users() to authenticated;

create or replace function public.get_platform_admin_api_usage(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Owner Admin access required'; end if;
  if p_days < 1 or p_days > 365 then raise exception 'Days must be between 1 and 365'; end if;

  select jsonb_build_object(
    'request_count', coalesce(sum(usage.request_count), 0),
    'allowed_count', coalesce(sum(usage.allowed_count), 0),
    'blocked_count', coalesce(sum(usage.blocked_count), 0),
    'active_users', count(distinct usage.user_id),
    'by_bucket', (
      select coalesce(jsonb_agg(to_jsonb(bucket_row) order by bucket_row.request_count desc), '[]'::jsonb)
      from (
        select daily.bucket, sum(daily.request_count)::bigint as request_count,
               sum(daily.blocked_count)::bigint as blocked_count
        from public.api_usage_daily daily
        where daily.usage_date >= current_date - (p_days - 1)
        group by daily.bucket
      ) bucket_row
    ),
    'by_user', (
      select coalesce(jsonb_agg(to_jsonb(user_row) order by user_row.request_count desc), '[]'::jsonb)
      from (
        select daily.user_id, coalesce(nullif(profile.full_name, ''), auth_user.email, 'Unknown user') as user_name,
               auth_user.email::text as email, sum(daily.request_count)::bigint as request_count,
               sum(daily.blocked_count)::bigint as blocked_count
        from public.api_usage_daily daily
        join public.profiles profile on profile.id = daily.user_id
        left join auth.users auth_user on auth_user.id = daily.user_id
        where daily.usage_date >= current_date - (p_days - 1)
        group by daily.user_id, profile.full_name, auth_user.email
        order by sum(daily.request_count) desc
        limit 100
      ) user_row
    ),
    'daily', (
      select coalesce(jsonb_agg(to_jsonb(day_row) order by day_row.usage_date), '[]'::jsonb)
      from (
        select daily.usage_date, sum(daily.request_count)::bigint as request_count,
               sum(daily.blocked_count)::bigint as blocked_count
        from public.api_usage_daily daily
        where daily.usage_date >= current_date - (p_days - 1)
        group by daily.usage_date
      ) day_row
    )
  ) into result
  from public.api_usage_daily usage
  where usage.usage_date >= current_date - (p_days - 1);
  return result;
end;
$$;

revoke all on function public.get_platform_admin_api_usage(integer) from public;
grant execute on function public.get_platform_admin_api_usage(integer) to authenticated;

create or replace function public.set_account_subscription(
  p_profile_id uuid,
  p_plan_id text,
  p_status text,
  p_billing_cycle text default 'monthly'
)
returns public.account_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare saved public.account_subscriptions;
begin
  if not public.is_platform_admin() then raise exception 'Owner Admin access required'; end if;
  if p_status not in ('selected', 'trialing', 'active', 'past_due', 'cancelled') then raise exception 'Invalid subscription status'; end if;
  if p_billing_cycle not in ('monthly', 'yearly', 'manual') then raise exception 'Invalid billing cycle'; end if;
  if not exists (select 1 from public.pricing_plans where id = p_plan_id) then raise exception 'Pricing plan not found'; end if;

  insert into public.account_subscriptions
    (user_id, plan_id, status, billing_cycle, starts_at, assigned_by)
  values (
    p_profile_id, p_plan_id, p_status, p_billing_cycle,
    case when p_status in ('trialing', 'active') then now() else null end,
    auth.uid()
  )
  on conflict (user_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    billing_cycle = excluded.billing_cycle,
    starts_at = case
      when excluded.status in ('trialing', 'active') and public.account_subscriptions.status not in ('trialing', 'active') then now()
      else public.account_subscriptions.starts_at
    end,
    ends_at = case when excluded.status = 'cancelled' then now() else null end,
    assigned_by = auth.uid(),
    updated_at = now()
  returning * into saved;
  return saved;
end;
$$;

revoke all on function public.set_account_subscription(uuid, text, text, text) from public;
grant execute on function public.set_account_subscription(uuid, text, text, text) to authenticated;

create or replace function public.set_platform_owner(p_profile_id uuid)
returns public.platform_admins
language plpgsql
security definer
set search_path = ''
as $$
declare saved public.platform_admins;
begin
  if auth.role() <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  insert into public.platform_admins (user_id, is_owner)
  values (p_profile_id, true)
  on conflict (user_id) do update set is_owner = true
  returning * into saved;
  return saved;
end;
$$;

revoke all on function public.set_platform_owner(uuid) from public, anon, authenticated;
grant execute on function public.set_platform_owner(uuid) to service_role;
