// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ permissions: new Set<string>(), propose: vi.fn(), confirm: vi.fn(), sources: vi.fn(), index: vi.fn(), remove: vi.fn(), files: vi.fn() }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: (p: string) => state.permissions.has(p) }) }));
vi.mock('@/api/ai-actions', () => ({ aiActions: state }));
vi.mock('@/api/files', () => ({ listFiles: state.files }));
import { AiActionsPanel } from '@/features/ai/AiActionsPanel';
const renderPanel = (org = 'tenant-a') => render(<MemoryRouter><AiActionsPanel key={org} organizationId={org} /></MemoryRouter>);
describe('AI explicit action boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.permissions = new Set(['task:create', 'file:read', 'file:upload']);
    state.propose.mockResolvedValue({ id: 'draft-a', task: { title: 'Prepared draft', priority: 'MEDIUM' }, expiresAt: '2026-11-01T00:00:00Z', provider: 'mock', requiresConfirmation: true });
    state.confirm.mockResolvedValue({ taskId: 'task-a', replayed: false }); state.sources.mockResolvedValue({ items: [] });
    state.files.mockResolvedValue({ items: [{ id: 'pdf-a', originalFilename: 'Guide.pdf', contentType: 'application/pdf' }], nextCursor: null });
    state.index.mockResolvedValue({});
  });
  it('hides unavailable capabilities and does not fetch before opening', () => {
    state.permissions.clear(); renderPanel(); expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(state.sources).not.toHaveBeenCalled();
  });
  it('keeps model suggestion read-only until explicit human confirmation and permits editing', async () => {
    renderPanel(); fireEvent.click(screen.getByText('Tạo việc bằng AI'));
    fireEvent.change(screen.getByLabelText('Mô tả công việc cho AI'), { target: { value: 'Prepare onboarding checklist' } });
    fireEvent.click(screen.getByText('Đề xuất bản nháp')); await screen.findByText(/Bản nháp mô phỏng/);
    expect(state.confirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Tiêu đề bản nháp'), { target: { value: 'Reviewed checklist' } });
    fireEvent.click(screen.getByText('Xác nhận tạo công việc'));
    await screen.findByText('Đã tạo công việc.'); expect(state.confirm).toHaveBeenCalledWith('tenant-a', 'draft-a', expect.objectContaining({ title: 'Reviewed checklist' }));
    expect(screen.getByText('Mở công việc')).toHaveAttribute('href', '/tasks/task-a'); expect(state.confirm).toHaveBeenCalledTimes(1);
  });
  it('does not index PDF before explicit sharing consent', async () => {
    renderPanel(); fireEvent.click(screen.getByText('Kho tri thức PDF')); await screen.findByText('Guide.pdf');
    fireEvent.change(screen.getByLabelText('PDF để lập chỉ mục'), { target: { value: 'pdf-a' } });
    expect(screen.getByText('Đưa PDF vào kho tri thức')).toBeDisabled(); expect(state.index).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Đưa PDF vào kho tri thức'));
    await waitFor(() => expect(state.index).toHaveBeenCalledWith('tenant-a', 'pdf-a'));
  });
  it('shows safe failure and never displays raw provider error contents', async () => {
    state.propose.mockRejectedValue(new Error('fixture-secret-provider-diagnostic')); renderPanel(); fireEvent.click(screen.getByText('Tạo việc bằng AI'));
    fireEvent.change(screen.getByLabelText('Mô tả công việc cho AI'), { target: { value: 'Prepare checklist' } }); fireEvent.click(screen.getByText('Đề xuất bản nháp'));
    await screen.findByRole('alert'); expect(screen.queryByText(/fixture-secret/)).not.toBeInTheDocument(); expect(state.confirm).not.toHaveBeenCalled();
  });
  it('discarded tenant component cannot display old pending draft in new tenant', async () => {
    let resolve!: (v: unknown) => void; state.propose.mockReturnValue(new Promise(r => { resolve = r; }));
    const view = renderPanel(); fireEvent.click(screen.getByText('Tạo việc bằng AI')); fireEvent.change(screen.getByLabelText('Mô tả công việc cho AI'), { target: { value: 'Old tenant request' } }); fireEvent.click(screen.getByText('Đề xuất bản nháp'));
    view.rerender(<MemoryRouter><AiActionsPanel key="tenant-b" organizationId="tenant-b" /></MemoryRouter>);
    await act(async () => resolve({ id: 'old', task: { title: 'Old tenant private data' }, expiresAt: new Date().toISOString(), provider: 'mock' }));
    expect(screen.queryByText(/Old tenant private data/)).not.toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
