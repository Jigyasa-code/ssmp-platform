# SSMP Platform — Feature Verification & Security Audit

> **Audit Date**: 2026-08-18  
> **Scope**: All 7 recently implemented features + full codebase security posture  
> **Policy**: Report only — no fixes applied

---

## Part 1 — Feature Verification

### Feature 1 — Make photo upload compulsory in Form A

| Check | Status | Notes |
|-------|--------|-------|
| Frontend `validateFormA()` requires `parent_business_card_path` | ✅ PASS | Added in FormAFields.jsx |
| Frontend `validateFormA()` requires `student_signature_path` | ✅ PASS | Added in FormAFields.jsx |
| `FileField` component shows red asterisk for `required` prop | ✅ PASS | Updated in FormControls.jsx |
| Panel title changed from "Optional Uploads" to "Uploads (Required)" | ✅ PASS | Verified in FormAFields.jsx |
| Hints changed from "Optional. …" to "Required. …" | ✅ PASS | Verified in FormAFields.jsx |
| Backend RPC `submit_student_form_a` enforces non-null `parent_business_card_path` | ✅ PASS | Raises exception `22023` in migration 0027 |
| Backend RPC `submit_student_form_a` enforces non-null `student_signature_path` | ✅ PASS | Raises exception `22023` in migration 0027 |

---

### Feature 2 — Show Form A as a pop-up on first login

| Check | Status | Notes |
|-------|--------|-------|
| `Modal.jsx` accepts `dismissible` prop | ✅ PASS | Defaults to `true` for backward compatibility |
| Non-dismissible modal hides close button | ✅ PASS | Conditionally rendered |
| Non-dismissible modal ignores Escape key | ✅ PASS | Guard `&& dismissible` added before `onCloseRef.current()` |
| Non-dismissible modal blocks backdrop click | ✅ PASS | Backdrop is a `<div>` instead of `<button>` |
| `StudentOnboardingModal.jsx` created | ✅ PASS | New component |
| `PortalShell.jsx` renders modal when `!form_a_completed` | ✅ PASS | Conditional rendering with skeleton placeholder |
| `RequireOnboarding` no longer redirects to `/student/onboarding` | ✅ PASS | Redirect removed from RouteGuards.jsx |
| `/student/onboarding` route removed from AppRouter | ✅ PASS | Route and lazy import removed |
| `StudentProfilePhotoPage` redirects to `/student` (not old route) | ✅ PASS | Updated |

---

### Feature 3 — Let a student delegate permission to Student Representative

| Check | Status | Notes |
|-------|--------|-------|
| `representative_sharing_enabled` column added to `student_form_a_profiles` | ✅ PASS | Boolean, default `false`, not null |
| `can_view_student_details_as_representative()` helper created | ✅ PASS | Checks caller is Star Mentee, same mentor group, and student has opted in |
| RLS policy on `student_achievements` for representative | ✅ PASS | `achievements_select_representative` policy created |
| RLS policy on `support_tickets` for representative | ✅ PASS | `tickets_select_representative` policy created |
| `get_mentor_group_tickets()` filters by sharing preference | ✅ PASS | Only shows tickets where student opted in or it's the rep's own |
| `set_representative_sharing()` RPC created | ✅ PASS | Uses `SECURITY DEFINER`, checks `is_student()` |
| `EMPTY_FORM_A` includes `representative_sharing_enabled: false` | ✅ PASS | Updated in FormAFields.jsx |
| Toggle UI on student profile page | ✅ PASS | New "Representative Sharing" panel with switch |

---

### Feature 4 — Fix the shared temporary password vulnerability

| Check | Status | Notes |
|-------|--------|-------|
| `suppliedPassword` variable removed | ✅ PASS | Password column override removed |
| Always calls `generateTemporaryPassword()` | ✅ PASS | Line 148 in import-roster-spreadsheet.js |
| `must_change_password` still enforced | ✅ PASS | Set to `true` in user metadata |

> **CRITICAL REGRESSION BUG — Line 189**: `password_from_file: Boolean(suppliedPassword)` still references the removed `suppliedPassword` variable. This will cause a **ReferenceError at runtime** when the roster import API is called with `create_accounts: true`, crashing the endpoint. See Vulnerability V-01.

