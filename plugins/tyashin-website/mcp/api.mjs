// Thin client for the public Tyashin API. Only the public API host is used;
// everything is authenticated with the user's own personal access token.

export const DEFAULT_API_BASE = 'https://website-api.tyashin.com';

export class ApiError extends Error {
  constructor(status, code, message, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export function apiBaseFrom(env = process.env) {
  const raw = (env.TYASHIN_API_URL || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) {
    throw new Error(`TYASHIN_API_URL must use https (got ${raw})`);
  }
  return raw;
}

export function createApi({ base, getToken, fetchImpl = fetch, userAgent }) {
  async function request(method, path, { body, auth = true, form } = {}) {
    const headers = { Accept: 'application/json', 'User-Agent': userAgent };
    if (auth) {
      const token = await getToken();
      if (!token) {
        throw new ApiError(
          401,
          'NOT_SIGNED_IN',
          'Not signed in to Tyashin. Call tyashin_login first.'
        );
      }
      headers.Authorization = `Bearer ${token}`;
    }
    let payload;
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(form).toString();
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetchImpl(`${base}/api/v1${path}`, { method, headers, body: payload });
    } catch (err) {
      throw new ApiError(0, 'NETWORK', `Could not reach Tyashin (${err.message}).`);
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      const code = json?.error?.code || json?.error || `HTTP_${res.status}`;
      const message =
        json?.error?.message ||
        json?.error_description ||
        (typeof json?.error === 'string' ? json.error : null) ||
        `Tyashin answered HTTP ${res.status}.`;
      throw new ApiError(res.status, code, message, json?.data ?? json);
    }
    return json;
  }
  return {
    get: (p, o) => request('GET', p, o),
    post: (p, body, o = {}) => request('POST', p, { ...o, body }),
    patch: (p, body, o = {}) => request('PATCH', p, { ...o, body }),
    del: (p, o) => request('DELETE', p, o),
    raw: request,
  };
}
