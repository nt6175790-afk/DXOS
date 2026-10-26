import { useState, useEffect } from 'react';
import { Building2, Save, Users, Settings as SettingsIcon } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { updateOrganization } from '@/api/organizations';
import { isApiError } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { FormField } from '@/components/ui/FormField';
import { MembersTab } from './MembersTab';
import { format } from 'date-fns';

type SettingsTab = 'general' | 'members';

export function SettingsPage() {
  const { currentOrg, setCurrentOrg, refreshOrganizations } = useOrganization();
  const { hasPermission, isLoading: isPermissionLoading } = usePermission();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const canReadOrg = hasPermission('organization:read');
  const canUpdateOrg = hasPermission('organization:update');
  const canReadRoles = hasPermission('role:read');

  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrg) {
      setName(currentOrg.name);
      setError(null);
    }
  }, [currentOrg]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !name.trim() || !canUpdateOrg || isSaving) return;

    if (name.trim() === currentOrg.name) {
      showToast('Tên tổ chức không thay đổi', 'info');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updated = await updateOrganization(currentOrg.id, { name: name.trim() });
      setCurrentOrg(updated);
      await refreshOrganizations();
      showToast('Cập nhật thông tin tổ chức thành công', 'success');
    } catch (err) {
      if (isApiError(err)) {
        if (err.error.code === 'FORBIDDEN') {
          setError('Bạn không có quyền cập nhật tổ chức.');
        } else {
          setError(err.error.message);
        }
      } else {
        setError('Đã xảy ra lỗi khi cập nhật tổ chức.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const orgGuard = useOrgBootstrapGuard();
  if (orgGuard) return orgGuard;
  if (!currentOrg) return null;
  if (isPermissionLoading) return <LoadingState message="Đang kiểm tra quyền hạn..." />;

  if (!canReadOrg && !canReadRoles) return <ForbiddenState message="Bạn không có quyền xem cài đặt tổ chức." />;
  const visibleTab = activeTab === 'general' ? (canReadOrg ? 'general' : 'members') : (canReadRoles ? 'members' : 'general');

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Cài đặt tổ chức"
        description="Xem và quản lý thông tin tổ chức và phân quyền thành viên"
      />

      {/* Tabs navigation */}
      <div className="border-b border-slate-200" role="tablist" aria-label="Cài đặt">
        <div className="flex gap-4">
          {canReadOrg && (
            <button
              type="button"
              role="tab"
              aria-selected={visibleTab === 'general'}
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                visibleTab === 'general'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <SettingsIcon className="h-4 w-4" aria-hidden="true" />
              Thông tin tổ chức
            </button>
          )}

          {canReadRoles && <button
            type="button"
            role="tab"
            aria-selected={visibleTab === 'members'}
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              visibleTab === 'members'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            Thành viên & Vai trò
          </button>}
        </div>
      </div>

      {/* Tab content */}
      {visibleTab === 'general' && (
        <div className="card p-6 space-y-6 max-w-2xl">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="h-12 w-12 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{currentOrg.name}</h2>
              <p className="text-xs text-slate-500 font-mono">Định danh: {currentOrg.slug}</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <FormField
              label="Tên tổ chức"
              htmlFor="org-name"
              required
              hint={!canUpdateOrg ? 'Bạn chỉ có quyền xem.' : undefined}
            >
              <input
                id="org-name"
                className="input-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canUpdateOrg || isSaving}
                maxLength={100}
              />
            </FormField>

            <FormField label="Mã tổ chức" htmlFor="org-slug">
              <input
                id="org-slug"
                className="input-field font-mono text-xs bg-slate-50 text-slate-500 cursor-not-allowed"
                value={currentOrg.slug}
                disabled
                readOnly
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-500 pt-2">
              <div>
                <span className="font-medium text-slate-700">Mã định danh ID:</span>
                <p className="font-mono mt-0.5 break-all">{currentOrg.id}</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">Ngày thành lập:</span>
                <p className="mt-0.5">
                  {currentOrg.createdAt ? format(new Date(currentOrg.createdAt), 'dd/MM/yyyy') : '—'}
                </p>
              </div>
            </div>

            {canUpdateOrg && (
              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving || !name.trim() || name.trim() === currentOrg.name}
                  className="btn-primary"
                >
                  <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {visibleTab === 'members' && <MembersTab />}
    </div>
  );
}

