import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE, clearAuthCookies, getCookie, setAuthCookies, validateCsrf } from '../config/authCookies.js';

describe('authCookies config and helpers', () => {
  it('retrieve cookie from request raw headers correctly', () => {
    const req = {
      headers: {
        cookie: 'some_other_cookie=value1; ecencia_access_token=token123; dummy=1',
      },
    };
    expect(getCookie(req, ACCESS_COOKIE)).toBe('token123');
    expect(getCookie(req, 'non_existent')).toBeNull();
  });

  it('handles request without cookie header gracefully', () => {
    const req = { headers: {} };
    expect(getCookie(req, ACCESS_COOKIE)).toBeNull();
  });

  it('handles cookies without equals sign correctly', () => {
    const req = { headers: { cookie: 'cookie_without_val; name=val' } };
    expect(getCookie(req, 'name')).toBe('val');
    expect(getCookie(req, 'cookie_without_val')).toBeNull();
  });

  it('sets cookies in response headers and returns CSRF token', () => {
    const res = {
      cookie: vi.fn(),
      set: vi.fn(),
    };
    const session = {
      access_token: 'acc-tok',
      refresh_token: 'ref-tok',
    };
    const csrf = setAuthCookies(res, session);
    expect(csrf).toBeDefined();
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.cookie).toHaveBeenCalledWith(ACCESS_COOKIE, 'acc-tok', expect.any(Object));
    expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'ref-tok', expect.any(Object));
    expect(res.cookie).toHaveBeenCalledWith(CSRF_COOKIE, csrf, expect.any(Object));
  });

  it('clears auth cookies on response', () => {
    const res = {
      clearCookie: vi.fn(),
      set: vi.fn(),
    };
    clearAuthCookies(res);
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_COOKIE, expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith(CSRF_COOKIE, expect.any(Object));
  });

  it('validates CSRF tokens on unsafe HTTP methods', () => {
    const reqGet = { method: 'GET', headers: {} };
    expect(validateCsrf(reqGet)).toBe(true);

    const reqPostInvalid = {
      method: 'POST',
      headers: {
        cookie: 'ecencia_csrf_token=validToken',
        'x-csrf-token': 'wrongToken',
      },
    };
    expect(validateCsrf(reqPostInvalid)).toBe(false);

    const reqPostValid = {
      method: 'POST',
      headers: {
        cookie: 'ecencia_csrf_token=validToken',
        'x-csrf-token': 'validToken',
      },
    };
    expect(validateCsrf(reqPostValid)).toBe(true);
  });
});
