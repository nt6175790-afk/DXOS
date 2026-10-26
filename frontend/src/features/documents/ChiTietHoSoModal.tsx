// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Upload,
  Archive,
  RotateCcw,
  Trash2,
  Calendar,
  User,
  Building2,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  FileCheck,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import {
  EmployeeDocument,
  DocumentVersion,
  archiveDocument,
  restoreDocument,
  deleteDocument,
  getDocumentDownloadUrl,
  getDocument,
} from '@/api/documents';
import { useOrganization } from '@/contexts/OrganizationContext';
import { format } from 'date-fns';

interface DocumentDetailModalProps {
  document: EmployeeDocument | null;
  open: boolean;
  onClose: () => void;
  onUploadNewVersion: (doc: EmployeeDocument) => void;
  onRefresh: () => void;
}

const CATEGORY_NAMES: Record<string, string> = {
  LABOR_CONTRACT: 'Hợp đồng lao động',
  IDENTIFICATION: 'Căn cước / Hộ chiếu',
  CERTIFICATE: 'Bằng cấp & Chứng chỉ',
  TRAINING: 'Đào tạo & Huấn luyện',
  INSURANCE: 'Bảo hiểm & Y tế',
  DECISION: 'Quyết định',
  HR_RECORD: 'Hồ sơ nhân sự',
  OTHER: 'Khác',
};

export function DocumentDetailModal({
  document: initialDoc,
  open,
  onClose,
  onUploadNewVersion,
  onRefresh,
}: DocumentDetailModalProps) {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id;
  const [isActing, setIsActing] = useState(false);
  const [document, setDocument] = useState<EmployeeDocument | null>(initialDoc);

  useEffect(() => {
    setDocument(initialDoc);
    if (!orgId || !initialDoc?.id) return;
    getDocument(orgId, initialDoc.id)
      .then((res) => {
        if (res) setDocument(res);
      })
      .catch(() => {});
  }, [orgId, initialDoc]);

  if (!document) return null;

  const handleArchiveToggle = async () => {
    if (!orgId) return;
    setIsActing(true);
    try {
      if (document.status === 'ARCHIVED') {
        await restoreDocument(orgId, document.id);
      } else {
        await archiveDocument(orgId, document.id);
      }
      onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsActing(false);
    }
  };

  const handleDelete = async () => {
    if (!orgId || !window.confirm('Bạn có chắc chắn muốn xóa tài liệu này?')) return;
    setIsActing(true);
    try {
      await deleteDocument(orgId, document.id);
      onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsActing(false);
    }
  };

  const now = new Date();
  const isExpired = document.expiryDate && new Date(document.expiryDate) < now;
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const isExpiringSoon =
    document.expiryDate &&
    new Date(document.expiryDate) >= now &&
    new Date(document.expiryDate) <= in30Days;

  const currentVersion = document.versions?.[0];

  return (
    <Modal open={open} onClose={onClose} title="Chi tiết tài liệu" size="lg">
      <div className="space-y-6">
        {/* Header summary banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-start gap-3.5">
            <div className="h-12 w-12 rounded-xl bg-brand-50 text-brand-600 border border-brand-200 flex items-center justify-center shrink-0">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">{document.title}</h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {CATEGORY_NAMES[document.category] || document.category}
                </span>
                {document.sensitivity === 'SENSITIVE' ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Bảo mật
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                    Thông thường
                  </span>
                )}
                {document.status === 'ARCHIVED' ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Đã lưu trữ
                  </span>
                ) : isExpired ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                    Đã hết hạn
                  </span>
                ) : isExpiringSoon ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Sắp hết hạn
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Còn hiệu lực
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                {document.documentNumber && (
                  <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                    {document.documentNumber}
                  </span>
                )}
                <span>Cập nhật: {format(new Date(document.updatedAt), 'dd/MM/yyyy HH:mm')}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {orgId && (
              <a
                href={getDocumentDownloadUrl(orgId, document.id)}
                target="_blank"
                rel="noreferrer"
                download
                className="btn-primary text-xs inline-flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Tải tệp</span>
              </a>
            )}
            <button
              onClick={() => onUploadNewVersion(document)}
              className="btn-secondary text-xs inline-flex items-center gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Phiên bản mới</span>
            </button>
          </div>
        </div>

        {/* Metadata info grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Nhân viên sở hữu
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Họ và tên:
                </span>
                <span className="font-semibold text-slate-900">
                  {document.employee?.displayName || 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Mã nhân viên:</span>
                <span className="font-mono font-medium text-slate-700">
                  {document.employee?.employeeCode || 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  Phòng ban:
                </span>
                <span className="font-medium text-slate-700">
                  {document.employee?.department?.name || 'Chưa gán'}
                </span>
              </div>
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Thời hạn & Hiệu lực
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Ngày ban hành:
                </span>
                <span className="font-medium text-slate-800">
                  {document.issueDate ? format(new Date(document.issueDate), 'dd/MM/yyyy') : 'Chưa thiết lập'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  Ngày hết hạn:
                </span>
                <span className={`font-semibold ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-600' : 'text-slate-800'}`}>
                  {document.expiryDate ? format(new Date(document.expiryDate), 'dd/MM/yyyy') : 'Vô thời hạn'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Phiên bản hiện tại:</span>
                <span className="font-bold text-brand-600">v{currentVersion?.versionNumber || 1}</span>
              </div>
            </div>
          </div>
        </div>

        {document.notes && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <span className="font-semibold text-slate-700">Ghi chú:</span>{' '}
            <span className="text-slate-600">{document.notes}</span>
          </div>
        )}

        {/* Version History Table */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <History className="h-4 w-4 text-brand-600" />
              Lịch sử phiên bản ({document.versions?.length || 0})
            </h4>
            <button
              onClick={() => onUploadNewVersion(document)}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"
            >
              <span>+ Tải lên bản mới</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500">
                  <th className="py-2.5 px-3 font-semibold">Phiên bản</th>
                  <th className="py-2.5 px-3 font-semibold">Tên tệp</th>
                  <th className="py-2.5 px-3 font-semibold">Kích thước</th>
                  <th className="py-2.5 px-3 font-semibold">Nội dung thay đổi</th>
                  <th className="py-2.5 px-3 font-semibold">Ngày tải lên</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {document.versions?.map((v, idx) => (
                  <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                          idx === 0
                            ? 'bg-brand-50 text-brand-700 border border-brand-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        v{v.versionNumber} {idx === 0 && '(Hiện tại)'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 flex items-center gap-1.5">
                      <FileCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[180px]">{v.fileName}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {(v.fileSize / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-[200px] truncate">
                      {v.changeSummary || 'Không có mô tả'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {format(new Date(v.createdAt), 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {orgId && (
                        <a
                          href={getDocumentDownloadUrl(orgId, document.id, v.id)}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-brand-600 inline-flex items-center gap-1"
                          title="Tải phiên bản này"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span className="text-[11px]">Tải</span>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <button
            onClick={handleDelete}
            disabled={isActing}
            className="text-xs text-red-600 hover:text-red-700 font-medium inline-flex items-center gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Xóa hồ sơ</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleArchiveToggle}
              disabled={isActing}
              className="btn-secondary text-xs inline-flex items-center gap-1"
            >
              {document.status === 'ARCHIVED' ? (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Khôi phục hoạt động</span>
                </>
              ) : (
                <>
                  <Archive className="h-3.5 w-3.5" />
                  <span>Lưu trữ tài liệu</span>
                </>
              )}
            </button>
            <button onClick={onClose} className="btn-secondary text-xs">
              Đóng
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
