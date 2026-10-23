import { describe, expect, it } from 'vitest';
import { checkRequest, isLoopbackHost } from './request-guard';

describe('isLoopbackHost', () => {
  it.each(['127.0.0.1:3000', 'localhost:3000', '[::1]:3000', 'LOCALHOST', '127.0.0.1'])('accepts %s', (h) => {
    expect(isLoopbackHost(h)).toBe(true);
  });

  it.each(['evil.example:3000', '127.0.0.1.evil.example', '0.0.0.0:3000', '192.168.1.5:3000', '', 'localhost.evil.com'])(
    'rejects %s',
    (h) => {
      expect(isLoopbackHost(h)).toBe(false);
    },
  );

  it('rejects missing host', () => {
    expect(isLoopbackHost(null)).toBe(false);
    expect(isLoopbackHost(undefined)).toBe(false);
  });
});

describe('checkRequest', () => {
  const host = '127.0.0.1:3000';

  it('allows loopback GET without Origin', () => {
    expect(checkRequest({ method: 'GET', host, origin: null })).toEqual({ allowed: true });
  });

  it('rejects any request with a non-loopback Host (DNS rebinding)', () => {
    expect(checkRequest({ method: 'GET', host: 'rebind.evil.example:3000', origin: null })).toEqual({
      allowed: false,
      reason: 'bad_host',
    });
  });

  it('allows same-origin POST', () => {
    expect(checkRequest({ method: 'POST', host, origin: 'http://127.0.0.1:3000' })).toEqual({ allowed: true });
  });

  it('rejects POST without Origin', () => {
    expect(checkRequest({ method: 'POST', host, origin: null })).toEqual({ allowed: false, reason: 'bad_origin' });
  });

  it('rejects cross-site POST', () => {
    expect(checkRequest({ method: 'POST', host, origin: 'https://evil.example' })).toEqual({
      allowed: false,
      reason: 'bad_origin',
    });
  });

  it('rejects loopback Origin on a different port (another local app)', () => {
    expect(checkRequest({ method: 'POST', host, origin: 'http://127.0.0.1:4000' })).toEqual({
      allowed: false,
      reason: 'bad_origin',
    });
  });

  it('rejects "null" and malformed origins', () => {
    expect(checkRequest({ method: 'POST', host, origin: 'null' }).allowed).toBe(false);
    expect(checkRequest({ method: 'DELETE', host, origin: 'not a url' }).allowed).toBe(false);
  });
});
