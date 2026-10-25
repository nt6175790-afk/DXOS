import type { Permission } from '@/api/types';

// Display policy only. Every API continues to authorize on the server.
export const routePermissions: Record<string, Permission[]> = {
  '/reports': ['report:read'], '/departments': ['department:read'], '/people': ['employee:read'],
  '/tasks': ['task:read'], '/calendar': ['calendar:read'], '/documents': ['document:read'],
  '/workflows': ['workflow:read', 'workflow:manage'], '/automation': ['automation:read'], '/leave': ['leave:read'],
  '/attendance': ['attendance:read'], '/shifts': ['shift:read'], '/schedules': ['schedule:read'],
  '/approvals': ['approval:read'], '/payroll': ['payroll:read'], '/performance': ['performance:read'],
  '/files': ['file:read'], '/ai': ['ai:use'], '/settings': ['organization:read', 'role:read'],
};

export function canOpenRoute(path: string, hasPermission: (permission: Permission) => boolean): boolean {
  const key = '/' + path.split('/').filter(Boolean)[0];
  const required = routePermissions[key];
  return !required || required.some(hasPermission);
}
