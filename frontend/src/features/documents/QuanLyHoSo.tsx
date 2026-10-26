// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Upload,
  Download,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Shield,
  FileCheck,
  RotateCcw,
  Archive,
  Eye,
  Plus,
  Trash2,
  Layers,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  Bot,
  Sparkles,
} from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { listEmployees } from '@/api/employees';
import { listDepartments } from '@/api/departments';
import {
  EmployeeDocument,
  ComplianceSummary,
  DepartmentCompliance,
  MissingDocumentItem,
  ExpiringDocumentItem,
  DocumentRequirement,
  DocumentCategory,
  DocumentSensitivity,
  DocumentStatus,
  listDocuments,
  getComplianceSummary,
  getDepartmentCompliance,
  getMissingDocuments,
  getExpiringDocuments,
  listRequirements,
  createRequirement,
  deleteRequirement,
  getDocumentDownloadUrl,
  archiveDocument,
  restoreDocument,
  deleteDocument,
} from '@/api/documents';
import { DocumentUploadModal } from './DocumentUploadModal';
import { DocumentDetailModal } from './DocumentDetailModal';
import type { Employee, Department } from '@/api/types';
import { format } from 'date-fns';

type TabKey = 'all' | 'expiring' | 'compliance' | 'requirements';

const CATEGORY_MAP: Record<DocumentCategory, { label: string; bg: string; text: string }> = {
  LABOR_CONTRACT: { label: 'Hợp đồng LĐ', bg: 'bg-blue-50', text: 'text-blue-700' },
  IDENTIFICATION: { label: 'CCCD / Hộ chiếu', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  CERTIFICATE: { label: 'Chứng chỉ / Bằng cấp', bg: 'bg-purple-50', text: 'text-purple-700' },
  TRAINING: { label: 'Đào tạo', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  INSURANCE: { label: 'Bảo hiểm & Y tế', bg: 'bg-cyan-50', text: 'text-cyan-700' },
  DECISION: { label: 'Quyết định', bg: 'bg-amber-50', text: 'text-amber-700' },
  HR_RECORD: { label: 'Hồ sơ nhân sự', bg: 'bg-slate-100', text: 'text-slate-700' },
  OTHER: { label: 'Khác', bg: 'bg-slate-100', text: 'text-slate-600' },
};

export function DocumentsPage() {
  const { currentOrg } = useOrganization();
  const { user } = useAuth();
  const orgId = currentOrg?.id;

  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Data states
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [deptCompliance, setDeptCompliance] = useState<DepartmentCompliance[]>([]);
  const [missingDocs, setMissingDocs] = useState<MissingDocumentItem[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<ExpiringDocumentItem[]>([]);
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedSensitivity, setSelectedSensitivity] = useState<string>('ALL');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('ALL');
  const [myDocumentsOnly, setMyDocumentsOnly] = useState(false);

  // Loading
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<EmployeeDocument | null>(null);
  const [targetVersionDoc, setTargetVersionDoc] = useState<EmployeeDocument | null>(null);
  const [defaultUploadEmployee, setDefaultUploadEmployee] = useState<string | undefined>(undefined);
  const [defaultUploadCategory, setDefaultUploadCategory] = useState<DocumentCategory | undefined>(undefined);

  // Requirements Modal Form
  const [isAddReqOpen, setIsAddReqOpen] = useState(false);
  const [reqName, setReqName] = useState('');
  const [reqCategory, setReqCategory] = useState<DocumentCategory>('LABOR_CONTRACT');
  const [reqDesc, setReqDesc] = useState('');
  const [reqDept, setReqDept] = useState('');
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);

  // Load initial reference data
  useEffect(() => {
    if (!orgId) return;
    listEmployees(orgId, { limit: 100 }).then((res: { items: Employee[] }) => setEmployees(res.items)).catch(() => {});
    listDepartments(orgId).then((res) => setDepartments(res.items)).catch(() => {});
  }, [orgId]);

  const loadAllData = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const [sum, docsRes, deptRes, missingRes, expiringRes, reqsRes] = await Promise.all([
        getComplianceSummary(orgId).catch(() => null),
        listDocuments(orgId, { limit: 100 }).catch(() => ({ items: [], total: 0 })),
        getDepartmentCompliance(orgId).catch(() => []),
        getMissingDocuments(orgId).catch(() => []),
        getExpiringDocuments(orgId).catch(() => []),
        listRequirements(orgId).catch(() => []),
      ]);

      if (sum) setSummary(sum);
      if (docsRes?.items) setDocuments(docsRes.items);
      setDeptCompliance(deptRes);
      setMissingDocs(missingRes);
      setExpiringDocs(expiringRes);
      setRequirements(reqsRes);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Current user's employee record
  const currentEmployee = useMemo(() => {
    return employees.find((e) => e.userId === user?.id);
  }, [employees, user?.id]);

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (myDocumentsOnly && currentEmployee && doc.employeeId !== currentEmployee.id) {
        return false;
      }
      if (selectedEmployeeId !== 'ALL' && doc.employeeId !== selectedEmployeeId) {
        return false;
      }
      if (selectedCategory !== 'ALL' && doc.category !== selectedCategory) {
        return false;
      }
      if (selectedStatus !== 'ALL' && doc.status !== selectedStatus) {
        return false;
      }
      if (selectedSensitivity !== 'ALL' && doc.sensitivity !== selectedSensitivity) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const titleMatch = doc.title.toLowerCase().includes(q);
        const codeMatch = doc.documentNumber?.toLowerCase().includes(q);
        const empMatch = doc.employee?.displayName.toLowerCase().includes(q);
        if (!titleMatch && !codeMatch && !empMatch) return false;
      }
      return true;
    });
  }, [documents, myDocumentsOnly, currentEmployee, selectedEmployeeId, selectedCategory, selectedStatus, selectedSensitivity, search]);

  const handleAddRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !reqName.trim()) return;
    setIsSubmittingReq(true);
    try {
      await createRequirement(orgId, {
        category: reqCategory,
        name: reqName.trim(),
        description: reqDesc.trim() || undefined,
        applicableDepartmentId: reqDept || undefined,
        isRequired: true,
      });
      setIsAddReqOpen(false);
      setReqName('');
      setReqDesc('');
      setReqDept('');
      loadAllData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingReq(false);
    }
  };

  const handleDeleteReq = async (id: string) => {
    if (!orgId || !window.confirm('Bạn có chắc chắn muốn xóa quy định này?')) return;
    try {
      await deleteRequirement(orgId, id);
      loadAllData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleArchive = async (doc: EmployeeDocument) => {
    if (!orgId) return;
    try {
      if (doc.status === 'ARCHIVED') {
        await restoreDocument(orgId, doc.id);
      } else {
        await archiveDocument(orgId, doc.id);
      }
      loadAllData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (doc: EmployeeDocument) => {
    if (!orgId || !window.confirm('Xóa tài liệu này?')) return;
    try {
      await deleteDocument(orgId, doc.id);
      loadAllData();
    } catch (err) {
      console.error(err);
    }
  };

  const now = new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-sm">
              <FileCheck className="h-5 w-5" />
            </div>
            <span>Hồ sơ & Tuân thủ Pháp lý</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản trị hợp đồng lao động, chứng chỉ, giấy tờ tùy thân & kiểm soát rủi ro tuân thủ
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setTargetVersionDoc(null);
              setDefaultUploadEmployee(undefined);
              setDefaultUploadCategory(undefined);
              setIsUploadOpen(true);
            }}
            className="btn-primary text-xs inline-flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Tải lên tài liệu</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Documents */}
        <div className="card p-4 flex items-center gap-3.5 border-slate-200">
          <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {summary ? summary.totalDocuments : '...'}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">Tổng số tài liệu lưu trữ</div>
          </div>
        </div>

        {/* Compliance Rate */}
        <div className="card p-4 flex items-center gap-3.5 border-slate-200">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-black text-emerald-600">
                {summary ? `${summary.complianceRate}%` : '...'}
              </div>
              <span className="text-[11px] text-slate-400">
                {summary ? `${summary.compliantEmployeesCount}/${summary.totalEmployees} NV` : ''}
              </span>
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">Tỷ lệ tuân thủ hồ sơ</div>
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="card p-4 flex items-center gap-3.5 border-slate-200">
          <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-amber-600">
              {summary ? summary.expiringSoonCount : '...'}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">Sắp hết hạn (trong 30 ngày)</div>
          </div>
        </div>

        {/* Missing Documents */}
        <div className="card p-4 flex items-center gap-3.5 border-slate-200">
          <div className="h-12 w-12 rounded-xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-red-600">
              {summary ? summary.missingDocumentsCount : '...'}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-0.5">Hồ sơ bắt buộc còn thiếu</div>
          </div>
        </div>
      </div>

      {/* AI Compliance & Risk Assistant */}
      <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-white dark:border-blue-900/60 dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900 p-4 shadow-sm" data-testid="ai-compliance-panel">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Trợ lý Phân tích Tuân thủ (Compliance AI Assistant)</span>
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                  Rà soát tự động
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-3xl">
                Hệ thống giám sát tuân thủ tự động theo dõi toàn bộ hồ sơ nhân sự của tổ chức.
                {summary && summary.expiringSoonCount > 0 && (
                  <span> Hiện có <strong>{summary.expiringSoonCount} hợp đồng/chứng chỉ</strong> sắp hết hạn trong 30 ngày tới cần xử lý.</span>
                )}
                {summary && summary.missingDocumentsCount > 0 && (
                  <span> Ghi nhận <strong>{summary.missingDocumentsCount} hồ sơ bắt buộc</strong> còn thiếu theo tiêu chuẩn công ty.</span>
                )}
                <span> Quy trình tự động hóa nhân sự (HR Automation) và quy trình phê duyệt gia hạn (Intelligent Workflows) đã sẵn sàng để xử lý các hồ sơ này an toàn.</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <Link
              to="/workflows"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition-colors"
            >
              Xem quy trình ({summary?.expiringSoonCount || 0})
            </Link>
            <Link
              to="/automation"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Cấu hình tự động
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'all'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Tất cả hồ sơ ({documents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('expiring')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'expiring'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Hết hạn & Sắp hết hạn</span>
            {summary && (summary.expiringSoonCount > 0 || summary.expiredCount > 0) && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                {summary.expiringSoonCount + summary.expiredCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('compliance')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'compliance'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Tuân thủ & Hồ sơ còn thiếu</span>
            {missingDocs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                {missingDocs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('requirements')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'requirements'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>Quy định hồ sơ ({requirements.length})</span>
          </button>
        </nav>
      </div>

      {/* Tab 1: All Documents */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="card p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên tài liệu, mã số, nhân viên..."
                  className="input pl-9 text-xs w-full"
                />
              </div>

              {currentEmployee && (
                <button
                  onClick={() => setMyDocumentsOnly(!myDocumentsOnly)}
                  className={`btn-secondary text-xs inline-flex items-center gap-1.5 shrink-0 ${
                    myDocumentsOnly ? 'bg-brand-50 border-brand-300 text-brand-700 font-semibold' : ''
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>{myDocumentsOnly ? 'Đang lọc: Hồ sơ của tôi' : 'Hồ sơ của tôi'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-100">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Nhân viên</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="input text-xs w-full py-1.5"
                >
                  <option value="ALL">Tất cả nhân viên</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Danh mục</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="input text-xs w-full py-1.5"
                >
                  <option value="ALL">Tất cả danh mục</option>
                  {Object.entries(CATEGORY_MAP).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Bảo mật</label>
                <select
                  value={selectedSensitivity}
                  onChange={(e) => setSelectedSensitivity(e.target.value)}
                  className="input text-xs w-full py-1.5"
                >
                  <option value="ALL">Tất cả mức độ</option>
                  <option value="NORMAL">Thông thường</option>
                  <option value="SENSITIVE">Bảo mật cao (Sensitive)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Trạng thái</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="input text-xs w-full py-1.5"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ACTIVE">Còn hiệu lực</option>
                  <option value="ARCHIVED">Đã lưu trữ</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                    <th className="py-3 px-4">Tài liệu & Số hiệu</th>
                    <th className="py-3 px-4">Nhân sự</th>
                    <th className="py-3 px-4">Danh mục</th>
                    <th className="py-3 px-4">Độ bảo mật</th>
                    <th className="py-3 px-4">Phiên bản</th>
                    <th className="py-3 px-4">Hạn hiệu lực</th>
                    <th className="py-3 px-4">Trạng thái</th>
                    <th className="py-3 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Đang tải danh sách hồ sơ...
                      </td>
                    </tr>
                  ) : filteredDocuments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Không tìm thấy tài liệu phù hợp với điều kiện tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    filteredDocuments.map((doc) => {
                      const isExpired = doc.expiryDate && new Date(doc.expiryDate) < now;
                      const in30Days = new Date();
                      in30Days.setDate(in30Days.getDate() + 30);
                      const isExpiringSoon =
                        doc.expiryDate &&
                        new Date(doc.expiryDate) >= now &&
                        new Date(doc.expiryDate) <= in30Days;
                      const currentV = doc.versions?.[0];
                      const catInfo = CATEGORY_MAP[doc.category] || CATEGORY_MAP.OTHER;

                      return (
                        <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <button
                              onClick={() => setSelectedDoc(doc)}
                              className="font-bold text-slate-900 hover:text-brand-600 block text-left"
                            >
                              {doc.title}
                            </button>
                            {doc.documentNumber && (
                              <span className="text-[11px] font-mono text-slate-400">
                                {doc.documentNumber}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">
                              {doc.employee?.displayName || 'N/A'}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {doc.employee?.department?.name || 'Chưa gán'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${catInfo.bg} ${catInfo.text}`}
                            >
                              {catInfo.label}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {doc.sensitivity === 'SENSITIVE' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 inline-flex items-center gap-1">
                                <Shield className="h-2.5 w-2.5" />
                                Bảo mật
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Thông thường</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                              v{currentV?.versionNumber || 1}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {doc.expiryDate ? (
                              <span
                                className={`text-[11px] font-medium ${
                                  isExpired
                                    ? 'text-red-600 font-bold'
                                    : isExpiringSoon
                                    ? 'text-amber-600 font-bold'
                                    : 'text-slate-700'
                                }`}
                              >
                                {format(new Date(doc.expiryDate), 'dd/MM/yyyy')}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Vô thời hạn</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {doc.status === 'ARCHIVED' ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                Lưu trữ
                              </span>
                            ) : isExpired ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
                                Hết hạn
                              </span>
                            ) : isExpiringSoon ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                Sắp hết hạn
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Hoạt động
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {orgId && (
                                <a
                                  href={getDocumentDownloadUrl(orgId, doc.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  download
                                  className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-brand-600"
                                  title="Tải tệp tin"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              )}
                              <button
                                onClick={() => setSelectedDoc(doc)}
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                                title="Xem chi tiết & Lịch sử phiên bản"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setTargetVersionDoc(doc);
                                  setIsUploadOpen(true);
                                }}
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-brand-600"
                                title="Tải phiên bản mới"
                              >
                                <Upload className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Expiring & Expired */}
      {activeTab === 'expiring' && (
        <div className="space-y-4">
          <div className="card p-4 bg-amber-50/40 border-amber-200">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-amber-900">Cảnh báo hiệu lực tài liệu</h3>
                <p className="text-xs text-amber-700 mt-0.5">
                  Danh sách hợp đồng lao động, chứng chỉ, hồ sơ y tế đã hết hạn hoặc sắp hết hạn trong 30 ngày tới. Vui lòng tiến hành gia hạn hoặc ký phụ lục hợp đồng kịp thời.
                </p>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Tài liệu</th>
                  <th className="py-3 px-4">Nhân sự</th>
                  <th className="py-3 px-4">Phòng ban</th>
                  <th className="py-3 px-4">Danh mục</th>
                  <th className="py-3 px-4">Ngày hết hạn</th>
                  <th className="py-3 px-4">Thời gian còn lại</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expiringDocs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Không có tài liệu nào sắp hết hạn hoặc đã hết hạn!
                    </td>
                  </tr>
                ) : (
                  expiringDocs.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{item.title}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {item.employee?.displayName}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {item.employee?.department?.name || 'N/A'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {CATEGORY_MAP[item.category]?.label || item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {item.expiryDate ? format(new Date(item.expiryDate), 'dd/MM/yyyy') : 'N/A'}
                      </td>
                      <td className="py-3 px-4">
                        {item.isExpired ? (
                          <span className="px-2 py-0.5 rounded font-bold bg-red-100 text-red-800 text-[11px]">
                            Quá hạn {Math.abs(item.daysRemaining)} ngày
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 text-[11px]">
                            Còn {item.daysRemaining} ngày
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            const fullDoc = documents.find((d) => d.id === item.id);
                            if (fullDoc) {
                              setTargetVersionDoc(fullDoc);
                              setIsUploadOpen(true);
                            }
                          }}
                          className="btn-secondary text-[11px] py-1 px-2.5 inline-flex items-center gap-1"
                        >
                          <Upload className="h-3 w-3" />
                          <span>Gia hạn / Bản mới</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Compliance & Missing Documents */}
      {activeTab === 'compliance' && (
        <div className="space-y-6">
          {/* Department Breakdown */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-brand-600" />
              <span>Tiến độ tuân thủ theo Phòng ban</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {deptCompliance.map((dept) => (
                <div
                  key={dept.departmentId}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800">{dept.departmentName}</span>
                    <span className="font-mono text-xs font-bold text-brand-600">
                      {dept.complianceRate}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        dept.complianceRate >= 80
                          ? 'bg-emerald-500'
                          : dept.complianceRate >= 50
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${dept.complianceRate}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Đạt: {dept.compliantEmployees}/{dept.totalEmployees} nhân sự
                    </span>
                    <span>Thiếu: {dept.missingCount} tài liệu</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Missing Documents Table */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span>Danh sách hồ sơ còn thiếu ({missingDocs.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Các nhân sự chưa nộp đủ tài liệu bắt buộc theo quy định công ty
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                    <th className="py-3 px-4">Nhân sự</th>
                    <th className="py-3 px-4">Phòng ban</th>
                    <th className="py-3 px-4">Tài liệu bắt buộc còn thiếu</th>
                    <th className="py-3 px-4">Danh mục</th>
                    <th className="py-3 px-4 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {missingDocs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        Tuyệt vời! 100% nhân viên đã nộp đầy đủ các tài liệu bắt buộc.
                      </td>
                    </tr>
                  ) : (
                    missingDocs.map((item, idx) => (
                      <tr key={`${item.employeeId}-${item.category}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{item.displayName}</div>
                          <div className="text-[11px] font-mono text-slate-400">{item.employeeCode}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{item.departmentName}</td>
                        <td className="py-3 px-4 font-semibold text-red-600 flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          <span>{item.requirementName}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {CATEGORY_MAP[item.category]?.label || item.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setTargetVersionDoc(null);
                              setDefaultUploadEmployee(item.employeeId);
                              setDefaultUploadCategory(item.category);
                              setIsUploadOpen(true);
                            }}
                            className="btn-primary text-[11px] py-1 px-2.5 inline-flex items-center gap-1"
                          >
                            <Upload className="h-3 w-3" />
                            <span>Tải lên ngay</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Requirements */}
      {activeTab === 'requirements' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Quy định Hồ sơ Bắt buộc</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Các loại tài liệu nhân viên phải hoàn thiện để đảm bảo tuân thủ pháp luật lao động và quy chế nội bộ
              </p>
            </div>
            <button
              onClick={() => setIsAddReqOpen(true)}
              className="btn-primary text-xs inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Thêm quy định</span>
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Tên quy định / Tài liệu</th>
                  <th className="py-3 px-4">Danh mục</th>
                  <th className="py-3 px-4">Áp dụng cho phòng ban</th>
                  <th className="py-3 px-4">Bắt buộc</th>
                  <th className="py-3 px-4">Mô tả</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requirements.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{req.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                        {CATEGORY_MAP[req.category]?.label || req.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {req.department?.name || 'Tất cả phòng ban'}
                    </td>
                    <td className="py-3 px-4">
                      {req.isRequired ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Bắt buộc
                        </span>
                      ) : (
                        <span className="text-slate-400">Tùy chọn</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-[250px] truncate">
                      {req.description || 'Không có mô tả'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteReq(req.id)}
                        className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Xóa quy định"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <DocumentUploadModal
        open={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={loadAllData}
        employees={employees}
        defaultEmployeeId={defaultUploadEmployee}
        defaultCategory={defaultUploadCategory}
        targetDocument={targetVersionDoc}
      />

      {/* Detail Modal */}
      <DocumentDetailModal
        document={selectedDoc}
        open={Boolean(selectedDoc)}
        onClose={() => setSelectedDoc(null)}
        onUploadNewVersion={(doc) => {
          setSelectedDoc(null);
          setTargetVersionDoc(doc);
          setIsUploadOpen(true);
        }}
        onRefresh={loadAllData}
      />

      {/* Add Requirement Modal */}
      {isAddReqOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="card p-5 max-w-md w-full bg-white space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Thêm quy định hồ sơ mới</h3>
              <button
                onClick={() => setIsAddReqOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddRequirement} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tên quy định *</label>
                <input
                  type="text"
                  required
                  value={reqName}
                  onChange={(e) => setReqName(e.target.value)}
                  placeholder="VD: Chứng chỉ an toàn lao động"
                  className="input text-xs w-full"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Danh mục hồ sơ *</label>
                <select
                  value={reqCategory}
                  onChange={(e) => setReqCategory(e.target.value as DocumentCategory)}
                  className="input text-xs w-full"
                >
                  {Object.entries(CATEGORY_MAP).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Phòng ban áp dụng</label>
                <select
                  value={reqDept}
                  onChange={(e) => setReqDept(e.target.value)}
                  className="input text-xs w-full"
                >
                  <option value="">Tất cả phòng ban</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Mô tả yêu cầu</label>
                <textarea
                  rows={2}
                  value={reqDesc}
                  onChange={(e) => setReqDesc(e.target.value)}
                  placeholder="Mô tả chi tiết yêu cầu nộp hồ sơ..."
                  className="input text-xs w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddReqOpen(false)}
                  className="btn-secondary text-xs"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReq || !reqName.trim()}
                  className="btn-primary text-xs"
                >
                  {isSubmittingReq ? 'Đang lưu...' : 'Lưu quy định'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
