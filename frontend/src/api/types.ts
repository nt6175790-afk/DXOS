// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { WorkSchedule } from './schedules';
import type { AttendanceRecord } from './attendance';
import type { LeaveRequest } from './leave';

// === Error Envelope ===
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { fields?: string[] };
    requestId: string;
  };
}

// === Auth ===
export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

// === Pagination ===
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PaginationParams {
  limit?: number;
  after?: string;
}

// === Organization ===
export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationRequest {
  name: string;
  slug: string;
}

export interface UpdateOrganizationRequest {
  name: string;
}

// === Department ===
export type DepartmentStatus = 'ACTIVE' | 'INACTIVE';

export interface Department {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  status: DepartmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDepartmentRequest {
  code: string;
  name: string;
  description?: string;
}

export interface UpdateDepartmentRequest {
  name?: string;
  description?: string | null;
  status?: DepartmentStatus;
}

export interface DepartmentListParams extends PaginationParams {
  status?: DepartmentStatus;
}

// === Employee ===
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE';

export interface Employee {
  id: string;
  organizationId: string;
  userId: string;
  departmentId: string | null;
  employeeCode: string;
  displayName: string;
  jobTitle: string | null;
  phone: string | null;
  status: EmployeeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeeRequest {
  userId: string;
  employeeCode: string;
  displayName: string;
  departmentId?: string;
  jobTitle?: string;
  phone?: string;
}

export interface UpdateEmployeeRequest {
  displayName?: string;
  departmentId?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  status?: EmployeeStatus;
}

export interface EmployeeListParams extends PaginationParams {
  status?: EmployeeStatus;
  departmentId?: string;
  userId?: string;
}

// === Task ===
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Task {
  id: string;
  organizationId: string;
  creatorEmployeeId: string;
  assigneeEmployeeId: string | null;
  departmentId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  progressPercent: number;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  assigneeEmployeeId?: string;
  departmentId?: string;
  priority?: TaskPriority;
  dueAt?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  assigneeEmployeeId?: string | null;
  departmentId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  progressPercent?: number;
  dueAt?: string | null;
}

export interface TaskListParams extends PaginationParams {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeEmployeeId?: string;
  departmentId?: string;
}

// === Task Collaboration (Comments & Attachments) ===
export interface TaskComment {
  id: string;
  taskId: string;
  authorUserId: string;
  authorDisplayName: string | null;
  body: string;
  createdAt: string;
}

export interface CreateTaskCommentRequest {
  body: string;
}

export interface TaskAttachmentFile {
  id: string;
  originalFilename: string;
  contentType: string;
  size: number | null;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  linkedByUserId: string;
  createdAt: string;
  file: TaskAttachmentFile;
}

export interface CreateTaskAttachmentRequest {
  fileId: string;
}

export interface TaskCollaborationParams {
  limit?: number;
  after?: string;
}

// === Notification ===
export type NotificationType = 'organization.updated' | 'task.assigned';

export interface Notification {
  id: string;
  organizationId: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
}

export interface NotificationListParams extends PaginationParams {
  state?: 'read' | 'unread';
  category?: 'work' | 'organization' | 'other';
}

export interface NotificationSummaryCategory {
  total: number;
  unread: number;
}

export interface NotificationSummary {
  total: number;
  unread: number;
  read: number;
  categories: {
    work: NotificationSummaryCategory;
    organization: NotificationSummaryCategory;
    other: NotificationSummaryCategory;
  };
}

// === File ===
export type FileStatus = 'AVAILABLE' | 'DELETED';

export interface FileMetadata {
  id: string;
  organizationId: string;
  uploadedByUserId: string;
  originalFilename: string;
  contentType: string;
  size: number;
  checksum: string;
  status: FileStatus;
  createdAt: string;
  updatedAt: string;
}

export type FileListParams = PaginationParams;

// === AI ===
export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiGenerateRequest {
  messages: AiMessage[];
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  metadata?: { purpose: 'general' };
}

/** A record the answer is based on. `href` is an internal route. */
export interface AiCitation {
  type: 'task' | 'approval' | 'leave' | 'document' | 'employee' | 'department' | 'event' | 'attendance' | 'schedule' | 'metric';
  id: string | null;
  label: string;
  href: string;
}

export interface AiNumericCheck {
  status: 'PASS' | 'WARN' | 'NOT_APPLICABLE';
  unmatchedCount: number;
}

export interface AiGenerateResponse {
  id: string;
  organizationId: string;
  requestId: string;
  provider: string;
  model: string;
  text: string;
  finishReason: 'stop' | 'length' | 'tool_limit';
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Present when the agent answered with tools; older servers omit these fields. */
  citations?: AiCitation[];
  numericCheck?: AiNumericCheck;
}

export interface AiInsightsResponse {
  workforce: { total: number; active: number; topDepartment: string | null } | null;
  attendance: { attendanceRate: number | null; lateRate: number | null; lateCount: number } | null;
  performance: { averageRating: number | null; completionRate: number | null } | null;
  compliance: { complianceRate: number | null; expiringSoonCount: number; missingCount: number } | null;
  payroll: { latestPeriod: string | null; currencies: { currency: string; totalNet: number }[] } | null;
}

// === Audit ===
export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';
export type AuditSource = 'HTTP' | 'SYSTEM';

export interface AuditEvent {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  event: string;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  source: AuditSource;
  requestId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditListParams extends PaginationParams {
  event?: string;
}

// === Permission keys & discovery ===
export type Permission =
  | 'user:read' | 'user:create' | 'user:update' | 'user:delete'
  | 'role:create' | 'role:update' | 'role:delete'
  | 'document:read' | 'document:create' | 'document:update' | 'document:delete'
  | 'document:download' | 'document:sensitive:read' | 'document:manage'
  | 'automation:read' | 'automation:create' | 'automation:update' | 'automation:delete' | 'automation:manage'
  | 'workflow:read' | 'workflow:create' | 'workflow:update' | 'workflow:cancel' | 'workflow:manage'
  | 'report:read' | 'report:export'
  | 'calendar:read' | 'calendar:create' | 'calendar:update'
  | 'organization:read'
  | 'organization:update'
  | 'department:read'
  | 'department:create'
  | 'department:update'
  | 'employee:read'
  | 'employee:create'
  | 'employee:update'
  | 'task:read'
  | 'task:create'
  | 'task:update'
  | 'task:assign'
  | 'file:read'
  | 'file:upload'
  | 'file:delete'
  | 'ai:use'
  | 'audit:read'
  | 'role:read'
  | 'role:assign'
  | 'leave:read'
  | 'leave:create'
  | 'leave:approve'
  | 'leave:cancel'
  | 'attendance:read'
  | 'attendance:check-in'
  | 'attendance:check-out'
  | 'attendance:manage'
  | 'shift:read'
  | 'shift:create'
  | 'shift:update'
  | 'shift:manage'
  | 'schedule:read'
  | 'schedule:create'
  | 'schedule:update'
  | 'schedule:manage'
  | 'approval:read'
  | 'approval:create'
  | 'approval:approve'
  | 'approval:reject'
  | 'approval:manage'
  | 'compensation:read'
  | 'compensation:create'
  | 'compensation:update'
  | 'compensation:manage'
  | 'payroll:read'
  | 'payroll:create'
  | 'payroll:calculate'
  | 'payroll:approve'
  | 'payroll:finalize'
  | 'payroll:manage'
  | 'performance:read'
  | 'performance:create'
  | 'performance:update'
  | 'performance:review'
  | 'performance:manage'
  | 'goal:read'
  | 'goal:create'
  | 'goal:update'
  | 'goal:manage'
  | 'kpi:read'
  | 'kpi:update'
  | 'kpi:manage';

export interface PermissionsResponse {
  organizationId: string;
  permissions: Permission[];
}

// === Members & Role Administration ===
export interface RoleSummary {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
}

export interface EmployeeSummary {
  id: string;
  employeeCode: string;
  displayName: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export type MembershipStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'REMOVED';

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  displayName: string | null;
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  status: MembershipStatus;
  roles: RoleSummary[];
  employee: EmployeeSummary | null;
}

export interface OrganizationMemberPage {
  items: OrganizationMember[];
  nextCursor: string | null;
}

export type MemberListParams = PaginationParams;

export interface AssignRoleRequest {
  roleId: string;
}

export interface RoleAssignmentResult {
  membershipId: string;
  roleId: string;
  assigned: boolean;
}

export interface OrganizationRolePage {
  items: RoleSummary[];
  nextCursor: string | null;
}

export type RoleListParams = PaginationParams;

// === Approval Workflow Engine ===
export type ApprovalRequestType = 'LEAVE' | 'ATTENDANCE_ADJUSTMENT' | 'PAYROLL';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  requesterId: string;
  type: ApprovalRequestType;
  status: ApprovalStatus;
  title: string;
  reason: string;
  payload: Record<string, unknown>;
  reviewerId: string | null;
  reviewerNote: string | null;
  reviewedAt: string | null;
  referenceId: string | null;
  createdAt: string;
  updatedAt: string;
  requester: {
    id: string;
    employeeCode: string;
    displayName: string;
    jobTitle: string | null;
    userId: string;
    departmentId: string | null;
    department?: {
      id: string;
      name: string;
      code: string;
    } | null;
  };
  reviewer?: {
    id: string;
    employeeCode: string;
    displayName: string;
    jobTitle: string | null;
    userId: string;
  } | null;
}

export interface ApprovalListPage {
  items: ApprovalRequest[];
  nextCursor: string | null;
}

export interface ApprovalSummary {
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  myPendingCount: number;
}

export interface CreateAttendanceAdjustmentRequest {
  employeeId?: string;
  workDate: string;
  targetCheckInAt: string;
  targetCheckOutAt?: string;
  shiftId?: string;
  reason: string;
}

export interface ApproveRequestPayload {
  note?: string;
}

export interface RejectRequestPayload {
  reason: string;
}

export interface CancelRequestPayload {
  reason?: string;
}

export interface ApprovalListParams extends PaginationParams {
  status?: ApprovalStatus;
  type?: ApprovalRequestType;
  requesterId?: string;
  mine?: boolean;
  pending?: boolean;
}

// === Compensation & Payroll ===
export interface CompensationProfile {
  id: string;
  organizationId: string;
  employeeId: string;
  baseSalary: number | string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    employeeCode: string;
    displayName: string;
    jobTitle: string | null;
    departmentId: string | null;
    department?: {
      id: string;
      name: string;
      code: string;
    } | null;
  };
}

export interface CreateCompensationRequest {
  employeeId?: string;
  baseSalary: number;
  currency?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
}

export interface UpdateCompensationRequest {
  effectiveTo?: string;
  isActive?: boolean;
  notes?: string;
}

export interface EmployeeCompensationSummary {
  activeProfile: CompensationProfile | null;
  history: CompensationProfile[];
}

export type PayrollPeriodStatus =
  | 'DRAFT'
  | 'PROCESSING'
  | 'CALCULATED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'FINALIZED'
  | 'CANCELLED';

export type PayrollItemType =
  | 'EARNING'
  | 'ALLOWANCE'
  | 'OVERTIME'
  | 'DEDUCTION'
  | 'BONUS'
  | 'OTHER';

export interface PayrollPeriod {
  id: string;
  organizationId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollPeriodStatus;
  totalGross: number | string;
  totalNet: number | string;
  employeeCount: number;
  calculatedAt: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  finalizedAt: string | null;
  finalizedById: string | null;
  createdAt: string;
  updatedAt: string;
  approvedBy?: {
    id: string;
    displayName: string;
    employeeCode: string;
  } | null;
  finalizedBy?: {
    id: string;
    displayName: string;
    employeeCode: string;
  } | null;
}

export interface PayrollItem {
  id: string;
  payrollRecordId: string;
  type: PayrollItemType;
  name: string;
  amount: number | string;
  quantity: number | string | null;
  unit: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PayrollRecord {
  id: string;
  organizationId: string;
  payrollPeriodId: string;
  employeeId: string;
  compensationProfileId: string | null;
  baseSalary: number | string;
  workingDays: number | string;
  workedDays: number | string;
  absentDays: number | string;
  paidLeaveDays: number | string;
  unpaidLeaveDays: number | string;
  overtimeMinutes: number;
  overtimeAmount: number | string;
  allowanceAmount: number | string;
  deductionAmount: number | string;
  grossAmount: number | string;
  netAmount: number | string;
  currency: string;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    employeeCode: string;
    displayName: string;
    jobTitle: string | null;
    departmentId: string | null;
    department?: {
      id: string;
      name: string;
      code: string;
    } | null;
  };
  items?: PayrollItem[];
}

export interface CreatePayrollPeriodRequest {
  name: string;
  periodStart: string;
  periodEnd: string;
}

export interface RequestPayrollApprovalRequest {
  reason?: string;
}

export interface FinalizePayrollRequest {
  notes?: string;
}

export interface PayrollPeriodListParams {
  status?: PayrollPeriodStatus;
}

export interface PayrollRecordListParams {
  employeeId?: string;
}

// === Performance Management & Employee Review ===
export type PerformanceCycleStatus = 'DRAFT' | 'OPEN' | 'IN_REVIEW' | 'COMPLETED' | 'CANCELLED';
export type PerformanceReviewStatus = 'DRAFT' | 'SELF_ASSESSMENT' | 'MANAGER_REVIEW' | 'COMPLETED' | 'CANCELLED';
export type PerformanceGoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface PerformanceReviewCycle {
  id: string;
  organizationId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: PerformanceCycleStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    reviews: number;
    goals: number;
    kpis: number;
  };
}

