// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { getErrorMessage } from '@/api/error-message';
import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  AlertCircle,
  X,
  CheckCircle2,
  Shield,
  Calendar,
  Layers,
  FileCheck,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { uploadFile } from '@/api/files';
import {
  createDocument,
  createDocumentVersion,
  DocumentCategory,
  DocumentSensitivity,
  EmployeeDocument,
} from '@/api/documents';
import { useOrganization } from '@/contexts/OrganizationContext';
import type { Employee } from '@/api/types';

interface DocumentUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employees: Employee[];
  defaultEmployeeId?: string;
  defaultCategory?: DocumentCategory;
  targetDocument?: EmployeeDocument | null;
}

const CATEGORY_OPTIONS: { value: DocumentCategory; label: string }[] = [
  { value: 'LABOR_CONTRACT', label: 'Hợp đồng lao động' },
  { value: 'IDENTIFICATION', label: 'Căn cước công dân / Hộ chiếu' },
  { value: 'CERTIFICATE', label: 'Bằng cấp & Chứng chỉ chuyên môn' },
  { value: 'TRAINING', label: 'Đào tạo & Huấn luyện' },
  { value: 'INSURANCE', label: 'Bảo hiểm & Hồ sơ y tế' },
  { value: 'DECISION', label: 'Quyết định bổ nhiệm / Khen thưởng' },
  { value: 'HR_RECORD', label: 'Hồ sơ nhân sự khác' },
  { value: 'OTHER', label: 'Khác' },
];

