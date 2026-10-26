// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { AiConversationContext, useConversationStore } from './ai-conversation';

/** Keeps the assistant conversation for the signed-in session while the user moves between pages. */
export function AiConversationProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { currentOrg } = useOrganization();
  const conversation = useConversationStore(user?.id, currentOrg?.id, isAuthenticated);
  return <AiConversationContext.Provider value={conversation}>{children}</AiConversationContext.Provider>;
}
