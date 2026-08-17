/**
 * request-guards.js
 * Authentication, role authorisation and rate limiting for the privileged
 * endpoints. Mirrors the guards enforced in the database so a request is
 * rejected as early and as cheaply as possible.
 */

import { createAdminClient, createUserClient } from './supabase-clients.js';
import { ApiError } from './http-response.js';

/** Reads the bearer token, verifies it with Supabase and loads the profile. */
export async function requireAuthenticatedUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    throw new ApiError('Not authenticated — sign in and try again.', 401);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile) {
    throw new ApiError('No profile found for this account.', 403);
  }
  if (!profile.is_active) {
    throw new ApiError('This account has been deactivated.', 403);
  }

  return { token, authUser: data.user, profile, admin, asUser: createUserClient(token) };
}

/** Role allow-list. `requireRole(ctx, 'hod')` etc. */
export function requireRole(context, ...roles) {
  if (!roles.includes(context.profile.role)) {
    throw new ApiError(
      `Forbidden — this action requires the role: ${roles.join(' or ')}.`,
      403
    );
  }
  return context;
}

/** Client IP, safe behind Vercel's proxy. */
export function clientIp(req) {
  // Vercel guarantees x-real-ip is the actual client IP, preventing spoofing
  const realIp = req.headers['x-real-ip'] || req.headers['x-vercel-forwarded-for'];
  if (typeof realIp === 'string' && realIp.length) return realIp.split(',')[0].trim();
  
  // Fallback for local development
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Postgres-backed fixed-window rate limit. Shared across every warm
 * serverless instance, unlike an in-memory counter.
 */
export async function enforceRateLimit(context, { key, max, windowSeconds, failClosed = false }) {
  const bucket = `${key}:${context.profile.id}`;
  const { data, error } = await context.admin.rpc('consume_rate_limit', {
    p_bucket_key: bucket,
    p_max_requests: max,
    p_window_seconds: windowSeconds
  });
  if (error) {
    console.error('[rate-limit] error:', error.message);
    if (failClosed) throw new ApiError('Service temporarily unavailable. Please try again later.', 503);
    return; // never block a legitimate request because the limiter broke unless strictly required
  }
  if (data === false) {
    throw new ApiError(
      `Too many requests. Please wait ${windowSeconds} seconds and try again.`,
      429
    );
  }
}

/** Rate limits unauthenticated requests based on client IP. */
export async function enforceIpRateLimit(req, admin, { key, max, windowSeconds, failClosed = false }) {
  const ip = clientIp(req);
  const bucket = `${key}:${ip}`;
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_bucket_key: bucket,
    p_max_requests: max,
    p_window_seconds: windowSeconds
  });
  if (error) {
    console.error('[rate-limit-ip] error:', error.message);
    if (failClosed) throw new ApiError('Service temporarily unavailable. Please try again later.', 503);
    return; // fail open unless strictly required
  }
  if (data === false) {
    throw new ApiError(
      `Too many requests. Please wait ${windowSeconds} seconds and try again.`,
      429
    );
  }
}

/** Writes an entry to the append-only audit log. Failures never block. */
export async function recordAuditEntry(context, req, action, entity = {}) {
  const { error } = await context.admin.rpc('write_audit_entry', {
    p_actor_id: context.profile?.id ?? null,
    p_action: action,
    p_entity_type: entity.type ?? null,
    p_entity_id: entity.id ? String(entity.id) : null,
    p_metadata: entity.metadata ?? {},
    p_ip_address: clientIp(req),
    p_user_agent: String(req.headers['user-agent'] ?? '').slice(0, 400)
  });
  if (error) console.error('[audit] write failed:', error.message);
}