export function DocumentUploadModal({
  open,
  onClose,
  onSuccess,
  employees,
  defaultEmployeeId,
  defaultCategory,
  targetDocument,
}: DocumentUploadModalProps) {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id;

  const [employeeId, setEmployeeId] = useState(defaultEmployeeId || '');
  const [title, setTitle] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [category, setCategory] = useState<DocumentCategory>(defaultCategory || 'LABOR_CONTRACT');
  const [sensitivity, setSensitivity] = useState<DocumentSensitivity>('NORMAL');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [changeSummary, setChangeSummary] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVersionMode = Boolean(targetDocument);

  useEffect(() => {
    if (open) {
      setError(null);
      setSelectedFile(null);
      if (targetDocument) {
        setTitle(targetDocument.title);
        setCategory(targetDocument.category);
        setSensitivity(targetDocument.sensitivity);
        setDocumentNumber(targetDocument.documentNumber || '');
        setEmployeeId(targetDocument.employeeId);
        setChangeSummary('');
      } else {
        setEmployeeId(defaultEmployeeId || (employees[0]?.id ?? ''));
        setCategory(defaultCategory || 'LABOR_CONTRACT');
        setTitle('');
        setDocumentNumber('');
        setSensitivity('NORMAL');
        setIssueDate('');
        setExpiryDate('');
        setNotes('');
        setChangeSummary('Phiên bản ban đầu');
      }
    }
  }, [open, targetDocument, defaultEmployeeId, defaultCategory, employees]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Kích thước tệp không được vượt quá 5MB');
        return;
      }
      setSelectedFile(file);
      setError(null);
      if (!title && !isVersionMode) {
        // Default title based on filename without extension
        const rawName = file.name.replace(/\.[^/.]+$/, '');
        setTitle(rawName);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    if (!selectedFile) {
      setError('Vui lòng chọn tệp tài liệu để tải lên');
      return;
    }

    if (!isVersionMode) {
      if (!employeeId) {
        setError('Vui lòng chọn nhân viên');
        return;
      }
      if (!title.trim()) {
        setError('Vui lòng nhập tên tài liệu');
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Upload physical file
      const uploadedFile = await uploadFile(orgId, selectedFile);

      if (isVersionMode && targetDocument) {
        // 2. Create new version
        await createDocumentVersion(orgId, targetDocument.id, {
          fileId: uploadedFile.id,
          changeSummary: changeSummary.trim() || 'Cập nhật tài liệu mới',
        });
      } else {
        // 2. Create new document
        await createDocument(orgId, {
          employeeId,
          title: title.trim(),
          documentNumber: documentNumber.trim() || undefined,
          category,
          sensitivity,
          issueDate: issueDate || undefined,
          expiryDate: expiryDate || undefined,
          notes: notes.trim() || undefined,
          fileId: uploadedFile.id,
          changeSummary: changeSummary.trim() || 'Phiên bản ban đầu',
        });
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Có lỗi xảy ra khi tải lên tài liệu'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextVersionNum = targetDocument ? (targetDocument.versions?.[0]?.versionNumber ?? 1) + 1 : 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isVersionMode ? `Tải lên phiên bản mới (v${nextVersionNum})` : 'Tải lên tài liệu mới'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isVersionMode && targetDocument && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
            <div>
              <span className="text-slate-500">Tài liệu:</span>{' '}
              <span className="font-semibold text-slate-800">{targetDocument.title}</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-medium border border-brand-200">
              Hiện tại: v{targetDocument.versions?.[0]?.versionNumber ?? 1} ➔ Mới: v{nextVersionNum}
            </span>
          </div>
        )}

        {!isVersionMode && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nhân viên sở hữu <span className="text-red-500">*</span>
              </label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                className="input text-xs w-full"
              >
                <option value="">-- Chọn nhân viên --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.displayName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Danh mục hồ sơ <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                required
                className="input text-xs w-full"
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tên tài liệu <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Hợp đồng lao động năm 2026"
                required
                className="input text-xs w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Số hiệu / Mã tài liệu
              </label>
              <input
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="VD: HĐLĐ-2026-001"
                className="input text-xs w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mức độ bảo mật
              </label>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="sensitivity"
                    value="NORMAL"
                    checked={sensitivity === 'NORMAL'}
                    onChange={() => setSensitivity('NORMAL')}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span>Thông thường (Normal)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-red-700 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="sensitivity"
                    value="SENSITIVE"
                    checked={sensitivity === 'SENSITIVE'}
                    onChange={() => setSensitivity('SENSITIVE')}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <Shield className="h-3.5 w-3.5 text-red-500" />
                  <span>Bảo mật cao (Sensitive)</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Ngày ban hành / Ký kết
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="input text-xs w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Ngày hết hạn (nếu có)
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="input text-xs w-full"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Ghi chú</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ghi chú nội bộ về tài liệu..."
                className="input text-xs w-full"
              />
            </div>
          </div>
        )}

        {isVersionMode && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Ghi chú thay đổi phiên bản
            </label>
            <input
              type="text"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder="VD: Gia hạn thêm thời gian hiệu lực, cập nhật phụ lục..."
              className="input text-xs w-full"
            />
          </div>
        )}

        {/* File Dropzone */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Tệp đính kèm (PDF, PNG, JPEG, tối đa 5MB) <span className="text-red-500">*</span>
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              selectedFile
                ? 'border-brand-300 bg-brand-50/30'
                : 'border-slate-300 hover:border-brand-400 bg-slate-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpeg,.jpg"
              onChange={handleFileChange}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-3 text-slate-800">
                <FileCheck className="h-8 w-8 text-brand-600 shrink-0" />
                <div className="text-left">
                  <div className="text-xs font-semibold">{selectedFile.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 ml-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="h-8 w-8 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-600 font-medium">
                  Kéo thả tệp vào đây hoặc <span className="text-brand-600 underline">chọn tệp</span>
                </p>
                <p className="text-[11px] text-slate-400">Hỗ trợ định dạng PDF, PNG, JPG</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-secondary text-xs"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !selectedFile}
            className="btn-primary text-xs inline-flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Đang tải lên...</span>
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                <span>{isVersionMode ? 'Tải lên phiên bản mới' : 'Lưu tài liệu'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