export interface PerformanceGoal {
  id: string;
  organizationId: string;
  cycleId: string;
  employeeId: string;
  title: string;
  description: string | null;
  weight: number;
  progress: number;
  status: PerformanceGoalStatus;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    employeeCode: string;
    displayName: string;
  };
  cycle?: {
    id: string;
    name: string;
    status: PerformanceCycleStatus;
  };
}

export interface PerformanceKpi {
  id: string;
  organizationId: string;
  cycleId: string;
  employeeId: string;
  name: string;
  targetValue: number;
  actualValue: number;
  unit: string;
  score: number;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    employeeCode: string;
    displayName: string;
  };
  cycle?: {
    id: string;
    name: string;
    status: PerformanceCycleStatus;
  };
}

export interface PerformanceReview {
  id: string;
  organizationId: string;
  cycleId: string;
  employeeId: string;
  reviewerId: string;
  status: PerformanceReviewStatus;
  selfAssessment: string | null;
  selfRating: number | null;
  selfSubmittedAt: string | null;
  managerReview: string | null;
  managerRating: number | null;
  managerSubmittedAt: string | null;
  finalRating: number | null;
  summaryFeedback: string | null;
  completedAt: string | null;
  snapshotData: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    employeeCode: string;
    displayName: string;
    jobTitle?: string | null;
    department?: { id?: string; name: string } | null;
  };
  reviewer?: {
    id: string;
    employeeCode: string;
    displayName: string;
    jobTitle?: string | null;
  };
  cycle?: PerformanceReviewCycle;
  goals?: PerformanceGoal[];
  kpis?: PerformanceKpi[];
}

