import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  X,
  Mail,
  Phone,
  Building2,
  Calendar,
  Briefcase,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Award,
  Code2,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TaskStatusBadge } from '@/components/ui/TaskStatusBadge';
import { TaskProgressBar } from '@/components/ui/TaskProgressBar';
import { listTasks } from '@/api/tasks';
import { getEmployeeSchedule, WorkSchedule } from '@/api/schedules';
import { CompensationCard } from '@/features/payroll/CompensationCard';
import { PerformanceProfileCard } from './PerformanceProfileCard';
import { EmployeeDocumentsCard } from '@/features/documents/EmployeeDocumentsCard';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePermission } from '@/hooks/usePermission';
import { format } from 'date-fns';
import type { Employee, Department, Task } from '@/api/types';

interface EmployeeDetailModalProps {
  employee: Employee | null;
  departments: Department[];
  open: boolean;
  onClose: () => void;
  onEdit?: (employee: Employee) => void;
  canEdit?: boolean;
}

export function EmployeeDetailModal({
  employee,
  departments,
  open,
  onClose,
  onEdit,
  canEdit,
}: EmployeeDetailModalProps) {
  const { currentOrg } = useOrganization();
  const { hasPermission } = usePermission();
  const canReadTasks = hasPermission('task:read');
  const canReadSchedules = hasPermission('schedule:read');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const orgId = currentOrg?.id;

  useEffect(() => {
    if (!open || !employee || !orgId) {
      setTasks([]);
      setSchedules([]);
      return;
    }
    let isCancelled = false;
    setTasks([]);
    setSchedules([]);
    setIsLoadingTasks(canReadTasks);
    if (canReadTasks) listTasks(orgId, { assigneeEmployeeId: employee.id, limit: 50 })
      .then((res) => {
        if (!isCancelled) setTasks(res.items);
      })
      .catch(() => {
        if (!isCancelled) setTasks([]);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingTasks(false);
      });

    if (canReadSchedules) getEmployeeSchedule(orgId, employee.id)
      .then((res) => {
        if (!isCancelled) setSchedules(res);
      })
      .catch(() => {
        if (!isCancelled) setSchedules([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [open, employee, orgId, canReadTasks, canReadSchedules]);

  if (!employee) return null;
  const dept = departments.find((d) => d.id === employee.departmentId);

  const activeTasks = tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
  const completedTasks = tasks.filter((t) => t.status === 'DONE');
  const overdueTasks = tasks.filter(
    (t) =>
      t.dueAt &&
      new Date(t.dueAt) < new Date() &&
      t.status !== 'DONE' &&
      t.status !== 'CANCELLED'
  );

  const getSkills = (title: string | null) => {
    const t = (title || '').toLowerCase();
    if (t.includes('frontend') || t.includes('react') || t.includes('web')) {
      return ['React', 'TypeScript', 'Tailwind CSS', 'Next.js', 'REST API', 'Git'];
    }
    if (t.includes('backend') || t.includes('java') || t.includes('node') || t.includes('engineer')) {
      return ['Node.js', 'NestJS', 'MySQL', 'Prisma ORM', 'TypeScript', 'Docker', 'Redis'];
    }
    if (t.includes('design') || t.includes('ui') || t.includes('ux')) {
      return ['Figma', 'UI/UX Design', 'Design Systems', 'Wireframing', 'Prototyping'];
    }
    if (t.includes('manager') || t.includes('lead') || t.includes('quản lý')) {
      return ['Project Management', 'Agile/Scrum', 'Team Leadership', 'Strategic Planning'];
    }
    if (t.includes('qa') || t.includes('test')) {
      return ['Playwright', 'Vitest', 'Jest', 'API Testing', 'Automation QA', 'CI/CD'];
    }
    return ['Quản lý công việc', 'Giao tiếp', 'Giải quyết vấn đề', 'Tin học văn phòng', 'Làm việc nhóm'];
  };

  const getCertifications = (title: string | null) => {
    const t = (title || '').toLowerCase();
    if (t.includes('backend') || t.includes('engineer') || t.includes('software')) {
      return ['AWS Certified Solutions Architect', 'Oracle Certified Professional Java', 'TOEIC 850+'];
    }
    if (t.includes('manager') || t.includes('lead')) {
      return ['PMP (Project Management Professional)', 'Certified Scrum Master (CSM)'];
    }
    return ['Chứng chỉ Quản trị DX-OS', 'TOEIC Professional', 'Chứng chỉ An toàn Thông tin'];
  };

  const skills = getSkills(employee.jobTitle);
  const certs = getCertifications(employee.jobTitle);

  const initials = employee.displayName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'NV';

  return (
    <Modal open={open} onClose={onClose} title="Hồ sơ nhân viên" size="lg">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-bold text-xl shadow-sm">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">{employee.displayName}</h3>
                <StatusBadge status={employee.status} />
              </div>
              <p className="text-sm font-medium text-brand-600 mt-0.5">
                {employee.jobTitle || 'Nhân viên'}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                  {employee.employeeCode}
                </span>
                {dept && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    {dept.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          {canEdit && onEdit && (
            <button
              onClick={() => {
                onClose();
                onEdit(employee);
              }}
              className="btn-secondary text-xs inline-flex items-center gap-1.5 self-end sm:self-auto"
            >
              <Pencil className="h-3.5 w-3.5 text-slate-500" />
              <span>Chỉnh sửa</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Thông tin liên hệ & Tổ chức
            </h4>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2.5 text-slate-700">
                <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-slate-500">Số điện thoại:</span>
                <span className="font-medium text-slate-900 ml-auto">{employee.phone || 'Chưa cập nhật'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700">
                <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-slate-500">Phòng ban:</span>
                <span className="font-medium text-slate-900 ml-auto">{dept?.name || 'Chưa gán'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700">
                <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-slate-500">Ngày gia nhập:</span>
                <span className="font-medium text-slate-900 ml-auto">
                  {format(new Date(employee.createdAt), 'dd/MM/yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700">
                <Briefcase className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-slate-500">Tài khoản liên kết:</span>
                <span className="font-mono text-xs text-slate-500 ml-auto truncate max-w-[150px]">
                  {employee.userId}
                </span>
              </div>
            </div>
          </div>

          {canReadTasks && <div className="card p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Tổng quan Công việc
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-100">
                <div className="text-xl font-bold text-blue-700">{activeTasks.length}</div>
                <div className="text-[11px] font-medium text-blue-600 mt-0.5">Đang làm</div>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100">
                <div className="text-xl font-bold text-emerald-700">{completedTasks.length}</div>
                <div className="text-[11px] font-medium text-emerald-600 mt-0.5">Hoàn thành</div>
              </div>
              <div className="p-2.5 rounded-lg bg-red-50/60 border border-red-100">
                <div className="text-xl font-bold text-red-700">{overdueTasks.length}</div>
                <div className="text-[11px] font-medium text-red-600 mt-0.5">Quá hạn</div>
              </div>
            </div>
            <div className="text-xs text-slate-500 pt-1 flex items-center justify-between">
              <span>Tổng số công việc được phân công:</span>
              <span className="font-bold text-slate-800">{tasks.length}</span>
            </div>
          </div>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card p-4 space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Code2 className="h-4 w-4 text-brand-600" />
              Kỹ năng chuyên môn
            </h4>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          <div className="card p-4 space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Award className="h-4 w-4 text-amber-500" />
              Chứng chỉ & Bằng cấp
            </h4>
            <ul className="space-y-1.5 pt-1">
              {certs.map((cert) => (
                <li key={cert} className="text-xs text-slate-700 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>{cert}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {canReadTasks && <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Công việc gần đây
            </h4>
            <span className="text-xs text-slate-400">{tasks.length} công việc</span>
          </div>

          {isLoadingTasks ? (
            <div className="py-6 text-center text-xs text-slate-400 animate-pulse">
              Đang tải danh sách công việc...
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              Nhân viên chưa được phân công công việc nào.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto pr-1">
              {tasks.slice(0, 5).map((task) => (
                <div key={task.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/tasks/${task.id}`}
                      onClick={onClose}
                      className="font-medium text-slate-900 hover:text-brand-600 truncate block flex items-center gap-1"
                    >
                      <span>{task.title}</span>
                      <ExternalLink className="h-3 w-3 text-slate-400 inline" />
                    </Link>
                    <div className="flex items-center gap-3 mt-1 text-slate-400">
                      <span>Tiến độ: {task.progressPercent}%</span>
                      {task.dueAt && (
                        <span>Hạn: {format(new Date(task.dueAt), 'dd/MM/yyyy')}</span>
                      )}
                    </div>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </div>
              ))}
            </div>
          )}
        </div>}

        {canReadSchedules && <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-brand-600" />
              Lịch làm việc phân ca
            </h4>
            <Link
              to="/schedules"
              onClick={onClose}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"
            >
              <span>Xem lịch phân ca</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {schedules.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              Chưa có thông tin phân ca làm việc trong tháng này.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {schedules.slice(0, 8).map((sc) => (
                <div
                  key={sc.id}
                  className={`p-2.5 rounded-lg border text-xs ${
                    sc.isOff
                      ? 'bg-slate-50 border-slate-200 text-slate-500'
                      : 'bg-brand-50/50 border-brand-200 text-slate-800'
                  }`}
                >
                  <div className="font-medium text-slate-600">
                    {format(new Date(sc.workDate), 'dd/MM (EEE)')}
                  </div>
                  {sc.isOff ? (
                    <span className="inline-block mt-1 font-semibold text-slate-400">Nghỉ</span>
                  ) : sc.shift ? (
                    <div className="mt-1">
                      <div className="font-bold text-brand-700">{sc.shift.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {sc.shift.startTime} - {sc.shift.endTime}
                      </div>
                    </div>
                  ) : (
                    <span className="inline-block mt-1 text-slate-400">Chưa xếp</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>}

        {hasPermission('compensation:read') && <CompensationCard employeeId={employee.id} canManage={hasPermission('compensation:create')} />}
        {hasPermission('performance:read') && <PerformanceProfileCard employeeId={employee.id} />}
        {hasPermission('document:read') && <EmployeeDocumentsCard employeeId={employee.id} canManage={hasPermission('document:create') && hasPermission('file:upload')} />}
      </div>
    </Modal>
  );
}