> **BROKEN COMMENT BLOCK — Lines 136-144**: The JSDoc comment starting with `/**` on line 136 never has its closing `*/`. The replacement left a dangling block comment mixed with `//` comments and a code statement. While V8 may tolerate this, it is malformed.

---

### Feature 5 — Add a "Forgot password" option

| Check | Status | Notes |
|-------|--------|-------|
| `enforceIpRateLimit()` added to `request-guards.js` | ✅ PASS | Uses `clientIp()` + Postgres `consume_rate_limit` |
| `/api/auth/forgot-password.js` endpoint created | ✅ PASS | New file |
| Rate limited (10 per 10 min per IP) | ✅ PASS | Correct configuration |
| Checks `is_active` before sending reset email | ✅ PASS | Profile lookup + active check |
| Returns generic message regardless of email existence | ✅ PASS | Prevents user enumeration |
| Login page calls API endpoint instead of Supabase directly | ✅ PASS | `fetch('/api/auth/forgot-password', ...)` |

> **UNUSED IMPORT**: `sendPasswordReset` is still destructured from `useAuth()` on line 11 of LoginPage.jsx but is never called. Not a crash risk, but dead code.

---

### Feature 6 — Change the name shown on the login page

| Check | Status | Notes |
|-------|--------|-------|
| Login page heading text is "Student Management Portal SMP" | ✅ PASS | Updated in LoginPage.jsx |
| `<title>` tag updated | ✅ PASS | Updated in index.html |
| `<meta name="description">` updated | ✅ PASS | Updated in index.html |

> **FONT STYLESHEET CHANGED**: The index.html edit replaced the original Google Fonts stylesheet (Manrope + Hanken Grotesk) with Inter + Outfit. If the existing CSS references the old font families, text will silently fall back to browser defaults.

> **THEME-COLOR CHANGED**: `<meta name="theme-color">` was changed from `#a43700` (orange/brand) to `#1a1c1e` (near-black). This was not part of the Feature 6 requirement.

---

### Feature 7 — Increase rate limits

| Endpoint | Old Limit | New Limit | Status |
|----------|-----------|-----------|--------|
| `provision-user-accounts.js` | 20 / 60s | 60 / 60s | ✅ PASS |
| `import-roster-spreadsheet.js` | 10 / 300s | 30 / 300s | ✅ PASS |
| `manage-faculty-roster.js` | 60 / 60s | 180 / 60s | ✅ PASS |
| `student-dossier-report.js` | 30 / 60s | 90 / 60s | ✅ PASS |
| `faculty-activity-report.js` | 30 / 60s | 90 / 60s | ✅ PASS |
| `config.toml` `sign_in_sign_ups` | 30 | 90 | ✅ PASS |
| `config.toml` `email_sent` | 10 | 30 | ✅ PASS |
| `upload-academic-data.js` | 30 / 300s | 30 / 300s | ⚠️ NOT CHANGED |
| `run-cycle-job.js` | 40 / 300s | 40 / 300s | ⚠️ NOT CHANGED |

> `upload-academic-data.js` and `run-cycle-job.js` rate limits were not modified. If these are expected to be increased per the "2-3x" requirement, they remain at their old values.

---

## Part 2 — Security Vulnerability Assessment

### Critical Severity

#### V-01 — Runtime crash in roster import (undefined variable reference)
- **File**: `api/admin/import-roster-spreadsheet.js`, line 189
- **Issue**: `Boolean(suppliedPassword)` references the variable `suppliedPassword` that was removed in the Feature 4 changes. When `create_accounts: true`, this will throw a `ReferenceError` crashing the entire roster import endpoint.
- **Impact**: HOD cannot import student/faculty rosters. Complete loss of account provisioning via spreadsheet.
- **Category**: Code defect / Availability

#### V-02 — Broken JSDoc comment block in roster import
- **File**: `api/admin/import-roster-spreadsheet.js`, lines 136-148
- **Issue**: The `/**` block starting on line 136 never has a closing `*/`. The replacement left a dangling block comment mixed with `//` line comments and a code statement. This is syntactically ambiguous.
- **Impact**: Parser confusion, linting failures, potential runtime issues.
- **Category**: Code defect / Maintainability

