-- =====================================================================
-- 0009  Query workflow RPCs
-- =====================================================================
-- All query state transitions live here rather than in client code, so
-- authorisation and side effects (notifications, timestamps, system
-- messages) can never be skipped by calling PostgREST directly.
--
-- Each function re-implements the original Express guards explicitly:
--   isStudentOwner / isAssignedMentor / isHod
-- =====================================================================

-- ---------------------------------------------------------------------
-- Raise a query (student only, against their own assigned mentor)
-- ---------------------------------------------------------------------
create or replace function public.create_support_query(
  p_subject     text,
  p_category    public.query_category,
  p_description text,
  p_priority    public.query_priority default 'Medium'
)
returns public.support_queries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller  public.user_profiles;
  v_query  public.support_queries;
  v_open_count integer;
begin
  select * into v_caller from public.user_profiles where id = auth.uid();

  if v_caller.id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_caller.role <> 'student' then
    raise exception 'Only students can raise support queries' using errcode = '42501';
  end if;
  if not v_caller.is_active then
    raise exception 'This account is deactivated' using errcode = '42501';
  end if;
  if v_caller.assigned_mentor_id is null then
    raise exception 'No faculty mentor assigned. Please contact the HOD.' using errcode = '22023';
  end if;
  if not public.is_non_blank(p_subject) or not public.is_non_blank(p_description) then
    raise exception 'Subject and description are required' using errcode = '22023';
  end if;
  if char_length(p_subject) > 200 then
    raise exception 'Subject must be 200 characters or fewer' using errcode = '22023';
  end if;
  if char_length(p_description) > 5000 then
    raise exception 'Description must be 5000 characters or fewer' using errcode = '22023';
  end if;

  -- Abuse guard: cap simultaneously unresolved queries per student.
  select count(*) into v_open_count
    from public.support_queries
   where student_id = v_caller.id and status <> 'Resolved';
  if v_open_count >= 20 then
    raise exception 'You already have 20 unresolved queries. Please close some before raising another.'
      using errcode = '22023';
  end if;

  insert into public.support_queries (student_id, mentor_id, subject, category, priority)
  values (v_caller.id, v_caller.assigned_mentor_id, btrim(p_subject), p_category, p_priority)
  returning * into v_query;

  insert into public.query_messages (query_id, sender_id, body)
  values (v_query.id, v_caller.id, btrim(p_description));

  return v_query;
end;
$$;

-- ---------------------------------------------------------------------
-- Post a message on a query (owner, assigned mentor or HOD)
-- ---------------------------------------------------------------------
create or replace function public.post_query_message(
  p_query_id uuid,
  p_body      text
)
returns public.query_messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query   public.support_queries;
  v_role     public.user_role;
  v_message  public.query_messages;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_non_blank(p_body) then
    raise exception 'Message cannot be empty' using errcode = '22023';
  end if;
  if char_length(p_body) > 5000 then
    raise exception 'Message must be 5000 characters or fewer' using errcode = '22023';
  end if;

  select * into v_query from public.support_queries where id = p_query_id;
  if v_query.id is null then
    raise exception 'Query not found' using errcode = 'P0002';
  end if;

  -- isStudentOwner / isAssignedMentor / isHod
  if not (v_query.student_id = auth.uid()
          or v_query.mentor_id = auth.uid()
          or public.is_hod()) then
    raise exception 'Unauthorized to post on this query' using errcode = '42501';
  end if;

  select role into v_role from public.user_profiles where id = auth.uid();

  insert into public.query_messages (query_id, sender_id, body)
  values (p_query_id, auth.uid(), btrim(p_body))
  returning * into v_message;

  update public.support_queries
     set last_message_at   = now(),
         first_response_at = case
                               when first_response_at is null and v_role in ('faculty','hod')
                               then now() else first_response_at
                             end,
         status            = case
                               when v_role in ('faculty','hod') and status = 'Open'
                               then 'In Progress'::public.query_status else status
                             end
   where id = p_query_id;

  return v_message;
end;
$$;

-- ---------------------------------------------------------------------
-- Feature 3 — faculty marks resolved; query enters pending_confirmation
-- ---------------------------------------------------------------------
create or replace function public.resolve_support_query(
  p_query_id uuid,
  p_note      text default null
)
returns public.support_queries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query public.support_queries;
  v_name   text;
