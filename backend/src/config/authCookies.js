const crypto = require('node:crypto');

const ACCESS_COOKIE = 'eciencia_access_token';
const REFRESH_COOKIE = 'eciencia_refresh_token';
const CSRF_COOKIE = 'eciencia_csrf_token';

const isProduction = process.env.NODE_ENV === 'production';
const sameSite = process.env.COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax');
const secure = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : isProduction;

const accessMaxAge = Number(process.env.AUTH_ACCESS_COOKIE_MAX_AGE_MS || 1000 * 60 * 60);
const refreshMaxAge = Number(process.env.AUTH_REFRESH_COOKIE_MAX_AGE_MS || 1000 * 60 * 60 * 24 * 30);

const baseCookieOptions = {
  sameSite,
  secure,
  path: '/',
};

const noStore = (res) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('Pragma', 'no-cache');
};

const getCookie = (req, name) => {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) return null;

  return rawCookie
    .split(';')
    .map((part) => part.trim())
    .reduce((found, part) => {
      if (found !== null) return found;
      const separator = part.indexOf('=');
      if (separator === -1) return null;
      const key = part.slice(0, separator);
      if (key !== name) return null;
      return decodeURIComponent(part.slice(separator + 1));
    }, null);
};

const createCsrfToken = () => crypto.randomBytes(32).toString('hex');

const setAuthCookies = (res, session) => {
  const csrfToken = createCsrfToken();
  noStore(res);

  res.cookie(ACCESS_COOKIE, session.access_token, {
    ...baseCookieOptions,
    httpOnly: true,
    maxAge: accessMaxAge,
  });
  res.cookie(REFRESH_COOKIE, session.refresh_token, {
    ...baseCookieOptions,
    httpOnly: true,
    maxAge: refreshMaxAge,
  });
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...baseCookieOptions,
    httpOnly: false,
    maxAge: refreshMaxAge,
  });

  return csrfToken;
};

const clearAuthCookies = (res) => {
  noStore(res);
  res.clearCookie(ACCESS_COOKIE, baseCookieOptions);
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions);
  res.clearCookie(CSRF_COOKIE, baseCookieOptions);
};

const isUnsafeMethod = (method) => !['GET', 'HEAD', 'OPTIONS'].includes(method);

const validateCsrf = (req) => {
  if (!isUnsafeMethod(req.method)) return true;
  const csrfCookie = getCookie(req, CSRF_COOKIE);
  const csrfHeader = req.headers['x-csrf-token'];
  return Boolean(csrfCookie && csrfHeader && csrfCookie === csrfHeader);
};

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  clearAuthCookies,
  getCookie,
  setAuthCookies,
  validateCsrf,
};
