// =============================================================
// CORS Configuration for SSMP Portal
// =============================================================
//
// SECURITY BOUNDARY NOTE:
//   CORS is a browser-enforced policy, NOT a server security boundary.
//   It does NOT protect against server-to-server requests (curl, Postman,
//   malicious backend proxies). The primary security layer is the auth
//   middleware (JWT token + HttpOnly cookie verification).
//
// WHY null-origin IS PERMITTED:
//   Browser requests from non-HTTP origins (e.g. mobile apps using WebView,
//   Capacitor/Cordova apps, or tools like curl) send no Origin header.
//   Blocking null-origin would break legitimate non-browser clients.
//   Since auth still requires a valid JWT cookie, null-origin requests
//   cannot do anything useful without a real session.
//
// '*' WILDCARD IS EXPLICITLY BANNED:
//   Never add '*' to allowedOrigins — it would disable the 'credentials'
//   CORS flag entirely and break cookie-based auth for all browsers.
// =============================================================

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL
].filter(Boolean); // filter out undefined if FRONTEND_URL is not set in dev

const corsOptions = {
  origin: (origin, callback) => {
    // Permit null-origin (mobile apps, curl, server-to-server) — see note above
    if (!origin) return callback(null, true);

    // In development mode, allow any localport on localhost / 127.0.0.1 (e.g. port 5174, 5175, etc.)
    const isDev = process.env.NODE_ENV !== 'production';
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

    if (allowedOrigins.includes(origin) || (isDev && isLocal)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin '${origin}' is not allowed by CORS policy`));
    }
  },
  credentials: true,        // Required for HttpOnly cookie auth (withCredentials: true on client)
  optionsSuccessStatus: 200 // Some legacy browsers (IE11) choke on 204
};

module.exports = corsOptions;

