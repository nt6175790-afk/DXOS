// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, LocateFixed, ShieldCheck, ExternalLink } from 'lucide-react';
import { getAttendanceLocation, setAttendanceLocation, type AttendanceLocationPolicy, type AttendancePosition } from '@/api/attendance';

import { googleMapsSearchUrl, googleMapsPinUrl, parseGoogleMapsPin } from './google-maps-location';

function distance(a: AttendancePosition, b: { latitude: number; longitude: number }) {
  const rad = (n: number) => n * Math.PI / 180;
  const h = Math.sin(rad(a.latitude - b.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(a.longitude - b.longitude) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function useAttendanceLocation(orgId: string | undefined, canRead: boolean, canManage: boolean) {
  const scope = useRef(orgId);
  scope.current = orgId;
  const generation = useRef(0);
  const invalidatePending = useCallback(() => { generation.current += 1; }, []);
  const [policy, setPolicy] = useState<{ orgId: string; data: AttendanceLocationPolicy } | null>(null);
  const [position, setPosition] = useState<AttendancePosition | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState('');
  const [mapLink, setMapLink] = useState('');
  const load = useCallback(async () => {
    if (!orgId || !canRead) return;
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const data = await getAttendanceLocation(orgId);
      if (scope.current !== orgId || generation.current !== request) return;
      setPolicy({ orgId, data });
      if (data.office) { setLabel(data.office.label); setMapLink(googleMapsPinUrl(data.office)); }
    } catch { if (scope.current === orgId && generation.current === request) setError('Không tải được cấu hình vị trí. Hãy thử lại.'); }
    finally { if (scope.current === orgId && generation.current === request) setLoading(false); }
  }, [orgId, canRead]);
  useEffect(() => {
    setPolicy(null); setPosition(null); setError(''); setBusy(false); setEditing(false); setLabel(''); setMapLink('');
    void load();
    return invalidatePending;
  }, [load, invalidatePending]);
  const current = policy && policy.orgId === orgId ? policy.data : null;

  const requestPosition = async () => {
    const requestedOrg = orgId, requestGeneration = generation.current;
    const office = current?.office;
    if (!office) throw new Error('Công ty chưa thiết lập vị trí chấm công.');
    if (!navigator.geolocation) throw new Error('Trình duyệt không hỗ trợ định vị. Hãy dùng thiết bị có GPS.');
    setBusy(true); setError('');
    try {
      const sample = await new Promise<AttendancePosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracyMeters: p.coords.accuracy, capturedAt: new Date(p.timestamp).toISOString() }),
          e => reject(new Error(e.code === 1 ? 'Bạn chưa cho phép truy cập vị trí. Hãy bật quyền vị trí trong trình duyệt.' : e.code === 3 ? 'Lấy vị trí quá thời gian. Hãy thử lại ở nơi thoáng hơn.' : 'Không lấy được vị trí. Hãy bật GPS và thử lại.')),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      });
      if (scope.current !== requestedOrg || generation.current !== requestGeneration) throw new Error('Tổ chức đã thay đổi. Vui lòng thử lại.');
      setPosition(sample);
      if (!Number.isFinite(sample.accuracyMeters) || sample.accuracyMeters > 50 || sample.accuracyMeters < 0) throw new Error('GPS chưa đủ chính xác (cần sai số tối đa 50 m). Hãy dùng điện thoại hoặc đến nơi thoáng hơn.');
      if (Date.now() - Date.parse(sample.capturedAt) > 60000 || Date.parse(sample.capturedAt) - Date.now() > 5000) throw new Error('Vị trí đã cũ. Vui lòng cập nhật lại.');
      if (distance(sample, office) + sample.accuracyMeters > 100 + 1e-6) throw new Error('Bạn đang ngoài vùng chấm công 100 m hoặc sai số GPS vượt ranh giới.');
      return sample;
    } catch (e) {
      if (scope.current === requestedOrg && generation.current === requestGeneration) setError(e instanceof Error ? e.message : 'Không xác minh được vị trí.');
      throw e;
    } finally { if (scope.current === requestedOrg && generation.current === requestGeneration) setBusy(false); }
  };
  const mapSelection = (() => {
    if (!mapLink.trim()) return { point: null, error: '' };
    try { return { point: parseGoogleMapsPin(mapLink), error: '' }; }
    catch (cause) { return { point: null, error: cause instanceof Error ? cause.message : 'Link Google Maps không hợp lệ.' }; }
  })();
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !canManage || busy || !label.trim() || !mapSelection.point) return;
    const requestedOrg = orgId, requestGeneration = generation.current;
    setBusy(true); setError('');
    try {
      const result = await setAttendanceLocation(orgId, { label: label.trim(), ...mapSelection.point });
      if (scope.current !== requestedOrg || generation.current !== requestGeneration) return;
      setPolicy({ orgId, data: result }); setPosition(null); setEditing(false);
    } catch { if (scope.current === requestedOrg && generation.current === requestGeneration) setError('Không lưu được vị trí. Kiểm tra địa điểm đã chọn và quyền quản lý chấm công.'); }
    finally { if (scope.current === requestedOrg && generation.current === requestGeneration) setBusy(false); }
  };
  const meters = position && current?.office ? distance(position, current.office) : null;
  const panel = <section aria-label="Vị trí chấm công" className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900"><MapPin className="h-4 w-4 text-brand-600" /> Vị trí chấm công <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-800">100 m</span></h3>
      {canManage && <button type="button" className="text-xs font-medium text-brand-700 underline" onClick={() => setEditing(!editing)}>Thiết lập vị trí công ty</button>}
    </div>
    {loading ? <p className="mt-2 text-slate-500">Đang tải vị trí công ty...</p> : <>
      <p className="mt-2 text-slate-600">{current?.office ? current.office.label : 'Công ty chưa thiết lập vị trí. Liên hệ quản lý để bật chấm công.'}</p>
      {current?.office && <button type="button" disabled={busy} onClick={() => { void requestPosition().catch(() => {}); }} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium text-slate-800 disabled:opacity-50"><LocateFixed className="h-4 w-4" />{busy ? 'Đang xác minh...' : 'Cập nhật vị trí của tôi'}</button>}
    </>}
    {position && meters !== null && <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600"><p>Khoảng cách: <strong>{Math.round(meters)} m</strong></p><p>Sai số GPS: ±{Math.ceil(position.accuracyMeters)} m</p><p className="col-span-2">Đã nhận vị trí từ thiết bị của bạn.</p></div>}
    {error && <div role="alert" className="mt-3 text-xs text-rose-700">{error} {!current && <button className="ml-2 underline" onClick={() => { void load(); }}>Thử lại</button>}</div>}
    <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />Chỉ lấy GPS khi bạn bấm xác minh hoặc chấm công. Không theo dõi nền và không lưu tọa độ của bạn.</p>
    {editing && canManage && <form onSubmit={save} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
      <div className="sm:col-span-2 rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-600">
        <strong className="text-slate-900">Chọn đúng ghim công ty</strong>
        <ol className="mt-2 list-inside list-decimal space-y-1"><li>Nhập địa chỉ, mở Google Maps và chọn địa điểm công ty.</li><li>Sao chép link đầy đủ từ thanh địa chỉ rồi dán bên dưới.</li><li>Mở kiểm tra ghim đã chọn và lưu. Không cần nhập kinh độ, vĩ độ.</li></ol>
      </div>
      <label className="sm:col-span-2">Địa chỉ công ty<input required maxLength={120} placeholder="Ví dụ: tên công ty, số nhà, đường, quận, thành phố" value={label} onChange={e => { setLabel(e.target.value); setMapLink(''); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900" /></label>
      {label.trim() && <a href={googleMapsSearchUrl(label)} target="_blank" rel="noopener noreferrer" className="sm:col-span-2 inline-flex w-fit items-center gap-2 rounded-lg border border-brand-300 bg-white px-3 py-2 font-medium text-brand-700"><ExternalLink className="h-4 w-4" />Tìm địa chỉ trên Google Maps</a>}
      <label className="sm:col-span-2">Link địa điểm Google Maps<input required type="url" maxLength={4096} placeholder="https://www.google.com/maps/place/..." value={mapLink} onChange={e => setMapLink(e.target.value)} aria-describedby="maps-link-help" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900" /></label>
      <p id="maps-link-help" className="text-xs text-slate-500 sm:col-span-2">Nếu là link maps.app.goo.gl, hãy mở link rồi sao chép địa chỉ đầy đủ sau khi chọn địa điểm. Không dùng link đường đi hoặc link chỉ đang xem bản đồ.</p>
      {mapSelection.error && <p role="alert" className="sm:col-span-2 text-xs text-rose-700">{mapSelection.error}</p>}
      {mapSelection.point && <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">Đã nhận ghim địa điểm. <a target="_blank" rel="noopener noreferrer" className="font-semibold underline" href={googleMapsPinUrl(mapSelection.point)}>Xem ghim đã chọn trên Google Maps</a></div>}
      <p className="text-xs text-slate-500 sm:col-span-2">Bán kính cố định 100 m quanh ghim đã chọn; thay đổi áp dụng cho cả tổ chức. Google Maps chỉ được mở khi bạn bấm liên kết.</p>
      <button disabled={busy || !mapSelection.point || !label.trim()} className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white disabled:opacity-50">Lưu vị trí công ty</button>
    </form>}
  </section>;
  return { panel, requestPosition, ready: !!current?.office && !loading, busy };
}
