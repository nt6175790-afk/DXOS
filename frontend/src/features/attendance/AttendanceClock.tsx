// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Clock3, CalendarDays } from 'lucide-react';
import type { Shift } from '@/api/shifts';

export function AttendanceClock({ now, shift, isOff }: { now: Date; shift?: Shift | null; isOff?: boolean }) {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);
  const [hour, minute, second] = time.split(':').map(Number);
  const date = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
  return <section aria-label="Đồng hồ giờ Việt Nam" className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-6 text-white shadow-lg">
    <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-300">
      <span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-400" /> GIỜ VIỆT NAM</span>
      <span className="rounded-full border border-white/15 px-2 py-1 text-[10px]">UTC+07:00</span>
    </div>
    <div aria-hidden="true" className="relative mx-auto my-5 h-44 w-44 rounded-full border border-slate-600 bg-slate-800 shadow-inner">
      {Array.from({ length: 12 }, (_, index) => <span key={index} className="absolute inset-2" style={{ transform: `rotate(${index * 30}deg)` }}><span className={`mx-auto block rounded-full ${index % 3 === 0 ? 'h-3 w-1 bg-amber-300' : 'h-2 w-0.5 bg-slate-500'}`} /></span>)}
      <span className="absolute bottom-1/2 left-1/2 h-11 w-1.5 origin-bottom -translate-x-1/2 rounded-full bg-white" style={{ transform: `translateX(-50%) rotate(${hour % 12 * 30 + minute / 2}deg)` }} />
      <span className="absolute bottom-1/2 left-1/2 h-16 w-1 origin-bottom rounded-full bg-slate-200" style={{ transform: `translateX(-50%) rotate(${minute * 6 + second / 10}deg)` }} />
      <span className="absolute bottom-1/2 left-1/2 h-[68px] w-0.5 origin-bottom rounded-full bg-amber-400" style={{ transform: `translateX(-50%) rotate(${second * 6}deg)` }} />
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-400 bg-slate-900" />
    </div>
    <div className="flex items-baseline justify-center gap-1 font-mono tabular-nums tracking-tight" aria-label={`Giờ Việt Nam ${time}`}>
      <span className="text-4xl font-bold">{time.slice(0, 5)}</span><span className="text-xl text-amber-300">:{time.slice(6)}</span>
    </div>
    <p className="mt-2 text-center text-sm capitalize text-slate-300">{date}</p>
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div><p className="font-medium">{shift?.name || (isOff ? 'Hôm nay là ngày nghỉ theo lịch phân ca.' : 'Chưa có ca làm việc')}</p>
        <p className="mt-1 text-xs text-slate-400">{shift ? `${shift.startTime} – ${shift.endTime}${shift.isOvernight ? ' · Qua đêm' : ''}` : 'Xem lịch đi làm để kiểm tra phân ca.'}</p></div>
    </div>
  </section>;
}