begin
  select * into v_query from public.support_queries where id = p_query_id;
  if v_query.id is null then
    raise exception 'Query not found' using errcode = 'P0002';
  end if;

  -- isAssignedMentor OR isHod (students may not resolve their own query;
  -- they answer the confirmation prompt instead)
  if not (v_query.mentor_id = auth.uid() or public.is_hod()) then
    raise exception 'Only the assigned mentor or the HOD can resolve this query'
      using errcode = '42501';
  end if;
  if v_query.status = 'Resolved' and v_query.resolution_status = 'confirmed' then
    raise exception 'This query is already closed and confirmed' using errcode = '22023';
  end if;

  select full_name into v_name from public.user_profiles where id = auth.uid();

  update public.support_queries
     set status            = 'Resolved',
         resolution_status = 'pending_confirmation',
         resolved_by       = auth.uid(),
         resolved_at       = now(),
         last_message_at   = now()
   where id = p_query_id
   returning * into v_query;

  insert into public.query_messages (query_id, sender_id, body, is_system_message)
  values (
    p_query_id, auth.uid(),
    coalesce(nullif(btrim(p_note), ''),
             format('Marked as resolved by %s. Awaiting student confirmation.', v_name)),
    true
  );

  return v_query;
end;
$$;

-- ---------------------------------------------------------------------
-- Feature 3 — student answers "was your issue fixed?"  yes | no
-- ---------------------------------------------------------------------
create or replace function public.confirm_query_resolution(
  p_query_id uuid,
  p_response  public.confirmation_response,
  p_comment   text default null
)
returns public.support_queries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query public.support_queries;
begin
  select * into v_query from public.support_queries where id = p_query_id;
  if v_query.id is null then
    raise exception 'Query not found' using errcode = 'P0002';
  end if;

  -- isStudentOwner only — the whole point of this feature is that the
  -- student, not the faculty, has the final word.
  if v_query.student_id <> auth.uid() then
    raise exception 'Only the student who raised this query can confirm its resolution'
      using errcode = '42501';
  end if;
  if v_query.resolution_status <> 'pending_confirmation' then
    raise exception 'This query is not awaiting your confirmation' using errcode = '22023';
  end if;
  if p_comment is not null and char_length(p_comment) > 1000 then
    raise exception 'Comment must be 1000 characters or fewer' using errcode = '22023';
  end if;

  if p_response = 'yes' then
    update public.support_queries
       set resolution_status            = 'confirmed',
           status                       = 'Resolved',
           student_confirmation         = 'yes',
           student_confirmation_at      = now(),
           student_confirmation_comment = nullif(btrim(p_comment), ''),
           last_message_at              = now()
     where id = p_query_id
     returning * into v_query;

    insert into public.query_messages (query_id, sender_id, body, is_system_message)
    values (p_query_id, auth.uid(), 'Student confirmed the issue is resolved. Query closed.', true);
  else
    update public.support_queries
       set resolution_status            = 'reopened',
           status                       = 'In Progress',
           student_confirmation         = 'no',
           student_confirmation_at      = now(),
           student_confirmation_comment = nullif(btrim(p_comment), ''),
           reopen_count                 = reopen_count + 1,
           resolved_at                  = null,
           last_message_at              = now()
     where id = p_query_id
     returning * into v_query;

    insert into public.query_messages (query_id, sender_id, body, is_system_message)
    values (
      p_query_id, auth.uid(),
      coalesce(
        nullif('Student reported the issue is NOT resolved: ' || btrim(p_comment), 'Student reported the issue is NOT resolved: '),
        'Student reported the issue is NOT resolved. Query reopened.'),
      true
    );
  end if;

  return v_query;
end;
$$;

-- ---------------------------------------------------------------------
-- Post-resolution satisfaction rating (student owner, once)
-- ---------------------------------------------------------------------
create or replace function public.rate_support_query(
  p_query_id uuid,
  p_rating    smallint
)
returns public.support_queries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query public.support_queries;
begin
  select * into v_query from public.support_queries where id = p_query_id;
  if v_query.id is null then
    raise exception 'Query not found' using errcode = 'P0002';
  end if;
  if v_query.student_id <> auth.uid() then
    raise exception 'You are not authorized to rate this query' using errcode = '42501';
  end if;
  if v_query.status <> 'Resolved' then
    raise exception 'Only a resolved query can be rated' using errcode = '22023';
  end if;
  if v_query.satisfaction_rating is not null then
    raise exception 'This query has already been rated' using errcode = '22023';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;

  update public.support_queries
     set satisfaction_rating = p_rating
   where id = p_query_id
   returning * into v_query;

  return v_query;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants — authenticated sessions only, never anon
-- ---------------------------------------------------------------------
revoke all on function public.create_support_query(text, public.query_category, text, public.query_priority) from public, anon;
revoke all on function public.post_query_message(uuid, text) from public, anon;
revoke all on function public.resolve_support_query(uuid, text) from public, anon;
revoke all on function public.confirm_query_resolution(uuid, public.confirmation_response, text) from public, anon;
revoke all on function public.rate_support_query(uuid, smallint) from public, anon;

grant execute on function public.create_support_query(text, public.query_category, text, public.query_priority) to authenticated;
grant execute on function public.post_query_message(uuid, text) to authenticated;
grant execute on function public.resolve_support_query(uuid, text) to authenticated;
grant execute on function public.confirm_query_resolution(uuid, public.confirmation_response, text) to authenticated;
grant execute on function public.rate_support_query(uuid, smallint) to authenticated;
