-- NOVA first-party similarity corpus and cost-aware AI response caching.
-- Manuscripts are indexed privately by default. Cross-tenant comparison is
-- possible only after an explicit shared-corpus opt-in.

alter table public.manuscripts
  add column if not exists corpus_scope text not null default 'private',
  add column if not exists shared_corpus_consent_at timestamptz,
  add column if not exists shared_corpus_consent_version text;

alter table public.manuscripts
  drop constraint if exists manuscripts_corpus_scope_check;
alter table public.manuscripts
  add constraint manuscripts_corpus_scope_check
  check (corpus_scope in ('private', 'shared_opt_in', 'excluded'));

alter table public.similarity_matches
  drop constraint if exists similarity_matches_source_type_check;
alter table public.similarity_matches
  add constraint similarity_matches_source_type_check
  check (source_type in ('linked_paper', 'uploaded_source', 'nova_corpus'));

create table if not exists public.similarity_corpus_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null unique references public.manuscripts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  scope text not null check (scope in ('private', 'shared_opt_in')),
  content text not null,
  content_sha256 text not null,
  word_count integer not null default 0 check (word_count >= 0),
  consent_version text,
  consented_at timestamptz,
  indexed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.similarity_corpus_fingerprints (
  document_id uuid not null references public.similarity_corpus_documents(id) on delete cascade,
  fingerprint text not null,
  primary key (document_id, fingerprint)
);

create index if not exists similarity_corpus_visibility_idx
  on public.similarity_corpus_documents(scope, owner_id, project_id, indexed_at desc);
create index if not exists similarity_corpus_hash_idx
  on public.similarity_corpus_documents(content_sha256);
create index if not exists similarity_corpus_fingerprint_lookup_idx
  on public.similarity_corpus_fingerprints(fingerprint, document_id);

create table if not exists public.similarity_match_feedback (
  id uuid primary key default extensions.gen_random_uuid(),
  match_id uuid not null references public.similarity_matches(id) on delete cascade,
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  verdict text not null check (verdict in (
    'confirmed_overlap', 'false_positive', 'acceptable_reuse', 'needs_citation'
  )),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, reviewer_id)
);

create index if not exists similarity_match_feedback_manuscript_idx
  on public.similarity_match_feedback(manuscript_id, created_at desc);

