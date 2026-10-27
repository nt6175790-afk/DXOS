// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ permissions: new Set<string>(), listDefinitions: vi.fn(), listInstances: vi.fn(), startWorkflow: vi.fn(), confirmStep: vi.fn(), cancelWorkflow: vi.fn(), retry: vi.fn(), documents: vi.fn() }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: (p: string) => state.permissions.has(p) }) }));
vi.mock('@/contexts/OrganizationContext', () => ({ useOrganization: () => ({ currentOrg: { id: 'org-a' } }) }));
vi.mock('@/api/workflows', () => ({ workflowsApi: state }));
vi.mock('@/api/documents', () => ({ listDocuments: state.documents }));
import { WorkflowsPage } from '@/features/workflows/QuyTrinhLamViec';
const definitions = [
  { id: 'task-def', name: 'Task approval', triggerType: 'TASK_REQUEST', isActive: true, steps: '[]' },
  { id: 'contract-def', name: 'Contract renewal', triggerType: 'CONTRACT_RENEWAL', isActive: true, steps: '[]' },
];
describe('workflow business action inputs', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.permissions = new Set(['workflow:read', 'workflow:create', 'workflow:update']);
    state.listDefinitions.mockResolvedValue(definitions); state.listInstances.mockResolvedValue([]);
    state.documents.mockResolvedValue({ items: [{ id: 'doc-a', title: 'Contract A', category: 'LABOR_CONTRACT' }], nextCursor: null });
    state.startWorkflow.mockResolvedValue({ id: 'new', title: 'New task', status: 'WAITING', startedAt: new Date().toISOString(), stepExecutions: [] });
  });
  it('asks for task input before starting and submits typed task data', async () => {
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>); fireEvent.click(await screen.findByRole('button', { name: 'Khởi chạy quy trình' }));
    expect(state.startWorkflow).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Tên quy trình / công việc'), { target: { value: 'New task' } }); fireEvent.click(screen.getByText('Bắt đầu quy trình'));
    await waitFor(() => expect(state.startWorkflow).toHaveBeenCalledWith('org-a', { workflowDefinitionId: 'task-def', title: 'New task', data: { task: { title: 'New task' } } }));
  });
  it('lets operator choose workflow and actual contract/date without UUID entry', async () => {
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>); fireEvent.click(await screen.findByRole('button', { name: 'Khởi chạy quy trình' }));
    fireEvent.change(screen.getByLabelText('Loại quy trình'), { target: { value: 'contract-def' } }); await screen.findByText('Contract A');
    fireEvent.change(screen.getByLabelText('Hồ sơ cần xử lý'), { target: { value: 'doc-a' } }); fireEvent.change(screen.getByLabelText('Ngày hết hạn mới'), { target: { value: '2027-12-31' } });
    fireEvent.click(screen.getByText('Bắt đầu quy trình'));
    await waitFor(() => expect(state.startWorkflow).toHaveBeenCalledWith('org-a', expect.objectContaining({ workflowDefinitionId: 'contract-def', data: { documentId: 'doc-a', newExpiryDate: '2027-12-31' } })));
  });
  it('does not offer workflow start to read-only operators', async () => {
    state.permissions = new Set(['workflow:read']); render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() => expect(state.listDefinitions).toHaveBeenCalled()); expect(screen.queryByRole('button', { name: 'Khởi chạy quy trình' })).not.toBeInTheDocument();
  });
});
