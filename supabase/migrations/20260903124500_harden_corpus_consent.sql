-- Enforce manuscript-corpus consent at the database boundary, not only in the UI.
-- Project collaborators may edit manuscript prose, but only the manuscript owner
-- may change whether that prose participates in the shared corpus.

create or replace function public.set_shared_corpus_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := coalesce(auth.role(), '');
begin
  if tg_op = 'INSERT' then
    if new.corpus_scope = 'shared_opt_in' then
      new.shared_corpus_consent_at := now();
      new.shared_corpus_consent_version := 'nova-shared-corpus-v1';
    else
      new.shared_corpus_consent_at := null;
      new.shared_corpus_consent_version := null;
    end if;
    return new;
  end if;

  if (
    new.corpus_scope is distinct from old.corpus_scope
    or new.shared_corpus_consent_at is distinct from old.shared_corpus_consent_at
    or new.shared_corpus_consent_version is distinct from old.shared_corpus_consent_version
  ) and caller_role <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin')
    and auth.uid() is distinct from old.owner_id then
    raise exception 'Only the manuscript owner can change corpus participation';
  end if;

  if new.corpus_scope is distinct from old.corpus_scope then
    if new.corpus_scope = 'shared_opt_in' then
      new.shared_corpus_consent_at := now();
      new.shared_corpus_consent_version := 'nova-shared-corpus-v1';
    else
      new.shared_corpus_consent_at := null;
      new.shared_corpus_consent_version := null;
    end if;
  else
    -- Consent evidence is server-controlled and cannot be edited independently.
    new.shared_corpus_consent_at := old.shared_corpus_consent_at;
    new.shared_corpus_consent_version := old.shared_corpus_consent_version;
  end if;

  return new;
end;
$$;

drop trigger if exists manuscripts_set_shared_corpus_consent on public.manuscripts;
create trigger manuscripts_set_shared_corpus_consent
before insert or update on public.manuscripts
for each row execute function public.set_shared_corpus_consent();
