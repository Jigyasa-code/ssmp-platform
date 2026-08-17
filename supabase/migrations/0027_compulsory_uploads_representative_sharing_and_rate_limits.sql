-- =====================================================================
-- 0027 Compulsory Uploads, Representative Sharing & Rate Limits
-- =====================================================================

-- ── 1. Make uploads compulsory in submit_student_form_a ──────────────
create or replace function public.submit_student_form_a(p_payload jsonb)
returns public.student_form_a_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller public.user_profiles;
  v_row    public.student_form_a_profiles;
  v_same   boolean;
begin
  select * into v_caller from public.user_profiles where id = auth.uid();
  if v_caller.id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_caller.role <> 'student' then
    raise exception 'Only students fill Form A' using errcode = '42501';
  end if;

  -- Feature 1: Enforce parent business card and student signature are required uploads
  if nullif(btrim(p_payload ->> 'parent_business_card_path'), '') is null then
    raise exception 'Parent business card is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_payload ->> 'student_signature_path'), '') is null then
    raise exception 'Student signature is required' using errcode = '22023';
  end if;

  v_same := coalesce((p_payload ->> 'permanent_same_as_communication')::boolean, false);

  insert into public.student_form_a_profiles as f (
    student_id, full_name, registration_no, section, roll_no, branch,
    mobile_no, email, hostel_block, room_no, blood_group, date_of_birth, is_day_scholar,
    has_muj_alumni_in_family, alumni_name, alumni_branch, alumni_batch, alumni_institution, alumni_relationship,
    father_name, father_occupation, father_organization, father_designation, father_mobile, father_email,
    mother_name, mother_occupation, mother_organization, mother_designation, mother_mobile, mother_email,
    communication_address, communication_pin_code,
    permanent_same_as_communication, permanent_address, permanent_pin_code,
    parent_business_card_path, student_signature_path,
    is_submitted, submitted_at, is_locked
  )
  values (
    v_caller.id,
    btrim(p_payload ->> 'full_name'),
    btrim(p_payload ->> 'registration_no'),
    nullif(btrim(p_payload ->> 'section'), ''),
    nullif(btrim(p_payload ->> 'roll_no'), ''),
    nullif(btrim(p_payload ->> 'branch'), ''),
    btrim(p_payload ->> 'mobile_no'),
    lower(btrim(p_payload ->> 'email')),
    nullif(btrim(p_payload ->> 'hostel_block'), ''),
    nullif(btrim(p_payload ->> 'room_no'), ''),
    nullif(btrim(p_payload ->> 'blood_group'), ''),
    nullif(p_payload ->> 'date_of_birth', '')::date,
    coalesce((p_payload ->> 'is_day_scholar')::boolean, false),
    coalesce((p_payload ->> 'has_muj_alumni_in_family')::boolean, false),
    nullif(btrim(p_payload ->> 'alumni_name'), ''),
    nullif(btrim(p_payload ->> 'alumni_branch'), ''),
    nullif(btrim(p_payload ->> 'alumni_batch'), ''),
    nullif(btrim(p_payload ->> 'alumni_institution'), ''),
    nullif(btrim(p_payload ->> 'alumni_relationship'), ''),
    btrim(p_payload ->> 'father_name'),
    nullif(p_payload ->> 'father_occupation', '')::public.parent_occupation,
    nullif(btrim(p_payload ->> 'father_organization'), ''),
    nullif(btrim(p_payload ->> 'father_designation'), ''),
    nullif(btrim(p_payload ->> 'father_mobile'), ''),
    nullif(lower(btrim(p_payload ->> 'father_email')), ''),
    btrim(p_payload ->> 'mother_name'),
    nullif(p_payload ->> 'mother_occupation', '')::public.parent_occupation,
    nullif(btrim(p_payload ->> 'mother_organization'), ''),
    nullif(btrim(p_payload ->> 'mother_designation'), ''),
    nullif(btrim(p_payload ->> 'mother_mobile'), ''),
    nullif(lower(btrim(p_payload ->> 'mother_email')), ''),
    btrim(p_payload ->> 'communication_address'),
    btrim(p_payload ->> 'communication_pin_code'),
    v_same,
    case when v_same then btrim(p_payload ->> 'communication_address')
         else btrim(p_payload ->> 'permanent_address') end,
    case when v_same then btrim(p_payload ->> 'communication_pin_code')
         else btrim(p_payload ->> 'permanent_pin_code') end,
    nullif(btrim(p_payload ->> 'parent_business_card_path'), ''),
    nullif(btrim(p_payload ->> 'student_signature_path'), ''),
    true, now(), false
  )
  on conflict (student_id) do update set
    full_name = excluded.full_name,
    registration_no = excluded.registration_no,
    section = excluded.section,
    roll_no = excluded.roll_no,
    branch = excluded.branch,
    mobile_no = excluded.mobile_no,
    email = excluded.email,
    hostel_block = excluded.hostel_block,
    room_no = excluded.room_no,
    blood_group = excluded.blood_group,
    date_of_birth = excluded.date_of_birth,
    is_day_scholar = excluded.is_day_scholar,
    has_muj_alumni_in_family = excluded.has_muj_alumni_in_family,
    alumni_name = excluded.alumni_name,
    alumni_branch = excluded.alumni_branch,
    alumni_batch = excluded.alumni_batch,
    alumni_institution = excluded.alumni_institution,
    alumni_relationship = excluded.alumni_relationship,
    father_name = excluded.father_name,
    father_occupation = excluded.father_occupation,
    father_organization = excluded.father_organization,
    father_designation = excluded.father_designation,
    father_mobile = excluded.father_mobile,
    father_email = excluded.father_email,
    mother_name = excluded.mother_name,
    mother_occupation = excluded.mother_occupation,
    mother_organization = excluded.mother_organization,
    mother_designation = excluded.mother_designation,
    mother_mobile = excluded.mother_mobile,
    mother_email = excluded.mother_email,
    communication_address = excluded.communication_address,
    communication_pin_code = excluded.communication_pin_code,
    permanent_same_as_communication = excluded.permanent_same_as_communication,
    permanent_address = excluded.permanent_address,
    permanent_pin_code = excluded.permanent_pin_code,
    parent_business_card_path = coalesce(excluded.parent_business_card_path, f.parent_business_card_path),
    student_signature_path    = coalesce(excluded.student_signature_path, f.student_signature_path),
    is_submitted = true,
    submitted_at = coalesce(f.submitted_at, now()),
    is_locked = false,
    unlock_requested = false,
    unlock_requested_at = null
  returning * into v_row;

  perform set_config('ssmp.trusted_operation', 'on', true);
  update public.user_profiles
     set form_a_completed = true,
         form_a_completed_at = coalesce(form_a_completed_at, now()),
         phone = coalesce(nullif(btrim(p_payload ->> 'mobile_no'), ''), phone),
         section = coalesce(nullif(btrim(p_payload ->> 'section'), ''), section),
         branch  = coalesce(nullif(btrim(p_payload ->> 'branch'), ''), branch)
    where id = v_caller.id;
  perform set_config('ssmp.trusted_operation', 'off', true);

  return v_row;
