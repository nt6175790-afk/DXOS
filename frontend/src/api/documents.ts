// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';

export type DocumentCategory =
  | 'LABOR_CONTRACT'
  | 'IDENTIFICATION'
  | 'CERTIFICATE'
  | 'TRAINING'
  | 'INSURANCE'
  | 'DECISION'
  | 'HR_RECORD'
  | 'OTHER';

export type DocumentSensitivity = 'NORMAL' | 'SENSITIVE';

export type DocumentStatus = 'ACTIVE' | 'ARCHIVED' | 'EXPIRED';

export interface DocumentVersion {
  id: string;
  versionNumber: number;
  fileName: string;
  fileSize: number;
  contentType: string;
  checksum?: string | null;
  changeSummary?: string | null;
  uploadedByUserId: string;
  createdAt: string;
  fileId?: string;
}

export interface EmployeeDocument {
  id: string;
  organizationId: string;
  employeeId: string;
  title: string;
  documentNumber?: string | null;
  category: DocumentCategory;
  sensitivity: DocumentSensitivity;
  status: DocumentStatus;
  issueDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    employeeCode: string;
    displayName: string;
    departmentId?: string | null;
    department?: {
      id: string;
      name: string;
      code: string;
    } | null;
  };
  versions: DocumentVersion[];
}

