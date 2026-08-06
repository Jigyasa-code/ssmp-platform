#!/usr/bin/env node
/**
 * seed-demo-accounts.mjs
 * ---------------------------------------------------------------------
 * Creates the demo accounts (1 HOD, 3 faculty, 4 students), assigns
 * mentors and raises a few sample tickets so every dashboard has data on
 * first login.
 *
 * Safe to run more than once — existing accounts are reused, not
 * duplicated.
 *
 * Usage:
 *   node supabase/scripts/seed-demo-accounts.mjs
 *
 * Requires in .env (repo root):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY      <-- server-side only, never in frontend
 *   SEED_DEFAULT_PASSWORD          <-- optional, defaults below
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

// --- tiny .env loader so this works without extra dependencies ---------
const envPath = resolve(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'SsmpDemo@2026';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('\n  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('  Copy .env.example to .env and fill both in first.\n');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ---------------------------------------------------------------------
const DEMO_ACCOUNTS = [
  { email: 'hod.iotis@jaipur.manipal.edu',      role: 'hod',     full_name: 'Dr. Sarah Jenkins',    login_id: 'HOD001',     branch: 'IoT & IS' },

  { email: 'alice.smith@jaipur.manipal.edu',    role: 'faculty', full_name: 'Dr. Alice Smith',      login_id: 'FAC1001',    branch: 'CSE' },
  { email: 'bob.johnson@jaipur.manipal.edu',    role: 'faculty', full_name: 'Dr. Bob Johnson',      login_id: 'FAC1002',    branch: 'CSE' },
  { email: 'carol.williams@jaipur.manipal.edu', role: 'faculty', full_name: 'Prof. Carol Williams', login_id: 'FAC1003',    branch: 'ECE' },

  { email: 'john.doe@muj.manipal.edu',      role: 'student', full_name: 'John Doe',      login_id: '2428020221', branch: 'CSE', section: 'A', semester_label: '3rd Semester', mentor: 'alice.smith@jaipur.manipal.edu' },
  { email: 'jane.smith@muj.manipal.edu',    role: 'student', full_name: 'Jane Smith',    login_id: '2428020222', branch: 'CSE', section: 'B', semester_label: '3rd Semester', mentor: 'alice.smith@jaipur.manipal.edu' },
  { email: 'mike.davis@muj.manipal.edu',    role: 'student', full_name: 'Mike Davis',    login_id: '2428020223', branch: 'CSE', section: 'A', semester_label: '3rd Semester', mentor: 'bob.johnson@jaipur.manipal.edu' },
  { email: 'emily.wilson@muj.manipal.edu',  role: 'student', full_name: 'Emily Wilson',  login_id: '2428020224', branch: 'ECE', section: 'A', semester_label: '3rd Semester', mentor: 'carol.williams@jaipur.manipal.edu' }
];

const SAMPLE_TICKETS = [
  {
    student: 'john.doe@muj.manipal.edu',
    subject: 'Cannot log in to the ERP portal',
    category: 'ERP/Tech',
    priority: 'High',
    description: 'The ERP portal says invalid credentials even though I reset my password twice.',
    replies: []
  },
  {
    student: 'john.doe@muj.manipal.edu',
    subject: 'Course material missing for DBMS',
    category: 'Academic',
    priority: 'Medium',
    description: 'Could you please share the DBMS lab manuals and slides? I missed the last class.',
    replies: [
      { from: 'mentor', body: 'Hello John, I will upload them to Teams under Files by tomorrow morning.' },
      { from: 'student', body: 'Thank you ma’am, I will check there.' }
    ]
  },
  {
    student: 'emily.wilson@muj.manipal.edu',
    subject: 'Lab computer PC-12 not booting',
    category: 'Infrastructure',
    priority: 'Medium',
    description: 'PC 12 in the ECE lab does not boot, it only beeps.',
    replies: [{ from: 'mentor', body: 'I have raised this with the IT technician.' }],
    resolve: true
  }
];

// ---------------------------------------------------------------------
async function findUserByEmail(email) {
  // listUsers is paginated; the demo set is tiny so one page is enough.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

async function ensureAccount(spec) {
  const existing = await findUserByEmail(spec.email);
  if (existing) {
    console.log(`  = exists   ${spec.role.padEnd(7)} ${spec.email}`);
    return existing.id;
  }

  const { data, error } = await db.auth.admin.createUser({
    email: spec.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: spec.role,
      full_name: spec.full_name,
      login_id: spec.login_id,
      branch: spec.branch ?? null,
      section: spec.section ?? null,
      semester_label: spec.semester_label ?? null,
      department: 'IoT & IS',
      must_change_password: false
    },
    app_metadata: { role: spec.role }
  });
  if (error) throw new Error(`${spec.email}: ${error.message}`);
  console.log(`  + created  ${spec.role.padEnd(7)} ${spec.email}`);
  return data.user.id;
}

async function main() {
  console.log('\nSeeding SSMP demo accounts\n' + '-'.repeat(52));

  const idByEmail = {};
  for (const spec of DEMO_ACCOUNTS) {
    idByEmail[spec.email] = await ensureAccount(spec);
  }

  // The auth trigger writes the profile row; give it a beat on cold projects.
  await new Promise((r) => setTimeout(r, 1200));

  console.log('\nAssigning mentors');
  for (const spec of DEMO_ACCOUNTS.filter((a) => a.mentor)) {
    const { error } = await db
      .from('user_profiles')
      .update({ assigned_mentor_id: idByEmail[spec.mentor] })
      .eq('id', idByEmail[spec.email]);
    if (error) throw error;
    console.log(`  ${spec.full_name} -> ${spec.mentor}`);
  }

  console.log('\nCreating sample tickets');
  for (const t of SAMPLE_TICKETS) {
    const studentId = idByEmail[t.student];
    const mentorEmail = DEMO_ACCOUNTS.find((a) => a.email === t.student).mentor;
    const mentorId = idByEmail[mentorEmail];

    const { data: dupe } = await db
      .from('support_tickets')
      .select('id')
      .eq('student_id', studentId)
      .eq('subject', t.subject)
      .maybeSingle();
    if (dupe) {
      console.log(`  = exists   ${t.subject}`);
      continue;
    }

    const { data: ticket, error } = await db
      .from('support_tickets')
      .insert({
        student_id: studentId,
        mentor_id: mentorId,
        subject: t.subject,
        category: t.category,
        priority: t.priority
      })
      .select()
      .single();
    if (error) throw error;

    const messages = [{ ticket_id: ticket.id, sender_id: studentId, body: t.description }];
    for (const r of t.replies) {
      messages.push({
        ticket_id: ticket.id,
        sender_id: r.from === 'mentor' ? mentorId : studentId,
        body: r.body
      });
    }
    const { error: msgErr } = await db.from('ticket_messages').insert(messages);
    if (msgErr) throw msgErr;

    if (t.replies.length) {
      await db
        .from('support_tickets')
        .update({ status: 'In Progress', first_response_at: new Date().toISOString() })
        .eq('id', ticket.id);
    }
    if (t.resolve) {
      await db
        .from('support_tickets')
        .update({
          status: 'Resolved',
          resolution_status: 'pending_confirmation',
          resolved_by: mentorId,
          resolved_at: new Date().toISOString()
        })
        .eq('id', ticket.id);
    }
    console.log(`  + ${ticket.ticket_code}  ${t.subject}`);
  }

  console.log('\nAdding shared canned replies for faculty');
  const cannedDefaults = [
    { title: 'Acknowledged', body: 'Thank you for reaching out. I have received your request and will look into it shortly.' },
    { title: 'Need more detail', body: 'Could you share a screenshot or a few more details so I can help you faster?' },
    { title: 'Escalated to IT', body: 'I have escalated this to the IT helpdesk. I will update you as soon as I hear back.' },
    { title: 'Meet in person', body: 'Please drop by my cabin during office hours so we can go through this together.' }
  ];
  for (const c of cannedDefaults) {
    const { data: found } = await db
      .from('canned_replies').select('id').eq('title', c.title).eq('is_global', true).maybeSingle();
    if (!found) await db.from('canned_replies').insert({ ...c, is_global: true, owner_id: null });
  }

  console.log('\n' + '='.repeat(52));
  console.log('Demo accounts ready. Password for all: ' + PASSWORD);
  console.log('='.repeat(52));
  for (const a of DEMO_ACCOUNTS) {
    console.log(`  ${a.role.padEnd(7)} ${a.email}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('\nSeeding failed:', err.message || err);
  process.exit(1);
});
