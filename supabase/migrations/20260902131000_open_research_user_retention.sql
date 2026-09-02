-- Keep citation/comment audit rows without blocking account deletion.
alter table public.manuscript_citations alter column created_by drop not null;
alter table public.manuscript_citations drop constraint if exists manuscript_citations_created_by_fkey;
alter table public.manuscript_citations add constraint manuscript_citations_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.manuscript_comments alter column created_by drop not null;
alter table public.manuscript_comments drop constraint if exists manuscript_comments_created_by_fkey;
alter table public.manuscript_comments add constraint manuscript_comments_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
