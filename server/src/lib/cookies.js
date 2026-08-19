import { isProduction } from '../config/env.js';

/**
 * Both tokens live in httpOnly cookies (build gate, 2026-08-19), so cross-site scripting
 * cannot read them. The cost is a CSRF surface, handled by middleware/csrf.js.
 */
const base = {
  httpOnly: true,
  sameSite: 'strict',
  secure: isProduction,
  path: '/',
};

export const ACCESS_COOKIE = 'fo_access';
export const REFRESH_COOKIE = 'fo_refresh';
export const CSRF_COOKIE = 'fo_csrf';

export function setAuthCookies(res, { accessToken, refreshToken, csrfToken, accessTtl, refreshTtl }) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, maxAge: accessTtl * 1000 });
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, { ...base, maxAge: refreshTtl * 1000 });
  }
  if (csrfToken) {
    // Readable by JavaScript on purpose — the client must echo it in a header for the
    // double-submit check to work. It is not a credential on its own.
    res.cookie(CSRF_COOKIE, csrfToken, { ...base, httpOnly: false, maxAge: refreshTtl * 1000 });
  }
}

export function clearAuthCookies(res) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
    res.clearCookie(name, { ...base, httpOnly: name !== CSRF_COOKIE });
  }
}