export interface PerformanceDashboardSummary {
  totalCycles: number;
  activeCycle: {
    id: string;
    name: string;
    status: PerformanceCycleStatus;
    startDate: string;
    endDate: string;
  } | null;
  totalReviews: number;
  completedReviewsCount: number;
  inReviewCount: number;
  pendingSelfAssessment: number;
  averageRating: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  goalCompletionRate: number;
  kpiAchievementRate: number;
  recentReviews: {
    id: string;
    employeeName: string;
    employeeCode: string;
    cycleName: string;
    status: PerformanceReviewStatus;
    finalRating: number | null;
    updatedAt: string;
  }[];
}

export interface EmployeePerformanceProfile {
  employee: {
    id: string;
    employeeCode: string;
    displayName: string;
    jobTitle: string | null;
    departmentName: string | null;
  };
  averageRating: number | null;
  completedReviewsCount: number;
  reviews: (PerformanceReview & {
    cycle: { id: string; name: string; status: PerformanceCycleStatus; startDate: string; endDate: string };
    reviewer: { id: string; displayName: string; employeeCode: string };
  })[];
  goals: (PerformanceGoal & {
    cycle: { id: string; name: string; status: PerformanceCycleStatus };
  })[];
  kpis: (PerformanceKpi & {
    cycle: { id: string; name: string; status: PerformanceCycleStatus };
  })[];
}

