// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';
import { Modal } from '@/components/ui/Modal';
import { aiActions, type AiTaskDraft, type KnowledgeSource, type TaskDraftFields } from '@/api/ai-actions';
import { listFiles } from '@/api/files';
import type { FileMetadata } from '@/api/types';

export function AiActionsPanel({ organizationId }: { organizationId: string }) {
  const { hasPermission } = usePermission();
  const [mode, setMode] = useState<'task' | 'knowledge' | null>(null);
  const [prompt, setPrompt] = useState(''); const [draft, setDraft] = useState<AiTaskDraft | null>(null);
  const [fields, setFields] = useState<TaskDraftFields>({ title: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [taskId, setTaskId] = useState('');
  const [sources, setSources] = useState<KnowledgeSource[]>([]); const [files, setFiles] = useState<FileMetadata[]>([]);
  const [cursor, setCursor] = useState<string | null>(null); const [fileId, setFileId] = useState(''); const [consent, setConsent] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError('');
    try { await action(); } catch { if (alive.current) setError('Không thể thực hiện. Hãy kiểm tra quyền, cấu hình AI và giới hạn tài liệu rồi thử lại.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const loadSources = async (after?: string) => {
    const [s, f] = await Promise.all([aiActions.sources(organizationId), listFiles(organizationId, { limit: 100, ...(after ? { after } : {}) })]);
    if (alive.current) { setSources(s.items); setFiles(old => after ? [...old, ...f.items] : f.items); setCursor(f.nextCursor); }
  };
  return <div className="mb-3 flex flex-wrap gap-2">
    {hasPermission('task:create') && <button className="btn-secondary" onClick={() => { setMode('task'); setError(''); }}>Tạo việc bằng AI</button>}
    {hasPermission('file:read') && <button className="btn-secondary" onClick={() => { setMode('knowledge'); void run(() => loadSources()); }}>Kho tri thức PDF</button>}
    <Modal open={mode === 'task'} onClose={() => { if (!busy) setMode(null); }} title="Tạo công việc bằng AI">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">AI chỉ đề xuất. Kiểm tra bản nháp rồi bấm xác nhận để tạo công việc; quyền của bạn vẫn được kiểm tra trên máy chủ.</p>
        <label className="block">Mô tả công việc<textarea aria-label="Mô tả công việc cho AI" className="input-field w-full" maxLength={2000} value={prompt} onChange={e => setPrompt(e.target.value)} disabled={busy || Boolean(draft)} /></label>
        {!draft && <button className="btn-primary" disabled={busy || prompt.trim().length < 3} onClick={() => void run(async () => {
          const d = await aiActions.propose(organizationId, prompt); if (alive.current) { setDraft(d); setFields(d.task); setTaskId(''); }
        })}>{busy ? 'Đang tạo bản nháp…' : 'Đề xuất bản nháp'}</button>}
        {draft && !taskId && <>
          <p className="text-xs text-slate-500">{draft.provider === 'mock' ? 'Bản nháp mô phỏng — chưa dùng AI thật.' : 'Bản nháp từ AI — cần kiểm tra nội dung.'} Hết hạn: {new Date(draft.expiresAt).toLocaleString('vi-VN')}</p>
          <label className="block">Tiêu đề<input aria-label="Tiêu đề bản nháp" className="input-field w-full" value={fields.title} maxLength={200} onChange={e => setFields({ ...fields, title: e.target.value })} disabled={busy} /></label>
          <label className="block">Nội dung<textarea aria-label="Nội dung bản nháp" className="input-field w-full" value={fields.description ?? ''} maxLength={10000} onChange={e => setFields({ ...fields, description: e.target.value || undefined })} disabled={busy} /></label>
          <label className="block">Ưu tiên<select aria-label="Ưu tiên bản nháp" className="input-field w-full" value={fields.priority ?? 'MEDIUM'} onChange={e => setFields({ ...fields, priority: e.target.value as TaskDraftFields['priority'] })} disabled={busy}>
            <option value="LOW">Thấp</option><option value="MEDIUM">Trung bình</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn cấp</option></select></label>
          <label className="block">Hạn hoàn thành<input aria-label="Hạn hoàn thành bản nháp" className="input-field w-full" type="datetime-local" disabled={busy}
            value={fields.dueAt ? new Date(new Date(fields.dueAt).getTime() - new Date(fields.dueAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
            onChange={e => setFields({ ...fields, dueAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} /></label>
          <p className="text-sm text-slate-500">Chưa giao người thực hiện. Bạn có thể giao sau trong Công việc nếu có quyền.</p>
          <div className="flex gap-2"><button className="btn-primary" disabled={busy || !fields.title.trim()} onClick={() => void run(async () => {
            const result = await aiActions.confirm(organizationId, draft.id, fields); if (alive.current) setTaskId(result.taskId);
          })}>{busy ? 'Đang xác nhận…' : 'Xác nhận tạo công việc'}</button>
          <button className="btn-secondary" disabled={busy} onClick={() => setDraft(null)}>Bỏ bản nháp</button></div>
        </>}
        {taskId && <div role="status" className="text-emerald-700">Đã tạo công việc. <Link to={`/tasks/${taskId}`} className="underline">Mở công việc</Link></div>}
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </div>
    </Modal>
    <Modal open={mode === 'knowledge'} onClose={() => { if (!busy) setMode(null); }} title="Kho tri thức PDF" size="lg">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Chỉ PDF có lớp văn bản, tối đa 5 MB / 30 trang. Không nhận hồ sơ nhân sự. Khi hỏi trong chat, AI có thể dùng trích đoạn và dẫn nguồn theo trang. Tối đa 100 PDF mỗi tổ chức.</p>
        {hasPermission('file:upload') && <>
          <label className="block">PDF trong kho tài liệu<select aria-label="PDF để lập chỉ mục" className="input-field w-full" value={fileId} disabled={busy} onChange={e => { setFileId(e.target.value); setConsent(false); }}>
            <option value="">Chọn PDF đã tải lên</option>{files.filter(f => f.contentType === 'application/pdf').map(f => <option key={f.id} value={f.id}>{f.originalFilename}</option>)}</select></label>
          {cursor && <button className="btn-secondary" disabled={busy} onClick={() => void run(() => loadSources(cursor))}>Tải thêm tài liệu</button>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />Tôi xác nhận tài liệu được phép chia sẻ trong tổ chức và gửi trích đoạn tới nhà cung cấp AI đang cấu hình, kể cả khi dùng dịch vụ đám mây.</label>
          <button className="btn-primary" disabled={busy || !fileId || !consent} onClick={() => void run(async () => { await aiActions.index(organizationId, fileId); await loadSources(); if (alive.current) setConsent(false); })}>Đưa PDF vào kho tri thức</button>
        </>}
        {busy && <p role="status">Đang xử lý…</p>}
        {!busy && !sources.length && <p className="text-slate-500">Chưa có PDF trong kho tri thức.</p>}
        <ul className="divide-y">{sources.map(s => <li key={s.fileId} className="py-2 flex justify-between gap-3"><span>{s.filename} <span className="text-xs text-slate-500">({s.chunks} đoạn)</span></span>
          {hasPermission('file:upload') && <button className="text-red-600" disabled={busy} onClick={() => void run(async () => { await aiActions.remove(organizationId, s.fileId); await loadSources(); })}>Bỏ khỏi kho tri thức</button>}</li>)}</ul>
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </div>
    </Modal>
  </div>;
}
