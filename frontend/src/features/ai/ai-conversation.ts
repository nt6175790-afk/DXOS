// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { generateAi } from '@/api/ai';
import { isApiError } from '@/api/client';
import type { AiCitation, AiMessage, AiNumericCheck } from '@/api/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status?: 'sent' | 'error';
  requestId?: string;
  citations?: AiCitation[];
  numericCheck?: AiNumericCheck;
  finishReason?: 'stop' | 'length' | 'tool_limit';
}

export interface AiConversation {
  messages: ChatMessage[];
  draft: string;
  isLoading: boolean;
  error: string | null;
  setDraft: (value: string) => void;
  /** Sends the trimmed text as a new user turn. Returns false when nothing was sent. */
  send: (text: string) => boolean;
  retry: () => void;
  clear: () => void;
}

interface StoredConversation {
  /** Changes whenever the conversation is discarded, so late responses for the old one are dropped. */
  id: number;
  /** `${userId}|${organizationId}` the conversation belongs to; null when signed out or no organization. */
  scope: string | null;
  messages: ChatMessage[];
  draft: string;
  isLoading: boolean;
  error: string | null;
}

/** The contract allows 16 messages per request; only the latest turns are sent. */
const MAX_API_MESSAGES = 16;

let lastConversationId = 0;

function emptyConversation(scope: string | null): StoredConversation {
  lastConversationId += 1;
  return { id: lastConversationId, scope, messages: [], draft: '', isLoading: false, error: null };
}

function errorMessage(err: unknown): string {
  if (!isApiError(err)) return 'Không nhận được phản hồi từ hệ thống AI. Vui lòng thử lại.';
  switch (err.error.code) {
    case 'AI_PROVIDER_NOT_CONFIGURED':
      return 'AI Provider chưa được cấu hình. Vui lòng thiết lập API key trên máy chủ.';
    case 'AI_PROVIDER_UNAVAILABLE':
      return 'Dịch vụ AI hiện không khả dụng hoặc bị quá thời gian chờ. Vui lòng thử lại.';
    case 'AI_LIMIT_EXCEEDED':
      return 'Đã vượt hạn mức sử dụng AI (giới hạn yêu cầu hoặc hạn mức của nhà cung cấp). Vui lòng thử lại sau.';
    case 'FORBIDDEN':
      return 'Bạn không có quyền sử dụng Trợ lý AI trong tổ chức này (yêu cầu quyền ai:use).';
    case 'UNAUTHORIZED':
      return 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.';
    case 'VALIDATION_FAILED':
    case 'AI_INVALID_REQUEST':
      return 'Nội dung tin nhắn không hợp lệ hoặc vượt quá giới hạn.';
    default:
      return err.error.message || 'Không nhận được phản hồi từ hệ thống AI. Vui lòng thử lại.';
  }
}

/**
 * Conversation state for one user in one organization, kept in memory only (never in browser storage or on the
 * server, see contracts/api/ai.md). Changing user or organization, or signing out, discards it, and a response
 * that arrives for a discarded conversation is dropped.
 */
export function useConversationStore(userId: string | null | undefined, organizationId: string | null | undefined,
  isAuthenticated: boolean, enabled = true): AiConversation {
  const scope = enabled && isAuthenticated && organizationId ? `${userId ?? ''}|${organizationId}` : null;
  const [stored, setStored] = useState<StoredConversation>(() => emptyConversation(scope));
  // Purge the previous user's or organization's conversation as soon as the scope changes.
  useEffect(() => {
    setStored((prev) => (prev.scope === scope ? prev : emptyConversation(scope)));
  }, [scope]);

  // Until the purge above has run, never show another scope's conversation.
  const current = stored.scope === scope ? stored : emptyConversation(scope);

  const request = useCallback(async (turn: ChatMessage[], conversationId: number, organization: string) => {
    const apiMessages: AiMessage[] = turn
      .filter((m) => m.status !== 'error')
      .slice(-MAX_API_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }));
    try {
      const response = await generateAi(organization, { messages: apiMessages, maxOutputTokens: 1024 });
      const answer: ChatMessage = {
        id: response.id || `ast-${Date.now()}`,
        role: 'assistant',
        content: response.text,
        timestamp: Date.now(),
        requestId: response.requestId,
        citations: response.citations,
        numericCheck: response.numericCheck,
        finishReason: response.finishReason,
      };
      setStored((prev) => (prev.id !== conversationId ? prev
        : { ...prev, messages: [...prev.messages, answer], isLoading: false, error: null }));
    } catch (err: unknown) {
      const message = errorMessage(err);
      setStored((prev) => {
        if (prev.id !== conversationId) return prev;
        const messages = [...prev.messages];
        const last = messages.length - 1;
        // Mark the failed user turn so it can be retried and is not sent as history.
        if (last >= 0 && messages[last].role === 'user') messages[last] = { ...messages[last], status: 'error' };
        return { ...prev, messages, isLoading: false, error: message };
      });
    }
  }, []);

  const setDraft = useCallback((value: string) => {
    if (!scope) return;
    setStored((prev) => (prev.scope === scope ? { ...prev, draft: value } : { ...emptyConversation(scope), draft: value }));
  }, [scope]);

  /** Shows `turn` as loading and sends it; the answer lands only if this conversation still exists then. */
  const start = useCallback((turn: ChatMessage[], draft: string) => {
    if (!organizationId) return;
    setStored({ ...current, messages: turn, draft, isLoading: true, error: null });
    void request(turn, current.id, organizationId);
  }, [organizationId, current, request]);

  const send = useCallback((text: string) => {
    const content = text.trim();
    if (!scope || !content || current.isLoading) return false;
    const userMessage: ChatMessage = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      status: 'sent',
    };
    start([...current.messages, userMessage], '');
    return true;
  }, [scope, current, start]);

  const retry = useCallback(() => {
    const last = current.messages[current.messages.length - 1];
    if (!scope || current.isLoading || !last || last.role !== 'user') return;
    start(current.messages.map((m, i) => (i === current.messages.length - 1 ? { ...m, status: 'sent' as const } : m)), current.draft);
  }, [scope, current, start]);

  const clear = useCallback(() => {
    if (current.isLoading) return;
    setStored(emptyConversation(scope));
  }, [scope, current.isLoading]);

  return useMemo(() => ({
    messages: current.messages,
    draft: current.draft,
    isLoading: current.isLoading,
    error: current.error,
    setDraft,
    send,
    retry,
    clear,
  }), [current.messages, current.draft, current.isLoading, current.error, setDraft, send, retry, clear]);
}

export const AiConversationContext = createContext<AiConversation | null>(null);

/**
 * The conversation shared by the whole signed-in session (AiConversationProvider), so it survives leaving and
 * reopening the assistant page. Without the provider (isolated page tests) the page keeps its own state.
 */
export function useAiConversation(userId: string | null | undefined, organizationId: string | null | undefined,
  isAuthenticated: boolean): AiConversation {
  const shared = useContext(AiConversationContext);
  const local = useConversationStore(userId, organizationId, isAuthenticated, shared === null);
  return shared ?? local;
}
