-- =====================================================================
-- 0018  Cap repeated rejections, and let the mentor escalate to the HOD
-- =====================================================================
-- Feature 3 gives the student the final word on whether a query is
-- really fixed. That is right, but it needs a floor: without one, a
-- student can reopen the same query indefinitely and the mentor has no
-- way out.
--
--   • A student may answer "No" at most 3 times on one query.
--     The 4th attempt is refused by the database.
--   • Once a query has been reopened 3 times, the assigned mentor gets a
--     "Report to HOD" action. That notifies every HOD with the mentor's
--     note and flags the query, so the disagreement is settled by the
--     department rather than in the thread.
-- =====================================================================

alter type public.notification_type add value if not exists 'query_escalated';

alter table public.support_queries
  add column if not exists escalated_to_hod boolean not null default false,
  add column if not exists escalated_at     timestamptz,
  add column if not exists escalated_by     uuid references public.user_profiles (id) on delete set null,
  add column if not exists escalation_note  text;

comment on column public.support_queries.escalated_to_hod is
  'Set when the mentor reports a repeatedly-reopened query to the HOD (after 3 rejections).';

create index if not exists queries_escalated_idx
  on public.support_queries (escalated_to_hod) where escalated_to_hod = true;

-- How many times a student may reject a resolution on one query.
create or replace function public.max_resolution_rejections()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 3 $$;

-- ── Enforce the cap inside the existing confirmation RPC ─────────────
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
  v_limit  integer := public.max_resolution_rejections();
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

  -- The cap. Confirming "yes" is always allowed; only rejections count.
  if p_response = 'no' and v_query.reopen_count >= v_limit then
    raise exception
      'You have already reopened this query % times, which is the maximum. Please speak with your mentor directly, or ask them to refer it to the HOD.',
      v_limit
      using errcode = '22023';
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
      format('Student reported the issue is NOT resolved (rejection %s of %s).%s',
             v_query.reopen_count, v_limit,
             case when nullif(btrim(p_comment), '') is null then ''
                  else ' Comment: ' || btrim(p_comment) end),
      true
    );
  end if;

  return v_query;
end;
$$;

revoke all on function public.confirm_query_resolution(uuid, public.confirmation_response, text) from public, anon;
grant execute on function public.confirm_query_resolution(uuid, public.confirmation_response, text) to authenticated;

-- ── Mentor reports a repeatedly-reopened query to the HOD ───────────
create or replace function public.escalate_query_to_hod(
  p_query_id uuid,
  p_note      text default null
)
returns public.support_queries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query  public.support_queries;
  v_mentor  text;
  v_student text;
  v_hod     record;
begin
  select * into v_query from public.support_queries where id = p_query_id;
  if v_query.id is null then
    raise exception 'Query not found' using errcode = 'P0002';
  end if;

  -- isAssignedMentor OR isHod
  if not (v_query.mentor_id = auth.uid() or public.is_hod()) then
    raise exception 'Only the assigned mentor can refer this query to the HOD'
      using errcode = '42501';
  end if;
  if v_query.reopen_count < public.max_resolution_rejections() then
    raise exception 'This query can only be referred to the HOD after % rejections',
      public.max_resolution_rejections() using errcode = '22023';
  end if;
  if v_query.escalated_to_hod then
    raise exception 'This query has already been referred to the HOD' using errcode = '22023';
  end if;

  select full_name into v_mentor  from public.user_profiles where id = auth.uid();
  select full_name into v_student from public.user_profiles where id = v_query.student_id;

  update public.support_queries
     set escalated_to_hod = true,
         escalated_at     = now(),
         escalated_by     = auth.uid(),
         escalation_note  = nullif(btrim(p_note), ''),
         last_message_at  = now()
   where id = p_query_id
   returning * into v_query;

  insert into public.query_messages (query_id, sender_id, body, is_system_message)
  values (
    p_query_id, auth.uid(),
    format('%s referred this query to the HOD after %s rejected resolutions.%s',
           coalesce(v_mentor, 'The mentor'), v_query.reopen_count,
           case when nullif(btrim(p_note), '') is null then ''
                else ' Note: ' || btrim(p_note) end),
    true
  );

  -- Every HOD is told, with the student named and the mentor's note.
  for v_hod in select id from public.user_profiles where role = 'hod' and is_active loop
    perform public.enqueue_notification(
      v_hod.id, auth.uid(), 'query_escalated',
      format('%s referred %s to you', coalesce(v_mentor, 'A mentor'), v_query.query_code),
      format('%s has rejected the resolution %s times. %s',
             coalesce(v_student, 'The student'), v_query.reopen_count,
             coalesce(nullif(btrim(p_note), ''), 'The mentor believes the issue is resolved.')),
      v_query.id, '/hod/queries/' || v_query.id::text
    );
  end loop;

  -- The student is told too, so the referral is never a surprise.
  perform public.enqueue_notification(
    v_query.student_id, auth.uid(), 'query_escalated',
    format('%s has been referred to the HOD', v_query.query_code),
    'Your mentor has asked the Head of Department to review this query. They will be in touch.',
    v_query.id, '/student/queries/' || v_query.id::text
  );

  return v_query;
end;
$$;

revoke all on function public.escalate_query_to_hod(uuid, text) from public, anon;
grant execute on function public.escalate_query_to_hod(uuid, text) to authenticated;
revoke all on function public.max_resolution_rejections() from public, anon;
grant execute on function public.max_resolution_rejections() to authenticated, service_role;
