// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { AiActionsPanel } from './AiActionsPanel';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Send,
  Loader2,
  RotateCcw,
  AlertCircle,
  Trash2,
  Sparkles,
  Users,
  Clock,
  Award,
  FileCheck,
  TrendingUp,
  BarChart2,
  GitMerge,
  ArrowRight,
} from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgBootstrapGuard } from '@/hooks/useOrgBootstrapGuard';
import { usePermission } from '@/hooks/usePermission';
import { getAiConfig, getAiInsights } from '@/api/ai';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import type { AiInsightsResponse } from '@/api/types';
import type { Permission } from '@/api/types';
import { useAiConversation } from './ai-conversation';
import type { ChatMessage } from './ai-conversation';

const MAX_VISIBLE_CITATIONS = 8;

/** Source chips, numeric-check warning and completeness note under an agent answer (spec mục 8). */
function AnswerFooter({ msg }: { msg: ChatMessage }) {
  const citations = (msg.citations ?? []).filter((c) => c.href.startsWith('/') && !c.href.startsWith('//'));
  const unique = citations.filter((c, i) => citations.findIndex((o) => o.href === c.href && o.label === c.label) === i);
  const visible = unique.slice(0, MAX_VISIBLE_CITATIONS);
  const hasNumericCheck = msg.numericCheck?.status === 'PASS' || msg.numericCheck?.status === 'WARN';
  if (!visible.length && !hasNumericCheck && msg.finishReason !== 'tool_limit') return null;
  return (
    <div className="mt-2 space-y-1.5">
      {hasNumericCheck && (
        <p className="text-[11px] text-slate-500" data-testid="ai-numeric-scope">
          Chỉ đối chiếu sự xuất hiện của các con số; hãy kiểm tra ý nghĩa tại nguồn.
        </p>
      )}
      {msg.numericCheck?.status === 'WARN' && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1" data-testid="ai-numeric-warning">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
          <span>Cảnh báo: có số liệu chưa đối chiếu được với dữ liệu nguồn, hãy kiểm tra lại qua các liên kết bên dưới.</span>
        </div>
      )}
      {msg.finishReason === 'tool_limit' && (
        <div className="text-[11px] text-slate-500" data-testid="ai-tool-limit-note">
          Lưu ý: câu trả lời có thể chưa đầy đủ vì câu hỏi cần tra cứu nhiều dữ liệu; hãy hỏi cụ thể hơn.
        </div>
      )}
      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="ai-citations">
          <span className="text-[11px] font-medium text-slate-500">Nguồn:</span>
          {visible.map((c) => (
            <Link key={c.href + '|' + c.label} to={c.href} title={c.label}
              className="max-w-[14rem] truncate px-2 py-0.5 rounded-md border border-slate-200 bg-white text-[11px] text-brand-700 hover:bg-brand-50 hover:border-brand-200">
              {c.label}
            </Link>
          ))}
          {unique.length > visible.length && <span className="text-[11px] text-slate-500">+{unique.length - visible.length}</span>}
        </div>
      )}
    </div>
  );
}

function formatProviderLabel(provider: string, model: string): string {
  const p = provider.toLowerCase();
  if (p === 'openai') {
    return `OpenAI: ${model}`;
  }
  if (p === 'gemini') {
    return `Gemini: ${model}`;
  }
  return `${provider}:${model}`;
}

function formatInlineText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function AssistantMessageContent({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-slate-800">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        if (trimmed.startsWith('## ')) {
          return (
            <h3
              key={idx}
              className="text-xs font-bold text-slate-900 mt-2.5 mb-1 pb-0.5 border-b border-slate-200/60 flex items-center gap-1.5"
            >
              <TrendingUp className="h-3 w-3 text-brand-600" />
              <span>{trimmed.slice(3)}</span>
            </h3>
          );
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="text-[11px] font-semibold text-slate-800 mt-2 mb-0.5">
              {trimmed.slice(4)}
            </h4>
          );
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 ml-1">
              <span className="text-brand-500 font-bold select-none">•</span>
              <span className="flex-1">{formatInlineText(trimmed.slice(2))}</span>
            </div>
          );
        }

        return <p key={idx}>{formatInlineText(trimmed)}</p>;
      })}
    </div>
  );
}

