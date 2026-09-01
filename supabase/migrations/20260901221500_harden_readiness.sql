-- Readiness is a security property, not a client-controlled badge. Restrict
-- validation fields/findings to trusted server code and expose a narrowly
-- scoped resolution RPC for authenticated project members.

revoke insert, update on public.manuscripts from authenticated;
grant insert (
  id, project_id, owner_id, research_run_id, title, target_journal,
  article_type, citation_style, writing_mode, content, abstract, keywords,
  journal_requirements, ai_disclosure, last_edit_source, last_change_summary
) on public.manuscripts to authenticated;
grant update (
  research_run_id, title, target_journal, article_type, citation_style,
  writing_mode, content, abstract, keywords, journal_requirements,
  ai_disclosure, last_edit_source, last_change_summary
) on public.manuscripts to authenticated;

revoke insert, update, delete on public.validation_findings from authenticated;
grant select on public.validation_findings to authenticated;

create or replace function public.resolve_validation_finding(
  p_finding_id uuid,
  p_status text
)
returns public.validation_findings
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.validation_findings;
begin
  if p_status not in ('resolved', 'accepted_risk') then
    raise exception 'Invalid finding resolution status';
  end if;

  select * into item
  from public.validation_findings
  where id = p_finding_id
  for update;

  if item.id is null or not public.can_access_manuscript(item.manuscript_id) then
    raise exception 'Finding not found or forbidden';
  end if;
  if p_status = 'accepted_risk' and item.severity not in ('warning', 'info') then
    raise exception 'Blocking and human-review findings must be resolved, not accepted as risk';
  end if;

  update public.validation_findings
     set status = p_status,
         resolved_at = now()
   where id = item.id
   returning * into item;
  return item;
end;
$$;

revoke all on function public.resolve_validation_finding(uuid, text) from public;
grant execute on function public.resolve_validation_finding(uuid, text) to authenticated, service_role;
