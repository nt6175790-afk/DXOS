// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { assertAttendancePosition, distanceMeters } from '../../backend/src/modules/attendance/attendance-location.service';

describe('Attendance location 100m policy', () => {
  const now = new Date('2026-10-22T02:00:00Z');
  const office = { latitude: 21, longitude: 105.8 };
  const sample = { ...office, accuracyMeters: 5, capturedAt: now.toISOString() };
  it('accepts a fresh accurate sample at the office', () => expect(() => assertAttendancePosition(office, sample, now)).not.toThrow());
  it('calculates geodesic distances and handles the date line', () => {
    expect(distanceMeters(office, office)).toBe(0);
    expect(distanceMeters({ latitude: 0, longitude: 179.9999 }, { latitude: 0, longitude: -179.9999 })).toBeCloseTo(22.239, 2);
  });
  it('accepts the inclusive 100m boundary and rejects beyond it', () => {
    const latitude = office.latitude + 100 / 6371008.8 * 180 / Math.PI;
    expect(() => assertAttendancePosition(office, { ...sample, latitude, accuracyMeters: 0 }, now)).not.toThrow();
    expect(() => assertAttendancePosition(office, { ...sample, latitude: latitude + 0.000001, accuracyMeters: 0 }, now)).toThrow();
  });
  it('includes GPS uncertainty rather than widening the allowed radius', () => {
    expect(() => assertAttendancePosition(office, { ...sample, latitude: 21.0008, accuracyMeters: 20 }, now)).toThrow();
  });
  it('fails closed without office configuration', () => expect(() => assertAttendancePosition(null, sample, now)).toThrow());
  it('rejects a missing position', () => expect(() => assertAttendancePosition(office, undefined, now)).toThrow());
  it.each([NaN, Infinity, 91, -91])('rejects invalid latitude %s', latitude => expect(() => assertAttendancePosition(office, { ...sample, latitude }, now)).toThrow());
  it.each([NaN, Infinity, 181, -181])('rejects invalid longitude %s', longitude => expect(() => assertAttendancePosition(office, { ...sample, longitude }, now)).toThrow());
  it.each([NaN, -1, 51, Infinity])('rejects invalid GPS uncertainty %s', accuracyMeters => expect(() => assertAttendancePosition(office, { ...sample, accuracyMeters }, now)).toThrow());
  it.each(['invalid', '2026-10-22T01:58:59Z', '2026-10-22T02:00:06Z'])('rejects invalid/stale/future timestamp %s', capturedAt => expect(() => assertAttendancePosition(office, { ...sample, capturedAt }, now)).toThrow());
});
