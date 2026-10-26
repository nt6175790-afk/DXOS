// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Polyfill HTMLDialogElement methods for JSDOM globally
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.show = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
} else {
  (window as unknown as Record<string, unknown>).HTMLDialogElement = class HTMLDialogElement extends HTMLElement {
    show() {
      this.setAttribute('open', '');
    }
    showModal() {
      this.setAttribute('open', '');
    }
    close() {
      this.removeAttribute('open');
    }
  };
}

// Default mock for usePermission so feature tests have full permissions unless specifically overridden
vi.mock('@/hooks/usePermission', () => ({
  usePermission: vi.fn(() => ({
    permissions: [
      'organization:read',
      'organization:update',
      'department:read',
      'department:create',
      'department:update',
      'employee:read',
      'employee:create',
      'employee:update',
      'task:read',
      'task:create',
      'task:update',
      'task:assign',
      'file:read',
      'file:upload',
      'file:delete',
      'ai:use',
      'audit:read',
      'role:read',
      'role:assign',
    ],
    hasPermission: vi.fn(() => true),
    hasAnyPermission: vi.fn(() => true),
    isLoading: false,
    error: null,
    refreshPermissions: vi.fn(),
  })),
  clearPermissionCache: vi.fn(),
}));

