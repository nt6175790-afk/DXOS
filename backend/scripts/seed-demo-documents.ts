// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { PrismaClient, DocumentCategory, DocumentSensitivity, DocumentStatus } from '@prisma/client';
import { demoPdf } from './demo/demo-fixtures';
import { LocalStorageService } from '../src/modules/files/local-storage.service';
import { ConfigService } from '@nestjs/config';

const envPath = resolve(__dirname, '../.env');
if (!process.env.DATABASE_URL && existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: 'dxos-demo' } });
  if (!org) throw new Error('Demo organization not found');

  const config = new ConfigService({
    FILE_STORAGE_ROOT: process.env.FILE_STORAGE_ROOT || resolve(__dirname, '../outputs/demo-files'),
  });
  const storage = new LocalStorageService(config);

  const adminUser = await prisma.user.findUnique({ where: { email: 'admin.demo@dxos.local' } });
  if (!adminUser) throw new Error('Admin user not found');

  const employees = await prisma.employee.findMany({
    where: { organizationId: org.id },
  });
  const empMap = new Map(employees.map((e) => [e.employeeCode, e]));

  // Ensure default requirements
  const defaultReqs = [
    { category: DocumentCategory.LABOR_CONTRACT, name: 'Hợp đồng lao động', isRequired: true },
    { category: DocumentCategory.IDENTIFICATION, name: 'Căn cước công dân / Hộ chiếu', isRequired: true },
    { category: DocumentCategory.CERTIFICATE, name: 'Bằng cấp & Chứng chỉ chuyên môn', isRequired: true },
    { category: DocumentCategory.INSURANCE, name: 'Bảo hiểm & Hồ sơ y tế', isRequired: true },
  ];

  for (const r of defaultReqs) {
    const existing = await prisma.documentRequirement.findFirst({
      where: { organizationId: org.id, category: r.category },
    });
    if (!existing) {
      await prisma.documentRequirement.create({
        data: {
          organizationId: org.id,
          category: r.category,
          name: r.name,
          isRequired: r.isRequired,
        },
      });
    }
  }

  // Helper to create file object and physical file
  async function createRealFile(filename: string, title: string, lines: string[]) {
    const pdfBuffer = demoPdf(title, lines);
    const storageKey = randomUUID();
    const stream = Readable.from(pdfBuffer);
    const stored = await storage.put(storageKey, stream);

    const file = await prisma.fileObject.create({
      data: {
        organizationId: org.id,
        uploadedByUserId: adminUser.id,
        originalFilename: filename,
        contentType: 'application/pdf',
        storageProvider: 'LOCAL',
        storageKey,
        status: 'AVAILABLE',
        size: stored.size,
        checksum: stored.checksum,
      },
    });
    return file;
  }

  // Clear existing documents in demo org for clean rerun
  await prisma.documentVersion.deleteMany({ where: { organizationId: org.id } });
  await prisma.employeeDocument.deleteMany({ where: { organizationId: org.id } });

  // 1. Admin Documents (DEMO-EMP-001)
  const empAdmin = empMap.get('DEMO-EMP-001');
  if (empAdmin) {
    // Contract v1
    const file1 = await createRealFile(
      'HDLD-DEMO-001.pdf',
      'Hop dong lao dong - Ban Giam doc',
      ['Hop dong lao dong khong xac dinh thoi han', 'Chuc vu: Giam doc dieu hanh', 'Muc luong: Thoa thuan theo quy che'],
    );
    const doc1 = await prisma.employeeDocument.create({
      data: {
        organizationId: org.id,
        employeeId: empAdmin.id,
        title: 'Hợp đồng lao động - Ban Giám đốc',
        documentNumber: 'HĐLĐ-2024-001',
        category: DocumentCategory.LABOR_CONTRACT,
        sensitivity: DocumentSensitivity.SENSITIVE,
        status: DocumentStatus.ACTIVE,
        issueDate: new Date('2024-01-01'),
        expiryDate: new Date('2027-01-01'),
        notes: 'Hợp đồng lao động chính thức Ban Giám đốc',
      },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: doc1.id,
        versionNumber: 1,
        fileId: file1.id,
        fileName: file1.originalFilename,
        fileSize: file1.size!,
        contentType: file1.contentType,
        checksum: file1.checksum,
        changeSummary: 'Phiên bản ban đầu',
        uploadedByUserId: adminUser.id,
      },
    });

    // Contract v2 (Amendment)
    const file1v2 = await createRealFile(
      'Phu-luc-HDLD-001.pdf',
      'Phu luc Hop dong lao dong - Ban Giam doc',
      ['Dieu chinh phu cap quan ly va trach nhiem', 'Ngay hieu luc: 2025-01-01'],
    );
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: doc1.id,
        versionNumber: 2,
        fileId: file1v2.id,
        fileName: file1v2.originalFilename,
        fileSize: file1v2.size!,
        contentType: file1v2.contentType,
        checksum: file1v2.checksum,
        changeSummary: 'Cập nhật phụ lục điều chỉnh phụ cấp trách nhiệm',
        uploadedByUserId: adminUser.id,
      },
    });

    // CCCD
    const file2 = await createRealFile(
      'CCCD-Admin.pdf',
      'Can cuoc cong dan - Admin Demo',
      ['So CCCD: 001089012345', 'Noi cap: Cuc Canh sat QLHC ve TTXH'],
    );
    const doc2 = await prisma.employeeDocument.create({
      data: {
        organizationId: org.id,
        employeeId: empAdmin.id,
        title: 'Căn cước công dân gắn chip',
        documentNumber: '001089012345',
        category: DocumentCategory.IDENTIFICATION,
        sensitivity: DocumentSensitivity.NORMAL,
        status: DocumentStatus.ACTIVE,
        issueDate: new Date('2021-05-15'),
        expiryDate: new Date('2031-05-15'),
      },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: doc2.id,
        versionNumber: 1,
        fileId: file2.id,
        fileName: file2.originalFilename,
        fileSize: file2.size!,
        contentType: file2.contentType,
        checksum: file2.checksum,
        changeSummary: 'Bản quét CCCD',
        uploadedByUserId: adminUser.id,
      },
    });

    // Certificate
    const file3 = await createRealFile(
      'Chung-chi-MBA.pdf',
      'Bang Thac si Quan tri Kinh doanh MBA',
      ['Chuyen nganh: Quan tri Chien luoc Doanh nghiep'],
    );
    const doc3 = await prisma.employeeDocument.create({
      data: {
        organizationId: org.id,
        employeeId: empAdmin.id,
        title: 'Bằng Thạc sĩ Quản trị Kinh doanh (MBA)',
        documentNumber: 'MBA-2018-88',
        category: DocumentCategory.CERTIFICATE,
        sensitivity: DocumentSensitivity.NORMAL,
        status: DocumentStatus.ACTIVE,
        issueDate: new Date('2018-09-20'),
      },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: doc3.id,
        versionNumber: 1,
        fileId: file3.id,
        fileName: file3.originalFilename,
        fileSize: file3.size!,
        contentType: file3.contentType,
        checksum: file3.checksum,
        changeSummary: 'Bằng cấp sau đại học',
        uploadedByUserId: adminUser.id,
      },
    });

    // Insurance
    const file4 = await createRealFile(
      'So-BHXH-Admin.pdf',
      'So Bao hiem Xa hoi - Admin Demo',
      ['Ma so BHXH: 7912345678', 'Don vi dong: DX-OS Organization'],
    );
    const doc4 = await prisma.employeeDocument.create({
      data: {
        organizationId: org.id,
        employeeId: empAdmin.id,
        title: 'Sổ Bảo hiểm Xã hội điện tử',
        documentNumber: 'BHXH-7912345678',
        category: DocumentCategory.INSURANCE,
        sensitivity: DocumentSensitivity.NORMAL,
        status: DocumentStatus.ACTIVE,
        issueDate: new Date('2020-01-01'),
      },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: doc4.id,
        versionNumber: 1,
        fileId: file4.id,
        fileName: file4.originalFilename,
        fileSize: file4.size!,
        contentType: file4.contentType,
        checksum: file4.checksum,
        changeSummary: 'Sổ BHXH',
        uploadedByUserId: adminUser.id,
      },
    });
  }

  // 2. Nguyen Van An Documents (DEMO-EMP-002)
  const empAn = empMap.get('DEMO-EMP-002');
  if (empAn) {
    const fileAn1 = await createRealFile(
      'HDLD-NguyenVanAn.pdf',
      'Hop dong lao dong - Nguyen Van An',
      ['Chuc vu: Chuyen vien kinh doanh', 'Thoi han: 24 thang', 'Tu ngay 01/02/2025 den 01/02/2027'],
    );
    const docAn1 = await prisma.employeeDocument.create({
      data: {
        organizationId: org.id,
        employeeId: empAn.id,
        title: 'Hợp đồng lao động xác định thời hạn 24 tháng',
        documentNumber: 'HĐLĐ-2025-042',
        category: DocumentCategory.LABOR_CONTRACT,
        sensitivity: DocumentSensitivity.NORMAL,
        status: DocumentStatus.ACTIVE,
        issueDate: new Date('2025-02-01'),
        expiryDate: new Date('2027-02-01'),
      },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: docAn1.id,
        versionNumber: 1,
        fileId: fileAn1.id,
        fileName: fileAn1.originalFilename,
        fileSize: fileAn1.size!,
        contentType: fileAn1.contentType,
        checksum: fileAn1.checksum,
        changeSummary: 'Bản ký HĐLĐ 2 năm',
        uploadedByUserId: adminUser.id,
      },
    });

    const fileAn2 = await createRealFile(
      'CCCD-NguyenVanAn.pdf',
      'Can cuoc cong dan - Nguyen Van An',
      ['So CCCD: 001092023456', 'Que quan: Ha Noi'],
    );
    const docAn2 = await prisma.employeeDocument.create({
      data: {
        organizationId: org.id,
        employeeId: empAn.id,
        title: 'Căn cước công dân - Nguyễn Văn An',
        documentNumber: '001092023456',
        category: DocumentCategory.IDENTIFICATION,
        sensitivity: DocumentSensitivity.NORMAL,
        status: DocumentStatus.ACTIVE,
        issueDate: new Date('2022-03-10'),
        expiryDate: new Date('2032-03-10'),
      },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: docAn2.id,
        versionNumber: 1,
        fileId: fileAn2.id,
        fileName: fileAn2.originalFilename,
        fileSize: fileAn2.size!,
        contentType: fileAn2.contentType,
        checksum: fileAn2.checksum,
        changeSummary: 'Bản quét CCCD',
        uploadedByUserId: adminUser.id,
      },
    });

    const fileAn3 = await createRealFile(
      'So-BHXH-NguyenVanAn.pdf',
      'So Bao hiem Xa hoi - Nguyen Van An',
      ['Ma so BHXH: 7923456789'],
    );
    const docAn3 = await prisma.employeeDocument.create({
      data: {
        organizationId: org.id,
        employeeId: empAn.id,
        title: 'Sổ Bảo hiểm Xã hội - Nguyễn Văn An',
        documentNumber: 'BHXH-7923456789',
        category: DocumentCategory.INSURANCE,
        sensitivity: DocumentSensitivity.NORMAL,
        status: DocumentStatus.ACTIVE,
        issueDate: new Date('2022-04-01'),
      },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: docAn3.id,
        versionNumber: 1,
        fileId: fileAn3.id,
        fileName: fileAn3.originalFilename,
        fileSize: fileAn3.size!,
        contentType: fileAn3.contentType,
        checksum: fileAn3.checksum,
        changeSummary: 'Sổ BHXH',
        uploadedByUserId: adminUser.id,
      },
    });
  }

  // 3. Tran Minh Anh (DEMO-EMP-003): has expiring soon & expired documents
  const empAnh = empMap.get('DEMO-EMP-003');
  if (empAnh) {
    const fileAnh1 = await createRealFile(
      'HDLD-TranMinhAnh.pdf',
      'Hop dong lao dong - Tran Minh Anh',
      ['Chuc vu: Ky su phan mem', 'Phong: Phong Ky thuat'],
    );
    const docAnh1 = await prisma.employeeDocument.create({
      data: {
        organizationId: org.id,
        employeeId: empAnh.id,
        title: 'Hợp đồng lao động - Kỹ sư phần mềm',
        documentNumber: 'HĐLĐ-2024-089',
        category: DocumentCategory.LABOR_CONTRACT,
        sensitivity: DocumentSensitivity.NORMAL,
        status: DocumentStatus.ACTIVE,
        issueDate: new Date('2024-03-01'),
        expiryDate: new Date('2027-03-01'),
      },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: docAnh1.id,
        versionNumber: 1,
        fileId: fileAnh1.id,
        fileName: fileAnh1.originalFilename,
        fileSize: fileAnh1.size!,
        contentType: fileAnh1.contentType,
        checksum: fileAnh1.checksum,
        changeSummary: 'Hợp đồng lao động chính thức',
        uploadedByUserId: adminUser.id,
      },
    });

    const fileAnh2 = await createRealFile(
      'Ho-chieu-TranMinhAnh.pdf',
      'Ho chieu pho thong - Tran Minh Anh',
      ['So ho chieu: P01234567'],
    );
    const docAnh2 = await prisma.employeeDocument.create({
      data: {
        organizationId: org.id,
        employeeId: empAnh.id,
        title: 'Hộ chiếu phổ thông - Trần Minh Anh',
        documentNumber: 'P01234567',
        category: DocumentCategory.IDENTIFICATION,
        sensitivity: DocumentSensitivity.NORMAL,
        status: DocumentStatus.ACTIVE,
        issueDate: new Date('2023-08-10'),
        expiryDate: new Date('2033-08-10'),
      },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: docAnh2.id,
        versionNumber: 1,
        fileId: fileAnh2.id,
        fileName: fileAnh2.originalFilename,
        fileSize: fileAnh2.size!,
        contentType: fileAnh2.contentType,
        checksum: fileAnh2.checksum,
        changeSummary: 'Hộ chiếu',
        uploadedByUserId: adminUser.id,
      },
    });

    // Expiring Soon (15 days from now)
    const expiringSoonDate = new Date();
    expiringSoonDate.setDate(expiringSoonDate.getDate() + 15);
    const fileAnh3 = await createRealFile(
      'Chung-chi-AWS.pdf',
      'AWS Certified Solutions Architect',
      ['Certificate ID: AWS-PSA-9921', 'Expiring in 15 days'],
    );
    const docAnh3 = await prisma.employeeDocument.create({
      data: {
        organizationId: org.id,
        employeeId: empAnh.id,
        title: 'Chứng chỉ AWS Solutions Architect Associate',
        documentNumber: 'AWS-PSA-9921',
        category: DocumentCategory.CERTIFICATE,
        sensitivity: DocumentSensitivity.NORMAL,
        status: DocumentStatus.ACTIVE,
        issueDate: new Date('2023-11-15'),
        expiryDate: expiringSoonDate,
        notes: 'Sắp hết hạn trong 15 ngày, cần thi gia hạn lại',
      },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: docAnh3.id,
        versionNumber: 1,
        fileId: fileAnh3.id,
        fileName: fileAnh3.originalFilename,
        fileSize: fileAnh3.size!,
        contentType: fileAnh3.contentType,
        checksum: fileAnh3.checksum,
        changeSummary: 'Chứng chỉ chuyên môn',
        uploadedByUserId: adminUser.id,
      },
    });

    // Expired (10 days ago)
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 10);
    const fileAnh4 = await createRealFile(
      'BHYT-PVI-2025.pdf',
      'Bao hiem suc khoe nang cao PVI Care 2025',
      ['So the: PVI-2025-081', 'Expired 10 days ago'],
    );
    const docAnh4 = await prisma.employeeDocument.create({
      data: {
        organizationId: org.id,
        employeeId: empAnh.id,
        title: 'Thẻ Bảo hiểm Sức khỏe PVI Care 2025',
        documentNumber: 'PVI-2025-081',
        category: DocumentCategory.INSURANCE,
        sensitivity: DocumentSensitivity.NORMAL,
        status: DocumentStatus.ACTIVE,
        issueDate: new Date('2025-01-01'),
        expiryDate: expiredDate,
        notes: 'Đã hết hạn 10 ngày trước, đang chờ cấp thẻ 2026',
      },
    });
    await prisma.documentVersion.create({
      data: {
        organizationId: org.id,
        documentId: docAnh4.id,
        versionNumber: 1,
        fileId: fileAnh4.id,
        fileName: fileAnh4.originalFilename,
        fileSize: fileAnh4.size!,
        contentType: fileAnh4.contentType,
        checksum: fileAnh4.checksum,
        changeSummary: 'Thẻ BHYT năm cũ',
        uploadedByUserId: adminUser.id,
      },
    });
  }

  console.log('Seeded demo documents and versions successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
