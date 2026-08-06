-- =====================================================================
-- seed.sql — LOCAL DEVELOPMENT ONLY (supabase db reset)
-- =====================================================================
-- Creates auth users directly, which is only appropriate against a local
-- Supabase stack. For a hosted project use:
--     node supabase/scripts/seed-demo-accounts.mjs
-- which goes through the official Admin API.
--
-- Password for every seeded account: SsmpDemo@2026
-- =====================================================================

do $$
declare
  v_password_hash text := extensions.crypt('SsmpDemo@2026', extensions.gen_salt('bf'));
  v_hod       uuid := '11111111-1111-1111-1111-111111111111';
  v_faculty1  uuid := '22222222-2222-2222-2222-222222222221';
  v_faculty2  uuid := '22222222-2222-2222-2222-222222222222';
  v_faculty3  uuid := '22222222-2222-2222-2222-222222222223';
  v_student1  uuid := '33333333-3333-3333-3333-333333333331';
  v_student2  uuid := '33333333-3333-3333-3333-333333333332';
  v_student3  uuid := '33333333-3333-3333-3333-333333333333';
  v_student4  uuid := '33333333-3333-3333-3333-333333333334';
  r record;
begin
  for r in
    select * from (values
      (v_hod,      'hod.iotis@jaipur.manipal.edu',      'hod',     'Dr. Sarah Jenkins',    'HOD001',     'IoT & IS', null::text, null::text, null::uuid),
      (v_faculty1, 'alice.smith@jaipur.manipal.edu',    'faculty', 'Dr. Alice Smith',      'FAC1001',    'CSE',      null, null, null),
      (v_faculty2, 'bob.johnson@jaipur.manipal.edu',    'faculty', 'Dr. Bob Johnson',      'FAC1002',    'CSE',      null, null, null),
      (v_faculty3, 'carol.williams@jaipur.manipal.edu', 'faculty', 'Prof. Carol Williams', 'FAC1003',    'ECE',      null, null, null),
      (v_student1, 'john.doe@muj.manipal.edu',          'student', 'John Doe',             '2428020221', 'CSE',      'A', '3rd Semester', v_faculty1),
      (v_student2, 'jane.smith@muj.manipal.edu',        'student', 'Jane Smith',           '2428020222', 'CSE',      'B', '3rd Semester', v_faculty1),
      (v_student3, 'mike.davis@muj.manipal.edu',        'student', 'Mike Davis',           '2428020223', 'CSE',      'A', '3rd Semester', v_faculty2),
      (v_student4, 'emily.wilson@muj.manipal.edu',      'student', 'Emily Wilson',         '2428020224', 'ECE',      'A', '3rd Semester', v_faculty3)
    ) as t(id, email, role, full_name, login_id, branch, section, semester_label, mentor_id)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated',
      r.email, v_password_hash, now(),
      jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', r.role),
      jsonb_build_object(
        'role', r.role, 'full_name', r.full_name, 'login_id', r.login_id,
        'branch', r.branch, 'section', r.section, 'semester_label', r.semester_label,
        'department', 'IoT & IS', 'must_change_password', false),
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      extensions.gen_random_uuid(), r.id, r.id::text,
      jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict do nothing;

    if r.mentor_id is not null then
      update public.user_profiles set assigned_mentor_id = r.mentor_id where id = r.id;
    end if;
  end loop;

  -- sample tickets ----------------------------------------------------
  insert into public.support_tickets (student_id, mentor_id, subject, category, priority, status)
  select v_student1, v_faculty1, 'Cannot log in to the ERP portal', 'ERP/Tech', 'High', 'Open'
  where not exists (select 1 from public.support_tickets where subject = 'Cannot log in to the ERP portal');

  insert into public.support_tickets (student_id, mentor_id, subject, category, priority, status)
  select v_student4, v_faculty3, 'Lab computer PC-12 not booting', 'Infrastructure', 'Medium', 'Open'
  where not exists (select 1 from public.support_tickets where subject = 'Lab computer PC-12 not booting');

  insert into public.ticket_messages (ticket_id, sender_id, body)
  select t.id, t.student_id, 'The ERP portal says invalid credentials even though I reset my password twice.'
    from public.support_tickets t
   where t.subject = 'Cannot log in to the ERP portal'
     and not exists (select 1 from public.ticket_messages m where m.ticket_id = t.id);

  insert into public.ticket_messages (ticket_id, sender_id, body)
  select t.id, t.student_id, 'PC 12 in the ECE lab does not boot, it only beeps.'
    from public.support_tickets t
   where t.subject = 'Lab computer PC-12 not booting'
     and not exists (select 1 from public.ticket_messages m where m.ticket_id = t.id);

  -- shared canned replies --------------------------------------------
  insert into public.canned_replies (owner_id, title, body, is_global)
  select null, v.title, v.body, true
  from (values
    ('Acknowledged',    'Thank you for reaching out. I have received your request and will look into it shortly.'),
    ('Need more detail','Could you share a screenshot or a few more details so I can help you faster?'),
    ('Escalated to IT', 'I have escalated this to the IT helpdesk. I will update you as soon as I hear back.'),
    ('Meet in person',  'Please drop by my cabin during office hours so we can go through this together.')
  ) as v(title, body)
  where not exists (select 1 from public.canned_replies c where c.title = v.title and c.is_global);
end $$;