---

### High Severity

#### V-03 — `Math.random()` used for password generation (cryptographically weak)
- **File**: `api/_lib/input-validation.js`, lines 207-212
- **Issue**: `generateTemporaryPassword()` uses `Math.random()` which is not cryptographically secure. `Math.random()` is seeded by the V8 engine's internal state and can be predicted if an attacker can observe enough outputs. Should use `crypto.getRandomValues()` or `crypto.randomBytes()`.
- **Impact**: Temporary passwords could be predicted by an attacker who observes multiple generated passwords.
- **Category**: Weak Cryptography / CWE-338

#### V-04 — No Content-Security-Policy (CSP) header configured
- **File**: `vercel.json`, `api/_lib/http-response.js`
- **Issue**: The codebase comments claim "a strict Content-Security-Policy" as a mitigation for XSS (see `supabaseClient.js` line 17), but **no CSP header is actually configured** anywhere — not in `vercel.json`, not in the API security headers, not in `index.html`.
- **Impact**: Without CSP, any XSS vulnerability can exfiltrate the Supabase JWT from localStorage. The documentation is misleading.
- **Category**: Missing Security Header / CWE-1021

#### V-05 — Temporary passwords returned in API response body and downloadable as CSV
- **Files**: `provision-user-accounts.js` line 85, `import-roster-spreadsheet.js` line 188, `HodSemesterSetupPage.jsx` line 191
- **Issue**: Temporary passwords are included in the JSON response body (`temporary_password` field) and are downloadable as a CSV from the HOD dashboard. These responses travel over HTTPS but are cached in browser memory, DevTools network tab, and potentially in Vercel function logs.
- **Impact**: Passwords are exposed in network inspector, browser history, and potentially server logs.
- **Category**: Sensitive Data Exposure / CWE-200

#### V-06 — Forgot-password `origin` parameter is attacker-controlled (open redirect in reset link)
- **File**: `api/auth/forgot-password.js`, lines 16, 37
- **Issue**: The `origin` parameter is accepted from the request body, validated only as "is it a valid URL" by Zod (`z.string().url()`), and passed directly to `redirectTo: ${origin}/reset-password`. An attacker can send `{ email: "victim@jaipur.manipal.edu", origin: "https://evil.com" }` and the victim receives a **legitimate** Supabase password reset email with a link pointing to `https://evil.com/reset-password?token=...`. This is a **phishing attack vector** where the attacker captures the reset token.
- **Impact**: Account takeover via phishing. The attacker controls where the reset link redirects.
- **Category**: Open Redirect / CWE-601

---

### Medium Severity

#### V-07 — JWT stored in localStorage (XSS to session hijacking)
- **File**: `frontend/src/lib/supabaseClient.js`, line 64
- **Issue**: Supabase session tokens are stored in `localStorage` with key `ssmp.auth.session`. Any XSS vulnerability can exfiltrate this token. The codebase acknowledges this trade-off but the mitigating CSP header is not actually implemented (see V-04).
- **Impact**: Combined with V-04, the risk is higher than documented. A single XSS vector leads to full session hijacking.
- **Category**: Insecure Storage / CWE-922

#### V-08 — Rate limiters fail open
- **File**: `api/_lib/request-guards.js`, lines 71-72, 92-93
- **Issue**: Both `enforceRateLimit()` and `enforceIpRateLimit()` have a "fail open" policy — if the Postgres `consume_rate_limit` RPC returns an error, the request is allowed through. An attacker who can cause connection pool exhaustion bypasses all rate limiting.
- **Impact**: Rate limiting can be rendered ineffective during infrastructure stress.
- **Category**: Insufficient Rate Limiting / CWE-799

