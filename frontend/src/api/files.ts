// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { api } from './client';
import type { FileMetadata, PaginatedResponse, FileListParams } from './types';

function basePath(orgId: string) {
  return `/organizations/${orgId}/files`;
}

export async function listFiles(
  orgId: string,
  params?: FileListParams
): Promise<PaginatedResponse<FileMetadata>> {
  const response = await api.get<PaginatedResponse<FileMetadata>>(basePath(orgId), { params });
  return response.data;
}

export async function uploadFile(
  orgId: string,
  file: File
): Promise<FileMetadata> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post<FileMetadata>(basePath(orgId), formData, {
    headers: { 'Content-Type': undefined },
    timeout: 60000,
  });
  return response.data;
}

export async function getFileMetadata(
  orgId: string,
  fileId: string
): Promise<FileMetadata> {
  const response = await api.get<FileMetadata>(`${basePath(orgId)}/${fileId}`);
  return response.data;
}

export async function downloadFile(
  orgId: string,
  fileId: string
): Promise<Blob> {
  const response = await api.get<Blob>(`${basePath(orgId)}/${fileId}/content`, {
    responseType: 'blob',
  });
  return response.data;
}

export async function deleteFile(
  orgId: string,
  fileId: string
): Promise<FileMetadata> {
  const response = await api.delete<FileMetadata>(`${basePath(orgId)}/${fileId}`);
  return response.data;
}
