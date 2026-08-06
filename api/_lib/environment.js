/**
 * environment.js
 * Reads and validates every server-side environment variable exactly once,
 * at module load. If something required is missing the function crashes
 * immediately with a clear message instead of silently falling back to a
 * default — the exact failure mode called out in the Phase 1 review.
 */

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `FATAL: required environment variable ${name} is not set. ` +
        `Add it in Vercel → Project → Settings → Environment Variables (or your local .env).`
    );
  }
  return value.trim();
}

function optional(name, fallback = '') {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export const env = {
  get SUPABASE_URL() {
    return required('SUPABASE_URL');
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get SUPABASE_ANON_KEY() {
    return required('SUPABASE_ANON_KEY');
  },
  get ALLOWED_ORIGINS() {
    return optional('ALLOWED_ORIGINS', '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  },
  get IS_PRODUCTION() {
    return optional('VERCEL_ENV', optional('NODE_ENV', 'development')) === 'production';
  }
};

/** Never log a secret. Used by the health endpoint to report readiness. */
export function describeConfigHealth() {
  return {
    supabase_url: Boolean(process.env.SUPABASE_URL),
    supabase_service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabase_anon_key: Boolean(process.env.SUPABASE_ANON_KEY)
  };
}
