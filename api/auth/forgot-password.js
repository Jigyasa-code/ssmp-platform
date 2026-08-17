/**
 * POST /api/auth/forgot-password
 *
 * Self-service password reset request.
 * Gated by IP rate limiting, checks if the email is associated with an active account,
 * and triggers Supabase Auth resetPasswordForEmail without leaking email existence.
 */
import { withApiDefaults, sendSuccess, resolveAllowedOrigin } from '../_lib/http-response.js';
import { createAdminClient } from '../_lib/supabase-clients.js';
import { enforceIpRateLimit, recordAuditEntry } from '../_lib/request-guards.js';
import { parseOrThrow, emailSchema } from '../_lib/input-validation.js';
import { z } from 'zod';

const forgotPasswordSchema = z.object({
  email: emailSchema,
  origin: z.string().trim().url('Must be a valid URL')
});

export default withApiDefaults(['POST'], async (req, res) => {
  const admin = createAdminClient();

  // Rate-limit forgot password attempts to 10 per 10 minutes per IP
  await enforceIpRateLimit(req, admin, { key: 'forgot-password', max: 10, windowSeconds: 600, failClosed: true });

  const { email, origin } = parseOrThrow(forgotPasswordSchema, req.body ?? {});

  // V-06: Validate the origin to prevent open redirect phishing
  // Create a mock req object to reuse the CORS logic
  const mockReq = { headers: { origin } };
  const safeOrigin = resolveAllowedOrigin(mockReq) || 'https://ssmp-liart.vercel.app';

  try {
    // Audit active user state first
    const { data: profile } = await admin
      .from('user_profiles')
      .select('id, is_active')
      .ilike('email', email)
      .maybeSingle();

    if (profile && profile.is_active) {
      const { error: resetError } = await admin.auth.resetPasswordForEmail(email, {
        redirectTo: `${safeOrigin}/reset-password`
      });

      if (resetError) {
        console.error('[forgot-password] resetPasswordForEmail error:', resetError.message);
        // Fail open: don't expose error to client, return generic success
      }
    }
  } catch (error) {
    console.error('[forgot-password] system error:', error.message);
  }

  // Record audit entry (we don't block the request if this fails)
  // Mask email for privacy in the audit log
  const maskedEmail = email.replace(/(.{2})(.*)(?=@)/, (match, p1, p2) => p1 + '*'.repeat(p2.length));
  
  await recordAuditEntry({ admin, profile: null }, req, 'auth.forgot_password', {
    metadata: { email: maskedEmail, origin: safeOrigin, found_active_account: !!(profile && profile.is_active) }
  });

  // Return a generic success message regardless of existence/activity to prevent enumeration
  sendSuccess(res, 'If an active account exists for this email, a password reset link has been sent.');
});