export interface CreateReviewCycleRequest {
  name: string;
  startDate: string;
  endDate: string;
  description?: string;
}

export interface UpdateReviewCycleRequest {
  name?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  status?: PerformanceCycleStatus;
}

export interface CreateGoalRequest {
  cycleId: string;
  employeeId: string;
  title: string;
  description?: string;
  weight?: number;
  progress?: number;
  status?: PerformanceGoalStatus;
}

export interface UpdateGoalRequest {
  title?: string;
  description?: string;
  weight?: number;
  progress?: number;
  status?: PerformanceGoalStatus;
}

export interface CreateKpiRequest {
  cycleId: string;
  employeeId: string;
  name: string;
  targetValue: number;
  actualValue?: number;
  unit: string;
}

export interface UpdateKpiRequest {
  name?: string;
  targetValue?: number;
  actualValue?: number;
  unit?: string;
}

export interface CreateReviewRequest {
  cycleId: string;
  employeeId: string;
  reviewerId: string;
}

export interface SubmitSelfAssessmentRequest {
  selfAssessment: string;
  selfRating: number;
}

export interface SubmitManagerReviewRequest {
  managerReview: string;
  managerRating: number;
  summaryFeedback?: string;
}

export interface CompleteReviewRequest {
  finalRating?: number;
  summaryFeedback?: string;
}