create table if not exists public.llm_response_cache (
  id uuid primary key default extensions.gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  task_type text not null check (task_type in ('writing_analysis', 'paper_validation')),
  input_sha256 text not null,
  prompt_version text not null,
  response jsonb not null,
  hit_count integer not null default 0 check (hit_count >= 0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (manuscript_id, task_type, input_sha256, prompt_version)
);

create or replace function public.set_shared_corpus_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.corpus_scope = 'shared_opt_in' and old.corpus_scope is distinct from 'shared_opt_in' then
    new.shared_corpus_consent_at := now();
    new.shared_corpus_consent_version := 'nova-shared-corpus-v1';
  elsif new.corpus_scope <> 'shared_opt_in' then
    new.shared_corpus_consent_at := null;
    new.shared_corpus_consent_version := null;
  end if;
  return new;
end;
$$;

drop trigger if exists manuscripts_set_shared_corpus_consent on public.manuscripts;
create trigger manuscripts_set_shared_corpus_consent
before update of corpus_scope on public.manuscripts
for each row execute function public.set_shared_corpus_consent();

create or replace function public.set_manuscript_corpus_scope(
  p_manuscript_id uuid,
  p_scope text
)
returns public.manuscripts
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.manuscripts;
begin
  if p_scope not in ('private', 'shared_opt_in', 'excluded') then
    raise exception 'Invalid corpus scope';
  end if;
  select * into item from public.manuscripts where id = p_manuscript_id for update;
  if item.id is null or item.owner_id <> auth.uid() then
    raise exception 'Only the manuscript owner can change corpus participation';
  end if;
  update public.manuscripts set corpus_scope = p_scope where id = item.id returning * into item;
  return item;
end;
$$;

revoke all on function public.set_manuscript_corpus_scope(uuid, text) from public;
grant execute on function public.set_manuscript_corpus_scope(uuid, text) to authenticated, service_role;

create or replace function public.refresh_similarity_fingerprints()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tokens text[];
  token_count integer;
  token_index integer;
  value text;
begin
  if tg_op = 'UPDATE' and new.content_sha256 is not distinct from old.content_sha256 then
    return new;
  end if;
  delete from public.similarity_corpus_fingerprints where document_id = new.id;
  tokens := regexp_split_to_array(
    btrim(regexp_replace(lower(new.content), '[^[:alnum:]''-]+', ' ', 'g')),
    '[[:space:]]+'
  );
  token_count := coalesce(array_length(tokens, 1), 0);
  if token_count < 7 then return new; end if;

  for token_index in 1..(token_count - 6) loop
    value := md5(array_to_string(tokens[token_index:token_index + 6], ' '));
    -- Content-defined sampling retains roughly one quarter of unique shingles
    -- while matching identical passages regardless of their document offset.
    if get_byte(decode(value, 'hex'), 0) % 4 = 0 then
      insert into public.similarity_corpus_fingerprints(document_id, fingerprint)
      values (new.id, value)
      on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists similarity_corpus_refresh_fingerprints on public.similarity_corpus_documents;
create trigger similarity_corpus_refresh_fingerprints
after insert or update of content_sha256 on public.similarity_corpus_documents
for each row execute function public.refresh_similarity_fingerprints();

create or replace function public.sync_manuscript_similarity_corpus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_hash text;
  current_words integer;
begin
  if new.corpus_scope = 'excluded' or length(btrim(new.content)) < 250 then
    delete from public.similarity_corpus_documents where manuscript_id = new.id;
    return new;
  end if;

  current_hash := encode(extensions.digest(new.content, 'sha256'), 'hex');
  current_words := coalesce(array_length(
    regexp_split_to_array(btrim(regexp_replace(new.content, '[[:space:]]+', ' ', 'g')), ' '),
    1
  ), 0);

  insert into public.similarity_corpus_documents (
    manuscript_id, owner_id, project_id, title, scope, content,
    content_sha256, word_count, consent_version, consented_at, indexed_at
  ) values (
    new.id, new.owner_id, new.project_id, new.title, new.corpus_scope, new.content,
    current_hash, current_words, new.shared_corpus_consent_version,
    new.shared_corpus_consent_at, now()
  )
  on conflict (manuscript_id) do update set
    owner_id = excluded.owner_id,
    project_id = excluded.project_id,
    title = excluded.title,
    scope = excluded.scope,
    content = excluded.content,
    content_sha256 = excluded.content_sha256,
    word_count = excluded.word_count,
    consent_version = excluded.consent_version,
    consented_at = excluded.consented_at,
    indexed_at = excluded.indexed_at,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists manuscripts_sync_similarity_corpus on public.manuscripts;
create trigger manuscripts_sync_similarity_corpus
after insert or update of content, title, corpus_scope, project_id on public.manuscripts
for each row execute function public.sync_manuscript_similarity_corpus();

-- This RPC is service-role-only. It returns full candidate text to the trusted
-- validator, never to browser clients.
create or replace function public.get_nova_similarity_candidates(
  p_manuscript_id uuid,
  p_user_id uuid,
  p_project_id uuid,
  p_limit integer default 60
)
returns table (
  corpus_document_id uuid,
  title text,
  source_reference text,
  content text,
  scope text,
  shared_fingerprints bigint,
  target_fingerprints bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select d.id, d.content_sha256
    from public.similarity_corpus_documents d
    where d.manuscript_id = p_manuscript_id
  ), target_count as (
    select count(*)::bigint as value
    from public.similarity_corpus_fingerprints tf
    join target t on t.id = tf.document_id
  ), ranked as (
    select d.id, count(*)::bigint as overlap
    from target t
    join public.similarity_corpus_fingerprints tf on tf.document_id = t.id
    join public.similarity_corpus_fingerprints cf on cf.fingerprint = tf.fingerprint
    join public.similarity_corpus_documents d on d.id = cf.document_id
    where d.manuscript_id <> p_manuscript_id
      and (
        d.scope = 'shared_opt_in'
        or d.owner_id = p_user_id
        or d.project_id = p_project_id
      )
    group by d.id
    having count(*) >= 2
    order by overlap desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
  )
  select
    d.id,
    case when d.scope = 'shared_opt_in' and d.owner_id <> p_user_id and d.project_id <> p_project_id
      then 'NOVA shared corpus document'
      else d.title
    end,
    case when d.scope = 'shared_opt_in' then 'nova:shared:' || d.id::text
      else 'nova:private:' || d.id::text
    end,
    d.content,
    d.scope,
    ranked.overlap,
    target_count.value
  from ranked
  join public.similarity_corpus_documents d on d.id = ranked.id
  cross join target_count
  order by ranked.overlap desc;
$$;

revoke all on function public.get_nova_similarity_candidates(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.get_nova_similarity_candidates(uuid, uuid, uuid, integer) to service_role;

create or replace function public.validate_similarity_feedback_manuscript()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.similarity_matches m
    where m.id = new.match_id and m.manuscript_id = new.manuscript_id
  ) then
    raise exception 'Similarity match does not belong to this manuscript';
  end if;
  return new;
end;
$$;

drop trigger if exists similarity_feedback_validate_manuscript on public.similarity_match_feedback;
create trigger similarity_feedback_validate_manuscript
before insert or update on public.similarity_match_feedback
for each row execute function public.validate_similarity_feedback_manuscript();

drop trigger if exists similarity_match_feedback_set_updated_at on public.similarity_match_feedback;
create trigger similarity_match_feedback_set_updated_at before update on public.similarity_match_feedback
for each row execute function public.set_updated_at();

alter table public.similarity_corpus_documents enable row level security;
alter table public.similarity_corpus_fingerprints enable row level security;
alter table public.similarity_match_feedback enable row level security;
alter table public.llm_response_cache enable row level security;

create policy "similarity_feedback_read_manuscript" on public.similarity_match_feedback
for select to authenticated using (public.can_access_manuscript(manuscript_id));
create policy "similarity_feedback_insert_self" on public.similarity_match_feedback
for insert to authenticated with check (
  public.can_access_manuscript(manuscript_id) and reviewer_id = auth.uid()
);
create policy "similarity_feedback_update_self" on public.similarity_match_feedback
for update to authenticated using (
  public.can_access_manuscript(manuscript_id) and reviewer_id = auth.uid()
) with check (
  public.can_access_manuscript(manuscript_id) and reviewer_id = auth.uid()
);
create policy "similarity_feedback_delete_self" on public.similarity_match_feedback
for delete to authenticated using (
  public.can_access_manuscript(manuscript_id) and reviewer_id = auth.uid()
);

revoke all on public.similarity_corpus_documents, public.similarity_corpus_fingerprints, public.llm_response_cache from anon, authenticated;
grant select, insert, update, delete on public.similarity_corpus_documents, public.similarity_corpus_fingerprints, public.llm_response_cache to service_role;
grant select, insert, update, delete on public.similarity_match_feedback to authenticated, service_role;

-- Backfill existing eligible manuscripts. The corpus trigger creates sampled
-- fingerprints for every inserted or content-updated document.
insert into public.similarity_corpus_documents (
  manuscript_id, owner_id, project_id, title, scope, content,
  content_sha256, word_count, consent_version, consented_at, indexed_at
)
select
  m.id, m.owner_id, m.project_id, m.title, m.corpus_scope, m.content,
  encode(extensions.digest(m.content, 'sha256'), 'hex'),
  coalesce(array_length(regexp_split_to_array(btrim(regexp_replace(m.content, '[[:space:]]+', ' ', 'g')), ' '), 1), 0),
  m.shared_corpus_consent_version, m.shared_corpus_consent_at, now()
from public.manuscripts m
where m.corpus_scope <> 'excluded' and length(btrim(m.content)) >= 250
on conflict (manuscript_id) do update set
  title = excluded.title,
  scope = excluded.scope,
  content = excluded.content,
  content_sha256 = excluded.content_sha256,
  word_count = excluded.word_count,
  consent_version = excluded.consent_version,
  consented_at = excluded.consented_at,
  indexed_at = excluded.indexed_at,
  updated_at = now();
