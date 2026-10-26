// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, Download, Trash2 } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import { useToast } from '@/contexts/ToastContext';
import { usePermission } from '@/hooks/usePermission';
import { listFiles, uploadFile, downloadFile, deleteFile } from '@/api/files';
import { isApiError } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { Pagination } from '@/components/ui/Pagination';
import type { FileMetadata, ApiError } from '@/api/types';
import { format } from 'date-fns';

export function FilesPage() {
  const { currentOrg } = useOrganization();
  const { showToast } = useToast();
  const { hasPermission, isLoading: isPermissionLoading } = usePermission();

  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const orgId = currentOrg?.id;
  const canRead = hasPermission('file:read');
  const canUpload = hasPermission('file:upload');
  const canDelete = hasPermission('file:delete');

  const loadFiles = useCallback(
    async (cursor?: string) => {
      if (!orgId) return;
      try {
        const response = await listFiles(orgId, {
          limit: 25,
          after: cursor,
        });

        if (cursor) {
          setFiles((prev) => [...prev, ...response.items]);
        } else {
          setFiles(response.items);
        }
        setNextCursor(response.nextCursor);
        setError(null);
        setIsForbidden(false);
      } catch (err) {
        if (isApiError(err) && err.error.code === 'FORBIDDEN') {
          setIsForbidden(true);
        } else if (isApiError(err)) {
          setError(err);
        } else {
          setError({
            success: false,
            error: {
              code: 'NETWORK_ERROR',
              message: 'Không thể tải danh sách tài liệu. Vui lòng thử lại.',
              requestId: '',
            },
          });
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [orgId]
  );

  useEffect(() => {
    if (!orgId) return;
    if (isPermissionLoading) return;

    if (!canRead) {
      setIsForbidden(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setFiles([]);
    setNextCursor(null);
    loadFiles();
  }, [orgId, isPermissionLoading, canRead, loadFiles]);

  const handleLoadMore = () => {
    if (nextCursor) {
      setIsLoadingMore(true);
      loadFiles(nextCursor);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;

    // Client validation: Max 5 MiB (5,242,880 bytes)
    if (file.size > 5_242_880) {
      showToast('Kích thước tệp tin phải nhỏ hơn hoặc bằng 5 MB.', 'error');
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      await uploadFile(orgId, file);
      showToast('Tải tệp tin lên thành công', 'success');
      // Reconcile list from backend
      loadFiles();
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'FORBIDDEN') {
          showToast('Bạn không có quyền tải tệp tin lên tổ chức này.', 'error');
        } else {
          showToast(err.error.message, 'error');
        }
      } else {
        showToast('Tải tệp tin thất bại.', 'error');
      }
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (file: FileMetadata) => {
    if (!orgId) return;
    try {
      const blob = await downloadFile(orgId, file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'FORBIDDEN') {
          showToast('Bạn không có quyền tải xuống tệp tin này.', 'error');
        } else {
          showToast(err.error.message, 'error');
        }
      } else {
        showToast('Tải xuống tệp thất bại.', 'error');
      }
    }
  };

  const handleDelete = async (file: FileMetadata) => {
    if (!orgId) return;
    try {
      await deleteFile(orgId, file.id);
      showToast('Đã xóa tệp tin thành công', 'success');
      // Reconcile list from backend
      loadFiles();
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'FORBIDDEN') {
          showToast('Bạn không có quyền xóa tệp tin này.', 'error');
        } else {
          showToast(err.error.message, 'error');
        }
      } else {
        showToast('Xóa tệp tin thất bại.', 'error');
      }
    }
  };

  const orgGuard = useOrgBootstrapGuard();
  if (orgGuard) return orgGuard;
  if (isPermissionLoading) return <LoadingState message="Đang kiểm tra quyền hạn..." />;
  if (isForbidden || !canRead) {
    return <ForbiddenState message="Bạn không có quyền truy cập hoặc xem danh sách tài liệu của tổ chức này." />;
  }
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          setIsLoading(true);
          loadFiles();
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Tài liệu"
        description="Quản lý và lưu trữ tệp tài liệu trong tổ chức"
        actions={
          canUpload ? (
            <label
              className={`btn-primary cursor-pointer ${
                isUploading ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <Upload className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {isUploading ? 'Đang tải lên...' : 'Tải tệp lên'}
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleUpload}
                disabled={isUploading}
              />
            </label>
          ) : undefined
        }
      />

      <p className="text-xs text-slate-400 mb-3">
        Định dạng hỗ trợ: PDF, PNG, JPEG — Dung lượng tối đa 5 MB
      </p>

      {isLoading ? (
        <LoadingState message="Đang tải danh sách tài liệu từ máy chủ..." />
      ) : files.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Không tìm thấy tài liệu nào"
          description={
            canUpload
              ? 'Chưa có tài liệu nào trong tổ chức này. Nhấn nút "Tải tệp lên" để bắt đầu.'
              : 'Chưa có tài liệu nào được chia sẻ trong tổ chức này.'
          }
          action={
            canUpload ? (
              <label
                className={`btn-primary cursor-pointer text-sm ${
                  isUploading ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <Upload className="h-4 w-4 mr-1" aria-hidden="true" />
                {isUploading ? 'Đang tải lên...' : 'Tải tệp lên'}
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleUpload}
                  disabled={isUploading}
                />
              </label>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Tên tệp tin</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">
                      Định dạng
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Dung lượng</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">
                      Thời gian tải lên
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Trạng thái</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {files.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                        <span className="font-medium text-slate-900 truncate max-w-xs" title={f.originalFilename}>
                          {f.originalFilename}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs hidden sm:table-cell">
                        {f.contentType}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {(f.size / 1024).toFixed(1)} KB
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                        {format(new Date(f.createdAt), 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {f.status === 'AVAILABLE' ? 'Khả dụng' : f.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDownload(f)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                            aria-label={`Tải xuống ${f.originalFilename}`}
                            title="Tải xuống"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          {canDelete && f.status === 'AVAILABLE' && (
                            <button
                              onClick={() => handleDelete(f)}
                              className="p-1.5 rounded hover:bg-slate-100 text-red-500 hover:text-red-700"
                              aria-label={`Xóa ${f.originalFilename}`}
                              title="Xóa tệp"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            hasMore={!!nextCursor}
            onLoadMore={handleLoadMore}
            isLoading={isLoadingMore}
          />
        </>
      )}
    </div>
  );
}