export function AiAssistantPage() {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id;

  const { hasPermission, isLoading: isPermissionLoading } = usePermission();
  const canUseAi = hasPermission('ai:use');

  let isAuthenticated = true;
  let userId: string | undefined;
  try {
    const auth = useAuth();
    isAuthenticated = auth?.isAuthenticated ?? true;
    userId = auth?.user?.id;
  } catch {
    isAuthenticated = true;
  }

  // Kept by AiConversationProvider for the whole signed-in session, so leaving the page does not lose it.
  const conversation = useAiConversation(userId, orgId, isAuthenticated);
  const { messages, isLoading, error } = conversation;
  const input = conversation.draft;
  const setInput = conversation.setDraft;

  const [activeProviderInfo, setActiveProviderInfo] = useState<{
    provider: string;
    model: string;
  } | null>(null);

  const [insights, setInsights] = useState<AiInsightsResponse | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom whenever messages or loading state changes
  useEffect(() => {
    try {
      if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch {
      // Ignored in test / JSDOM environment
    }
  }, [messages, isLoading, error]);

  // Load AI configuration and insights on mount or when organization switches; drop them on logout.
  useEffect(() => {
    setActiveProviderInfo(null);
    setInsights(null);
    if (!isAuthenticated || !orgId || !canUseAi) return;
    let isMounted = true;
    if (typeof getAiConfig === 'function') {
      getAiConfig(orgId)
        .then((cfg) => {
          if (isMounted && cfg) {
            setActiveProviderInfo({ provider: cfg.provider, model: cfg.model });
          }
        })
        .catch(() => {
          // Fallback silently if unconfigured or error
        });
    }
    if (typeof getAiInsights === 'function') {
      getAiInsights(orgId)
        .then((data) => {
          if (isMounted && data) {
            setInsights(data);
          }
        })
        .catch(() => {
          // Silently ignore if insights endpoint unavailable
        });
    }
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, orgId, canUseAi]);

  // Focus the input on load and again when an answer arrives
  useEffect(() => {
    if (canUseAi && !isPermissionLoading && !isLoading) {
      textareaRef.current?.focus();
    }
  }, [canUseAi, isPermissionLoading, isLoading]);

  // The store already ignores sends without an organization or while a request is running.
  const handleSend = () => {
    if (canUseAi) conversation.send(input);
  };

  const handleRetry = () => {
    if (canUseAi) conversation.retry();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearConversation = () => {
    if (isLoading) return;
    conversation.clear();
    textareaRef.current?.focus();
  };

  const orgGuard = useOrgBootstrapGuard();
  if (orgGuard) return orgGuard;
  if (isPermissionLoading) return <LoadingState message="Đang kiểm tra quyền hạn..." />;
  if (!canUseAi) {
    return <ForbiddenState message="Bạn không có quyền sử dụng Trợ lý AI trong tổ chức này (yêu cầu quyền ai:use)." />;
  }

  const hasFailedTurn = error !== null && messages.length > 0 && messages[messages.length - 1].role === 'user';

  // Suggestions map to the agent's tools and only show when the user may use them (spec mục 8).
  const assistantPrompts: { label: string; icon: string; needs: Permission[] }[] = [
    { label: 'Có việc nào đang quá hạn không?', icon: '⏰', needs: ['task:read'] },
    { label: 'Hôm nay tôi làm ca mấy giờ?', icon: '🗓️', needs: [] },
    { label: 'Có đơn nào đang chờ duyệt không?', icon: '✅', needs: ['approval:read'] },
    { label: 'Hôm nay ai đi trễ hoặc chưa chấm công?', icon: '🕘', needs: ['attendance:read', 'attendance:manage'] },
    { label: 'Tuần này ai nghỉ phép?', icon: '🏖️', needs: ['leave:read'] },
    { label: 'Giấy tờ nào sắp hết hạn trong 30 ngày tới?', icon: '📋', needs: ['document:read'] },
    { label: 'Tuần này có cuộc họp nào?', icon: '📅', needs: ['calendar:read'] },
    { label: 'Tình hình công ty hôm nay thế nào?', icon: '📈', needs: [] },
    { label: 'Tháng này đi trễ bao nhiêu lượt so với tháng trước?', icon: '🔄', needs: ['report:read', 'attendance:read', 'attendance:manage'] },
  ];
  const analyticsPrompts = assistantPrompts.filter((p) => p.needs.every((permission) => hasPermission(permission)));


  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <span>Trợ lý AI</span>
            {activeProviderInfo ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-brand-50 text-brand-700 border border-brand-200 shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                {formatProviderLabel(activeProviderInfo.provider, activeProviderInfo.model)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-slate-100 text-slate-600">
                Sẵn sàng
              </span>
            )}
          </div>
        }
        description="Trợ lý thông minh hỗ trợ xử lý công việc và phân tích dữ liệu HR tổ chức"
        actions={
          messages.length > 0 ? (
            <button
              type="button"
              onClick={handleClearConversation}
              disabled={isLoading}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
              title="Xóa lịch sử hội thoại hiện tại"
            >
              <Trash2 className="h-3.5 w-3.5 text-slate-500" />
              <span>Xóa hội thoại</span>
            </button>
          ) : undefined
        }
      />

      {orgId && <AiActionsPanel key={orgId} organizationId={orgId} />}
      {/* Main chat window */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-0">
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          aria-live="polite"
          role="log"
          aria-label="Lịch sử trò chuyện với AI"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-6 px-4">
              <div className="h-16 w-16 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3 shadow-inner">
                <Bot className="h-8 w-8" />
              </div>
              <h3 className="text-base font-semibold text-slate-800 mb-1">
                Trợ lý AI & Phân tích Doanh nghiệp
              </h3>
              <p className="text-xs text-slate-500 max-w-md mb-4">
                Tra cứu, phân tích xu hướng và giải đáp thông tin HR thời gian thực cho tổ chức {currentOrg?.name}.
              </p>

              {/* AI Insights Panel */}
              {insights && (
                <div className="w-full max-w-2xl bg-slate-50 border border-slate-200/80 rounded-xl p-3 mb-4 text-left shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <BarChart2 className="h-3.5 w-3.5 text-brand-600" />
                      <span>AI Insights (Thời gian thực)</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Dữ liệu tháng hiện tại</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {/* Workforce card */}
                    <button
                      type="button"
                      onClick={() => setInput('Phân tích tình hình nhân sự hiện tại')}
                      className="p-2.5 rounded-lg bg-white border border-slate-200/60 hover:border-brand-300 hover:shadow-xs transition-all text-left group"
                    >
                      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mb-0.5">
                        <Users className="h-3 w-3 text-blue-500" />
                        <span>Nhân sự</span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {insights.workforce ? `${insights.workforce.active} người` : '—'}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {insights.workforce?.topDepartment ? `Top: ${insights.workforce.topDepartment}` : 'Đang hoạt động'}
                      </div>
                    </button>

                    {/* Attendance card */}
                    <button
                      type="button"
                      onClick={() => setInput('Phân tích chấm công tháng này')}
                      className="p-2.5 rounded-lg bg-white border border-slate-200/60 hover:border-brand-300 hover:shadow-xs transition-all text-left group"
                    >
                      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mb-0.5">
                        <Clock className="h-3 w-3 text-amber-500" />
                        <span>Chấm công</span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {insights.attendance?.attendanceRate !== null && insights.attendance?.attendanceRate !== undefined
                          ? `${insights.attendance.attendanceRate}%`
                          : '—'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {insights.attendance ? `Đi muộn: ${insights.attendance.lateCount} lượt` : 'Đang theo dõi'}
                      </div>
                    </button>

                    {/* Performance card */}
                    <button
                      type="button"
                      onClick={() => setInput('Phân tích hiệu suất nhân sự')}
                      className="p-2.5 rounded-lg bg-white border border-slate-200/60 hover:border-brand-300 hover:shadow-xs transition-all text-left group"
                    >
                      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mb-0.5">
                        <Award className="h-3 w-3 text-purple-500" />
                        <span>Hiệu suất</span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {insights.performance?.averageRating !== null && insights.performance?.averageRating !== undefined
                          ? `${insights.performance.averageRating}/5 ⭐`
                          : '—'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {insights.performance?.completionRate ? `Hoàn thành: ${insights.performance.completionRate}%` : 'Chu kỳ hiện tại'}
                      </div>
                    </button>

                    {/* Compliance card */}
                    <button
                      type="button"
                      onClick={() => setInput('Phân tích tình trạng hồ sơ & tuân thủ')}
                      className="p-2.5 rounded-lg bg-white border border-slate-200/60 hover:border-brand-300 hover:shadow-xs transition-all text-left group"
                    >
                      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mb-0.5">
                        <FileCheck className="h-3 w-3 text-emerald-500" />
                        <span>Tuân thủ</span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {insights.compliance?.complianceRate !== null && insights.compliance?.complianceRate !== undefined
                          ? `${insights.compliance.complianceRate}%`
                          : '—'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {insights.compliance ? `Sắp hết hạn: ${insights.compliance.expiringSoonCount}` : 'Hồ sơ bắt buộc'}
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Analytics Prompts */}
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
                {analyticsPrompts.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setInput(p.label)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-700 transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <span>{p.icon}</span>
                    <span>&ldquo;{p.label}&rdquo;</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? msg.status === 'error'
                      ? 'bg-red-50 text-red-900 border border-red-200 rounded-br-none'
                      : 'bg-brand-600 text-white rounded-br-none shadow-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1.5 opacity-75 text-[11px]">
                  {msg.role === 'user' ? (
                    <span>Bạn</span>
                  ) : (
                    <span className="flex items-center gap-1 font-medium text-slate-900">
                      <Bot className="h-3 w-3 text-brand-600" />
                      Trợ lý AI
                    </span>
                  )}
                  <span>•</span>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {msg.status === 'error' && (
                    <span className="text-red-600 font-semibold flex items-center gap-0.5">
                      <AlertCircle className="h-3 w-3" /> Lỗi gửi
                    </span>
                  )}
                </div>

                {msg.role === 'assistant' ? (
                  <>
                    <AssistantMessageContent content={msg.content} />
                    <AnswerFooter msg={msg} />
                    {(msg.content.toLowerCase().includes('workflow') ||
                      msg.content.toLowerCase().includes('quy trình') ||
                      msg.content.toLowerCase().includes('gia hạn')) && (
                      <div className="mt-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-brand-200 dark:border-brand-800/60 shadow-xs flex items-center justify-between gap-3" data-testid="ai-workflow-recommendation-card">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
                            <GitMerge className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-900 dark:text-white">Quy trình nhân sự cần phê duyệt</div>
                            <div className="text-[10px] text-slate-500">Xem danh sách các bước đang chờ xác nhận từ HR</div>
                          </div>
                        </div>
                        <Link
                          to="/workflows"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-xs transition-colors shrink-0"
                          data-testid="ai-link-to-workflows"
                        >
                          <span>Mở Workflows</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                    {msg.content}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl rounded-bl-none px-4 py-3 bg-slate-100 text-slate-800 border border-slate-200/60 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                <span className="text-xs text-slate-500">Trợ lý AI đang tra cứu dữ liệu...</span>
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span className="truncate">{error}</span>
              </div>
              {hasFailedTurn && (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={isLoading}
                  className="btn-secondary text-xs py-1 px-2.5 bg-white shrink-0 flex items-center gap-1 hover:bg-red-50 border-red-200 text-red-700"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Thử lại</span>
                </button>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhập câu hỏi hoặc yêu cầu phân tích (Nhấn Enter để gửi, Shift + Enter để xuống dòng)..."
                disabled={isLoading}
                rows={2}
                maxLength={4000}
                className="input w-full resize-none py-2 pr-12 text-sm max-h-32"
                aria-label="Khung nhập tin nhắn gửi tới Trợ lý AI"
                data-testid="ai-chat-input"
              />
              <span className="absolute right-2 bottom-2 text-[10px] text-slate-400 select-none">
                {input.length}/4000
              </span>
            </div>

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="btn-primary p-2.5 h-[42px] aspect-square flex items-center justify-center shrink-0 mb-0.5"
              title="Gửi tin nhắn (Enter)"
              aria-label="Gửi tin nhắn"
              data-testid="ai-chat-send"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>

          <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400 px-1">
            <span>Dữ liệu AI được giới hạn nghiêm ngặt trong tổ chức của bạn.</span>
            <span>Enter gửi • Shift+Enter xuống dòng</span>
          </div>
        </div>
      </div>
    </div>
  );
}
