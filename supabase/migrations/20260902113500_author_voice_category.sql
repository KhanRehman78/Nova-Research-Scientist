-- Keep the database constraint aligned with the professional writing-assistant
-- schema. Author-voice guidance is distinct from detector-evasion claims.

alter table public.writing_suggestions
  drop constraint if exists writing_suggestions_category_check;

alter table public.writing_suggestions
  add constraint writing_suggestions_category_check
  check (category in (
    'grammar', 'clarity', 'academic_tone', 'author_voice',
    'structure', 'citation', 'integrity'
  ));
