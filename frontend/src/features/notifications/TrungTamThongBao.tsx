// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  CheckSquare,
  Building,
  Clock,
  Inbox,
  Filter,
} from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import {
  listNotifications,
  markNotificationAsRead,
  getNotificationSummary,
  markAllNotificationsAsRead,
} from '@/api/notifications';
import { isApiError } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/contexts/ToastContext';
import { usePermission } from '@/hooks/usePermission';
import type { Notification, ApiError, NotificationSummary } from '@/api/types';
import { format } from 'date-fns';

export function NotificationsPage() {
  const { currentOrg } = useOrganization();
  return <NotificationsContent key={currentOrg?.id ?? 'no-organization'} />;
}

function NotificationsContent() {
  const { currentOrg } = useOrganization();
  const { hasPermission } = usePermission();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [stateFilter, setStateFilter] = useState<'' | 'read' | 'unread'>('');
  const [categoryFilter, setCategoryFilter] = useState<'' | 'work' | 'organization' | 'other'>('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const orgId = currentOrg?.id;

  const loadSummary = useCallback(async () => {
    if (!orgId || typeof getNotificationSummary !== 'function') return;
    try {
      const data = await getNotificationSummary(orgId);
      setSummary(data);
    } catch {
      // Non-blocking summary fetch
    }
  }, [orgId]);

  const load = useCallback(async (cursor?: string) => {
    if (!orgId) return;
    try {
      const params: Record<string, unknown> = { limit: 25 };
      if (stateFilter) params.state = stateFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (cursor) params.after = cursor;
      const res = await listNotifications(orgId, params as import('@/api/types').NotificationListParams);
      if (cursor) setNotifications((prev) => [...prev, ...res.items]);
      else setNotifications(res.items);
      setNextCursor(res.nextCursor);
      setError(null);
    } catch (err) {
      if (isApiError(err)) setError(err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [orgId, stateFilter, categoryFilter]);

  useEffect(() => {
    setIsLoading(true);
    setNotifications([]);
    setNextCursor(null);
    load();
    loadSummary();
  }, [load, loadSummary]);

  const handleMarkRead = async (notif: Notification) => {
    if (!orgId || notif.isRead) return;
    try {
      const updated = await markNotificationAsRead(orgId, notif.id);
      setNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      loadSummary();
    } catch {
      showToast('Không thể cập nhật trạng thái thông báo.', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    if (!orgId || isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      if (typeof markAllNotificationsAsRead === 'function') {
        const res = await markAllNotificationsAsRead(orgId);
        showToast(`Đã đánh dấu ${res.updatedCount} thông báo là đã đọc.`, 'success');
      }
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      loadSummary();
    } catch {
      showToast('Không thể đánh dấu tất cả đã đọc.', 'error');
    } finally {
      setIsMarkingAll(false);
    }
  };

  const getLink = (notif: Notification) => {
    if (hasPermission('task:read') && notif.type === 'task.assigned' && notif.metadata?.taskId) return `/tasks/${notif.metadata.taskId}`;
    return null;
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'task.assigned':
        return {
          label: 'Công việc',
          icon: CheckSquare,
          color: 'bg-blue-50 text-blue-700 border-blue-200',
          iconColor: 'text-blue-600 bg-blue-100',
        };
      case 'organization.updated':
        return {
          label: 'Tổ chức',
          icon: Building,
          color: 'bg-purple-50 text-purple-700 border-purple-200',
          iconColor: 'text-purple-600 bg-purple-100',
        };
      default:
        return {
          label: 'Hệ thống',
          icon: Bell,
          color: 'bg-slate-50 text-slate-700 border-slate-200',
          iconColor: 'text-slate-600 bg-slate-100',
        };
    }
  };

  const orgGuard = useOrgBootstrapGuard();
  if (orgGuard) return orgGuard;
  if (error) return <ErrorState error={error} onRetry={() => { setIsLoading(true); load(); }} />;

  const unreadCount = summary?.unread ?? notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trung tâm Thông báo"
        description="Quản lý và theo dõi thông báo quan trọng trong tổ chức của bạn"
        actions={
          unreadCount > 0 ? (
            <button
              onClick={handleMarkAllRead}
              disabled={isMarkingAll}
              className="btn-secondary text-xs inline-flex items-center gap-1.5"
              aria-label="Đánh dấu tất cả đã đọc"
            >
              <CheckCheck className="h-4 w-4 text-brand-600" />
              <span>Đánh dấu tất cả đã đọc</span>
            </button>
          ) : undefined
        }
      />

      {/* Summary KPI Counters */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card p-3 flex items-center justify-between border-slate-200">
            <span className="text-xs font-medium text-slate-500">Tổng thông báo</span>
            <span className="text-lg font-bold text-slate-900">{summary.total}</span>
          </div>
          <div className="card p-3 flex items-center justify-between border-amber-200 bg-amber-50/40">
            <span className="text-xs font-medium text-amber-700">Chưa đọc</span>
            <span className="text-lg font-bold text-amber-700">{summary.unread}</span>
          </div>
          <div className="card p-3 flex items-center justify-between border-emerald-200 bg-emerald-50/40">
            <span className="text-xs font-medium text-emerald-700">Đã đọc</span>
            <span className="text-lg font-bold text-emerald-700">{summary.read}</span>
          </div>
        </div>
      )}

      {/* Filter Tabs Bar */}
      <div className="card p-3 flex flex-wrap items-center justify-between gap-3 bg-white">
        {/* Status filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-400 mr-2 flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" /> Trạng thái:
          </span>
          {([
            ['', 'Tất cả'],
            ['unread', 'Chưa đọc'],
            ['read', 'Đã đọc'],
          ] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setStateFilter(v as '' | 'read' | 'unread')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                stateFilter === v
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-400 mr-2">Phân loại:</span>
          {([
            ['', 'Tất cả danh mục'],
            ['work', 'Công việc'],
            ['organization', 'Tổ chức'],
            ['other', 'Khác'],
          ] as const).map(([cat, label]) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat as '' | 'work' | 'organization' | 'other')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                categoryFilter === cat
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Đang tải danh sách thông báo..." />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Không có thông báo nào"
          description={
            stateFilter === 'unread'
              ? 'Tuyệt vời! Bạn không có thông báo chưa đọc nào.'
              : 'Bạn đã cập nhật tất cả thông báo mới nhất!'
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {notifications.map((notif) => {
              const link = getLink(notif);
              const badge = getTypeBadge(notif.type);
              const IconComponent = badge.icon;

              return (
                <div
                  key={notif.id}
                  className={`card p-4 transition-all duration-150 flex items-start gap-4 hover:shadow-md ${
                    !notif.isRead
                      ? 'border-l-4 border-l-brand-600 bg-brand-50/20'
                      : 'bg-white opacity-90'
                  }`}
                >
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${badge.iconColor}`}
                  >
                    <IconComponent className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                      {!notif.isRead && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-600 text-white">
                          Mới
                        </span>
                      )}
                      <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto">
                        <Clock className="h-3 w-3" />
                        {format(new Date(notif.createdAt), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-slate-900 leading-snug">
                      {notif.title}
                    </p>
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-line leading-relaxed">
                      {notif.body}
                    </p>

                    <div className="flex items-center gap-4 mt-3 pt-2 border-t border-slate-100">
                      {link && (
                        <Link
                          to={link}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Xem chi tiết công việc
                        </Link>
                      )}

                      {!notif.isRead && (
                        <button
                          onClick={() => handleMarkRead(notif)}
                          className="btn-ghost text-xs text-slate-600 hover:text-brand-600 ml-auto inline-flex items-center gap-1"
                          aria-label="Đánh dấu đã đọc"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Đánh dấu đã đọc
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            hasMore={!!nextCursor}
            onLoadMore={() => {
              setIsLoadingMore(true);
              load(nextCursor!);
            }}
            isLoading={isLoadingMore}
          />
        </div>
      )}
    </div>
  );
}
