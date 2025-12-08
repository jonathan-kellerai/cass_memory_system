import { describe, it, expect } from 'bun:test';
import { sanitize } from '../src/security';

describe('sanitize', () => {
  const defaultConfig = { enabled: true, extraPatterns: [], auditLog: false, auditLevel: "info" as const };

  it('should return text unchanged if disabled', () => {
    const raw = 'secret';
    expect(sanitize(raw, { ...defaultConfig, enabled: false })).toBe(raw);
  });

  it('should sanitize AWS keys', () => {
    const raw = 'export AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE';
    expect(sanitize(raw, defaultConfig)).toBe('export AWS_ACCESS_KEY=[AWS_ACCESS_KEY]');
  });

  it('should sanitize Bearer tokens', () => {
    const raw = 'Authorization: Bearer abcdef123456';
    expect(sanitize(raw, defaultConfig)).toBe('Authorization: [BEARER_TOKEN]');
  });

  it('should use extra patterns', () => {
    const raw = 'my secret is 12345';
    expect(sanitize(raw, { ...defaultConfig, extraPatterns: ["12345"] })).toBe('my secret is [REDACTED]');
  });

  it('should sanitize database URLs', () => {
    const raw = 'postgres://user:password@localhost:5432/db';
    expect(sanitize(raw, defaultConfig)).toBe('postgres://[USER]:[PASS]@localhost:5432/db');
  });
});
