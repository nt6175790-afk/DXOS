// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';
import {
  AiAnalyticsService,
} from './ai-analytics.service';

export interface EmployeeStats {
  total: number;
  active: number;
  inactive: number;
}

export interface DepartmentStats {
  departments: { id: string; name: string; employeeCount: number }[];
  topDepartment: string | null;
}

export interface AttendanceStats {
  totalRecords: number;
  lateCount: number;
  presentCount: number;
  absentCount: number;
}

export interface LeaveStats {
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
}

export interface PayrollStats {
  latestPeriod: string | null;
  status: string | null;
  totalNetAmount: number | null;
}

export interface DocumentStats {
  totalDocuments: number;
  expiringCount: number;
  missingCount: number;
}

@Injectable()
export class AiDataService {
  private readonly logger = new Logger(AiDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly analytics?: AiAnalyticsService
  ) {}

  async getEmployeeStatistics(
    organizationId: string,
    permissions: Set<string>
  ): Promise<EmployeeStats | null> {
    if (!permissions.has(PERMISSIONS.EMPLOYEE_READ)) return null;

    const [total, active, inactive] = await Promise.all([
      this.prisma.employee.count({ where: { organizationId } }),
      this.prisma.employee.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.employee.count({ where: { organizationId, status: 'INACTIVE' } }),
    ]);

    return { total, active, inactive };
  }

