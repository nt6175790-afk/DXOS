// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Clock, MapPin } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import { useCursorList } from '@/hooks/useCursorList';
import { listCalendarEvents, listCalendarTasks, createCalendarEvent, updateCalendarEvent, type CalendarEvent, type CalendarEventInput } from '@/api/calendar';
import { isApiError } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localInput = (value: string) => { const date = new Date(value); return `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`; };
function errorText(error: unknown) {
  if (isApiError(error) && error.error.code === 'FORBIDDEN') return 'Bạn không có quyền sử dụng lịch này.';
  if (isApiError(error) && error.error.code === 'CONFLICT') return 'Sự kiện đã thay đổi hoặc bị hủy. Hãy tải lại dữ liệu.';
  return 'Không thể xử lý dữ liệu lịch. Vui lòng thử lại.';
}
interface Entry { key: string; id: string; title: string; start: Date; end: Date; source: 'task' | 'event'; cancelled: boolean; event?: CalendarEvent }
function belongsToDay(entry: Entry, day: Date) {
  if (entry.source === 'task') return dateKey(entry.start) === dateKey(day);
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return entry.start < next && entry.end > day;
}
export function CalendarPage() {
  const { currentOrg } = useOrganization(); const { hasPermission, isLoading } = usePermission(); const guard = useOrgBootstrapGuard();
  if (guard) return guard;
  if (isLoading) return <LoadingState message="Đang kiểm tra quyền xem lịch..." />;
  const tasks = hasPermission('task:read'); const events = hasPermission('calendar:read');
  if (!currentOrg || (!tasks && !events)) return <ForbiddenState message="Bạn cần quyền xem công việc hoặc lịch tổ chức." />;
  return <CalendarContent key={`${currentOrg.id}:${tasks}:${events}`} orgId={currentOrg.id} canReadTasks={tasks} canReadEvents={events} canCreate={hasPermission('calendar:create')} canUpdate={hasPermission('calendar:update')} />;
}
function CalendarContent({ orgId, canReadTasks, canReadEvents, canCreate, canUpdate }: { orgId: string; canReadTasks: boolean; canReadEvents: boolean; canCreate: boolean; canUpdate: boolean }) {
  const [month, setMonth] = useState(() => { const today = new Date(); return new Date(today.getFullYear(), today.getMonth(), 1); });
  const [day, setDay] = useState(() => { const today = new Date(); return new Date(today.getFullYear(), today.getMonth(), today.getDate()); });
  const [filter, setFilter] = useState<'all' | 'task' | 'event'>('all');
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const from = month.toISOString(); const until = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
  const taskLoad = useCallback((after?: string) => canReadTasks ? listCalendarTasks(orgId, { from, until }, after) : Promise.resolve({ items: [], nextCursor: null }), [orgId, from, until, canReadTasks]);
  const eventLoad = useCallback((after?: string) => canReadEvents ? listCalendarEvents(orgId, { from, until }, after) : Promise.resolve({ items: [], nextCursor: null }), [orgId, from, until, canReadEvents]);
  const tasks = useCursorList(`${orgId}:${from}:${canReadTasks}`, taskLoad); const events = useCursorList(`${orgId}:${from}:${canReadEvents}`, eventLoad);
  const entries: Entry[] = [
    ...tasks.items.map((task) => ({ key: `task:${task.id}`, id: task.id, title: task.title, start: new Date(task.dueAt), end: new Date(task.dueAt), source: 'task' as const, cancelled: false })),
    ...events.items.map((event) => ({ key: `event:${event.id}`, id: event.id, title: event.title, start: new Date(event.startsAt), end: new Date(event.endsAt), source: 'event' as const, cancelled: event.status === 'CANCELLED', event })),
  ].filter((entry) => filter === 'all' || entry.source === filter).sort((a, b) => a.start.getTime() - b.start.getTime() || a.key.localeCompare(b.key));
  const days = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1));
  const offset = (month.getDay() + 6) % 7;
  const selected = entries.filter((entry) => belongsToDay(entry, day));
  const moveMonth = (delta: number) => { const next = new Date(month.getFullYear(), month.getMonth() + delta, 1); setMonth(next); setDay(next); };
  return <div>
    <PageHeader title="Lịch làm việc" description="Hạn công việc, cuộc họp và sự kiện của tổ chức" actions={canCreate ? <button className="btn-primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4 mr-2" />Thêm sự kiện</button> : undefined} />
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <button className="btn-secondary p-2" aria-label="Tháng trước" onClick={() => moveMonth(-1)}><ChevronLeft className="h-4 w-4" /></button>
      <h2 className="font-semibold min-w-32 text-center capitalize">{month.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}</h2>
      <button className="btn-secondary p-2" aria-label="Tháng sau" onClick={() => moveMonth(1)}><ChevronRight className="h-4 w-4" /></button>
      <button className="btn-secondary text-sm" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setDay(new Date(today.getFullYear(), today.getMonth(), today.getDate())); }}>Hôm nay</button>
      <select className="input-field w-auto text-sm" aria-label="Loại lịch" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">Tất cả lịch có quyền xem</option>{canReadTasks && <option value="task">Hạn công việc</option>}{canReadEvents && <option value="event">Cuộc họp và sự kiện</option>}</select>
    </div>
    <p className="text-xs text-slate-500 mb-4">Múi giờ: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Lịch nghỉ phép sẽ xuất hiện khi phân hệ nghỉ phép được triển khai.</p>
    {!canReadEvents && <p className="text-sm text-slate-500 mb-3">Bạn chưa có quyền xem cuộc họp và sự kiện của tổ chức.</p>}
    {[{ result: tasks, label: 'công việc' }, { result: events, label: 'sự kiện' }].map(({ result, label }) => {
      return result.error ? <p key={label} role="alert" className="text-sm text-red-700 mb-3">Lịch {label}: {errorText(result.error)} <button className="underline" onClick={result.refresh}>Thử lại</button></p> : null;
    })}
    {(tasks.loading || events.loading) && <p role="status" className="text-sm text-slate-500 mb-3">Đang tải lịch...</p>}
    <div className="hidden md:grid grid-cols-7 rounded-xl overflow-hidden border border-slate-200 bg-white mb-5">
      {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((label) => <div className="text-xs text-slate-500 bg-slate-50 p-3 text-center border-b border-slate-200" key={label}>{label}</div>)}
      {Array.from({ length: offset }, (_, index) => <div key={`empty-${index}`} className="bg-slate-50 border-r border-b border-slate-100" />)}
      {days.map((date) => { const dayEntries = entries.filter((entry) => belongsToDay(entry, date)); const active = dateKey(date) === dateKey(day);
        return <button key={dateKey(date)} className={`text-left min-h-28 p-2 border-r border-b border-slate-100 min-w-0 focus:outline-brand-500 ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}`} aria-pressed={active} aria-label={`Ngày ${date.toLocaleDateString('vi-VN')}, ${dayEntries.length} mục đã tải`} onClick={() => setDay(date)}>
          <span className={`text-sm font-medium ${active ? 'text-brand-700' : 'text-slate-700'}`}>{date.getDate()}</span>
          {dayEntries.slice(0, 3).map((entry) => <span key={entry.key} className={`block truncate text-[11px] rounded px-1 py-0.5 mt-1 ${entry.source === 'task' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'} ${entry.cancelled ? 'line-through opacity-60' : ''}`}>{entry.title}</span>)}
          {dayEntries.length > 3 && <span className="text-[10px] text-slate-500">+{dayEntries.length - 3} mục</span>}
        </button>;
      })}
    </div>
    <div className="flex flex-wrap gap-2 mb-4">
      <p className="text-xs text-slate-500 self-center">Đã tải {tasks.items.length} hạn công việc · {events.items.length} sự kiện trong tháng.</p>
      {tasks.nextCursor && <button className="btn-secondary text-xs" disabled={tasks.loading} onClick={tasks.loadMore}>Tải thêm hạn công việc</button>}
      {events.nextCursor && <button className="btn-secondary text-xs" disabled={events.loading} onClick={events.loadMore}>Tải thêm sự kiện</button>}
    </div>
    <section className="card p-5"><div className="flex flex-wrap items-center gap-3 mb-4"><h2 className="font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4" />Lịch ngày</h2>
      <input className="input-field w-auto text-sm" aria-label="Chọn ngày xem lịch" type="date" value={dateKey(day)} onChange={(event) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) return; const date = new Date(`${event.target.value}T00:00:00`); if (!Number.isFinite(date.getTime())) return; setDay(date); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }} />
    </div>
      {!selected.length && !tasks.loading && !events.loading && !tasks.error && !events.error && <p className="text-sm text-slate-500">Chưa có lịch trong dữ liệu đã tải của ngày này.</p>}
      <ul className="divide-y divide-slate-100">{selected.map((entry) => <li key={entry.key} className="py-3 flex items-start justify-between gap-3"><div className="min-w-0">
        <p className="text-xs text-slate-500 mb-1">{entry.source === 'task' ? 'Hạn công việc' : entry.event?.kind === 'MEETING' ? 'Cuộc họp' : 'Sự kiện'}{entry.cancelled ? ' · Đã hủy' : ''}</p>
        {entry.source === 'task' ? <Link to={`/tasks/${entry.id}`} className="font-medium text-sm text-brand-600 break-words">{entry.title}</Link> : <button className={`font-medium text-sm text-left break-words ${entry.cancelled ? 'line-through text-slate-500' : 'text-brand-600'}`} onClick={() => setEditing(entry.event!)}>{entry.title}</button>}
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Clock className="h-3 w-3" />{entry.start.toLocaleString('vi-VN')}{entry.source === 'event' ? ` — ${entry.end.toLocaleString('vi-VN')}` : ''}</p>
        {entry.event?.location && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" />{entry.event.location}</p>}
      </div></li>)}</ul>
    </section>
    {editing && <EventEditor key={editing === 'new' ? 'new' : editing.id} orgId={orgId} event={editing === 'new' ? null : editing} day={day} writable={editing === 'new' ? canCreate : canUpdate && editing.status !== 'CANCELLED'}
      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); events.refresh(); }} />}
  </div>;
}

