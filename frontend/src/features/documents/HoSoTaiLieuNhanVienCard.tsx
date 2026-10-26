// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Shield,
  ExternalLink,
  Plus,
} from 'lucide-react';
import {
  EmployeeDocument,
  EmployeeComplianceProfile,
  getEmployeeCompliance,
  getDocumentDownloadUrl,
} from '@/api/documents';
import { DocumentUploadModal } from './DocumentUploadModal';
import { DocumentDetailModal } from './DocumentDetailModal';
import { useOrganization } from '@/contexts/OrganizationContext';
import { format } from 'date-fns';

interface EmployeeDocumentsCardProps {
  employeeId: string;
  canManage?: boolean;
}

const CATEGORY_NAMES: Record<string, string> = {
  LABOR_CONTRACT: 'HĐ Lao động',
  IDENTIFICATION: 'CCCD / Hộ chiếu',
  CERTIFICATE: 'Chứng chỉ / Bằng cấp',
  TRAINING: 'Đào tạo',
  INSURANCE: 'Bảo hiểm & Y tế',
  DECISION: 'Quyết định',
  HR_RECORD: 'Hồ sơ nhân sự',
  OTHER: 'Khác',
};

export function EmployeeDocumentsCard({
  employeeId,
  canManage = true,
}: EmployeeDocumentsCardProps) {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id;

  const [profile, setProfile] = useState<EmployeeComplianceProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<EmployeeDocument | null>(null);
  const [targetVersionDoc, setTargetVersionDoc] = useState<EmployeeDocument | null>(null);

  const loadData = useCallback(async () => {
    if (!orgId || !employeeId) return;
    setIsLoading(true);
    try {
      const data = await getEmployeeCompliance(orgId, employeeId);
      setProfile(data);
    } catch {
      // safe fallback
    } finally {
      setIsLoading(false);
    }
  }, [orgId, employeeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!orgId) return null;

  const now = new Date();

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-brand-600" />
            Hồ sơ & Tuân thủ pháp lý
          </h4>
          {profile && (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                profile.isCompliant
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {profile.complianceRate}% Tuân thủ ({profile.totalFulfilled}/{profile.totalRequired})
            </span>
          )}
        </div>

        {canManage && (
          <button
            onClick={() => {
              setTargetVersionDoc(null);
              setIsUploadOpen(true);
            }}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Thêm hồ sơ</span>
          </button>
        )}
      </div>

      {/* Missing documents warning banner */}
      {profile && profile.missingRequirements.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-xs text-amber-800 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>Còn thiếu {profile.missingRequirements.length} tài liệu bắt buộc:</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {profile.missingRequirements.map((req) => (
              <span
                key={req.id}
                className="px-2 py-0.5 rounded bg-white text-amber-900 border border-amber-300 font-medium text-[11px]"
              >
                {req.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Document list */}
      {isLoading ? (
        <div className="py-6 text-center text-xs text-slate-400 animate-pulse">
          Đang tải danh sách hồ sơ...
        </div>
      ) : !profile || profile.documents.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-2">
          Chưa có hồ sơ hoặc tài liệu nào được tải lên cho nhân viên này.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
          {profile.documents.map((doc) => {
            const isExpired = doc.expiryDate && new Date(doc.expiryDate) < now;
            const currentV = doc.versions?.[0];

            return (
              <div
                key={doc.id}
                className="py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/80 px-2 rounded-lg transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedDoc(doc)}
                      className="font-medium text-slate-900 hover:text-brand-600 truncate text-left"
                    >
                      {doc.title}
                    </button>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                      {CATEGORY_NAMES[doc.category] || doc.category}
                    </span>
                    {doc.sensitivity === 'SENSITIVE' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-50 text-red-600 font-semibold flex items-center gap-0.5">
                        <Shield className="h-2.5 w-2.5" />
                        Bảo mật
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400">
                    <span>Phiên bản: v{currentV?.versionNumber || 1}</span>
                    {doc.expiryDate && (
                      <span className={isExpired ? 'text-red-500 font-medium' : ''}>
                        Hạn: {format(new Date(doc.expiryDate), 'dd/MM/yyyy')} {isExpired && '(Hết hạn)'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={getDocumentDownloadUrl(orgId, doc.id)}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-brand-600"
                    title="Tải tệp"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={() => setSelectedDoc(doc)}
                    className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-800"
                    title="Xem chi tiết"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <DocumentUploadModal
        open={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={loadData}
        employees={[]}
        defaultEmployeeId={employeeId}
        targetDocument={targetVersionDoc}
      />

      <DocumentDetailModal
        document={selectedDoc}
        open={Boolean(selectedDoc)}
        onClose={() => setSelectedDoc(null)}
        onUploadNewVersion={(doc) => {
          setSelectedDoc(null);
          setTargetVersionDoc(doc);
          setIsUploadOpen(true);
        }}
        onRefresh={loadData}
      />
    </div>
  );
}