#### V-09 — CORS allows all `*.vercel.app` subdomains
- **File**: `api/_lib/http-response.js`, line 31
- **Issue**: The regex `/^https:\/\/[a-z0-9-]+\.vercel\.app$/` accepts **any** `*.vercel.app` subdomain if the `ALLOWED_ORIGINS` list includes at least one `.vercel.app` domain. An attacker can deploy their own app on Vercel and make cross-origin requests to the SSMP API.
- **Impact**: Cross-origin data theft if combined with credential cookies or bearer tokens.
- **Category**: CORS Misconfiguration / CWE-942

#### V-10 — `can_view_student_details_as_representative()` uses SELECT * in SECURITY DEFINER
- **File**: Migration 0027, the helper function
- **Issue**: The function uses `SELECT *` on `user_profiles` inside a `SECURITY DEFINER` context, which bypasses RLS. While the function is currently safe, `SELECT *` fetches all columns including potentially sensitive ones. If `user_profiles` gains sensitive columns in the future, they'll be loaded into this privileged context unnecessarily.
- **Impact**: Over-fetching data in a privileged context increases attack surface for future changes.
- **Category**: Excessive Privilege / CWE-250

#### V-11 — `set_representative_sharing()` RPC can create a stub Form A record
- **File**: Migration 0027, the `set_representative_sharing` function
- **Issue**: If a student calls `set_representative_sharing(true)` before submitting Form A, the function's `INSERT ... ON CONFLICT ... DO UPDATE` creates a skeleton `student_form_a_profiles` row with placeholder values (`'PENDING'`, `'000000'`, etc.). This bypasses the validation in `submit_student_form_a()` and pollutes the database with invalid records.
- **Impact**: Students can create partially-valid Form A records with garbage data. The `form_a_completed` flag on `user_profiles` is unaffected, but the data row exists.
- **Category**: Business Logic Bypass / CWE-840

---

### Low Severity

#### V-12 — `sendPasswordReset` still destructured but unused in LoginPage
- **File**: `frontend/src/pages/auth/LoginPage.jsx`, line 11
- **Issue**: `sendPasswordReset` is destructured from `useAuth()` but is never called after the forgot-password flow was moved to the API. Dead code, no functional impact.
- **Category**: Dead Code / Maintainability

#### V-13 — Font stylesheet replaced unintentionally in `index.html`
- **File**: `frontend/index.html`, line 12
- **Issue**: The original Google Fonts import (Manrope + Hanken Grotesk) was replaced with Inter + Outfit during the branding edit. If the CSS references the old font families, fonts will no longer load.
- **Impact**: Visual regression — potential broken typography across the application.
- **Category**: Unintended Side Effect

#### V-14 — `theme-color` meta tag changed without requirement
- **File**: `frontend/index.html`, line 6
- **Issue**: `<meta name="theme-color">` changed from `#a43700` to `#1a1c1e`. Not part of Feature 6.
- **Impact**: Mobile browser chrome color changes unexpectedly.
- **Category**: Unintended Side Effect

#### V-15 — Two rate-limited endpoints not increased
- **Files**: `api/cluster-head/upload-academic-data.js` line 71, `api/admin/run-cycle-job.js` line 67
- **Issue**: Feature 7 asked for a 2-3x increase across rate-limited endpoints, but these two were left at original values.
- **Impact**: May still hit rate-limit walls during workload spikes.
- **Category**: Incomplete Implementation

#### V-16 — No audit logging on forgot-password endpoint
- **File**: `api/auth/forgot-password.js`
- **Issue**: The endpoint does not call `recordAuditEntry()`. Password reset attempts are security-relevant events that should be logged for forensics.
- **Impact**: No audit trail for password reset attempts.
- **Category**: Insufficient Logging / CWE-778

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| Critical | 2 | V-01, V-02 |
| High | 4 | V-03, V-04, V-05, V-06 |
| Medium | 5 | V-07, V-08, V-09, V-10, V-11 |
| Low | 5 | V-12, V-13, V-14, V-15, V-16 |
| **Total** | **16** | |

### Top 3 Items Requiring Immediate Attention

1. **V-01** — `suppliedPassword` ReferenceError will crash roster imports at runtime
2. **V-06** — Attacker-controlled `origin` parameter enables phishing via password reset emails
3. **V-04** — Claimed CSP header is not actually deployed, undermining all XSS mitigations
