// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { SetMetadata } from '@nestjs/common';

export const ORGANIZATION_CONTEXT_PARAM = 'dx-os:organization-context-param';

export function OrganizationContext(parameterName = 'organizationId'): MethodDecorator & ClassDecorator {
  return SetMetadata(ORGANIZATION_CONTEXT_PARAM, parameterName);
}
