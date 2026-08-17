/**
 * Faculty roster management — Feature 8 (HOD reassignment on departure).
 * One endpoint, four actions, so the deployment stays inside Vercel's
 * function budget without bundling unrelated logic together.
 *
 *   GET  ?action=roster                     -> all faculty + live mentee counts
 *   GET  ?action=mentees&faculty_id=...     -> that faculty's mentee list
 *   GET  ?action=reserve-pool               -> faculty available to take mentees
 *   POST { action: 'set-status', ... }      -> active | on_leave | departed
 *   POST { action: 'reassign', ... }        -> bulk move mentees
 *
 * Every action is HOD-only and every write is audit-logged.
 */
import { withApiDefaults, sendSuccess, ApiError } from '../_lib/http-response.js';
import { requireAuthenticatedUser, requireRole, enforceRateLimit, recordAuditEntry } from '../_lib/request-guards.js';
import { parseOrThrow, facultyStatusSchema, reassignmentSchema } from '../_lib/input-validation.js';

/**
 * Supabase surfaces transport-level problems (a malformed API key, DNS
 * failure) as an ordinary { error } object. Forwarding those verbatim
 * dumped a raw JWT and an undici stack message into the user's screen, so
 * they are logged and replaced with something actionable instead.
 */
function toClientError(error, fallback) {
  const message = String(error?.message ?? '');
  if (/invalid header value|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(message)) {
    console.error('[api] Supabase transport failure:', message);
    return new ApiError(
      'The server could not reach Supabase. Check SUPABASE_URL and the API keys in the Vercel environment variables.',
      502
    );
  }
  return new ApiError(message || fallback, 400);
}

export default withApiDefaults(['GET', 'POST'], async (req, res) => {
  const context = await requireAuthenticatedUser(req);
  requireRole(context, 'hod');

  // Reads go through the caller's own token so RLS still applies —
  // defence in depth even though HOD would pass the policy anyway.
  const { asUser, admin } = context;

  if (req.method === 'GET') {
    const action = String(req.query.action ?? 'roster');

    if (action === 'roster') {
      const { data, error } = await asUser
        .from('faculty_reserve_pool')
        .select('*')
        .order('full_name');
      if (error) throw toClientError(error, 'Could not load the faculty roster');
      return sendSuccess(res, 'Faculty roster retrieved', { faculty: data });
    }

    if (action === 'mentees') {
      const facultyId = String(req.query.faculty_id ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(facultyId)) throw new ApiError('A valid faculty_id is required', 400);

      const { data, error } = await asUser
        .from('user_profiles')
        .select('id, full_name, email, login_id, section, branch, semester_label, is_star_mentee, form_a_completed')
        .eq('assigned_mentor_id', facultyId)
        .eq('role', 'student')
        .order('full_name');
      if (error) throw toClientError(error, 'Could not load the mentee list');

      const { data: openTickets } = await asUser
        .from('support_tickets')
        .select('student_id')
        .eq('mentor_id', facultyId)
        .neq('status', 'Resolved');
      const openByStudent = new Map();
      for (const t of openTickets ?? []) {
        openByStudent.set(t.student_id, (openByStudent.get(t.student_id) ?? 0) + 1);
      }

      return sendSuccess(res, 'Mentee list retrieved', {
        mentees: (data ?? []).map((m) => ({ ...m, open_tickets: openByStudent.get(m.id) ?? 0 }))
      });
    }

    if (action === 'reserve-pool') {
      const { data, error } = await asUser
        .from('faculty_reserve_pool')
        .select('*')
        .eq('employment_status', 'active')
        .eq('available_for_reassignment', true)
        .order('remaining_capacity', { ascending: false });
      if (error) throw toClientError(error, 'Could not load the reserve pool');
      return sendSuccess(res, 'Reserve pool retrieved', { faculty: data });
    }

    throw new ApiError(`Unknown action "${action}"`, 400);
  }

  // ---- POST -----------------------------------------------------------
  const action = String(req.body?.action ?? '');
  await enforceRateLimit(context, { key: `faculty-roster:${action}`, max: 180, windowSeconds: 60 });

  if (action === 'set-status') {
    const payload = parseOrThrow(facultyStatusSchema, req.body ?? {});
    const { data, error } = await asUser.rpc('set_faculty_employment_status', {
      p_faculty_id: payload.faculty_id,
      p_status: payload.employment_status,
      p_available: payload.available_for_reassignment ?? null
    });
    if (error) throw toClientError(error, 'Could not update the status');

    await recordAuditEntry(context, req, 'hod.set_faculty_status', {
      type: 'user_profiles', id: payload.faculty_id,
      metadata: { employment_status: payload.employment_status }
    });

    const { count } = await admin
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_mentor_id', payload.faculty_id)
      .eq('role', 'student');

    return sendSuccess(res, `Status updated to "${payload.employment_status}".`, {
      faculty: data,
      mentee_count: count ?? 0,
      needs_reassignment: payload.employment_status === 'departed' && (count ?? 0) > 0
    });
  }

  if (action === 'reassign') {
    const payload = parseOrThrow(reassignmentSchema, req.body ?? {});

    const { data: moved, error } = await asUser.rpc('reassign_mentees', {
      p_student_ids: payload.student_ids,
      p_to_mentor_id: payload.to_faculty_id,
      p_reason: payload.reason ?? null
    });
    if (error) throw toClientError(error, 'Could not reassign the mentees');

    // Open tickets keep pointing at the departing mentor unless we move
    // them too, which would silently orphan the conversation. Move only
    // the unresolved ones; resolved history stays with whoever handled it.
    if (payload.from_faculty_id) {
      const { error: ticketError } = await admin
        .from('support_tickets')
        .update({ mentor_id: payload.to_faculty_id })
        .in('student_id', payload.student_ids)
        .eq('mentor_id', payload.from_faculty_id)
        .neq('status', 'Resolved');
      if (ticketError) console.error('[reassign] ticket handover failed:', ticketError.message);
    }

    await recordAuditEntry(context, req, 'hod.reassign_mentees', {
      type: 'user_profiles', id: payload.to_faculty_id,
      metadata: {
        student_count: payload.student_ids.length,
        moved,
        from: payload.from_faculty_id ?? null,
        reason: payload.reason ?? null
      }
    });

    return sendSuccess(res, `${moved} student(s) reassigned successfully.`, { reassigned: moved });
  }

  throw new ApiError(`Unknown action "${action}"`, 400);
});
