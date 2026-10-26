// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
interface PaginationProps {
  hasMore: boolean;
  onLoadMore: () => void;
  isLoading?: boolean;
}

export function Pagination({ hasMore, onLoadMore, isLoading }: PaginationProps) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center py-4">
      <button
        onClick={onLoadMore}
        disabled={isLoading}
        className="btn-secondary"
      >
        {isLoading ? 'Đang tải thêm...' : 'Tải thêm'}
      </button>
    </div>
  );
}
