// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DocumentsPage } from '@/features/documents/DocumentsPage';
import { EmployeeDocumentsCard } from '@/features/documents/EmployeeDocumentsCard';
import * as docsApi from '@/api/documents';
import * as employeesApi from '@/api/employees';
import * as deptsApi from '@/api/departments';

vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: () => ({
    currentOrg: { id: 'org-test-1', name: 'Test Org' },
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-admin-1', email: 'admin@test.local' },
  }),
}));

const mockSummary: docsApi.ComplianceSummary = {
  totalDocuments: 8,
  totalEmployees: 4,
  totalExpectedRequirements: 16,
  totalFulfilledRequirements: 12,
  complianceRate: 75.0,
  compliantEmployeesCount: 2,
  missingDocumentsCount: 4,
  expiringSoonCount: 1,
  expiredCount: 0,
};

const mockDocument: docsApi.EmployeeDocument = {
  id: 'doc-1',
  organizationId: 'org-test-1',
  employeeId: 'emp-1',
  title: 'Hợp đồng lao động 2026',
  documentNumber: 'HDLD-001',
  category: 'LABOR_CONTRACT',
  sensitivity: 'NORMAL',
  status: 'ACTIVE',
  issueDate: '2026-01-01',
  expiryDate: '2028-01-01',
  notes: 'HĐ chính thức',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  employee: {
    id: 'emp-1',
    employeeCode: 'EMP-001',
    displayName: 'Nguyễn Văn An',
    department: { id: 'dept-1', name: 'Kỹ thuật', code: 'TECH' },
  },
  versions: [
    {
      id: 'ver-1',
      versionNumber: 1,
      fileName: 'HDLD-NguyenVanAn.pdf',
      fileSize: 102400,
      contentType: 'application/pdf',
      changeSummary: 'Bản ký ban đầu',
      uploadedByUserId: 'user-admin-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

const mockRequirements: docsApi.DocumentRequirement[] = [
  {
    id: 'req-1',
    organizationId: 'org-test-1',
    category: 'LABOR_CONTRACT',
    name: 'Hợp đồng lao động',
    description: 'Bắt buộc với mọi nhân sự',
    isRequired: true,
    applicableDepartmentId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('Documents & HR Compliance Management (TASK 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(docsApi, 'getComplianceSummary').mockResolvedValue(mockSummary);
    vi.spyOn(docsApi, 'listDocuments').mockResolvedValue({ items: [mockDocument], nextCursor: null, total: 1 });
    vi.spyOn(docsApi, 'getDepartmentCompliance').mockResolvedValue([
      { departmentId: 'dept-1', departmentName: 'Kỹ thuật', departmentCode: 'TECH', totalEmployees: 4, compliantEmployees: 2, complianceRate: 75.0, missingCount: 2 },
    ]);
    vi.spyOn(docsApi, 'getMissingDocuments').mockResolvedValue([
      { employeeId: 'emp-2', employeeCode: 'EMP-002', displayName: 'Trần Minh Anh', departmentName: 'Kỹ thuật', category: 'CERTIFICATE', requirementName: 'Bằng cấp chuyên môn' },
    ]);
    vi.spyOn(docsApi, 'getExpiringDocuments').mockResolvedValue([
      { id: 'doc-exp-1', title: 'Chứng chỉ AWS', category: 'CERTIFICATE', sensitivity: 'NORMAL', status: 'ACTIVE', isExpired: false, daysRemaining: 15, expiryDate: '2026-10-01' },
    ]);
    vi.spyOn(docsApi, 'listRequirements').mockResolvedValue(mockRequirements);
    vi.spyOn(employeesApi, 'listEmployees').mockResolvedValue({
      items: [{
        id: 'emp-1',
        organizationId: 'org-test-1',
        userId: 'user-admin-1',
        employeeCode: 'EMP-001',
        displayName: 'Nguyễn Văn An',
        jobTitle: 'Kỹ sư phần mềm',
        departmentId: 'dept-1',
        phone: '+84901234567',
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      }],
      nextCursor: null,
    });
    vi.spyOn(deptsApi, 'listDepartments').mockResolvedValue({
      items: [{
        id: 'dept-1',
        organizationId: 'org-test-1',
        code: 'TECH',
        name: 'Kỹ thuật',
        description: 'Bộ phận Kỹ thuật',
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      }],
      nextCursor: null,
    });
  });

  it('renders DocumentsPage header, summary KPI cards, and documents list', async () => {
    render(
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Hồ sơ & Tuân thủ Pháp lý')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('Hợp đồng lao động 2026')).toBeInTheDocument();
      expect(screen.getByText('HDLD-001')).toBeInTheDocument();
    });
  });

  it('switches between tabs and displays compliance breakdown and missing documents', async () => {
    render(
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Hợp đồng lao động 2026')).toBeInTheDocument();
    });

    // Click on "Tuân thủ & Hồ sơ còn thiếu" tab
    const complianceTab = screen.getByText(/Tuân thủ & Hồ sơ còn thiếu/);
    fireEvent.click(complianceTab);

    await waitFor(() => {
      expect(screen.getByText('Tiến độ tuân thủ theo Phòng ban')).toBeInTheDocument();
      expect(screen.getByText('Bằng cấp chuyên môn')).toBeInTheDocument();
    });

    // Click on "Hết hạn & Sắp hết hạn" tab
    const expiringTab = screen.getByText(/Hết hạn & Sắp hết hạn/);
    fireEvent.click(expiringTab);

    await waitFor(() => {
      expect(screen.getByText('Chứng chỉ AWS')).toBeInTheDocument();
      expect(screen.getByText('Còn 15 ngày')).toBeInTheDocument();
    });
  });

  it('opens DocumentDetailModal with multi-version history when clicking a document', async () => {
    render(
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Hợp đồng lao động 2026')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Hợp đồng lao động 2026'));

    await waitFor(() => {
      expect(screen.getByText('Chi tiết tài liệu')).toBeInTheDocument();
      expect(screen.getByText('Bản ký ban đầu')).toBeInTheDocument();
    });
  });

  it('renders EmployeeDocumentsCard in employee profile view with compliance badge', async () => {
    vi.spyOn(docsApi, 'getEmployeeCompliance').mockResolvedValue({
      employeeId: 'emp-1',
      totalRequired: 4,
      totalFulfilled: 3,
      complianceRate: 75.0,
      isCompliant: false,
      missingRequirements: [mockRequirements[0]],
      documents: [mockDocument],
    });

    render(
      <MemoryRouter>
        <EmployeeDocumentsCard employeeId="emp-1" canManage={true} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Hồ sơ & Tuân thủ pháp lý')).toBeInTheDocument();
      expect(screen.getByText(/75% Tuân thủ/)).toBeInTheDocument();
      expect(screen.getByText('Hợp đồng lao động 2026')).toBeInTheDocument();
    });
  });
});
