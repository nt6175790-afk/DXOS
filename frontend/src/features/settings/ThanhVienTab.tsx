// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useCallback, useId, useRef } from 'react';
import { Users, Shield, Plus, X, AlertTriangle, RefreshCw } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { listMembers, listAllRoles, assignRole, revokeRole } from '@/api/members';
import { isApiError } from '@/api/client';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import type {
  OrganizationMember,
  RoleSummary,
  ApiError,
} from '@/api/types';

export function MembersTab() {
  const { currentOrg } = useOrganization();
  const { user: currentUser } = useAuth();
  const { hasPermission, isLoading: isPermissionLoading } = usePermission();
  const { showToast } = useToast();

  const orgId = currentOrg?.id;
  const canReadRoles = hasPermission('role:read');
  const canAssignRoles = hasPermission('role:assign');

  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);

  // Role Catalog state
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);

  // Assign Role Modal state
  const [selectedMemberForAssign, setSelectedMemberForAssign] = useState<OrganizationMember | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Revoke Role Confirmation Dialog state
  const [selectedMemberForRevoke, setSelectedMemberForRevoke] = useState<{
    member: OrganizationMember;
    role: RoleSummary;
  } | null>(null);
  const [isSubmittingRevoke, setIsSubmittingRevoke] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const roleSelectId = useId();

  const currentOrgIdRef = useRef(orgId);
  useEffect(() => {
    currentOrgIdRef.current = orgId;
  }, [orgId]);

  // Load members from backend
  const loadMembers = useCallback(
    async (cursor?: string) => {
      if (!orgId) return;
      const targetOrgId = orgId;
      if (!cursor) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      try {
        const response = await listMembers(targetOrgId, {
          limit: 25,
          after: cursor,
        });
        if (currentOrgIdRef.current !== targetOrgId) return;
        if (cursor) {
          setMembers((prev) => [...prev, ...response.items]);
        } else {
          setMembers(response.items);
        }
        setNextCursor(response.nextCursor);
        setError(null);
        setIsForbidden(false);
      } catch (err) {
        if (currentOrgIdRef.current !== targetOrgId) return;
        if (isApiError(err) && err.error.code === 'FORBIDDEN') {
          setIsForbidden(true);
        } else if (isApiError(err)) {
          setError(err);
        } else {
          setError({
            success: false,
            error: {
              code: 'LOAD_ERROR',
              message: 'Không thể tải danh sách thành viên. Vui lòng thử lại sau.',
              requestId: '',
            },
          });
        }
      } finally {
        if (currentOrgIdRef.current === targetOrgId) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [orgId]
  );

  // Load roles catalog from backend
  const loadRoles = useCallback(
    async (organizationId: string) => {
      setIsLoadingRoles(true);
      setRolesError(null);
      try {
        const fetchedRoles = await listAllRoles(organizationId);
        if (currentOrgIdRef.current !== organizationId) return;
        setRoles(fetchedRoles);
      } catch (err) {
        if (currentOrgIdRef.current !== organizationId) return;
        if (isApiError(err)) {
          setRolesError(err.error.message || 'Không thể tải danh mục vai trò.');
        } else {
          setRolesError('Không thể tải danh mục vai trò.');
        }
      } finally {
        if (currentOrgIdRef.current === organizationId) {
          setIsLoadingRoles(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    // Invalidate state when switching organization
    setMembers([]);
    setRoles([]);
    setNextCursor(null);
    setError(null);
    setIsForbidden(false);
    setSelectedMemberForAssign(null);
    setSelectedMemberForRevoke(null);
    setRolesError(null);

    if (orgId && canReadRoles && !isPermissionLoading) {
      loadMembers();
      loadRoles(orgId);
    } else if (!isPermissionLoading && !canReadRoles) {
      setIsLoading(false);
      setIsLoadingRoles(false);
    }
  }, [orgId, canReadRoles, isPermissionLoading, loadMembers, loadRoles]);

  // Handle Assign Role
  const handleOpenAssignModal = (member: OrganizationMember) => {
    setSelectedMemberForAssign(member);
    setAssignError(null);
    const memberRoleIds = new Set(member.roles.map((r) => r.id));
    const assignable = roles.filter((r) => r.isActive && !memberRoleIds.has(r.id));
    setSelectedRoleId(assignable.length > 0 ? assignable[0].id : '');
  };

  const handleAssignRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !selectedMemberForAssign || isSubmittingAssign) return;

    if (!selectedRoleId) {
      setAssignError('Vui lòng chọn vai trò cần gán.');
      return;
    }

    setIsSubmittingAssign(true);
    setAssignError(null);

    try {
      await assignRole(orgId, selectedMemberForAssign.id, selectedRoleId);
      showToast('Gán vai trò thành công', 'success');
      setSelectedMemberForAssign(null);
      await loadMembers();
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'FORBIDDEN') {
          setAssignError('Bạn không có quyền gán vai trò này (giới hạn quyền hạn hoặc cố gắng tự gán cho bản thân).');
        } else if (err.error.code === 'CONFLICT') {
          setAssignError('Thành viên hoặc vai trò hiện không ở trạng thái hoạt động.');
        } else if (err.error.code === 'NOT_FOUND') {
          setAssignError('Không tìm thấy thành viên hoặc vai trò trong tổ chức này.');
        } else {
          setAssignError(err.error.message || 'Gán vai trò thất bại.');
        }
      } else {
        setAssignError('Đã xảy ra lỗi khi gán vai trò.');
      }
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  // Handle Revoke Role
  const handleOpenRevokeDialog = (member: OrganizationMember, role: RoleSummary) => {
    setSelectedMemberForRevoke({ member, role });
    setRevokeError(null);
  };

  const handleRevokeRoleSubmit = async () => {
    if (!orgId || !selectedMemberForRevoke || isSubmittingRevoke) return;

    setIsSubmittingRevoke(true);
    setRevokeError(null);

    try {
      await revokeRole(
        orgId,
        selectedMemberForRevoke.member.id,
        selectedMemberForRevoke.role.id
      );
      showToast('Thu hồi vai trò thành công', 'success');
      setSelectedMemberForRevoke(null);
      await loadMembers();
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'FORBIDDEN') {
          setRevokeError('Bạn không có quyền thu hồi vai trò này.');
        } else if (err.error.code === 'CONFLICT') {
          setRevokeError('Thành viên hoặc vai trò hiện không ở trạng thái hợp lệ.');
        } else {
          setRevokeError(err.error.message || 'Thu hồi vai trò thất bại.');
        }
      } else {
        setRevokeError('Đã xảy ra lỗi khi thu hồi vai trò.');
      }
    } finally {
      setIsSubmittingRevoke(false);
    }
  };

  if (!orgId || isPermissionLoading) {
    return <LoadingState message="Đang kiểm tra quyền hạn và thông tin tổ chức..." />;
  }

  if (!canReadRoles || isForbidden) {
    return (
      <ForbiddenState
        message="Bạn không có quyền xem thành viên tổ chức."
      />
    );
  }

  if (isLoading) {
    return <LoadingState message="Đang tải danh sách thành viên..." />;
  }

  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => loadMembers()}
        message="Không thể tải danh sách thành viên."
      />
    );
  }

  // Helper: Status badge
  const renderStatusBadge = (status: OrganizationMember['status']) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="badge badge-success">Hoạt động</span>;
      case 'INACTIVE':
        return <span className="badge badge-warning">Ngưng hoạt động</span>;
      case 'SUSPENDED':
        return <span className="badge badge-error">Bị tạm khóa</span>;
      case 'REMOVED':
        return <span className="badge badge-error">Đã xóa</span>;
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-brand-600" aria-hidden="true" />
            Thành viên tổ chức ({members.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý thành viên và phân quyền vai trò (RBAC) trong tổ chức
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadMembers()}
            disabled={isLoading || isLoadingMore}
            className="btn-secondary text-xs py-1.5 px-3"
            title="Làm mới danh sách"
            aria-label="Làm mới danh sách thành viên"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Làm mới
          </button>
        </div>
      </div>

      {/* Main content table / cards */}
      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Chưa có thành viên nào"
          description="Thành viên mới sẽ xuất hiện tại đây."
        />
      ) : (
        <div className="space-y-4">
          {/* Desktop Table view */}
          <div className="table-container hidden md:block">
            <table className="table" aria-label="Danh sách thành viên tổ chức">
              <thead>
                <tr>
                  <th scope="col">Thành viên</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Hồ sơ nhân viên</th>
                  <th scope="col">Vai trò hiện tại</th>
                  {canAssignRoles && (
                    <th scope="col" className="text-right">
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {members.map((member) => {
                  const isSelf = member.userId === currentUser?.id;

                  return (
                    <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Identity */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-xs shrink-0"
                            aria-hidden="true"
                          >
                            {(member.displayName || member.email)
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 text-sm flex items-center gap-1.5">
                              <span>{member.displayName || 'Chưa đặt tên'}</span>
                              {isSelf && (
                                <span className="text-[10px] font-semibold bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded border border-brand-200">
                                  Bạn
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">
                              {member.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Membership Status */}
                      <td className="py-3 px-4">
                        {renderStatusBadge(member.status)}
                      </td>

                      {/* Employee info */}
                      <td className="py-3 px-4">
                        {member.employee ? (
                          <div className="text-xs">
                            <div className="font-medium text-slate-800">
                              {member.employee.displayName}
                            </div>
                            <div className="text-slate-400 font-mono">
                              {member.employee.employeeCode}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Assigned Roles */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {member.roles.length === 0 ? (
                            <span className="text-xs text-slate-400 italic">
                              Chưa gán vai trò
                            </span>
                          ) : (
                            member.roles.map((role) => (
                              <span
                                key={role.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                              >
                                <Shield className="h-3 w-3 text-slate-500" aria-hidden="true" />
                                <span>{role.name}</span>
                                {canAssignRoles && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRevokeDialog(member, role)}
                                    disabled={isSelf || member.status !== 'ACTIVE'}
                                    className="ml-0.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={
                                      isSelf
                                        ? 'Không thể tự thay đổi vai trò của chính mình'
                                        : member.status !== 'ACTIVE' ? 'Chỉ thay đổi vai trò của thành viên đang hoạt động' : `Thu hồi vai trò ${role.name}`
                                    }
                                    aria-label={`Thu hồi vai trò ${role.name} của ${member.displayName || member.email}`}
                                  >
                                    <X className="h-3 w-3" aria-hidden="true" />
                                  </button>
                                )}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      {canAssignRoles && (
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenAssignModal(member)}
                            disabled={isSelf || member.status !== 'ACTIVE'}
                            className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={
                              isSelf
                                ? 'Không thể tự gán vai trò cho chính mình'
                                : member.status !== 'ACTIVE'
                                ? 'Chỉ có thể gán vai trò cho thành viên đang hoạt động'
                                : 'Gán vai trò mới'
                            }
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                            Gán vai trò
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card view */}
          <div className="grid grid-cols-1 gap-4 md:hidden" role="list" aria-label="Danh sách thành viên">
            {members.map((member) => {
              const isSelf = member.userId === currentUser?.id;

              return (
                <div
                  key={member.id}
                  className="card p-4 space-y-3"
                  role="listitem"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm shrink-0">
                        {(member.displayName || member.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 text-sm flex items-center gap-1.5">
                          <span>{member.displayName || 'Chưa đặt tên'}</span>
                          {isSelf && (
                            <span className="text-[10px] font-semibold bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded border border-brand-200">
                              Bạn
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {member.email}
                        </div>
                      </div>
                    </div>
                    <div>{renderStatusBadge(member.status)}</div>
                  </div>

                  {member.employee && (
                    <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                      <span className="font-medium text-slate-700">Hồ sơ:</span>{' '}
                      {member.employee.displayName} ({member.employee.employeeCode})
                    </div>
                  )}

                  {/* Roles */}
                  <div>
                    <span className="text-xs font-medium text-slate-500 block mb-1.5">
                      Vai trò:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {member.roles.length === 0 ? (
                        <span className="text-xs text-slate-400 italic">
                          Chưa gán vai trò
                        </span>
                      ) : (
                        member.roles.map((role) => (
                          <span
                            key={role.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                          >
                            <Shield className="h-3 w-3 text-slate-500" aria-hidden="true" />
                            <span>{role.name}</span>
                            {canAssignRoles && (
                              <button
                                type="button"
                                onClick={() => handleOpenRevokeDialog(member, role)}
                                disabled={isSelf || member.status !== 'ACTIVE'}
                                className="ml-0.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label={`Thu hồi vai trò ${role.name} của ${member.displayName || member.email}`}
                              >
                                <X className="h-3 w-3" aria-hidden="true" />
                              </button>
                            )}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  {canAssignRoles && (
                    <div className="pt-2 border-t border-slate-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleOpenAssignModal(member)}
                        disabled={isSelf || member.status !== 'ACTIVE'}
                        className="btn-secondary text-xs py-1.5 px-3 w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        Gán vai trò
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {nextCursor && (
            <div className="pt-4 flex justify-center">
              <Pagination
                hasMore={Boolean(nextCursor)}
                onLoadMore={() => loadMembers(nextCursor)}
                isLoading={isLoadingMore}
              />
            </div>
          )}
        </div>
      )}

      {/* Assign Role Modal */}
      {selectedMemberForAssign && (
        <Modal
          open={true}
          onClose={() => {
            if (!isSubmittingAssign) setSelectedMemberForAssign(null);
          }}
          title="Gán vai trò cho thành viên"
          size="md"
        >
          <form onSubmit={handleAssignRoleSubmit} className="space-y-4">
            {assignError && (
              <div className="p-3 rounded-lg bg-red-50 text-sm text-red-700 flex items-start gap-2" role="alert">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
                <div>{assignError}</div>
              </div>
            )}

            <div className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-600 space-y-1">
              <div>
                <span className="font-medium text-slate-700">Thành viên:</span>{' '}
                {selectedMemberForAssign.displayName || selectedMemberForAssign.email}
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                ID: {selectedMemberForAssign.id}
              </div>
            </div>

            {/* Role selection */}
            {isLoadingRoles ? (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-500">
                <RefreshCw className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
                <span className="text-xs">Đang tải danh mục vai trò...</span>
              </div>
            ) : rolesError ? (
              <div className="p-3 rounded-lg bg-red-50 text-xs text-red-700 flex items-center justify-between gap-2 border border-red-200" role="alert">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                  <span>{rolesError}</span>
                </div>
                {orgId && (
                  <button
                    type="button"
                    onClick={() => loadRoles(orgId)}
                    className="underline text-red-800 font-medium hover:text-red-900"
                  >
                    Thử lại
                  </button>
                )}
              </div>
            ) : roles.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
                Tổ chức chưa có vai trò nào trong danh mục.
              </div>
            ) : (
              <FormField
                label="Chọn vai trò"
                htmlFor={roleSelectId}
                required
              >
                <select
                  id={roleSelectId}
                  className="input-field"
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                  disabled={isSubmittingAssign}
                  required
                >
                  <option value="">-- Chọn vai trò --</option>
                  {roles.map((r) => {
                    const isAlreadyAssigned = selectedMemberForAssign.roles.some(
                      (mr) => mr.id === r.id
                    );
                    const isInactive = !r.isActive;
                    const isDisabled = isAlreadyAssigned || isInactive;
                    let labelSuffix = '';
                    if (isAlreadyAssigned) {
                      labelSuffix = ' — Đã gán';
                    } else if (isInactive) {
                      labelSuffix = ' — Không hoạt động';
                    }

                    return (
                      <option
                        key={r.id}
                        value={r.id}
                        disabled={isDisabled}
                      >
                        {r.name} ({r.key}){labelSuffix}
                      </option>
                    );
                  })}
                </select>
              </FormField>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedMemberForAssign(null)}
                disabled={isSubmittingAssign}
                className="btn-secondary text-xs"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={
                  isSubmittingAssign ||
                  !selectedRoleId ||
                  isLoadingRoles ||
                  Boolean(rolesError) ||
                  roles.length === 0
                }
                className="btn-primary text-xs"
              >
                <Shield className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                {isSubmittingAssign ? 'Đang gán...' : 'Xác nhận gán vai trò'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Revoke Role Confirmation Dialog */}
      {selectedMemberForRevoke && (
        <Modal
          open={true}
          onClose={() => {
            if (!isSubmittingRevoke) setSelectedMemberForRevoke(null);
          }}
          title="Xác nhận thu hồi vai trò"
          size="sm"
        >
          <div className="space-y-4">
            {revokeError && (
              <div className="p-3 rounded-lg bg-red-50 text-sm text-red-700 flex items-start gap-2" role="alert">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
                <div>{revokeError}</div>
              </div>
            )}

            <p className="text-sm text-slate-600">
              Bạn có chắc chắn muốn thu hồi vai trò{' '}
              <strong className="text-slate-900">
                {selectedMemberForRevoke.role.name}
              </strong>{' '}
              khỏi thành viên{' '}
              <strong className="text-slate-900">
                {selectedMemberForRevoke.member.displayName || selectedMemberForRevoke.member.email}
              </strong>
              ?
            </p>

            <div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
              Thành viên sẽ mất các quyền do vai trò này cấp.
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedMemberForRevoke(null)}
                disabled={isSubmittingRevoke}
                className="btn-secondary text-xs"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleRevokeRoleSubmit}
                disabled={isSubmittingRevoke}
                className="btn-danger text-xs"
              >
                <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                {isSubmittingRevoke ? 'Đang thu hồi...' : 'Thu hồi vai trò'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