export interface DocumentRequirement {
  id: string;
  organizationId: string;
  category: DocumentCategory;
  name: string;
  description?: string | null;
  isRequired: boolean;
  applicableDepartmentId?: string | null;
  department?: {
    id: string;
    name: string;
    code: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceSummary {
  totalDocuments: number;
  totalEmployees: number;
  totalExpectedRequirements: number;
  totalFulfilledRequirements: number;
  complianceRate: number;
  compliantEmployeesCount: number;
  missingDocumentsCount: number;
  expiringSoonCount: number;
  expiredCount: number;
}

export interface DepartmentCompliance {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  totalEmployees: number;
  compliantEmployees: number;
  complianceRate: number;
  missingCount: number;
}

export interface MissingDocumentItem {
  employeeId: string;
  employeeCode: string;
  displayName: string;
  jobTitle?: string | null;
  departmentId?: string | null;
  departmentName: string;
  category: DocumentCategory;
  requirementName: string;
  description?: string | null;
}

export interface ExpiringDocumentItem {
  id: string;
  title: string;
  category: DocumentCategory;
  documentNumber?: string | null;
  sensitivity: DocumentSensitivity;
  status: DocumentStatus;
  issueDate?: string | null;
  expiryDate?: string | null;
  isExpired: boolean;
  daysRemaining: number;
  employee?: {
    id: string;
    employeeCode: string;
    displayName: string;
    department?: {
      id: string;
      name: string;
    } | null;
  };
}

export interface EmployeeComplianceProfile {
  employeeId: string;
  totalRequired: number;
  totalFulfilled: number;
  complianceRate: number;
  isCompliant: boolean;
  missingRequirements: DocumentRequirement[];
  documents: EmployeeDocument[];
}

export interface DocumentQueryParams {
  employeeId?: string;
  category?: DocumentCategory;
  status?: DocumentStatus;
  sensitivity?: DocumentSensitivity;
  search?: string;
  expiringSoon?: boolean;
  limit?: number;
  cursor?: string;
}

export interface CreateDocumentPayload {
  employeeId: string;
  title: string;
  documentNumber?: string;
  category: DocumentCategory;
  sensitivity?: DocumentSensitivity;
  issueDate?: string;
  expiryDate?: string;
  notes?: string;
  fileId: string;
  changeSummary?: string;
}

export interface UpdateDocumentPayload {
  title?: string;
  documentNumber?: string;
  category?: DocumentCategory;
  sensitivity?: DocumentSensitivity;
  status?: DocumentStatus;
  issueDate?: string;
  expiryDate?: string;
  notes?: string;
}

export interface CreateVersionPayload {
  fileId: string;
  changeSummary?: string;
}

export interface CreateRequirementPayload {
  category: DocumentCategory;
  name: string;
  description?: string;
  isRequired?: boolean;
  applicableDepartmentId?: string;
}

export interface UpdateRequirementPayload {
  name?: string;
  description?: string;
  isRequired?: boolean;
  applicableDepartmentId?: string;
}

// API Methods
export async function listDocuments(
  orgId: string,
  params?: DocumentQueryParams,
): Promise<{ items: EmployeeDocument[]; nextCursor: string | null; total: number }> {
  return (await api.get<{ items: EmployeeDocument[]; nextCursor: string | null; total: number }>(`/organizations/${orgId}/documents`, { params })).data;
}

export async function getDocument(orgId: string, id: string): Promise<EmployeeDocument> {
  return (await api.get<EmployeeDocument>(`/organizations/${orgId}/documents/${id}`)).data;
}

export async function createDocument(
  orgId: string,
  payload: CreateDocumentPayload,
): Promise<EmployeeDocument> {
  return (await api.post<EmployeeDocument>(`/organizations/${orgId}/documents`, payload)).data;
}

export async function updateDocument(
  orgId: string,
  id: string,
  payload: UpdateDocumentPayload,
): Promise<EmployeeDocument> {
  return (await api.patch<EmployeeDocument>(`/organizations/${orgId}/documents/${id}`, payload)).data;
}

export async function createDocumentVersion(
  orgId: string,
  id: string,
  payload: CreateVersionPayload,
): Promise<DocumentVersion> {
  return (await api.post<DocumentVersion>(`/organizations/${orgId}/documents/${id}/versions`, payload)).data;
}

export async function archiveDocument(orgId: string, id: string): Promise<EmployeeDocument> {
  return (await api.post<EmployeeDocument>(`/organizations/${orgId}/documents/${id}/archive`, {})).data;
}

export async function restoreDocument(orgId: string, id: string): Promise<EmployeeDocument> {
  return (await api.post<EmployeeDocument>(`/organizations/${orgId}/documents/${id}/restore`, {})).data;
}

export async function deleteDocument(orgId: string, id: string): Promise<{ success: boolean }> {
  return (await api.delete<{ success: boolean }>(`/organizations/${orgId}/documents/${id}`)).data;
}

export function getDocumentDownloadUrl(orgId: string, id: string, versionId?: string): string {
  const base = `/api/v1/organizations/${orgId}/documents/${id}`;
  return versionId ? `${base}/versions/${versionId}/download` : `${base}/download`;
}

// Compliance API Methods
export async function getComplianceSummary(orgId: string): Promise<ComplianceSummary> {
  return (await api.get<ComplianceSummary>(`/organizations/${orgId}/compliance/summary`)).data;
}

export async function getDepartmentCompliance(orgId: string): Promise<DepartmentCompliance[]> {
  return (await api.get<DepartmentCompliance[]>(`/organizations/${orgId}/compliance/departments`)).data;
}

export async function getMissingDocuments(orgId: string): Promise<MissingDocumentItem[]> {
  return (await api.get<MissingDocumentItem[]>(`/organizations/${orgId}/compliance/missing`)).data;
}

export async function getExpiringDocuments(orgId: string): Promise<ExpiringDocumentItem[]> {
  return (await api.get<ExpiringDocumentItem[]>(`/organizations/${orgId}/compliance/expiring`)).data;
}

export async function getEmployeeCompliance(
  orgId: string,
  employeeId: string,
): Promise<EmployeeComplianceProfile> {
  if (!api?.get) {
    return {
      employeeId,
      totalRequired: 0,
      totalFulfilled: 0,
      complianceRate: 100,
      isCompliant: true,
      missingRequirements: [],
      documents: [],
    };
  }
  return (await api.get<EmployeeComplianceProfile>(`/organizations/${orgId}/compliance/employees/${employeeId}`)).data;
}

export async function listRequirements(orgId: string): Promise<DocumentRequirement[]> {
  return (await api.get<DocumentRequirement[]>(`/organizations/${orgId}/compliance/requirements`)).data;
}

export async function createRequirement(
  orgId: string,
  payload: CreateRequirementPayload,
): Promise<DocumentRequirement> {
  return (await api.post<DocumentRequirement>(`/organizations/${orgId}/compliance/requirements`, payload)).data;
}

export async function updateRequirement(
  orgId: string,
  id: string,
  payload: UpdateRequirementPayload,
): Promise<DocumentRequirement> {
  return (await api.patch<DocumentRequirement>(`/organizations/${orgId}/compliance/requirements/${id}`, payload)).data;
}

export async function deleteRequirement(
  orgId: string,
  id: string,
): Promise<{ success: boolean }> {
  return (await api.delete<{ success: boolean }>(`/organizations/${orgId}/compliance/requirements/${id}`)).data;
}