end;
$$;

revoke all on function public.submit_student_form_a(jsonb) from public, anon;
grant execute on function public.submit_student_form_a(jsonb) to authenticated;


-- ── 2. Add representative sharing to Form A profiles ─────────────────
alter table public.student_form_a_profiles
  add column if not exists representative_sharing_enabled boolean not null default false;

comment on column public.student_form_a_profiles.representative_sharing_enabled is
  'Feature 3 — opt-in preference allowing the Student Representative (Star Mentee) to view support tickets and achievements.';


-- ── 3. Helper function to check representative visibility ──────────
create or replace function public.can_view_student_details_as_representative(p_student_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rep public.user_profiles;
  v_student public.user_profiles;
  v_sharing_enabled boolean;
begin
  -- Get the caller (potential representative)
  select * into v_rep from public.user_profiles where id = auth.uid();
  if v_rep.id is null or v_rep.role <> 'student' or not v_rep.is_star_mentee then
    return false;
  end if;

  -- Get the student whose data is being accessed
  select * into v_student from public.user_profiles where id = p_student_id;
  if v_student.id is null or v_student.role <> 'student' then
    return false;
  end if;

  -- They must belong to the same mentor group
  if v_rep.assigned_mentor_id is null or v_student.assigned_mentor_id is null or v_rep.assigned_mentor_id <> v_student.assigned_mentor_id then
    return false;
  end if;

  -- Check if student has enabled representative sharing
  select representative_sharing_enabled into v_sharing_enabled
    from public.student_form_a_profiles
   where student_id = p_student_id;

  return coalesce(v_sharing_enabled, false);
end;
$$;

revoke all on function public.can_view_student_details_as_representative(uuid) from public, anon;
grant execute on function public.can_view_student_details_as_representative(uuid) to authenticated, service_role;


-- ── 4. RLS policies for representative visibility ────────────────────

-- Achievements RLS
drop policy if exists achievements_select_representative on public.student_achievements;
create policy achievements_select_representative on public.student_achievements
  for select to authenticated
  using (public.can_view_student_details_as_representative(student_id));

-- Support Tickets RLS
drop policy if exists tickets_select_representative on public.support_tickets;
create policy tickets_select_representative on public.support_tickets
  for select to authenticated
  using (public.can_view_student_details_as_representative(student_id));


-- ── 5. Update get_mentor_group_tickets RPC ───────────────────────────
create or replace function public.get_mentor_group_tickets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me public.user_profiles;
begin
  select * into v_me from public.user_profiles where id = auth.uid();

  if v_me.id is null or v_me.role <> 'student' then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not v_me.is_star_mentee then
    raise exception 'Only the student representative can view the group ticket list'
      using errcode = '42501';
  end if;
  if v_me.assigned_mentor_id is null then
    return '[]'::jsonb;
  end if;

  -- Feature 3: Narrow projection, filtered to only show tickets of students 
  -- who have explicitly enabled representative sharing (plus the representative's own).
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'ticket_code',       t.ticket_code,
             'subject',           t.subject,
             'category',          t.category,
             'priority',          t.priority,
             'status',            t.status,
             'resolution_status', t.resolution_status,
             'created_at',        t.created_at,
             'last_message_at',   t.last_message_at,
             'student_name',      s.full_name,
             'section',           s.section,
             'is_mine',           (t.student_id = auth.uid())
           ) order by t.last_message_at desc)
      from public.support_tickets t
      join public.user_profiles s on s.id = t.student_id
     where t.mentor_id = v_me.assigned_mentor_id
       and (
         t.student_id = auth.uid()
         or exists (
           select 1 from public.student_form_a_profiles f
            where f.student_id = t.student_id
              and f.representative_sharing_enabled = true
         )
       )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_mentor_group_tickets() from public, anon;
grant execute on function public.get_mentor_group_tickets() to authenticated;


-- ── 6. RPC to set representative sharing preference ─────────────────
create or replace function public.set_representative_sharing(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_student() then
    raise exception 'Only a student can change their own representative sharing preference'
      using errcode = '42501';
  end if;

  insert into public.student_form_a_profiles (
    student_id, full_name, registration_no, mobile_no, email,
    father_name, mother_name,
    communication_address, communication_pin_code, permanent_address, permanent_pin_code,
    is_day_scholar, representative_sharing_enabled
  )
  select p.id, p.full_name, coalesce(p.login_id, 'PENDING'), '0000000000', p.email,
         'PENDING', 'PENDING', 'PENDING', '000000', 'PENDING', '000000', true, p_enabled
    from public.user_profiles p where p.id = auth.uid()
  on conflict (student_id) do update set representative_sharing_enabled = p_enabled;

  return p_enabled;
end;
$$;

revoke all on function public.set_representative_sharing(boolean) from public, anon;
grant execute on function public.set_representative_sharing(boolean) to authenticated;
