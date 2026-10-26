// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { googleMapsPinUrl, googleMapsSearchUrl, parseGoogleMapsPin } from '@/features/attendance/google-maps-location';

describe('Google Maps office pin input', () => {
  it('opens a safely encoded address search', () => {
    const url=new URL(googleMapsSearchUrl(' Công ty A & B, Hà Nội '));
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('query')).toBe('Công ty A & B, Hà Nội');
    expect(url.searchParams.get('api')).toBe('1');
  });
  it('prefers the actual place pin over a different viewport centre', () => {
    expect(parseGoogleMapsPin('https://www.google.com/maps/place/Office/@20,100,17z/data=!4m6!3m5!1sabc!8m2!3d21!4d105.8!16sxyz')).toEqual({latitude:21,longitude:105.8});
  });
  it('reads encoded place pin data', () => {
    expect(parseGoogleMapsPin('https://www.google.com/maps/place/Office/data=%213d21%214d105.8')).toEqual({latitude:21,longitude:105.8});
  });
  it('round trips a saved office without manual coordinates', () => {
    expect(parseGoogleMapsPin(googleMapsPinUrl({latitude:21,longitude:105.8}))).toEqual({latitude:21,longitude:105.8});
  });
  it.each(['https://maps.google.com/?q=-33.8,151.2','https://www.google.com.vn/maps?q=-33.8%2C151.2'])('supports selected coordinate-query pins: %s', link=>{
    expect(parseGoogleMapsPin(link)).toEqual({latitude:-33.8,longitude:151.2});
  });
  it.each([
    'https://maps.app.goo.gl/abc', 'https://goo.gl/maps/abc',
    'javascript:alert(1)', 'http://www.google.com/maps?q=21,105.8',
    'https://www.google.com.evil.test/maps?q=21,105.8', 'https://evil.test/?q=21,105.8',
    'https://user:password@www.google.com/maps?q=21,105.8',
    'https://www.google.com:444/maps?q=21,105.8',
    'https://www.google.com/maps/@21,105.8,17z',
    'https://www.google.com/maps/search/?api=1&query=Some+address',
    'https://www.google.com/maps/dir/Office/data=!3d21!4d105.8',
    'https://www.google.com/maps?q=91,105.8', 'https://www.google.com/maps?q=21,181',
    'https://www.google.com/maps?q=21,105.8&q=22,106',
    'https://www.google.com/maps/place/x/data=!3d21!4d105.8!3d22!4d106',
    'https://www.google.com/maps/place/x/data=%ZZ',
  ])('fails closed on unsupported, ambiguous or unsafe links: %s', link=>expect(()=>parseGoogleMapsPin(link)).toThrow());
});
