# SMP — Student Mentorship Portal

## Master technical documentation (single source of truth)

| | |
|---|---|
| **Describes** | The code in this repository at commit `2526b1f` on branch `main` (2026-09-11, "optimize bulk upload student lookups across all imports"), plus the black dot upload and the ERP GPA and backlog formats added on 2026-09-27 (migrations `0034`–`0035`, §4.12). That is SQL migrations `0001`–`0035`. |
| **Supersedes** | `docs/SSMP-Platform-Context.docx` (August 2026, which covered migrations 0001–0019). Where `README.md`, `SETUP_GUIDE.md`, `docs/SECURITY.md` or `docs/CLUSTER-HEAD-AND-CYCLE-JOBS.md` disagree with this document, this document is correct. Those files contain stale statements; see §15.5. |
| **How it was produced** | Every statement was checked against the source files. SQL behaviour was checked against the live definitions produced by replaying all 35 migrations on Postgres. Items marked *(tested)* were also exercised inside rolled-back transactions. Code comments, UI copy and the older documents were **not** treated as evidence. Where they contradict the code, this document says so. |
| **Secrets** | None appear here. Environment variables, the temporary password, the seed password and keys are documented by **name and purpose only**. |

### How to use this document

- **If you are an engineer or an AI starting on this codebase:** read §1 and §2 first, then the feature you are touching in §4. After that, the matching reference: §6 for the API, §7 for the database, §9 for the frontend. Read Appendix A (invariants) before changing anything.
- **Status words used throughout:**

  | Status | Meaning |
  |---|---|
  | **Implemented** | Works end to end in the current code. |
  | **Partial** | Works, but with a documented gap. |
  | **Placeholder** | The code path exists but deliberately does nothing real yet. |
  | **Dead** | Present in the repository but unreachable or unused. |
  | **Removed** | Existed in the old document or the code history, gone now. |
  | **Not implemented** | Requested or planned, with no code at all. |

- **Known issue** callouts mark verified bugs and gaps. They are collected in §15.
- **Naming.**
  - "**SMP**" is the product's current name.
  - "**SSMP**" (Student Support & Mentorship Portal) is the former name. It still appears in identifiers: `ssmp.trusted_operation`, `SSMP_TEMPORARY_PASSWORD`, the npm package `ssmp-platform`, the browser storage key `ssmp.auth.session`, the header `x-application-name: ssmp-portal`, the `/api/health` message "SSMP API is running", and PDF metadata.
  - A **query** is what older code and documents call a **ticket**. Migration `0031` renamed tables, enums, functions, notification types and routes.
- **Paths** are relative to the repository root. `file.js:120` means line 120 of that file at the commit above.

### Contents

1. [What SMP is](#1-what-smp-is)
2. [Architecture](#2-architecture)
3. [Codebase structure](#3-codebase-structure)
4. [Features](#4-features)
5. [Functions and logic](#5-functions-and-logic)
6. [API reference](#6-api-reference)
7. [Database reference](#7-database-reference)
8. [Authentication and security](#8-authentication-and-security)
9. [Frontend](#9-frontend)
10. [Backend](#10-backend)
11. [Integrations](#11-integrations)
12. [Configuration and environment](#12-configuration-and-environment)
13. [Running, testing and deploying](#13-running-testing-and-deploying)
14. [Error handling and edge cases](#14-error-handling-and-edge-cases)
15. [Current status and limitations](#15-current-status-and-limitations)
16. [Change history against the old document](#16-change-history-against-the-old-document)
- [Appendix A — Invariants](#appendix-a--invariants-rules-that-must-keep-holding)
- [Appendix B — Change recipes](#appendix-b--change-recipes)
- [Appendix C — Limits and constants](#appendix-c--limits-and-constants-quick-reference)
- [Appendix D — Demo and seed data](#appendix-d--demo-and-seed-data)
- [Appendix E — Glossary](#appendix-e--glossary)

---

## 1. What SMP is

### 1.1 Purpose and the problem it solves

SMP is a web portal that digitises a university department's **mentor–mentee scheme**. The code's defaults point to the Department of IoT & Intelligent Systems at Manipal University Jaipur:

- `department` defaults to `'IoT & IS'`.
- The login page defaults to "Department of IoT & Intelligent Systems" and "Manipal University Jaipur".
- The PDFs carry the MUJ logo.

Every student has exactly one faculty **mentor**. The portal replaces paper, e-mail and chat with a single system of record, and it makes the mentoring relationship **accountable and measurable**:

- **Student queries** (support requests) go to the student's own mentor. A query can only be closed when the **student confirms** it is fixed. A student can reject a resolution at most 3 times. The mentor can **refer a query to the HOD**. Every query has timestamps (first response, resolution) and a 1–5 satisfaction rating.
- **Form A** is the department's onboarding record: student, parents, address, alumni links. It is compulsory before the portal opens, as is a profile photo.
- **Academic monitoring.** Cluster heads upload attendance (the ERP export), semester GPAs and backlogs. Every upload re-evaluates each affected student against the **at-risk rule**, and the mentor is notified. See §4.14.
- **Pastoral channels:**
  - private **counselling** requests to one's mentor;
  - a class representative ("**star mentee**") who files **CR reports** (meeting minutes), whose action items become queries;
  - a recurring department-wide **feedback survey** about mentoring.
- **Oversight.** The HOD gets:
  - dashboards;
  - per-faculty performance metrics;
  - activity reports and student dossiers, on screen and as PDFs;
  - a faculty roster in which a departing mentor's mentees (and their open queries) can be reassigned in one step.

### 1.2 Users and roles

Roles are the Postgres enum `user_role`. A user has exactly one role, stored in `user_profiles.role`. Users cannot change their own role: it is a protected column that only the HOD (by a direct update; there is no UI for it) or SQL can change.

| Role | Who | Portal root | What they do |
|---|---|---|---|
| `student` | Enrolled student | `/student` | Fill Form A and upload a photo (both compulsory). Raise and track queries; confirm or reject resolutions; rate. Record semester GPA where the department has not published one. Maintain achievements. Answer the feedback survey. Request counselling. |
| `faculty` | Faculty **mentor** | `/faculty` | Answer and resolve mentees' queries and refer them to the HOD. Set their department and HOD e-mail. View mentees and their dossiers; verify achievements. Choose one star mentee. Handle counselling. Act on CR-report items. Follow at-risk mentees. Produce their own activity report. |
| `hod` | Head of Department | `/hod` | See every query and student. View faculty performance and reports (including the consolidated department report). Change faculty employment status and reassign mentees. Create single accounts. Run the periodic jobs. Can also upload rosters and academic data through the API, though there is no HOD screen for it. |
| `cluster_head` | Staff member responsible for academic data | `/cluster-head` | One-time subject setup. Upload attendance, GPA, backlogs and black dots. Upload student and faculty rosters and the mentor–mentee mapping. Through RLS and the UI, cluster heads have **no** access to queries, Form A, GPA or risk data (but see §8.9 S2). They can read back only the backlog and black dot rows they uploaded. |

There are two further **flags** that are not roles:

- **Star mentee (student representative):** `user_profiles.is_star_mentee`. At most one per mentor group, set by the mentor (or the HOD). It unlocks three student pages: Group Queries, Survey Tracking and CR Report.
- **Faculty employment status:** `user_profiles.employment_status` is `active`, `on_leave` or `departed`. Together with `available_for_reassignment` and `mentee_capacity` it defines the **reserve pool** used for reassignment.

**Nobody signs up.** Self sign-up is disabled (`supabase/config.toml`: `enable_signup = false`). Accounts are created in four ways:

1. by a cluster head's (or the HOD's) roster upload;
2. by the HOD's single-account form;
3. automatically, for mentors named in a mentor–mentee mapping upload who have no account yet;
4. by the seed scripts.

Every account the portal creates starts on a shared temporary password (§4.1) and must choose a new password at first sign-in. Seeded demo accounts are the exception (Appendix D).

### 1.3 End-to-end workflow

The normal life of a semester, in order. Section numbers point to the detailed description.

1. **Cluster head onboarding.** The cluster head signs in with the temporary password and sets a new one. They then complete the one-time **setup form**: the subjects they own, as course name and course code. Their portal opens only after that (§4.11).
2. **Accounts.** The cluster head uploads the **student roster**, which creates student accounts keyed by e-mail, with the registration number stored as `login_id`. Then they upload the **faculty roster** (optional) and the **mentor–mentee mapping**, which links each registration number to a mentor e-mail and creates any missing mentor accounts (§4.13).
3. **Student onboarding.** A student signs in, changes the temporary password, then fills **Form A**, then uploads a **profile photo**. Only then does the student portal open (§4.3).
4. **Mentor set-up.** From My Mentees the mentor records their **department and HOD e-mail**. This decides which HOD receives their referrals (§4.5). They also choose a **star mentee** (§4.6).
5. **Day-to-day mentoring:**
   - The student raises a **query**. The mentor replies (the first reply moves it to *In Progress*) and resolves it. The student confirms (closed) or rejects (reopened; at most 3 times), and can rate 1–5. At any point the mentor may **raise the query to the HOD** (§4.4, §4.5).
   - Students can send **counselling** requests that only their mentor sees (§4.8).
   - The star mentee files **CR reports**. Every action item becomes a query assigned to the mentor, who works through them from CR Reports (§4.7).
6. **Academic data.** Whenever it is available, the cluster head uploads the ERP **attendance** export, the ERP **CGPA / GPA & Credits** export, the ERP **Defaulter Grade** result (backlogs) and the Proctorial Board's **black dot** notice. There is no date window. Students are matched on registration number only.
   - Every attendance, GPA and backlog upload writes the data and re-evaluates the affected students' **at-risk** flags. Black dots are recorded on the student's record but are not part of the rule.
   - The mentor is notified when a student becomes (or stops being) at risk.
   - Students see their own attendance and GPA. They can self-report GPA only for semesters the department has not published (§4.9, §4.12, §4.14).
7. **Periodic jobs.** These are nominally every 15 days (reminders every 7), but **they only run when triggered**, normally by the HOD from Scheduled Jobs (§4.16). The jobs:
   - re-sweep every student's risk;
   - raise a **mentor meeting** record for each flagged student (no video link is generated yet; that step is a placeholder);
   - open a new **feedback survey** cycle and notify every student;
   - remind students who have not answered.
8. **Survey.** Every student answers 10 questions on a 1–5 scale. The star mentee sees who in the group has not answered, and the mentor sees per-mentee status (§4.15).
9. **Oversight and reports.**
   - Dashboards for each role (§4.17).
   - The HOD's faculty performance table.
   - Faculty activity, department and student-dossier reports, on screen and as PDFs (§4.18).
   - When a faculty member leaves, the HOD marks them *departed* and reassigns their mentees. Unresolved queries move to the new mentor, and everyone involved is notified (§4.19).

---

## 2. Architecture

### 2.1 System diagram

```
                ┌───────────────────────────────────────────────────────────────┐
                │ Browser: React 19 SPA (Vite build in frontend/dist, served    │
                │ by Vercel as static files; every non-/api path → index.html)  │
                └───────┬───────────────────────────────────────┬───────────────┘
   supabase-js with the │ anon key + the user's JWT             │ fetch('/api/…') with
   (reads, RPCs, some   │ (PKCE sign-in, session in             │ Authorization: Bearer <user JWT>
   direct writes,       │ localStorage)                         │
   Realtime, Storage)   ▼                                       ▼
┌──────────────────────────────────────────────┐   ┌───────────────────────────────────────────┐
│ Supabase                                     │   │ Vercel Serverless Functions (Node ≥20,    │
│  • Auth: e-mail + password, sign-up disabled │   │ ESM, 1024 MB, 30 s)                       │
│  • PostgREST → Postgres 15                   │   │  api/health.js                            │
│     – 30 tables, RLS enabled on every one    │◄──┤  api/admin/{provision-user-accounts,      │
│     – 8 views, all security_invoker          │   │     import-roster-spreadsheet,            │
│     – 79 functions: SECURITY DEFINER RPCs,   │   │     manage-faculty-roster, run-cycle-job} │
│       helpers, trigger functions             │   │  api/cluster-head/upload-academic-data    │
│     – triggers write every notification      │   │  api/reports/{faculty-activity-report,    │
│  • Realtime (5 tables, filtered by RLS)      │   │     student-dossier-report}               │
│  • Storage (4 private buckets)               │   │ Each request: verify JWT → load profile → │
└──────────────────────────────────────────────┘   │ role → rate limit → validate → work →     │
                                                   │ audit → JSON envelope (or a PDF)          │
                                                   │ Two clients: service role (bypasses RLS)  │
                                                   │ and "as user" (anon key + caller's JWT)   │
                                                   └───────────────────────────────────────────┘
```

There is no other server. There is no application database outside Supabase, no queue and no cache.

### 2.2 Design principles

1. **The database is the security boundary.**
   - Row Level Security is enabled on all 30 tables.
   - Every state change that has rules or side effects is a `SECURITY DEFINER` function that re-checks the caller itself. These functions run with `set search_path = public, pg_temp`.
   - The browser can call these RPCs directly. Route guards and API role checks are there for early rejection and user experience only.
2. **The browser talks to Supabase directly** for almost everything, under the user's own JWT. The API exists only for work that:
   - needs the **service role** (creating Auth users, moving another mentor's queries, writing the audit log, the rate-limit counter);
   - needs **file parsing** (spreadsheets) or **PDF generation**;
   - benefits from a **server-side rate limit and an audit entry**.
3. **Even in the API, work runs as the user where possible.** Uploads, reports and cycle jobs call their RPCs through `context.asUser`: the anon key plus the caller's JWT. The database's own checks therefore still apply. The service-role client is used only for the operations listed above.
4. **Notifications are only created by the database.** Triggers and definer RPCs call `enqueue_notification`. The frontend never inserts a notification; it only reads them and marks them read.
5. **One number, one source.** A report's on-screen charts and its PDF call the same SQL function, so they cannot disagree.

### 2.3 Which path each kind of operation takes

| Operation | Path | Examples |
|---|---|---|
| Reading lists, dashboards and detail pages | Browser → PostgREST (tables/views under RLS) or a read RPC | `support_queries`, `student_query_summary`, `get_dashboard_metrics`, `get_student_dossier` |
| State transitions with rules or side effects | Browser → `supabase.rpc()` (SECURITY DEFINER) | `create_support_query`, `resolve_support_query`, `confirm_query_resolution`, `escalate_query_to_hod`, `set_star_mentee`, `submit_student_form_a`, `upsert_semester_gpa`, `request_counselling`, `submit_mom_report`, `submit_survey_response`, `submit_cluster_head_setup` |
| Simple self-edits allowed by RLS | Browser → direct `insert/update/delete` | own `phone` and `avatar_url`; own achievements; marking own notifications read; a mentor/HOD changing a query's `priority`; clearing `must_change_password` |
| Creating accounts | API → Supabase Auth Admin (service role) | provision-user-accounts, import-roster-spreadsheet, mentor-map upload |
| Parsing uploaded spreadsheets | API → parser → RPC as the user | upload-academic-data (attendance, GPA, backlog, mentor map) |
| Faculty status and reassignment | API → RPC as the user, then a service-role update of `support_queries` | manage-faculty-roster |
| PDFs | API → report RPC as the user → pdf-lib | faculty-activity-report, student-dossier-report |
| Periodic jobs | API → RPC as the user | run-cycle-job |
| Rate limiting and audit | API → `consume_rate_limit`, `write_audit_entry` | every privileged endpoint |

### 2.4 Realtime

The `supabase_realtime` publication contains `notifications`, `query_messages`, `student_achievements`, `support_queries` and `user_profiles` (migration 0014; members renamed in 0031). Realtime applies the subscriber's RLS, so a client only receives rows it could `SELECT`. The client is configured for 8 events/second.

| Channel | Table / event / filter | Subscriber | Effect |
|---|---|---|---|
| `profile-watch-<uid>` | `user_profiles` UPDATE, `id=eq.<uid>` | `AuthProvider` | Reloads the signed-in profile. A mentor change, star flag or Form A status appears without a reload. |
| `notifications-<uid>` | `notifications` INSERT and UPDATE, `recipient_id=eq.<uid>` | `NotificationProvider` | INSERT adds the row to the top of the bell (kept at 30) and shows a toast with the title. UPDATE replaces the row. |
| `queries-stream` | `support_queries` `*`, no filter | `useRealtimeQueries` (query lists, dashboards) | Re-runs the list query. |
| `query-<id>` | `query_messages` `*` with `query_id=eq.<id>`; `support_queries` UPDATE with `id=eq.<id>` | `useQueryThread` (query detail pages) | Reloads the thread and the query. |
| `group-queries` | `support_queries` `*`, no filter | `StudentGroupQueriesPage` | Reloads the page's RPC. Because of RLS the representative only receives events for **their own** queries, so classmates' new queries do not arrive live. |

Nothing subscribes to `student_achievements`, although the table is in the publication.

### 2.5 Storage

There are four **private** buckets. Object paths always begin with the uploader's user id (`<uid>/…`), and the storage policies key off that first folder.

| Bucket | Limit and types | Written by | Read by |
|---|---|---|---|
| `form-a-uploads` | 5 MB; png, jpeg, jpg, webp, pdf | Student (Form A business card and signature) | Anyone for whom `can_access_student(<uid>)` holds: self, mentor, HOD |
| `achievement-proofs` | 5 MB; same types | Student | `can_access_student(<uid>)` |
| `profile-photos` | 3 MB; png, jpeg, jpg, webp | Owner (onboarding photo step) | **Any authenticated user** |
| `roster-imports` | 10 MB; csv, xls, xlsx | HOD only (policy) | HOD. **No code uses this bucket.** Spreadsheets are posted to the API as base64 instead. |

Files are served through signed URLs: 300 s in `createSignedUrl`, 3,600 s for avatars.

### 2.6 Key request flows

**A student raises a query**

1. `CreateQueryModal` calls `supabase.rpc('create_support_query', {p_subject, p_category, p_description, p_priority: 'Medium'})`.
2. The function checks that the caller is an active student with a mentor and fewer than 20 unresolved queries. It inserts the `support_queries` row (the `assign_query_code` trigger sets `AN-<n>`) and the first `query_messages` row.
3. The triggers `trg_notify_query_created` and `trg_notify_query_message` insert notifications for the mentor.
4. Realtime delivers the new query to every open list the mentor can see, and the notification to the mentor's bell.

**A cluster head uploads attendance**

1. `AcademicUploadPanel` reads the file as base64 and posts `{action: 'attendance', filename, file_base64}` to `/api/cluster-head/upload-academic-data`.
2. The endpoint:
   - authenticates the caller and checks the role (`cluster_head` or `hod`);
   - applies the rate limit;
   - validates the body with zod;
   - checks that the cluster head's setup is done;
   - decodes the file and parses it with `parseAttendanceExport`, which reads the course code, name, section and dates from the header block, one row per student.
3. It calls `record_attendance_batch` **as the user**. In one transaction the function:
   - resolves all registration numbers at once (`resolve_student_ids`);
   - upserts `student_course_sections` and `student_attendance_records`;
   - writes an `academic_upload_batches` row;
   - calls `evaluate_student_risk` for each matched student. Risk-flag triggers notify mentors.
4. The endpoint writes an audit entry and returns counts and row errors. The panel shows them.

**A roster import larger than one function invocation**

1. The panel posts the whole file.
2. The server parses it, then creates accounts in waves of 25 (5 at a time), and stops after about 20 s. It returns `next_offset` and `batch_id`.
3. The panel re-posts the same file with `offset` and `batch_id` until `next_offset` is `null`. It shows "*n* of *total* rows done" as it goes (§4.13).

**A PDF download**

1. `apiClient.downloadFile('/reports/…', params)` sends a GET with a Bearer token.
2. The endpoint:
   - authenticates the caller and checks the role;
   - applies the rate limit;
   - calls the same RPC the page uses, as the user (so the database decides access);
   - renders the PDF with pdf-lib, audits the download and streams the file as an attachment.
3. The browser saves it under the server's `Content-Disposition` filename.

### 2.7 What the system does not contain

These absences are deliberate or simply not built. Do not assume any of them exist:

- **No e-mail or SMS sending by the application.**
  - The only e-mail is Supabase Auth's own password-reset mail.
  - `send_invite_email` in the provisioning schema is accepted and ignored.
- **No scheduler.** There is no `pg_cron`, no Vercel `crons` entry and no other timer. The "15-day" jobs run only when someone triggers them (§4.16).
- **No meeting provider integration.** At-risk meetings are created with status `awaiting_link`. The link-creation function `create_at_risk_meeting_link` is a stub: after its permission check it returns the meeting row unchanged, with no link (§4.14).
- **No ERP API.** ERP data arrives only as exported files uploaded by a cluster head.
- **No AI or ML, and no analytics beyond SQL aggregates.**
- **No server-side sessions.** Authentication is the Supabase JWT on every request.

---

## 3. Codebase structure

### 3.1 Top level

```
ssmp-platform/                      (npm package "ssmp-platform" 2.0.0 — root = serverless API dependencies)
├── api/                            Vercel serverless functions (one file = one endpoint)
│   ├── _lib/                       shared server code (underscore = not deployed as an endpoint)
│   ├── admin/                      provisioning, roster import, faculty roster, cycle jobs
│   ├── cluster-head/               academic-data upload
│   ├── reports/                    faculty activity / department report, student dossier
│   └── health.js
├── frontend/                       the React SPA (npm package "ssmp-frontend")
│   ├── index.html, vite.config.js, tailwind.config.cjs, postcss.config.cjs, package.json, .env.example
│   ├── public/favicon.svg
│   ├── src/{main.jsx, App.jsx, index.css, assets/, components/, context/, hooks/, lib/, pages/, routes/}
│   └── test/ui-regression.test.jsx
├── supabase/
│   ├── config.toml                 local Supabase stack configuration
│   ├── migrations/0001…0035        the whole schema, in order
│   ├── seed.sql                    local-only seed (supabase db reset)
│   └── scripts/{seed-demo-accounts.mjs, ci-supabase-stubs.sql}
├── sample-data/                    demo rosters, cluster-head sample generator, generated upload files
├── design-reference/               static HTML mock-ups used when designing the UI (not built or imported)
├── docs/                           older documentation (see §15.5)
├── .github/workflows/ci.yml        CI
├── vercel.json                     build, functions, rewrites, headers
├── package.json / package-lock.json
├── .env.example                    server variable names
├── README.md, SETUP_GUIDE.md       older, partly stale guides
└── .gitignore
```

### 3.2 Entry points

| Runtime | Entry point | Chain |
|---|---|---|
| Browser | `frontend/index.html` | `src/main.jsx` (StrictMode, `index.css`) → `src/App.jsx` → `src/routes/AppRouter.jsx` |
| API | each non-underscore file under `api/` | default export `withApiDefaults([...methods], handler)` from `api/_lib/http-response.js`. Vercel routes `/api/<path>` to `api/<path>.js`. |
| Database | `supabase/migrations/*.sql` | applied in filename order by `supabase db push` (hosted) or `supabase db reset` (local, which also runs `supabase/seed.sql`) |
| Seed (hosted) | `supabase/scripts/seed-demo-accounts.mjs` | `npm run db:seed`; uses the Auth Admin API and the same upload RPCs as the portal |
| Sample files | `sample-data/cluster-head-sample-data.mjs` | `npm run sample:files` writes upload-ready files to `sample-data/generated/` |

### 3.3 `api/`: serverless functions

| File | Responsibility |
|---|---|
| `api/health.js` | `GET /api/health`. Liveness plus which required variables are set (never their values). |
| `api/admin/provision-user-accounts.js` | `POST`, HOD only. Creates 1–500 Auth accounts (any role) with the shared temporary password and optionally sets a student's mentor. Used by the HOD's "Add account" modal. |
| `api/admin/import-roster-spreadsheet.js` | `POST`, cluster head or HOD. Parses a student, faculty or combined roster and creates accounts in time-boxed chunks. Links mentors and parent contacts, and records one `roster_import_batches` row per upload. |
| `api/admin/manage-faculty-roster.js` | `GET` (roster, mentees, reserve pool) and `POST` (set status, reassign), HOD only. On reassignment it also moves unresolved queries with the service role. |
| `api/admin/run-cycle-job.js` | `GET` job status, `POST` run one job or all. HOD only. |
| `api/cluster-head/upload-academic-data.js` | `POST`, cluster head or HOD. `action` = `attendance`, `gpa`, `backlog` or `mentor-map`. Parses the file and calls the matching RPC as the user. `mentor-map` first creates missing mentor accounts. |
| `api/reports/faculty-activity-report.js` | `GET`, faculty or HOD. The faculty activity report (JSON or PDF). `faculty_id=all` gives the HOD's department report. |
| `api/reports/student-dossier-report.js` | `GET`, any signed-in user; the database decides access. Student dossier as JSON or PDF. |
| `api/_lib/http-response.js` | `withApiDefaults`, CORS, security headers, JSON envelope (`sendSuccess`, `sendError`, `sendJson`, `applyBaseHeaders`), `ApiError` |
| `api/_lib/request-guards.js` | `requireAuthenticatedUser`, `requireRole`, `clientIp`, `enforceRateLimit`, `recordAuditEntry` |
| `api/_lib/supabase-clients.js` | `createAdminClient()` (service role), `createUserClient(jwt)` (anon key plus the caller's JWT) |
| `api/_lib/environment.js` | Reads and validates server variables once (`env` getters) and `describeConfigHealth()` |
| `api/_lib/input-validation.js` | zod schemas for every request, `parseOrThrow`, `assertBodySize`, `sanitizeSingleLine`, `emailSchema` |
| `api/_lib/spreadsheet-parser.js` | CSV / XLSX / ERP-HTML-`.xls` / `.docx` reading, and parsers for rosters, attendance, the mentor map, the CGPA / GPA & Credits export, the Defaulter Grade result and the PB black dot notice. `REGISTRATION_ALIASES` is the one list of registration-number headings |
| `api/_lib/table-readers.js` | `readHtmlGrid` (HTML tables with rowspan/colspan filled in), `readDocxGrid` (Word tables, unzipped with `node:zlib`, with `gridSpan`/`vMerge` filled in), `decodeEntities` |
| `api/_lib/spreadsheet-parser.check.mjs` | Self-check script for the parsers (17 checks: attendance, mentor map, GPA, backlogs, black dots), run by `npm test` |
| `api/_lib/concurrency.js` | `runPool(items, limit, worker)`, a bounded-concurrency helper |
| `api/_lib/pdf-chart-primitives.js` | Vector charts and tables drawn with pdf-lib |
| `api/_lib/report-document-builder.js` | `buildFacultyActivityPdf`, `buildStudentDossierPdf`, `buildDepartmentReportPdf` |
| `api/_lib/university-logo-asset.js` | The MUJ logo as base64 (`UNIVERSITY_LOGO_PNG_BASE64`, `UNIVERSITY_LOGO_ASPECT`), so PDFs need no file access |

### 3.4 `frontend/src/`: the SPA

| Path | Contents |
|---|---|
| `main.jsx`, `App.jsx` | Bootstrap. The provider order is `ErrorBoundary › BrowserRouter › ToastProvider › AuthProvider › NotificationProvider › AppRouter`. |
| `index.css` | Tailwind layers plus component classes (§9.9) |
| `assets/manipal-university-jaipur-logo.png` | Brand logo |
| `routes/AppRouter.jsx` | The single route table (49 routes, §9.3). Most pages are `React.lazy` inside one `Suspense` with a `PageLoader` fallback. |
| `routes/RouteGuards.jsx` | `RequireAuth`, `RequirePasswordChange`, `RequireRole`, `RequireOnboarding`, `RequireClusterHeadSetup` |
| `context/AuthProvider.jsx` | Session, the signed-in `user_profiles` row with the mentor embedded, sign-in and out, password change and reset, live profile updates |
| `context/NotificationProvider.jsx` | Bell data, realtime inserts, mark read / mark all read |
| `context/ToastProvider.jsx` | `useToast()`: success, error, info, warning toasts |
| `hooks/useRealtimeQueries.js` | `useRealtimeQueries` (paged, filtered, live query list) and `useQueryThread` (one query and its messages, live) |
| `hooks/useDashboardMetrics.js` | Calls `get_dashboard_metrics` |
| `hooks/useAsyncAction.js` | `run(fn, {successMessage, onSuccess})` with toast handling |
| `lib/supabaseClient.js` | The single browser Supabase client and `getAccessToken()`. Shows a configuration-error page if the `VITE_SUPABASE_*` variables are missing. |
| `lib/apiClient.js` | `apiClient.get`, `.post`, `.downloadFile` for `/api/*` |
| `lib/fileUpload.js` | Client-side file validation, private uploads, signed URLs, `BUCKETS` |
| `lib/constants.js` | Enum mirrors, option lists, navigation per role, `HOME_PATH` (§9.10) |
| `lib/formatters.js` | Date, number and duration formatting, `describeError` |
| `components/layout/` | `PortalShell`, `SidebarNavigation`, `TopBar`, `NotificationBell` |
| `components/ui/` | `Avatar`, `DataTable`, `EmptyState`, `ErrorBoundary`, `FormControls`, `Modal`, `PageHeader`, `Panel`, `ProfilePhotoUploader`, `Skeleton`, `StatCard`, `StatusBadge` |
| `components/charts/Charts.jsx` | Recharts wrappers: `CategoryBarChart`, `GroupedBarChart`, `TrendLineChart`, `AreaTrendChart`, `DonutChart`, `GaugeChart`, `Sparkline` |
| `components/queries/` | `CreateQueryModal`, `QueryConversation`, `ResolutionConfirmation`, `SatisfactionRating` (shared by all portals) |
| `components/student/FormAFields.jsx` | The Form A field set, its state and its validation (`EMPTY_FORM_A`, `validateFormA`, `useFormAState`, `FormAFields`) |
| `components/hod/AddAccountModal.jsx` | Single-account creation |
| `components/clusterHead/AcademicUploadPanel.jsx` | The shared upload block, including the chunk loop |
| `components/tickets/` | **Dead.** Pre-rename copies that nothing imports. They call RPCs dropped in 0031, and one imports a constant that no longer exists (§15.4). |
| `pages/auth/` | `LoginPage`, `ChangePasswordPage` (also serves `/reset-password`) |
| `pages/student/` | 13 pages (§9.6) |
| `pages/faculty/` | 10 pages. Six are reused by the HOD with `isHodView`. |
| `pages/hod/` | 6 pages. `HodProfilePage` re-exports `FacultyProfilePage`. |
| `pages/clusterHead/` | 8 pages. `ClusterHeadProfilePage` re-exports `FacultyProfilePage`. |
| `pages/NotFoundPage.jsx` | Catch-all 404 |

Other files in `frontend/`:

- `test/ui-regression.test.jsx` is a jsdom regression test for two past bugs: Panel padding and Modal focus theft (§13.4).
- `vite.config.js` sets dev port 5173 and manual chunks `react-vendor`, `supabase-vendor`, `charts-vendor`.
- `package.json` depends on `"ssmp-platform": "file:.."` to share the root package.

### 3.5 `supabase/`

| Path | Contents |
|---|---|
| `config.toml` | Local stack settings: API 54321, DB 54322 (Postgres 15), Studio 54323; auth settings (§12.3) |
| `migrations/` | 33 ordered files (list below) |
| `seed.sql` | **Local only.** Creates demo users directly in `auth.users`/`auth.identities`, sets mentors, inserts sample queries and messages, and inserts the 4 global canned replies ("Acknowledged", "Need more detail", "Escalated to IT", "Meet in person"). The seed script inserts the same four; no migration does. |
| `scripts/seed-demo-accounts.mjs` | Hosted-safe seed through the Auth Admin API. It creates the demo accounts, mentors, sample queries, cluster heads and their subjects, uploads sample attendance, GPA and backlogs through the `record_*_batch` RPCs, and runs cycle jobs. See Appendix D. |
| `scripts/ci-supabase-stubs.sql` | Minimal `auth` and `storage` schema stubs (roles, `auth.uid()`, `auth.users`, storage tables) so CI can apply the migrations to plain Postgres |
| `scripts/verify-security-policies.mjs` | **Missing.** `npm run verify:security` references it, so that script fails. |

**Migrations.** Never edit an applied migration; add a new one. Several later migrations replace functions and views defined earlier, and the "current body" column says where each object's live definition lives.

| # | File | What it does |
|---|---|---|
| 0001 | `extensions_enums_and_shared_helpers` | Extensions (`citext`, `pg_trgm`, `pgcrypto`), the original enums, `set_updated_at_timestamp`, `is_non_blank` |
| 0002 | `user_profiles_table` | `user_profiles`; `handle_new_auth_user` and e-mail-sync triggers on `auth.users` |
| 0003 | `student_form_a_onboarding` | `student_form_a_profiles` (Form A), `student_semester_gpas`, GPA-sharing flag |
| 0004 | `support_tickets_and_messages` | The tickets and messages tables (renamed in 0031), code sequence starting at `AN-1001` |
| 0005 | `notifications_and_achievements` | `notifications`, `student_achievements` |
| 0006 | `semester_setup_roster_and_audit` | `semester_cycles`, `roster_import_batches`, `mentor_reassignment_log`, `canned_replies`, `audit_log` |
| 0007 | `authorization_helper_functions` | `is_hod`, `is_faculty`, `is_student`, `is_mentor_of`, `my_mentor_id`, `can_access_student`, `can_view_student_gpa`, the query access helper, the protected-column guard |
| 0008 | `row_level_security_policies` | RLS on every table (ENABLE, not FORCE; the file's first comment line saying "FORCE'd" is wrong, and its own explanation a few lines later is right) |
| 0009 | `ticket_workflow_functions` | Create, post, resolve, confirm and rate RPCs (current bodies in 0031) |
| 0010 | `student_and_mentor_functions` | Form A submit, GPA, achievement verification, star mentee, reassignment, employment status |
| 0011 | `cross_portal_notification_triggers` | Notification triggers (current bodies in 0031) |
| 0012 | `analytics_views` | Performance, summary and trend views, reserve pool (renamed and rebuilt in 0031) |
| 0013 | `report_and_dashboard_functions` | Dashboard metrics, activity report, dossier (current bodies in 0030/0031) |
| 0014 | `realtime_and_storage_buckets` | Realtime publication; the `form-a-uploads`, `achievement-proofs` and `roster-imports` buckets and their policies (`profile-photos` comes in 0019) |
| 0015 | `rate_limiting_and_audit_helpers` | `api_rate_limits`, `consume_rate_limit`, `write_audit_entry` |
| 0016 | `fix_user_profiles_policy_recursion` | Fixes the recursive `user_profiles` SELECT policies (HTTP 500 on every profile read) |
| 0017 | `form_a_editable_and_star_mentee_group_view` | Form A editable after submission; star mentee's group query view |
| 0018 | `reopen_limit_and_hod_escalation` | Reopen cap of 3 (`max_resolution_rejections`); escalation to the HOD (gate removed in 0030) |
| 0019 | `profile_photos_combined_roster_and_department_report` | `avatar_url` and the photos bucket; combined roster type; department report |
| 0020 | `cluster_head_role_and_new_enum_values` | Enum values only: `cluster_head`, the upload, meeting and job enums, the new notification types. Values need their own migration file. |
| 0021 | `cluster_head_portal_and_academic_data` | Cluster head setup, `cluster_head_courses`, sections, attendance, GPA source, backlogs, upload batches, upload RPCs |
| 0022 | `at_risk_detection_and_mentor_meetings` | `student_risk_flags`, `at_risk_meetings`, risk evaluation and meeting dispatch, `at_risk_student_overview` |
| 0023 | `student_survey_cycles_and_completion_tracking` | Survey tables and RPCs, 10 seeded questions, completion views |
| 0024 | `cycle_job_schedule_and_manual_triggers` | `cycle_job_schedule` (4 jobs), `cycle_job_runs`, `run_cycle_job`, `run_all_cycle_jobs_now`, `run_due_cycle_jobs`, `get_cycle_job_status` |
| 0025 | `attendance_from_erp_export_and_gpa_semester` | Attendance keyed to the ERP export and registration number; GPA rows carry their own semester; `student_attendance_overview` |
| 0026 | `new_ticket_categories` | Enum values only: Academics, Examination, Behavioural, Administrative, Others |
| 0027 | `cr_reports_rosters_and_section_fix` | `mom_records` and `submit_mom_report`; `set_query_in_progress`; roster uploads move to the cluster head; `map_students_to_mentors`; parent contact columns; wider section labels |
| 0028 | `counselling_notification_type` | Enum value only: `counselling_request` |
| 0029 | `counselling_requests` | `counselling_requests` table, RPCs, notification trigger |
| 0030 | `mentor_department_and_hod_routing` | `user_profiles.hod_email`; `set_mentor_department_and_hod`; escalation routed to the named HOD and ungated; `escalated_queries` in the activity report |
| 0031 | `rename_tickets_to_queries` | Pure rename, ticket → query: tables, columns, enums, functions, triggers, policies, views, notification types and stored link paths. Holds the current body of most workflow, report and view definitions. |
| 0032 | `drop_course_section_count` | Drops `cluster_head_courses.section_count`; setup takes only name and code |
| 0033 | `resolve_students_per_upload` | `resolve_student_ids`; the four upload RPCs resolve identifiers once per file (fixes statement timeouts on ~2,300-row files) |
| 0034 | `black_dot_upload_type` | Enum value `academic_upload_type.black_dot`, alone in its own file |
| 0035 | `black_dots_and_erp_result_exports` | `student_black_dots`, `student_cgpas`; credits on `student_semester_gpas`; grade and credits on `student_backlogs`; `academic_upload_batches.scope_label`; `try_numeric`, `is_blank_mark`; rewritten `record_gpa_batch`, `record_backlog_batch` (new `p_subject_codes`), new `record_black_dot_batch`; `resolve_student_ids` registration-number-only with a caller check (S3); `login_id` protected (S5); `get_student_dossier` returns CGPA, backlogs and black dots |

### 3.6 Other folders

- **`sample-data/`**
  - `student-roster-sample.csv`, `faculty-roster-sample.csv` and `combined-roster-sample.csv` are demo rosters.
  - `cluster-head-sample-data.mjs` is the single source of the demo academic data. The seed script and the parser self-check import it; run as a CLI it writes `generated/` in the real layouts: 6 attendance CSVs, the CGPA / GPA & Credits export and two Defaulter Grade results (HTML saved as `.xls`, like the ERP), and a PB notice (`.docx`, built by `buildMinimalDocx` without a dependency). Each demo student trips a different at-risk condition. The three older CSVs in `generated/` (`gpa-semester-2/3-sample.csv`, `backlogs-semester-2-sample.csv`) are no longer written and can be deleted; they still upload through the flat fallbacks.
- **`design-reference/`** holds six static HTML mock-ups (`code.html`) and a `DESIGN.md` (`academic_nexus`), in seven folders. Nothing in the build imports them.
- **`docs/`**
  - `SSMP-Platform-Context.docx` is the old context document.
  - `~$MP-Platform-Context.docx` is a Microsoft Word lock file committed by accident.
  - `SECURITY.md` and `CLUSTER-HEAD-AND-CYCLE-JOBS.md` are partly stale (§15.5).

---

## 4. Features

Each feature below covers:

- **Status**;
- **Where**: the files involved;
- **Flow**: input → processing → output;
- **Data**: tables, RPCs and notifications;
- **Rules**: validation and limits;
- **Edge cases and known issues**.

Error text quoted in "double quotes" is the exact string the code raises or shows.

### 4.1 Accounts, provisioning and the temporary password

**Status:** Implemented. Known issues are listed at the end.

**Where:**

- API: `api/admin/import-roster-spreadsheet.js`, `api/admin/provision-user-accounts.js`, `api/cluster-head/upload-academic-data.js` (`createMissingMentors`), `api/_lib/environment.js` (`env.TEMPORARY_PASSWORD`).
- SQL: `handle_new_auth_user` (0002/0021) and `handle_auth_user_email_change`.
- UI: `ClusterHeadRosterPage`, `AddAccountModal`.

**How accounts are created.** There are four paths. The three portal paths call `supabase.auth.admin.createUser` with the service role and `email_confirm: true`; the seeds work differently (Appendix D):

| Path | Who triggers it | Roles created | Section |
|---|---|---|---|
| Student / faculty / combined roster upload | Cluster head (or HOD through the API) | student, faculty | §4.13 |
| "Add account" modal | HOD (Students page) | any of the 4 roles | §4.20 |
| Mentor–mentee mapping upload | Cluster head (or HOD) | faculty, for mentor e-mails with no account | §4.13 |
| `npm run db:seed` / `seed.sql` | Developer | demo accounts | Appendix D |

**What each path sends:**

- **`user_metadata`:** `role`, `full_name`, `login_id`, `branch`, `section`, `semester_label`, `phone`, `department`, and `must_change_password: true`.
  - `department` is always `'IoT & IS'` from roster, mapping and modal imports (hard-coded).
  - The roster keeps `phone` only if it is exactly 10 digits.
  - The mentor-map path sends only `role` (`faculty`), `full_name`, `department` and `must_change_password`.
- **`app_metadata`:** `{role}`.

**What `handle_new_auth_user` does.** It runs AFTER INSERT on `auth.users` and inserts the `user_profiles` row from `raw_user_meta_data`:

- the role, if it is one of the four, else `student`;
- `full_name`, defaulting to the e-mail's local part;
- `department`, defaulting to `'IoT & IS'`;
- `must_change_password`, defaulting to `true`;
- `login_id`, `phone`, `branch`, `section` and `semester_label`, each blank → `NULL`;
- `ON CONFLICT (id) DO NOTHING`.

`handle_auth_user_email_change` keeps `user_profiles.email` in sync when an Auth e-mail changes.

**The temporary password:**

- Every account created by the API gets the same password: `env.TEMPORARY_PASSWORD`, read from the **`SSMP_TEMPORARY_PASSWORD`** environment variable.
- If that variable is unset, `api/_lib/environment.js` falls back to a **built-in default written in the source**. Set the variable in every deployment.
- A roster row may carry its own password in a *Password* column (aliases in §10.4). It must be at least 8 characters, otherwise: "The Password column must be at least 8 characters (leave it blank to set the shared one)".
- The password is shown to the uploader:
  - the HOD modal displays name, e-mail and password with a "Copy credentials" button;
  - the roster page shows a **Credentials** panel with a CSV download (`smp-credentials-YYYY-MM-DD.csv`: `Name,Email,Login ID,Temporary Password`). When all created accounts share one password, the panel prints it on screen.
- Accounts created by the mentor-map upload always get the shared password. They are not shown anywhere.

**First sign-in.** `must_change_password` is `true`, so `RequirePasswordChange` sends the user to `/change-password` until they set a new password (§4.2). Seeded demo accounts are created with `must_change_password = false`.

**Rules:**

- An e-mail that already exists is **skipped, never updated**. The roster checks `user_profiles.email` in pages of 1,000. The HOD modal does an `ilike` lookup. In the roster import, Auth errors matching "already been registered", "already exists" or "duplicate key" also count as skipped. In the HOD modal every Auth error is reported as failed, and in the mentor-map path it goes to `mentor_errors`. Re-uploading a roster is therefore safe, but it cannot correct existing accounts' data.
- A duplicate `login_id` (registration number or staff id) fails the row, because `user_profiles` has a unique index on `lower(login_id)`.

**Deactivation.**

- `user_profiles.is_active = false` blocks sign-in in the UI and every API request. RPCs that check it, such as `create_support_query` and `request_counselling`, also refuse.
- There is **no UI or endpoint that deactivates an account**. `is_active` is a protected column: only the HOD (by a direct table update; the guard exempts the HOD) or SQL can change it.
- Deactivation does not revoke an existing session (§8.9).

**Known issues:**

- A shared password with a public fallback.
- `must_change_password` can be cleared by the user with a direct table update. The page does this legitimately, but so can anyone (§8.9).
- `send_invite_email` is ignored.
- Failures while creating mentor accounts during a mentor-map upload (`mentor_errors`) are returned but never displayed.

### 4.2 Sign-in, sessions, password change and reset

**Status:** Implemented.

**Where:** `pages/auth/LoginPage.jsx`, `pages/auth/ChangePasswordPage.jsx`, `context/AuthProvider.jsx`, `lib/supabaseClient.js`, `routes/RouteGuards.jsx`.

**Sign-in (`/login`).** The user enters the university e-mail (there is no domain check on this page) and a password with a show/hide toggle.

1. `signInWithPassword({email: email.trim().toLowerCase(), password})`.
2. Load `user_profiles` (`select('*')`), then separately the mentor (`id, full_name, email, phone, login_id`).
3. If `is_active` is false: sign out again and show "This account has been deactivated. Please contact your HOD."
4. Fire-and-forget `update({last_login_at})`.
5. Toast "Welcome back, <name>." and navigate to `HOME_PATH[role]`: `/student`, `/faculty`, `/hod` or `/cluster-head`.

An already signed-in visitor is redirected to `location.state.from` or their home. A bad password gives "Incorrect email or password." (via `describeError`).

**Sessions:**

- Supabase JS client options: `persistSession` (localStorage key `ssmp.auth.session`), `autoRefreshToken`, `detectSessionInUrl`, `flowType: 'pkce'`, and the header `x-application-name: ssmp-portal`.
- Access tokens last 3,600 s and are refreshed silently. Refresh-token rotation is on.
- `config.toml` sets `[auth.sessions] inactivity_timeout = "720h"` (30 days). A hosted project must set the same value in its dashboard (§12.3).

**Password change (`/change-password`).** This route is wrapped in `RequireAuth` only.

- The new password must be at least 10 characters and contain an uppercase letter, a lowercase letter, a digit and a symbol. A live checklist shows progress, and the button is disabled until all rules pass and both fields match ("The two passwords do not match.").
- These rules are **client-side only**. `config.toml` sets no server password policy, although a page comment claims it mirrors one.
- On submit:
  1. `auth.updateUser({password})`.
  2. `user_profiles.update({must_change_password: false})`. Its error is not checked.
  3. Reload the profile, toast "Password updated.", go home.
- The page title is "Set your password" while `must_change_password` is true, otherwise "Change password". There is a "Sign out instead" link.

**Forgot password.**

- On the login page, an empty e-mail field gives "Enter your university email first, then choose "Forgot password"."
- Otherwise the page calls `resetPasswordForEmail(email, {redirectTo: <origin>/reset-password})` and toasts "If that email exists, a reset link is on its way."
- `/reset-password` renders the same `ChangePasswordPage` with **no guard**. It relies on the recovery session that `detectSessionInUrl` creates from the link.
- Because the flow is PKCE, **the link only works in the browser that requested it**. Without a session, `updateUser` fails with an error toast.
- The Supabase project's Site URL and redirect list must include `/reset-password` (§12.3).

**Known issues:**

- `is_active` is checked only at sign-in, not on session restore.
- If the profile fails to load after a successful sign-in, the user sees "Welcome back, there." and lands back on `/login` with a live session.

### 4.3 Student onboarding: Form A and profile photo

**Status:** Implemented.

**Where:**

- UI: `pages/student/StudentOnboardingFormPage.jsx`, `pages/student/StudentProfilePhotoPage.jsx`, `components/student/FormAFields.jsx`, `components/ui/ProfilePhotoUploader.jsx`, `routes/RouteGuards.jsx` (`RequireOnboarding`), `pages/student/StudentProfilePage.jsx` (later edits).
- SQL: `submit_student_form_a`; table `student_form_a_profiles`.

**Gate.** Every student route except `/student/onboarding` and `/student/profile-photo` is wrapped in `RequireOnboarding`, which checks two `user_profiles` columns in order:

1. `form_a_completed` false → redirect to `/student/onboarding`.
2. `form_a_completed` true and `avatar_url` empty → redirect to `/student/profile-photo`.

Both onboarding pages render **without** the portal shell: no sidebar, no bell. A student who has completed Form A and opens `/student/onboarding` is sent to `/student/profile`.

**Form A fields** (`useFormAState` / `FormAFields`):

- Each field maps to the same-named column of `student_form_a_profiles`. `*` marks a field the client requires.
- The form is pre-filled from the profile when no record exists: name, `registration_no` ← `login_id`, e-mail, branch, section, `mobile_no` ← `phone`.

| Group | Fields |
|---|---|
| Student | `full_name`\*, `registration_no`\*, `roll_no`, `section`, `branch`, `mobile_no`\* (10 digits), `email`\*, `date_of_birth` (must be in the past), `blood_group` (A+ … O-), `is_day_scholar`, `hostel_block`\* (unless day scholar), `room_no` |
| Alumni | `has_muj_alumni_in_family` (Yes/No) → `alumni_name`\* when Yes; also `alumni_branch`, `alumni_batch`, `alumni_institution`, `alumni_relationship` |
| Father / Mother | `father_name`\*, `mother_name`\*, and for each parent: `_occupation` (enum `parent_occupation`), `_organization`, `_designation`, `_mobile` (10 digits if given), `_email` (valid if given) |
| Address | `communication_address`\*, `communication_pin_code`\* (6 digits), `permanent_same_as_communication`; `permanent_address`\* and `permanent_pin_code`\* unless "same" is ticked |
| Files (optional) | Parent business card and student signature. They go to bucket `form-a-uploads` at `<uid>/parent-business-card-…` and `<uid>/student-signature-…`, at most 5 MB, PNG/JPG/WEBP/PDF, uploaded as soon as they are chosen. |

**Validation and submit:**

- Client messages include "Your full name is required.", "Enter a 10-digit mobile number.", "Enter a valid email address.", "Enter a 6-digit pin code.", "Hostel block is required (or tick "I am a day scholar")." and "Date of birth must be in the past."
- On failure: toast "Please fix the highlighted fields before saving." and scroll to the first invalid field.
- On submit:
  1. A confirmation dialog: "Submit Form A?"
  2. `rpc('submit_student_form_a', {p_payload})`.
  3. Toast "Form A submitted. Welcome to the portal!", reload the profile, go to `/student/profile-photo`.

**What `submit_student_form_a` does** (SECURITY DEFINER):

- Checks: "Not authenticated"; "Only students fill Form A". It does not check `is_active`.
- Upserts on `student_id`:
  - trims text and lower-cases e-mails;
  - turns blank optional fields into NULL and casts the occupation enums;
  - keeps stored file paths when a blank path is sent (`coalesce`).
- Sets `is_submitted = true`, keeps the first `submitted_at`, and resets `is_locked = false` and `unlock_requested = false`.
- Then, under the trusted-operation flag, sets `user_profiles.form_a_completed = true`, `form_a_completed_at` (first time only), and copies `phone`, `section` and `branch` from the payload when they are non-blank.

**Server-side format rules** are CHECK constraints:

- 10-digit mobiles, 6-digit PIN codes;
- e-mail shape for the student and both parents;
- the blood-group list;
- hostel block unless day scholar;
- alumni name when Yes;
- DOB after 1950-01-01 and before today.

A violation surfaces as the generic "Some of the values entered are not valid. Please review the highlighted fields."

**Editing later.**

- My Profile shows Form A read-only until "Edit my details". Saving calls the same RPC and toasts "Your Form A record has been updated."
- Nothing is locked: the `form_a_update_own` policy ignores `is_locked`, and the RPC clears it on every save.
- `unlock_student_form_a` and `request_form_a_unlock` exist but are **Dead**: nothing calls them.
- Saving Form A overwrites `user_profiles.phone` with the Form A mobile number. Editing the contact phone does not update Form A.

**Profile photo (`/student/profile-photo`).**

- `ProfilePhotoUploader` checks the file on the client: at most 3 MB ("The photo must be 3 MB or smaller."), PNG/JPEG/WEBP ("Use a PNG, JPG or WEBP image.").
- It uploads to `profile-photos/<uid>/avatar-<slug>-<ts>.<ext>`, sets `user_profiles.avatar_url` to that path, and removes the previous object best-effort. Toast: "Profile photo updated." Then it navigates to `/student`.
- A student cannot replace the photo later: their profile page shows it read-only ("Contact the HOD office if it needs to be replaced.").
- Faculty, HOD and cluster-head profile pages have **no** photo control.

**Known issues:**

- The "locked" photo and the non-Form-A profile fields are locked only in the UI. RLS lets a student update their own `avatar_url`, `full_name`, `login_id`, `section`, `semester_label` and `department` directly (§8.9).
- Replaced Form A files are never deleted from storage.

### 4.4 Queries: raising, conversation, resolution, confirmation, rating

**Status:** Implemented. Known issues are listed at the end.

**Where:**

- UI:
  - `components/queries/*`;
  - `hooks/useRealtimeQueries.js`;
  - student: `pages/student/StudentQueriesPage.jsx`, `pages/student/StudentQueryDetailPage.jsx`, `pages/student/StudentDashboardPage.jsx`;
  - faculty (and HOD with `isHodView`): `pages/faculty/FacultyQueryQueuePage.jsx`, `pages/faculty/FacultyQueryDetailPage.jsx`.
- SQL: `create_support_query`, `post_query_message`, `resolve_support_query`, `confirm_query_resolution`, `rate_support_query`, `set_query_in_progress`, `escalate_query_to_hod`, `max_resolution_rejections`, `assign_query_code`, `can_access_query`, and the notification triggers.
- Tables: `support_queries`, `query_messages`, `canned_replies`.

**Model.**

- A query belongs to one student (`student_id`) and is assigned, **at creation**, to that student's current mentor (`mentor_id`).
- `query_code` is `AN-<n>` from `query_code_seq`, starting at 1001 and set by trigger.
- Three columns describe its state:

| Column | Values |
|---|---|
| `status` | `Open`, `In Progress`, `Resolved` |
| `resolution_status` | `none`, `pending_confirmation`, `confirmed`, `reopened` |
| `priority` | `Low`, `Medium`, `High`, `Urgent` |

- Other columns record the timeline and outcome: `first_response_at`, `resolved_at`, `resolved_by`, `reopen_count`, `student_confirmation` / `student_confirmation_at` / `student_confirmation_comment`, `satisfaction_rating`, the `escalated_*` columns, `mom_id` (set for CR-report items), `last_message_at`.
- Messages are rows of `query_messages`. `is_system_message` marks system messages (these never trigger the new-reply notification).

**Categories.** The enum `query_category` holds eight values:

| Values | Status |
|---|---|
| `Academics`, `Examination`, `Behavioural`, `Administrative`, `Others` | Offered by the UI (`QUERY_CATEGORIES`) since 0026 |
| `Academic`, `ERP/Tech`, `Infrastructure` | Legacy. Still valid in the database, and **still the only categories several counters and charts count** (see Known issues). |

**State machine:**

```
                 create_support_query
                        │
                        ▼
                     Open ──(first reply by mentor/HOD: post_query_message)──► In Progress
                        │                                                           │
                        └──────────────(resolve_support_query: mentor or HOD)───────┤
                                                                                    ▼
                                                        Resolved + pending_confirmation
                                          student "Yes" │                         │ student "No" (reopen_count < 3)
                                                        ▼                         ▼
                                           Resolved + confirmed        In Progress + reopened
                                           (closed; composer hidden)   (reopen_count+1, resolved_at cleared)
                                                                                  │
                                                                                  └─(resolve again)─► Resolved + pending_confirmation
  CR-report items may also be set explicitly:  set_query_in_progress → In Progress + none
```

**Raising a query** (student; `CreateQueryModal`, opened from the dashboard or My Queries):

- **Input:**
  - Category: one of the five current categories, default Academics.
  - Subject: at least 5 characters on the client, at most 200.
  - Description: required, at most 5,000.
  - Priority is not asked; `'Medium'` is always sent.
- **Processing:** `create_support_query` requires:
  - an authenticated student ("Only students can raise support queries");
  - an active account ("This account is deactivated");
  - a mentor ("No faculty mentor assigned. Please contact the HOD.");
  - non-blank subject and description;
  - the length limits above;
  - **fewer than 20 queries with status ≠ Resolved** ("You already have 20 unresolved queries. Please close some before raising another.").

  It inserts the query and the description as the first message.
- **Output:** toast "Query raised. Your mentor has been notified." The mentor receives `query_created` ("New <category> query from <name>") and `query_message` notifications.

**Lists.** `useRealtimeQueries({status, category, search, pageSize = 25})` runs:

```
supabase.from('support_queries')
  .select('*, student:student_id(id, full_name, email, login_id, section, branch, semester_label),
              mentor:mentor_id(id, full_name, email, login_id)', {count: 'exact'})
  .order('last_message_at', {ascending: false})
  .range(...)
```

- Optional `.eq('status')` and `.eq('category')` filters.
- The top-bar search (debounced 320 ms) becomes `.or('subject.ilike.%t%,query_code.ilike.%t%')`, with `%` and `,` stripped.
- **RLS decides the scope:** own queries for a student, `mentor_id = me` for faculty, everything for the HOD.
- The list re-runs on any `support_queries` change (channel `queries-stream`).
- The category filter offers only the five current categories. Legacy-category queries appear only under "All".

| Page | Columns |
|---|---|
| Student list | Ref, Subject, Category, Priority, Status + resolution badge, Last update |
| Faculty queue | Ref, Subject, Student, Category, Priority, Status, **Raise to HOD**, Last update |
| HOD queue ("All queries") | Adds Mentor; drops Raise to HOD |

**Conversation** (`QueryConversation`, `useQueryThread`):

- Loads the query plus `query_messages` with `sender:sender_id(id, full_name, role, avatar_url)`, live on channel `query-<id>`.
- Composer: at most 5,000 characters with a counter. Ctrl/Cmd+Enter sends. The draft is restored if sending fails.
- `post_query_message` checks participant-or-HOD ("Unauthorized to post on this query") and a non-empty message. The first faculty or HOD message sets `first_response_at`, and a staff message on an `Open` query moves it to `In Progress`.
- The composer is hidden once `resolution_status = 'confirmed'`. That is UI only; the RPC still accepts messages *(tested)*.
- Faculty and HOD get **Quick replies**: chips from `canned_replies` that append text to the draft.
  - No migration creates any. The four global replies ("Acknowledged", "Need more detail", "Escalated to IT", "Meet in person") are inserted only by the seeds (`supabase/seed.sql` and `npm run db:seed`), so an unseeded production project has none unless someone adds them.
  - There is no UI to create or edit them. RLS would allow a faculty member to manage their own.

**Resolving** (mentor or HOD; `FacultyQueryDetailPage` "Mark resolved", shown while not resolved or when reopened):

- A confirmation dialog, then `resolve_support_query(p_query_id, p_note)`.
- Checks: "Only the assigned mentor or the HOD can resolve this query"; "This query is already closed and confirmed".
- Sets `Resolved` + `pending_confirmation`, `resolved_by`, `resolved_at`, and adds a system message ("Marked as resolved by <name>. Awaiting student confirmation.", or the note).
- The student is notified `query_resolution_pending` ("Was your issue fixed?").

**Confirming** (student; `ResolutionConfirmation`, visible while `pending_confirmation`):

- **"Yes, it is fixed"** takes an optional comment (at most 1,000 characters).
  - Result: `confirmed` and a system message "Student confirmed the issue is resolved. Query closed."
  - The mentor gets `query_confirmed`. Toast: "Thank you — this query is now closed."
- **"No, still an issue"** requires a comment in the UI. The server does not require one.
  - Result: `reopened`, `In Progress`, `reopen_count + 1`, `resolved_at` cleared, and a system message "Student reported the issue is NOT resolved (rejection n of 3)… Comment: …".
  - The mentor gets `query_reopened`.
- **Reopen cap:** `max_resolution_rejections()` = 3.
  - At the cap the "No" button disappears, and the UI says "You have already reopened this query 3 times, which is the maximum…".
  - The server refuses with a similar message.
- Other server checks: "Only the student who raised this query can confirm its resolution"; "This query is not awaiting your confirmation".

**Rating** (student; `SatisfactionRating`, visible whenever `status = Resolved`):

- `rate_support_query(p_query_id, p_rating 1–5)`, once only ("This query has already been rated"). The mentor gets `query_rated` ("Query <code> rated n/5").
- A student can rate **before** confirming, because resolving sets `Resolved` immediately. The rating stays if the query is later reopened *(tested)*.

**Priority** (mentor or HOD, detail page): a direct `update({priority})` under the `queries_update_mentor` or `queries_update_hod` RLS policy. Toast: "Priority set to <p>."

**Detail pages show:**

- **Student view:** mentor, raised on, last update, resolved on, times reopened.
- **Faculty/HOD view:**
  - the student's identity;
  - priority, first response and time to first response, resolved on, reopen count, rating;
  - banners for reopened, 3+ rejections, referred to HOD, and awaiting confirmation.

**Known issues:**

- **Legacy categories in counters.** Several category counters and charts count only `Academic`, `ERP/Tech` and `Infrastructure`, so queries in the current categories are invisible in them:
  - JS: `StudentDashboardPage.jsx:34-40`, `FacultyDashboardPage.jsx:36-41`, `HodDashboardPage.jsx:63-65`, `FacultyMenteeDetailPage.jsx:126-130`, and `report-document-builder.js:279, 462-464, 638`;
  - SQL: `get_dashboard_metrics`, `get_student_dossier`, and the views `faculty_performance_summary`, `student_query_summary` and `query_daily_trend`.

  The student group page uses the new categories but has only 3 colours for 5 bars. The `by_category` sections of the activity and department reports are dynamic and correct.
- **Query ownership after a mentor change.** `mentor_id` is fixed at creation.
  - Only the HOD reassignment endpoint moves **unresolved** queries (§4.19).
  - A mentor change made by a **mentor-map upload** moves no queries, so the old mentor keeps them.
  - Students cannot read a former mentor's profile, so such messages show "Unknown".
- The student's confirmation banner counts only the 5 most recent queries.
- The composer is hidden, but posting is not blocked, after confirmation.
- **`set_query_in_progress` accepts any query**, not only CR items. Called on a query awaiting confirmation, it moves it back to In Progress without a student decision and without counting a reopen.
- **Every new query notifies the mentor twice**: `query_created` from the query, and `query_message` ("New reply from <student>") from its first message, which is not a system message.
- The RLS `UPDATE` policies let the mentor and the HOD change **any column** of their queries directly. That includes `status`, which bypasses the RPC rules (§8.9).

### 4.5 Raise to HOD, and the mentor's department and HOD

**Status:** Implemented.

**Where:**

- UI: `FacultyQueryQueuePage.jsx` (the "Raise to HOD" column), `FacultyQueryDetailPage.jsx`, `FacultyMenteesPage.jsx` ("Department & HOD").
- SQL: `escalate_query_to_hod`, `set_mentor_department_and_hod` (0030/0031); `user_profiles.hod_email`.

**Setting the department and HOD** (mentor, from My Mentees):

- The modal calls `set_mentor_department_and_hod(p_department, p_hod_email)`.
- Checks:
  - "Only a faculty mentor can set this";
  - "Enter a department" (at most 120 characters);
  - "Enter your HOD's email address";
  - the e-mail must belong to an **active HOD account** ("No active HOD account has the email …").
- Effect:
  - sets the mentor's `department` and `hod_email` (stored as that HOD's own e-mail);
  - sets `department` on **all** of the mentor's mentees whose value differs;
  - returns the number of rows changed. Toast: "Saved. N mentee(s) updated."

**Raising a query** (mentor; the HOD may also call the RPC):

1. **Input.** A "Raise" button on each not-yet-escalated row of the queue, or on the detail page. Both open a modal with an optional note (at most 1,000 characters).
2. **Processing.** `escalate_query_to_hod(p_query_id, p_note)`:
   - checks "Query not found"; the caller is the query's mentor or the HOD ("Only the assigned mentor can refer this query to the HOD"); not already escalated ("This query has already been referred to the HOD"); and the note length;
   - there is **no** status or reopen-count condition (the old "after 3 rejections" gate was removed in 0030);
   - sets `escalated_to_hod`, `escalated_at`, `escalated_by` and `escalation_note`, bumps `last_message_at`, and adds the system message "<mentor> referred this query to the HOD.", followed by " Note: <note>" when a note was given.
3. **Routing.** It notifies (`query_escalated`, link `/hod/queries/<id>`) the **active HOD whose e-mail matches the caller's `hod_email`**, compared case-insensitively. The caller is normally the query's mentor. If none matches (not set, or that HOD is inactive or missing), it notifies **every active HOD** (except the caller, since `enqueue_notification` skips the actor).
4. **Output.** The student is always notified ("<code> has been referred to the HOD", link `/student/queries/<id>`). The queue row shows "Sent". Toasts: "<code> sent to your HOD." (queue) or "Referred to the HOD. The student has been told too." (detail).

**HOD side.** Referred queries appear in `/hod/queries` like any other query. There is **no escalated filter or column**; the referral is visible on the detail page banner and in the notification.

**Known issues:**

- The hints in both modals say "The student is told the query was referred, but is not shown this note." **It is shown.** The note is part of the system message, which the student reads.
- A query can be referred in any status, including closed.
- **When the HOD calls the RPC**, the HOD's own profile is used: the mentor's `hod_email` is ignored, the fallback notifies every active HOD except the caller (so with a single HOD nobody is notified), and the system message names the HOD as the referrer.

### 4.6 Star mentee (student representative)

**Status:** Implemented.

**Where:**

- SQL: `set_star_mentee`, `notify_on_star_mentee_change`, `get_mentor_group_queries`, `get_mentor_group_survey_status`, `submit_mom_report`.
- UI: `FacultyMenteesPage` (star toggle), `FacultyMenteeDetailPage`, `StudentGroupQueriesPage`, `StudentSurveyTrackingPage`, `StudentCrReportPage`, and `NAVIGATION.student` (items with `when: is_star_mentee`).

**Setting the star.**

- The mentor (or HOD) calls `set_star_mentee(p_student_id, p_is_star)`, with a confirmation dialog on My Mentees.
- The function locks the mentor's row, clears any other star in that mentor's group, and sets the flag under the trusted-operation flag. **At most one star per mentor**, as far as this function is concerned. There is no unique index, and un-starring leaves the group with none.
- The student gets `star_mentee_assigned` (link `/student/group-queries`).
- Toasts: "<name> is now your student representative." / "<name> is no longer the student representative."

**What the star unlocks.** Three sidebar items appear only when `profile.is_star_mentee`. Each page also redirects non-stars to `/student`, and each RPC refuses them:

- **Group Queries** (`/student/group-queries`):
  - `get_mentor_group_queries()` returns every query of the mentor's group, most recently active first (`last_message_at`), with a narrow projection: `query_code, subject, category, priority, status, resolution_status, created_at, last_message_at, student_name, section, is_mine`. No ids, message text, e-mails or registration numbers.
  - The page shows client-side KPIs (total, open, in progress, resolved), a category bar, a status donut and a filterable table. Rows have no links.
  - Errors: "Not permitted" / "Only the student representative can view the group query list".
- **Survey Tracking** (§4.15).
- **CR Report** (§4.7).

**Known issue.** Neither `reassign_mentees` nor a mentor-map upload (`map_students_to_mentors`) clears `is_star_mentee`. After a mentor change the target group can have two representatives.

### 4.7 CR reports (class-representative meeting minutes)

**Status:** Implemented.

**Where:**

- UI: `pages/student/StudentCrReportPage.jsx`, `pages/faculty/FacultyCrReportsPage.jsx` (also `/hod/cr-reports`).
- SQL: `submit_mom_report`, `set_query_in_progress`, `resolve_support_query`, `notify_on_query_created` (skips items); table `mom_records`, and `support_queries.mom_id`.

**Design.** A report is one `mom_records` row: the meeting. Each raised issue ("action item") is **a normal query** authored by the representative, linked by `mom_id`, so items get the whole query workflow (conversation, confirmation, rating).

**Filing** (star mentee):

- **Section A, the meeting:** date (default today, no future dates), students present and students in the group (digits), general discussion (required, at most 5,000).
- **Section B, issues:** repeatable blocks with Issue title (at most 200), Category (current categories) and Description (at most 5,000). Blank blocks are ignored; a half-filled block is an error ("Give this issue a title." / "Describe the issue.").
- **Call:** `rpc('submit_mom_report', {p_meeting_date, p_notes, p_items: [{title, category, description}], p_students_present, p_students_total})`.
- **Server checks:**
  - must be a student, the star mentee, and have a mentor;
  - notes non-blank;
  - at most **12** items ("File at most 12 action items per meeting");
  - each item needs a title and a description; a missing category becomes `Others`;
  - CHECK constraints: meeting date not in the future, present ≤ total.
- **Effect:**
  - inserts the report;
  - creates one `support_queries` row (with `mom_id`) and a first message per item;
  - sends the mentor one summary notification: "CR report from <rep> — n item(s) to action", link `/faculty/cr-reports`. The per-item "new query" notification is skipped for `mom_id` rows, **but each item's first message still triggers a `query_message`** ("New reply from <rep>"). The mentor therefore receives 1 + n notifications.
- **Toast:** "Report filed. n item(s) sent to your mentor." (singular or plural)

**After filing (student).**

- KPIs: Reports filed, Issues raised, Still open, Waiting on you (items pending confirmation).
- A panel per meeting with its notes and items. Item links are plain `<a href>` links, which reload the page.
- A filed report cannot be edited: `mom_records` has only a SELECT policy, so it is append-only.

**Acting on items** (mentor, or HOD at `/hod/cr-reports`):

- The page loads the last 20 reports plus all `support_queries` with a `mom_id`, grouped by report. KPIs: Reports, Issues raised, Needing action, Reopened.
- Each item has "Update status":
  - **In Progress** calls `set_query_in_progress`, which sets `In Progress` + `none` and `first_response_at` if empty, and adds the system message "Picked up — marked as In Progress."
  - **Resolved** requires remarks ("Add the resolution remarks before marking this resolved.") and calls `resolve_support_query` with the remarks as the system message.
- The representative then confirms or reopens the item like any query.

**Rules and edge cases:**

- `submit_mom_report` does not check the 20-unresolved cap, **but the items count toward it afterwards**: they are the representative's own unresolved queries. Filing a large report can therefore block the representative from raising normal queries until items are resolved *(tested)*. The items also appear in the representative's own My Queries and dashboard.
- The client has no 12-item cap, although the hint mentions one; the server enforces it.
- `mom_records.mentor_id` is not updated on reassignment.

### 4.8 Counselling

**Status:** Implemented.

**Where:**

- UI: `pages/student/StudentCounsellingPage.jsx`, `pages/faculty/FacultyCounsellingPage.jsx`.
- SQL: `request_counselling`, `respond_to_counselling`, `notify_on_counselling_request`; table `counselling_requests` (0029).

**Privacy.** Only the student and **their assigned mentor** can read a request. RLS has **no HOD policy**, and there is no HOD route (`/faculty/counselling` is faculty-only). The page's promise "This goes only to them." is accurate.

**Student flow:**

- The form is shown only when a mentor is assigned; otherwise "No mentor assigned yet".
- A concern of at most 3,000 characters ("Write down what you would like to talk about." if blank) is sent with `request_counselling(p_concern)`.
- The server checks: an active student with a mentor, non-blank text, and at most 3,000 characters. It enforces a **cap of 5 requests with status ≠ closed** ("You already have 5 open counselling requests. Your mentor has been notified — please wait for them to reach out.").
- The mentor gets `counselling_request` ("<name> has asked to talk", link `/faculty/counselling`). Toast: "Sent to <mentor>."

**Mentor flow:**

- **List:** `counselling_requests` with the student embedded, newest first.
- **Filters:** "Needs a reply" (status ≠ closed), Everyone, Closed.
- **KPIs:** Waiting on you (open), In conversation (acknowledged), Closed, Students.
- **Reply modal** (at most 3,000 characters) calls `respond_to_counselling(p_request_id, p_note, p_close)`:
  - checks "Request not found", "Only the assigned mentor can respond to this request", and the length;
  - sets `mentor_note` and `responded_at`, and status `closed` (when "Reply and close") or `acknowledged`;
  - when `mentor_note` changes, the student is notified "Your mentor has replied".
- Toasts: "Reply sent to the student." / "Replied and closed."

**Statuses:**

| Status | Student label | Mentor label |
|---|---|---|
| `open` | Sent | Needs a reply |
| `acknowledged` | Mentor replied | In conversation |
| `closed` | Closed | Closed |

**Edge cases:**

- `mentor_note` is **overwritten** by each reply: there is no thread.
- The student sees the latest note labelled with their *current* mentor's name.
- No realtime (the table is not in the publication).
- Requests stay with the mentor who received them. A reassignment does not move them.
- The policy `counselling_update_mentor` lets the mentor update **any column** of their requests directly, including the student's `concern` text.
- `respond_to_counselling` without "close" sets `acknowledged` from any state, so replying to a closed request reopens it.

### 4.9 Academics (student side): GPA and attendance

**Status:** Implemented. There is one security gap.

**Where:**

- UI: `pages/student/StudentAcademicsPage.jsx`.
- SQL: `upsert_semester_gpa`, `can_view_student_gpa`, `set_gpa_sharing` (dead).
- Tables and views: `student_semester_gpas`, `student_cgpas`, `student_attendance_overview`.

**What the student sees:**

- **KPIs:**
  - "CGPA": the **official CGPA** from the department's CGPA / GPA & Credits upload (§4.12), captioned "Published by the department · n credits earned". Until one is uploaded the card is "CGPA so far": the **unweighted mean** of the recorded semester GPAs (2 dp), captioned "n of 8 semesters";
  - highest and lowest semester;
  - "Overall attendance": the mean of the per-course latest percentages (2 dp), red below 75.
- **Attendance table** from `student_attendance_overview`, which holds the latest period per course. Columns: Course code, Course name, Section, Attendance (red below 75%), Period. Empty state: "No attendance published yet".
- **GPA trend chart**, 0–10.
- **Per-semester GPA editor** for semesters 1–8.

**Self-entry of GPA:**

- **Input:** a value from 0 to 10, step 0.01 ("GPA must be a number between 0 and 10.").
- **Processing:** `upsert_semester_gpa(p_semester_number, p_gpa)`:
  - checks "Only a student can record their own GPA", "Semester must be between 1 and 8" and "GPA must be between 0 and 10";
  - refuses when the department has published that semester ("Semester n GPA was published by the department and cannot be edited here");
  - rounds to 2 dp and saves with `source = 'student'`.
- **Output:** toast "Semester n GPA saved."
- **Department rows:** rows with `source = 'cluster_head'` are shown read-only, with "Published by the department".
- **No clearing:** the UI cannot clear a semester once saved.

**Not shown to students:** backlogs, and anything about their own at-risk status. No student page reads `student_backlogs`, `student_risk_flags` or meetings.

**GPA sharing.**

- `student_form_a_profiles.gpa_sharing_enabled` (default `true`) still gates the **mentor's** read of GPAs through `can_view_student_gpa`, which returns:
  - `true` for the student themself and for the HOD;
  - for the mentor, `coalesce(gpa_sharing_enabled, true)`.
- The **toggle was removed from the UI**, so sharing stays on unless it is changed outside the UI. Two routes remain: `set_gpa_sharing(false)` is still executable by any student through the API, and a student can update `gpa_sharing_enabled` on their own Form A row directly *(tested)*. Nothing in the code calls `set_gpa_sharing`.

**Known issues:**

- The RLS policies `gpas_insert_own`, `gpas_update_own` and `gpas_delete_own` ignore `source`. A student can therefore directly (through PostgREST) change or delete a department-published GPA, or insert a row claiming `source = 'cluster_head'` *(tested)*. The page comment "the database refuses it (see upsert_semester_gpa)" is true only of the RPC. See §8.9.
- A self-entered GPA does not trigger a risk re-evaluation. It is picked up at the next upload or sweep.

### 4.10 Achievements

**Status:** Implemented.

**Where:**

- UI: `pages/student/StudentAchievementsPage.jsx` (student), `pages/faculty/FacultyMenteeDetailPage.jsx` (verification).
- SQL: `set_achievement_verification`, `notify_on_achievement_verified`; table `student_achievements`; bucket `achievement-proofs`.

**Student.**

- **Fields:**
  - title: required, 3–200 characters ("Give the achievement a title of at least 3 characters.");
  - category: `achievement_category` = sports, cultural, technical, volunteering, certification, leadership or other; default technical;
  - `achieved_on`: a date, not in the future;
  - description: at most 2,000;
  - proof file: optional; PNG/JPG/WEBP/PDF; at most 5 MB; uploaded immediately to `achievement-proofs/<uid>/proof-…`.
- **Writes:** direct table `insert` / `update` / `delete` under RLS. Toasts: "Achievement added.", "Achievement updated.", "Achievement removed."
- **Page extras:** filter pills, a category donut, and "x of n verified by your mentor". "View proof" opens a 300 s signed URL.

**Mentor or HOD.** On the mentee detail page, "Verify" toggles `set_achievement_verification(p_achievement_id, p_verified)`.

- Check: "Only the assigned mentor or the HOD can verify this achievement".
- When the flag changes from false to true, the student gets `achievement_verified`.
- Toasts: "Achievement verified." / "Verification removed."

**Rule.** A **verified entry is locked for the student.** The UI hides Edit and Delete ("Verified entries are locked. Ask your mentor if a change is needed."), and RLS enforces it: update and delete require `verified_by_faculty = false`, and inserts must have `false`. The page's header comment saying verification "never hides or blocks anything" is wrong.

**Edge case.** Replaced or deleted proof files are never removed from storage.

### 4.11 Cluster head setup and subjects

**Status:** Implemented. There is one data-loss trap.

**Where:**

- UI: `pages/clusterHead/ClusterHeadSetupPage.jsx` (`/cluster-head/setup`, no shell), `pages/clusterHead/ClusterHeadCoursesPage.jsx` ("My Subjects"), `routes/RouteGuards.jsx` (`RequireClusterHeadSetup`).
- SQL: `submit_cluster_head_setup`; table `cluster_head_courses`.

**Gate.**

- Every cluster-head route except `/cluster-head/setup` is wrapped in `RequireClusterHeadSetup`, which redirects to the setup page until `user_profiles.cluster_head_setup_completed` is true.
- The **academic upload endpoint enforces the same flag** for cluster heads: 403 "Complete the cluster head setup form before uploading data.". The HOD is exempt.
- The **roster import endpoint does not** check it.

**Setup and My Subjects** (same RPC, same rules):

- **Input:** blocks of *Course name* (a select of 27 `COURSE_CATALOGUE` entries including "Other", with a free-text name when Other) and *Course code* (at most 40). The form starts with 5 blank blocks (`CLUSTER_HEAD_DEFAULT_SUBJECT_ROWS`), or pre-fills the saved list. Blank blocks are ignored.
- **Client validation:**
  - "Add at least one subject before continuing." (setup) or "Keep at least one subject." (My Subjects);
  - "Pick or type a course name";
  - "Course code is required";
  - "This course code is already used above" (case-insensitive).
- **Processing:** `submit_cluster_head_setup(p_courses)`.
  - **Checks:**
    - caller is a cluster head: "Only a cluster head can submit the cluster head setup form";
    - at least one subject: "Add at least one subject before submitting";
    - at most 60: "That is more subjects than one cluster head can handle (limit 60)";
    - name and code non-blank: "Every subject needs both a course name and a course code";
    - no duplicate codes: 'Course code "%" appears more than once'.
  - **Writes:**
    1. Delete the caller's courses whose `lower(course_code)` is not in the new list.
    2. Insert the rest, `ON CONFLICT (cluster_head_id, lower(course_code))`, updating name, `display_order` and `updated_at`.
    3. Under the trusted-operation flag, set `cluster_head_setup_completed = true` and `cluster_head_setup_completed_at` (first time).
- **Output:**
  - Setup: toast "Setup saved. Your portal is ready." and navigate to `/cluster-head`.
  - My Subjects: "Subjects updated."

**Known issues:**

- **Changing a course code in place is a delete plus an insert.** `student_attendance_records.course_id` and `student_course_sections.course_id` are `ON DELETE CASCADE`, so **that subject's whole attendance history is deleted**. `academic_upload_batches.course_id` is `SET NULL`. No risk re-evaluation follows.
  - The page's subtitle ("correct a code rather than deleting and re-adding it") suggests the opposite.
  - A case-only change to a code is silently not saved: the conflict key is case-insensitive, and the stored code is never updated.
- The RLS policy `ch_courses_write_own` (FOR ALL) also lets a cluster head write their `cluster_head_courses` rows directly, bypassing the RPC's validation.
- The setup route stays reachable after setup, and re-submitting replaces the list.

### 4.12 Academic data uploads: attendance, GPA, backlogs, black dots

**Status:** Implemented. Known issues are listed at the end.

**Where:**

- UI: `pages/clusterHead/ClusterHeadAttendancePage.jsx`, `ClusterHeadGpaPage.jsx`, `ClusterHeadBacklogPage.jsx`, `ClusterHeadBlackDotPage.jsx`, and `components/clusterHead/AcademicUploadPanel.jsx`.
- API: `api/cluster-head/upload-academic-data.js`.
- Parsers: `api/_lib/spreadsheet-parser.js` and `api/_lib/table-readers.js` (formats in §10.4).
- SQL: `record_attendance_batch`, `record_gpa_batch`, `record_backlog_batch`, `record_black_dot_batch`, `resolve_student_ids`, `evaluate_student_risk`, and the helpers `try_numeric` and `is_blank_mark` (0035).
- Tables: `student_course_sections`, `student_attendance_records`, `student_semester_gpas`, `student_cgpas`, `student_backlogs`, `student_black_dots`, `academic_upload_batches`, `student_risk_flags`.

**Every upload takes the file exactly as its source produces it.** Attendance, GPA and backlogs are the ERP's own exports (HTML tables saved as `.xls`); black dots are the Proctorial Board's Word notice. Each may also be re-saved as `.xlsx` or `.csv` with the same layout. Nothing on the screens has to be chosen, except two optional backlog fallbacks.

**Students are matched on registration number only** (`user_profiles.login_id`), never on e-mail or roll number. An identifier containing `@` gets its own row error: "This is an email address. Rows are matched on registration number only".

**Common pipeline.**

- **UI.** The panel reads the file as base64 (there is no client-side size or type check; `accept` only filters the file picker). It posts to `/api/cluster-head/upload-academic-data`, then shows summary tiles (each page chooses its own) and a table headed "Rows that need attention" (Row, Registration no., Reason). For a Word notice, which has no row numbers, the Row column shows the case and S/No instead. Pages that read metadata from the file show it in a "Read from the file" panel.
- **Effective file-size limit.** zod caps `file_base64` at 8,000,000 characters, about 6 MB of file. Vercel's own request-body limit for functions is 4.5 MB (a platform limit, not in the code), so in practice files above roughly 3.3 MB are rejected with a 413 before the handler runs.
- **API steps, in order:**
  1. POST only.
  2. Body at most 10 MiB (413).
  3. Authenticate.
  4. Role `cluster_head` or `hod`.
  5. Rate limit: **30 uploads per 300 s** per user, across all five actions.
  6. zod validation.
  7. Setup gate (cluster heads).
  8. Decode base64.
  9. Parse.
  10. RPC **as the user**.
  11. Audit `cluster_head.upload_<action>`, with `{action, filename, total_rows, matched, failed, mentor_accounts_created}`, plus `semester` and `cleared` for backlogs and the case numbers for black dots.
  12. Respond with the RPC's JSON plus `file_meta`, what the parser read out of the file (semesters, exam, programme, subjects, cases).
- **In SQL, each RPC:**
  - allows `is_cluster_head() or is_hod()`, or no JWT (for scripts);
  - resolves all identifiers once with `resolve_student_ids`: **active students only, registration number only** (since 0035; it also refuses any other caller, closing S3);
  - inserts an `academic_upload_batches` row, and at the end writes its counts and `scope_label` (what the file covered, shown in Recent uploads);
  - loops over the rows, collecting per-row errors;
  - calls `evaluate_student_risk` for every distinct student it changed (not for black dots, which are not part of the rule);
  - returns `{batch_id, total_rows, matched, failed, row_errors, ...}` with upload-specific extras below.
- **Row numbers in errors.** GPA, backlog and black dot errors carry the spreadsheet's own line number (the parser sends `row`); black dot errors also carry `where` ("Case 034/Even Sem/2026 · S/No 2"). Attendance and the mentor map still report the row's 1-based position in the parsed list; for attendance, among de-duplicated students.
- **Transactions.** Each upload is **one transaction**. A per-row problem is reported and skipped. Values are validated before they are cast (`try_numeric`), so a stray word in a numeric cell is a row error; a constraint violation that slips past validation still **aborts the whole upload**. CHECK violations are rewritten by `describeError` into the generic "Some of the values entered are not valid. Please review the highlighted fields.", which is confusing on an upload page that has no highlighted fields.

**Attendance** (`action: 'attendance'`; body `{filename, file_base64}` only):

- **Input:** the ERP "Class Attendance" export, normally `.xls` (really an HTML table), or `.csv` or `.xlsx`.
  - The **header block** gives Course Code, Course Name, Section and From/To dates.
  - The **table** gives a registration number, an optional Section per row, Total Class, Present and %.
  - Accepted formats and aliases are in §10.4.
- **Processing:** `record_attendance_batch(p_course_code, p_course_name, p_section, p_period_start, p_period_end, p_filename, p_rows)`.
  - **Aborts the whole upload for:**
    - an unknown course: 'Course code "%" is not in your subject list. Add it under My Subjects, then upload this file again.' The match is case-insensitive against the caller's own subjects; a HOD matches any cluster head's.
    - reversed dates: "The From/To dates in the file header are missing or out of order". Missing dates never reach SQL: the parser substitutes today, so an undated file (or one with dates in another format) is recorded as a one-day period ending today;
    - constraint violations: attended ≤ held, held ≤ 2000, section label pattern `^[A-Za-z0-9][A-Za-z0-9 .-]{0,11}$`.
  - **Per-row errors:**
    - "The % column is missing or outside 0-100";
    - "No section on this row and none in the file header";
    - "No student matches this registration number".
  - **Writes:**
    - `student_course_sections`: upsert on `(student_id, course_id)`, replacing the section;
    - `student_attendance_records`: upsert on `(student_id, course_id, period_start)`, replacing the row. It stores the course code as saved in My Subjects, the file's course name, `round(%, 2)`, and the held and attended counts.
- **Output** adds `course_code, course_name, section, sections, period_start, period_end`. The page shows them in a "Read from the file" panel. The "Rows in file" tile counts de-duplicated students, not file lines.
- **Rules:**
  - The per-row Section column wins over the header's section.
  - A student listed twice is merged: counts are summed and % recomputed, or the two percentages are averaged when counts are missing.
  - A re-upload of the same period replaces it. A new From date adds a new period, and the overview shows the latest.

**GPA** (`action: 'gpa'`; body `{filename, file_base64}`; the API still accepts an optional `semester_number` fallback for a flat file, but the page no longer sends one):

- **Input:** the ERP "Student's CGPA / GPA & Credits" export. Its header is two rows built from rowspan/colspan: S. No., Registration No., Student Name, CGPA, Total Earned Credits, Total Required Credits, then a "Semester I", "Semester II" ... group per semester, each with GPA / Earned Credits / Req Credits underneath. The number of semester groups depends on the batch.
  - The semester of every GPA is read from the group heading above it (Roman or Arabic numerals). A GPA of "-" is a semester not graded yet and is left out, so the semester in progress never lands as a value.
  - Groups outside 1–8 are reported in `file_meta.ignored_semesters` and not sent.
  - A flat one-semester sheet (Registration No, GPA, Semester) is still accepted.
- **Processing:** `record_gpa_batch(p_semester_number, p_filename, p_rows)`. Each row is one student: `{row, identifier, cgpa, total_earned_credits, total_required_credits, semesters: [{semester_number, gpa, earned_credits, required_credits}]}`. The flat shape `{identifier, gpa, semester_number}` is one semester of it, with `p_semester_number` as its fallback. **A row is recorded completely or not at all.**
  - **Per-row errors:** "No registration number in this row"; the e-mail message above; 'CGPA "x" is not a number between 0 and 10'; the same for each credit value (totals 0–400, per semester 0–100) and each semester GPA (0–10); "Semester n is outside 1-8"; "No semester on this row, and none chosen for the upload"; "No student matches this registration number".
  - A row with no graded semester and no CGPA (a row of dashes) is **skipped**, not failed, and counted in `skipped_rows`.
- **Writes:**
  - `student_semester_gpas` upsert on `(student_id, semester_number)`, **always overwriting** the GPA, with `source = 'cluster_head'`, `round(gpa, 2)`, `recorded_by` and `batch_id`. Credits are kept when the new file has none. A department value replaces a student's self-entered one and locks it in the student UI.
  - `student_cgpas` upsert on `student_id` when the row has a CGPA, replacing CGPA and both totals.
- **Output** adds `skipped, semester_gpas_recorded, semesters, cgpa_recorded`. `scope_label` is e.g. "Semesters 1, 2 + CGPA". The page shows the semesters in the file, the ones recorded and the ones not graded yet.
- **Where the CGPA shows:** the mentor's and HOD's student page and the student report PDF (`gpa_stats.cgpa` is the official CGPA when there is one, `cgpa_official` says so), and the student's Academics page. Until one is uploaded they show the mean of the semester GPAs, as before.

**Backlogs** (`action: 'backlog'`; optional `semester_number` 1–8 and `exam_session` of at most 60 characters, both fallbacks):

- **Input:** the ERP "Defaulter Grade" result export, three HTML tables:
  - title lines: "RESULT OF END TERM EXAMNINATION -24-25 ()" and "BTECH-031 : … (IOT AND INTELLIGENT SYSTEM)- III SEMESTER". The semester (Roman or Arabic) and the exam ("END TERM EXAMNINATION 24-25") are read from them;
  - the student grid: S.No., Registration No, Student Name, then **one column per subject code** holding the grade (F, UFM, DT ...) where the student failed. Only defaulters are listed;
  - the subject table: Subject Code, Subject Description, Credit. It supplies names and credits; the "OE" column is matched to "OPEN ELECTIVE" by initials.
  - A hand-made list (Registration No, Subject Code, optional Subject Name, Grade, Cleared) is still accepted.
- **Semester and exam precedence:** the file's semester wins over the dropdown; the dropdown is used only when the title names none (otherwise the API returns 400 "The file does not say which semester it is for..."). A typed exam label wins over the title's.
- **Processing:** `record_backlog_batch(p_semester_number, p_exam_session, p_filename, p_rows, p_subject_codes)` (0035 dropped the old four-argument version). Each row is one student: `{row, identifier, grades: [{subject_code, subject_name, credits, grade}]}`; the hand-made shape is one subject per row.
  - **Fail grades:** F, FA, FAIL, FAILED, UFM, DT, DB, DX, AB, ABS, ABSENT, I, X, NC, DETAINED, DEBARRED (case-insensitive). Any other value in a subject cell is listed back as '… "RL" is not a fail grade, so nothing was changed for this subject' and that subject is left alone.
  - **Per-row errors:** "No registration number in this row"; the e-mail message; "Each row needs a registration number and a subject code" (hand-made list); "No student matches this registration number".
  - **Writes:** `student_backlogs`, matched on student, semester and **upper(subject_code)** (case-insensitive; codes are stored upper-case): grade, credits, name and exam session are updated when given; a fail grade makes it open (`is_cleared = false`, `cleared_at` null).
  - **The clearing pass.** `p_subject_codes` is every subject column in the file. The Defaulter Grade list is the whole truth for those subjects in that semester, so every open backlog in them that the file no longer marks is cleared (`cleared_at` set once): a student listed with a blank cell, and a student not listed at all. Subjects the file does not name, and other semesters, are never touched. A hand-made list sends no subject codes and gets no clearing pass.
  - **Hand-made Cleared values** are case-insensitive: `yes`, `y`, `true`, `cleared`, `pass`, `passed`, `1` clear; `no`, `n`, `false`, `not cleared`, `fail`, `failed`, `0` reopen; a blank cell or no Cleared column leaves an existing backlog's state alone (new rows start open).
- **Output** adds `semester_number, exam_session, backlogs_recorded, backlogs_cleared`. `scope_label` is "Semester 3 · END TERM EXAMNINATION 24-25". The page shows semester, exam, programme and the subject table.
- **Where backlogs show:** the mentor's and HOD's student page (subject, semester, grade, open/cleared with date, exam), and the at-risk pages' counts. Students still do not see them.

**Black dots** (`action: 'black-dot'`; body `{filename, file_base64}` only):

- **Input:** the Proctorial Board's "Notice of PB meeting" as `.docx` (read without a dependency: `table-readers.js` unzips `word/document.xml` with `node:zlib`), or the same table as `.xlsx`/`.csv`. One table per case:
  - a **case line** spanning the table: "Case No: 034/Even Sem/ 2026.  The undermentioned students were involved in possession of banned items." The case number ends at the first full stop, comma or " - "; the rest is kept as what the case is about. Case numbers are normalised ("034/Even Sem/2026");
  - a header: S/No, Regn No, Name, Date of Incidence, Block, Room No, Course/Branch, Mob No, Previous Record;
  - one row per student. A date merged down (Word `vMerge`) or written only on the first row applies to every student in the case. Course/Branch on two lines becomes "B Tech ECE, Sec- F1".
  - A flat sheet with a Case No column on every row also works.
  - **Dates** are read day-first ("10/09/26" is 10 September 2026) and only when complete; "14TH August" keeps its text and no date.
- **Processing:** `record_black_dot_batch(p_filename, p_rows)`. Each row: `{row, where, identifier, name, case_number, case_details, incident_date, incident_date_text, hostel_block, room_no, course_branch, mobile_no, previous_record}`.
  - **Per-row errors:** "No registration number in this row"; the e-mail message; 'No case number for this row. The notice needs a "Case No: ..." line above each table, or a Case No column'; "No student in the portal has this registration number (they may be from another department)" (a PB notice covers the whole university, so this is expected for most rows); and the **name check**: when the notice gives a name it must share a word (two letters or more) with the account's name, otherwise 'The name in the notice ("…") does not match the student with this registration number. Check the registration number'. The account's name is not revealed.
  - **Writes:** `student_black_dots` upsert on `(student_id, lower(case_number))`, so a corrected notice re-uploaded updates rather than duplicates (blank cells keep the stored values). `previous_black_dots` is read from Previous Record ("NIL" → 0, "8 black dot" → 8).
- **Output** adds `cases, case_numbers, students`. `scope_label` is "Case 034/Even Sem/2026" or "2 cases". The page lists the cases read from the notice.
- **Where black dots show:** the mentor's and HOD's student page and `get_student_dossier`. They are **not** part of the at-risk rule and send no notification.

**Known issues:**

- **Upload order matters for backlogs.** The clearing pass trusts the latest file: uploading an older Defaulter Grade list after a newer one reopens what the newer one cleared.
- **A mistyped registration number clears.** In a Defaulter Grade list, a student whose registration number is wrong is "not listed", so their open backlogs in those subjects are cleared until the corrected file is uploaded. ERP exports make this unlikely; hand-edited copies do not.
- **No way to remove a black dot** from the UI; a wrongly recorded one needs SQL.
- **Misleading page copy:** the attendance page says the section is "taken from the file header". The per-row Section wins.
- **Dashboard gaps:**
  - The cluster-head dashboard's "Uploads recorded" is at most 10 (the query has `limit 10`).
  - Mentor-map uploads and roster imports never appear in it.
- **Dead code:** the notification type `academic_data_uploaded` is never sent; `skipped_rows` is written only by the GPA upload.

### 4.13 Rosters and mentor–mentee mapping

**Status:** Implemented.

**Where:**

- UI: `pages/clusterHead/ClusterHeadRosterPage.jsx` ("Rosters & Mentors") and `components/clusterHead/AcademicUploadPanel.jsx`.
- API: `api/admin/import-roster-spreadsheet.js` (rosters), `api/cluster-head/upload-academic-data.js` (`action: 'mentor-map'`).
- SQL: `map_students_to_mentors`, `resolve_student_ids`, `notify_on_mentor_reassignment`.
- Tables: `roster_import_batches`, `user_profiles`, `mentor_reassignment_log`.

The page has three upload panels plus an import-history table (the caller's last 15 `roster_import_batches`). The intended order:

1. **Student roster**, posted with `{import_type: 'student', create_accounts: true, filename, file_base64}`. It creates student accounts, with the registration number as `login_id`.
2. **Faculty roster** (optional), with `import_type: 'faculty'`. It creates faculty accounts.
3. **Mentor–mentee mapping**. The students must already exist: the mapping matches them by registration number and cannot create them.

**Roster import in detail.**

- **Access:** roles `cluster_head` or `hod`. Rate limit: 200 requests per 300 s per user. No setup gate.
- **Body:** `import_type` (`faculty`, `student` or `combined`), `filename`, `file_base64` (at most 8,000,000 characters), `create_accounts` (default true; `false` is a dry run), `offset`, `batch_id`, `default_mentor_id`, `semester_cycle_id`. The UI never sends `combined`, `default_mentor_id` or `semester_cycle_id`.
- **Every chunk re-parses the whole file.**
  - A `combined` file needs a Role cell on every row ("A combined import needs a "Role" column saying Faculty or Student on every row…"), and faculty rows are processed first.
  - Parser limits: at most 5,000 data rows; header aliases in §10.4.
- **Per row (`planRow`), in order:**
  1. The e-mail must pass `emailSchema`, which includes the `ALLOWED_EMAIL_DOMAINS` allow-list.
  2. The name must have at least 2 characters ("Missing or too-short Name").
  3. An e-mail that already exists, **including earlier in the same file**, is skipped ("Account already exists").
  4. For a student with a Mentor Email, that mentor must be an existing faculty account ('Mentor "X" is not a registered faculty member. Import the faculty roster first.') and must be active. Otherwise **the row fails and no account is created**.
  5. A Password cell, if present, must be at least 8 characters.
  6. `createUser` (§4.1). A rate-limit error from Auth is retried once after 1.5 s.
  7. A follow-up profile update sets `assigned_mentor_id` and, for students, `parent_name`, `parent_mobile` (10 digits only) and `parent_email`.
- **Chunking.**
  - Accounts are created in **waves of 25, 5 concurrently** (`runPool`).
  - After each wave the server checks a **20 s time budget**, measured from after parsing. When the budget is spent it returns `next_offset`, the first row not processed.
  - The panel re-posts the same file with `offset` and the returned `batch_id` until `next_offset` is `null`. Progress reads "{done} of {total} rows done — keep this tab open."
- **History.**
  - The first chunk inserts a `roster_import_batches` row.
  - Later chunks find it by `batch_id` **and** `uploaded_by = caller`, then add their counts and append row errors (capped at 200).
  - The audit entry `admin.import_<type>_roster` is written only by the **last** chunk.
- **Response (201):** `batch_id, total_rows, offset, next_offset, processed_through, faculty_created, student_created, created[], skipped[], failed[]`.
  - `created` entries include `temporary_password` and `password_from_file`.
  - The panel merges the chunks: `failed` and `row_errors` are capped at 200 in the UI.
  - Tiles: Rows in file, Accounts created, Already existed, Problems.
  - Then the **credentials panel** (§4.1).

**Mentor–mentee mapping in detail.**

- **Input:** the departmental "Mentor Mentee List", with registration number, mentor e-mail and (optional) mentor name. Other columns, such as the mentor's phone, are ignored.
- **Step 1, `createMissingMentors`** (API, service role):
  - Every mentor e-mail that passes `emailSchema` and is not an existing faculty e-mail becomes a **new faculty account**: shared temporary password, the name from the file (or the e-mail's local part), department `'IoT & IS'`, `must_change_password`.
  - Accounts are created 5 at a time. Invalid or off-domain e-mails are skipped silently. Failures go to `mentor_errors`, which the UI does not display.
- **Step 2, `map_students_to_mentors(p_rows)`** (as the user). For each row:
  1. "Each row needs a registration number and a mentor email".
  2. "No student matches this registration number. Import the student roster first." Students are resolved by `resolve_student_ids`: registration number only (since 0035; e-mail used to be accepted), active students only.
  3. 'No faculty account for "%s". Import the faculty roster first.'
  4. 'Mentor "%s" is marked %s' when the mentor is not active.
  5. If the mentor is unchanged, the row is counted as `unchanged`.
  6. Otherwise `assigned_mentor_id` is updated under the trusted-operation flag.

  If a student appears twice, the last row wins.
- **Side effects of each real change:** the trigger `notify_on_mentor_reassignment` writes `mentor_reassignment_log` and sends `mentor_reassigned` notifications to the student ("Your faculty mentor has changed"), the new mentor ("New mentee assigned") and the old mentor, if any ("Mentee reassigned").
- **Output:** `{total_rows, matched, unchanged, failed, row_errors, mentors_created, mentor_errors}`. Tiles: Rows in file, Mapped, Mentor accounts created, Already correct, Problems.

**Edge cases:**

- **A failed mentor link during a roster import is silent.** The follow-up profile update (mentor link, parent fields) is not checked for errors, so the row is still reported as created.

- **A chunk failure loses the progress display.** When a chunk fails (a 429, a network error or a timeout), the loop stops. Results collected so far, including created credentials, are **not displayed**, and re-uploading starts again from offset 0. Already-created accounts are then skipped as existing, but their credentials are not shown again. They all share the temporary password anyway, unless the file supplied per-row passwords.
- **Mapping does not re-evaluate risk, record history or move queries.**
- **Unaudited accounts.** Mentor accounts created by the mapping stay even if the mapping RPC then fails, and they are not audited separately. The count is in the upload's audit metadata only when the RPC succeeds.

### 4.14 At-risk detection and mentor meetings

**Status:**

- Detection: Implemented.
- Meetings: Partial. They are created, but the meeting link is a **Placeholder**.

**Where:**

- SQL: `evaluate_student_risk`, `evaluate_all_students_risk`, `dispatch_at_risk_meetings`, `create_at_risk_meeting_link`, `set_at_risk_meeting_status`, `notify_on_risk_flag_change`, `notify_on_at_risk_meeting`; the view `at_risk_student_overview`; tables `student_risk_flags` and `at_risk_meetings`.
- UI: `pages/faculty/FacultyAtRiskPage.jsx` (also `/hod/at-risk`) and `HodOperationsPage`.

**The rule** (`evaluate_student_risk`, verbatim conditions). A student is **at risk if ANY one** of these holds:

| Condition | How it is computed | Test |
|---|---|---|
| Low attendance | Mean of the **latest** `attendance_percent` per course. The latest is by `period_start desc, created_at desc`; only courses with records count. | `v_attendance < 75` |
| Low GPA | The GPA of the **highest-numbered semester** on record, from any source (department or self-entered) | `v_gpa < 6` |
| Backlog | Count of `student_backlogs` rows with `is_cleared = false` | `v_backlogs >= 1` |

- The function upserts `student_risk_flags`: the booleans, the metrics, human-readable `reasons[]` (for example "Attendance 64.00% (below 75%)"), `first_flagged_at` (never reset), `last_flagged_at`, `cleared_at` and `last_evaluated_at`.
- It runs in two places:
  1. inside the attendance, GPA and backlog upload RPCs, for every student they changed (including backlogs cleared because a Defaulter Grade list no longer marks them);
  2. in the `at_risk_sweep` job (`evaluate_all_students_risk`, HOD or no JWT; **active** students only).

  It does **not** run on a student's own GPA entry or on a mentor-map upload.

**Notifications** (`notify_on_risk_flag_change`, AFTER INSERT/UPDATE on `student_risk_flags`). These go **only to the mentor**; the student and the HOD are not notified.

- On a change to at-risk: `student_at_risk`, "<name> is now flagged as at-risk", with the reasons.
- On a change to not-at-risk: `at_risk_cleared`, "<name> is no longer at-risk".

**Meetings** (`at_risk_meeting_dispatch` job → `dispatch_at_risk_meetings`, HOD or no JWT):

1. For every flagged student who has a mentor and **no open meeting** (`awaiting_link` or `scheduled`), the job inserts an `at_risk_meetings` row with status `awaiting_link`, a snapshot of the reasons and metrics, and `job_run_id`.
2. It calls `create_at_risk_meeting_link`, which **does nothing yet**: a `TODO(provider)` stub that returns the row unchanged.
3. The trigger `notify_on_at_risk_meeting` sends the mentor `at_risk_meeting_required` ("Schedule a meeting with <name>") and stamps `mentor_notified_at`.
4. The job returns `{meetings_created, already_open, without_mentor}`.

**At-risk page** (mentor: own mentees; HOD: everyone, with a Mentor column):

- **Data:** `at_risk_student_overview` where `is_at_risk`, ordered by attendance.
- **KPIs:** Flagged, Low attendance, Low GPA, With backlogs.
- **Columns:** Student (link to the dossier page), Registration no., Backlogs, "Flagged for" chips, Parent contact, Meeting status, Actions.
  - Parent contact is `primary_parent_mobile`: the Form A father's, then the mother's, then the roster `parent_mobile`, shown as a `tel:` link.
- **Expanding a row** shows the courses below 75% (`student_attendance_overview`) and the semester GPAs (`student_semester_gpas`, which RLS gates by GPA sharing).
- A banner appears when open meetings have no link.
- The only action is **"Mark done"**: `set_at_risk_meeting_status(open_meeting_id, 'completed')`, toast "Meeting with <name> marked as done." After that the row reads "Not raised yet", because the view only joins open meetings.

**Known issues:**

- **Spurious "no longer at-risk" notifications.** The first-ever evaluation of a student who is **not** at risk (an `INSERT` with `is_at_risk = false`) sends the mentor "<name> is no longer at-risk". On a first upload or sweep this happens once per healthy mentee.
- **Anyone can re-evaluate anyone.** `evaluate_student_risk` has no caller check and is executable by any authenticated user, including students and cluster heads *(tested)*. It also writes: it upserts the flag row and can trigger notifications. A student could call it for any student id; the function returns that student's metrics (attendance mean, latest GPA, backlog count, reasons). See §8.9.
- **No status validation.** `set_at_risk_meeting_status` accepts any enum value, including moving backwards. The UI only offers "completed".
- **The view leaks GPA past the sharing setting.** It exposes `latest_gpa` from `student_risk_flags`, whose RLS is `can_access_student`, not `can_view_student_gpa`.
- **Stale header comment.** `FacultyAtRiskPage`'s header comment promises attendance and GPA columns that the page does not render.
- **Meetings are stranded after a mentor change.** Visibility and `set_at_risk_meeting_status` depend on the meeting's own `mentor_id`, not the student's current mentor. After a reassignment the new mentor sees "Not raised yet" and cannot mark the old meeting done, while dispatch counts it as `already_open` and never raises a new one *(tested)*.

### 4.15 Feedback survey

**Status:** Implemented.

**Where:**

- UI: `pages/student/StudentSurveyPage.jsx`, `pages/student/StudentSurveyTrackingPage.jsx`, and `pages/faculty/FacultyMenteesPage.jsx` (Survey column and KPI).
- SQL: `open_survey_cycle`, `send_survey_reminders`, `get_active_survey_for_student`, `submit_survey_response`, `get_mentor_group_survey_status`.
- Tables: `survey_questions`, `survey_cycles`, `survey_responses`, `survey_response_answers`. Views: `survey_mentee_status`, `survey_group_completion`.

**Questions.** Ten are seeded by 0023, all active, each rated **1–5** (Poor, Fair, Satisfactory, Good, Excellent):

1. How would you rate your mentor's responsiveness when you raise an academic query?
2. How effectively does your mentor resolve the academic problems or doubts you bring to them?
3. How comfortable are you in approaching your mentor with personal or non-academic concerns?
4. How would you rate your mentor's availability and accessibility whenever you need support?
5. How beneficial is the regular tracking of your academic performance by your assigned mentor?
6. How would you rate the usefulness of the guidance provided during scheduled mentor check-ins?
7. How helpful has your mentor been in guiding your academic or career-related decisions?
8. How well does the portal help you recognize measurable improvement in your own performance over time?
9. How confident are you that having an assigned mentor through the portal has positively impacted your academic journey?
10. How would you rate your overall experience using the Student Mentor Portal?

**Opening a cycle** (`survey_cycle` job → `open_survey_cycle`, HOD or no JWT):

1. Deactivate any active cycle. Only **one** cycle is active at a time.
2. Insert cycle *n+1* with `opens_on = today` and `closes_on = today + (interval_days − 1)` (15 days inclusive).
3. Notify every **active** student: `survey_published`, "Mentor feedback survey #n is open".

**Answering** (student, `/student/survey`):

- `get_active_survey_for_student()` returns `{cycle, has_submitted, submitted_at, questions}`. The page shows "No survey is open right now", "You have already filled this one in", or the form. Every question must be answered ("Please answer every question before submitting.").
- `submit_survey_response(p_cycle_id, p_answers)` checks:
  - "Survey not found";
  - "That survey cycle has closed" (the cycle is no longer active);
  - "You have already submitted this survey" (also `UNIQUE(cycle_id, student_id)`);
  - the answer count equals the number of active questions;
  - valid question numbers and ratings from 1 to 5.

  It stores the student's **current mentor id** with the response. Answers cannot be changed. Toast: "Thank you — your feedback has been recorded."

**Tracking:**

- **Star mentee (Survey Tracking).** `get_mentor_group_survey_status()` returns the group's active students with `has_submitted` and `is_me`, pending first. KPIs: Students in group, Filled in, Still pending, Completion %. The table is filterable and defaults to "Not yet filled".
- **Mentor (My Mentees).** A "Survey #N filled in x/y" KPI and a per-mentee Filled in / Pending column, from `survey_mentee_status` where `cycle_is_active`.

**Reminders** (`survey_reminder_sweep` job → `send_survey_reminders`). Only active students **without** a response in the active cycle get `survey_reminder`.

**Known issues:**

- **`closes_on` is not enforced.** A cycle stays answerable until the next cycle opens.
- **No page or report reads the answers**, and there is no HOD results or completion view.
- **The answers are not anonymous.** RLS (`survey_responses_select_scope`, `survey_answers_select_scope`, both on `can_access_student`) lets the mentor, and the HOD, read each mentee's individual ratings. Feedback about a mentor is readable by that mentor at the database level *(tested)*.
- **Unused view.** `survey_group_completion` is **Dead**.

### 4.16 Periodic jobs and the HOD Operations page

**Status:**

- Manual triggering: Implemented.
- Automatic scheduling: **Not implemented**.

**Where:**

- UI: `pages/hod/HodOperationsPage.jsx` ("Scheduled Jobs", `/hod/operations`).
- API: `api/admin/run-cycle-job.js`.
- SQL: `run_cycle_job`, `run_all_cycle_jobs_now`, `run_due_cycle_jobs` (dead), `get_cycle_job_status`; tables `cycle_job_schedule` and `cycle_job_runs`.

**The four jobs** (`cycle_job_schedule`, seeded by 0024):

| `job_type` | Interval | What it runs |
|---|---|---|
| `survey_cycle` | 15 days | `open_survey_cycle`: closes the old cycle, opens a new one, notifies all students |
| `survey_reminder_sweep` | 7 days | `send_survey_reminders`: reminds non-responders |
| `at_risk_sweep` | 15 days | `evaluate_all_students_risk`: re-evaluates every active student |
| `at_risk_meeting_dispatch` | 15 days | `dispatch_at_risk_meetings`: raises a meeting for every flagged student without one |

**How a run works** (`run_cycle_job(p_job_type, p_trigger, p_note)`, HOD or no JWT):

1. Insert a `cycle_job_runs` row (`running`).
2. Run the job.
3. Mark the row `succeeded`, with `result` JSON and `duration_ms`.
4. Update the schedule:
   - For a **`manual`** run, set `last_run_at`, `last_run_status` and `last_manual_run_at`. **`next_run_due_on` is left alone**, so testing does not disturb the cadence.
   - For a **`scheduled`** run, set `next_run_due_on = greatest(today, next_run_due_on) + interval_days`.
5. Return `{job_type, trigger_source, run_id, status, result, schedule_advanced}`.

`is_enabled` is **ignored** by `run_cycle_job`.

**"Run all"** (`run_all_cycle_jobs_now(p_note)`) runs `at_risk_sweep`, then `at_risk_meeting_dispatch`, then `survey_cycle`, always as `manual`. It does **not** run the reminder sweep.

**UI:**

- **KPIs:** at risk, open meetings, active survey, runs logged (the last 25).
- **Four job cards,** each with interval, next due, last run, and "Run now". There is also a "Run all" button.
- **A table of the last 25 runs:** Job, Trigger, Status, What it did, Took, When.
- **Calls:**
  - GET `/api/admin/run-cycle-job` → `get_cycle_job_status()`, which returns `{jobs[], recent_runs[], active_survey_cycle, at_risk_count, open_meeting_count}`.
  - POST `{job_type, trigger_source: 'manual', note: 'Fired from the HOD operations panel'}`.
- **Toast:** "Job finished. The 15-day schedule was left unchanged."

**Known issues:**

- **Nothing runs on its own.** There is **no scheduler**: no `pg_cron`, no Vercel cron, and `run_due_cycle_jobs()` has no caller. A cron could not call the endpoint as it stands anyway, because it requires a HOD's JWT. The claims in `docs/CLUSTER-HEAD-AND-CYCLE-JOBS.md` about automatic runs are aspirational.
- **A failed run leaves no trace.** `run_cycle_job` writes `failed` and then re-raises, so the whole transaction (including the failure row) rolls back. "Run all" is all-or-nothing.
- **Stale wording.** Some copy says "15-day" for all jobs; the reminder interval is 7 days. `run-cycle-job.js` says "Three things"; there are four job types.

### 4.17 Dashboards and analytics

**Status:** Implemented. The category charts are affected by the legacy-category issue (§4.4).

**Where:**

- Pages: `StudentDashboardPage`, `FacultyDashboardPage`, `HodDashboardPage`, `HodFacultyPerformancePage`, `ClusterHeadDashboardPage`.
- Hook: `hooks/useDashboardMetrics.js`.
- SQL: `get_dashboard_metrics`, and the views `faculty_performance_summary`, `query_daily_trend` and `student_query_summary`.

**`get_dashboard_metrics()`** (SECURITY DEFINER; the only check is "Not authenticated") branches on the caller's role. All counts cover **all time**.

| Branch | Scope | Keys |
|---|---|---|
| `student` | the caller's own queries | `role`, `total_queries`, `open_queries`, `in_progress_queries`, `resolved_queries`, `awaiting_confirmation`, `unrated_resolved`, `avg_resolution_hours`, `form_a_completed`, `is_star_mentee`, `achievements_count`, `unread_notifications` |
| `faculty` | queries with `mentor_id = me` | the student keys that apply, plus `reopened_queries`, `avg_first_response_hours`, `avg_satisfaction`, `resolved_this_week`, `resolved_last_week` (both use `date_trunc('week', now())`), `mentee_count`, `onboarding_pending`, `star_mentee {id, name}`, `unread_notifications` |
| everything else (`else` = HOD) | all queries | `role` (always `'hod'`, even for a cluster head); the faculty query keys **except** `resolved_this_week` / `resolved_last_week`; plus `academic_queries`, `erp_tech_queries`, `infrastructure_queries` (**legacy categories only**), `total_students`, `total_faculty`, `active_faculty`, `departed_faculty`, `unassigned_students`, `onboarding_pending`, `unread_notifications` |

Averages are rounded but not coalesced, so they may be `null`. **A `cluster_head` caller falls into the HOD branch** and receives department-wide numbers. No cluster-head page calls it, but the RPC is callable (§8.9).

**Student dashboard (`/student`):**

- Mentor card: name, e-mail, phone, faculty id; or "No mentor has been assigned to you yet…".
- A "Raise a query" button.
- A banner for queries awaiting confirmation. It counts only the **5 most recent** queries.
- KPIs: Total, Open, In progress, Avg resolution time.
- A status donut.
- "Recent activity by category": a bar chart built from the 5 most recent queries, **legacy categories only**.
- "My recent queries": 5 rows, live.

**Faculty dashboard (`/faculty`):**

- KPIs:
  - Assigned mentees, captioned with onboarding pending;
  - Open;
  - In progress;
  - Resolved, captioned with resolved this week, plus a trend of this week minus last week.
- "My impact": average first response, average resolution, satisfaction, awaiting confirmation, reopened, star mentee.
- A resolution gauge and a status donut.
- "Recent load by category": the 8 most recent queries, **legacy categories only**.
- "Needs your attention": open or reopened queries among those 8, at most 6 shown.

**HOD dashboard (`/hod`):**

- KPIs: Students (captioned with unassigned), Faculty mentors (active · departed), Total queries, Onboarding pending.
- An attention banner when students are unassigned or faculty have departed.
- A status donut.
- A category bar chart (**legacy keys**).
- A resolution gauge and a service-quality list.
- A 30-day "raised" area chart from `query_daily_trend`. The chart computes "resolved" but does not draw it.
- A top-10 leaderboard from `faculty_performance_summary`, ordered by resolved. Columns: Faculty, Mentees, Queries, Resolved, Avg first response, Resolution rate, Rating.
- **Known issue.** The trend query orders by day **ascending** with `limit 400`. Once there are more than 400 (mentor, day) rows, the chart shows the **oldest** days, not the last 30. It also plots the last 30 days *that had a query*; empty days are skipped rather than shown as zero. The subtitle says "Live picture", but the page does not subscribe to changes.

**Faculty performance (`/hod/performance`):**

- Data: `faculty_performance_summary` (all time). Search by name.
- Sort options: resolved, total, mentees, fastest first response (a `null` is treated as 0, so faculty with no responses rank "fastest"), resolution rate, rating.
- Charts: resolved vs still active, and average first response (top 8).
- Table columns: Faculty, Branch, Status, Mentees, Queries, Resolved, Reopened, Avg first response, Avg resolution, Rate, Rating, and Report ("View" links to `/hod/reports?faculty_id=…`; "PDF" uses the default 90-day window).

**Cluster-head dashboard (`/cluster-head`):**

- KPIs: Subjects, "Uploads recorded" (**at most 10**), Last upload.
- Shortcuts to the four academic upload pages (attendance, GPA, backlogs, black dots).
- "My subjects" table.
- "Recent uploads": the last 10 `academic_upload_batches` rows, with Type, Scope, Recorded and Failed. Scope is the batch's `scope_label` ("Semesters 1, 2 + CGPA", "2 cases") and falls back to the section or semester for older rows.

### 4.18 Reports and PDFs

**Status:** Implemented. Known issues are listed at the end.

**Where:**

- UI: `pages/faculty/FacultyActivityReportPage.jsx` (`/faculty/report`, and `/hod/reports` with `isHodView`), `pages/faculty/FacultyMenteeDetailPage.jsx` (dossier), `FacultyMenteesPage` (PDF button per mentee).
- API: `api/reports/faculty-activity-report.js`, `api/reports/student-dossier-report.js`, `api/_lib/report-document-builder.js`, `api/_lib/pdf-chart-primitives.js`.
- SQL: `get_faculty_activity_report`, `get_department_faculty_report`, `get_student_dossier`.

**Faculty activity report.**

- **Range.** The last 90 days by default. Presets: 30, 90, 182, 365 days. From/To inputs are constrained so that From ≤ To ≤ today.
- **SQL:** `get_faculty_activity_report(p_faculty_id, p_from, p_to)`.
  - `p_faculty_id` defaults to the caller. A non-HOD may only ask for themself ("You can only generate a report for your own activity").
  - The period defaults to 90 days, and `to` is inclusive.
  - **Keys:** `faculty`, `period`, `generated_at`, `summary` (includes `escalated_queries`, `rated_queries`, `resolution_rate_percent`), `by_category` (`{category, total, resolved, open}`, dynamic), `by_status`, `resolution_confirmation`, `weekly_trend`, `rating_distribution`, `mentees`.
  - Metrics are filtered by `created_at` within the period, except each mentee's `query_count`, which is all time.
- **Page:**
  - KPIs: handled, resolution rate, average first response, average resolution.
  - A category bar, a confirmation donut (Confirmed fixed / Reopened / Awaiting reply / Unresolved), and gauges for rating and for the Form A share of mentees.
  - Tables: category breakdown, and mentees (Student, Reg. no., Sec, Form A, Queries).
- **PDF (`buildFacultyActivityPdf`):**
  1. Title block.
  2. 8 KPI cards.
  3. "Query mix and resolution quality": a category bar (**legacy 3 categories**) and a confirmation donut.
  4. Weekly raised vs resolved (last 12 weeks).
  5. Satisfaction ratings.
  6. Category breakdown table.
  7. Assigned mentees, at most 60.

  Filename: `faculty-activity-report-<slug>-<from>-to-<to>.pdf`.

**Department report** (HOD; the faculty picker's default, "All faculty members (consolidated)", i.e. `faculty_id=all`).

- **SQL:** `get_department_faculty_report(p_from, p_to)`.
  - Check: "Only the HOD can generate a department-wide report".
  - The department label is the HOD's `department`, falling back to `'IoT & IS'`.
  - **Keys:** `scope`, `department`, `period`, `generated_at`, `summary`, `by_category`, `by_status`, `monthly_trend`, `faculty[]` (sorted by resolved).
- **Page:**
  - 8 KPIs, including Faculty, Students, Satisfaction and "Referred to HOD".
  - A category bar, a status donut, monthly raised vs resolved, and load by faculty (top 8).
  - A faculty table: Faculty, Branch, Status, Mentees, Queries, Resolved, Reopened, Avg first response, Avg resolution, Rate, Rating.
- **PDF (`buildDepartmentReportPdf`):**
  1. Title block.
  2. 8 KPIs.
  3. Department query mix: a category bar (**legacy 3**) and a status donut.
  4. Monthly volume, last 12 months.
  5. Load by faculty.
  6. Fastest first response.
  7. All-faculty table, at most 80 rows.

  Filename: `department-activity-report-all-faculty-<from>-to-<to>.pdf`.

**Student dossier** (mentor for their mentee; HOD for anyone; also the student for themself at the database level).

- **SQL:** `get_student_dossier(p_student_id)`.
  - Checks: "Student not found"; "You are not this student's mentor".
  - **Keys:**
    - `student`, `mentor`, `generated_at`;
    - `form_a` (only when submitted);
    - `gpa_shared`, `semester_gpas` (with `earned_credits`, `required_credits`, `source`), `cgpa_record` (the official CGPA and totals, or null), `gpa_stats`. `gpa_stats.cgpa` is the official CGPA when one has been uploaded (`cgpa_official` true), otherwise the mean of the semester GPAs; `trend` compares the last two semesters.
    - `backlogs` (open first: subject, semester, grade, credits, exam, cleared and when) and `black_dots` (case, details, dates, block, room, course/branch, previous record), since 0035;
    - `achievements`, `achievements_by_category`;
    - `query_summary`, which counts the **legacy academic, erp_tech and infrastructure categories**;
    - `queries`, `monthly_query_trend` (YYYY-MM).
- **Page** (`/faculty/mentees/:studentId`, `/hod/students/:studentId`):
  - KPIs: CGPA to 2 dp, captioned "Official · n credits earned" or "Average of n semesters" ("Not shared" when sharing is off), Queries raised, Achievements, Avg resolution.
  - A GPA line chart and a "Query mix" donut (**legacy categories only**).
  - Panels: Backlogs (open count in the title) and Black dots, then Form A, Achievements (with Verify and Proof), Query history.
  - A star toggle for the mentor, with no confirmation dialog on this page.
  - PDF download.
- **PDF (`buildStudentDossierPdf`):**
  1. Title block.
  2. 8 KPIs (CGPA captioned "official" when it is).
  3. Semester GPA line chart. Backlogs and black dots are **not** in the PDF.
  4. Support activity: a category bar (**legacy 3**), a status donut and a monthly line.
  5. Query history, at most 30.
  6. Achievements, at most 25.
  7. Form A summary.

**Endpoint behaviour** (§6).

- Both endpoints: rate limit 30 per 60 s per user; the RPC runs **as the caller**. A Postgres permission error (42501) becomes 403; other errors become 400.
- The activity report requires the `faculty` or `hod` role. The dossier has no role check; the database decides.
- PDFs are audited (`report.faculty_activity_pdf`, `report.department_pdf`, `report.student_dossier_pdf`). JSON requests are not.
- The browser saves the file under the server's `Content-Disposition` name.

**Known issues:**

- **"Active" column always empty.** On the activity page (and "Still open" in its PDF), the category table's column reads `open_count`, but the RPC returns `open`, so the column always shows "—".
- **Months out of order.** The department report's `monthly_trend` is ordered by its "Mon YY" text, i.e. **alphabetically** (for example Aug, Jul, Oct, Sep).
- **Old name in PDFs.** PDF metadata still says "SSMP".
- **Missing-screen hints.** Hints on the reports and roster pages still say "Import the faculty roster from Semester setup". That screen no longer exists.

### 4.19 HOD faculty roster and reassignment

**Status:** Implemented. Known issues are listed at the end.

**Where:**

- UI: `pages/hod/HodFacultyRosterPage.jsx` (`/hod/roster`).
- API: `api/admin/manage-faculty-roster.js`.
- SQL: `set_faculty_employment_status`, `reassign_mentees`, `notify_on_mentor_reassignment`; the view `faculty_reserve_pool`; the table `mentor_reassignment_log`.

**Flow.**

1. **Roster.** GET `?action=roster` returns `faculty_reserve_pool`: each faculty member's status, availability, capacity, current mentees and remaining capacity.
   - KPIs: Faculty, Reserve pool, Departed, Mentees needing a new mentor.
   - Columns: Faculty, Faculty ID, Branch, Status, Mentees current/capacity, Accepting, Actions.
2. **Change status.** POST `{action: 'set-status', faculty_id, employment_status}` calls `set_faculty_employment_status`.
   - Check: "Only the HOD can change faculty employment status".
   - When `available_for_reassignment` is not sent, a non-active status forces it to `false`. When it is sent, the value is stored as given (even `departed` with `true`).
   - The response carries `mentee_count` and `needs_reassignment` (departed with mentees). The page then warns "<name> still has N mentees. Reassign them now." and opens the reassignment modal.
3. **Reassign.**
   - GET `?action=mentees&faculty_id=…` lists the mentees plus their unresolved-query counts. All are preselected.
   - The HOD picks a target from the pool, which the client computes from the roster.
   - POST `{action: 'reassign', student_ids (1–500), from_faculty_id, to_faculty_id, reason (≤500)}`:
     - **`reassign_mentees`** (as the user) runs its checks: "Only the HOD can reassign mentees"; a non-empty list of at most 500; "Target mentor not found"; "Cannot reassign students to a mentor whose status is %". It then updates `assigned_mentor_id`.
     - The trigger logs each change and notifies the student, the new mentor and the old mentor. The reason is written onto the log rows.
     - The API then uses the **service role** to move the students' **unresolved** queries (`status ≠ 'Resolved'`, `mentor_id = from`) to the new mentor. Resolved queries, whether awaiting confirmation or confirmed, stay with the old mentor.
     - The audit entry is `hod.reassign_mentees`, with `{student_count, moved, from, reason}`.
   - Toast: "Mentees reassigned. Everyone involved has been notified."

**Known issues:**

- **Returning faculty stay out of the pool.** Re-activating a faculty member leaves `available_for_reassignment = false`, because the UI never sends `available_for_reassignment`.
- **`reassign_mentees` checks too little.** It does not check capacity, `available_for_reassignment`, or that the students really belong to `from`, and it does not clear `is_star_mentee`.
- **A failed query handover is silent.** It is only logged to the server console; the client still sees success.
- **Unused action.** GET `?action=reserve-pool` exists but the UI never calls it.
- **Open at-risk meetings stay with the old mentor** (§4.14). A reassignment does not move them.
- **The API is not the only way in.** `reassign_mentees` is executable by the HOD directly through PostgREST, which skips the rate limit, the audit entry and the query handover (§8.9 S17).

### 4.20 HOD students directory and single-account creation

**Status:** Implemented. There is one data-volume limitation.

**Where:** `pages/hod/HodStudentsPage.jsx` (`/hod/students`), `components/hod/AddAccountModal.jsx`, `api/admin/provision-user-accounts.js`.

**Directory.**

- **Data:** `student_query_summary.select('*').order('student_name')`, plus faculty names from `user_profiles`.
- **Filters:** All, No mentor, Form A pending, Active queries. Search by name, registration number or e-mail. The KPIs mirror the filters.
- **Columns:** Student (links to `/hod/students/:id`, the dossier page in HOD mode), Reg. no., Branch, Sec, Mentor ("Unassigned" chip), Form A, Queries.

**Add account** (modal):

- **Roles:** student, faculty, hod, cluster_head.
- **Fields:** name, e-mail, registration number or staff id, branch, mobile (10 digits). Students also get section, semester and a mentor chosen from **active** faculty.
- **Call:** POST `/api/admin/provision-user-accounts` with `{accounts: [one]}`, carrying `department: 'IoT & IS'` (hard-coded).
- **Output:** a credentials view with name, e-mail and the temporary password, "Copy credentials", and the note that a password change is required. If nothing was created, the first skipped or failed reason is shown as an error.

**Endpoint behaviour.**

- **Access:** HOD only. Body at most 2 MB. 20 requests per 60 s.
- **Validation:** 1–500 accounts, each checked by `provisionUserSchema` (§6).
- **Existing accounts:** an existing e-mail (case-insensitive) is skipped with "An account with this email already exists".
- **Mentor:** a separate service-role update sets the mentor, which fires the reassignment notifications. If that update fails, the account is reported under `failed` but **still exists**.
- **Audit and response:** audit `admin.provision_accounts`. Response 201 `{created[], skipped[], failed[]}`. If every account failed, the response is 400 "No accounts could be created. First error: …".

**Known issue.** The duplicate-e-mail check uses `ilike`, so `_` and `%` in an address act as wildcards and can produce a false "already exists". If several rows match, `maybeSingle` errors and the check falls through to `createUser`.

**Known issue.** PostgREST returns at most `max_rows` rows per request: 1,000 in `supabase/config.toml`, which is also Supabase's hosted default. The directory requests all students **without pagination**, so with more than 1,000 students only the first 1,000 (alphabetically) are listed, and the KPIs count only those.

### 4.21 Notifications

**Status:** Implemented.

**Where:**

- SQL: `enqueue_notification`, the trigger functions `notify_on_*`, and the RPCs that notify directly: `escalate_query_to_hod`, `submit_mom_report`, `open_survey_cycle`, `send_survey_reminders`.
- UI: `context/NotificationProvider.jsx`, `components/layout/NotificationBell.jsx`.
- Table: `notifications`.

**Mechanism.**

- Every notification is inserted by `enqueue_notification(recipient, actor, type, title, body, query_id, link_path)`. Only definer functions can execute it.
- It **silently skips** a `NULL` recipient and a recipient who is also the actor.
- The browser only selects its own rows (RLS) and marks them read:
  - a direct `update({is_read: true, read_at})`;
  - `mark_all_notifications_read()` for all of them.
- **Bell:**
  - The last **30** notifications load on mount, and new ones arrive over realtime as toasts.
  - The unread badge counts only those 30 and shows "9+" above 9.
  - Clicking a notification marks it read and navigates to `link_path`.
  - "Mark all read" appears only when something is unread.
  - There is no delete button, although RLS allows deleting one's own notifications.

**Every notification the system sends:**

| Type | Sent by | Recipient | Title | Link |
|---|---|---|---|---|
| `query_created` | trigger on `support_queries` INSERT (skipped when `mom_id` is set) | mentor | "New <category> query from <student>" | `/faculty/queries/<id>` |
| `query_created` | `submit_mom_report` | mentor | "CR report from <rep> — n item(s) to action" | `/faculty/cr-reports` |
| `query_message` | trigger on `query_messages` INSERT (not system messages), **including the first message of every new query and of every CR-report item** | a student's message goes to the query's mentor; anyone else's goes to the student | "New reply from <sender>" | `/faculty/queries/<id>` or `/student/queries/<id>` |
| `query_resolution_pending` | trigger on resolution change | student | "Was your issue fixed?" | `/student/queries/<id>` |
| `query_confirmed` | same trigger | mentor | "<code> confirmed as resolved" | `/faculty/queries/<id>` |
| `query_reopened` | same trigger | mentor | "<code> reopened by the student" | `/faculty/queries/<id>` |
| `query_rated` | same trigger (rating set) | mentor | "Query <code> rated n/5" | `/faculty/queries/<id>` |
| `query_escalated` | `escalate_query_to_hod` | the HOD named in the caller's `hod_email`, else all active HODs except the caller | "<mentor> referred <code> to you" | `/hod/queries/<id>` |
| `query_escalated` | `escalate_query_to_hod` | student | "<code> has been referred to the HOD" | `/student/queries/<id>` |
| `mentor_reassigned` | trigger on `user_profiles.assigned_mentor_id` change (also writes `mentor_reassignment_log`) | student; new mentor; old mentor | "Your faculty mentor has changed" / "New mentee assigned" / "Mentee reassigned" | `/student/profile`, `/faculty/mentees` |
| `star_mentee_assigned` | trigger on `is_star_mentee` false → true | student | "You are now the student representative" | `/student/group-queries` |
| `achievement_verified` | trigger on verification false → true | student | "Achievement verified" | `/student/achievements` |
| `student_at_risk` | trigger on `student_risk_flags` | mentor | "<name> is now flagged as at-risk" | `/faculty/at-risk` |
| `at_risk_cleared` | same trigger | mentor | "<name> is no longer at-risk" (see the bug in §4.14) | `/faculty/at-risk` |
| `at_risk_meeting_required` | trigger on `at_risk_meetings` INSERT | mentor | "Schedule a meeting with <name>" | `/faculty/at-risk` |
| `survey_published` | `open_survey_cycle` | every active student | "Mentor feedback survey #n is open" | `/student/survey` |
| `survey_reminder` | `send_survey_reminders` | active students who have not responded | "Reminder: survey #n is still open" | `/student/survey` |
| `counselling_request` | trigger on `counselling_requests` INSERT | mentor | "<name> has asked to talk" | `/faculty/counselling` |
| `counselling_request` | same trigger when `mentor_note` changes | student | "Your mentor has replied" | `/student/counselling` |

`onboarding_reminder`, `account_provisioned` and `academic_data_uploaded` exist in the enum and have bell icons, but **nothing sends them** (Dead).

### 4.22 Profiles and photos

**Status:** Implemented.

**Where:** `pages/student/StudentProfilePage.jsx`, `pages/faculty/FacultyProfilePage.jsx` (re-exported as `HodProfilePage` and `ClusterHeadProfilePage`), `components/ui/Avatar.jsx`, `components/ui/ProfilePhotoUploader.jsx`.

- **Student profile:**
  - Identity: name, e-mail, a "Student representative" chip, registration number, branch, section, semester, department, joined date.
  - A "My mentor" panel.
  - Contact: the e-mail is read-only; the mobile number (10 digits) is saved with a direct `user_profiles.update({phone})`, toast "Contact details updated."
  - A "Change password" link.
  - The Form A view/edit panel (§4.3).
  - The photo, read-only.
- **Faculty, HOD and cluster-head profile:**
  - Read-only identity: staff id, branch, department, joined date; faculty also see capacity and availability.
  - An editable phone.
  - A "Change password" link.
  - The avatar is shown but there is **no upload control**. Staff can only have a photo if one is set outside the UI.
- **Avatars** are private objects shown through signed URLs (1 hour), cached per path. With no photo, a neutral silhouette is shown (never initials). Any signed-in user may read any profile photo (bucket policy `profile_photos_select_any`).

### 4.23 Audit log and rate limiting

**Status:** Implemented.

**Where:** `api/_lib/request-guards.js`; SQL `consume_rate_limit`, `write_audit_entry`; tables `api_rate_limits`, `audit_log`.

**Rate limiting.**

- Rate limiting is **fixed-window** and backed by Postgres, so it holds across serverless instances.
- `enforceRateLimit(ctx, {key, max, windowSeconds})` calls `consume_rate_limit('<key>:<profileId>', max, window)` with the service role.
- The function upserts a counter for the window starting at `floor(epoch / window) * window` and returns `count <= max`.
- With 1% probability it also deletes rows older than a day.
- When the limit is exceeded the API returns 429 "Too many requests. Please wait N seconds and try again."
- If the limiter itself errors, the request is **allowed** (fail open).

**Limits:**

| Bucket | Limit |
|---|---|
| `provision-accounts` | 20 / 60 s |
| `roster-import` | 200 / 300 s |
| `faculty-roster:<action>` (POST only) | 60 / 60 s |
| `cycle-job` (POST only) | 40 / 300 s |
| `academic-upload` | 30 / 300 s |
| `faculty-report` | 30 / 60 s |
| `student-report` | 30 / 60 s |

**Audit.**

- `recordAuditEntry` calls `write_audit_entry(actor, action, entity_type, entity_id, metadata, ip, user_agent)`.
- It is executable **only by `service_role`**, so clients cannot forge entries.
- It never blocks the request: a failure is logged and ignored.
- `audit_log` is append-only, and only the HOD can read it (RLS).
- There is **no UI** that shows the audit log.

**Actions written:**

- `admin.provision_accounts`
- `admin.import_<type>_roster`
- `hod.set_faculty_status`
- `hod.reassign_mentees`
- `hod.run_cycle_job`
- `cluster_head.upload_<action>`
- `report.faculty_activity_pdf`, `report.department_pdf`, `report.student_dossier_pdf`

---

## 5. Functions and logic

This section documents every exported function and every SQL function. The behaviour of features is in §4, and HTTP contracts are in §6.

### 5.1 Server library (`api/_lib`)

**`http-response.js`**

| Export | Behaviour |
|---|---|
| `withApiDefaults(allowedMethods, handler)` | Wraps every endpoint. Steps, in order: (1) `applyBaseHeaders`; (2) `OPTIONS` → 204, empty; (3) a method not in the list → 405 "Method X not allowed on this endpoint" with an `Allow` header; (4) run the handler; (5) catch any throw. An error with `statusCode < 500` is sent as `{success:false, message}` with that status. Anything else is logged with its stack and sent with its own status (500 when it has none) and the fixed message "Something went wrong on our side. Please try again.", so **no 5xx detail reaches the client**. |
| `applyBaseHeaders(req, res)` | Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, `Cache-Control: no-store, no-cache, must-revalidate, private`. CORS rules are listed below the table. It always sends `Access-Control-Allow-Methods: GET,POST,PATCH,OPTIONS` and `Access-Control-Allow-Headers: Content-Type, Authorization`. |
| `sendSuccess(res, message, data = {}, status = 200)` | `{success: true, message, data}` |
| `sendError(res, message, status = 400, details?)` | `{success: false, message[, details]}` |
| `sendJson(res, status, payload)` | Raw JSON writer |
| `ApiError(message, statusCode = 400)` | Error class the wrapper understands |

CORS rules in `applyBaseHeaders`:

- The request `Origin` is echoed back with `Access-Control-Allow-Credentials: true` and `Vary: Origin` **only** if one of these holds:
  1. it is in `ALLOWED_ORIGINS`;
  2. outside production, it is `http(s)://localhost:<port>` or `127.0.0.1:<port>`;
  3. it matches `https://<name>.vercel.app` **and** some `ALLOWED_ORIGINS` entry ends in `.vercel.app`.
- A request **without** an `Origin` header gets no CORS headers but is still served. Server-to-server calls are therefore not blocked by CORS.

**`request-guards.js`**

| Export | Behaviour |
|---|---|
| `requireAuthenticatedUser(req)` | Reads `Authorization: Bearer <jwt>` and verifies the token. Returns `{token, authUser, profile, admin, asUser}`: `admin` is a service-role client, `asUser` is `createUserClient(token)`. Details below the table. |
| `requireRole(ctx, ...roles)` | 403 "Forbidden — this action requires the role: a or b." |
| `clientIp(req)` | First `x-forwarded-for` entry, else the socket address |
| `enforceRateLimit(ctx, {key, max, windowSeconds})` | Calls `consume_rate_limit('<key>:<profileId>', max, window)` with the service role. `false` → 429 "Too many requests. Please wait N seconds and try again." A limiter error is logged and the request is **allowed**. |
| `recordAuditEntry(ctx, req, action, {type, id, metadata})` | Calls `write_audit_entry` with the actor, the IP and the user agent (truncated to 400 characters). A failure is logged, never thrown. |

`requireAuthenticatedUser` in detail:

- No token → 401 "Not authenticated — sign in and try again."
- It then calls `admin.auth.getUser(jwt)`. A bad or expired token → 401 "Your session has expired. Please sign in again."
- It loads `user_profiles` with the service role. No row → 403 "No profile found for this account."; `is_active = false` → 403 "This account has been deactivated."

**`supabase-clients.js`**

- `createAdminClient()` builds a client with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It bypasses RLS, and it is never sent to the browser.
- `createUserClient(jwt)` builds a client with `SUPABASE_URL`, `SUPABASE_ANON_KEY` and a global `Authorization: Bearer <jwt>` header, so RLS applies exactly as in the browser.

**`environment.js`**

`env` is an object of lazy getters, validated on first read:

| Getter | Source and validation |
|---|---|
| `SUPABASE_URL` | Required. All whitespace is stripped; it must look like `http(s)://host`; trailing slashes are removed. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required. Whitespace is stripped; it must have the three-part JWT shape `a.b.c`. |
| `SUPABASE_ANON_KEY` | Same rules as the service-role key |
| `ALLOWED_ORIGINS` | Optional comma-separated list; entries are trimmed and trailing slashes removed |
| `IS_PRODUCTION` | `VERCEL_ENV` (or `NODE_ENV`) equals `production` |
| `TEMPORARY_PASSWORD` | `SSMP_TEMPORARY_PASSWORD`, **with a hard-coded fallback** |

- A missing required variable throws "FATAL: required environment variable X is not set…". A malformed one throws a "does not look like…" / "must be your Supabase project URL…" error.
- `describeConfigHealth()` returns `ok`, `missing` or `malformed` for the three Supabase variables. It never returns values.
- `ALLOWED_EMAIL_DOMAINS` is **not** read here. `input-validation.js` reads it directly from `process.env` at module load.

**`input-validation.js`**

- The schemas are listed with their endpoints in §6.
- `emailSchema`: trim, lower-case, valid e-mail, at most 255 characters. If `ALLOWED_EMAIL_DOMAINS` (comma-separated) is set, the e-mail must end in `@<domain>` for one of them ("Email must belong to one of: …").
- `parseOrThrow(schema, payload)`: on failure, 400 "Invalid request — path: message; …".
- `assertBodySize(req, max = 10 MiB)`: 413 "Request body is too large" when `Content-Length` exceeds the limit.
- `sanitizeSingleLine(value, max = 200)`: collapses CR, LF, tabs and repeated whitespace, then truncates.
- `clusterHeadSetupSchema` is exported but **unused** (the setup goes straight to the RPC).

**`spreadsheet-parser.js`** (formats and aliases in §10.4)

| Export | Returns |
|---|---|
| `parseRosterFile(buffer, filename)` | A plain array of sparse records, `[{rowNumber, …fields}]`. Each record holds only the non-empty fields among `email, full_name, login_id, branch, section, semester_label, phone, mentor_email, parent_name, parent_mobile, parent_email, password, role`; the prototype-less object means a `__proto__` header cannot pollute anything. |
| `parseAttendanceExport(buffer, filename)` | `{meta: {course_code, course_name, section, sections, period_start, period_end, faculty_name, academic_year, academic_session}, records: [{rowNumber, identifier, section, classes_held, classes_attended, attendance_percent}]}` |
| `parseGpaExport(buffer, filename)` | `{meta: {layout, semesters_in_file, graded_semesters, ignored_semesters, has_cgpa}, records}`. ERP records are `{row, identifier, name, cgpa, total_earned_credits, total_required_credits, semesters: [{semester_number, gpa, earned_credits, required_credits}]}`; flat records carry `gpa, semester_number` instead of `semesters`. All values are strings. |
| `parseBacklogExport(buffer, filename)` | `{meta: {semester, exam_session, programme, layout, subject_codes, subjects}, records}`. ERP records are `{row, identifier, name, grades: [{subject_code, subject_name, credits, grade}]}`; hand-made records are `{row, identifier, subject_code, subject_name, grade, credits, is_cleared}`. |
| `parseBlackDotNotice(buffer, filename)` | `{meta: {cases: [{case_number, case_details, students}]}, records: [{row, where, identifier, name, case_number, case_details, incident_date, incident_date_text, hostel_block, room_no, course_branch, mobile_no, previous_record}]}` |
| `parseNoticeDate(text)` | `'YYYY-MM-DD'` for a complete day-first date, otherwise `null` |
| `REGISTRATION_ALIASES` | The accepted registration-number headings (§10.4) |
| `parseMentorMappingFile(buffer, filename)` | A plain array `[{rowNumber, identifier, mentor_email, mentor_name}]` |
| `classifyRole(value)` | `'faculty'`, `'student'` or `null` (substring match, §10.4) |
| `parseSemesterLabel(value)` | The first digit run (or a standalone Roman numeral) as a number if it is 1–8, otherwise `null` |

**`concurrency.js`.** `runPool(items, limit, worker)` runs `worker(item, index)` with at most `limit` in flight and resolves to the results **in input order**. It is used for Auth account creation (pool size 5).

**`pdf-chart-primitives.js`.**

- `PALETTE` (brand colours), `SERIES_COLORS`, `truncate`.
- Drawing helpers: `drawSectionHeading`, `drawStatCards` (4 per row), `drawBarChart`, `drawGroupedBarChart`, `drawLineChart`, `drawDonutChart`, `drawLegend`, `drawHorizontalBars`, `drawTable` (`maxRows`, `emptyMessage`).

Everything is drawn with vector primitives: no images except the logo, and no HTML rendering.

**`report-document-builder.js`.** `buildFacultyActivityPdf(report)`, `buildStudentDossierPdf(report)` and `buildDepartmentReportPdf(report)` take the JSON of the matching SQL function and return PDF bytes. They are A4, with the logo, a title block, KPI cards, charts and tables, and footers with page numbers. The sections are listed in §4.18.

**Endpoint-private helpers**

| Helper | File | Behaviour |
|---|---|---|
| `fetchExistingEmails(admin)` | `import-roster-spreadsheet.js` | Every `user_profiles.email`, lower-cased, read in pages of 1,000. A page error ends the read silently. |
| `planRow(...)` | `import-roster-spreadsheet.js` | Per-row validation and classification into create, skip or fail (§4.13) |
| `createAccount(...)` | `import-roster-spreadsheet.js` | `auth.admin.createUser` with one retry on a rate-limit error (1.5 s); then the profile update for mentor and parent fields |
| `createMissingMentors(admin, rows)` | `upload-academic-data.js` | Creates faculty accounts for unknown mentor e-mails (pool 5). Returns `{created, errors}`. |
| `toClientError(error, fallback)` | `upload-academic-data.js`, `manage-faculty-roster.js`, `run-cycle-job.js` (three copies) | Turns a Supabase error into an `ApiError`. A transport failure (`fetch failed`, `ENOTFOUND`, `ECONNREFUSED`, invalid header) becomes 502 with a configuration hint. **Anything else becomes 400 with the raw database message.** Because the wrapper hides the message of every status ≥ 500, the hint never reaches the client: the client receives HTTP 502 with the generic "Something went wrong on our side…" text. |

### 5.2 Frontend library, hooks and contexts

| Module | Export | Behaviour |
|---|---|---|
| `lib/supabaseClient.js` | `supabase` | `createClient(url, anonKey, {auth: {persistSession, autoRefreshToken, detectSessionInUrl, flowType: 'pkce', storageKey: 'ssmp.auth.session'}, realtime: {params: {eventsPerSecond: 8}}, global: {headers: {'x-application-name': 'ssmp-portal'}}})`. The env values are whitespace-cleaned. If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing, the module **replaces the page with a configuration-error message and throws** at boot. |
| | `getAccessToken()` | The current session's access token, or `null` |
| `lib/apiClient.js` | `apiClient.get(path, query)`, `.post(path, body)` | Details below the table. |
| | `apiClient.downloadFile(path, query, fallbackName)` | GET, then saves the blob under the `Content-Disposition` filename (or the fallback). A non-2xx response throws the JSON `message` or "Download failed with status N". |
| `lib/fileUpload.js` | `validateUpload(file)` | Maximum 5 MB; PNG, JPEG, JPG, WEBP or PDF. Returns an error string or `null`. |
| | `validateProfilePhoto(file)` | Maximum 3 MB; PNG, JPEG, JPG or WEBP |
| | `uploadPrivateFile(bucket, userId, file, prefix)` | Uploads to `<userId>/<prefix>-<safe-name>-<timestamp>.<ext>` (`upsert: false`) and returns the object path |
| | `createSignedUrl(bucket, path, seconds = 300)` | Signed download URL |
| | `BUCKETS` | `FORM_A`, `ACHIEVEMENTS`, `PROFILE_PHOTOS`, `ROSTERS`. `ROSTERS` is unused. |
| `lib/formatters.js` | `formatDate`, `formatDateTime`, `formatRelativeTime`, `formatHours` ("—" for 0 or null), `formatNumber`, `initialsOf`, `percentage` | Pure presentation helpers |
| | `describeError(err, fallback)` | Maps errors to readable text; the mapping is listed below the table. |
| `hooks/useAsyncAction.js` | `useAsyncAction()` → `{run, pending}` | `run(fn, {successMessage, onSuccess})`. `successMessage` may be a function of the result. Errors become `toast.error(describeError(err))`. |
| `hooks/useDashboardMetrics.js` | `useDashboardMetrics()` → `{metrics, loading, error, reload}` | `rpc('get_dashboard_metrics')` |
| `hooks/useRealtimeQueries.js` | `useRealtimeQueries({status, category, search, pageSize = 25})` → `{queries, loading, error, page, setPage, pageCount, total, reload}` | The paged, filtered, live list (§4.4) |
| | `useQueryThread(queryId)` → `{query, messages, loading, error, reload, appendMessage}` | One query and its messages, live |
| `context/AuthProvider.jsx` | `useAuth()` → `{session, profile, user, role, loading, isAuthenticated, signIn, signOut, changePassword, sendPasswordReset, refreshProfile}` | Details below the table. |
| `context/NotificationProvider.jsx` | `useNotifications()` → `{notifications, unreadCount, loading, markRead, markAllRead, reload}` | 30 most recent, live; details in §4.21 |
| `context/ToastProvider.jsx` | `useToast()` → `{show, dismiss, success, error, warning, info}` | Transient toasts; errors stay for 6.5 s |

More detail on three of the entries above:

- **`apiClient.get` / `.post`.**
  - The base URL is `VITE_API_BASE_URL`, normalised so that it ends in `/api`; the default is `/api`.
  - Every call sends `Authorization: Bearer <token>`. With no token it throws "Your session has expired. Please sign in again."
  - A network failure gives "Could not reach the API at <base>. Check that VITE_API_BASE_URL is set to "/api" and that the serverless functions are deployed."
  - A JSON response is unwrapped to `payload.data`. When `success === false` or the status is not 2xx, the call throws `payload.message`, so **the server's `message` is never shown on success**.
- **`describeError` mapping:**
  - "violates check constraint" → "Some of the values entered are not valid. Please review the highlighted fields."
  - "duplicate key value" → "That record already exists."
  - "invalid login credentials" → "Incorrect email or password."
  - "email not confirmed" → "This account has not been confirmed yet. Please contact your HOD."
  - Anything else is shown as the raw message; an error with no message gives the fallback.
- **`AuthProvider`.** It loads the profile and the mentor, and reloads the profile on `SIGNED_IN` / `USER_UPDATED` and on realtime `user_profiles` updates.
  - `signIn` lower-cases the e-mail and refuses inactive accounts.
  - `changePassword` calls `updateUser` and then clears `must_change_password`.
  - `sendPasswordReset` uses the redirect `/reset-password`.

### 5.3 SQL function catalogue

All functions live in schema `public`. Read the table this way:

- **Security:**
  - `definer` means SECURITY DEFINER: the function runs as its owner, bypasses RLS, and must check the caller itself.
  - `invoker` means the function runs with the caller's rights.
  - Every definer function pins `search_path` to `public, pg_temp`.
- **Execute:** the roles that hold EXECUTE. `authenticated` means any signed-in browser can call it with `supabase.rpc()`, whether or not a page does.
- **Used by** is generated mechanically from the repository and the catalogue. It lists:
  - code files that name the function (dead `components/tickets/*` excluded);
  - other SQL functions that call it;
  - triggers bound to it;
  - the number of RLS or storage policies that use it.

  A function with nothing in this column is unused.
- **Purpose** is written against the current function body.

79 functions.

| Function | Returns | Security | Execute | Migrations | Used by | Purpose |
|---|---|---|---|---|---|---|
| `assign_query_code()` | `trigger` | invoker, volatile | owner only | 0004, 0031 | trigger `trg_assign_query_code` on `support_queries` | BEFORE INSERT trigger on `support_queries`: sets `query_code = 'AN-' \|\| nextval(query_code_seq)` (AN-1001 onwards). |
| `can_access_query(p_query_id uuid)` | `boolean` | definer, stable | authenticated, service_role | 0007, 0031 | 1 RLS/storage policy | True when the caller is the query's student, its mentor, or the HOD. Used by the `query_messages` SELECT policy. |
| `can_access_student(p_student_id uuid)` | `boolean` | definer, stable | authenticated, service_role | 0007 | 10 RLS/storage policies | True for the student themself, their assigned mentor, or the HOD. The main read-scope helper in RLS and storage policies. |
| `can_view_student_gpa(p_student_id uuid)` | `boolean` | definer, stable | authenticated, service_role | 0007 | SQL: `get_student_dossier`; 1 RLS/storage policy | True for the student and the HOD; for the mentor, `coalesce(gpa_sharing_enabled, true)`. Gates `student_semester_gpas` reads and the dossier GPA. |
| `confirm_query_resolution(p_query_id uuid, p_response confirmation_response, p_comment text)` | `support_queries` | definer, volatile | authenticated | 0009, 0018, 0031 | `ResolutionConfirmation.jsx` | Student answers "was it fixed?". `yes` → confirmed (closed). `no` → reopened, In Progress, `reopen_count+1`; refused at the cap of 3. Comment ≤ 1000. Writes a system message. |
| `consume_rate_limit(p_bucket_key text, p_max_requests integer, p_window_seconds integer)` | `boolean` | definer, volatile | service_role | 0015 | `request-guards.js` | Fixed-window counter for the API: upserts `(bucket_key, window_start)`, 1% chance to purge rows > 1 day old, returns `count <= max`. Service role only. |
| `create_at_risk_meeting_link(p_meeting_id uuid)` | `at_risk_meetings` | definer, volatile | authenticated, service_role | 0022 | SQL: `dispatch_at_risk_meetings` | **Placeholder.** Checks mentor/HOD/no-JWT, then returns the meeting unchanged (`TODO(provider)`: Teams/Meet link creation is not implemented). |
| `create_support_query(p_subject text, p_category query_category, p_description text, p_priority query_priority)` | `support_queries` | definer, volatile | authenticated | 0009, 0031 | `CreateQueryModal.jsx` | Student raises a query: active student with a mentor, subject ≤ 200, description ≤ 5000, fewer than 20 unresolved. Inserts the query and its first message. |
| `current_user_role()` | `user_role` | definer, stable | authenticated, service_role | 0007 | — (unused) | Returns the caller's `user_profiles.role`. **Unused.** |
| `dispatch_at_risk_meetings(p_job_run_id uuid)` | `jsonb` | definer, volatile | authenticated, service_role | 0022 | SQL: `run_cycle_job` | HOD/no JWT. For every flagged student with a mentor and no open meeting, inserts an `awaiting_link` meeting and calls the link stub. Returns `{meetings_created, already_open, without_mentor}`. |
| `enqueue_notification(p_recipient uuid, p_actor uuid, p_type notification_type, p_title text, p_body text, p_query uuid, p_link text)` | `void` | definer, volatile | owner only | 0011, 0031 | SQL: 13 functions | The only notification writer. Skips a NULL recipient and recipient = actor. Not executable by clients. |
| `escalate_query_to_hod(p_query_id uuid, p_note text)` | `support_queries` | definer, volatile | authenticated | 0018, 0030, 0031 | `FacultyQueryDetailPage.jsx`, `FacultyQueryQueuePage.jsx` | Mentor (or HOD) refers a query to the HOD: any status, once, note ≤ 1000. Notifies the active HOD matching the **caller's** `hod_email` (else all active HODs except the caller) and the student; writes a system message. |
| `evaluate_all_students_risk()` | `jsonb` | definer, volatile | authenticated, service_role | 0022 | SQL: `run_cycle_job` | HOD/no JWT. Runs `evaluate_student_risk` for every active student. Returns `{evaluated, at_risk}`. |
| `evaluate_student_risk(p_student_id uuid)` | `student_risk_flags` | definer, volatile | authenticated, service_role | 0022, 0025 | SQL: `evaluate_all_students_risk`, `record_attendance_batch`, `record_backlog_batch`, `record_gpa_batch` | Recomputes one student's flags: mean latest attendance < 75, GPA of the latest semester < 6, uncleared backlogs ≥ 1. Upserts `student_risk_flags`. **No caller check** (see §8.9). |
| `get_active_survey_for_student()` | `jsonb` | definer, stable | authenticated | 0023 | `StudentSurveyPage.jsx` | Student only. Returns the active cycle, whether the caller has submitted, and the active questions. |
| `get_cycle_job_status()` | `jsonb` | definer, stable | authenticated | 0024 | `run-cycle-job.js` | HOD only. Job schedule rows, the last 25 runs, active survey cycle, at-risk count, open meeting count. |
| `get_dashboard_metrics()` | `jsonb` | definer, stable | authenticated | 0013, 0031 | `useDashboardMetrics.js` | Role-aware dashboard numbers: student / faculty / everyone else (HOD branch, also reached by cluster heads). Category counts are legacy-only. |
| `get_department_faculty_report(p_from date, p_to date)` | `jsonb` | definer, stable | authenticated | 0019, 0031 | `FacultyActivityReportPage.jsx`, `faculty-activity-report.js` | HOD only. Department-wide report JSON for a period (summary, by category/status, monthly trend, per-faculty rows). |
| `get_faculty_activity_report(p_faculty_id uuid, p_from date, p_to date)` | `jsonb` | definer, stable | authenticated | 0013, 0030, 0031 | `FacultyActivityReportPage.jsx`, `faculty-activity-report.js` | Faculty (self only) or HOD (anyone). Activity report JSON for a period; defaults to the last 90 days. |
| `get_mentor_group_queries()` | `jsonb` | definer, stable | authenticated | 0017, 0031 | `StudentGroupQueriesPage.jsx` | Star mentee only. Every query of the mentor group, narrow projection (no ids, bodies, e-mails or registration numbers). |
| `get_mentor_group_survey_status()` | `TABLE(cycle_id uuid, cycle_number integer, opens_on date, closes_on date, student_name text, registration_no text, section text, has_submitted boolean, is_me boolean)` | definer, stable | authenticated | 0023 | `StudentSurveyTrackingPage.jsx` | Star mentee only. The group's active students with has-submitted status for the active cycle. |
| `get_student_dossier(p_student_id uuid)` | `jsonb` | definer, stable | authenticated | 0013, 0031, 0035 | `FacultyMenteeDetailPage.jsx`, `student-dossier-report.js` | Student themself, mentor or HOD. Everything about one student: profile, mentor, Form A, GPAs with credits and the official `cgpa_record` (if visible; `gpa_stats.cgpa` is the official CGPA when there is one, flagged by `cgpa_official`), backlogs (open first), black dots, achievements, query summary and history. |
| `guard_protected_profile_columns()` | `trigger` | invoker, volatile | PUBLIC | 0007, 0021, 0035 | trigger `trg_guard_protected_profile_columns` on `user_profiles` | BEFORE UPDATE trigger on `user_profiles`: blocks self-service changes to protected columns unless HOD, no JWT, or `ssmp.trusted_operation = on`. |
| `handle_auth_user_email_change()` | `trigger` | definer, volatile | PUBLIC | 0002 | trigger `trg_on_auth_user_email_changed` on `users` | AFTER UPDATE trigger on `auth.users`: copies a changed e-mail to `user_profiles.email`. |
| `handle_new_auth_user()` | `trigger` | definer, volatile | PUBLIC | 0002, 0021 | trigger `trg_on_auth_user_created` on `users` | AFTER INSERT trigger on `auth.users`: creates the `user_profiles` row from `raw_user_meta_data` (role of the four, else student; department default 'IoT & IS'; `must_change_password` default true). |
| `is_blank_mark(p_value text)` | `boolean` | invoker, immutable | authenticated, service_role | 0035 | SQL: `record_gpa_batch`, `record_backlog_batch` | True for an empty cell or an ERP placeholder (`-`, `--`, `NA`, `N/A`): "nothing here". |
| `is_cluster_head()` | `boolean` | definer, stable | authenticated, service_role | 0021 | SQL: 6 functions; 2 RLS/storage policies | Caller is an active cluster head. |
| `is_faculty()` | `boolean` | definer, stable | authenticated, service_role | 0007 | 3 RLS/storage policies | Caller is an active faculty member. |
| `is_hod()` | `boolean` | definer, stable | authenticated, service_role | 0007 | SQL: 31 functions; 20 RLS/storage policies | Caller is an active HOD. |
| `is_mentor_of(p_student_id uuid)` | `boolean` | definer, stable | authenticated, service_role | 0007 | SQL: `can_access_student`, `can_view_student_gpa`, `get_student_dossier`, `set_achievement_verification`, `set_star_mentee` | Caller is the assigned mentor of the given student. |
| `is_non_blank(value text)` | `boolean` | invoker, immutable | PUBLIC | 0001 | SQL: 6 functions | `value is not null and length(btrim(value)) > 0`. Used in CHECK constraints and RPC validation. |
| `is_student()` | `boolean` | definer, stable | authenticated, service_role | 0007 | SQL: `get_active_survey_for_student`, `set_gpa_sharing`, `submit_survey_response`, `upsert_semester_gpa`; 4 RLS/storage policies | Caller is an active student. |
| `map_students_to_mentors(p_rows jsonb)` | `jsonb` | definer, volatile | authenticated, service_role | 0027, 0033 | `upload-academic-data.js` | Cluster head/HOD/no JWT. Sets `assigned_mentor_id` per row (registration no. → mentor e-mail), skipping unchanged; per-row errors. Triggers reassignment notifications and log. |
| `mark_all_notifications_read()` | `integer` | definer, volatile | authenticated | 0010 | `NotificationProvider.jsx` | Marks all of the caller's unread notifications read; returns the count. |
| `max_resolution_rejections()` | `integer` | invoker, immutable | authenticated, service_role | 0018 | SQL: `confirm_query_resolution` | Returns 3: how many times a student may reject a resolution. |
| `my_mentor_id()` | `uuid` | definer, stable | authenticated, service_role | 0007, 0016 | 2 RLS/storage policies | The caller's `assigned_mentor_id`. SECURITY DEFINER so policies can use it without recursion (0016). |
| `notify_on_achievement_verified()` | `trigger` | definer, volatile | PUBLIC (default) | 0011 | trigger `trg_notify_achievement_verified` on `student_achievements` | Trigger: verification false → true notifies the student. |
| `notify_on_at_risk_meeting()` | `trigger` | definer, volatile | PUBLIC (default) | 0022 | trigger `trg_notify_at_risk_meeting` on `at_risk_meetings` | Trigger: a new at-risk meeting notifies the mentor and stamps `mentor_notified_at`. |
| `notify_on_counselling_request()` | `trigger` | definer, volatile | PUBLIC (default) | 0029 | trigger `trg_notify_counselling` on `counselling_requests` | Trigger: a new request notifies the mentor; a changed `mentor_note` notifies the student. |
| `notify_on_mentor_reassignment()` | `trigger` | definer, volatile | PUBLIC (default) | 0011 | trigger `trg_notify_mentor_reassignment` on `user_profiles` | Trigger: a changed `assigned_mentor_id` writes `mentor_reassignment_log` and notifies the student, the new mentor and the old mentor. |
| `notify_on_query_created()` | `trigger` | definer, volatile | PUBLIC (default) | 0011, 0027, 0031 | trigger `trg_notify_query_created` on `support_queries` | Trigger: a new query notifies its mentor (skipped for CR-report items with `mom_id`). |
| `notify_on_query_message()` | `trigger` | definer, volatile | PUBLIC (default) | 0011, 0031 | trigger `trg_notify_query_message` on `query_messages` | Trigger: a non-system message notifies the other party (student → mentor; anyone else → student). |
| `notify_on_query_resolution_change()` | `trigger` | definer, volatile | PUBLIC (default) | 0011, 0031 | trigger `trg_notify_query_resolution` on `support_queries` | Trigger: resolution changes notify (pending → student; confirmed / reopened / rated → mentor). |
| `notify_on_risk_flag_change()` | `trigger` | definer, volatile | PUBLIC (default) | 0022 | trigger `trg_notify_risk_flag_change` on `student_risk_flags` | Trigger: at-risk state changes notify the mentor. **Bug:** a first evaluation that is not at risk sends "no longer at-risk". |
| `notify_on_star_mentee_change()` | `trigger` | definer, volatile | PUBLIC (default) | 0011, 0017, 0031 | trigger `trg_notify_star_mentee` on `user_profiles` | Trigger: becoming the star mentee notifies the student. |
| `open_survey_cycle(p_trigger cycle_job_trigger, p_job_run_id uuid, p_window_days integer)` | `survey_cycles` | definer, volatile | authenticated, service_role | 0023 | SQL: `run_cycle_job` | HOD/no JWT. Deactivates the active cycle, opens cycle n+1 for `interval_days` (inclusive), notifies every active student. |
| `post_query_message(p_query_id uuid, p_body text)` | `query_messages` | definer, volatile | authenticated | 0009, 0031 | `QueryConversation.jsx` | Participant or HOD posts a message (≤ 5000). First staff reply sets `first_response_at`; a staff reply moves Open → In Progress. |
| `rate_support_query(p_query_id uuid, p_rating smallint)` | `support_queries` | definer, volatile | authenticated | 0009, 0031 | `SatisfactionRating.jsx` | Query owner rates a Resolved query 1–5, once. |
| `reassign_mentees(p_student_ids uuid[], p_to_mentor_id uuid, p_reason text)` | `integer` | definer, volatile | authenticated, service_role | 0015 | `manage-faculty-roster.js` | HOD only. Moves up to 500 students to an active mentor (no capacity or ownership check). Log rows get the reason. Queries are moved by the API, not here. |
| `record_attendance_batch(p_course_code text, p_course_name text, p_section text, p_period_start date, p_period_end date, p_filename text, p_rows jsonb)` | `jsonb` | definer, volatile | authenticated, service_role | 0022, 0025, 0027, 0033 | `seed-demo-accounts.mjs`, `upload-academic-data.js` | Cluster head/HOD/no JWT. One attendance upload: course by code (caller's subjects), per-row sections, upserts attendance for the period, re-evaluates risk. |
| `record_backlog_batch(p_semester_number smallint, p_exam_session text, p_filename text, p_rows jsonb, p_subject_codes text[] default null)` | `jsonb` | definer, volatile | authenticated, service_role | 0022, 0033, 0035 | `seed-demo-accounts.mjs`, `upload-academic-data.js` | Cluster head/HOD/no JWT. One backlog upload for a semester: Defaulter Grade rows (a grade list per student) or one subject per row; matches subject codes case-insensitively; with `p_subject_codes`, clears every open backlog in those subjects the file no longer marks. Re-evaluates risk. (0035 dropped the four-argument version.) |
| `record_black_dot_batch(p_filename text, p_rows jsonb)` | `jsonb` | definer, volatile | authenticated, service_role | 0035 | `seed-demo-accounts.mjs`, `upload-academic-data.js` | Cluster head/HOD/no JWT. One PB notice: a black dot per student per case, upsert on `(student, lower(case_number))`, with the notice's name checked against the account. No risk re-evaluation. |
| `record_gpa_batch(p_semester_number smallint, p_filename text, p_rows jsonb)` | `jsonb` | definer, volatile | authenticated, service_role | 0022, 0025, 0033, 0035 | `seed-demo-accounts.mjs`, `upload-academic-data.js` | Cluster head/HOD/no JWT. One GPA upload: every graded semester per student with credits, plus the official CGPA into `student_cgpas`; a row is all or nothing; values validated with `try_numeric`; rows of dashes skipped. The flat one-semester shape still works. Re-evaluates risk. |
| `request_counselling(p_concern text)` | `counselling_requests` | definer, volatile | authenticated | 0029, 0031 | `StudentCounsellingPage.jsx` | Student with a mentor sends a concern (≤ 3000); at most 5 not-closed requests. |
| `request_form_a_unlock()` | `void` | definer, volatile | authenticated | 0010 | — (unused) | **Dead** (no caller; Form A has been editable since 0017). Sets `unlock_requested` on a locked form. |
| `resolve_student_ids(p_identifiers text[])` | `jsonb` | definer, stable | authenticated, service_role | 0033, 0035 | SQL: `map_students_to_mentors`, `record_attendance_batch`, `record_backlog_batch`, `record_black_dot_batch`, `record_gpa_batch` | Batch registration number → student id map for uploads (active students; **registration number only**). Cluster head, HOD or no JWT only (S3 closed in 0035). |
| `resolve_students_for_upload(p_identifiers text[])` | `TABLE(student_id uuid, registration_no text, full_name text, section text, matched_on text)` | definer, stable | authenticated, service_role | 0021 | — (unused) | **Dead** (no caller since 0033). Cluster head/HOD identifier lookup returning matched students. |
| `resolve_support_query(p_query_id uuid, p_note text)` | `support_queries` | definer, volatile | authenticated | 0009, 0031 | `FacultyCrReportsPage.jsx`, `FacultyQueryDetailPage.jsx` | Mentor or HOD resolves: Resolved + pending_confirmation, `resolved_by/at`, system message (optional note). |
| `respond_to_counselling(p_request_id uuid, p_note text, p_close boolean)` | `counselling_requests` | definer, volatile | authenticated | 0029 | `FacultyCounsellingPage.jsx` | Assigned mentor replies (≤ 3000): overwrites `mentor_note`, sets acknowledged or closed. |
| `run_all_cycle_jobs_now(p_note text)` | `jsonb` | definer, volatile | authenticated, service_role | 0024 | `run-cycle-job.js` | HOD/no JWT. Runs at_risk_sweep → at_risk_meeting_dispatch → survey_cycle as manual (not the reminder sweep). |
| `run_cycle_job(p_job_type cycle_job_type, p_trigger cycle_job_trigger, p_note text)` | `jsonb` | definer, volatile | authenticated, service_role | 0024 | `run-cycle-job.js`, `seed-demo-accounts.mjs`; SQL: `run_all_cycle_jobs_now`, `run_due_cycle_jobs` | HOD/no JWT. Runs one job with a `cycle_job_runs` row; manual runs leave `next_run_due_on`; scheduled runs advance it. A failure re-raises (rolls back the run row). |
| `run_due_cycle_jobs()` | `jsonb` | definer, volatile | authenticated, service_role | 0024 | — (unused) | **Dead** (no caller, no scheduler). Would run every enabled job due today as `scheduled`. |
| `send_survey_reminders()` | `jsonb` | definer, volatile | authenticated, service_role | 0023 | SQL: `run_cycle_job` | HOD/no JWT. Notifies active students without a response in the active cycle. |
| `set_achievement_verification(p_achievement_id uuid, p_verified boolean)` | `student_achievements` | definer, volatile | authenticated | 0010 | `FacultyMenteeDetailPage.jsx` | Mentor or HOD sets `verified_by_faculty` on an achievement. |
| `set_at_risk_meeting_status(p_meeting_id uuid, p_status at_risk_meeting_status)` | `at_risk_meetings` | definer, volatile | authenticated | 0022 | `FacultyAtRiskPage.jsx` | Organising mentor or HOD sets any meeting status; stamps completed/cancelled time. No transition validation. |
| `set_faculty_employment_status(p_faculty_id uuid, p_status employment_status, p_available boolean)` | `user_profiles` | definer, volatile | authenticated, service_role | 0015 | `manage-faculty-roster.js` | HOD only. Sets employment status; a non-active status forces `available_for_reassignment = false` unless `p_available` is given. |
| `set_gpa_sharing(p_enabled boolean)` | `boolean` | definer, volatile | authenticated | 0010 | — (unused) | No caller in the code (the UI toggle was removed), but still executable by students: sets their own `gpa_sharing_enabled`. |
| `set_mentor_department_and_hod(p_department text, p_hod_email text)` | `integer` | definer, volatile | authenticated | 0030, 0031 | `FacultyMenteesPage.jsx` | Faculty only. Sets own `department` and `hod_email` (must be an active HOD) and copies the department to all mentees. |
| `set_query_in_progress(p_query_id uuid)` | `support_queries` | definer, volatile | authenticated | 0027, 0031 | `FacultyCrReportsPage.jsx` | Mentor or HOD marks a query In Progress (resolution none); system message. Used for CR-report items, but accepts any query not yet confirmed. |
| `set_star_mentee(p_student_id uuid, p_is_star boolean)` | `user_profiles` | definer, volatile | authenticated | 0010 | `FacultyMenteeDetailPage.jsx`, `FacultyMenteesPage.jsx` | Mentor or HOD sets/clears the star mentee; at most one per mentor (row lock, clears others; no unique index). |
| `set_updated_at_timestamp()` | `trigger` | invoker, volatile | PUBLIC | 0001 | 16 `updated_at` triggers | BEFORE UPDATE trigger: `new.updated_at = now()`. |
| `submit_cluster_head_setup(p_courses jsonb)` | `SETOF cluster_head_courses` | definer, volatile | authenticated | 0021, 0032 | `ClusterHeadCoursesPage.jsx`, `ClusterHeadSetupPage.jsx` | Cluster head only. Replaces the subject list (1–60, unique codes); deletes removed codes (cascades attendance); marks setup complete. |
| `submit_mom_report(p_meeting_date date, p_notes text, p_items jsonb, p_students_present integer, p_students_total integer)` | `mom_records` | definer, volatile | authenticated | 0027, 0031 | `StudentCrReportPage.jsx` | Star mentee files a CR report (≤ 12 items); each item becomes a query with `mom_id`; one summary notification to the mentor (each item's first message also notifies). |
| `submit_student_form_a(p_payload jsonb)` | `student_form_a_profiles` | definer, volatile | authenticated | 0010, 0017 | `StudentOnboardingFormPage.jsx`, `StudentProfilePage.jsx` | Student submits/updates Form A (upsert), marks onboarding complete, copies phone/section/branch to the profile. |
| `submit_survey_response(p_cycle_id uuid, p_answers jsonb)` | `survey_responses` | definer, volatile | authenticated | 0023 | `StudentSurveyPage.jsx` | Student answers the active cycle once; all active questions, ratings 1–5; stores the current mentor. |
| `try_numeric(p_value text)` | `numeric` | invoker, immutable | authenticated, service_role | 0035 | SQL: `record_gpa_batch`, `record_backlog_batch`, `record_black_dot_batch` | A plain decimal, or NULL instead of an error, so a stray word in a numeric cell is a row error (B7). |
| `unlock_student_form_a(p_student_id uuid)` | `void` | definer, volatile | authenticated | 0010 | — (unused) | **Dead** (no caller). HOD only; clears the lock **and sets `form_a_completed = false`**, which would send the student back through onboarding. |
| `upsert_semester_gpa(p_semester_number smallint, p_gpa numeric)` | `student_semester_gpas` | definer, volatile | authenticated | 0010, 0021 | `StudentAcademicsPage.jsx` | Student self-reports a semester GPA (1–8, 0–10); refused for department-published semesters. |
| `write_audit_entry(p_actor_id uuid, p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb, p_ip_address text, p_user_agent text)` | `void` | definer, volatile | service_role | 0015 | `request-guards.js` | Inserts into `audit_log`. Executable by `service_role` only. |

---

## 6. API reference

### 6.1 Conventions (all endpoints)

- **Base path.** `/api`. Locally, `vercel dev` serves it; in production, Vercel does. The browser reaches it through `VITE_API_BASE_URL`, default `/api`.
- **Authentication.** `Authorization: Bearer <Supabase access token>` on every endpoint except `/api/health`. The token is verified with `auth.getUser`, then the caller's `user_profiles` row is loaded and must be active (§5.1).
- **Envelope.**
  - Success: `{"success": true, "message": "<human text>", "data": {…}}`.
  - Error: `{"success": false, "message": "<human text>"}`.
  - The browser client returns only `data` on success. On failure it throws the `message`.
  - PDFs are sent raw (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="…"`).
- **Status codes.**

  | Status | Meaning |
  |---|---|
  | 200 / 201 | Success |
  | 204 | `OPTIONS` |
  | 400 | Validation failure, or a database error with its message |
  | 401 | Missing or expired token |
  | 403 | No profile, inactive, wrong role, the setup gate, or (report endpoints only) a permission error `42501` from the database. Other endpoints return database errors as 400. |
  | 404 | No report data |
  | 405 | Wrong method |
  | 413 | Body too large |
  | 429 | Rate limited |
  | 500 / 502 | Anything unexpected (500), or a database transport failure caught by `toClientError` (502). The message is always generic; the detail goes only to the server log. |

- **Headers and CORS.** See §5.1. Vercel additionally adds `Cache-Control: no-store` for `/api/*`.
- **Handler anatomy**, in order:
  1. `withApiDefaults`: CORS, headers, method check.
  2. `assertBodySize`, for uploads.
  3. `requireAuthenticatedUser`.
  4. `requireRole`.
  5. `enforceRateLimit`.
  6. `parseOrThrow(zodSchema)`.
  7. Work, preferring `context.asUser` (RLS) and using `context.admin` only when necessary.
  8. `recordAuditEntry`.
  9. `sendSuccess`.
- **Runtime.** Node ≥ 20, ESM, 1,024 MB, **30 s maximum duration** (`vercel.json`). The two upload endpoints raise the body-parser limit to 10 MB (`export const config`). Vercel's own request-body limit for functions (4.5 MB, a platform limit) is lower than both that and the 8,000,000-character base64 cap, so in practice it is the effective upload limit: roughly 3.3 MB of file.

### 6.2 `GET /api/health`

| | |
|---|---|
| **Auth** | None |
| **Purpose** | Liveness and configuration readiness |
| **Response 200** | `data: {status: "ok", timestamp, environment: VERCEL_ENV ?? NODE_ENV ?? "development", configured: {supabase_url, supabase_service_role_key, supabase_anon_key}}` |
| **Notes** | Each `configured` value is `"ok"`, `"missing"` or `"malformed"`. Values are never returned. The message is "SSMP API is running". Not called by the frontend; it is for operators. |

### 6.3 `POST /api/admin/provision-user-accounts`

| | |
|---|---|
| **Roles** | `hod` |
| **Rate limit** | `provision-accounts`: 20 per 60 s |
| **Body limit** | 2 MB (`assertBodySize`) |
| **Request** | `{"accounts": [ … 1–500 × provisionUserSchema ]}` |
| **Response 201** | `data: {created: [{id, email, full_name, role, login_id, temporary_password}], skipped: [{email, reason}], failed: [{email, reason}]}`. Message: "Created n account(s). s skipped, f failed." |
| **Errors** | 400 "No accounts could be created. First error: …" when every account failed and none were skipped; the usual 400/401/403/413/429 |
| **Audit** | `admin.provision_accounts`, with `{requested, created, skipped, failed}` |
| **Caller** | `components/hod/AddAccountModal.jsx` (sends one account). It shows the credentials view; an empty `created` produces an error toast with the first reason. |

`provisionUserSchema` fields:

| Field | Rule |
|---|---|
| `email` | `emailSchema` (domain allow-list applies) |
| `full_name` | 2–120 |
| `role` | `student`, `faculty`, `hod` or `cluster_head` |
| `login_id` | ≤ 40, optional |
| `branch` | ≤ 60 |
| `section` | ≤ 10 |
| `semester_label` | ≤ 40 |
| `department` | ≤ 80 |
| `phone` | exactly 10 digits, optional |
| `assigned_mentor_id` | uuid, optional |
| `send_invite_email` | boolean, **ignored** |

Processing, per account:

1. If `user_profiles.email` matches (case-insensitive) → skipped: "An account with this email already exists".
2. `auth.admin.createUser({email, password: TEMPORARY_PASSWORD, email_confirm: true, user_metadata: {role, full_name, login_id, branch, section, semester_label, department (default 'IoT & IS'), phone, must_change_password: true}, app_metadata: {role}})`. An error → failed.
3. If `assigned_mentor_id` is given **and the role is `student`**, a service-role `update user_profiles set assigned_mentor_id`. For other roles the field is silently ignored. Failure → failed, "Account created but mentor assignment failed: …", but the account remains.

### 6.4 `POST /api/admin/import-roster-spreadsheet`

| | |
|---|---|
| **Roles** | `cluster_head`, `hod` (no setup gate) |
| **Rate limit** | `roster-import`: 200 per 300 s |
| **Body limit** | 10 MB (body parser) plus `assertBodySize` |
| **Request** (`rosterImportSchema`) | See the table below. |
| **Response 201** | `data: {batch_id, total_rows, offset, next_offset, processed_through, faculty_created, student_created, created: [{row, id, email, full_name, role, login_id, temporary_password, password_from_file}], skipped: [{row, email, reason}], failed: [{row, email, reason}]}` |
| **Errors** | 400 for parser errors (§10.4), a missing Role in a combined file, or validation |
| **Audit** | Only on the final chunk: `admin.import_<import_type>_roster`, with `{filename, total, created, failed, dry_run}` |
| **Caller** | `ClusterHeadRosterPage` → `AcademicUploadPanel` (chunk loop, merged results, credentials panel) |

Request fields:

| Field | Rule |
|---|---|
| `import_type` | `faculty`, `student` or `combined` |
| `filename` | 1–255 characters |
| `file_base64` | 1–8,000,000 characters |
| `create_accounts` | boolean, default `true`; `false` = dry run |
| `offset` | integer ≥ 0, default 0 |
| `batch_id` | uuid, optional |
| `default_mentor_id` | uuid, optional |
| `semester_cycle_id` | uuid, optional |

Processing (details in §4.13):

1. Parse the whole file.
2. Pre-load faculty and existing e-mails.
3. Starting at `offset`, plan each row, and create accounts in waves of 25 with 5 at a time.
4. Stop when the 20 s budget is spent. `next_offset` = the index to resume from, or `null` when done.
5. Insert or accumulate the `roster_import_batches` row.
6. If `semester_cycle_id` is given, update that cycle's counters. The current UI never sends it.

**Response message:** "Imported n row(s)… s already existed, f failed.", or for a dry run: "Validated … ready to import …".

### 6.5 `GET | POST /api/admin/manage-faculty-roster`

| | |
|---|---|
| **Roles** | `hod` |
| **Rate limit** | POST only: `faculty-roster:<action>`, 60 per 60 s. GETs are not limited. |
| **Caller** | `pages/hod/HodFacultyRosterPage.jsx` |

| Request | Processing | Response `data` |
|---|---|---|
| `GET ?action=roster` (default) | `faculty_reserve_pool.select('*').order('full_name')` as the user | `{faculty: [...]}` |
| `GET ?action=mentees&faculty_id=<uuid>` | The mentor's students (`id, full_name, email, login_id, section, branch, semester_label, is_star_mentee, form_a_completed`), plus a count of non-Resolved queries per student | `{mentees: [{…, open_queries}]}`; 400 "A valid faculty_id is required" |
| `GET ?action=reserve-pool` | The same view filtered to `employment_status = 'active'` and `available_for_reassignment`, ordered by remaining capacity, descending. **Unused by the UI.** | `{faculty: [...]}` |
| `POST {action: 'set-status', faculty_id, employment_status: active\|on_leave\|departed, available_for_reassignment?}` | `set_faculty_employment_status(p_faculty_id, p_status, p_available)` as the user; count the faculty member's mentees | `{faculty, mentee_count, needs_reassignment}`; message `Status updated to "<status>".`; audit `hod.set_faculty_status` |
| `POST {action: 'reassign', student_ids: uuid[1..500], from_faculty_id?, to_faculty_id, reason? ≤500}` | `reassign_mentees(...)` as the user, then a **service-role** `update support_queries set mentor_id = to` where the student is in the list, `mentor_id = from` and `status <> 'Resolved'` | `{reassigned: n}`; message "n student(s) reassigned successfully."; audit `hod.reassign_mentees` with `{student_count, moved, from, reason}` |
| any other action | — | 400 `Unknown action "<x>"` |

### 6.6 `GET | POST /api/admin/run-cycle-job`

| | |
|---|---|
| **Roles** | `hod` |
| **Rate limit** | POST only: `cycle-job`, 40 per 300 s |
| **GET** | `get_cycle_job_status()` as the user. `data` = `{jobs: [{job_type, description, interval_days, is_enabled, next_run_due_on, last_run_at, last_run_status, last_manual_run_at}], recent_runs: [last 25], active_survey_cycle, at_risk_count, open_meeting_count}` |
| **POST request** (`cycleJobSchema`) | `{job_type: survey_cycle\|survey_reminder_sweep\|at_risk_sweep\|at_risk_meeting_dispatch\|all, trigger_source: manual (default)\|scheduled, note?: ≤300}` |
| **POST processing** | `all` calls `run_all_cycle_jobs_now(p_note)` (sweep → dispatch → survey; always `manual`). Any other value calls `run_cycle_job(p_job_type, p_trigger, p_note)`. |
| **POST response** | The RPC's JSON: `{job_type, trigger_source, run_id, status, result, schedule_advanced}` for one job. Message: "<Job> finished." plus " The 15-day schedule was left unchanged." when manual. |
| **Audit** | `hod.run_cycle_job`, with `{job_type, trigger_source}` |
| **Caller** | `pages/hod/HodOperationsPage.jsx` |

### 6.7 `POST /api/cluster-head/upload-academic-data`

| | |
|---|---|
| **Roles** | `cluster_head`, `hod` |
| **Gate** | Cluster heads must have `cluster_head_setup_completed`, else 403 "Complete the cluster head setup form before uploading data." |
| **Rate limit** | `academic-upload`: 30 per 300 s (shared by all actions) |
| **Body limit** | 10 MB |
| **Request** (`clusterHeadUploadSchema`, discriminated on `action`) | Every action also takes `filename` (1–255) and `file_base64` (≤ 8,000,000 characters). See the table below. |
| **Processing** | Decode (an empty result → 400 "The uploaded file is empty."), parse (§10.4), [mentor-map: `createMissingMentors`], then the RPC as the user. Backlogs: 400 "The file does not say which semester it is for. Choose the semester, then upload it again." when neither the file nor the request names one. |
| **Response 200** | `data` = the RPC's JSON plus `file_meta` (what the parser read from the file; `null` for attendance and the mentor map): `{batch_id, total_rows, matched, failed, students_reevaluated, row_errors: [{row, identifier, reason}]}`. Attendance adds `course_code, course_name, section, sections, period_start, period_end`. GPA adds `skipped, semester_gpas_recorded, semesters, cgpa_recorded`. Backlogs add `semester_number, exam_session, backlogs_recorded, backlogs_cleared`. Black dots add `cases, case_numbers, students`, and each row error a `where`. Mentor-map returns `{total_rows, matched, unchanged, failed, row_errors, mentors_created, mentor_errors}`. |
| **Message** | "n row(s) recorded for <course> (section <s>), f could not be matched." / "n student(s) recorded (semester 1, 2 GPA and CGPA)." / "n backlog(s) recorded for semester s, c cleared." / "n black dot(s) recorded across c case(s)." / "n student(s) mapped to their mentor. m mentor account(s) created …" |
| **Audit** | `cluster_head.upload_<action>`, with `{action, filename, total_rows, matched, failed, mentor_accounts_created}`, plus `{semester, cleared}` for backlogs and `{cases}` for black dots |
| **Callers** | `ClusterHeadAttendancePage`, `ClusterHeadGpaPage`, `ClusterHeadBacklogPage`, `ClusterHeadBlackDotPage`, `ClusterHeadRosterPage` (mentor map), all through `AcademicUploadPanel` |

Per-action fields and RPCs:

| `action` | Extra fields | RPC |
|---|---|---|
| `attendance` | none | `record_attendance_batch` |
| `gpa` | `semester_number?` (1–8, a fallback for a flat file; the page does not send it) | `record_gpa_batch` |
| `backlog` | `semester_number?` (1–8, used only when the file's title names no semester), `exam_session?` (≤ 60; wins over the title's exam) | `record_backlog_batch`, with `p_subject_codes` from the file |
| `black-dot` | none | `record_black_dot_batch` |
| `mentor-map` | none | `map_students_to_mentors` |

### 6.8 `GET /api/reports/faculty-activity-report`

| | |
|---|---|
| **Roles** | `faculty`, `hod` |
| **Rate limit** | `faculty-report`: 30 per 60 s |
| **Query** (`facultyReportQuerySchema`) | `faculty_id?` (uuid or `all`), `from?` / `to?` (`YYYY-MM-DD`), `format` (`json`, the default, or `pdf`) |
| **Processing** | `faculty_id=all` calls `get_department_faculty_report(p_from, p_to)` (the database requires the HOD). Otherwise `get_faculty_activity_report(p_faculty_id, p_from, p_to)`. Both run as the user. |
| **Response** | `format=json` → `data: {report}`. `format=pdf` → the PDF, `faculty-activity-report-<name>-<from>-to-<to>.pdf` or `department-activity-report-all-faculty-<from>-to-<to>.pdf`. |
| **Errors** | database 42501 → 403; other database errors → 400; no data → 404 |
| **Audit** | PDF only: `report.faculty_activity_pdf` / `report.department_pdf` |
| **Callers** | `FacultyActivityReportPage` (the PDF button; on-screen data uses the RPC directly), `HodFacultyPerformancePage` (PDF per faculty member, default period) |

### 6.9 `GET /api/reports/student-dossier-report`

| | |
|---|---|
| **Roles** | Any authenticated user. The database's `get_student_dossier` decides: the student themself, their mentor, or the HOD. |
| **Rate limit** | `student-report`: 30 per 60 s |
| **Query** | `student_id` (uuid, required), `format` (`json` or `pdf`) |
| **Response** | `format=json` → `data: {report}`. `format=pdf` → `student-report-<name>-<YYYY-MM-DD>.pdf`. |
| **Errors** | 42501 → 403 ("You are not this student's mentor"); other → 400; no data → 404 "No report data was returned" |
| **Audit** | PDF only: `report.student_dossier_pdf` |
| **Callers** | `FacultyMenteesPage` (PDF per mentee), `FacultyMenteeDetailPage` (PDF button; on-screen data uses the RPC directly) |

---

## 7. Database reference

### 7.1 Overview

The database is Postgres 15 on Supabase. There is a single application schema, `public`, which contains:

- **30 tables**, **8 views**, **18 enums**, **79 functions**, and **29 triggers** (27 on `public` tables and 2 on `auth.users`);
- 2 sequences (`query_code_seq`, `audit_log_id_seq`);
- the extensions `citext`, `pg_trgm` and `pgcrypto`.

Everything in §7.3–§7.8 was **generated from the live catalogue** after replaying all 33 migrations (and updated for 0034–0035 on 2026-09-27), so column lists, constraints, indexes, policies and grants are exact. Where a table's own SQL comment has gone stale, a **Doc note** says so.

Conventions that hold across the schema:

- **Row Level Security.**
  - RLS is **enabled (not forced)** on every table. It is not forced so that SECURITY DEFINER functions running as the owner can do their work.
  - Nothing is granted to `anon`.
  - `authenticated` receives only the table privileges its policies need.
  - CI fails if any public table lacks RLS.
- **Writes with rules go through SECURITY DEFINER functions.** Each one:
  - checks the caller with the helper functions `is_hod()`, `is_faculty()`, `is_student()`, `is_cluster_head()`, `is_mentor_of()` and `can_access_student()` / `can_access_query()`;
  - pins `search_path = public, pg_temp`;
  - raises `42501` for permission errors and `P0002` for "not found", plus readable messages. The two report endpoints map 42501 to 403; the other endpoints return every database error as 400.
- **Protected profile columns.** The trigger `guard_protected_profile_columns` (BEFORE UPDATE on `user_profiles`) rejects a change to any of these unless the caller is the HOD, the call has no JWT (service role or scripts), or the transaction has set `ssmp.trusted_operation = 'on'`:
  - `role`, `assigned_mentor_id`, `is_star_mentee` / `star_mentee_assigned_by`, `employment_status` / `available_for_reassignment`, `is_active`, `form_a_completed`, `cluster_head_setup_completed`, `id`, `email`, and (since 0035) `login_id`, the registration number.

  Definer RPCs that legitimately change these set the flag with `set_config('ssmp.trusted_operation', 'on', true)`: `submit_student_form_a`, `set_star_mentee`, `set_faculty_employment_status`, `reassign_mentees`, `submit_cluster_head_setup`, `map_students_to_mentors`, `unlock_student_form_a`. Every other profile column is freely editable by its owner (§8.9).
- **Notifications** are inserted only through `enqueue_notification` (§4.21).
- **Timestamps.** `set_updated_at_timestamp` maintains `updated_at` on 16 tables.
- **Enums.** Since 0020, new enum values get a migration of their own (0020, 0026, 0028, 0034). The earlier 0018 and 0019 added values inside larger files. Postgres refuses to use a value in the transaction that created it, and `supabase db push` may wrap a file in one transaction.
- **Views.** All 8 are `security_invoker = true`, so they run with the caller's rights and RLS still applies.

### 7.2 Relationships (foreign keys)

`user_profiles.id` references `auth.users(id)`. Every person in the system is a `user_profiles` row, and almost every table hangs off it.

- **`academic_upload_batches`**: `course_id` → `cluster_head_courses(id)` (on delete set null); `uploaded_by` → `user_profiles(id)` (on delete cascade)
- **`at_risk_meetings`**: `mentor_id` → `user_profiles(id)` (on delete cascade); `student_id` → `user_profiles(id)` (on delete cascade)
- **`audit_log`**: `actor_id` → `user_profiles(id)` (on delete set null)
- **`canned_replies`**: `owner_id` → `user_profiles(id)` (on delete cascade)
- **`cluster_head_courses`**: `cluster_head_id` → `user_profiles(id)` (on delete cascade)
- **`counselling_requests`**: `mentor_id` → `user_profiles(id)` (on delete cascade); `responded_by` → `user_profiles(id)` (on delete set null); `student_id` → `user_profiles(id)` (on delete cascade)
- **`cycle_job_runs`**: `triggered_by` → `user_profiles(id)` (on delete set null)
- **`mentor_reassignment_log`**: `from_mentor_id` → `user_profiles(id)` (on delete set null); `performed_by` → `user_profiles(id)` (on delete set null); `student_id` → `user_profiles(id)` (on delete cascade); `to_mentor_id` → `user_profiles(id)` (on delete cascade)
- **`mom_records`**: `mentor_id` → `user_profiles(id)` (on delete cascade); `reported_by` → `user_profiles(id)` (on delete cascade)
- **`notifications`**: `actor_id` → `user_profiles(id)` (on delete set null); `query_id` → `support_queries(id)` (on delete cascade); `recipient_id` → `user_profiles(id)` (on delete cascade)
- **`query_messages`**: `query_id` → `support_queries(id)` (on delete cascade); `sender_id` → `user_profiles(id)` (on delete set null)
- **`roster_import_batches`**: `semester_cycle_id` → `semester_cycles(id)` (on delete set null); `uploaded_by` → `user_profiles(id)` (on delete set null)
- **`semester_cycles`**: `created_by` → `user_profiles(id)` (on delete set null)
- **`student_achievements`**: `student_id` → `user_profiles(id)` (on delete cascade); `verified_by` → `user_profiles(id)` (on delete set null)
- **`student_attendance_records`**: `batch_id` → `academic_upload_batches(id)` (on delete set null); `course_id` → `cluster_head_courses(id)` (on delete cascade); `recorded_by` → `user_profiles(id)` (on delete set null); `student_id` → `user_profiles(id)` (on delete cascade)
- **`student_backlogs`**: `batch_id` → `academic_upload_batches(id)` (on delete set null); `recorded_by` → `user_profiles(id)` (on delete set null); `student_id` → `user_profiles(id)` (on delete cascade)
- **`student_course_sections`**: `course_id` → `cluster_head_courses(id)` (on delete cascade); `student_id` → `user_profiles(id)` (on delete cascade)
- **`student_form_a_profiles`**: `student_id` → `user_profiles(id)` (on delete cascade); `unlocked_by` → `user_profiles(id)` (on delete set null)
- **`student_risk_flags`**: `student_id` → `user_profiles(id)` (on delete cascade)
- **`student_semester_gpas`**: `batch_id` → `academic_upload_batches(id)` (on delete set null); `recorded_by` → `user_profiles(id)` (on delete set null); `student_id` → `user_profiles(id)` (on delete cascade)
- **`support_queries`**: `escalated_by` → `user_profiles(id)` (on delete set null); `mentor_id` → `user_profiles(id)` (on delete restrict); `mom_id` → `mom_records(id)` (on delete set null); `resolved_by` → `user_profiles(id)` (on delete set null); `student_id` → `user_profiles(id)` (on delete cascade)
- **`survey_cycles`**: `opened_by` → `user_profiles(id)` (on delete set null)
- **`survey_response_answers`**: `question_id` → `survey_questions(id)` (on delete cascade); `response_id` → `survey_responses(id)` (on delete cascade)
- **`survey_responses`**: `cycle_id` → `survey_cycles(id)` (on delete cascade); `mentor_id` → `user_profiles(id)` (on delete set null); `student_id` → `user_profiles(id)` (on delete cascade)
- **`user_profiles`**: `assigned_mentor_id` → `user_profiles(id)` (on delete set null); `id` → `auth.users(id)` (on delete cascade); `star_mentee_assigned_by` → `user_profiles(id)` (on delete set null)

### 7.3 Enum types

Real Postgres enums. Any value added in SQL must also be mirrored in `frontend/src/lib/constants.js` where the UI offers it.

| Enum | Values | Created in |
|---|---|---|
| `academic_upload_type` | attendance · gpa · backlog · black_dot | 0020, 0034 |
| `achievement_category` | sports · cultural · technical · volunteering · certification · leadership · other | 0001 |
| `at_risk_meeting_status` | awaiting_link · scheduled · completed · cancelled | 0020 |
| `confirmation_response` | yes · no | 0001 |
| `cycle_job_status` | running · succeeded · failed | 0020 |
| `cycle_job_trigger` | scheduled · manual | 0020 |
| `cycle_job_type` | survey_cycle · survey_reminder_sweep · at_risk_sweep · at_risk_meeting_dispatch | 0020 |
| `employment_status` | active · on_leave · departed | 0001 |
| `gpa_source` | student · cluster_head | 0020 |
| `notification_type` | query_created · query_message · query_resolution_pending · query_confirmed · query_reopened · query_rated · mentor_reassigned · star_mentee_assigned · achievement_verified · onboarding_reminder · account_provisioned · query_escalated · student_at_risk · at_risk_meeting_required · at_risk_cleared · survey_published · survey_reminder · academic_data_uploaded · counselling_request | 0001 |
| `parent_occupation` | Entrepreneur · Family Business · Public Sector · Professional · Govt. Employee · Pvt. Company · Home Maker | 0001 |
| `query_category` (was `ticket_category` before 0031) | Academic · ERP/Tech · Infrastructure · Academics · Examination · Behavioural · Administrative · Others | 0001 |
| `query_priority` (was `ticket_priority` before 0031) | Low · Medium · High · Urgent | 0001 |
| `query_status` (was `ticket_status` before 0031) | Open · In Progress · Resolved | 0001 |
| `resolution_status` | none · pending_confirmation · confirmed · reopened | 0001 |
| `roster_import_type` | faculty · student · combined | 0001 |
| `semester_term` | Odd · Even | 0001 |
| `user_role` | student · faculty · hod · cluster_head | 0001 |

### 7.4 Tables

#### `academic_upload_batches`

One row per Cluster Head upload (attendance / GPA / backlog / black dot), including the rows that could not be matched to a student.

*created in migration 0021 · RLS enabled*

> **Doc note:** `skipped_rows` is written only by the GPA upload (rows with nothing graded); it is 0 for the others. `scope_label` (0035) is written by the GPA, backlog and black dot uploads and is NULL on attendance and older rows.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `uploaded_by` | uuid |  |  | FK → `user_profiles(id) on delete cascade` |
| `upload_type` | academic_upload_type | not null |  |  |
| `course_id` | uuid |  |  | FK → `cluster_head_courses(id) on delete set null` |
| `section_label` | text |  |  |  |
| `period_start` | date |  |  |  |
| `period_end` | date |  |  |  |
| `semester_number` | smallint |  |  |  |
| `original_filename` | text | not null |  |  |
| `total_rows` | integer | not null | `0` |  |
| `matched_rows` | integer | not null | `0` |  |
| `skipped_rows` | integer | not null | `0` |  |
| `failed_rows` | integer | not null | `0` |  |
| `row_errors` | jsonb | not null | `'[]'::jsonb` |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `scope_label` | text |  |  | What the file covered: "Semesters 1, 2 + CGPA", "Semester 3 · END TERM …", "2 cases" |

Constraints and indexes:

- `academic_upload_batches_semester_range` — `CHECK (((semester_number IS NULL) OR ((semester_number >= 1) AND (semester_number <= 8))))`
- index `academic_upload_batches_owner_idx` — `btree (uploaded_by, created_at DESC)`

RLS policies:

- `academic_batches_select_hod` — **SELECT** to authenticated; using `is_hod()`
- `academic_batches_select_own` — **SELECT** to authenticated; using `(uploaded_by = auth.uid())`

Grants: `authenticated`: SELECT

#### `api_rate_limits`

Fixed-window counters for the privileged serverless endpoints. Written by the service role only.

*created in migration 0015 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `bucket_key` | text | not null |  | **PK** |
| `window_start` | timestamp with time zone | not null |  | **PK** |
| `request_count` | integer | not null | `0` |  |

Constraints and indexes:

- index `api_rate_limits_window_idx` — `btree (window_start)`

RLS policies: **none** — no client role can read or write this table directly; only SECURITY DEFINER functions and the service role reach it.

#### `at_risk_meetings`

*created in migration 0022 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `mentor_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `status` | at_risk_meeting_status | not null | `'awaiting_link'::at_risk_meeting_status` |  |
| `reasons` | text[] | not null | `ARRAY[]::text[]` |  |
| `attendance_percent` | numeric(5,2) |  |  |  |
| `latest_gpa` | numeric(4,2) |  |  |  |
| `backlog_count` | integer | not null | `0` |  |
| `scheduled_for` | timestamp with time zone |  |  |  |
| `meeting_provider` | text |  |  |  |
| `meeting_join_url` | text |  |  | STUB. Filled in by create_at_risk_meeting_link() once Teams vs Google Meet is decided. Null is the expected value today and the rest of the flow does not depend on it. |
| `meeting_external_id` | text |  |  |  |
| `mentor_notified_at` | timestamp with time zone |  |  |  |
| `completed_at` | timestamp with time zone |  |  |  |
| `cancelled_at` | timestamp with time zone |  |  |  |
| `job_run_id` | uuid |  |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `at_risk_meetings_mentor_is_not_student` — `CHECK ((mentor_id <> student_id))`
- index `at_risk_meetings_mentor_idx` — `btree (mentor_id, created_at DESC)`
- index `at_risk_meetings_one_open_per_student_idx` — `unique btree (student_id) WHERE (status = ANY (ARRAY['awaiting_link'::at_risk_meeting_status, 'scheduled'::at_risk_meeting_status]))`

RLS policies:

- `meetings_select_visible` — **SELECT** to authenticated; using `((student_id = auth.uid()) OR (mentor_id = auth.uid()) OR is_hod())`
- `meetings_update_mentor` — **UPDATE** to authenticated; using `((mentor_id = auth.uid()) OR is_hod())`; check `((mentor_id = auth.uid()) OR is_hod())`

Grants: `authenticated`: SELECT,UPDATE

Triggers:

- `trg_at_risk_meetings_updated_at` — before update → `set_updated_at_timestamp()`
- `trg_notify_at_risk_meeting` — after insert → `notify_on_at_risk_meeting()`

#### `audit_log`

Append-only. No UPDATE or DELETE policy exists for any client role, including HOD.

*created in migration 0006 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | bigint | not null |  | **PK** |
| `actor_id` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `actor_role` | user_role |  |  |  |
| `action` | text | not null |  |  |
| `entity_type` | text |  |  |  |
| `entity_id` | text |  |  |  |
| `metadata` | jsonb | not null | `'{}'::jsonb` |  |
| `ip_address` | text |  |  |  |
| `user_agent` | text |  |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- index `audit_log_action_idx` — `btree (action, created_at DESC)`
- index `audit_log_actor_idx` — `btree (actor_id, created_at DESC)`
- index `audit_log_entity_idx` — `btree (entity_type, entity_id)`

RLS policies:

- `audit_log_hod_select` — **SELECT** to authenticated; using `is_hod()`

Grants: `authenticated`: SELECT

#### `canned_replies`

*created in migration 0006 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `owner_id` | uuid |  |  | FK → `user_profiles(id) on delete cascade` |
| `title` | text | not null |  |  |
| `body` | text | not null |  |  |
| `is_global` | boolean | not null | `false` |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `canned_reply_body_max_length` — `CHECK ((char_length(body) <= 2000))`
- `canned_reply_owner_or_global` — `CHECK (((is_global = true) OR (owner_id IS NOT NULL)))`
- `canned_reply_title_not_blank` — `CHECK (is_non_blank(title))`

RLS policies:

- `canned_delete_own` — **DELETE** to authenticated; using `(owner_id = auth.uid())`
- `canned_insert_own` — **INSERT** to authenticated; check `((owner_id = auth.uid()) AND (is_global = false) AND (is_faculty() OR is_hod()))`
- `canned_select_visible` — **SELECT** to authenticated; using `((is_faculty() OR is_hod()) AND (is_global OR (owner_id = auth.uid())))`
- `canned_update_own` — **UPDATE** to authenticated; using `(owner_id = auth.uid())`; check `((owner_id = auth.uid()) AND (is_global = false))`

Grants: `authenticated`: DELETE,INSERT,SELECT,UPDATE

Triggers:

- `trg_canned_replies_updated_at` — before update → `set_updated_at_timestamp()`

#### `cluster_head_courses`

The subjects a Cluster Head handles: course name and course code. Sections are not declared here — they are learned from the attendance export, in student_course_sections.

*created in migration 0021 · RLS enabled*

> **Doc note:** the policy `ch_courses_write_own` (FOR ALL) lets a cluster head write these rows directly, bypassing `submit_cluster_head_setup`. Deleting a course — including changing its code in My Subjects — cascades to `student_attendance_records` and `student_course_sections` (§4.11).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `cluster_head_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `course_name` | text | not null |  |  |
| `course_code` | text | not null |  |  |
| `display_order` | smallint | not null | `0` |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `cluster_head_courses_code_not_blank` — `CHECK (is_non_blank(course_code))`
- `cluster_head_courses_name_not_blank` — `CHECK (is_non_blank(course_name))`
- index `cluster_head_courses_owner_idx` — `btree (cluster_head_id, display_order)`
- index `cluster_head_courses_unique_code_idx` — `unique btree (cluster_head_id, lower(course_code))`

RLS policies:

- `ch_courses_write_own` — **ALL** to authenticated; using `((cluster_head_id = auth.uid()) AND is_cluster_head())`; check `((cluster_head_id = auth.uid()) AND is_cluster_head())`
- `ch_courses_select_hod` — **SELECT** to authenticated; using `is_hod()`
- `ch_courses_select_own` — **SELECT** to authenticated; using `(cluster_head_id = auth.uid())`

Grants: `authenticated`: DELETE,INSERT,SELECT,UPDATE

Triggers:

- `trg_cluster_head_courses_updated_at` — before update → `set_updated_at_timestamp()`

#### `counselling_requests`

Personal counselling requests. Readable by the student who wrote it and the mentor it was sent to — NOT by the HOD, unlike support_tickets. See the header of this migration before widening that.

*created in migration 0029 · RLS enabled*

> **Doc note:** "support_tickets" in the comment is now `support_queries`. The assigned mentor may also UPDATE these rows directly (`counselling_update_mentor`).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `mentor_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `concern` | text | not null |  |  |
| `status` | text | not null | `'open'::text` |  |
| `mentor_note` | text |  |  |  |
| `responded_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `responded_at` | timestamp with time zone |  |  |  |
| `closed_at` | timestamp with time zone |  |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `counselling_concern_max_length` — `CHECK ((char_length(concern) <= 3000))`
- `counselling_concern_not_blank` — `CHECK (is_non_blank(concern))`
- `counselling_mentor_is_not_student` — `CHECK ((mentor_id <> student_id))`
- `counselling_note_max_length` — `CHECK (((mentor_note IS NULL) OR (char_length(mentor_note) <= 3000)))`
- `counselling_status_valid` — `CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'closed'::text])))`
- index `counselling_mentor_open_idx` — `btree (mentor_id, created_at DESC) WHERE (status <> 'closed'::text)`
- index `counselling_student_idx` — `btree (student_id, created_at DESC)`

RLS policies:

- `counselling_select_two_parties` — **SELECT** to authenticated; using `((student_id = auth.uid()) OR (mentor_id = auth.uid()))`
- `counselling_update_mentor` — **UPDATE** to authenticated; using `(mentor_id = auth.uid())`; check `(mentor_id = auth.uid())`

Grants: `authenticated`: SELECT,UPDATE

Triggers:

- `trg_counselling_updated_at` — before update → `set_updated_at_timestamp()`
- `trg_notify_counselling` — after insert or update → `notify_on_counselling_request()`

#### `cycle_job_runs`

Every execution of a recurring job, scheduled or manual, with what it did. This is the audit trail for "did the trigger actually work".

*created in migration 0024 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `job_type` | cycle_job_type | not null |  |  |
| `trigger_source` | cycle_job_trigger | not null |  |  |
| `status` | cycle_job_status | not null | `'running'::cycle_job_status` |  |
| `triggered_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `started_at` | timestamp with time zone | not null | `now()` |  |
| `finished_at` | timestamp with time zone |  |  |  |
| `duration_ms` | integer |  |  |  |
| `result` | jsonb | not null | `'{}'::jsonb` |  |
| `error_message` | text |  |  |  |
| `note` | text |  |  |  |

Constraints and indexes:

- index `cycle_job_runs_recent_idx` — `btree (job_type, started_at DESC)`

RLS policies:

- `cycle_runs_select_hod` — **SELECT** to authenticated; using `is_hod()`

Grants: `authenticated`: SELECT

#### `cycle_job_schedule`

The 15-day clock. Independent of Cluster Head uploads by design: nothing in the upload path reads or writes next_run_due_on.

*created in migration 0024 · RLS enabled*

> **Doc note:** the reminder job runs every 7 days, not 15. Nothing runs these jobs automatically (§4.16).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `job_type` | cycle_job_type | not null |  | **PK** |
| `interval_days` | integer | not null | `15` |  |
| `is_enabled` | boolean | not null | `true` |  |
| `next_run_due_on` | date | not null | `CURRENT_DATE` |  |
| `last_run_at` | timestamp with time zone |  |  |  |
| `last_run_status` | cycle_job_status |  |  |  |
| `last_manual_run_at` | timestamp with time zone |  |  |  |
| `description` | text |  |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `cycle_job_interval_sane` — `CHECK (((interval_days >= 1) AND (interval_days <= 365)))`

RLS policies:

- `cycle_schedule_select_hod` — **SELECT** to authenticated; using `is_hod()`

Grants: `authenticated`: SELECT

Triggers:

- `trg_cycle_job_schedule_updated_at` — before update → `set_updated_at_timestamp()`

#### `mentor_reassignment_log`

*created in migration 0006 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `from_mentor_id` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `to_mentor_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `reason` | text |  |  |  |
| `performed_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `created_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `reassignment_changes_mentor` — `CHECK (((from_mentor_id IS NULL) OR (from_mentor_id <> to_mentor_id)))`
- index `reassignment_from_idx` — `btree (from_mentor_id)`
- index `reassignment_student_idx` — `btree (student_id, created_at DESC)`

RLS policies:

- `reassignment_log_hod_select` — **SELECT** to authenticated; using `is_hod()`
- `reassignment_log_own_select` — **SELECT** to authenticated; using `(student_id = auth.uid())`

Grants: `authenticated`: SELECT

#### `mom_records`

Class-representative meeting minutes. Append-only: no UPDATE or DELETE policy exists for anyone. The action items raised in the meeting are support_tickets carrying this row's id in mom_id.

*created in migration 0027 · RLS enabled*

> **Doc note:** "support_tickets" in the comment is now `support_queries` (renamed in 0031).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `reported_by` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `mentor_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `meeting_date` | date | not null |  |  |
| `students_present` | integer |  |  |  |
| `students_total` | integer |  |  |  |
| `notes` | text | not null |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `mom_attendance_sane` — `CHECK (((students_present IS NULL) OR (students_total IS NULL) OR ((students_present >= 0) AND (students_present <= students_total))))`
- `mom_date_not_future` — `CHECK ((meeting_date <= CURRENT_DATE))`
- `mom_notes_max_length` — `CHECK ((char_length(notes) <= 5000))`
- `mom_notes_not_blank` — `CHECK (is_non_blank(notes))`
- `mom_reporter_is_not_mentor` — `CHECK ((reported_by <> mentor_id))`
- index `mom_records_mentor_idx` — `btree (mentor_id, meeting_date DESC)`
- index `mom_records_reporter_idx` — `btree (reported_by, meeting_date DESC)`

RLS policies:

- `mom_select_participants` — **SELECT** to authenticated; using `((reported_by = auth.uid()) OR (mentor_id = auth.uid()) OR is_hod())`

Grants: `authenticated`: SELECT

#### `notifications`

In-app notifications. Written only by database triggers and the service role — never directly by a client.

*created in migration 0005 · RLS enabled · published to Realtime*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `recipient_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `actor_id` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `type` | notification_type | not null |  |  |
| `title` | text | not null |  |  |
| `body` | text |  |  |  |
| `query_id` | uuid |  |  | FK → `support_queries(id) on delete cascade` |
| `link_path` | text |  |  |  |
| `is_read` | boolean | not null | `false` |  |
| `read_at` | timestamp with time zone |  |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `notification_read_has_timestamp` — `CHECK (((is_read = false) OR (read_at IS NOT NULL)))`
- `notification_title_not_blank` — `CHECK (is_non_blank(title))`
- index `notifications_query_idx` — `btree (query_id)`
- index `notifications_recipient_idx` — `btree (recipient_id, created_at DESC)`
- index `notifications_unread_idx` — `btree (recipient_id) WHERE (is_read = false)`

RLS policies:

- `notifications_delete_own` — **DELETE** to authenticated; using `(recipient_id = auth.uid())`
- `notifications_select_own` — **SELECT** to authenticated; using `(recipient_id = auth.uid())`
- `notifications_update_own` — **UPDATE** to authenticated; using `(recipient_id = auth.uid())`; check `(recipient_id = auth.uid())`

Grants: `authenticated`: DELETE,SELECT,UPDATE

#### `query_messages`

Messages on a ticket. Inserted only through post_ticket_message() so authorisation and side-effects always run.

*created in migration 0004 · renamed from `ticket_messages` in 0031 · RLS enabled · published to Realtime*

> **Doc note:** the comment names `post_ticket_message()`; the function is now `post_query_message()`. System messages are also inserted by `create_support_query`, `resolve_support_query`, `confirm_query_resolution`, `escalate_query_to_hod`, `set_query_in_progress` and `submit_mom_report`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `query_id` | uuid | not null |  | FK → `support_queries(id) on delete cascade` |
| `sender_id` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `body` | text | not null |  |  |
| `is_system_message` | boolean | not null | `false` |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `message_body_max_length` — `CHECK ((char_length(body) <= 5000))`
- `message_body_not_blank` — `CHECK (is_non_blank(body))`
- index `query_messages_query_idx` — `btree (query_id, created_at)`
- index `query_messages_sender_idx` — `btree (sender_id)`

RLS policies:

- `messages_select_participants` — **SELECT** to authenticated; using `can_access_query(query_id)`

Grants: `authenticated`: SELECT

Triggers:

- `trg_notify_query_message` — after insert → `notify_on_query_message()`

#### `roster_import_batches`

*created in migration 0006 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `semester_cycle_id` | uuid |  |  | FK → `semester_cycles(id) on delete set null` |
| `import_type` | roster_import_type | not null |  |  |
| `original_filename` | text | not null |  |  |
| `total_rows` | integer | not null | `0` |  |
| `created_count` | integer | not null | `0` |  |
| `skipped_count` | integer | not null | `0` |  |
| `failed_count` | integer | not null | `0` |  |
| `row_errors` | jsonb | not null | `'[]'::jsonb` |  |
| `uploaded_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `created_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- index `roster_batches_cycle_idx` — `btree (semester_cycle_id, created_at DESC)`

RLS policies:

- `roster_batches_hod_select` — **SELECT** to authenticated; using `is_hod()`
- `roster_batches_own_select` — **SELECT** to authenticated; using `(uploaded_by = auth.uid())`

Grants: `authenticated`: SELECT

#### `semester_cycles`

HOD semester initialisation wizard state (5-step stepper).

*created in migration 0006 · RLS enabled*

> **Doc note:** stale. The HOD semester wizard was removed; no page writes this table. Only the roster import touches it, and only when a `semester_cycle_id` is sent (the UI never sends one).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `academic_year` | text | not null |  |  |
| `term` | semester_term | not null | `'Odd'::semester_term` |  |
| `is_initialized` | boolean | not null | `false` |  |
| `current_step` | smallint | not null | `1` |  |
| `faculty_imported_count` | integer | not null | `0` |  |
| `student_imported_count` | integer | not null | `0` |  |
| `initialized_at` | timestamp with time zone |  |  |  |
| `created_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `one_cycle_per_term` — `UNIQUE (academic_year, term)`
- `semester_step_range` — `CHECK (((current_step >= 1) AND (current_step <= 5)))`
- `semester_year_shape` — `CHECK ((academic_year ~ '^[0-9]{4}-[0-9]{2}$'::text))`

RLS policies:

- `semester_cycles_hod_all` — **ALL** to authenticated; using `is_hod()`; check `is_hod()`

Grants: `authenticated`: DELETE,INSERT,SELECT,UPDATE

Triggers:

- `trg_semester_cycles_updated_at` — before update → `set_updated_at_timestamp()`

#### `student_achievements`

Feature 6 — student-maintained achievements outside academics. Mentor may verify (badge only, never blocks display).

*created in migration 0005 · RLS enabled · published to Realtime*

> **Doc note:** stale. Verification does lock the entry: RLS allows the student to update or delete only while `verified_by_faculty = false`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `title` | text | not null |  |  |
| `category` | achievement_category | not null | `'other'::achievement_category` |  |
| `description` | text |  |  |  |
| `achieved_on` | date |  |  |  |
| `proof_file_path` | text |  |  |  |
| `verified_by_faculty` | boolean | not null | `false` |  |
| `verified_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `verified_at` | timestamp with time zone |  |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `achievement_date_not_future` — `CHECK (((achieved_on IS NULL) OR (achieved_on <= CURRENT_DATE)))`
- `achievement_desc_max_length` — `CHECK (((description IS NULL) OR (char_length(description) <= 2000)))`
- `achievement_title_max_length` — `CHECK ((char_length(title) <= 200))`
- `achievement_title_not_blank` — `CHECK (is_non_blank(title))`
- `achievement_verified_has_verifier` — `CHECK (((verified_by_faculty = false) OR (verified_by IS NOT NULL)))`
- index `achievements_category_idx` — `btree (category)`
- index `achievements_student_idx` — `btree (student_id, achieved_on DESC)`

RLS policies:

- `achievements_delete_own` — **DELETE** to authenticated; using `((student_id = auth.uid()) AND (verified_by_faculty = false))`
- `achievements_insert_own` — **INSERT** to authenticated; check `((student_id = auth.uid()) AND is_student() AND (verified_by_faculty = false))`
- `achievements_select_visible` — **SELECT** to authenticated; using `can_access_student(student_id)`
- `achievements_update_own` — **UPDATE** to authenticated; using `((student_id = auth.uid()) AND (verified_by_faculty = false))`; check `((student_id = auth.uid()) AND (verified_by_faculty = false))`

Grants: `authenticated`: DELETE,INSERT,SELECT,UPDATE

Triggers:

- `trg_achievements_updated_at` — before update → `set_updated_at_timestamp()`
- `trg_notify_achievement_verified` — after update of verified_by_faculty → `notify_on_achievement_verified()`

#### `student_attendance_records`

Attendance per student, per course, per reporting period. Uploaded by a Cluster Head on any day — there is no date restriction on when an upload may happen.

*created in migration 0021 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `course_id` | uuid | not null |  | FK → `cluster_head_courses(id) on delete cascade` |
| `section_label` | text | not null |  | The TEACHING section for this course, from the export header. Unrelated to the student's Form A / profile section, and expected to differ. |
| `period_start` | date | not null |  |  |
| `period_end` | date | not null |  |  |
| `classes_held` | integer |  |  |  |
| `classes_attended` | integer |  |  |  |
| `batch_id` | uuid |  |  | FK → `academic_upload_batches(id) on delete set null` |
| `recorded_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |
| `course_code` | text |  |  |  |
| `course_name` | text |  |  |  |
| `attendance_percent` | numeric(5,2) | not null |  | Taken verbatim from the "%" column of the ERP export. Never recomputed from classes_held/classes_attended — the portal must not disagree with the ERP. |

Constraints and indexes:

- `attendance_attended_sane` — `CHECK (((classes_attended IS NULL) OR ((classes_attended >= 0) AND ((classes_held IS NULL) OR (classes_attended <= classes_held)))))`
- `attendance_classes_held_sane` — `CHECK (((classes_held IS NULL) OR ((classes_held >= 0) AND (classes_held <= 2000))))`
- `attendance_one_row_per_period` — `UNIQUE (student_id, course_id, period_start)`
- `attendance_percent_range` — `CHECK (((attendance_percent >= (0)::numeric) AND (attendance_percent <= (100)::numeric)))`
- `attendance_period_ordered` — `CHECK ((period_end >= period_start))`
- index `student_attendance_course_idx` — `btree (course_id, section_label)`
- index `student_attendance_student_idx` — `btree (student_id, period_start DESC)`

RLS policies:

- `attendance_select_owner` — **SELECT** to authenticated; using `(EXISTS ( SELECT 1
   FROM cluster_head_courses c
  WHERE ((c.id = student_attendance_records.course_id) AND (c.cluster_head_id = auth.uid()))))`
- `attendance_select_visible` — **SELECT** to authenticated; using `can_access_student(student_id)`

Grants: `authenticated`: SELECT

Triggers:

- `trg_student_attendance_updated_at` — before update → `set_updated_at_timestamp()`

#### `student_backlogs`

One row per backlog subject. A single row with is_cleared = false is enough to satisfy the at-risk backlog condition.

*created in migration 0021 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `subject_code` | text | not null |  |  |
| `subject_name` | text |  |  |  |
| `semester_number` | smallint |  |  |  |
| `exam_session` | text |  |  |  |
| `is_cleared` | boolean | not null | `false` |  |
| `cleared_at` | timestamp with time zone |  |  |  |
| `batch_id` | uuid |  |  | FK → `academic_upload_batches(id) on delete set null` |
| `recorded_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |
| `grade` | text |  |  | The defaulter grade (F, UFM, DT …), kept after clearing (0035) |
| `credits` | numeric(4,2) |  |  | From the result's subject table (0035) |

Constraints and indexes:

- `student_backlogs_code_not_blank` — `CHECK (is_non_blank(subject_code))`
- `student_backlogs_semester_range` — `CHECK (((semester_number IS NULL) OR ((semester_number >= 1) AND (semester_number <= 8))))`
- `student_backlogs_unique` — `UNIQUE (student_id, subject_code, semester_number)` (the upload functions match `upper(subject_code)` and store codes upper-case since 0035)
- index `student_backlogs_student_idx` — `btree (student_id) WHERE (is_cleared = false)`
- index `student_backlogs_open_by_subject_idx` — `btree (semester_number, upper(subject_code)) WHERE (is_cleared = false)` (0035)

RLS policies:

- `backlogs_select_uploader` — **SELECT** to authenticated; using `((recorded_by = auth.uid()) AND is_cluster_head())`
- `backlogs_select_visible` — **SELECT** to authenticated; using `can_access_student(student_id)`

Grants: `authenticated`: SELECT

Triggers:

- `trg_student_backlogs_updated_at` — before update → `set_updated_at_timestamp()`

#### `student_black_dots`

Disciplinary black dots from Proctorial Board notices, one row per student per case. Uploaded by a Cluster Head; not part of the at-risk rule.

*created in migration 0035 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `case_number` | text | not null |  | Normalised ("034/Even Sem/2026") |
| `case_details` | text |  |  | What the case is about, from the case line |
| `incident_date` | date |  |  | Only when the notice gives a complete date |
| `incident_date_text` | text |  |  | As written ("14TH August") |
| `hostel_block` | text |  |  | "B7" or "Day scholar" |
| `room_no` | text |  |  |  |
| `course_branch` | text |  |  | "B Tech ECE, Sec- F1" |
| `mobile_no` | text |  |  | As written in the notice |
| `previous_record` | text |  |  | As written ("1 black dot", "NIL") |
| `previous_black_dots` | smallint |  |  | The number read from it (NIL → 0) |
| `batch_id` | uuid |  |  | FK → `academic_upload_batches(id) on delete set null` |
| `recorded_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `student_black_dots_case_not_blank` — `CHECK (is_non_blank(case_number))`
- `student_black_dots_previous_sane` — `CHECK ((previous_black_dots IS NULL) OR ((previous_black_dots >= 0) AND (previous_black_dots <= 100)))`
- unique index `student_black_dots_one_per_case` — `btree (student_id, lower(case_number))`
- index `student_black_dots_student_idx` — `btree (student_id, incident_date DESC)`

RLS policies:

- `black_dots_select_uploader` — **SELECT** to authenticated; using `((recorded_by = auth.uid()) AND is_cluster_head())`
- `black_dots_select_visible` — **SELECT** to authenticated; using `can_access_student(student_id)`

Grants: `authenticated`: SELECT (written only by `record_black_dot_batch`)

Triggers:

- `trg_student_black_dots_updated_at` — before update → `set_updated_at_timestamp()`

#### `student_cgpas`

Official CGPA and credit totals per student, from the ERP export uploaded by a Cluster Head. Same visibility as semester GPAs.

*created in migration 0035 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `student_id` | uuid | not null |  | **PK**; FK → `user_profiles(id) on delete cascade` |
| `cgpa` | numeric(4,2) | not null |  | Credit-weighted, as the university computes it |
| `total_earned_credits` | numeric(6,2) |  |  |  |
| `total_required_credits` | numeric(6,2) |  |  |  |
| `batch_id` | uuid |  |  | FK → `academic_upload_batches(id) on delete set null` |
| `recorded_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `student_cgpas_range` — `CHECK ((cgpa >= 0) AND (cgpa <= 10))`
- `student_cgpas_credits_sane` — both totals NULL or between 0 and 400

RLS policies:

- `cgpas_select_permitted` — **SELECT** to authenticated; using `can_view_student_gpa(student_id)`

Grants: `authenticated`: SELECT (written only by `record_gpa_batch`; cluster heads cannot read it)

Triggers:

- `trg_student_cgpas_updated_at` — before update → `set_updated_at_timestamp()`

#### `student_course_sections`

Student -> section mapping, learned from the first attendance upload for that course/section. No separate data-entry step exists by design.

*created in migration 0021 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `course_id` | uuid | not null |  | FK → `cluster_head_courses(id) on delete cascade` |
| `section_label` | text | not null |  | Teaching section for this course, e.g. "B" or "R 3". Unrelated to the student's roster section, and expected to differ. |
| `first_seen_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `student_course_sections_label_shape` — `CHECK ((section_label ~ '^[A-Za-z0-9][A-Za-z0-9 .-]{0,11}$'::text))`
- `student_course_sections_unique` — `UNIQUE (student_id, course_id)`
- index `student_course_sections_course_idx` — `btree (course_id, section_label)`

RLS policies:

- `student_sections_select_owner` — **SELECT** to authenticated; using `(EXISTS ( SELECT 1
   FROM cluster_head_courses c
  WHERE ((c.id = student_course_sections.course_id) AND (c.cluster_head_id = auth.uid()))))`
- `student_sections_select_visible` — **SELECT** to authenticated; using `can_access_student(student_id)`

Grants: `authenticated`: SELECT

#### `student_form_a_profiles`

Feature 1 — digitised Mentor-Mentee Scheme Form A. One-time institutional form; read-only after submission until an HOD unlocks it.

*created in migration 0003 · RLS enabled*

> **Doc note:** stale. Since 0017 the student can edit Form A at any time; `submit_student_form_a` resets `is_locked` on every save. `is_locked`, `unlock_requested*` and `unlocked_by` are vestigial.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `full_name` | text | not null |  |  |
| `registration_no` | text | not null |  |  |
| `section` | text |  |  |  |
| `roll_no` | text |  |  |  |
| `branch` | text |  |  |  |
| `mobile_no` | text | not null |  |  |
| `email` | text | not null |  |  |
| `hostel_block` | text |  |  |  |
| `room_no` | text |  |  |  |
| `blood_group` | text |  |  |  |
| `date_of_birth` | date |  |  |  |
| `is_day_scholar` | boolean | not null | `false` |  |
| `has_muj_alumni_in_family` | boolean | not null | `false` |  |
| `alumni_name` | text |  |  |  |
| `alumni_branch` | text |  |  |  |
| `alumni_batch` | text |  |  |  |
| `alumni_institution` | text |  |  |  |
| `alumni_relationship` | text |  |  |  |
| `father_name` | text | not null |  |  |
| `father_occupation` | parent_occupation |  |  |  |
| `father_organization` | text |  |  |  |
| `father_designation` | text |  |  |  |
| `father_mobile` | text |  |  |  |
| `father_email` | text |  |  |  |
| `mother_name` | text | not null |  |  |
| `mother_occupation` | parent_occupation |  |  |  |
| `mother_organization` | text |  |  |  |
| `mother_designation` | text |  |  |  |
| `mother_mobile` | text |  |  |  |
| `mother_email` | text |  |  |  |
| `communication_address` | text | not null |  |  |
| `communication_pin_code` | text | not null |  |  |
| `permanent_same_as_communication` | boolean | not null | `false` |  |
| `permanent_address` | text | not null |  |  |
| `permanent_pin_code` | text | not null |  |  |
| `parent_business_card_path` | text |  |  |  |
| `student_signature_path` | text |  |  |  |
| `gpa_sharing_enabled` | boolean | not null | `true` |  |
| `is_submitted` | boolean | not null | `false` |  |
| `submitted_at` | timestamp with time zone |  |  |  |
| `is_locked` | boolean | not null | `false` |  |
| `unlock_requested` | boolean | not null | `false` |  |
| `unlock_requested_at` | timestamp with time zone |  |  |  |
| `unlocked_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `form_a_alumni_details_required_when_yes` — `CHECK (((has_muj_alumni_in_family = false) OR is_non_blank(alumni_name)))`
- `form_a_blood_group_valid` — `CHECK (((blood_group IS NULL) OR (blood_group = ANY (ARRAY['A+'::text, 'A-'::text, 'B+'::text, 'B-'::text, 'AB+'::text, 'AB-'::text, 'O+'::text, 'O-'::text]))))`
- `form_a_dob_is_plausible` — `CHECK (((date_of_birth IS NULL) OR ((date_of_birth > '1950-01-01'::date) AND (date_of_birth < CURRENT_DATE))))`
- `form_a_email_shape` — `CHECK ((email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text))`
- `form_a_father_email_shape` — `CHECK (((father_email IS NULL) OR (father_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)))`
- `form_a_father_mobile_shape` — `CHECK (((father_mobile IS NULL) OR (father_mobile ~ '^[0-9]{10}$'::text)))`
- `form_a_hostel_required_unless_day_scholar` — `CHECK (((is_day_scholar = true) OR is_non_blank(hostel_block)))`
- `form_a_mobile_is_10_digits` — `CHECK ((mobile_no ~ '^[0-9]{10}$'::text))`
- `form_a_mother_email_shape` — `CHECK (((mother_email IS NULL) OR (mother_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)))`
- `form_a_mother_mobile_shape` — `CHECK (((mother_mobile IS NULL) OR (mother_mobile ~ '^[0-9]{10}$'::text)))`
- `form_a_pin_codes_are_6_digits` — `CHECK (((communication_pin_code ~ '^[0-9]{6}$'::text) AND (permanent_pin_code ~ '^[0-9]{6}$'::text)))`
- `form_a_submitted_has_timestamp` — `CHECK (((is_submitted = false) OR (submitted_at IS NOT NULL)))`
- `student_form_a_profiles_student_id_key` — `UNIQUE (student_id)`
- index `form_a_student_idx` — `btree (student_id)`
- index `form_a_submitted_idx` — `btree (is_submitted)`
- index `form_a_unlock_requested_idx` — `btree (unlock_requested) WHERE (unlock_requested = true)`

RLS policies:

- `form_a_insert_own` — **INSERT** to authenticated; check `((student_id = auth.uid()) AND is_student())`
- `form_a_select_visible` — **SELECT** to authenticated; using `can_access_student(student_id)`
- `form_a_update_hod` — **UPDATE** to authenticated; using `is_hod()`; check `is_hod()`
- `form_a_update_own` — **UPDATE** to authenticated; using `(student_id = auth.uid())`; check `(student_id = auth.uid())`

Grants: `authenticated`: INSERT,SELECT,UPDATE

Triggers:

- `trg_form_a_updated_at` — before update → `set_updated_at_timestamp()`

#### `student_risk_flags`

At-risk state per student. ANY of low attendance / low GPA / a backlog sets is_at_risk. Rewritten by evaluate_student_risk() whenever new academic data lands.

*created in migration 0022 · RLS enabled*

> **Doc note:** `latest_gpa` is readable by anyone who passes `can_access_student` (this table and `at_risk_student_overview`), regardless of GPA sharing.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `student_id` | uuid | not null |  | **PK** FK → `user_profiles(id) on delete cascade` |
| `is_at_risk` | boolean | not null | `false` |  |
| `low_attendance` | boolean | not null | `false` |  |
| `low_gpa` | boolean | not null | `false` |  |
| `has_backlog` | boolean | not null | `false` |  |
| `attendance_percent` | numeric(5,2) |  |  |  |
| `latest_gpa` | numeric(4,2) |  |  |  |
| `latest_gpa_semester` | smallint |  |  |  |
| `backlog_count` | integer | not null | `0` |  |
| `reasons` | text[] | not null | `ARRAY[]::text[]` |  |
| `first_flagged_at` | timestamp with time zone |  |  |  |
| `last_flagged_at` | timestamp with time zone |  |  |  |
| `cleared_at` | timestamp with time zone |  |  |  |
| `last_evaluated_at` | timestamp with time zone | not null | `now()` |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- index `student_risk_flags_at_risk_idx` — `btree (is_at_risk) WHERE (is_at_risk = true)`

RLS policies:

- `risk_flags_select_visible` — **SELECT** to authenticated; using `can_access_student(student_id)`

Grants: `authenticated`: SELECT

Triggers:

- `trg_notify_risk_flag_change` — after insert or update → `notify_on_risk_flag_change()`
- `trg_student_risk_flags_updated_at` — before update → `set_updated_at_timestamp()`

#### `student_semester_gpas`

Feature 2 — semester GPA history. Visible to faculty/HOD only when the student has gpa_sharing_enabled.

*created in migration 0003 · RLS enabled*

> **Doc note:** the HOD can always read GPAs; the mentor reads them per `gpa_sharing_enabled` (default true; the UI toggle was removed). `source` is `student` (self-reported) or `cluster_head` (department upload, which always overwrites). **Known gap:** the student's own INSERT/UPDATE/DELETE policies ignore `source` (§8.9).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `semester_number` | smallint | not null |  |  |
| `gpa` | numeric(4,2) | not null |  |  |
| `recorded_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |
| `source` | gpa_source | not null | `'student'::gpa_source` |  |
| `recorded_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `batch_id` | uuid |  |  | FK → `academic_upload_batches(id) on delete set null` |
| `earned_credits` | numeric(5,2) |  |  | From the ERP export (0035); NULL when self-reported |
| `required_credits` | numeric(5,2) |  |  | From the ERP export (0035) |

Constraints and indexes:

- `gpa_value_range` — `CHECK (((gpa >= (0)::numeric) AND (gpa <= (10)::numeric)))`
- `semester_gpa_credits_sane` — both credit columns NULL or between 0 and 100 (0035)
- `one_gpa_per_semester` — `UNIQUE (student_id, semester_number)`
- `semester_gpa_range` — `CHECK (((semester_number >= 1) AND (semester_number <= 8)))`
- index `semester_gpas_student_idx` — `btree (student_id, semester_number)`

RLS policies:

- `gpas_delete_own` — **DELETE** to authenticated; using `(student_id = auth.uid())`
- `gpas_insert_own` — **INSERT** to authenticated; check `((student_id = auth.uid()) AND is_student())`
- `gpas_select_permitted` — **SELECT** to authenticated; using `can_view_student_gpa(student_id)`
- `gpas_update_own` — **UPDATE** to authenticated; using `(student_id = auth.uid())`; check `(student_id = auth.uid())`

Grants: `authenticated`: DELETE,INSERT,SELECT,UPDATE

Triggers:

- `trg_semester_gpas_updated_at` — before update → `set_updated_at_timestamp()`

#### `support_queries`

Student queries raised to their assigned mentor. Renamed from support_tickets in 0031; the reference codes (AN-1, AN-2, ...) are unchanged.

*created in migration 0004 · renamed from `support_tickets` in 0031 · RLS enabled · published to Realtime*

> **Doc note:** codes run from AN-1001 (the sequence starts at 1001). The `escalated_to_hod` column comment ("after 3 rejections") is stale — any query can be referred since 0030. Mentor and HOD UPDATE policies allow direct changes to any column.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `query_code` | text | not null |  |  |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `mentor_id` | uuid | not null |  | FK → `user_profiles(id) on delete restrict` |
| `subject` | text | not null |  |  |
| `category` | query_category | not null |  |  |
| `priority` | query_priority | not null | `'Medium'::query_priority` |  |
| `status` | query_status | not null | `'Open'::query_status` |  |
| `resolution_status` | resolution_status | not null | `'none'::resolution_status` | Feature 3 — none -> pending_confirmation (faculty resolved) -> confirmed \| reopened (student answered). |
| `resolved_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `resolved_at` | timestamp with time zone |  |  |  |
| `student_confirmation` | confirmation_response |  |  |  |
| `student_confirmation_at` | timestamp with time zone |  |  |  |
| `student_confirmation_comment` | text |  |  |  |
| `reopen_count` | integer | not null | `0` |  |
| `first_response_at` | timestamp with time zone |  |  |  |
| `last_message_at` | timestamp with time zone | not null | `now()` |  |
| `satisfaction_rating` | smallint |  |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |
| `escalated_to_hod` | boolean | not null | `false` | Set when the mentor reports a repeatedly-reopened ticket to the HOD (after 3 rejections). |
| `escalated_at` | timestamp with time zone |  |  |  |
| `escalated_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `escalation_note` | text |  |  |  |
| `mom_id` | uuid |  |  | FK → `mom_records(id) on delete set null` Set when this ticket is an action item raised in a CR meeting. Null for an ordinary student ticket. Everything else about the ticket behaves identically. |

Constraints and indexes:

- `query_comment_max_length` — `CHECK (((student_confirmation_comment IS NULL) OR (char_length(student_confirmation_comment) <= 1000)))`
- `query_confirmation_has_timestamp` — `CHECK (((student_confirmation IS NULL) OR (student_confirmation_at IS NOT NULL)))`
- `query_rating_range` — `CHECK (((satisfaction_rating IS NULL) OR ((satisfaction_rating >= 1) AND (satisfaction_rating <= 5))))`
- `query_resolved_has_resolver` — `CHECK (((resolution_status = 'none'::resolution_status) OR (resolved_by IS NOT NULL)))`
- `query_student_is_not_mentor` — `CHECK ((student_id <> mentor_id))`
- `query_subject_max_length` — `CHECK ((char_length(subject) <= 200))`
- `query_subject_not_blank` — `CHECK (is_non_blank(subject))`
- `support_queries_query_code_key` — `UNIQUE (query_code)`
- index `queries_category_idx` — `btree (category)`
- index `queries_escalated_idx` — `btree (escalated_to_hod) WHERE (escalated_to_hod = true)`
- index `queries_mentor_idx` — `btree (mentor_id, created_at DESC)`
- index `queries_mom_idx` — `btree (mom_id) WHERE (mom_id IS NOT NULL)`
- index `queries_resolution_status_idx` — `btree (resolution_status) WHERE (resolution_status <> 'none'::resolution_status)`
- index `queries_status_idx` — `btree (status)`
- index `queries_student_idx` — `btree (student_id, created_at DESC)`
- index `queries_subject_trgm_idx` — `gin (subject extensions.gin_trgm_ops)`
- index `queries_updated_at_idx` — `btree (updated_at DESC)`

RLS policies:

- `queries_insert_own` — **INSERT** to authenticated; check `(is_student() AND (student_id = auth.uid()) AND (mentor_id = my_mentor_id()))`
- `queries_select_participants` — **SELECT** to authenticated; using `((student_id = auth.uid()) OR (mentor_id = auth.uid()) OR is_hod())`
- `queries_update_hod` — **UPDATE** to authenticated; using `is_hod()`; check `is_hod()`
- `queries_update_mentor` — **UPDATE** to authenticated; using `(mentor_id = auth.uid())`; check `(mentor_id = auth.uid())`

Grants: `authenticated`: INSERT,SELECT,UPDATE

Triggers:

- `trg_assign_query_code` — before insert → `assign_query_code()`
- `trg_notify_query_created` — after insert → `notify_on_query_created()`
- `trg_notify_query_resolution` — after update → `notify_on_query_resolution_change()`
- `trg_queries_updated_at` — before update → `set_updated_at_timestamp()`

#### `survey_cycles`

One shared 15-day survey window for the whole department. Opened by open_survey_cycle() on the schedule, or on demand via the manual trigger.

*created in migration 0023 · RLS enabled*

> **Doc note:** there is no automatic schedule; cycles are opened only by a manual run. `closes_on` is informational — responses are accepted until the next cycle opens.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `cycle_number` | integer | not null |  |  |
| `opens_on` | date | not null | `CURRENT_DATE` |  |
| `closes_on` | date | not null |  |  |
| `is_active` | boolean | not null | `true` |  |
| `trigger_source` | cycle_job_trigger | not null | `'scheduled'::cycle_job_trigger` |  |
| `opened_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `job_run_id` | uuid |  |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `survey_cycles_cycle_number_key` — `UNIQUE (cycle_number)`
- `survey_cycles_window_ordered` — `CHECK ((closes_on >= opens_on))`
- index `survey_cycles_single_active_idx` — `unique btree (is_active) WHERE (is_active = true)`

RLS policies:

- `survey_cycles_select_all` — **SELECT** to authenticated; using `true`

Grants: `authenticated`: SELECT

#### `survey_questions`

*created in migration 0023 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `question_number` | smallint | not null |  |  |
| `prompt` | text | not null |  |  |
| `is_active` | boolean | not null | `true` |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `survey_questions_number_range` — `CHECK (((question_number >= 1) AND (question_number <= 100)))`
- `survey_questions_prompt_not_blank` — `CHECK (is_non_blank(prompt))`
- `survey_questions_question_number_key` — `UNIQUE (question_number)`

RLS policies:

- `survey_questions_select_all` — **SELECT** to authenticated; using `true`

Grants: `authenticated`: SELECT

#### `survey_response_answers`

*created in migration 0023 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `response_id` | uuid | not null |  | FK → `survey_responses(id) on delete cascade` |
| `question_id` | uuid | not null |  | FK → `survey_questions(id) on delete cascade` |
| `rating` | smallint | not null |  |  |

Constraints and indexes:

- `survey_answer_one_per_question` — `UNIQUE (response_id, question_id)`
- `survey_answer_rating_range` — `CHECK (((rating >= 1) AND (rating <= 5)))`
- index `survey_response_answers_response_idx` — `btree (response_id)`

RLS policies:

- `survey_answers_select_scope` — **SELECT** to authenticated; using `(EXISTS ( SELECT 1
   FROM survey_responses r
  WHERE ((r.id = survey_response_answers.response_id) AND can_access_student(r.student_id))))`

Grants: `authenticated`: SELECT

#### `survey_responses`

*created in migration 0023 · RLS enabled*

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null | `extensions.gen_random_uuid()` | **PK** |
| `cycle_id` | uuid | not null |  | FK → `survey_cycles(id) on delete cascade` |
| `student_id` | uuid | not null |  | FK → `user_profiles(id) on delete cascade` |
| `mentor_id` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `submitted_at` | timestamp with time zone | not null | `now()` |  |

Constraints and indexes:

- `survey_responses_one_per_cycle` — `UNIQUE (cycle_id, student_id)`
- index `survey_responses_cycle_idx` — `btree (cycle_id)`
- index `survey_responses_mentor_idx` — `btree (mentor_id, cycle_id)`

RLS policies:

- `survey_responses_select_scope` — **SELECT** to authenticated; using `can_access_student(student_id)`

Grants: `authenticated`: SELECT

#### `user_profiles`

Application identity for every authenticated user. One row per auth.users row.

*created in migration 0002 · RLS enabled · published to Realtime*

> **Doc note:** protected columns (see §7.1) can only change through the listed RPCs or by the HOD; every other column is editable by its owner through `profiles_update_self`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | not null |  | **PK** FK → `auth.users(id) on delete cascade` |
| `role` | user_role | not null | `'student'::user_role` |  |
| `full_name` | text | not null |  |  |
| `email` | text | not null |  |  |
| `login_id` | text |  |  | Registration number (students) or faculty ID. Display + roster matching only — login is by email. |
| `phone` | text |  |  |  |
| `department` | text | not null | `'IoT & IS'::text` |  |
| `branch` | text |  |  |  |
| `section` | text |  |  |  |
| `semester_label` | text |  |  |  |
| `avatar_url` | text |  |  | Storage object path in the profile-photos bucket, e.g. <uuid>/avatar-1712345678.png. Never a public URL. |
| `assigned_mentor_id` | uuid |  |  | FK → `user_profiles(id) on delete set null` Flat FK, not a join table. Bulk reassignment (Feature 8) is a single UPDATE. |
| `is_star_mentee` | boolean | not null | `false` |  |
| `star_mentee_assigned_by` | uuid |  |  | FK → `user_profiles(id) on delete set null` |
| `star_mentee_assigned_at` | timestamp with time zone |  |  |  |
| `employment_status` | employment_status | not null | `'active'::employment_status` |  |
| `available_for_reassignment` | boolean | not null | `true` |  |
| `mentee_capacity` | integer | not null | `30` |  |
| `form_a_completed` | boolean | not null | `false` |  |
| `form_a_completed_at` | timestamp with time zone |  |  |  |
| `must_change_password` | boolean | not null | `true` |  |
| `is_active` | boolean | not null | `true` |  |
| `last_login_at` | timestamp with time zone |  |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |  |
| `updated_at` | timestamp with time zone | not null | `now()` |  |
| `cluster_head_setup_completed` | boolean | not null | `false` | Cluster Head one-time setup form. Mirrors form_a_completed for students: the portal is route-gated until this is true. |
| `cluster_head_setup_completed_at` | timestamp with time zone |  |  |  |
| `parent_name` | text |  |  |  |
| `parent_mobile` | text |  |  | Guardian contact from the student roster import. Form A is still preferred where the student filled one in — see at_risk_student_overview. |
| `parent_email` | text |  |  |  |
| `hod_email` | text |  |  | Faculty only. The HOD that this mentor's escalations are routed to. Validated against an active hod profile when set. |

Constraints and indexes:

- `user_profiles_email_shape` — `CHECK ((email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text))`
- `user_profiles_full_name_not_blank` — `CHECK (is_non_blank(full_name))`
- `user_profiles_hod_email_shape` — `CHECK (((hod_email IS NULL) OR (hod_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)))`
- `user_profiles_mentee_capacity_sane` — `CHECK (((mentee_capacity >= 1) AND (mentee_capacity <= 200)))`
- `user_profiles_no_self_mentor` — `CHECK (((assigned_mentor_id IS NULL) OR (assigned_mentor_id <> id)))`
- `user_profiles_student_only_fields` — `CHECK (((role = 'student'::user_role) OR ((assigned_mentor_id IS NULL) AND (is_star_mentee = false) AND (form_a_completed = false))))`
- index `user_profiles_assigned_mentor_idx` — `btree (assigned_mentor_id) WHERE (assigned_mentor_id IS NOT NULL)`
- index `user_profiles_email_unique_idx` — `unique btree (lower(email))`
- index `user_profiles_employment_status_idx` — `btree (employment_status) WHERE (role = 'faculty'::user_role)`
- index `user_profiles_full_name_trgm_idx` — `gin (full_name extensions.gin_trgm_ops)`
- index `user_profiles_login_id_unique_idx` — `unique btree (lower(login_id)) WHERE (login_id IS NOT NULL)`
- index `user_profiles_role_idx` — `btree (role)`

RLS policies:

- `profiles_select_faculty_roster` — **SELECT** to authenticated; using `((role = 'faculty'::user_role) AND (is_faculty() OR is_hod()))`
- `profiles_select_hod_all` — **SELECT** to authenticated; using `is_hod()`
- `profiles_select_own_mentees` — **SELECT** to authenticated; using `(assigned_mentor_id = auth.uid())`
- `profiles_select_own_mentor` — **SELECT** to authenticated; using `(id = my_mentor_id())`
- `profiles_select_self` — **SELECT** to authenticated; using `(id = auth.uid())`
- `profiles_update_hod` — **UPDATE** to authenticated; using `is_hod()`; check `is_hod()`
- `profiles_update_self` — **UPDATE** to authenticated; using `(id = auth.uid())`; check `(id = auth.uid())`

Grants: `authenticated`: SELECT,UPDATE

Triggers:

- `trg_guard_protected_profile_columns` — before update → `guard_protected_profile_columns()`
- `trg_notify_mentor_reassignment` — after update of assigned_mentor_id → `notify_on_mentor_reassignment()`
- `trg_notify_star_mentee` — after update of is_star_mentee → `notify_on_star_mentee_change()`
- `trg_user_profiles_updated_at` — before update → `set_updated_at_timestamp()`

### 7.5 Views

Every view is created `WITH (security_invoker = true)`, so it runs with the caller's privileges and the underlying tables' RLS still applies.

#### `at_risk_student_overview`

At-risk roster: attendance, GPA, backlog count and guardian contact in one row. Parent contact prefers Form A and falls back to the student roster import.

*defined in migration 0022, 0027 · security_invoker=true · reads `at_risk_meetings`, `student_form_a_profiles`, `student_risk_flags`, `user_profiles`*

Columns: `student_id`, `student_name`, `registration_no`, `email`, `section`, `branch`, `semester_label`, `assigned_mentor_id`, `mentor_name`, `is_at_risk`, `low_attendance`, `low_gpa`, `has_backlog`, `attendance_percent`, `latest_gpa`, `latest_gpa_semester`, `backlog_count`, `reasons`, `first_flagged_at`, `last_evaluated_at`, `father_name`, `father_mobile`, `mother_name`, `mother_mobile`, `primary_parent_mobile`, `primary_parent_email`, `open_meeting_id`, `open_meeting_status`, `open_meeting_join_url`, `open_meeting_created_at`

#### `faculty_performance_summary`

*defined in migration 0012, 0031 · security_invoker=true · reads `support_queries`, `user_profiles`*

Columns: `faculty_id`, `faculty_name`, `faculty_email`, `faculty_login_id`, `branch`, `department`, `employment_status`, `available_for_reassignment`, `mentee_capacity`, `mentee_count`, `total_queries`, `open_queries`, `in_progress_queries`, `resolved_queries`, `academic_queries`, `erp_tech_queries`, `infrastructure_queries`, `confirmed_resolutions`, `reopened_resolutions`, `awaiting_confirmation`, `avg_first_response_hours`, `avg_resolution_hours`, `avg_satisfaction`, `rated_queries`, `resolution_rate_percent`

#### `faculty_reserve_pool`

*defined in migration 0012 · security_invoker=true · reads `user_profiles`*

Columns: `faculty_id`, `full_name`, `email`, `login_id`, `branch`, `employment_status`, `available_for_reassignment`, `mentee_capacity`, `current_mentees`, `remaining_capacity`

#### `query_daily_trend`

*defined in migration 0031 · security_invoker=true · reads `support_queries`*

Columns: `mentor_id`, `day`, `queries_created`, `queries_resolved`, `academic`, `erp_tech`, `infrastructure`

#### `student_attendance_overview`

One row per student per course — the most recent reporting period. Powers the attendance table on the student Academics page.

*defined in migration 0025 · security_invoker=true · reads `student_attendance_records`*

Columns: `student_id`, `course_id`, `course_code`, `course_name`, `section_label`, `attendance_percent`, `classes_held`, `classes_attended`, `period_start`, `period_end`, `updated_at`

#### `student_query_summary`

*defined in migration 0031 · security_invoker=true · reads `support_queries`, `user_profiles`*

Columns: `student_id`, `student_name`, `registration_no`, `email`, `section`, `branch`, `semester_label`, `assigned_mentor_id`, `is_star_mentee`, `form_a_completed`, `total_queries`, `open_queries`, `in_progress_queries`, `resolved_queries`, `academic_queries`, `erp_tech_queries`, `infrastructure_queries`, `confirmed_resolutions`, `reopened_resolutions`, `avg_rating_given`, `last_query_at`

#### `survey_group_completion`

*defined in migration 0023 · security_invoker=true · reads `survey_mentee_status`*

Columns: `cycle_id`, `cycle_number`, `opens_on`, `closes_on`, `cycle_is_active`, `assigned_mentor_id`, `total_students`, `submitted_count`, `pending_count`, `completion_percent`

#### `survey_mentee_status`

Per-student completion status for every survey cycle. Powers the mentor's tracking column; RLS on user_profiles scopes it to the caller's own mentees.

*defined in migration 0023 · security_invoker=true · reads `survey_cycles`, `survey_responses`, `user_profiles`*

Columns: `cycle_id`, `cycle_number`, `opens_on`, `closes_on`, `cycle_is_active`, `student_id`, `student_name`, `registration_no`, `email`, `section`, `assigned_mentor_id`, `is_star_mentee`, `has_submitted`, `submitted_at`

### 7.6 Functions

The complete function catalogue, with security mode, grants, callers and purpose, is in §5.3.

### 7.7 Triggers on `auth.users`

- `trg_on_auth_user_created` on `auth.users` — after insert → `handle_new_auth_user()`
- `trg_on_auth_user_email_changed` on `auth.users` — after update of email → `handle_auth_user_email_change()`

### 7.8 Storage buckets and policies

| Bucket | Public | Size limit | Allowed MIME types |
|---|---|---|---|
| `achievement-proofs` | false | 5 MB | image/png, image/jpeg, image/jpg, image/webp, application/pdf |
| `form-a-uploads` | false | 5 MB | image/png, image/jpeg, image/jpg, image/webp, application/pdf |
| `profile-photos` | false | 3 MB | image/png, image/jpeg, image/jpg, image/webp |
| `roster-imports` | false | 10 MB | text/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet |

Storage policies (on `storage.objects`):

- `achievement_proofs_delete_own` — **DELETE** to authenticated; using `((bucket_id = 'achievement-proofs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))`
- `achievement_proofs_insert_own` — **INSERT** to authenticated; check `((bucket_id = 'achievement-proofs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))`
- `achievement_proofs_select_scope` — **SELECT** to authenticated; using `((bucket_id = 'achievement-proofs'::text) AND can_access_student(((storage.foldername(name))[1])::uuid))`
- `form_a_uploads_delete_own` — **DELETE** to authenticated; using `((bucket_id = 'form-a-uploads'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))`
- `form_a_uploads_insert_own` — **INSERT** to authenticated; check `((bucket_id = 'form-a-uploads'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))`
- `form_a_uploads_select_scope` — **SELECT** to authenticated; using `((bucket_id = 'form-a-uploads'::text) AND can_access_student(((storage.foldername(name))[1])::uuid))`
- `form_a_uploads_update_own` — **UPDATE** to authenticated; using `((bucket_id = 'form-a-uploads'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))`
- `profile_photos_delete_own` — **DELETE** to authenticated; using `((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))`
- `profile_photos_insert_own` — **INSERT** to authenticated; check `((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))`
- `profile_photos_select_any` — **SELECT** to authenticated; using `(bucket_id = 'profile-photos'::text)`
- `profile_photos_update_own` — **UPDATE** to authenticated; using `((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))`
- `roster_imports_hod_all` — **ALL** to authenticated; using `((bucket_id = 'roster-imports'::text) AND is_hod())`; check `((bucket_id = 'roster-imports'::text) AND is_hod())`

### 7.9 Other database objects

- Extensions: `citext`, `pg_trgm`, `pgcrypto`
- Sequences: `audit_log_id_seq`, `query_code_seq`
- Realtime publication `supabase_realtime`: `notifications`, `query_messages`, `student_achievements`, `support_queries`, `user_profiles`

### 7.10 Who reads and writes each table

This table was generated from the code. The columns are:

- **Browser / API direct:** `supabase.from('<table>')` calls in `frontend/src` and `api/`, by operation.
- **Written by SQL:** functions whose bodies INSERT, UPDATE or DELETE the table.

Reads inside SQL functions and views are not listed.

| Table / view | Browser / API direct | Written by SQL functions |
|---|---|---|
| `academic_upload_batches` | **select**: `ClusterHeadDashboardPage.jsx` | `record_attendance_batch`, `record_backlog_batch`, `record_black_dot_batch`, `record_gpa_batch` |
| `api_rate_limits` | — | `consume_rate_limit` |
| `at_risk_meetings` | — | `dispatch_at_risk_meetings`, `notify_on_at_risk_meeting`, `set_at_risk_meeting_status` |
| `at_risk_student_overview` (view) | **select**: `FacultyAtRiskPage.jsx` | — |
| `audit_log` | — | `write_audit_entry` |
| `canned_replies` | **select**: `FacultyQueryDetailPage.jsx` | — |
| `cluster_head_courses` | **select**: `ClusterHeadAttendancePage.jsx`, `ClusterHeadCoursesPage.jsx`, `ClusterHeadDashboardPage.jsx`, `ClusterHeadSetupPage.jsx` | `submit_cluster_head_setup` |
| `counselling_requests` | **select**: `FacultyCounsellingPage.jsx`, `StudentCounsellingPage.jsx` | `request_counselling`, `respond_to_counselling` |
| `cycle_job_runs` | — | `run_cycle_job` |
| `cycle_job_schedule` | — | `run_cycle_job` |
| `faculty_performance_summary` (view) | **select**: `HodDashboardPage.jsx`, `HodFacultyPerformancePage.jsx` | — |
| `faculty_reserve_pool` (view) | **select**: `manage-faculty-roster.js` | — |
| `mentor_reassignment_log` | — | `notify_on_mentor_reassignment`, `reassign_mentees` |
| `mom_records` | **select**: `FacultyCrReportsPage.jsx`, `StudentCrReportPage.jsx` | `submit_mom_report` |
| `notifications` | **select**: `NotificationProvider.jsx`<br>**update**: `NotificationProvider.jsx`<br>**realtime**: `NotificationProvider.jsx` | `enqueue_notification`, `mark_all_notifications_read` |
| `query_daily_trend` (view) | **select**: `HodDashboardPage.jsx` | — |
| `query_messages` | **select**: `useRealtimeQueries.js`<br>**realtime**: `useRealtimeQueries.js` | `confirm_query_resolution`, `create_support_query`, `escalate_query_to_hod`, `post_query_message`, `resolve_support_query`, `set_query_in_progress`, `submit_mom_report` |
| `roster_import_batches` | **select**: `ClusterHeadRosterPage.jsx`, `import-roster-spreadsheet.js`<br>**insert**: `import-roster-spreadsheet.js`<br>**update**: `import-roster-spreadsheet.js` | — |
| `semester_cycles` | **select**: `import-roster-spreadsheet.js`<br>**update**: `import-roster-spreadsheet.js` | — |
| `student_achievements` | **select**: `StudentAchievementsPage.jsx`<br>**insert**: `StudentAchievementsPage.jsx`<br>**update**: `StudentAchievementsPage.jsx`<br>**delete**: `StudentAchievementsPage.jsx` | `set_achievement_verification` |
| `student_attendance_overview` (view) | **select**: `FacultyAtRiskPage.jsx`, `StudentAcademicsPage.jsx` | — |
| `student_attendance_records` | — | `record_attendance_batch` |
| `student_backlogs` | — (read through `get_student_dossier`) | `record_backlog_batch` |
| `student_black_dots` | — (read through `get_student_dossier`) | `record_black_dot_batch` |
| `student_cgpas` | **select**: `StudentAcademicsPage.jsx` (also through `get_student_dossier`) | `record_gpa_batch` |
| `student_course_sections` | — | `record_attendance_batch` |
| `student_form_a_profiles` | **select**: `FormAFields.jsx` | `request_form_a_unlock`, `set_gpa_sharing`, `submit_student_form_a`, `unlock_student_form_a` |
| `student_query_summary` (view) | **select**: `FacultyMenteesPage.jsx`, `HodStudentsPage.jsx` | — |
| `student_risk_flags` | — | `evaluate_student_risk` |
| `student_semester_gpas` | **select**: `FacultyAtRiskPage.jsx`, `StudentAcademicsPage.jsx` | `record_gpa_batch`, `upsert_semester_gpa` |
| `support_queries` | **select**: `FacultyCrReportsPage.jsx`, `StudentCrReportPage.jsx`, `manage-faculty-roster.js`, `useRealtimeQueries.js`<br>**update**: `FacultyQueryDetailPage.jsx`, `manage-faculty-roster.js`<br>**realtime**: `StudentGroupQueriesPage.jsx`, `useRealtimeQueries.js` | `confirm_query_resolution`, `create_support_query`, `escalate_query_to_hod`, `post_query_message`, `rate_support_query`, `resolve_support_query`, `set_query_in_progress`, `submit_mom_report` |
| `survey_cycles` | — | `open_survey_cycle` |
| `survey_group_completion` (view) | — | — |
| `survey_mentee_status` (view) | **select**: `FacultyMenteesPage.jsx` | — |
| `survey_questions` | — | — |
| `survey_response_answers` | — | `submit_survey_response` |
| `survey_responses` | — | `submit_survey_response` |
| `user_profiles` | **select**: `AddAccountModal.jsx`, `AuthProvider.jsx`, `FacultyActivityReportPage.jsx`, `HodStudentsPage.jsx`, `import-roster-spreadsheet.js`, `manage-faculty-roster.js`, `provision-user-accounts.js`, `request-guards.js`, `upload-academic-data.js`<br>**update**: `AuthProvider.jsx`, `FacultyProfilePage.jsx`, `ProfilePhotoUploader.jsx`, `StudentProfilePage.jsx`, `import-roster-spreadsheet.js`, `provision-user-accounts.js`<br>**realtime**: `AuthProvider.jsx` | `handle_auth_user_email_change`, `handle_new_auth_user`, `map_students_to_mentors`, `reassign_mentees`, `set_faculty_employment_status`, `set_mentor_department_and_hod`, `set_star_mentee`, `submit_cluster_head_setup`, `submit_student_form_a`, `unlock_student_form_a` |

---

## 8. Authentication and security

### 8.1 Layers

| Layer | What it does | Is it a security boundary? |
|---|---|---|
| Route guards (`RouteGuards.jsx`) | Send users to sign-in, password change, onboarding or setup, or to their own portal | **No.** Convenience only. |
| Page-level checks (for example, star-mentee pages redirecting) | Hide what a user cannot use | **No.** |
| API guards (`request-guards.js`) | JWT verification, active profile, role, rate limit, audit | **Yes**, for the service-role work the API does |
| Postgres RLS | Row visibility and direct-write rules on every table | **Yes.** The primary boundary. |
| SECURITY DEFINER RPCs | Every rule-bearing state change re-checks the caller | **Yes** |
| `guard_protected_profile_columns` | Stops users editing their own role, mentor, flags and similar columns | **Yes** |
| Storage policies | Owner-folder writes; `can_access_student` reads | **Yes** |

### 8.2 Authentication

- **Provider.** Supabase Auth, e-mail and password. Self sign-up is disabled (`enable_signup = false` in `config.toml`; a hosted project must disable it too). Auth e-mail confirmation is off, and accounts are created pre-confirmed (`email_confirm: true`).
- **Account creation.** Only the service role, through the API, can create accounts (§4.1). New accounts get `must_change_password = true` and the shared temporary password from `SSMP_TEMPORARY_PASSWORD`. That variable has a hard-coded fallback in `api/_lib/environment.js`, so **it must be set in production**.
- **Forced password change.** `RequirePasswordChange` blocks every protected route until the flag is cleared. The rules (at least 10 characters with upper, lower, digit and symbol) are enforced **only in the browser**. Supabase's own minimum applies server-side, and no stronger server policy is configured in `config.toml`.
- **Sessions.**
  - PKCE flow; the session is persisted in `localStorage` (`ssmp.auth.session`) and auto-refreshed.
  - JWT lifetime is 3,600 s, with refresh-token rotation.
  - Inactivity timeout: 720 h in `config.toml`; this must be mirrored in hosted settings.
  - A token in `localStorage` is readable by any script on the page. There is **no Content-Security-Policy** to reduce XSS risk; see §8.7.
- **API authentication.**
  - Every endpoint except `/api/health` verifies the bearer token with `auth.getUser` (a network call to Supabase Auth).
  - It loads the profile with the service role and rejects inactive accounts.
  - Role checks use `user_profiles.role`, never JWT claims.
- **Password reset.** Supabase Auth e-mails a link to `<origin>/reset-password`. The link completes only in the requesting browser (PKCE).

### 8.3 Role capability matrix

"Direct" means a table operation allowed by RLS. "RPC" means through a definer function.

| Capability | student | faculty | hod | cluster_head |
|---|---|---|---|---|
| Own profile: read; update non-protected columns (phone, avatar, name, section…) | direct | direct | direct (any profile) | direct |
| Read other profiles | own mentor | own mentees; all faculty | all | none |
| Form A | own: read, RPC submit/edit, and a **direct insert/update of any column** (including `is_submitted`, `is_locked`, `gpa_sharing_enabled`) | mentees': read | all: read, direct update | — |
| Semester GPA and official CGPA | own: read; GPA by RPC and direct write (CGPA read-only) | mentees': read if sharing | all: read | write via upload RPC only |
| Achievements | own: CRUD while unverified | mentees': read, RPC verify | all: read, RPC verify | — |
| Queries | own: RPC create/confirm/rate/post; read | assigned: read, RPC resolve/escalate/post/in-progress, direct update | all: same as faculty | — |
| Canned replies | — | read global and own; manage own (no UI) | same | — |
| Counselling | own: RPC request; read | assigned: read, RPC respond, direct update | **none** | — |
| CR reports (`mom_records`) | star mentee: RPC file; read the reports they filed | read reports addressed to them (`mentor_id`); act on items | read all | — |
| At-risk flags, meetings, overview | own flags and meetings readable (RLS; no UI shows them) | mentees' (`can_access_student`); **direct UPDATE** of meetings they organise | all; direct UPDATE of meetings | — |
| Attendance records and overview | own | mentees' | all | own uploads |
| Backlogs | own readable (RLS; no UI) | mentees' (student page) | all (student page) | rows they uploaded |
| Black dots | own readable (RLS; no UI) | mentees' (student page) | all (student page) | rows they uploaded |
| Surveys | own: RPC answer | mentees' status (view), **and each mentee's individual answers** (RLS; no UI) | all, including answers | — |
| Star mentee | star: group queries and survey status (RPCs) | RPC set | RPC set | — |
| Uploads (attendance, GPA, backlog, black dot, mentor map) | — | — | via API, or the RPCs directly | via API (after setup), or the RPCs directly (no setup check) |
| Roster import, account creation | — | — | via API (roster, single accounts) | via API (roster; mentor-map creates mentors) |
| Faculty status, reassignment | — | — | via API, or the RPCs directly (no query handover) | — |
| Cycle jobs | — | — | via API, or the RPCs directly | — |
| Reports | own dossier (API/RPC allow it; no UI) | own activity; mentees' dossiers | all, plus the department report | — |
| Notifications | own | own | own | own |
| Audit log | — | — | read (no UI) | — |

### 8.4 Who can see what

- **Queries and messages.**
  - `support_queries` rows are visible to the student, the query's `mentor_id`, and the HOD (`queries_select_participants`).
  - `query_messages` are visible through `can_access_query`.
  - A mentor who loses a student keeps seeing that student's old queries if they still own them (§4.4).
- **Profiles.** `user_profiles` SELECT policies:
  - self;
  - own mentor (`my_mentor_id()`);
  - own mentees;
  - faculty rows for faculty and the HOD;
  - everything for the HOD.

  Students cannot see classmates' profiles. The star mentee's group views come from narrow definer RPCs.
- **Student records** (Form A, achievements, attendance, backlogs, black dots, risk flags, meetings): `can_access_student`, i.e. self, mentor or HOD. GPA and the official CGPA use `can_view_student_gpa` instead.
- **Counselling.** Student and assigned mentor only. No HOD access.
- **Cluster heads.** Their own profile, their own courses, sections and attendance they uploaded, the backlog and black dot rows they uploaded, and their own upload and roster batches. They have **no read access** to students' GPAs or CGPA, risk data, queries or Form A.
- **Storage.** See §2.5. Profile photos are readable by any signed-in user.

### 8.5 API hardening

- zod validation of every body and query; `parseOrThrow` returns readable 400s. Single-line sanitising is applied where names are copied into metadata.
- Body limits: 2 MB (provisioning); 10 MB (uploads; base64 capped at 8,000,000 characters).
- Rate limits per user and bucket, in Postgres; the limiter fails open (§4.23).
- The service-role key exists only in serverless environment variables. It is used for Auth admin, profile loading, audit, rate limiting, the query handover on reassignment, follow-up profile updates after account creation, the roster import's faculty and e-mail pre-loads and its `roster_import_batches` / `semester_cycles` writes, the faculty lookup when creating missing mentors, and the mentee count after a status change. Everything else runs as the user.
- Errors of status 500 or above never expose internals.
- CORS is an allow-list plus localhost outside production, plus `*.vercel.app` if one is allow-listed. Requests without `Origin` are served.
- Security headers on API responses and, through `vercel.json`, on all responses: `nosniff`, `DENY` framing, referrer policy, permissions policy, **HSTS with preload** (vercel.json), COOP.
- An audit entry for every privileged action that goes through the API (§4.23). Calling the underlying RPCs directly leaves none (S17).

### 8.6 Database hardening

- RLS on every table (enabled, not forced), nothing granted to `anon`, CI asserts RLS.
- Every definer function pins `search_path` and checks its caller, except the gaps in §8.9.
- Audit, rate-limit and notification writers are not executable by clients: `write_audit_entry` and `consume_rate_limit` are service-role only, and `enqueue_notification` is owner-only.
- `mom_records` and `audit_log` are append-only for clients.
- The `ssmp.trusted_operation` flag is transaction-local (`set_config(..., true)`) and only set inside definer functions.

### 8.7 Browser hardening

- `vercel.json` sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (camera, microphone, geolocation, payment, usb disabled), `Strict-Transport-Security` (2 years, preload), and `Cross-Origin-Opener-Policy`.
- **No `Content-Security-Policy` is set anywhere.** Neither `vercel.json` nor `index.html` has one. The comment in `lib/supabaseClient.js` that relies on "a strict Content-Security-Policy" is wrong.
- React escapes output. `dangerouslySetInnerHTML` is not used anywhere; the word appears only in a comment. The one `innerHTML` write is the static configuration-error page in `supabaseClient.js`.

### 8.8 Secrets and configuration

- Variable **names** and purposes are in §12. Values live only in `.env` files, which are ignored by git (`.env`, `.env.*` except `.env.example`), and in the Vercel / Supabase dashboards.
- The **anon key** and **Supabase URL** are public by design; they ship in the browser bundle. The **service-role key** must never be given a `VITE_` prefix.
- Hard-coded fallbacks exist for two passwords:
  - `SSMP_TEMPORARY_PASSWORD`, in `api/_lib/environment.js`;
  - `SEED_DEFAULT_PASSWORD`, in `supabase/scripts/seed-demo-accounts.mjs`.

  The local-only `supabase/seed.sql` also states its demo password in a comment. Treat all demo accounts as public: never seed them into production.

### 8.9 Known security gaps (verified)

These were found while writing this document and verified in the code; several were tested in rolled-back transactions. **S3 is fixed and S5 is narrowed by migration 0035; the rest are not fixed.**

| # | Gap | Impact | Where |
|---|---|---|---|
| S1 | Students can **directly** INSERT, UPDATE or DELETE their own `student_semester_gpas` rows regardless of `source`, including department-published GPAs *(tested)* | A student can falsify official GPA, which feeds risk evaluation, mentor views and the dossier | policies `gpas_insert_own`, `gpas_update_own`, `gpas_delete_own` |
| S2 | `evaluate_student_risk(p_student_id)` has **no caller check** and is executable by `authenticated` | Any signed-in user, including students and cluster heads, can read any student's attendance mean, latest GPA, backlog count and reasons *(tested)*. The call also writes: it upserts the flag row and can trigger notifications | function `evaluate_student_risk` |
| S3 | **Fixed in 0035.** `resolve_student_ids(text[])` had no role check and was executable by `authenticated` | Any signed-in user could map registration numbers or e-mails to student UUIDs (enumeration). It now refuses anyone but a cluster head, the HOD or a no-JWT call, and matches registration numbers only | function `resolve_student_ids` (0033, 0035) |
| S4 | The HOD dashboard branch of `get_dashboard_metrics` is the `else` branch | A `cluster_head` calling the RPC receives department-wide query and user counts | function `get_dashboard_metrics` |
| S5 | Profile self-update covers every unprotected column (**narrowed in 0035**: `login_id`, the registration number every upload matches on, is now protected) | A user can change their own `full_name`, `section`, `semester_label`, `department`, `avatar_url`, `hod_email`, `parent_*`, `created_at`, the `*_completed_at` timestamps, and (faculty) `mentee_capacity`, which feeds the reserve pool. They can also clear `must_change_password` *(tested)*. | policy `profiles_update_self`; guard column list |
| S6 | Mentor and HOD `UPDATE` policies on `support_queries` are not column-restricted (the mentor's `WITH CHECK` only keeps `mentor_id = auth.uid()`) | A mentor can change `status`, `resolution_status`, `reopen_count`, `satisfaction_rating`, the escalation columns, `subject` and so on directly, bypassing the RPC rules. The HOD can change anything. | policies `queries_update_mentor`, `queries_update_hod` |
| S7 | `latest_gpa` is exposed through `student_risk_flags` / `at_risk_student_overview` with `can_access_student`, not `can_view_student_gpa` | GPA-sharing preference is bypassed (moot while the toggle is gone) | view `at_risk_student_overview` |
| S8 | Deactivation does not end sessions. `is_active` is checked at sign-in, by the API, and by `is_student()` / `is_faculty()` / `is_hod()` / `is_cluster_head()`, but **not** by `is_mentor_of()` (hence not by `can_access_student`) or by policies comparing `mentor_id = auth.uid()` | A deactivated mentor with a live session can still read mentees' profiles, Form A and risk flags, and update their queries *(tested)* | `AuthProvider`; `is_mentor_of`; no Auth ban |
| S9 | Shared temporary password with a public fallback, shown on screen and in CSV downloads | Anyone who knows the default can sign in to any account that has not yet changed it, if the variable is unset | `environment.js`, `ClusterHeadRosterPage` |
| S10 | Password complexity is client-side only | A user can set a weak password with a direct `auth.updateUser` call | `ChangePasswordPage` |
| S11 | No Content-Security-Policy, and the session is in `localStorage` | XSS impact is higher | `vercel.json`, `index.html` |
| S12 | The escalation note is visible to the student, although the UI says it is not | Privacy expectation mismatch | `escalate_query_to_hod` system message |
| S13 | `handle_new_auth_user` trusts `raw_user_meta_data.role` | Safe **only** while public sign-up is disabled | trigger `trg_on_auth_user_created` |
| S14 | Cluster heads can write `cluster_head_courses` directly | Bypasses setup validation. Deleting a course cascades attendance. | policy `ch_courses_write_own` |
| S15 | Students can INSERT `support_queries` directly (`queries_insert_own`: own id and current mentor) | Bypasses `create_support_query`'s 20-unresolved cap and description rules. Only the subject's CHECK constraints (non-blank, ≤ 200) still apply. The row can carry any `status`, `resolution_status`, `priority`, rating, `resolved_by` or `escalated_*` value allowed by the column constraints (for example, a fake "Resolved, confirmed, rated 1/5" query credited to the mentor, *tested*). No first message is created. The creation notification still fires. | policy `queries_insert_own` |
| S16 | Survey answers are readable by the mentor they are about | Individual ratings are not anonymous: `survey_responses` and `survey_response_answers` are visible to the mentor and the HOD through `can_access_student` *(tested)* | policies `survey_responses_select_scope`, `survey_answers_select_scope` |
| S17 | The privileged RPCs behind the API are executable by `authenticated` and check only the caller's role: `record_*_batch`, `map_students_to_mentors`, `run_cycle_job`, `run_all_cycle_jobs_now`, `reassign_mentees`, `set_faculty_employment_status` | A cluster head or HOD calling them through PostgREST skips the API's setup gate (no SQL function checks `cluster_head_setup_completed`), rate limit and audit entry. A direct `reassign_mentees` also skips the query handover. | function grants |
| S18 | Mentors can UPDATE their counselling requests directly (`counselling_update_mentor`, all columns) | A mentor can rewrite the student's `concern` or change `status` outside `respond_to_counselling` | policy `counselling_update_mentor` |
| S19 | The HOD bypasses the protected-column guard and has `profiles_update_hod` | The HOD can directly change any profile's role, activation, mentor or star flag, **including their own role** (by design, but with no audit trail) | `guard_protected_profile_columns`, `profiles_update_hod` |
| S20 | `set_gpa_sharing` is still executable although the UI toggle was removed, and Form A rows are directly updatable | A student can turn GPA sharing off without the UI, hiding GPAs from the mentor | function `set_gpa_sharing`; policy `form_a_update_own` |

---

## 9. Frontend

### 9.1 Stack and build

| | |
|---|---|
| **Framework** | React 19 (`react`, `react-dom` ^19) |
| **Router** | React Router 7 (`react-router-dom` ^7.1), `BrowserRouter` |
| **Build** | Vite 6 with `@vitejs/plugin-react`. Dev server on port 5173. Manual chunks: `react-vendor`, `supabase-vendor`, `charts-vendor`. Output goes to `frontend/dist`. |
| **Styling** | Tailwind CSS 3.4, `@tailwindcss/forms`, PostCSS with autoprefixer, and custom component classes in `index.css` |
| **Charts** | Recharts 2.15, wrapped in `components/charts/Charts.jsx` |
| **Data** | `@supabase/supabase-js` ^2.48 (DB, RPC, Realtime, Storage, Auth) and a small `fetch` wrapper for `/api` |
| **Lint and test** | `oxlint src`; `vite-node test/ui-regression.test.jsx` (jsdom) |

There is no global store (no Redux, Zustand or React Query). The only shared state is in the three contexts; each page loads its own data.

### 9.2 Composition

`main.jsx` renders `<StrictMode><App/></StrictMode>`. `App.jsx` nests:

```
ErrorBoundary
└─ BrowserRouter
   └─ ToastProvider
      └─ AuthProvider            (session + profile + live profile updates)
         └─ NotificationProvider (bell data + realtime toasts)
            └─ AppRouter         (Suspense fallback = <PageLoader/>)
```

- `LoginPage`, `ChangePasswordPage` and `NotFoundPage` are imported eagerly. Every other page (37 of them) is `React.lazy`, inside one `Suspense`.
- Every signed-in page renders its own `PortalShell`. The exceptions are the onboarding pages and `/cluster-head/setup`, which render bare so that no menu is available until the step is done.

### 9.3 Route table

`Protected role=X` means `RequireAuth → RequirePasswordChange → RequireRole(X)`. `RequireRole` is an exact role match; a user with another role is redirected to their own `HOME_PATH`.

| Path | Component | Guards | Notes |
|---|---|---|---|
| `/login` | `LoginPage` | none | Redirects signed-in users home |
| `/change-password` | `ChangePasswordPage` | `RequireAuth` | Forced first-login password change |
| `/reset-password` | `ChangePasswordPage` | none | Password-reset landing (recovery session from the URL) |
| `/` | `HomeRedirect` | none | Goes to `HOME_PATH[role]` or `/login` |
| `/student/onboarding` | `StudentOnboardingFormPage` | Protected student | Form A, no shell |
| `/student/profile-photo` | `StudentProfilePhotoPage` | Protected student | Photo step, no shell |
| `/student` | `StudentDashboardPage` | Protected student + `RequireOnboarding` | |
| `/student/queries` | `StudentQueriesPage` | same | |
| `/student/queries/:queryId` | `StudentQueryDetailPage` | same | |
| `/student/group-queries` | `StudentGroupQueriesPage` | same | Star mentee only (page redirect and RPC) |
| `/student/academics` | `StudentAcademicsPage` | same | |
| `/student/survey` | `StudentSurveyPage` | same | |
| `/student/survey-tracking` | `StudentSurveyTrackingPage` | same | Star mentee only |
| `/student/cr-report` | `StudentCrReportPage` | same | Star mentee only |
| `/student/counselling` | `StudentCounsellingPage` | same | |
| `/student/achievements` | `StudentAchievementsPage` | same | |
| `/student/profile` | `StudentProfilePage` | same | |
| `/faculty` | `FacultyDashboardPage` | Protected faculty | |
| `/faculty/queries` | `FacultyQueryQueuePage` | Protected faculty | |
| `/faculty/queries/:queryId` | `FacultyQueryDetailPage` | Protected faculty | |
| `/faculty/mentees` | `FacultyMenteesPage` | Protected faculty | |
| `/faculty/mentees/:studentId` | `FacultyMenteeDetailPage` | Protected faculty | |
| `/faculty/at-risk` | `FacultyAtRiskPage` | Protected faculty | |
| `/faculty/counselling` | `FacultyCounsellingPage` | Protected faculty | |
| `/faculty/cr-reports` | `FacultyCrReportsPage` | Protected faculty | |
| `/faculty/report` | `FacultyActivityReportPage` | Protected faculty | |
| `/faculty/profile` | `FacultyProfilePage` | Protected faculty | |
| `/hod` | `HodDashboardPage` | Protected hod | |
| `/hod/queries` | `FacultyQueryQueuePage isHodView` | Protected hod | All queries, Mentor column, no Raise |
| `/hod/queries/:queryId` | `FacultyQueryDetailPage isHodView` | Protected hod | No Raise, no mentee link |
| `/hod/performance` | `HodFacultyPerformancePage` | Protected hod | |
| `/hod/reports` | `FacultyActivityReportPage isHodView` | Protected hod | Faculty picker including "all" |
| `/hod/roster` | `HodFacultyRosterPage` | Protected hod | |
| `/hod/students` | `HodStudentsPage` | Protected hod | |
| `/hod/students/:studentId` | `FacultyMenteeDetailPage isHodView` | Protected hod | No star toggle |
| `/hod/at-risk` | `FacultyAtRiskPage isHodView` | Protected hod | Everyone, with a Mentor column |
| `/hod/cr-reports` | `FacultyCrReportsPage isHodView` | Protected hod | All reports |
| `/hod/operations` | `HodOperationsPage` | Protected hod | "Scheduled Jobs" |
| `/hod/profile` | `HodProfilePage` (re-exports `FacultyProfilePage`) | Protected hod | |
| `/cluster-head/setup` | `ClusterHeadSetupPage` | Protected cluster_head | No shell |
| `/cluster-head` | `ClusterHeadDashboardPage` | Protected cluster_head + `RequireClusterHeadSetup` | |
| `/cluster-head/attendance` | `ClusterHeadAttendancePage` | same | |
| `/cluster-head/gpa` | `ClusterHeadGpaPage` | same | |
| `/cluster-head/backlogs` | `ClusterHeadBacklogPage` | same | |
| `/cluster-head/black-dots` | `ClusterHeadBlackDotPage` | same | "Upload Black dot" (0035) |
| `/cluster-head/rosters` | `ClusterHeadRosterPage` | same | |
| `/cluster-head/courses` | `ClusterHeadCoursesPage` | same | "My Subjects" |
| `/cluster-head/profile` | `ClusterHeadProfilePage` (re-exports `FacultyProfilePage`) | same | |
| `*` | `NotFoundPage` | none | |

That is 49 routes. **Removed** since the old document: `/hod/semester` and every `/…/tickets…` path. There is no HOD counselling route.

### 9.4 Guards (`routes/RouteGuards.jsx`)

- **`RequireAuth`.** Shows `PageLoader` ("Restoring your session...") while auth loads. Without both a session and a profile (`isAuthenticated`) it redirects to `/login` with `state.from`.
- **`RequirePasswordChange`.** While `profile.must_change_password` is true it redirects to `/change-password`.
- **`RequireRole({role})`.** On a mismatch it redirects to `HOME_PATH[profile.role]`.
- **`RequireOnboarding`** (students). It checks `form_a_completed`, then `avatar_url` (§4.3).
- **`RequireClusterHeadSetup`.** It redirects to `/cluster-head/setup` until `cluster_head_setup_completed`. Its comment about "the Course and Section dropdowns on every upload screen" is stale; the uploads have no such dropdowns.

All guards are UX only. The database enforces access.

### 9.5 Navigation (`NAVIGATION` in `lib/constants.js`)

The sidebar renders the list for `profile.role`. An item with a `when` predicate renders only if it returns true for the profile.

| Role | Items (label → path) |
|---|---|
| student | Home `/student`; My Queries `/student/queries`; **Group Queries** `/student/group-queries`\*; Academics `/student/academics`; Feedback Survey `/student/survey`; **Survey Tracking** `/student/survey-tracking`\*; **CR Report** `/student/cr-report`\*; Counselling `/student/counselling`; Achievements `/student/achievements`; My Profile `/student/profile` |
| faculty | Home; Query Queue; My Mentees; At-Risk Students; Counselling; CR Reports; My Report; My Profile |
| hod | Home; All Queries; Faculty Performance; Faculty Reports; Faculty Roster; Students; At-Risk Students; CR Reports; Scheduled Jobs (`/hod/operations`); My Profile |
| cluster_head | Home; Upload Attendance; Upload GPA; Upload Backlogs; Upload Black dot (`/cluster-head/black-dots`); My Subjects (`/cluster-head/courses`); Rosters & Mentors (`/cluster-head/rosters`); My Profile |

\* only when `profile.is_star_mentee`. Form A is deliberately not a menu item; after onboarding it lives inside My Profile.

### 9.6 Page index

Each page's behaviour is described in the feature section named in the last column.

| Page | Main data | Main actions | § |
|---|---|---|---|
| `LoginPage` | — | sign in, forgot password | 4.2 |
| `ChangePasswordPage` | — | `auth.updateUser`, clear `must_change_password` | 4.2 |
| `StudentOnboardingFormPage` / `StudentProfilePhotoPage` | `student_form_a_profiles` | `submit_student_form_a`, photo upload | 4.3 |
| `StudentDashboardPage` | `get_dashboard_metrics`, `useRealtimeQueries(5)`, `profile.mentor` | raise query | 4.17, 4.4 |
| `StudentQueriesPage` / `StudentQueryDetailPage` | `useRealtimeQueries`, `useQueryThread` | create, post, confirm, rate | 4.4 |
| `StudentGroupQueriesPage` | `get_mentor_group_queries` | — (read-only) | 4.6 |
| `StudentAcademicsPage` | `student_semester_gpas`, `student_cgpas`, `student_attendance_overview` | `upsert_semester_gpa` | 4.9 |
| `StudentSurveyPage` / `StudentSurveyTrackingPage` | `get_active_survey_for_student` / `get_mentor_group_survey_status` | `submit_survey_response` | 4.15 |
| `StudentCrReportPage` | `mom_records`, `support_queries` (with `mom_id`) | `submit_mom_report` | 4.7 |
| `StudentCounsellingPage` | `counselling_requests` | `request_counselling` | 4.8 |
| `StudentAchievementsPage` | `student_achievements` | direct CRUD, proof upload | 4.10 |
| `StudentProfilePage` | profile, Form A | phone update, Form A edit | 4.22, 4.3 |
| `FacultyDashboardPage` | `get_dashboard_metrics`, `useRealtimeQueries(8)` | — | 4.17 |
| `FacultyQueryQueuePage` | `useRealtimeQueries` | raise to HOD | 4.4, 4.5 |
| `FacultyQueryDetailPage` | `useQueryThread`, `canned_replies` | post, priority, resolve, raise to HOD | 4.4, 4.5 |
| `FacultyMenteesPage` | `student_query_summary`, `survey_mentee_status` | star, department and HOD, dossier PDF | 4.6, 4.5, 4.15 |
| `FacultyMenteeDetailPage` | `get_student_dossier` (incl. official CGPA, backlogs, black dots) | verify achievement, star, PDF | 4.18, 4.10, 4.12 |
| `FacultyAtRiskPage` | `at_risk_student_overview`, `student_attendance_overview`, `student_semester_gpas` | mark meeting done | 4.14 |
| `FacultyCounsellingPage` | `counselling_requests` | `respond_to_counselling` | 4.8 |
| `FacultyCrReportsPage` | `mom_records`, `support_queries` | `set_query_in_progress`, `resolve_support_query` | 4.7 |
| `FacultyActivityReportPage` | `get_faculty_activity_report` / `get_department_faculty_report` | PDF | 4.18 |
| `FacultyProfilePage` (also HOD, cluster head) | profile | phone update | 4.22 |
| `HodDashboardPage` | `get_dashboard_metrics`, `faculty_performance_summary`, `query_daily_trend` | — | 4.17 |
| `HodFacultyPerformancePage` | `faculty_performance_summary` | report links, PDF | 4.17 |
| `HodFacultyRosterPage` | `/api/admin/manage-faculty-roster` | set status, reassign | 4.19 |
| `HodStudentsPage` | `student_query_summary`, faculty names | Add account | 4.20 |
| `HodOperationsPage` | `/api/admin/run-cycle-job` (GET) | run a job, run all | 4.16 |
| `ClusterHeadSetupPage` / `ClusterHeadCoursesPage` | `cluster_head_courses` | `submit_cluster_head_setup` | 4.11 |
| `ClusterHeadDashboardPage` | `cluster_head_courses`, `academic_upload_batches` (10) | — | 4.17 |
| `ClusterHeadAttendancePage` | `cluster_head_courses` | attendance upload | 4.12 |
| `ClusterHeadGpaPage` / `BacklogPage` / `BlackDotPage` | — | GPA, backlog and black dot uploads; each shows what it read from the file | 4.12 |
| `ClusterHeadRosterPage` | `roster_import_batches` (15) | roster uploads, mentor map | 4.13 |

### 9.7 Shared components

**Layout (`components/layout/`)**

- **`PortalShell({searchPlaceholder, onSearch, children})`.** The sidebar plus the top bar plus the page body. The frame is identical for every role.
- **`SidebarNavigation`.**
  - The MUJ logo, "SMP Portal", and a role subtitle: Student Portal, Faculty Mentor, Department Admin or Cluster Head.
  - The role's menu, with an orange pill marking the active item.
  - A user card with Sign Out.
  - Off-canvas below the `lg` breakpoint, with an overlay.
- **`TopBar`.**
  - The menu toggle and the global search box. It is debounced 320 ms, and shown only on pages that pass `onSearch`: StudentQueries, FacultyQueryQueue, FacultyMentees, FacultyAtRisk, HodStudents, HodFacultyRoster and HodFacultyPerformance.
  - The notification bell.
  - The identity block "`<login_id>` :: `<name>`".
- **`NotificationBell`.** The dropdown list with type icons, "Mark all read", and click-to-navigate (§4.21).

**UI primitives (`components/ui/`)**

| Component | Notes |
|---|---|
| `Panel` | White card with a peach header strip (`title`, `tab`, `tabIcon`, `actions`). The body has padding and no default variant; this was a regression fixed earlier and is covered by the UI test. |
| `Modal`, `ConfirmDialog` | Focus goes to the first field on open. The focus effect depends only on `[open]`, so typing never jumps to ✕ (also covered by the UI test). |
| `FormControls` | `TextField`, `PasswordField`, `TextAreaField`, `SelectField`, `RadioGroupField`, `CheckboxField`, `ToggleSwitch`, `FilterPills`, `Pagination`, and a file picker |
| `DataTable` | Column definitions plus rows, empty state |
| `StatCard` | KPI card with an optional caption and trend |
| `StatusBadge` | `QueryStatusBadge`, `ResolutionBadge` (nothing for `none`), `PriorityBadge`, `CategoryBadge` (current and legacy categories; unknown values fall back to the Others style), `EmploymentBadge` |
| `Avatar` | Signed-URL cache (1 h, re-signed 60 s early); silhouette fallback. Also exports `resolveAvatarUrl` and `forgetAvatar`. |
| `ProfilePhotoUploader` | Upload and replace a photo (3 MB, images). Used **only** by the onboarding photo step, although its comment says it serves all profile pages. |
| `Skeleton` | `SkeletonLine`, `SkeletonCards`, `SkeletonTable`, `PageLoader` |
| `EmptyState`, `PageHeader`, `ErrorBoundary` | Simple building blocks; `ErrorBoundary` wraps the whole app |

**Feature components**

- `charts/Charts.jsx` — themed Recharts wrappers with a shared palette, tooltip and empty state ("No data to display yet").
- `queries/*` — §4.4.
- `student/FormAFields.jsx` — §4.3.
- `hod/AddAccountModal.jsx` — §4.20.
- `clusterHead/AcademicUploadPanel.jsx` — §4.12 and §4.13.

### 9.8 Data-access conventions

1. **RLS decides the scope; the page never filters for security.** Explicit `.eq(...)` filters exist only to narrow queries (for example `mentor_id = me` on the counselling page).
2. **State transitions use `supabase.rpc()`.** Direct writes are limited to the self-edits in §2.3.
3. **Privileged or heavy work goes through `apiClient`** (`/api/*`).
4. **Actions use `useAsyncAction().run(fn, {successMessage, onSuccess})`.** It shows the success toast, or `toast.error(describeError(err))` on failure.
5. **Realtime is used for queries, messages, notifications and the own profile.** Everything else reloads after the user's own action. Pages do not live-refresh other users' changes.
6. **Files are uploaded before the form is saved.** Only the object path is stored; files are viewed through signed URLs.
7. **Row limits.** Lists that are not paginated are subject to PostgREST's `max_rows` of 1,000 (§4.20).

### 9.9 Design system

- **Fonts:** Manrope (`font-headline`: 400–800) and Hanken Grotesk (`font-body`: 400–700), loaded from Google Fonts. Icons are Material Symbols Outlined (Google Fonts, variable axes).
- **Tailwind tokens** (`tailwind.config.cjs`; the names are unchanged from the earlier theme, only the values moved):

  | Group | Values |
  |---|---|
  | Brand | `primary` #c2410c, `primary-container` #ea580c, `primary-fixed` #fdece3 (peach headers and chips), `primary-fixed-dim` #fbd9c8, `on-primary-fixed` #9a3412, `secondary` #ea580c, `secondary-container` #fb923c, `tertiary` #a8a29e |
  | Status | `error` #dc2626 / `error-container` #fee2e2; `success` #16a34a / #dcfce7; `warning` #d97706 / #fef3c7; `info` #2563eb / #dbeafe |
  | Surfaces | `background` #fdfaf8, `surface` #ffffff, `surface-container-*` (lowest #fff … highest #efdfd6), `on-surface` #1c1917, `on-surface-variant` #57534e, `outline` #a8a29e, `outline-variant` #e7ddd6 |
  | Shell | `sidebar` (#fff; hover #fdf1ea; active pill #c2410c; border #f2e4dc; text #57534e; muted #a8a29e); `topbar` (#fff; border #f2e4dc) |
  | Radius | DEFAULT 0.5rem, md 0.625rem, lg 0.75rem, xl 1rem, 2xl 1.25rem |
  | Spacing extras | `base` 4px, `xs` 8px, `sm` 16px, `md` 24px, `lg` 32px, `xl` 48px, `gutter` 20px, `sidebar` 264px |
  | Font sizes | `display-lg` 44/52, `headline-lg` 32/40, `headline-md` 26/34, `headline-sm` 19/27, `body-lg` 18/28, `body-md` 16/24, `body-sm` 14/21, `label-md` 14/20, `label-sm` 12/16 |
  | Shadows | `card`, `raised`, `dropdown` |
  | Animations | `fade-in`, `scale-in`, `slide-in-right`, `shimmer` |

- **Component classes** (`index.css`, `@layer components`): `.panel`, `.panel-header`, `.panel-header-title`, `.field-label`, `.field-input`, `.field-error`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.sidebar-link`, `.sidebar-link-active`, `.data-table` (with its thead, tbody and hover rules), `.chip`, `.break-anywhere`, `.skeleton`.
- **Other styles:** `.material-symbols-outlined` settings, `.custom-scrollbar`, and a print rule (`.no-print`).
- **Theme:** there is no dark mode. `theme-color` is #a43700.
- **`CHART_COLORS`** (JS): `academic` #c2410c, `erpTech` #f97316 and `infrastructure` #a8a29e (legacy category keys); `open`, `inProgress`, `resolved`; and `series` [#c2410c, #f97316, #a8a29e, #ea580c, #d97706, #16a34a]. The PDF palette is `PALETTE` in `pdf-chart-primitives.js`.

### 9.10 Constants (`lib/constants.js`)

These must be kept in sync with the Postgres enums wherever the UI offers a value.

| Export | Value |
|---|---|
| `ROLES` / `ROLE_LABELS` | student "Student", faculty "Faculty Mentor", hod "Head of Department", cluster_head "Cluster Head" |
| `QUERY_CATEGORIES` | Academics, Examination, Behavioural, Administrative, Others. Legacy values are deliberately not offered. |
| `QUERY_STATUSES` / `QUERY_PRIORITIES` | Open, In Progress, Resolved / Low, Medium, High, Urgent |
| `RESOLUTION_STATUS_LABELS` | Defined but **unused**; the badges carry their own labels |
| `ACHIEVEMENT_CATEGORIES`, `PARENT_OCCUPATIONS`, `BLOOD_GROUPS` | Mirror the enums and the Form A options |
| `COURSE_CATALOGUE`, `OTHER_COURSE_OPTION`, `CLUSTER_HEAD_DEFAULT_SUBJECT_ROWS` | 27 course names including "Other"; "Other"; 5 |
| `SEMESTER_OPTIONS` | 1–8 |
| `ACADEMIC_UPLOAD_LABELS` | attendance "Attendance", gpa "GPA", backlog "Backlogs", black_dot "Black dots" |
| `SURVEY_SCALE` | 1 Poor … 5 Excellent |
| `CYCLE_JOBS` | The four jobs, with labels and descriptions for the Operations page |
| `AT_RISK_MEETING_STATUS_LABELS` | awaiting_link "Awaiting meeting link", scheduled, completed, cancelled |
| `COUNSELLING_STATUS` | open, acknowledged and closed, each with `studentLabel`, `mentorLabel` and `className` (§4.8) |
| `EMPLOYMENT_STATUS_LABELS` | Active, On leave, Departed |
| `CHART_COLORS` | §9.9 |
| `NAVIGATION` | §9.5 |
| `HOME_PATH` | student `/student`, faculty `/faculty`, hod `/hod`, cluster_head `/cluster-head` |

### 9.11 Dead or unused frontend code

- **`components/tickets/`** (`CreateTicketModal`, `TicketConversation`, `ResolutionConfirmation`, `SatisfactionRating`):
  - Nothing imports these files.
  - They call RPCs removed in 0031: `create_support_ticket`, `post_ticket_message`, `confirm_ticket_resolution`, `rate_support_ticket`.
  - `CreateTicketModal` imports `TICKET_CATEGORIES`, which no longer exists.

  The files are safe to delete.
- **Unused exports:** `RESOLUTION_STATUS_LABELS`, `BUCKETS.ROSTERS`.
- **Stale comments:**
  - `AuthProvider` mentions the HOD unlocking Form A.
  - `supabaseClient.js` claims a CSP.
  - `ProfilePhotoUploader` claims it is used on every profile page.
  - `StudentAchievementsPage` claims verification never blocks.
  - `FacultyAtRiskPage` promises columns it does not render.

---

## 10. Backend

The backend has two halves:

- **The database.** Most business rules live here, in SQL (§7 and §5.3).
- **Eight Vercel serverless functions.** These do the work that needs the service role, files or PDFs (§6).

There is no long-running server.

### 10.1 Serverless runtime and layout

- **Runtime.**
  - Node ≥ 20, ES modules (`"type": "module"` in both `package.json` files).
  - Deployed from `api/**/*.js` with 1,024 MB of memory and a **30-second maximum duration** (`vercel.json`).
  - Files under `api/_lib/` are shared modules, not endpoints.
- **Dependencies** (root `package.json`): `@supabase/supabase-js`, `exceljs`, `pdf-lib`, `zod`.
- **Statelessness.** Instances are stateless. Anything that must be shared across invocations (rate-limit counters, upload history, import progress) lives in Postgres. Import progress also lives in the browser's chunk loop.
- **Request lifecycle.** See §6.1. Every endpoint is `withApiDefaults([...methods], async (req, res) => {...})`. Errors are thrown as `ApiError(message, status)` and serialised by the wrapper.

### 10.2 Two Supabase clients, two trust levels

| Client | Created by | Key | RLS | Used for |
|---|---|---|---|---|
| `context.admin` | `createAdminClient()` | service role | bypassed | `auth.getUser` / `auth.admin.createUser`; loading the caller's profile; rate limit and audit RPCs; reading all e-mails and faculty for imports; post-creation profile updates; the query handover on reassignment; creating missing mentors |
| `context.asUser` | `createUserClient(jwt)` | anon plus the caller's JWT | applied | every business RPC (`record_*_batch`, `map_students_to_mentors`, `reassign_mentees`, `set_faculty_employment_status`, `run_cycle_job`, the report RPCs), and roster reads in manage-faculty-roster |

Because the business RPCs run as the user, the API's role check and the database's own check must both pass.

### 10.3 Database-side conventions

- **RPC shape.**
  - `create or replace function public.x(...) returns ... language plpgsql security definer set search_path = public, pg_temp`.
  - The body first checks the caller (`is_hod()`, `is_mentor_of()` and so on), raising `42501`, then validates input with readable messages.
  - Execute is revoked from `public` and `anon` and granted to `authenticated` (and/or `service_role`).
- **Allowed without a JWT.** Batch and job functions also allow `auth.uid() is null`. That covers the service role and SQL scripts, which is how the seed script runs them.
- **Protected columns** are changed only inside definer functions that set `ssmp.trusted_operation` (§7.1).
- **Side effects** — system messages, notifications, risk re-evaluation, logs — happen inside the same transaction as the change. Either everything commits or nothing does.
- **Batch uploads** (0033):
  1. Resolve every identifier in the file once, with `resolve_student_ids`. It uses the unique index on `lower(login_id)` and, since 0035, matches the registration number only.
  2. Loop over the rows, reading the map.
  3. Collect per-row errors into `row_errors` JSON: `[{row, identifier, reason}]`.

  This replaced a per-row sequential scan that made about 2,300-row files exceed Supabase's statement timeout.

### 10.4 Spreadsheet formats and header aliases (`api/_lib/spreadsheet-parser.js`)

**Reading a file** (`readSheetRows`), in this order:

1. If the first 2 KB contain `<table`, `<html`, `<!doctype html` or `<tr`, the file is parsed as an **HTML table**, whatever its extension. This is how the ERP's `.xls` export is read.
2. `.csv` is read with a quoted-field reader, comma delimiter only.
3. A `.xls` that is not HTML is rejected: "This is a legacy binary .xls file. Open it in Excel and save as .xlsx, then upload again."
4. `.xlsx` is read with ExcelJS, **first worksheet only**.
   - Hyperlinks → text; formulas → result; dates → `YYYY-MM-DD` (UTC); rich text → its plain text.
   - A merged range reports its text in every cell it covers.
5. Anything else: "Only .csv, .xlsx and the ERP .xls export are supported."

Fully empty rows are dropped.

**Reading a file for the GPA, backlog and black dot parsers** (`readSheetGrid`, 0035) adds two things:

- HTML goes through `readHtmlGrid` (`api/_lib/table-readers.js`) instead of the flat tag-splitter: rowspan and colspan are honoured by repeating a merged cell's text into every position it covers, the same thing ExcelJS does for `.xlsx`. Every table in the file is flattened, in order, into one list of rows; `<br>` and block ends become line breaks inside a cell.
- `.docx` (black dots only) goes through `readDocxGrid`: `word/document.xml` is unzipped with `node:zlib` (no dependency), each `w:tbl` becomes rows, `w:gridSpan` repeats across and `w:vMerge` continuations take the text of the cell above. Paragraphs in a cell become lines. Text outside tables is ignored. An old binary `.doc` → "This is an old-style .doc file. Open it in Word, save it as .docx, then upload again."

**Registration number headings** (`REGISTRATION_ALIASES`, the only student identifier any Cluster Head upload accepts): registration no, registration number, registration, reg no, reg number, regn no, regn number, regd no, enrolment no, enrollment no, enrolment number, enrollment number. E-mail, roll number and "id" are **not** accepted (Form A keeps roll number as a separate field, so it is a different number).

**Header normalisation** (`cleanHeader`): lower-case; `.` and `_` become spaces; whitespace collapses; trim. So "Reg. No." becomes `reg no`.

- Aliases written with a dot ("reg. no", "registration no.") **can never match** and are dead entries. The dot-free alias catches those headers.
- When two columns map to the same field, the **last non-empty** one wins (roster, attendance). The **first** wins in the mentor map and in the GPA, backlog and black dot parsers.

**Row limits.**

- Roster, GPA, backlog, black dot and mentor map: at most **5,000** data rows ("Too many rows (N). Split the file into batches of 5000.").
- Attendance: no cap.
- A header row and at least one data row are required.

**Roster** (`parseRosterFile`). Missing Email → 'No "Email" column found. Required columns: Email, Name. Optional: …'.

| Field | Accepted headers (after normalisation) |
|---|---|
| `email` (required) | email, e-mail, email id, e-mail id, mail, email address |
| `full_name` (required per row) | name, full name, student name, faculty name, staff name |
| `login_id` | reg no, registration no, registration number, roll no, roll number, faculty id, employee id, staff id, id |
| `branch` | branch, dept, department, discipline, program, program name, programme, programme name |
| `section` | section, sec |
| `semester_label` | semester, sem, semester label |
| `phone` | phone, mobile, mobile no, mobile number, contact, contact no |
| `mentor_email` | mentor email, faculty email, assigned mentor, mentor |
| `parent_name` | father's name, father name, parent name, guardian name |
| `parent_mobile` | father's number, father number, father's mobile, father's contact, parent number, parent mobile, guardian number, guardian mobile |
| `parent_email` | father's email, father email, parent email, guardian email |
| `password` | password, initial password, temporary password, temp password, default password |
| `role` (needed for `combined`) | role, type, user type, category, designation type |

- `classifyRole(value)` does a lower-cased **substring** match.
  - It checks faculty words first: faculty, mentor, staff, teacher, professor, prof, teaching.
  - Then student words: student, mentee, learner.
  - Anything else → `null`.
- A "Department" column maps to `branch`. Every imported account's `department` is `'IoT & IS'`.

**CGPA / GPA & Credits export** (`parseGpaExport`).

- **Header row:** the first of the first 30 rows with a registration column and either a semester group heading or a GPA/CGPA column. Otherwise: 'Could not find the GPA table. The file needs a "Registration No." column and either the ERP's Semester I, Semester II ... columns or a GPA column.'
- **Two-level header (the ERP layout):** a heading that names one semester ("Semester I", "Sem 3", "3rd Semester"; Roman or Arabic, via `semesterGroup`) starts a group, and the group runs across the following blank cells until the next heading, so a CSV (blanks under a merged cell), an `.xlsx` (repeated text) and the HTML export all read the same. The row below gives each group's columns. Semester groups without a GPA column → 'Found the Semester columns but no GPA under them...'.

  | Field | Accepted headers |
  |---|---|
  | `identifier` | `REGISTRATION_ALIASES` |
  | `name` | student name, name, name of student, name of the student (sent, unused) |
  | `cgpa` | cgpa, c gpa, cumulative gpa, cumulative grade point average |
  | `total_earned_credits` | total earned credits, total credits earned, earned credits total |
  | `total_required_credits` | total required credits, total credits required, total req credits, required credits total |
  | under each semester: `gpa` | gpa, sgpa, semester gpa |
  | under each semester: `earned_credits` | earned credits, credits earned, earned credit, earned |
  | under each semester: `required_credits` | req credits, required credits, credits required, req credit, required |
  | flat layout only: `gpa`, `semester` | gpa, sgpa, semester gpa, grade point average; semester, sem, semester number, semester no |

- **Rows:** a semester whose GPA is blank or a placeholder (`-`, `--`, NA, N/A) is left out. A repeated header row is skipped. `meta`: `layout` (erp/flat), `semesters_in_file`, `graded_semesters`, `ignored_semesters` (outside 1–8), `has_cgpa`.

**Defaulter Grade result export** (`parseBacklogExport`).

- **Header row:** the first of the first 40 rows with a registration column. Otherwise: 'Could not find the student table. The file needs a "Registration No" column.'
- **Title lines** (everything above it, each distinct line once): the semester from "III SEMESTER" / "Semester 3" / "3rd Sem" (`semesterFromTitle`), the exam from "RESULT OF … (" with a " -24-25" tail tidied to " 24-25" (`examFromTitle`, capped at 60 characters), the programme from the text before the semester (display only).
- **Hand-made list** when the header has a subject-code column (subject code, course code, paper code, backlog code, code): one record per row with `subject_name` (subject, subject name, course name, paper name, subject description), `grade` (grade, grade obtained), `credits` (credit, credits) and `is_cleared` (cleared, is cleared, status, result; blank when there is no such column).
- **ERP layout** otherwise: every heading that is not the registration number, the name or a known non-subject column (S.No., section, branch, programme, semester, remarks, result, total, SGPA, CGPA, e-mail, mobile, father's name, roll no) is a **subject code**. No subject columns → 'No subject columns found...'. The subject table below the students (a row with "Subject Code" and a description or credit heading) gives names and credits; a column with no exact code match takes the entry whose code or description has matching initials ("OE" → "OPEN ELECTIVE"). A non-blank, non-placeholder cell is a grade. `meta`: `semester`, `exam_session`, `programme`, `layout`, `subject_codes` (every subject column; `null` for a hand-made list), `subjects`.

**Proctorial Board notice** (`parseBlackDotNotice`; `.docx`, `.xlsx`, `.csv` or HTML).

- **Header row:** any row with a registration column and at least one other notice column (it repeats in every case's table). Otherwise: 'Could not find the student table in the notice...'.

  | Field | Accepted headers |
  |---|---|
  | `identifier` | `REGISTRATION_ALIASES` ("Regn No") |
  | `serial` | s/no, s no, sno, sr no, sl no, serial no |
  | `name` | name, student name, name of student, name of the student |
  | `incident` | date of incidence, date of incident, incident date, date of the incident, date |
  | `hostel_block` | block, hostel block, hostel, block no, hostel/block |
  | `room_no` | room no, room, room number |
  | `course_branch` | course/branch, course / branch, course branch, course & branch, course, branch, program, programme |
  | `mobile_no` | mob no, mobile no, mobile, mobile number, contact no, contact number, phone, phone no |
  | `previous_record` | previous record, previous records, prev record, past record, previous black dots |
  | `case_number` | case no, case number, case |
  | `case_details` | case details, details, offence, offense, nature of offence, nature of offense, description, charge |

- **Case lines:** a row whose cells all carry one text that reads "Case No: …" / "Case No …" / "Case: …" (`parseCaseLine`). The case number ends at the first ", ", ". " before a letter, " - ", or " the"; slashes lose their surrounding spaces and trailing punctuation goes. A single-text row that is not a case line (a note spanning the table) is skipped. A Case No **column** wins over the case line above.
- **Dates** (`parseNoticeDate`): `dd/mm/yy`, `dd.mm.yyyy`, `dd-mm-yyyy` (day first), `YYYY-MM-DD`, "5 Sept 2026", "September 5, 2026"; impossible dates and dates without a year give no date. A blank date takes the last date seen in the same case.
- **Rows:** Course/Branch lines join with ", "; other fields' lines with spaces; whitespace inside the registration number is removed. `where` is "Case … · S/No …". `meta.cases`: `[{case_number, case_details, students}]`.

- **`parseSemesterLabel`** takes the **first run of digits**, or failing that a standalone Roman numeral, and accepts 1–8; anything else is `null`. "Semester 4", "4th" and "Semester IV" give 4. "2025-26 Sem 4" gives nothing (the first number, 2025, is out of range).

**ERP attendance export** (`parseAttendanceExport`).

- **Header row.** The first of the first 25 non-empty rows that has both an identifier column and a % column. Otherwise: 'Could not find the attendance table. The file needs a header row with "Registration No." and a "%" column.'

  | Field | Accepted headers |
  |---|---|
  | `identifier` | `REGISTRATION_ALIASES` (e-mail, roll number and student id are **not** accepted) |
  | `section` | section, sec |
  | `classes_held` | total class, total classes, classes held, total |
  | `classes_attended` | present, classes attended, attended |
  | `attendance_percent` | %, percentage, attendance %, % attendance, percent |
  | (ignored) | absent; name, student name |

- **Header block.** Cells above the table are read with `<label>\s*:?\s*-?\s*(value)` (case-insensitive) for *Course Code*, *Course Name*, *Section*, *From Date* and *To Date*. *Faculty Name*, *Academic Year* and *Academic Session* are parsed but unused.
- **Dates** are `d/m/yyyy` or `d-m-yyyy`, day first. If missing or unparseable, `period_start` defaults to **today** (UTC), and `period_end` defaults to `period_start`.
- **Errors:**
  - "That attendance file appears to be empty."
  - 'No "Course Code:" line found in the file header.'
  - "The attendance table has a header but no student rows."
  - 'No section found — the file header has no "Section:" line and the table has no Section column.'
- **Rows.** A row without an identifier is skipped silently. The section is the row's Section, else the header's.
- **Duplicates** (the same registration number, even across sections) merge into one row:
  - If both rows have counts, the counts are summed and % is recomputed as `round(attended × 100 / held, 2)`.
  - Otherwise the two percentages are averaged.

**Mentor–mentee mapping** (`parseMentorMappingFile`). Missing columns → 'The file needs a "Registration No." column and a "Mentor Email" column.'

| Field | Accepted headers |
|---|---|
| `identifier` | `REGISTRATION_ALIASES` only (no e-mail, since 0035) |
| `mentor_email` | mentor email, faculty email, mentor email id, mentor mail |
| `mentor_name` | mentor name, faculty name, mentor |

Other columns, such as the mentor's phone, are ignored.

**Self-check.** `node api/_lib/spreadsheet-parser.check.mjs` (`npm run test:parser`, also part of `npm test`) runs 17 checks:

1. Attendance: the section comes from the row, not a blank header; a repeated registration number is summed; a single row keeps the ERP percentage; the header section still works as a fallback.
2. Mentor map: registration number, mentor e-mail and name, phone ignored; an e-mail column no longer stands in for the registration number.
3. GPA: each GPA lands under the semester written above it and "-" is left out (the ERP layout, from the sample generator); the same export as CSV and as `.xlsx` with merged headers; a flat sheet; an e-mail column is rejected.
4. Backlogs: semester and exam from the title, names and credits (and "OE") from the subject table; the real title wording ("-24-25 ()", "III SEMESTER"); a hand-made list with no Cleared column.
5. Black dots: the `.docx` notice (case lines, merged dates, two-line Course/Branch, `where`); a CSV with a Case No column; day-first dates that are never guessed.

It is **not** run in CI.

### 10.5 PDF generation

- **Library and fonts.** pdf-lib with the standard fonts (Helvetica, Helvetica-Bold, Helvetica-Oblique), on A4 (595.28 × 841.89 pt).
- **`ReportDocument`** (`report-document-builder.js`) handles:
  - page breaks (`reserve`);
  - the header band;
  - title blocks;
  - section headings;
  - footers with "Page n of N" and "Confidential — for internal academic use only".
- **Charts and tables** are drawn with the vector primitives in `pdf-chart-primitives.js`. The MUJ logo is embedded from base64.
- **Metadata.** Title, subject, and author "SSMP — Manipal University Jaipur" (old name).
- **Data** comes only from the report RPC's JSON, which is the same JSON the page renders.
- **Edge case (pdf-lib behaviour, not exercised here).** The standard fonts can only encode WinAnsi characters. Text outside that set in a name, subject or achievement makes the PDF build throw, which the client sees as the generic 500 message.

### 10.6 Performance characteristics

| Concern | Mechanism |
|---|---|
| Account creation for about 2,700-row rosters within 30 s functions | Chunked requests (20 s budget per request), waves of 25, 5 concurrent `createUser` calls, one retry on an Auth rate limit (§4.13) |
| About 2,300-row uploads within Postgres's statement timeout | One indexed identifier resolution per file (0033) |
| Risk re-evaluation per upload | One `evaluate_student_risk` per distinct matched student, inside the upload transaction |
| List pages | 25 rows per page, with an exact count; a realtime change re-runs the page query |
| Large unpaged reads | Capped by PostgREST `max_rows` = 1,000 (§4.20) |
| Rate-limit table growth | A 1% chance per call to purge rows older than a day |

---

## 11. Integrations

| System | How SMP uses it | Where |
|---|---|---|
| **Supabase Auth** | E-mail and password sign-in (PKCE), session refresh, password reset e-mails, `updateUser` for password changes. The Admin API (`auth.admin.createUser`, `auth.getUser`) is used from serverless functions with the service role. | `lib/supabaseClient.js`, `context/AuthProvider.jsx`, `api/_lib/request-guards.js`, import and provisioning endpoints |
| **Supabase Postgres / PostgREST** | All data: tables, views, RPCs. RLS enforces access. | everywhere |
| **Supabase Realtime** | Live query lists and threads, notifications, own-profile updates (§2.4) | `useRealtimeQueries.js`, `NotificationProvider.jsx`, `AuthProvider.jsx`, `StudentGroupQueriesPage.jsx` |
| **Supabase Storage** | 4 private buckets; signed URLs (§2.5) | `lib/fileUpload.js`, `Avatar.jsx`, `ProfilePhotoUploader.jsx` |
| **Vercel** | Static hosting of the SPA (with an SPA rewrite), serverless functions for `/api`, environment variables, response headers | `vercel.json` |
| **Google Fonts** | Manrope, Hanken Grotesk and Material Symbols Outlined, loaded at runtime from `fonts.googleapis.com` / `fonts.gstatic.com` | `frontend/index.html` |
| **GitHub Actions** | CI on pushes to `main`/`master` and on pull requests (§13.4) | `.github/workflows/ci.yml` |
| **University ERP** | **File exports only.** The Class Attendance export (an HTML table saved as `.xls`), plus GPA, backlog and mentor-mapping sheets, are uploaded by a cluster head. There is no API connection. | `spreadsheet-parser.js` |

**Not integrated.** None of these have any code:

- e-mail or SMS delivery (apart from Supabase Auth's reset mail);
- Microsoft Teams or Google Meet (meeting links are a placeholder, §4.14);
- single sign-on;
- error tracking or analytics. Server logs are Vercel's function logs, written with `console.error` tags such as `[api-error]`, `[audit]`, `[rate-limit]`, `[cluster-head-upload]` and `[run-cycle-job]`.

---

## 12. Configuration and environment

### 12.1 Environment variables

No values are given here. The templates are `.env.example` (server) and `frontend/.env.example` (browser). Real `.env` files are git-ignored.

**Server:** Vercel project environment, or the root `.env` for local tools.

| Name | Required | Read by | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | yes | `api/_lib/environment.js`; `supabase/scripts/seed-demo-accounts.mjs` | Project URL. Validated as `http(s)://host`; whitespace is stripped. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | `environment.js`; the seed script | Service-role key for Auth admin and privileged writes. It must match the three-part key shape. **Never expose it to the browser.** |
| `SUPABASE_ANON_KEY` | yes | `environment.js` | Anon key, used to build the "as user" client |
| `ALLOWED_ORIGINS` | no | `environment.js` | Comma-separated CORS allow-list, for example the production domain. One `*.vercel.app` entry enables all `*.vercel.app` preview origins. |
| `ALLOWED_EMAIL_DOMAINS` | no | `input-validation.js` (`process.env`, read at module load) | Comma-separated domains that account e-mails must end with. Blank means any domain. Applies to provisioning, roster rows and mentor-map mentors. |
| `SSMP_TEMPORARY_PASSWORD` | no, but **set it** | `environment.js` | Shared first-login password for every account the API creates. Falls back to a built-in value when unset. **Not listed in `.env.example`.** |
| `SEED_DEFAULT_PASSWORD` | seed only | the seed script | Password given to the demo accounts. Has a built-in fallback. |
| `VERCEL_ENV`, `NODE_ENV` | set by the platform | `environment.js`, `health.js` | `production` disables the localhost CORS rule; also reported by `/api/health` |

**Browser:** Vercel build environment, or `frontend/.env` / `frontend/.env.local`. These values are **baked into the bundle** at build time.

| Name | Required | Read by | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | yes | `lib/supabaseClient.js` | Project URL. If missing, the app shows a configuration-error page at boot. |
| `VITE_SUPABASE_ANON_KEY` | yes | `lib/supabaseClient.js` | Anon key (public by design) |
| `VITE_API_BASE_URL` | no (default `/api`) | `lib/apiClient.js` | Base for API calls. It is normalised to end in `/api`. Leave it as `/api` when the SPA and API share a Vercel project. |
| `VITE_INSTITUTION_NAME` | no | `pages/auth/LoginPage.jsx` | Login-page brand text (default "Manipal University Jaipur") |
| `VITE_DEPARTMENT_NAME` | no | `pages/auth/LoginPage.jsx` | Login-page department text (default "Department of IoT & Intelligent Systems") |

### 12.2 `supabase/config.toml` (local stack)

- **Ports:** API 54321 (schemas `public`, `storage`, `graphql_public`; **`max_rows = 1000`**), DB 54322 (Postgres 15), Studio 54323.
- **Auth:**
  - `site_url` and `additional_redirect_urls` are `http://localhost:5173`;
  - `jwt_expiry = 3600`, `enable_refresh_token_rotation = true`;
  - `enable_signup = false` (both `[auth]` and `[auth.email]`), `enable_confirmations = false`, `double_confirm_changes = true`, `secure_password_change = true`;
  - `[auth.sessions] inactivity_timeout = "720h"`, with no timebox.
- **Storage:** `file_size_limit = "10MiB"`. Per-bucket limits are set by migration 0014.
- **Realtime:** enabled.

### 12.3 Settings a hosted Supabase project must mirror

`config.toml` only configures the local stack. In the hosted dashboard:

1. **Authentication → Providers → Email:** disable sign-ups. This is required: `handle_new_auth_user` trusts the role in user metadata (§8.9 S13). Leave e-mail confirmation off.
2. **Authentication → URL configuration:** set the Site URL to the production origin, and add `https://<domain>/reset-password` (plus local and preview origins as needed) to the redirect URLs.
3. **Authentication → Sessions:** set the inactivity timeout to 30 days so users are not signed out frequently.
4. **API → Max rows:** the default is 1,000. Raise it, or add pagination, if the HOD Students page must list more than 1,000 students (§4.20).
5. Buckets, policies, the realtime publication and every function come from the migrations. No manual dashboard setup is needed for them.

### 12.4 `vercel.json`

- `installCommand: npm install`, `buildCommand: npm run build` (installs and builds `frontend/`), `outputDirectory: frontend/dist`, `framework: null`.
- `functions: { "api/**/*.js": { memory: 1024, maxDuration: 30 } }`.
- Rewrite `/((?!api/).*)` → `/index.html`, so client-side routes work and `/api/*` stays serverless.
- **Headers:**
  - on everything: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `Cross-Origin-Opener-Policy: same-origin`;
  - `/assets/*`: `Cache-Control: public, max-age=31536000, immutable`;
  - `/api/*`: `Cache-Control: no-store, max-age=0`.
- **Absent:** no `crons` and no Content-Security-Policy.

### 12.5 Tunable constants in code

These are hard-coded. Changing one means editing code or SQL; they are collected in Appendix C.

---

## 13. Running, testing and deploying

### 13.1 Prerequisites

- Node ≥ 20 and npm.
- The Supabase CLI, to link or push migrations and to run a local stack. The local stack also needs Docker.
- Optionally the Vercel CLI (`vercel dev`), to run the SPA and `/api` together locally.

### 13.2 Local development

1. Install dependencies: `npm run install:all`. That is the root (API) plus `frontend/`.
2. Create the env files from the templates, `.env` and `frontend/.env` (or `frontend/.env.local`), and fill in the variables from §12.1.
3. Set up a database. Choose one:
   - **Local:** `supabase start`, then `npm run db:reset`. This applies all migrations and `supabase/seed.sql`, which creates the local demo users.
   - **Hosted:** `supabase link --project-ref <ref>`, then `npm run db:push`. Optionally run `npm run db:seed` for demo data (Appendix D).
4. Run the app. Choose one:
   - `npm run dev`: the Vite dev server at http://localhost:5173, **frontend only**. Everything that talks to Supabase directly works, but API features (uploads, account creation, PDFs, jobs, the faculty roster) need a running API.
   - `vercel dev`: the SPA and `/api` together, on port 3000 by default.
5. Optionally, `npm run sample:files` writes demo upload files to `sample-data/generated/`.

### 13.3 npm scripts

| Script | Runs |
|---|---|
| `dev` / `preview` / `lint` | `npm --prefix frontend run dev` / `preview` / `lint` (`oxlint src`) |
| `build` | `npm --prefix frontend install && npm --prefix frontend run build` → `frontend/dist` |
| `install:all` | root and frontend `npm install` |
| `db:push` / `db:reset` | `supabase db push` / `supabase db reset` |
| `db:seed` | `node supabase/scripts/seed-demo-accounts.mjs` |
| `sample:files` | `node sample-data/cluster-head-sample-data.mjs` |
| `verify:security` | `node supabase/scripts/verify-security-policies.mjs` — **the file does not exist; this script fails** |
| `test` | `npm --prefix frontend run test:ui && node api/_lib/spreadsheet-parser.check.mjs` |
| `test:parser` | the parser self-check only |
| frontend `test:ui` | `vite-node test/ui-regression.test.jsx` |

### 13.4 Tests and CI

**Automated tests** (these are all of them):

1. `frontend/test/ui-regression.test.jsx` renders `Panel`, `Modal`, `TextField` and `TextAreaField` in jsdom. It asserts that the Panel body is padded, that the first field (not ✕) gets focus when a Modal opens, that focus stays in the input while typing, and that it stays in a textarea such as the Report-to-HOD note.
2. `api/_lib/spreadsheet-parser.check.mjs` runs the 5 parser checks (§10.4).

There are **no** tests for RLS, the RPCs or the API handlers.

**CI** (`.github/workflows/ci.yml`; on pushes to `main` or `master`, and on pull requests):

- **Job `build`:**
  1. `npm ci`, falling back to `npm install` (root and frontend).
  2. Frontend lint.
  3. The UI regression test.
  4. A frontend build with placeholder `VITE_*` values.
  5. `node --check` on every file under `api/`.

  The parser check is **not** run.
- **Job `database`:**
  1. A `postgres:15` service.
  2. Apply `supabase/scripts/ci-supabase-stubs.sql`.
  3. Apply every migration in order with `ON_ERROR_STOP`.
  4. Fail if any public table lacks RLS.

### 13.5 Deploying to production

1. **Database first.** Run `supabase link` and then `npm run db:push`, which applies pending migrations in order.
   - Deploy migrations **before or together with** the application code that needs them:
     - after 0031, the frontend calls `*_query` functions and tables;
     - after 0032, the setup form no longer sends a section count;
     - 0033 is needed for large uploads;
     - 0034 and 0035 must be applied before the API that sends `black-dot` uploads, the new GPA/backlog row shapes and `p_subject_codes`.
   - Never edit an applied migration.
2. **Supabase settings:** follow §12.3.
3. **Vercel project:**
   - The root directory is the repository root. Vercel picks up the build and output settings from `vercel.json`.
   - Set every server and `VITE_*` variable from §12.1, including `SSMP_TEMPORARY_PASSWORD` and `ALLOWED_ORIGINS`.
   - Redeploy after changing a `VITE_*` value; those are build-time values.
4. **Smoke test:**
   - `GET /api/health` should show `configured` with all three variables `ok`.
   - Sign in as each role.
   - As a cluster head, complete setup and upload a small file.
   - As the HOD, open Scheduled Jobs, which calls the API.
5. **Do not** run `db:seed` against production. The demo accounts use known passwords.

### 13.6 Operating the system (what has no UI)

| Task | How |
|---|---|
| Run the periodic jobs | HOD → Scheduled Jobs → "Run now" / "Run all". Nothing runs automatically (§4.16). |
| Reset a user's password | No UI. The user can use "Forgot password", or an admin uses the Supabase dashboard (Auth → Users). |
| Deactivate an account | No UI. Update `user_profiles.is_active` in SQL. Also ban or delete the Auth user to end their sessions. |
| Change a student's mentor | HOD → Faculty Roster → Reassign, or a mentor–mentee mapping upload. Only the HOD route moves open queries. |
| Change the shared temporary password | Set `SSMP_TEMPORARY_PASSWORD` in Vercel and redeploy. Existing accounts are unaffected. |
| Create HOD or cluster-head accounts | HOD → Students → Add account (any role). The **first** HOD cannot be created in the app, because provisioning needs an HOD. Use the seed script, or create the user in the Supabase dashboard (the profile defaults to `student`) and promote it with SQL, e.g. `update user_profiles set role = 'hod' where email = …`. SQL run without a JWT bypasses the protected-column guard. |
| Add canned replies | No UI. Insert rows into `canned_replies` (global rows need SQL or the service role). |
| Read the audit log | No UI. Run SQL on `audit_log` (HOD-readable via RLS). |

---

## 14. Error handling and edge cases

### 14.1 How an error travels

| Origin | Path to the user |
|---|---|
| **SQL** (`raise exception '…' using errcode = …`, or a CHECK / unique violation) | PostgREST returns it. supabase-js gives `{error}`. The page's `run()` shows `toast.error(describeError(error))`. `describeError` rewrites check-constraint, duplicate-key, bad-login and unconfirmed-e-mail errors; any other message is shown **verbatim**, which is why SQL messages are written for end users. |
| **SQL called by the API** | The endpoint turns it into `ApiError(message, 400)` (403 for `42501` in the report endpoints). The envelope carries `{success:false, message}`, `apiClient` throws `message`, and the page shows a toast. |
| **API validation** | zod → 400 "Invalid request — field: problem; …" |
| **API auth, role, rate limit, size** | 401 / 403 / 429 / 413 with fixed messages (§5.1) |
| **Unexpected API failure** | Logged with its stack. The client sees 500 "Something went wrong on our side. Please try again." |
| **Network or API not deployed** | `apiClient`: "Could not reach the API at /api. Check that VITE_API_BASE_URL is set to "/api" and that the serverless functions are deployed." |
| **Missing browser configuration** | A boot-time error page: "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY…" |
| **A render crash** | `ErrorBoundary` at the app root shows a fallback instead of a blank page |
| **Upload rows** | Per-row problems are returned in `row_errors` and listed in the upload panel. Only type and constraint errors abort a whole upload. |

### 14.2 Validation layers

| Rule kind | Client | API | Database |
|---|---|---|---|
| Required fields, formats (mobile, PIN, e-mail) | yes (forms) | zod | CHECK constraints (Form A, profiles) |
| Length limits | `maxLength` and checks | zod | RPC checks and CHECK constraints (subject ≤ 200, comment ≤ 1000, notes ≤ 5000…) |
| Business caps (20 unresolved queries, 5 open counselling requests, 12 CR items, 3 reopens, 500 reassignments, 60 subjects) | some | reassign ≤ 500 | **yes**, in the RPCs. Direct inserts (§8.9 S15) bypass the query cap, and filing a CR report is not checked against it. |
| Permissions | guards and hidden buttons | role check | **RLS and RPC checks** |
| File type and size | photos, Form A, proofs (`validateUpload`) | upload endpoints (size, parser type detection) | bucket limits and MIME lists |

### 14.3 Edge cases by area

**Accounts and sign-in**

- **Re-uploading a roster** skips existing e-mails and never updates them. Fixing a name or registration number requires a direct edit, and there is no admin UI for that.
- **Duplicate registration numbers** across two accounts fail the second account (unique `lower(login_id)`).
- **A mentor e-mail that is not on the allowed domains** is silently not created during a mentor-map upload. Its rows then fail with 'No faculty account for "…"'.
- **An interrupted roster upload** (tab closed, 429, network) leaves the accounts already created and a partial history row. Re-uploading resumes naturally, because existing accounts are skipped, but credentials created in the lost chunks are not shown again.
- **A deactivated user with a live session** keeps it until it expires (§8.9 S8).

**Queries**

- **After a reassignment through a mentor-map upload**, open queries stay with the old mentor (§4.4).
- **A student at the 20-unresolved cap** cannot raise more. A representative's CR items count toward the cap once filed, although filing the report itself is not blocked by it.
- **A query awaiting confirmation** counts as Resolved for the cap and for most counters, and can already be rated.
- **Posting after confirmation** is possible through the RPC; the UI hides the composer.
- **Referral** is allowed for any status, once per query.

**Uploads**

- **A course-code mismatch** between the ERP header and My Subjects aborts the attendance upload with guidance. Matching is case-insensitive, but the stored spelling is kept.
- **A student not active, or not in the roster**, produces a per-row "No student matches…".
- **The same registration number twice in an attendance file** is merged. Twice in a GPA or backlog file, the last row wins, because each row upserts.
- **Changing a subject's code** deletes its attendance history (§4.11).
- **A backlog re-upload** can un-clear rows or create case-variant duplicates (§4.12).
- **A GPA cell with text** ("NA", "Absent") aborts the whole GPA upload.
- **Attendance dates missing** from the header default to today, so a re-upload on another day creates a new period instead of replacing the old one.
- **Rich-text `.xlsx` cells** read as `[object Object]`. Save such files as plain values or CSV.

**Risk and meetings**

- **The first sweep** notifies mentors that every healthy mentee is "no longer at-risk" (§4.14).
- **Students without a mentor** are evaluated, but no one is notified and no meeting is created. The dispatch result counts them as `without_mentor`.
- **A completed meeting** is not re-raised while the student stays flagged, unless the dispatch job runs again. It then creates a new meeting, because only `awaiting_link` and `scheduled` count as open.

**Surveys and jobs**

- **Opening a new cycle** closes the previous one immediately, however many students have not answered.
- **"Run all"** runs the survey job, which opens a **new** cycle. Pressing it twice opens two cycles in succession.
- **A job failure** rolls back its own run record (§4.16).

**Reports**

- **Period boundaries** are dates (`to` inclusive). Default periods are computed in the browser with UTC date strings.
- **Characters outside WinAnsi** in PDF text are a failure risk (§10.5).
- **The department report's monthly trend** is ordered alphabetically (§4.18).

**Time zones**

- **Server-side dates** — `current_date` for survey windows and job due dates, and `date_trunc('week', now())` for "this week" — use the database time zone, which is UTC on Supabase unless changed. Users are in IST (UTC+05:30), so day and week boundaries are 5½ hours off local midnight.

**Data volume**

- **Unpaginated lists** are cut at PostgREST `max_rows` (1,000 by default): the HOD Students page, and the HOD at-risk list in a very large cohort.
- **The HOD trend chart** misbehaves after 400 (mentor, day) rows (§4.17).

---

## 15. Current status and limitations

### 15.1 Feature status

| Area | Status | Notes |
|---|---|---|
| Account provisioning (roster, single account, mentor-map mentors) | **Implemented** | Shared temporary password; no invite e-mails (§4.1) |
| Sign-in, forced password change, password reset | **Implemented** | Complexity rules are client-side only |
| Student onboarding (Form A and photo) | **Implemented** | Form A editable any time; staff have no photo upload |
| Queries: raise, converse, resolve, confirm or reopen (cap 3), rate, priority | **Implemented** | Legacy-category counters (B1) |
| Canned replies | **Partial** | Read-only chips; no management UI; the four global replies come only from the seeds |
| Raise to HOD (routed to the mentor's HOD) | **Implemented** | No escalated filter for the HOD; the note is visible to the student |
| Mentor department and HOD e-mail | **Implemented** | |
| Star mentee: group queries, survey tracking | **Implemented** | |
| CR reports (minutes and action items) | **Implemented** | |
| Counselling | **Implemented** | Single overwriting reply, no thread; no realtime |
| Student GPA self-entry and attendance view | **Implemented** | Direct-write RLS gap (S1) |
| GPA sharing preference | **Partial** | Enforced in the database, but the UI toggle was removed. It can still be switched off through `set_gpa_sharing` or a direct Form A update (S20). |
| Achievements and verification | **Implemented** | |
| Cluster head setup and My Subjects | **Implemented** | Code edits delete attendance history (B5) |
| Attendance, GPA and backlog uploads | **Implemented** | GPA and backlogs read the ERP's own exports since 0035; registration number only. See B9 and §4.12 known issues |
| Student and faculty roster import (chunked) | **Implemented** | `combined` type supported by the API; no UI option |
| Mentor–mentee mapping (with mentor creation) | **Implemented** | Mentor creation errors are not shown |
| At-risk detection and notifications | **Implemented** | First-evaluation spam (B2) |
| At-risk meetings | **Partial** | Rows and notifications are created; **meeting links are a placeholder**; only "Mark done" in the UI; students never see meetings |
| Feedback survey (cycles, answers, reminders, tracking) | **Partial** | Answers are collected but **no report or analysis reads them**. `closes_on` is not enforced, and answers are readable by the mentor at the database level (S16). |
| Periodic jobs | **Partial** | Manual triggering works; **no scheduler exists** |
| Dashboards and performance table | **Implemented** | B1, B3 |
| Faculty activity, department and dossier reports and PDFs | **Implemented** | B1, B4 |
| Faculty roster, status and reassignment | **Implemented** | B10 |
| HOD Students directory and Add account | **Implemented** | 1,000-row cap (B11) |
| Notifications (19 types; 16 in use) | **Implemented** | 3 types never sent |
| Audit log | **Implemented** (writes) | No viewer UI |
| Rate limiting | **Implemented** | Fails open |
| HOD semester setup wizard | **Removed** | Route, page and navigation removed; the table remains unused |
| Form A lock / unlock workflow | **Dead** | Functions exist; no callers; Form A is always editable |
| "Upload Black dot" (PB notice), ERP CGPA / GPA & Credits and Defaulter Grade formats | **Implemented** | Added 2026-09-27 (0034–0035, §4.12). Black dots show on the mentor's and HOD's student page; no removal UI and no notification |

### 15.2 Known functional bugs (verified in the code)

| ID | Bug | Where |
|---|---|---|
| B1 | Category counters and charts count only the legacy categories (Academic, ERP/Tech, Infrastructure), so current-category queries are missing from them. This affects the student, faculty and HOD dashboards, the mentee "Query mix", the three PDFs, `get_dashboard_metrics`, `get_student_dossier`, and the views `faculty_performance_summary`, `student_query_summary` and `query_daily_trend`. | §4.4 |
| B2 | A student's first-ever risk evaluation that is **not** at risk sends the mentor "… is no longer at-risk" | `notify_on_risk_flag_change` |
| B3 | The HOD 30-day trend reads the **oldest** 400 (mentor, day) rows once more exist; "resolved" is computed but not drawn | `HodDashboardPage` |
| B4 | The activity report's "Active" / "Still open" column always shows "—" (it reads `open_count`; the RPC returns `open`). The department `monthly_trend` is sorted alphabetically. | `FacultyActivityReportPage`, PDF builder, `get_department_faculty_report` |
| B5 | Editing a course code in My Subjects deletes and re-creates the course, **cascading away its attendance history**; a case-only edit is silently ignored | `submit_cluster_head_setup` |
| B6 | **Fixed in 0035.** A backlog re-upload without a Cleared column un-cleared backlogs, and subject codes were matched case-sensitively, so a clearance could create a new row. A blank Cleared now leaves the state alone and codes match case-insensitively; the ERP list clears by its own rule (§4.12). | `record_backlog_batch` |
| B7 | **Fixed in 0035.** A non-numeric GPA cell aborted the whole GPA upload with a raw Postgres message; it is now a row error | `record_gpa_batch` |
| B8 | **Mostly fixed in 0035.** `exam_session` now shows on the student page's backlog list and in the upload's scope label; `skipped_rows` is written by the GPA upload only | `record_backlog_batch`, upload RPCs |
| B9 | Upload-page copy is wrong: the attendance section comes from the row, not the header; the My Subjects advice is inverted. (The GPA page's meeting claim was corrected with the new GPA page.) | cluster-head pages |
| B10 | Re-activating a faculty member leaves `available_for_reassignment = false`. `reassign_mentees` does not check capacity or ownership and does not clear the star flag, so a group can end up with two representatives (a mentor-map upload has the same effect). A failed query handover is silent. A status change sent with `available_for_reassignment = true` is stored as sent, even for `departed`. | §4.19, §4.6 |
| B11 | Unpaginated lists are capped by PostgREST `max_rows` (1,000): the HOD Students page and its KPIs | `HodStudentsPage` |
| B12 | A mentor change made through a mentor-map upload does not move open queries; the old mentor keeps them | `map_students_to_mentors` |
| B13 | A cycle-job failure leaves no run record (rolled back with the re-raise) | `run_cycle_job` |
| B14 | A roster-chunk failure discards the displayed results of earlier chunks (including their credentials); there is no retry | `AcademicUploadPanel` |
| B15 | The "Department & HOD" save toast reports only the number of mentees whose department actually changed, which can be 0, while the button promised to update all of them | `FacultyMenteesPage`, `set_mentor_department_and_hod` |
| B16 | The student confirmation banner counts only the 5 most recent queries | `StudentDashboardPage` |
| B17 | "Uploads recorded" on the cluster-head dashboard is capped at 10 | `ClusterHeadDashboardPage` |
| B18 | CR-report items count toward the representative's 20-unresolved cap once filed, so a large report can block them from raising normal queries | `submit_mom_report`, `create_support_query` |
| B19 | Every new query notifies the mentor twice (`query_created` plus `query_message` for the first message), and a CR report with n items sends 1 + n notifications | `notify_on_query_message` |
| B20 | When the HOD calls `escalate_query_to_hod`, routing uses the HOD's own `hod_email`. With a single HOD nobody is notified, and the system message names the HOD as the referrer. | `escalate_query_to_hod` |
| B21 | At-risk meetings stay with the old mentor after a mentor change. The new mentor cannot see or close them, and dispatch never raises a new one. | `at_risk_meetings` policies, `dispatch_at_risk_meetings` |
| B22 | An attendance file without parsable header dates is recorded as a one-day period ending on the upload day, so re-uploading it on another day adds a period | `parseAttendanceExport` |
| B23 | CHECK violations during uploads surface as the generic "Please review the highlighted fields" message | `describeError`, upload pages |
| B24 | The roster import ignores errors from its follow-up profile update (mentor link, parent fields) | `import-roster-spreadsheet.js` |
| B25 | The provisioning duplicate check uses `ilike`, so `_` and `%` act as wildcards, and multiple matches make the check fall through | `provision-user-accounts.js` |
| B26 | `set_query_in_progress` can move a query awaiting confirmation back to In Progress without the student's decision | `set_query_in_progress` |

Security gaps S1–S20 are in §8.9.

### 15.3 Dead or unused code and schema

| Item | Kind |
|---|---|
| `frontend/src/components/tickets/*` (4 files) | Unimported components calling dropped RPCs |
| `request_form_a_unlock`, `unlock_student_form_a`, `set_gpa_sharing`, `resolve_students_for_upload`, `run_due_cycle_jobs`, `current_user_role` | SQL functions with no caller |
| `survey_group_completion` | View with no reader |
| `semester_cycles` | Table with no UI writer (the import writes to it only if a cycle id is sent, and none is) |
| `student_form_a_profiles.is_locked`, `unlock_requested`, `unlock_requested_at`, `unlocked_by` | Vestigial columns |
| `academic_upload_batches.skipped_rows` | Written only by the GPA upload |
| Notification types `onboarding_reminder`, `account_provisioned`, `academic_data_uploaded` | Never sent |
| Enum values `Academic`, `ERP/Tech`, `Infrastructure` (`query_category`) | Legacy; not offered by the UI, still counted by B1 code |
| `clusterHeadSetupSchema` (zod), dotted header aliases in the roster list | Unused code paths |
| `send_invite_email` (provisioning), `semester_cycle_id` / `default_mentor_id` / `combined` (roster import) | Accepted inputs the UI never sends (or that are ignored) |
| `GET /api/admin/manage-faculty-roster?action=reserve-pool` | Endpoint action never called |
| `roster-imports` bucket, `BUCKETS.ROSTERS` | Storage never used |
| `RESOLUTION_STATUS_LABELS` | Unused constant |
| `docs/~$MP-Platform-Context.docx` | A Word lock file committed by accident (the `.gitignore` has no `~$*` rule) |
| `npm run verify:security` | References a missing file |

### 15.4 Placeholders and TODOs in code

- `create_at_risk_meeting_link`: `TODO(provider)`. It should create a Teams/Meet meeting and set `meeting_provider`, `meeting_join_url`, `meeting_external_id` and `scheduled_for`, with status `scheduled`. Today it returns the row unchanged.
- The periodic jobs are designed for a scheduler (`trigger_source = 'scheduled'` and `run_due_cycle_jobs`), but none is connected. As written, the API endpoint cannot be called by a cron because it requires a HOD's JWT.

### 15.5 Stale documentation and UI copy

**Documents** (all superseded by this file):

- **`README.md`:**
  - "three portals" (there are four);
  - HOD "semester initialisation with roster import" (removed; rosters are uploaded by the cluster head);
  - HOD can "unlock a submitted Form A" (dead).
- **`SETUP_GUIDE.md`:**
  - the end-to-end test still sends the HOD to "Semester setup → Import roster" (step 16);
  - it uses the removed GPA-sharing toggle (step 8).
- **`docs/SECURITY.md`:**
  - roster import limited to 10 per 5 minutes (now 200 per 300 s);
  - roster imports HOD-only (now cluster head or HOD);
  - `unlock_student_form_a` described as a feature;
  - "14-character generated" temporary passwords (now one shared password).
- **`docs/CLUSTER-HEAD-AND-CYCLE-JOBS.md`:** describes a Vercel Cron or `pg_cron` hook-up that does not exist and cannot work as written, plus several upload details that have since changed.
- **`docs/SSMP-Platform-Context.docx`:** the old context document. §16 lists what changed.

**Code comments and UI strings that contradict the code:**

- 0008's first line ("every table is FORCE'd").
- The table comments listed as Doc notes in §7.4.
- `supabaseClient.js` (CSP claim).
- `AuthProvider` (Form A unlock).
- `ChangePasswordPage` ("mirrored from Supabase Auth's configured policy").
- `StudentAchievementsPage` (verification never blocks).
- `StudentGroupQueriesPage` (classmates' queries arrive live).
- `ProfilePhotoUploader` (used by all profile pages).
- Escalation hints ("…but is not shown this note").
- `FacultyQueryDetailPage` ("After 3 rejections").
- `HodOperationsPage` and `run-cycle-job.js` ("15-day" for reminders; "Three things").
- `FacultyAtRiskPage` header.
- The roster page hints ("Department" column; mentors created "silently").
- "Import the faculty roster from Semester setup" (`HodFacultyRosterPage`, `FacultyActivityReportPage`).
- `FacultyMenteesPage` empty state ("The HOD assigns mentees…").
- `upload-academic-data.js` header ("The service_role client is used for nothing but the audit entry"; it is also used for rate limiting and mentor creation).
- PDF metadata "SSMP".

---

## 16. Change history against the old document

The old `docs/SSMP-Platform-Context.docx` (August 2026) described the system at migration 0019: three portals, 13 tables, 12 enums, 4 views and 6 API functions. Every claim in it was checked against the current code. This section records the result.

### 16.1 At a glance

| | Old document | Now |
|---|---|---|
| Product name | SSMP — Student Support & Mentorship Portal | SMP — Student Mentorship Portal ("SSMP" survives in identifiers) |
| Portals and roles | 3 (student, faculty, HOD) | 4 (adds **cluster head**) |
| Migrations | 19 | 33 |
| Tables / views / enums | 13 / 4 / 12 | 28 / 8 / 18 |
| API functions | 6 | 8 (adds `run-cycle-job`, `upload-academic-data`) |
| Support requests | "tickets" | "queries" (0031 rename, everywhere) |
| Code size (approximate) | 4,050 SQL · 2,500 API · 10,100 frontend lines | ~10,700 SQL · ~4,500 API · ~13,300 frontend lines |

### 16.2 Still valid

These parts of the old document still describe the code correctly. The names have changed where noted in §16.3.

- The stack: Supabase / Postgres 15, React 19, Vite 6, React Router 7, Tailwind 3, Node 20 ESM, Recharts, pdf-lib, ExcelJS plus CSV, zod.
- Authorization lives in the database: RLS on every table (enabled, not forced), SECURITY DEFINER RPCs, the protected-column guard with the `ssmp.trusted_operation` flag, views with `security_invoker`, and notifications only from the database.
- Five realtime tables; four private buckets and their owner-folder path convention; `profile-photos` readable by any signed-in user.
- The API handler pattern: envelope, CORS, headers, rate limiting that fails open, audit; the `toClientError` pattern; the PDF primitives and `ReportDocument`.
- The Form A contents and gate (Form A, then photo); achievements and verification; star mentee; the query confirmation loop and the 3-reopen cap; dossier and activity reports built from the same RPC as the page; HOD reassignment with the handover of open queries; the reserve pool.
- Deploy basics: `vercel.json` (1024 MB / 30 s, SPA rewrite, headers), `enable_signup = false`, the CI jobs (lint, UI test, build, `node --check`, PG15 migration apply, RLS assertion).
- Invariants 10.1, 10.2, 10.4–10.8 and 10.10. Recipes 11.1, 11.3, 11.4, 11.8 and 11.9 (with updated file locations).
- The bug fixes in the old §12.1–12.5: recursive profile policy, "Failed to fetch", Panel padding, modal focus, JWT header error.
- Open items that are still open: no automated authorization tests; no e-mail delivery; realtime refetches whole pages; `unlock_student_form_a` is a no-op for the UI.

### 16.3 Changed

| Area | Old document | Now | Changed by |
|---|---|---|---|
| Naming | ticket, `support_tickets`, `ticket_messages`, `ticket_code`, `ticket_*` enums, RPCs, notification types, `/…/tickets` routes, `useRealtimeTickets` | query, `support_queries`, `query_messages`, `query_code`, `query_*`, `/…/queries`, `useRealtimeQueries` / `useQueryThread`. Stored notification links were rewritten. | 0031 |
| Query categories | Academic / ERP-Tech / Infrastructure | UI offers Academics, Examination, Behavioural, Administrative, Others. The old three remain in the enum and in several counters (B1). | 0026 |
| Referral to the HOD | Only after 3 rejections; notifies every HOD | Any query, once. Routed to the mentor's configured HOD (`hod_email`), falling back to all HODs. A button in the queue and on the detail page. | 0030 |
| Notification table | 12 types | 19 types (at-risk ×3, survey ×2, counselling, and an unused `academic_data_uploaded`) | 0020, 0028 |
| Roster import | HOD-only, from Semester Setup | Cluster head or HOD, from Rosters & Mentors. Chunked (20 s budget, waves of 25, pool of 5); `offset` / `batch_id`; 200 per 300 s. Adds parent-contact and password columns and more header aliases. | 0027, API |
| Temporary passwords | Generated, 14 characters, shown once | One shared password from `SSMP_TEMPORARY_PASSWORD` (built-in fallback), or a per-row Password column | API |
| Provisioning | Student, faculty, HOD | Adds `cluster_head`, `department` and an ignored `send_invite_email` | API |
| `user_profiles` | — | Adds `cluster_head_setup_completed(_at)`, `parent_name`/`mobile`/`email`, `hod_email`; `department` set by the mentor | 0021, 0027, 0030 |
| `student_semester_gpas` | Student-entered | Adds `source` (student / cluster_head), `recorded_by`, `batch_id`. Department values overwrite and lock the student UI. | 0021 |
| GPA sharing | Student toggle | Toggle removed from the UI; the database still honours the flag (default on) | frontend |
| Star mentee | Read-only group ticket view | Also Survey Tracking and CR Report filing | 0023, 0027 |
| Guard columns | … | Adds `cluster_head_setup_completed`. Also protects `star_mentee_assigned_by` and `available_for_reassignment`, which the old §7.2 list omitted. | 0021 |
| Route guards | 4 | 5 (adds `RequireClusterHeadSetup`). Six faculty pages are reused with `isHodView` (was 4). | frontend |
| Navigation | 3 menus | 4 menus. The student menu adds Feedback Survey, Counselling and three star-only items; faculty adds At-Risk, Counselling, CR Reports; HOD drops Semester Setup and adds At-Risk, CR Reports, Scheduled Jobs. | frontend |
| Sessions | Token not HttpOnly | Persisted in `localStorage`, with a 30-day inactivity timeout in `config.toml` | frontend, config |
| npm scripts | dev, build, db:seed, test | Adds preview, install:all, db:push, db:reset, sample:files, test:parser, and `verify:security` (broken). `test` also runs the parser check. | package.json |
| Seed | 1 HOD, 3 faculty, 4 students | Adds 2 cluster heads, subjects, uploaded attendance, GPA and backlogs, survey data and job runs | seed script |
| "Where the current body lives" | 0009 / 0011 / 0012 / 0013 / 0017–0019 | Most workflow, trigger, view and report bodies now live in **0031**; escalation in 0030/0031 | 0030, 0031 |
| Enum-value rule | New value as its own statement | New value in its **own migration file** | 0020, 0026, 0028 |
| Endpoint count in recipe 11.6 | 6 | 8 | API |

### 16.4 Removed

- **HOD Semester Setup**: the page `HodSemesterSetupPage`, the route `/hod/semester` and its menu item. The old §12.6 stepper fix is moot. The `semester_cycles` table remains, unused.
- **`generateTemporaryPassword()`** in `input-validation.js`.
- The **"after 3 rejections" gate** on referral.
- Every **`ticket`-named** table, column, enum, function, trigger, policy and route (renamed, §16.3). The orphaned `components/tickets/*` files still exist but are dead.
- The **student GPA-sharing toggle**, from the UI only.

### 16.5 New since the old document

| Area | What | Where |
|---|---|---|
| Role and portal | Cluster head: setup gate, subjects, uploads, rosters, mentor mapping | 0020, 0021; `/cluster-head/*` |
| Academic data | `cluster_head_courses`, `student_course_sections`, `student_attendance_records` (ERP export, per registration number), `student_backlogs`, `academic_upload_batches`; `student_attendance_overview` | 0021, 0025, 0027, 0032, 0033 |
| At-risk | `student_risk_flags`, `at_risk_meetings`, the evaluation rule, dispatch, the link stub, `at_risk_student_overview`, the At-Risk pages | 0022 |
| Survey | `survey_questions` (10), `survey_cycles`, `survey_responses`, `survey_response_answers`, the survey RPCs and views, the student Survey and Survey Tracking pages | 0023 |
| Jobs | `cycle_job_schedule` (4 jobs), `cycle_job_runs`, `run_cycle_job`, `run_all_cycle_jobs_now`, `get_cycle_job_status`, the HOD Scheduled Jobs page, `/api/admin/run-cycle-job` | 0024 |
| CR reports | `mom_records`, `submit_mom_report`, `set_query_in_progress`, the student and faculty/HOD CR pages | 0027 |
| Counselling | `counselling_requests`, `request_counselling`, `respond_to_counselling`, the student and faculty pages | 0028, 0029 |
| HOD routing | `set_mentor_department_and_hod`, `hod_email`, the "Department & HOD" modal, the Raise-to-HOD column | 0030 |
| Uploads API | `POST /api/cluster-head/upload-academic-data` (attendance, GPA, backlog, mentor map with mentor creation) | API |
| Performance | `resolve_student_ids` (batch lookup), chunked roster import, `runPool` | 0033, API |
| Frontend | `/reset-password`, `components/queries/*`, `PasswordField`, `AcademicUploadPanel`, `COURSE_CATALOGUE`, `SURVEY_SCALE`, `CYCLE_JOBS`, counselling and at-risk labels | frontend |
| Config and docs | `SSMP_TEMPORARY_PASSWORD`, `[auth.sessions]`, `docs/CLUSTER-HEAD-AND-CYCLE-JOBS.md`, `sample-data/cluster-head-sample-data.mjs` and `generated/` | repo |
| Fixes not in the old §12 | Blank "Referred to HOD" card (0030); attendance filed everyone under one section (0027); stale `/tickets` notification links (0031); roster-import timeouts (chunking and pool); statement timeouts on ~2,300-row uploads (0033); frequent sign-outs (localStorage and the 30-day window) | as listed |

### 16.6 Statements that were already wrong in the old document

- It spoke of "the seven cross-portal notification triggers". 0011 created six; there are nine now.
- Its §7.2 guard list omitted `star_mentee_assigned_by` and `available_for_reassignment`, both of which were already protected.
- The activity report's "Referred to HOD" card read `summary.escalated_tickets`, which the RPC did not return until 0030, so the card was always blank.

---

## Appendix A — Invariants (rules that must keep holding)

Each rule exists because breaking it caused a real failure, or would cause one that testing would not catch.

1. **Authorization never moves out of the database.**
   - New features reuse the helpers and RLS. A check that exists only in React or the API protects nothing, because PostgREST and Realtime expose the same data.
   - A new table holding user data needs RLS **and** policies in the migration that creates it. CI fails otherwise.
2. **Enable RLS; never force it.** Definer functions run as the owner and must write rows no client policy allows: system messages, notifications, state machines.
3. **Protected profile columns** (§7.1) change only when one of these holds:
   - no JWT;
   - the caller is the HOD;
   - a definer RPC that has already checked authorization sets the transaction-local `ssmp.trusted_operation` flag around the write:

     ```sql
     perform set_config('ssmp.trusted_operation', 'on', true);
     update public.user_profiles set … where id = …;
     perform set_config('ssmp.trusted_operation', 'off', true);
     ```

   If you forget the flag, the guard raises 42501 and the feature breaks for everyone except the HOD.
4. **Rule-bearing state changes are SECURITY DEFINER RPCs.** Each one:
   - pins `set search_path = public, pg_temp`;
   - checks the caller first;
   - raises end-user-readable messages, because they are shown verbatim;
   - revokes EXECUTE from `public`/`anon` and grants it to `authenticated` (and/or `service_role`).
5. **Notifications come only from the database,** through `enqueue_notification`, in triggers or definer RPCs. Never insert them from React or the API.
6. **Every view is `WITH (security_invoker = true)`.** Otherwise it runs as its owner and bypasses RLS.
7. **Storage object paths start with the owner's user id.** The storage policies read the first folder.
8. **Never edit an applied migration.** Add a new one. **Each new enum value gets its own migration file**, because Postgres refuses to use a value in the transaction that created it.
9. **Enum values the UI offers are mirrored in `lib/constants.js`.** The legacy query categories are a deliberate exception: they stay in the enum but are not offered.
10. **One source for report numbers.** A page and its PDF call the same SQL function. Never recompute report numbers in JavaScript for one of them only.
11. **The service-role key never reaches the browser,** and API work runs `asUser` unless it truly needs the service role.
12. **`Panel`'s `bodyClassName` has no default value.** The component falls back with `?? 'p-5'`; a default of `''` once removed the padding from 56 of 71 panels. Pass `bodyClassName=""` explicitly for edge-to-edge bodies.
13. **`Modal`'s setup effect depends only on `open`.** `onClose` is kept in a ref. The auto-focus prefers form fields over buttons, or focus lands on ✕ on every keystroke.
14. **Uploads resolve identifiers once per file** (`resolve_student_ids`). Never reintroduce a per-row lookup: it exceeded the statement timeout at about 2,300 rows.
15. **Long account-creation work must stay chunked.** Any loop of Auth calls must fit the 30 s function limit; follow the `offset` / `next_offset` pattern (§4.13).

## Appendix B — Change recipes

Each recipe ends with the verification loop in B.10.

**B.1 Add a field to Form A**

1. In a new migration, add the column (with CHECKs if needed) to `student_form_a_profiles`, and `create or replace` `submit_student_form_a` so it copies the payload key. The current body is in 0017/0010 lineage; copy the live definition from the database.
2. Add the field to `EMPTY_FORM_A`, `validateFormA` and the field layout in `components/student/FormAFields.jsx`.
3. If mentors should see it, add it to `get_student_dossier` (current body in 0035), the dossier page and the PDF.

**B.2 Add a page to a portal**

1. Create the page under `pages/<role>/`, wrapped in `PortalShell`.
2. Add a `lazy()` import and a `<Route>` in `AppRouter.jsx` inside `Protected role="…"`. Students also need `RequireOnboarding`; cluster heads need `RequireClusterHeadSetup`.
3. Add a `NAVIGATION[role]` item, with `when` if it is conditional.
4. Enforce access in the database, not in the page.

**B.3 Add a table**

1. In a new migration: create the table with FKs to `user_profiles` as needed, then `alter table … enable row level security`, the policies, and minimal grants to `authenticated`.
2. Add an `updated_at` trigger if the table has that column.
3. Add the table to the realtime publication only if something will subscribe.
4. CI checks that RLS is on.

**B.4 Add a state transition**

1. Write a definer RPC: caller check, validation, the update, a system message or log, and the notification via `enqueue_notification` (or a trigger).
2. Call it with `supabase.rpc` through `useAsyncAction`.
3. Do not add a client `update` policy for the same columns.

**B.5 Add a notification**

1. If the type is new: a migration containing **only** `alter type notification_type add value '…'`.
2. Then, in a later migration, the trigger or RPC that calls `enqueue_notification(recipient, actor, type, title, body, query_id, link_path)`.
3. Add an icon for the type to `TYPE_ICONS` in `components/layout/NotificationBell.jsx`.

**B.6 Add a serverless endpoint**

1. Create `api/<area>/<name>.js` exporting `withApiDefaults([...methods], handler)`.
2. Follow the anatomy in §6.1: auth, role, rate limit, zod, `asUser` work, audit, envelope.
3. Put the schema in `input-validation.js`.
4. There are 8 functions today. The `action` / discriminated-union pattern keeps related operations in one function.

**B.7 Add a chart or KPI**

1. Prefer extending the existing RPC or view, in a new migration with `create or replace`. The current bodies are mostly in 0031.
2. Render it with the `Charts.jsx` wrappers and `StatCard`.
3. **Use the current query categories.** Do not copy the legacy-category counters.

**B.8 Add a report or PDF**

1. Write one SQL function returning JSON, with an access check.
2. Render it on the page from `supabase.rpc`.
3. Add a builder in `report-document-builder.js` using `pdf-chart-primitives.js`.
4. Add an endpoint that calls the same RPC `asUser` and streams the PDF.

**B.9 Change the visual theme.** Change token **values** in `tailwind.config.cjs`, `CHART_COLORS` and the PDF `PALETTE`. Keep the token names; every screen depends on them.

**B.10 Verification loop**

1. `npm run lint`.
2. `npm test` (UI regression and parser checks).
3. `npm run build`.
4. `node --check` on changed API files.
5. Apply the migrations to a scratch Postgres with `supabase/scripts/ci-supabase-stubs.sql`, as CI does.
6. Exercise the change as each affected role.

`npm run verify:security` is broken (missing file).

## Appendix C — Limits and constants (quick reference)

| Limit | Value | Where |
|---|---|---|
| Unresolved queries per student | < 20 | `create_support_query` |
| Query subject / description / message / confirmation comment | 200 / 5,000 / 5,000 / 1,000 characters | RPCs and CHECKs |
| Resolution rejections (reopens) | 3 | `max_resolution_rejections()` |
| Referral note | 1,000 characters | `escalate_query_to_hod` |
| Open counselling requests per student; concern / reply length | 5; 3,000 / 3,000 characters | counselling RPCs |
| CR report items; notes | 12; 5,000 characters | `submit_mom_report` |
| Subjects per cluster head | 1–60 | `submit_cluster_head_setup` |
| Reassignment batch | 500 students | `reassign_mentees`, zod |
| Provisioning batch | 1–500 accounts; body ≤ 2 MB | zod, `assertBodySize` |
| Upload body; base64; effective file size | 10 MB (body parser); ≤ 8,000,000 characters (zod); about 3.3 MB in practice, because Vercel limits function request bodies to 4.5 MB | endpoints, platform |
| Spreadsheet data rows | 5,000 (not attendance) | parser |
| Roster chunk | 20 s budget, waves of 25, 5 concurrent, 1 Auth retry after 1.5 s | import endpoint |
| Function duration / memory | 30 s / 1,024 MB | `vercel.json` |
| GPA | 0–10, 2 dp; semesters 1–8 | RPCs and CHECKs |
| Attendance | 0–100%; held ≤ 2,000; attended ≤ held | CHECKs |
| At-risk thresholds | attendance < 75, latest GPA < 6, uncleared backlogs ≥ 1 | `evaluate_student_risk` |
| Survey | 10 questions, 1–5; 15-day window; reminders every 7 days | 0023/0024 |
| Rate limits | provision 20/60 s; roster 200/300 s; faculty-roster 60/60 s per action; cycle-job 40/300 s; academic-upload 30/300 s; reports 30/60 s each | endpoints |
| Password (client) | ≥ 10 characters, upper, lower, digit, symbol | `ChangePasswordPage` |
| Temporary password (roster column) | ≥ 8 characters | import endpoint |
| Files | Form A and proofs 5 MB (png, jpg, webp, pdf); photos 3 MB (png, jpg, webp); signed URLs 300 s (avatars 3,600 s) | `fileUpload.js`, buckets |
| Lists | query pages of 25; notifications 30; PostgREST `max_rows` 1,000 | hooks, config |
| Session | JWT 3,600 s; inactivity 720 h | `config.toml` |
| Query codes | `AN-` + sequence from 1001 | `query_code_seq` |

## Appendix D — Demo and seed data

**Never seed production.** The demo passwords are known. They are set by `SEED_DEFAULT_PASSWORD`, which has a built-in fallback; `supabase/seed.sql` states its password in a comment. No password is reproduced here.

| Role | E-mail | Notes |
|---|---|---|
| hod | `hod.iotis@jaipur.manipal.edu` | "Dr. Sarah Jenkins", HOD001 |
| faculty | `alice.smith@jaipur.manipal.edu`, `bob.johnson@jaipur.manipal.edu`, `carol.williams@jaipur.manipal.edu` | FAC1001–FAC1003 |
| student | `john.doe@muj.manipal.edu`, `jane.smith@muj.manipal.edu`, `mike.davis@muj.manipal.edu`, `emily.wilson@muj.manipal.edu` | Registration numbers 2428020221–2428020224; mentors assigned by the seed |
| cluster_head | `cluster.head1@jaipur.manipal.edu`, `cluster.head2@jaipur.manipal.edu` | From `sample-data/cluster-head-sample-data.mjs`; seed script only |

**`npm run db:seed`** (the hosted-safe path through the Admin API) creates:

- the accounts above, with mentor links;
- sample queries and messages;
- the 4 global canned replies;
- the cluster heads' subjects;
- uploaded sample attendance, GPA (the CGPA / GPA & Credits shape: semesters 1–2 and CGPA), two Defaulter Grade results for semester 2 (end term, then a make-up that clears Emily's backlog) and a black dot notice (John and Jane, plus one student from outside the portal who is reported back), through `record_attendance_batch`, `record_gpa_batch`, `record_backlog_batch` and `record_black_dot_batch`. Each demo student trips a different at-risk condition, and one trips none.
- The seed then runs the at-risk jobs and a survey cycle through `run_cycle_job`, and records sample survey responses.

**`supabase/seed.sql`** (local `db reset` only) inserts the 8 non-cluster-head accounts directly into `auth.users`/`auth.identities`, plus mentors, sample queries and messages, and the canned replies.

## Appendix E — Glossary

| Term | Meaning |
|---|---|
| **SMP / SSMP** | Student Mentorship Portal (current name) / Student Support & Mentorship Portal (former name, still in identifiers) |
| **Query** (formerly *ticket*) | A student's support request to their mentor; code `AN-<n>` |
| **Mentor** | The faculty member in `user_profiles.assigned_mentor_id` |
| **Mentor group** | All students who share a mentor |
| **Star mentee / student representative / CR** | The one student per mentor group with `is_star_mentee`. They see group queries and survey status and file CR reports. |
| **CR report / MoM** | Class-representative meeting minutes (`mom_records`). Their action items are queries with `mom_id`. |
| **Resolution confirmation** | The student's yes/no after a mentor resolves a query; "no" reopens it (at most 3 times) |
| **Raise to HOD / referral / escalation** | The mentor flags a query for the HOD named in their `hod_email` (or all HODs) |
| **Form A** | The department's mentor–mentee onboarding form, digitised in `student_form_a_profiles` |
| **Cluster head** | The staff role that uploads academic data and rosters for its subjects |
| **Subjects / My Subjects** | A cluster head's `cluster_head_courses` (name and code) |
| **ERP export** | The university ERP's Class Attendance file: an HTML table saved as `.xls` |
| **At-risk** | A student meeting any of: attendance < 75%, latest GPA < 6, ≥ 1 uncleared backlog |
| **Sweep / dispatch** | Re-evaluating everyone's risk / raising meetings for flagged students |
| **Cycle job** | One of the four periodic jobs (§4.16); run manually |
| **Reserve pool** | Active faculty accepting reassignments, with remaining capacity |
| **Department-published GPA** | A `student_semester_gpas` row with `source = 'cluster_head'` |
| **Trusted operation** | The transaction-local `ssmp.trusted_operation` flag that lets a definer RPC write protected profile columns |
| **Temporary password** | The shared first-login password (`SSMP_TEMPORARY_PASSWORD`) |
