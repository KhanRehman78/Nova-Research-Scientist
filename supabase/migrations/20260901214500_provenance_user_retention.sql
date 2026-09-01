-- Preserve historical provenance rows when an account is removed without
-- blocking GDPR/account-deletion workflows. The immutable content record
-- remains, while direct user attribution becomes null.

alter table public.manuscript_versions
  alter column created_by drop not null;
alter table public.manuscript_versions
  drop constraint if exists manuscript_versions_created_by_fkey;
alter table public.manuscript_versions
  add constraint manuscript_versions_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.manuscript_documents
  alter column created_by drop not null;
alter table public.manuscript_documents
  drop constraint if exists manuscript_documents_created_by_fkey;
alter table public.manuscript_documents
  add constraint manuscript_documents_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
