-- =====================================================================
-- 0004  Support queries + threaded messages
--       Feature 3 — student resolution-confirmation loop
-- =====================================================================

-- Query codes come from a sequence, not count(*). count(*) races under
-- concurrency and can mint duplicate codes; a sequence never does.
create sequence if not exists public.query_code_seq start with 1001;

create table if not exists public.support_queries (
  id                            uuid primary key default extensions.gen_random_uuid(),
  query_code                   text not null unique,
  student_id                    uuid not null references public.user_profiles (id) on delete cascade,
  mentor_id                     uuid not null references public.user_profiles (id) on delete restrict,

  subject                       text not null,
  category                      public.query_category not null,
  priority                      public.query_priority not null default 'Medium',
  status                        public.query_status   not null default 'Open',

  -- ── Feature 3: resolution confirmation loop ────────────────────────
  resolution_status             public.resolution_status not null default 'none',
  resolved_by                   uuid references public.user_profiles (id) on delete set null,
  resolved_at                   timestamptz,
  student_confirmation          public.confirmation_response,
  student_confirmation_at       timestamptz,
  student_confirmation_comment  text,
  reopen_count                  integer not null default 0,

  -- ── Analytics timestamps (populated by trigger, never by clients) ──
  first_response_at             timestamptz,
  last_message_at               timestamptz not null default now(),
  satisfaction_rating           smallint,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  constraint query_subject_not_blank    check (public.is_non_blank(subject)),
  constraint query_subject_max_length   check (char_length(subject) <= 200),
  constraint query_comment_max_length   check (student_confirmation_comment is null
                                                or char_length(student_confirmation_comment) <= 1000),
  constraint query_rating_range         check (satisfaction_rating is null
                                                or satisfaction_rating between 1 and 5),
  constraint query_student_is_not_mentor check (student_id <> mentor_id),
  constraint query_resolved_has_resolver
    check (resolution_status = 'none' or resolved_by is not null),
  constraint query_confirmation_has_timestamp
    check (student_confirmation is null or student_confirmation_at is not null)
);

comment on table public.support_queries is
  'Support queries raised by students against their assigned mentor. Visible to owner, assigned mentor and HOD only (enforced by RLS).';
comment on column public.support_queries.resolution_status is
  'Feature 3 — none -> pending_confirmation (faculty resolved) -> confirmed | reopened (student answered).';

create index if not exists queries_student_idx           on public.support_queries (student_id, created_at desc);
create index if not exists queries_mentor_idx            on public.support_queries (mentor_id, created_at desc);
create index if not exists queries_status_idx            on public.support_queries (status);
create index if not exists queries_category_idx          on public.support_queries (category);
create index if not exists queries_resolution_status_idx on public.support_queries (resolution_status)
                                                          where resolution_status <> 'none';
create index if not exists queries_updated_at_idx        on public.support_queries (updated_at desc);
create index if not exists queries_subject_trgm_idx      on public.support_queries using gin (subject extensions.gin_trgm_ops);

drop trigger if exists trg_queries_updated_at on public.support_queries;
create trigger trg_queries_updated_at
  before update on public.support_queries
  for each row execute function public.set_updated_at_timestamp();

-- ---------------------------------------------------------------------
-- Threaded conversation on a query
-- ---------------------------------------------------------------------
create table if not exists public.query_messages (
  id                 uuid primary key default extensions.gen_random_uuid(),
  query_id          uuid not null references public.support_queries (id) on delete cascade,
  sender_id          uuid references public.user_profiles (id) on delete set null,
  body               text not null,
  is_system_message  boolean not null default false,
  created_at         timestamptz not null default now(),

  constraint message_body_not_blank  check (public.is_non_blank(body)),
  constraint message_body_max_length check (char_length(body) <= 5000)
);

comment on table public.query_messages is
  'Messages on a query. Inserted only through post_query_message() so authorisation and side-effects always run.';

create index if not exists query_messages_query_idx on public.query_messages (query_id, created_at);
create index if not exists query_messages_sender_idx on public.query_messages (sender_id);

-- ---------------------------------------------------------------------
-- Query code generator: AN-1001, AN-1002, ...
-- ---------------------------------------------------------------------
create or replace function public.assign_query_code()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.query_code is null or btrim(new.query_code) = '' then
    new.query_code := 'AN-' || nextval('public.query_code_seq')::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_query_code on public.support_queries;
create trigger trg_assign_query_code
  before insert on public.support_queries
  for each row execute function public.assign_query_code();
