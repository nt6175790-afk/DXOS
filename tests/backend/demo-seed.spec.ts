// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { randomBytes, randomUUID } from 'node:crypto';
import { demoConfiguration } from '../../backend/scripts/demo/seed-demo-dataset';
import { demoId, demoPdf } from '../../backend/scripts/demo/demo-fixtures';

describe('local demo seed safety', () => {
  const env = () => ({ NODE_ENV: 'development', DATABASE_URL: 'mysql://localhost:3306/dx_os',
    DEMO_ADMIN_PASSWORD: randomBytes(24).toString('base64url') });
  it.each(['production', 'staging', ''])('rejects non-local mode %p before database access', (mode) => {
    expect(() => demoConfiguration({ ...env(), NODE_ENV: mode })).toThrow('LOCAL_DEMO_ONLY');
  });
  it.each(['mysql://example.test/dx_os', 'mysql://localhost/production', 'postgresql://localhost/dx_os', 'invalid'])(
    'rejects an unexpected database target %s', (url) => {
      expect(() => demoConfiguration({ ...env(), DATABASE_URL: url })).toThrow();
    });
  it('requires a configured password without exposing its value in errors', () => {
    const password = randomBytes(4).toString('hex');
    try { demoConfiguration({ ...env(), DEMO_ADMIN_PASSWORD: password }); throw new Error('Expected rejection'); }
    catch (error) { expect((error as Error).message).toBe('DEMO_ADMIN_PASSWORD_REQUIRED_16_TO_1024_CHARS'); }
  });
  it('rejects retargeting the existing administrator email', () => {
    expect(() => demoConfiguration({ ...env(), DEMO_ADMIN_EMAIL: 'another@example.test' })).toThrow('EXPECTED_EXISTING_DEMO_ADMIN');
  });
  it('allows loopback dx_os and runner-owned test databases only in test mode', () => {
    expect(demoConfiguration(env()).databaseUrl).toContain('/dx_os');
    const url = `mysql://127.0.0.1/dx_os_rbac_test_${randomBytes(8).toString('hex')}`;
    expect(() => demoConfiguration({ ...env(), DATABASE_URL: url })).toThrow();
    expect(demoConfiguration({ ...env(), NODE_ENV: 'test', DATABASE_URL: url }).databaseUrl).toBe(url);
  });
  it('keeps deterministic IDs distinct across tenants and entity types', () => {
    const a = randomUUID(), b = randomUUID();
    expect(demoId(a, 'task', 'DEMO-001')).toBe(demoId(a, 'task', 'DEMO-001'));
    expect(demoId(a, 'task', 'DEMO-001')).not.toBe(demoId(b, 'task', 'DEMO-001'));
    expect(demoId(a, 'task', 'DEMO-001')).not.toBe(demoId(a, 'notification', 'DEMO-001'));
    expect(demoId(a, 'task', 'DEMO-001')).toMatch(/^[a-f0-9-]{14}4[a-f0-9]{3}-[89ab]/);
  });
  it('generates PDF bytes with correct cross-reference offsets and escaped text', () => {
    const pdf = demoPdf('Demo (fixture)', ['Path \\ example']);
    const text = pdf.toString();
    expect(text).toContain('Demo \\(fixture\\)');
    expect(text).toContain('Path \\\\ example');
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(pdf.subarray(start, start + 4).toString()).toBe('xref');
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n/gm)].map(m => Number(m[1]));
    offsets.forEach((offset, i) => expect(pdf.subarray(offset, offset + 7).toString()).toBe(`${i + 1} 0 obj`));
  });
});