// === Employee Self-Service ===
export interface SelfServiceEmployeeInfo {
  id: string;
  employeeCode: string;
  displayName: string;
  jobTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
  department?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export interface SelfServiceTodayInfo {
  date: string;
  dayOfWeek: string;
  schedule?: Omit<WorkSchedule, 'employee'> | null;
  shift?: {
    id: string;
    name: string;
    code: string;
    startTime: string;
    endTime: string;
    breakStart?: string | null;
    breakEnd?: string | null;
    gracePeriodMinutes?: number;
    isOvernight?: boolean;
  } | null;
  isOff: boolean;
  attendance?: Omit<AttendanceRecord, 'employee'> | null;
  attendanceStatus: 'NO_SCHEDULE' | 'OFF' | 'LEAVE' | 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'CHECKED_OUT' | 'LATE' | 'EARLY_LEAVE' | 'COMPLETED';
  approvedLeave?: Omit<LeaveRequest, 'employee'> | null;
}

export interface SelfServiceNextShiftInfo {
  date: string;
  dayOfWeek: string;
  shift?: {
    id: string;
    name: string;
    code: string;
    startTime: string;
    endTime: string;
  } | null;
  notes?: string | null;
}

export interface SelfServiceMonthlySummary {
  totalScheduledDays: number;
  workedDays: number;
  offDays: number;
  leaveDays: number;
  lateCount: number;
  earlyLeaveCount: number;
  totalWorkedMinutes: number;
  totalWorkedHours: number;
}

export interface MyScheduleOverview {
  isEmployee: boolean;
  employee: SelfServiceEmployeeInfo | null;
  today: SelfServiceTodayInfo | null;
  nextShift: SelfServiceNextShiftInfo | null;
  schedules: Omit<WorkSchedule, 'employee'>[];
  attendanceRecords: Omit<AttendanceRecord, 'employee'>[];
  leaveRequests: Omit<LeaveRequest, 'employee'>[];
  summary: SelfServiceMonthlySummary;
}

export interface MyScheduleParams {
  month?: string;
  from?: string;
  to?: string;
}

