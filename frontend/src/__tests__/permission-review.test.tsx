// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationPage } from '@/features/automation/TuDongHoa';
import { WorkflowsPage } from '@/features/workflows/QuyTrinhLamViec';
import { canOpenRoute } from '@/components/layout/navigation';

const state = vi.hoisted(() => ({ grants: ['automation:read', 'workflow:read'] }));
vi.mock('@/contexts/OrganizationContext', () => ({ useOrganization: () => ({ currentOrg: { id: 'org-1' } }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ hasPermission: (p: string) => state.grants.includes(p), hasAnyPermission: (...p: string[]) => p.some(x => state.grants.includes(x)), permissions: state.grants, isLoading: false, error: null }) }));
vi.mock('@/api/automation', () => ({ automationApi: { listRules: vi.fn().mockResolvedValue([]), listExecutions: vi.fn().mockResolvedValue([]), runScan: vi.fn() } }));
vi.mock('@/api/workflows', () => ({ workflowsApi: { listDefinitions: vi.fn().mockResolvedValue([{ id: 'definition', name: 'Test', steps: [], isActive: true }]), listInstances: vi.fn().mockResolvedValue([]) } }));

describe('Permission review regressions', () => {
  beforeEach(() => { state.grants = ['automation:read', 'workflow:read']; });
  it('does not allow a read-only automation operator to run a scan', async () => {
    render(<MemoryRouter><AutomationPage /></MemoryRouter>);
    expect(await screen.findByTestId('btn-run-automation-scan')).toBeDisabled();
  });
  it('does not offer workflow creation to a read-only viewer', async () => {
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await screen.findByTestId('workflows-page');
    expect(screen.queryByTestId('btn-start-demo-workflow')).not.toBeInTheDocument();
  });
  it('supports the backend workflow manager read fallback without granting unrelated routes', () => {
    const grants = (p: string) => p === 'workflow:manage';
    expect(canOpenRoute('/workflows', grants)).toBe(true);
    expect(canOpenRoute('/payroll', grants)).toBe(false);
  });
});
