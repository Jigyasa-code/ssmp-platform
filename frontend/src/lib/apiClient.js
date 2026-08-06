/**
 * apiClient.js
 * Thin wrapper around fetch() for the Vercel serverless endpoints.
 * Always attaches the caller's Supabase access token as a bearer token so
 * the server can verify who is asking.
 */

import { getAccessToken } from './supabaseClient.js';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function authorizedHeaders(extra = {}) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Your session has expired. Please sign in again.');
  }
  return { Authorization: `Bearer ${token}`, ...extra };
}

function buildUrl(path, query) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function unwrap(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    return response;
  }
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `Request failed with status ${response.status}`);
  }
  return payload.data;
}

export const apiClient = {
  async get(path, query) {
    const response = await fetch(buildUrl(path, query), {
      method: 'GET',
      headers: await authorizedHeaders()
    });
    return unwrap(response);
  },

  async post(path, body) {
    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: await authorizedHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body ?? {})
    });
    return unwrap(response);
  },

  /** Downloads a binary response (used for PDF reports) and saves it. */
  async downloadFile(path, query, fallbackFilename) {
    const response = await fetch(buildUrl(path, query), {
      method: 'GET',
      headers: await authorizedHeaders()
    });

    if (!response.ok) {
      let message = `Download failed with status ${response.status}`;
      try {
        const payload = await response.json();
        message = payload.message || message;
      } catch {
        /* binary or empty body — keep the generic message */
      }
      throw new Error(message);
    }

    const disposition = response.headers.get('content-disposition') ?? '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] ?? fallbackFilename;

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a beat to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    return filename;
  }
};