function EventEditor({ orgId, event, day, writable, onClose, onSaved }: { orgId: string; event: CalendarEvent | null; day: Date; writable: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: event?.title ?? '', kind: event?.kind ?? 'MEETING', description: event?.description ?? '', location: event?.location ?? '',
    startsAt: event ? localInput(event.startsAt) : `${dateKey(day)}T09:00`, endsAt: event ? localInput(event.endsAt) : `${dateKey(day)}T10:00` });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirmCancel, setConfirmCancel] = useState(false);
  const alive = useRef(false); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const save = async (cancel = false) => {
    if (busy || !writable) return;
    const startsAt = new Date(form.startsAt); const endsAt = new Date(form.endsAt);
    if (!cancel && (!form.title.trim() || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 31 * 86400000)) { setError('Nhập tiêu đề và khoảng thời gian hợp lệ, tối đa 31 ngày.'); return; }
    setBusy(true); setError('');
    try {
      if (event && cancel) await updateCalendarEvent(orgId, event.id, { status: 'CANCELLED' });
      else {
        const input: CalendarEventInput = { title: form.title.trim(), kind: form.kind, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), description: form.description.trim() || null, location: form.location.trim() || null };
        if (event) await updateCalendarEvent(orgId, event.id, input); else await createCalendarEvent(orgId, input);
      }
      if (alive.current) onSaved();
    } catch (err) { if (alive.current) setError(errorText(err)); }
    finally { if (alive.current) setBusy(false); }
  };
  return <Modal open onClose={() => { if (!busy) onClose(); }} title={event ? 'Chi tiết sự kiện' : 'Thêm cuộc họp / sự kiện'} size="lg">
    {error && <p role="alert" className="text-sm text-red-700 mb-4">{error}</p>}
    {!writable && <p className="text-sm text-slate-500 mb-4">{event?.status === 'CANCELLED' ? 'Sự kiện đã hủy, chỉ có thể xem.' : 'Bạn chỉ có quyền xem sự kiện.'}</p>}
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}><fieldset disabled={!writable || busy}>
      <FormField label="Tiêu đề sự kiện" htmlFor="event-title" required><input id="event-title" className="input-field" value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormField>
      <FormField label="Loại sự kiện" htmlFor="event-kind"><select id="event-kind" className="input-field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'EVENT' | 'MEETING' })}><option value="MEETING">Cuộc họp</option><option value="EVENT">Sự kiện</option></select></FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><FormField label="Bắt đầu" htmlFor="event-start" required><input id="event-start" type="datetime-local" step="0.001" className="input-field" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></FormField>
        <FormField label="Kết thúc" htmlFor="event-end" required><input id="event-end" type="datetime-local" step="0.001" className="input-field" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></FormField></div>
      <FormField label="Địa điểm" htmlFor="event-location"><input id="event-location" className="input-field" value={form.location} maxLength={200} onChange={(e) => setForm({ ...form, location: e.target.value })} /></FormField>
      <FormField label="Nội dung" htmlFor="event-description"><textarea id="event-description" className="input-field min-h-24" value={form.description} maxLength={4000} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
    </fieldset><p className="text-xs text-slate-500">Thời gian theo múi giờ {Intl.DateTimeFormat().resolvedOptions().timeZone}. Sự kiện không tự gửi thư mời.</p>
      <div className="flex flex-wrap justify-end gap-2 mt-5"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Đóng</button>
        {event && writable && <button type="button" className="btn-secondary text-red-600" disabled={busy} onClick={() => setConfirmCancel(true)}>Hủy sự kiện</button>}
        {writable && <button className="btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu sự kiện'}</button>}
      </div>
      {confirmCancel && <div className="mt-4 p-3 bg-red-50 rounded-lg text-sm"><p>Hủy sự kiện này? Sau khi hủy sẽ không thể chỉnh sửa hoặc mở lại.</p><div className="flex gap-2 mt-2"><button type="button" className="btn-secondary" onClick={() => setConfirmCancel(false)} disabled={busy}>Giữ sự kiện</button><button type="button" className="btn-primary" onClick={() => void save(true)} disabled={busy}>Xác nhận hủy sự kiện</button></div></div>}
    </form>
  </Modal>;
}
