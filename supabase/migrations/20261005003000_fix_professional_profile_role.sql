-- Avoid PostgreSQL's CURRENT_ROLE special identifier when preserving a
-- previously verified Professor or Lab Admin role during profile edits.
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
  saved_role text;
  saved public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select profile.role
    into saved_role
    from public.profiles profile
   where profile.id = auth.uid()
   for update;
  if saved_role is null then
    raise exception 'Profile not found';
  end if;
  if saved_role in ('professor', 'lab_admin') then
    if p_role <> saved_role then
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
