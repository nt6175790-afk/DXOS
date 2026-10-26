// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
/** Read an explicitly selected Maps pin, never the viewport centre after @. No network requests. */
export function googleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

export function googleMapsPinUrl(point: { latitude: number; longitude: number }): string {
  return googleMapsSearchUrl(`${point.latitude},${point.longitude}`);
}

export function parseGoogleMapsPin(value: string): { latitude: number; longitude: number } {
  const invalid = (message: string): never => { throw new Error(message); };
  if (value.length > 4096) invalid('Link quá dài. Hãy sao chép link địa điểm từ thanh địa chỉ Google Maps.');
  let url: URL;
  try { url = new URL(value.trim()); } catch { return invalid('Hãy dán link địa điểm Google Maps hợp lệ.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) invalid('Chỉ dùng link HTTPS chính thức của Google Maps.');
  if (['maps.app.goo.gl', 'goo.gl'].includes(url.hostname)) {
    invalid('Đây là link rút gọn. Hãy mở link trên Google Maps, chọn địa điểm rồi sao chép link đầy đủ từ thanh địa chỉ trình duyệt.');
  }
  if (!['google.com', 'www.google.com', 'maps.google.com', 'google.com.vn', 'www.google.com.vn'].includes(url.hostname) ||
    (url.hostname !== 'maps.google.com' && !/^\/maps(?:\/|$)/.test(url.pathname)) || /^\/maps\/dir(?:\/|$)/.test(url.pathname)) {
    invalid('Hãy dùng link một địa điểm Google Maps, không phải đường đi hoặc trang web khác.');
  }
  let decoded: string;
  try { decoded = decodeURIComponent(url.pathname + url.search + url.hash); } catch { return invalid('Link Google Maps bị lỗi mã hóa. Hãy sao chép lại.'); }
  const number = '-?\\d+(?:\\.\\d+)?';
  const pins = [...decoded.matchAll(new RegExp(`!3d(${number})!4d(${number})(?=!|&|$)`, 'g'))];
  let latitude: number, longitude: number;
  if (pins.length === 1) {
    latitude = Number(pins[0][1]); longitude = Number(pins[0][2]);
  } else if (pins.length > 1) {
    return invalid('Link chứa nhiều địa điểm. Hãy chọn đúng một ghim công ty rồi sao chép lại.');
  } else {
    const queries = [...url.searchParams.getAll('query'), ...url.searchParams.getAll('q')];
    const pairs = queries.map(query => new RegExp(`^(?:loc:)?(${number})\\s*,\\s*(${number})$`).exec(query.trim())).filter(pair => pair !== null);
    if (queries.length !== 1 || pairs.length !== 1) return invalid('Link chưa xác định ghim công ty. Trên Google Maps, chọn địa điểm hoặc thả ghim rồi sao chép link đầy đủ; không dùng link chỉ đang xem bản đồ.');
    latitude = Number(pairs[0][1]); longitude = Number(pairs[0][2]);
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) invalid('Vị trí trong link không hợp lệ. Hãy chọn lại ghim công ty.');
  return { latitude, longitude };
}
