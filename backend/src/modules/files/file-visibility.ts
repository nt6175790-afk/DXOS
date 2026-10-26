import type { Prisma } from '@prisma/client';
import type { AuthorizationService } from '../rbac/authorization.service';
import { PERMISSIONS } from '../rbac/permission-catalog';

// A generic file route must not bypass the sensitivity of an attached HR document.
export async function fileVisibility(authorization: AuthorizationService, tx: Prisma.TransactionClient,
  userId: string, organizationId: string): Promise<Prisma.FileObjectWhereInput> {
  if (await authorization.can(userId, PERMISSIONS.DOCUMENT_SENSITIVE_READ, organizationId, tx)) return {};
  return { documentVersions: { none: { document: { is: {
    sensitivity: 'SENSITIVE',
    NOT: { employee: { is: { organizationId, userId, status: 'ACTIVE' } } },
  } } } } };
}