  async getDepartmentStatistics(
    organizationId: string,
    permissions: Set<string>
  ): Promise<DepartmentStats | null> {
    if (!permissions.has(PERMISSIONS.DEPARTMENT_READ)) return null;

    const depts = await this.prisma.department.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: { employees: true },
        },
      },
    });

    const departments = depts.map((d) => ({
      id: d.id,
      name: d.name,
      employeeCount: d._count.employees,
    }));

    departments.sort((a, b) => b.employeeCount - a.employeeCount);
    const topDepartment = departments.length > 0 ? departments[0].name : null;

    return { departments, topDepartment };
  }

  async getAttendanceStatistics(
    organizationId: string,
    permissions: Set<string>
  ): Promise<AttendanceStats | null> {
    if (!permissions.has(PERMISSIONS.ATTENDANCE_READ) && !permissions.has(PERMISSIONS.ATTENDANCE_MANAGE)) {
      return null;
    }

    const [totalRecords, lateCount, presentCount, absentCount] = await Promise.all([
      this.prisma.attendanceRecord.count({ where: { organizationId } }),
      this.prisma.attendanceRecord.count({ where: { organizationId, status: 'LATE' } }),
      this.prisma.attendanceRecord.count({ where: { organizationId, status: 'PRESENT' } }),
      this.prisma.attendanceRecord.count({ where: { organizationId, status: 'ABSENT' } }),
    ]);

    return { totalRecords, lateCount, presentCount, absentCount };
  }

  async getLeaveStatistics(
    organizationId: string,
    permissions: Set<string>
  ): Promise<LeaveStats | null> {
    if (!permissions.has(PERMISSIONS.LEAVE_READ) && !permissions.has(PERMISSIONS.LEAVE_APPROVE)) {
      return null;
    }

    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      this.prisma.leaveRequest.count({ where: { organizationId, status: 'PENDING' } }),
      this.prisma.leaveRequest.count({ where: { organizationId, status: 'APPROVED' } }),
      this.prisma.leaveRequest.count({ where: { organizationId, status: 'REJECTED' } }),
    ]);

    return { pendingCount, approvedCount, rejectedCount };
  }

  async getPayrollStatistics(
    organizationId: string,
    permissions: Set<string>
  ): Promise<PayrollStats | null> {
    if (!permissions.has(PERMISSIONS.PAYROLL_READ)) return null;

    const latestPeriod = await this.prisma.payrollPeriod.findFirst({
      where: { organizationId, status: { in: ['APPROVED', 'FINALIZED', 'CALCULATED'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestPeriod) {
      return { latestPeriod: null, status: null, totalNetAmount: null };
    }

    return {
      latestPeriod: latestPeriod.name,
      status: latestPeriod.status,
      totalNetAmount: Number(latestPeriod.totalNet),
    };
  }

  async getDocumentStatistics(
    organizationId: string,
    permissions: Set<string>
  ): Promise<DocumentStats | null> {
    if (!permissions.has(PERMISSIONS.DOCUMENT_READ)) return null;

    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

    const [totalDocuments, expiringCount, missingCount] = await Promise.all([
      this.prisma.employeeDocument.count({
        where: { organizationId, deletedAt: null, status: { not: 'ARCHIVED' } },
      }),
      this.prisma.employeeDocument.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { not: 'ARCHIVED' },
          expiryDate: {
            lte: thirtyDaysAhead,
          },
        },
      }),
      this.prisma.documentRequirement.count({
        where: { organizationId, isRequired: true },
      }),
    ]);

    return { totalDocuments, expiringCount, missingCount };
  }

  async buildContextSummary(organizationId: string, userId: string): Promise<string> {
    const [org, permsList] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, slug: true },
      }),
      this.authorization.effectivePermissions(userId, organizationId),
    ]);

    const permissions = new Set<string>(permsList ?? []);
    const orgName = org?.name ?? 'Doanh nghiệp';

    const [empStats, deptStats, attStats, leaveStats, payStats, docStats] = await Promise.all([
      this.getEmployeeStatistics(organizationId, permissions),
      this.getDepartmentStatistics(organizationId, permissions),
      this.getAttendanceStatistics(organizationId, permissions),
      this.getLeaveStatistics(organizationId, permissions),
      this.getPayrollStatistics(organizationId, permissions),
      this.getDocumentStatistics(organizationId, permissions),
    ]);

    const sections: string[] = [
      `Bạn là Trợ lý AI của hệ thống quản trị doanh nghiệp DX-OS cho tổ chức "${orgName}".`,
      'Nhiệm vụ của bạn là hỗ trợ giải đáp thông tin, thống kê số liệu dựa trên dữ liệu thực tế được cung cấp bên dưới.',
      'QUY TẮC BẢO MẬT & PHÂN QUYỀN (RBAC):',
      '1. Chỉ sử dụng dữ liệu được cung cấp dưới đây của tổ chức hiện tại. Tuyệt đối không suy đoán hoặc bịa đặt số liệu tổ chức khác.',
      '2. Tôn trọng phân quyền: Nếu người dùng hỏi về lĩnh vực mà họ không có quyền (VD: tiền lương khi không có quyền payroll:read), hãy từ chối lịch sự và nêu rõ cần quyền tương ứng.',
      '3. Trả lời súc tích, chuyên nghiệp, chính xác bằng tiếng Việt.',
      '\n--- DỮ LIỆU TỔ CHỨC HIỆN TẠI ---',
    ];

    if (empStats) {
      sections.push(
        `- Nhân sự: Tổng số nhân sự: ${empStats.total} (Đang hoạt động: ${empStats.active}, Ngừng hoạt động: ${empStats.inactive})`
      );
    }

    if (deptStats) {
      const deptList = deptStats.departments.map((d) => `${d.name} (${d.employeeCount} người)`).join(', ');
      sections.push(
        `- Phòng ban: ${deptStats.departments.length} phòng ban: ${deptList}. Phòng ban đông nhất: ${deptStats.topDepartment || 'Chưa xác định'}`
      );
    }

    if (attStats) {
      sections.push(
        `- Chấm công: Tổng lượt ghi nhận: ${attStats.totalRecords}, Đúng giờ: ${attStats.presentCount}, Đi muộn: ${attStats.lateCount}, Vắng mặt: ${attStats.absentCount}`
      );
    }

    if (leaveStats) {
      sections.push(
        `- Nghỉ phép: Đang chờ duyệt: ${leaveStats.pendingCount}, Đã duyệt: ${leaveStats.approvedCount}, Từ chối: ${leaveStats.rejectedCount}`
      );
    }

    if (permissions.has(PERMISSIONS.PAYROLL_READ)) {
      if (payStats && payStats.latestPeriod) {
        sections.push(
          `- Tiền lương: Kỳ gần nhất "${payStats.latestPeriod}" (Trạng thái: ${payStats.status}), Tổng thực nhận: ${payStats.totalNetAmount ? payStats.totalNetAmount.toLocaleString('vi-VN') + ' VND' : 'Đang tính toán'}`
        );
      } else {
        sections.push('- Tiền lương: Chưa có kỳ lương nào được chốt trong hệ thống.');
      }
    } else {
      sections.push(
        '- Tiền lương: Người dùng hiện tại KHÔNG có quyền xem thông tin lương (payroll:read). Tuyệt đối KHÔNG cung cấp số liệu lương.'
      );
    }

    if (docStats) {
      sections.push(
        `- Hồ sơ & Tuân thủ: Tổng số tài liệu: ${docStats.totalDocuments}, Sắp hết hạn trong 30 ngày: ${docStats.expiringCount}, Quy định bắt buộc: ${docStats.missingCount}`
      );
    }

    return sections.join('\n');
  }

  /**
   * Builds an enriched system prompt containing both core counters and comprehensive,
   * deterministically calculated analytics metrics based on user intent and time range.
   */
  async buildAnalyticsContext(
    organizationId: string,
    userId: string,
    userMessage: string
  ): Promise<string> {
    const baseSummary = await this.buildContextSummary(organizationId, userId);
    if (!this.analytics) return baseSummary;

    const permsList = await this.authorization.effectivePermissions(userId, organizationId);
    const permissions = new Set<string>(permsList ?? []);

    const { current, previous } = this.analytics.parseTimeRange(userMessage);

    // Fetch cross-domain overview and all relevant analytics
    const hrOverview = await this.analytics.getHROverview(organizationId, permissions, current, previous);

    const analyticsSections: string[] = [
      baseSummary,
      `\n--- BÁO CÁO PHÂN TÍCH CHUYÊN SÂU (VALIDATED ANALYTICS METRICS - ${current.label}) ---`,
    ];

    // 1. Workforce Analytics
    if (hrOverview.workforce) {
      const wf = hrOverview.workforce;
      const deptBreakdown = wf.departments.map((d) => `${d.name}: ${d.employeeCount} người (${d.percentage}%)`).join('; ');
      analyticsSections.push(
        `[WORKFORCE ANALYTICS]\n- Tổng nhân sự: ${wf.total}, Đang hoạt động: ${wf.active}, Ngừng hoạt động: ${wf.inactive}\n- Tuyển mới trong kỳ: ${wf.newHiresInRange}\n- Phân bố phòng ban: ${deptBreakdown}\n- Phòng ban đông nhất: ${wf.topDepartment ? `${wf.topDepartment.name} (${wf.topDepartment.count} người)` : 'Không có'}`
      );
    }

    // 2. Attendance Analytics
    if (hrOverview.attendance) {
      const att = hrOverview.attendance;
      let compText = 'Không đủ dữ liệu để thực hiện so sánh kỳ trước.';
      if (att.comparison) {
        const signRate = (att.comparison.lateRateDelta ?? 0) >= 0 ? '+' : '';
        const signCount = (att.comparison.lateCountDelta ?? 0) >= 0 ? '+' : '';
        compText = `So với ${att.comparison.previousRangeLabel}: Tỷ lệ đi làm thay đổi ${att.comparison.attendanceRateDelta ?? 0} điểm phần trăm; Tỷ lệ đi muộn thay đổi ${signRate}${att.comparison.lateRateDelta ?? 0} điểm phần trăm; Số lượt đi muộn thay đổi ${signCount}${att.comparison.lateCountDelta ?? 0} lượt (${att.comparison.lateCountRelativeChangePercent !== null ? `${att.comparison.lateCountRelativeChangePercent}% tương đối` : 'N/A'}).`;
      }

      const deptAttList = att.departmentBreakdown.map((d) => `${d.departmentName}: tỷ lệ đi làm ${d.attendanceRate ?? 0}%, tỷ lệ muộn ${d.lateRate ?? 0}% (${d.lateCount} lượt)`).join('; ');

      analyticsSections.push(
        `[ATTENDANCE ANALYTICS]\n- Kỳ: ${current.label}\n- Tổng lượt ghi nhận: ${att.totalRecords} (Đúng giờ/Có mặt: ${att.presentCount}, Đi muộn: ${att.lateCount}, Vắng mặt: ${att.absentCount}, Nghỉ phép: ${att.onLeaveCount}, Về sớm: ${att.earlyLeaveCount})\n- Tỷ lệ đi làm (Attendance rate): ${att.attendanceRate ?? 0}%\n- Tỷ lệ đi muộn (Late rate): ${att.lateRate ?? 0}%\n- Tổng giờ làm: ${att.totalWorkedHours} giờ (Trung bình: ${att.averageWorkedHoursPerRecord ?? 0} giờ/lượt)\n- So sánh kỳ: ${compText}\n- Phân bố theo phòng ban: ${deptAttList || 'Chưa có dữ liệu phòng ban'}`
      );
    }

    // 3. Leave Analytics
    if (hrOverview.leave) {
      const lv = hrOverview.leave;
      const typeList = lv.byType.map((t) => `${t.type}: ${t.count} đơn (${t.approvedDays} ngày duyệt)`).join('; ');
      let lvComp = 'Không đủ dữ liệu để thực hiện so sánh kỳ trước.';
      if (lv.comparison) {
        const signReq = (lv.comparison.totalRequestsDelta ?? 0) >= 0 ? '+' : '';
        const signDays = (lv.comparison.approvedDaysDelta ?? 0) >= 0 ? '+' : '';
        lvComp = `So với ${lv.comparison.previousRangeLabel}: Số đơn nghỉ thay đổi ${signReq}${lv.comparison.totalRequestsDelta} đơn; Số ngày nghỉ duyệt thay đổi ${signDays}${lv.comparison.approvedDaysDelta} ngày.`;
      }

      analyticsSections.push(
        `[LEAVE ANALYTICS]\n- Tổng số đơn: ${lv.totalRequests} (Chờ duyệt: ${lv.pendingCount}, Đã duyệt: ${lv.approvedCount}, Từ chối: ${lv.rejectedCount}, Đã hủy: ${lv.cancelledCount})\n- Tổng ngày nghỉ đã duyệt: ${lv.totalApprovedDays} ngày\n- Ngày nghỉ trung bình mỗi nhân viên active: ${lv.averageApprovedDaysPerEmployee ?? 0} ngày/người\n- Phân loại theo hình thức: ${typeList || 'Không có'}\n- So sánh kỳ: ${lvComp}`
      );
    }

    // 4. Payroll Analytics (STRICT RBAC CHECK)
    if (permissions.has(PERMISSIONS.PAYROLL_READ)) {
      if (hrOverview.payroll && hrOverview.payroll.currencies.length > 0) {
        const py = hrOverview.payroll;
        const curList = py.currencies.map((c) => {
          let cComp = '';
          if (c.comparison) {
            const sign = c.comparison.netDelta >= 0 ? '+' : '';
            cComp = ` (So với ${c.comparison.previousPeriodName}: thay đổi ${sign}${c.comparison.netDelta.toLocaleString('vi-VN')} ${c.currency} [${c.comparison.relativeChangePercent ?? 0}%])`;
          }
          return `${c.currency}: Tổng chi phí Net: ${c.totalNet.toLocaleString('vi-VN')} ${c.currency}, Tổng Gross: ${c.totalGross.toLocaleString('vi-VN')} ${c.currency}, Số nhân viên: ${c.employeeCount}, Trung bình: ${c.averageNet ? c.averageNet.toLocaleString('vi-VN') : 0} ${c.currency}/người${cComp}`;
        }).join('\n  ');

        const deptPay = py.departmentBreakdown.map((d) => `${d.departmentName}: ${d.totalNet.toLocaleString('vi-VN')} ${d.currency} (${d.employeeCount} người)`).join('; ');

        analyticsSections.push(
          `[PAYROLL ANALYTICS]\n- Kỳ lương gần nhất: ${py.periodName} (Trạng thái: ${py.periodStatus})\n- Chi tiết theo loại tiền tệ (KHÔNG cộng gộp VND và USD):\n  ${curList}\n- Chi phí theo phòng ban: ${deptPay || 'Không có'}`
        );
      } else {
        analyticsSections.push('[PAYROLL ANALYTICS]\n- Không có dữ liệu kỳ lương nào đã chốt trong hệ thống.');
      }
    } else {
      analyticsSections.push(
        '[PAYROLL ANALYTICS]\n- NGƯỜI DÙNG KHÔNG CÓ QUYỀN payroll:read. TUYỆT ĐỐI TỪ CHỐI cung cấp bất kỳ số liệu hay phỏng đoán nào liên quan đến lương.'
      );
    }

    // 5. Performance Analytics
    if (hrOverview.performance) {
      const pf = hrOverview.performance;
      const distList = pf.ratingDistribution.map((d) => `${d.rating} sao: ${d.count} (${d.percentage}%)`).join(', ');
      const deptPf = pf.departmentBreakdown.map((d) => `${d.departmentName}: rating trung bình ${d.averageRating ?? 'N/A'}/5 (${d.reviewCount} đánh giá)`).join('; ');

      analyticsSections.push(
        `[PERFORMANCE ANALYTICS]\n- Tổng số đánh giá: ${pf.totalReviews} (Đã hoàn thành: ${pf.completedReviews}, Đã hủy: ${pf.cancelledReviews})\n- Tỷ lệ hoàn thành đánh giá: ${pf.completionRate ?? 0}%\n- Điểm đánh giá trung bình: ${pf.averageRating ?? 'N/A'}/5\n- Phân bố xếp hạng: ${distList}\n- Tiến độ hoàn thành mục tiêu (Goal progress) trung bình: ${pf.averageGoalProgress ?? 'N/A'}%\n- Điểm KPI trung bình: ${pf.averageKpiScore ?? 'N/A'}/100\n- Hiệu suất theo phòng ban: ${deptPf || 'Chưa có'}`
      );
    }

    // 6. Compliance Analytics
    if (hrOverview.compliance) {
      const cp = hrOverview.compliance;
      const deptCp = cp.departmentBreakdown.map((d) => `${d.departmentName}: tỷ lệ tuân thủ ${d.complianceRate ?? 0}% (${d.missingCount} tài liệu thiếu)`).join('; ');

      analyticsSections.push(
        `[COMPLIANCE & DOCUMENTS ANALYTICS]\n- Tổng số tài liệu: ${cp.totalDocuments} (Đang hiệu lực: ${cp.activeDocuments}, Đã hết hạn: ${cp.expiredCount}, Sắp hết hạn 30 ngày: ${cp.expiringSoonCount})\n- Yêu cầu bắt buộc còn thiếu: ${cp.missingRequiredCount}\n- Tỷ lệ tuân thủ hồ sơ (Compliance rate): ${cp.complianceRate ?? 0}%\n- Số nhân sự đạt 100% tuân thủ: ${cp.compliantEmployeesCount}/${cp.totalEmployees}\n- Tuân thủ theo phòng ban: ${deptCp || 'Chưa có'}`
      );
    }

    // 7. Pre-computed Insights & Anomalies
    if (hrOverview.insights.length > 0) {
      analyticsSections.push(`[KEY INSIGHTS]\n${hrOverview.insights.map((i) => `- ${i}`).join('\n')}`);
    }
    if (hrOverview.anomalies.length > 0) {
      analyticsSections.push(`[DETECTED ANOMALIES & ATTENTION POINTS]\n${hrOverview.anomalies.map((a) => `- ${a}`).join('\n')}`);
    }

    // Directives for Analytics Responses
    analyticsSections.push(`
QUY TẮC PHẢN HỒI ANALYTICS:
1. Đối với các câu hỏi phân tích, hãy trình bày câu trả lời theo cấu trúc chuẩn:
## Tổng quan
(Tóm tắt ngắn gọn 1-2 câu về tình hình của mảng được hỏi)
## Chỉ số chính
(Các gạch đầu dòng liệt kê số liệu chính xác từ dữ liệu phía trên)
## So sánh
(So sánh với kỳ trước hoặc giữa các phòng ban, nêu rõ metric cụ thể. Nếu không có kỳ trước, ghi rõ "Không đủ dữ liệu để thực hiện so sánh.")
## Insight
(Các phát hiện quan trọng dựa trên số liệu thực tế)
## Cần chú ý
(Các vấn đề bất thường, cảnh báo rủi ro hoặc điểm cần hành động)
2. Phân biệt rõ "điểm phần trăm" (percentage points) và "% thay đổi tương đối" (relative change).
3. Tuyệt đối KHÔNG suy diễn nguyên nhân chủ quan nếu dữ liệu không có (ví dụ: không nói "nhân viên lười" hay "quản lý yếu", chỉ nói "Dữ liệu hiện có chưa xác định được nguyên nhân").
4. Tiền lương: Tuyệt đối KHÔNG cộng gộp các loại tiền tệ khác nhau (VND, USD). Tôn trọng quyền payroll:read.
`);

    return analyticsSections.join('\n\n');
  }
}
