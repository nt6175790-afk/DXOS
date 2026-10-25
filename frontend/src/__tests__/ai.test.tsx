import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { AiAssistantPage } from '@/features/ai/AiAssistantPage';
import { AiConversationProvider } from '@/features/ai/AiConversationProvider';
import { ToastProvider } from '@/contexts/ToastContext';
import * as permissionHook from '@/hooks/usePermission';
import * as orgContextModule from '@/contexts/OrganizationContext';
import * as authContextModule from '@/contexts/AuthContext';
import * as aiApi from '@/api/ai';

const mockGenerateAi = vi.fn();
const mockGetAiConfig = vi.fn().mockResolvedValue({ provider: 'mock', model: 'mock-v1', isConfigured: true });
const mockGetAiInsights = vi.fn().mockResolvedValue(null);
vi.mock('@/api/ai', () => ({
  generateAi: (...args: unknown[]) => mockGenerateAi(...args),
  getAiConfig: (...args: unknown[]) => mockGetAiConfig(...args),
  getAiInsights: (...args: unknown[]) => mockGetAiInsights(...args),
}));

vi.mock('@/contexts/OrganizationContext', () => ({
  useOrganization: vi.fn(() => ({
    currentOrg: { id: 'org-1', name: 'Test Org', slug: 'test', status: 'ACTIVE', createdAt: '', updatedAt: '' },
    organizations: [{ id: 'org-1', name: 'Test Org', slug: 'test', status: 'ACTIVE', createdAt: '', updatedAt: '' }],
    isLoading: false,
    setCurrentOrg: vi.fn(),
    refreshOrganizations: vi.fn(),
  })),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'usr-1', email: 'test@dxos.local', displayName: 'Test User' },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    loginSso: vi.fn(),
    logout: vi.fn(),
  })),
}));

vi.mock('@/api/client', () => ({
  isApiError: vi.fn((err: unknown) => typeof err === 'object' && err !== null && 'success' in err && (err as { success: boolean }).success === false),
}));

function renderPage() {
  return render(
    <ToastProvider>
      <AiAssistantPage />
    </ToastProvider>
  );
}

describe('AiAssistantPage (DXOS-FRONTEND-006)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: ['ai:use', 'organization:read'],
      hasPermission: (p) => p === 'ai:use' || p === 'organization:read',
      hasAnyPermission: (...p) => p.some((x) => x === 'ai:use' || x === 'organization:read'),
      isLoading: false,
      error: null,
      refreshPermissions: vi.fn(),
    });

    vi.spyOn(orgContextModule, 'useOrganization').mockReturnValue({
      currentOrg: { id: 'org-1', name: 'Test Org', slug: 'test', status: 'ACTIVE', createdAt: '', updatedAt: '' },
      organizations: [{ id: 'org-1', name: 'Test Org', slug: 'test', status: 'ACTIVE', createdAt: '', updatedAt: '' }],
      isLoading: false,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    });

    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'usr-1', email: 'test@dxos.local', displayName: 'Test User', accountStatus: 'ACTIVE' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      loginSso: vi.fn(),
      logout: vi.fn(),
    });
  });

  // 1. Render AI page
  it('1. renders chat interface with title and input textarea', () => {
    renderPage();
    expect(screen.getByText('Trợ lý AI')).toBeInTheDocument();
    expect(screen.getByLabelText(/khung nhập tin nhắn/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gửi tin nhắn/i })).toBeInTheDocument();
  });

  // 2. ai:use permission enforcement
  it('2. blocks access and shows ForbiddenState when lacking ai:use permission', () => {
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: ['organization:read'],
      hasPermission: () => false,
      hasAnyPermission: () => false,
      isLoading: false,
      error: null,
      refreshPermissions: vi.fn(),
    });

    renderPage();
    expect(screen.getByText(/bạn không có quyền sử dụng trợ lý ai trong tổ chức này/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/khung nhập tin nhắn/i)).not.toBeInTheDocument();
  });

  // 3. Empty input disabled
  it('3. disables send button when input is empty or contains only whitespace', async () => {
    renderPage();
    const user = userEvent.setup();
    const sendButton = screen.getByRole('button', { name: /gửi tin nhắn/i });
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    expect(sendButton).toBeDisabled();

    await user.type(input, '    ');
    expect(sendButton).toBeDisabled();

    await user.type(input, 'Hello');
    expect(sendButton).not.toBeDisabled();
  });

  // 4. Send message adds user message to conversation
  it('4. adds user message to conversation list and clears input upon sending', async () => {
    mockGenerateAi.mockResolvedValue({
      id: 'ai-resp-1',
      organizationId: 'org-1',
      requestId: 'req-1',
      provider: 'mock',
      model: 'mock-v1',
      text: 'Xin chào! Tôi có thể hỗ trợ gì?',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 8, totalTokens: 13 },
    });

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);
    const sendButton = screen.getByRole('button', { name: /gửi tin nhắn/i });

    await user.type(input, 'Xin chào, hãy giới thiệu về DX-OS.');
    await user.click(sendButton);

    expect(screen.getByText('Xin chào, hãy giới thiệu về DX-OS.')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  // 5. Successful assistant response
  it('5. displays assistant response and updates provider metadata safely', async () => {
    mockGenerateAi.mockResolvedValue({
      id: 'ai-resp-1',
      organizationId: 'org-1',
      requestId: 'req-1',
      provider: 'mock',
      model: 'mock-v1',
      text: 'DX-OS là hệ điều hành doanh nghiệp thông minh.',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 12, totalTokens: 17 },
    });

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'DX-OS là gì?');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByText('DX-OS là hệ điều hành doanh nghiệp thông minh.')).toBeInTheDocument();
      expect(screen.getByText(/mock:mock-v1/)).toBeInTheDocument();
    });
  });

  // 6. Multi-turn conversation preserves history
  it('6. retains multi-turn conversation and passes previous turns to backend API', async () => {
    mockGenerateAi.mockResolvedValueOnce({
      id: 'ai-resp-1',
      organizationId: 'org-1',
      requestId: 'req-1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      text: 'DX-OS có các module: Tasks, People, Files, AI.',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 },
    });

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    // Turn 1
    await user.type(input, 'DX-OS có những module nào?');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByText('DX-OS có các module: Tasks, People, Files, AI.')).toBeInTheDocument();
    });

    expect(mockGenerateAi).toHaveBeenLastCalledWith('org-1', expect.objectContaining({
      messages: [{ role: 'user', content: 'DX-OS có những module nào?' }],
    }));

    // Turn 2
    mockGenerateAi.mockResolvedValueOnce({
      id: 'ai-resp-2',
      organizationId: 'org-1',
      requestId: 'req-2',
      provider: 'openai',
      model: 'gpt-4o-mini',
      text: 'Module Tasks giúp bạn quản lý công việc và tiến độ.',
      finishReason: 'stop',
      usage: { inputTokens: 25, outputTokens: 12, totalTokens: 37 },
    });

    await user.type(input, 'Nói rõ hơn về module Tasks.');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByText('Module Tasks giúp bạn quản lý công việc và tiến độ.')).toBeInTheDocument();
    });

    // Verify history includes all previous user and assistant turns
    expect(mockGenerateAi).toHaveBeenLastCalledWith('org-1', expect.objectContaining({
      messages: [
        { role: 'user', content: 'DX-OS có những module nào?' },
        { role: 'assistant', content: 'DX-OS có các module: Tasks, People, Files, AI.' },
        { role: 'user', content: 'Nói rõ hơn về module Tasks.' },
      ],
    }));
  });

  // 7. Loading state
  it('7. displays loading spinner and disables input while request is in flight', async () => {
    let resolvePromise: (val: unknown) => void = () => {};
    mockGenerateAi.mockReturnValue(new Promise((resolve) => {
      resolvePromise = resolve;
    }));

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);
    const sendButton = screen.getByRole('button', { name: /gửi tin nhắn/i });

    await user.type(input, 'Câu hỏi đang chờ...');
    await user.click(sendButton);

    expect(screen.getByText(/trợ lý ai đang tra cứu dữ liệu/i)).toBeInTheDocument();
    expect(sendButton).toBeDisabled();
    expect(input).toBeDisabled();

    // Resolve
    resolvePromise({
      id: 'ai-resp-1',
      organizationId: 'org-1',
      requestId: 'req-1',
      provider: 'mock',
      model: 'mock-v1',
      text: 'Đã hoàn thành câu trả lời.',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
    });

    await waitFor(() => {
      expect(screen.queryByText(/trợ lý ai đang tra cứu dữ liệu/i)).not.toBeInTheDocument();
      expect(input).not.toBeDisabled();
    });
  });

  // 8. Double-submit prevention
  it('8. prevents double submit when user clicks send button multiple times rapidly', async () => {
    mockGenerateAi.mockReturnValue(new Promise(() => {})); // Never resolves during test

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);
    const sendButton = screen.getByRole('button', { name: /gửi tin nhắn/i });

    await user.type(input, 'Test double submit');
    await user.click(sendButton);
    await user.click(sendButton);
    await user.click(sendButton);

    expect(mockGenerateAi).toHaveBeenCalledTimes(1);
  });

  // 9. Enter sends
  it('9. sends message when Enter key is pressed without Shift', async () => {
    mockGenerateAi.mockResolvedValue({
      id: 'ai-resp-1',
      organizationId: 'org-1',
      requestId: 'req-1',
      provider: 'mock',
      model: 'mock-v1',
      text: 'Phản hồi từ Enter.',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
    });

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Gửi bằng Enter{Enter}');

    expect(mockGenerateAi).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText('Phản hồi từ Enter.')).toBeInTheDocument();
    });
  });

  // 10. Shift+Enter newline
  it('10. creates newline and does NOT send message when Shift+Enter is pressed', async () => {
    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Dòng 1{Shift>}{Enter}{/Shift}Dòng 2');

    expect(mockGenerateAi).not.toHaveBeenCalled();
    expect(input).toHaveValue('Dòng 1\nDòng 2');
  });

  // 11. 400 validation error
  it('11. displays helpful error message on 400 VALIDATION_FAILED / AI_INVALID_REQUEST', async () => {
    mockGenerateAi.mockRejectedValue({
      success: false,
      error: { code: 'AI_INVALID_REQUEST', message: 'Nội dung tin nhắn không hợp lệ.', requestId: 'req-err' },
    });

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Tin nhắn lỗi');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByText(/nội dung tin nhắn không hợp lệ hoặc vượt quá giới hạn/i)).toBeInTheDocument();
    });
  });

  // 12. 401 unauthorized
  it('12. displays session expired message on 401 UNAUTHORIZED', async () => {
    mockGenerateAi.mockRejectedValue({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: 'req-401' },
    });

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Check auth');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByText(/phiên làm việc đã hết hạn. vui lòng đăng nhập lại/i)).toBeInTheDocument();
    });
  });

  // 13. 403 forbidden
  it('13. displays forbidden error message on 403 FORBIDDEN', async () => {
    mockGenerateAi.mockRejectedValue({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: 'req-403' },
    });

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Check forbidden');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByText(/bạn không có quyền sử dụng trợ lý ai trong tổ chức này \(yêu cầu quyền ai:use\)/i)).toBeInTheDocument();
    });
  });

  // 14. Timeout / provider unavailable error
  it('14. displays provider unavailable message on 503 AI_PROVIDER_UNAVAILABLE', async () => {
    mockGenerateAi.mockRejectedValue({
      success: false,
      error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'Unavailable', requestId: 'req-503' },
    });

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Check unavailable');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByText(/dịch vụ ai hiện không khả dụng hoặc bị quá thời gian chờ/i)).toBeInTheDocument();
    });
  });

  // 15. Network error
  it('15. displays generic friendly network error when request fails with network exception', async () => {
    mockGenerateAi.mockRejectedValue(new Error('Network disconnected'));

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Check network error');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByText(/không nhận được phản hồi từ hệ thống ai. vui lòng thử lại/i)).toBeInTheDocument();
    });
  });

  // 16. Retry button appears on error
  it('16. renders Retry button when turn fails and allows retrying', async () => {
    mockGenerateAi.mockRejectedValueOnce({
      success: false,
      error: { code: 'AI_PROVIDER_ERROR', message: 'Provider error', requestId: 'req-err' },
    });

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Câu hỏi sẽ retry');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /thử lại/i })).toBeInTheDocument();
    });
  });

  // 17. Retry does NOT duplicate user message
  it('17. retries the request without creating duplicate user message entries', async () => {
    mockGenerateAi.mockRejectedValueOnce({
      success: false,
      error: { code: 'AI_PROVIDER_ERROR', message: 'Provider error', requestId: 'req-err' },
    });

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Câu hỏi không bị nhân đôi');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /thử lại/i })).toBeInTheDocument();
    });

    expect(screen.getAllByText('Câu hỏi không bị nhân đôi')).toHaveLength(1);

    // Setup success for retry
    mockGenerateAi.mockResolvedValueOnce({
      id: 'ai-resp-retry',
      organizationId: 'org-1',
      requestId: 'req-retry',
      provider: 'mock',
      model: 'mock-v1',
      text: 'Trả lời thành công sau retry.',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
    });

    await user.click(screen.getByRole('button', { name: /thử lại/i }));

    await waitFor(() => {
      expect(screen.getByText('Trả lời thành công sau retry.')).toBeInTheDocument();
    });

    // Still exactly 1 instance of the user message
    expect(screen.getAllByText('Câu hỏi không bị nhân đôi')).toHaveLength(1);
  });

  // 18. Organization switch resets conversation
  it('18. clears conversation history when organization switches', async () => {
    mockGenerateAi.mockResolvedValue({
      id: 'ai-resp-1',
      organizationId: 'org-1',
      requestId: 'req-1',
      provider: 'mock',
      model: 'mock-v1',
      text: 'Nội dung thuộc Org 1',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
    });

    const { rerender } = renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Tin nhắn Org 1');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByText('Nội dung thuộc Org 1')).toBeInTheDocument();
    });

    // Switch organization to org-2
    vi.spyOn(orgContextModule, 'useOrganization').mockReturnValue({
      currentOrg: { id: 'org-2', name: 'Second Org', slug: 'second', status: 'ACTIVE', createdAt: '', updatedAt: '' },
      organizations: [
        { id: 'org-1', name: 'Test Org', slug: 'test', status: 'ACTIVE', createdAt: '', updatedAt: '' },
        { id: 'org-2', name: 'Second Org', slug: 'second', status: 'ACTIVE', createdAt: '', updatedAt: '' },
      ],
      isLoading: false,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    });

    rerender(
      <ToastProvider>
        <AiAssistantPage />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Nội dung thuộc Org 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Tin nhắn Org 1')).not.toBeInTheDocument();
    });
  });

  // 19. Stale response protection across org switch (race condition)
  it('19. drops pending response if organization was switched before response arrived', async () => {
    let delayedResolve: (val: unknown) => void = () => {};
    mockGenerateAi.mockReturnValue(new Promise((resolve) => {
      delayedResolve = resolve;
    }));

    const { rerender } = renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Request org 1 đang bay');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    // User switches org while request in flight
    vi.spyOn(orgContextModule, 'useOrganization').mockReturnValue({
      currentOrg: { id: 'org-2', name: 'Second Org', slug: 'second', status: 'ACTIVE', createdAt: '', updatedAt: '' },
      organizations: [],
      isLoading: false,
      setCurrentOrg: vi.fn(),
      refreshOrganizations: vi.fn(),
    });

    rerender(
      <ToastProvider>
        <AiAssistantPage />
      </ToastProvider>
    );

    // Old response arrives late
    delayedResolve({
      id: 'ai-resp-late',
      organizationId: 'org-1',
      requestId: 'req-late',
      provider: 'mock',
      model: 'mock-v1',
      text: 'Response của Org 1 về muộn',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
    });

    // Verify it is NEVER rendered in org 2
    await waitFor(() => {
      expect(screen.queryByText('Response của Org 1 về muộn')).not.toBeInTheDocument();
    });
  });

  // 20. Logout clears conversation
  it('20. clears conversation immediately when user logs out', async () => {
    mockGenerateAi.mockResolvedValue({
      id: 'ai-resp-1',
      organizationId: 'org-1',
      requestId: 'req-1',
      provider: 'mock',
      model: 'mock-v1',
      text: 'Dữ liệu trước khi đăng xuất',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
    });

    const { rerender } = renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Trước khi logout');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      expect(screen.getByText('Dữ liệu trước khi đăng xuất')).toBeInTheDocument();
    });

    // Simulate logout
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      loginSso: vi.fn(),
      logout: vi.fn(),
    });

    rerender(
      <ToastProvider>
        <AiAssistantPage />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Dữ liệu trước khi đăng xuất')).not.toBeInTheDocument();
    });
  });

  // 21. Safe assistant rendering (no HTML/script execution)
  it('21. renders untrusted HTML tags as safe plain text without executing scripts', async () => {
    const maliciousPayload = '<script>alert("xss")</script><img src="x" onerror="alert(1)" /><b>In đậm</b>';
    mockGenerateAi.mockResolvedValue({
      id: 'ai-resp-xss',
      organizationId: 'org-1',
      requestId: 'req-xss',
      provider: 'mock',
      model: 'mock-v1',
      text: maliciousPayload,
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
    });

    renderPage();
    const user = userEvent.setup();
    const input = screen.getByLabelText(/khung nhập tin nhắn/i);

    await user.type(input, 'Kiểm tra XSS');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

    await waitFor(() => {
      // Must be rendered literally as text, not as DOM elements
      expect(screen.getByText(maliciousPayload)).toBeInTheDocument();
      expect(document.querySelector('script')).toBeNull();
    });
  });

  // 23. Agent answers: internal source chips, numeric warning, completeness note
  it('23. shows internal source links, a numeric-check warning and the tool-limit note for agent answers', async () => {
    mockGenerateAi.mockResolvedValueOnce({
      id: 'resp-23', organizationId: 'org-1', requestId: 'req-23', provider: 'ollama', model: 'gpt-oss:120b',
      text: 'Có 2 việc quá hạn.', finishReason: 'tool_limit', usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      numericCheck: { status: 'WARN', unmatchedCount: 1 },
      citations: [
        { type: 'task', id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', label: 'Báo cáo Q3', href: '/tasks/7c9e6679-7425-40de-944b-e07fc1f90ae7' },
        { type: 'task', id: null, label: 'Trang ngoài', href: '//evil.example/x' },
      ],
    });
    render(<MemoryRouter><ToastProvider><AiAssistantPage /></ToastProvider></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/khung nhập tin nhắn/i), 'Việc nào quá hạn?');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));
    await waitFor(() => expect(screen.getByTestId('ai-citations')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Báo cáo Q3' })).toHaveAttribute('href', '/tasks/7c9e6679-7425-40de-944b-e07fc1f90ae7');
    expect(screen.queryByText('Trang ngoài')).not.toBeInTheDocument();
    expect(screen.getByTestId('ai-numeric-warning')).toHaveTextContent(/chưa đối chiếu được/);
    expect(screen.getByTestId('ai-numeric-scope')).toHaveTextContent(/chỉ đối chiếu sự xuất hiện/i);
    expect(screen.getByTestId('ai-tool-limit-note')).toBeInTheDocument();
  });

  // 24. Suggestions follow permissions
  it('does not present a numeric PASS as verification of the meaning of an answer', async () => {
    mockGenerateAi.mockResolvedValueOnce({ id: 'presence', organizationId: 'org-1', requestId: 'presence', provider: 'mock', model: 'mock-v1',
      text: 'Có 10 nhân viên.', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      numericCheck: { status: 'PASS', unmatchedCount: 0 }, citations: [] });
    render(<MemoryRouter><ToastProvider><AiAssistantPage /></ToastProvider></MemoryRouter>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/khung nhập tin nhắn/i), 'Tình hình nhân sự?');
    await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));
    expect(await screen.findByTestId('ai-numeric-scope')).toHaveTextContent(/kiểm tra ý nghĩa tại nguồn/);
    expect(screen.queryByTestId('ai-numeric-warning')).not.toBeInTheDocument();
  });

  it('24. only suggests questions the user has permission to ask', async () => {
    const { unmount } = renderPage();
    await screen.findByText('mock:mock-v1');
    expect(screen.getByText(/Hôm nay tôi làm ca mấy giờ\?/)).toBeInTheDocument();
    expect(screen.queryByText(/Có việc nào đang quá hạn không\?/)).not.toBeInTheDocument();
    unmount();
    vi.spyOn(permissionHook, 'usePermission').mockReturnValue({
      permissions: ['ai:use', 'task:read'],
      hasPermission: (p) => p === 'ai:use' || p === 'task:read',
      hasAnyPermission: (...p) => p.some((x) => x === 'ai:use' || x === 'task:read'),
      isLoading: false, error: null, refreshPermissions: vi.fn(),
    });
    renderPage();
    await screen.findByText('mock:mock-v1');
    expect(screen.getByText(/Có việc nào đang quá hạn không\?/)).toBeInTheDocument();
  });

  // 22. No API keys exposed in frontend components
  it('22. never exposes AI API keys or provider secrets in the DOM or UI elements', async () => {
    renderPage();
    const htmlContent = document.body.innerHTML;
    expect(htmlContent).not.toMatch(/sk-[A-Za-z0-9-_]{20,}/);
    expect(htmlContent).not.toMatch(/AI_API_KEY/i);
    expect(htmlContent).not.toMatch(/openai_api_key/i);
  });

  // 25–28. The conversation is kept for the signed-in session while the user visits other pages
  describe('session conversation (AiConversationProvider)', () => {
    const answer = (text: string) => ({
      id: `resp-${text}`, organizationId: 'org-1', requestId: `req-${text}`, provider: 'mock', model: 'mock-v1',
      text, finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
    });
    const session = (showPage: boolean) => (
      <ToastProvider>
        <AiConversationProvider>
          {showPage ? <AiAssistantPage /> : <div>Trang công việc</div>}
        </AiConversationProvider>
      </ToastProvider>
    );
    const signOut = () => vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null, isAuthenticated: false, isLoading: false, login: vi.fn(), loginSso: vi.fn(), logout: vi.fn(),
    });
    const signIn = () => vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: { id: 'usr-1', email: 'test@dxos.local', displayName: 'Test User', accountStatus: 'ACTIVE' },
      isAuthenticated: true, isLoading: false, login: vi.fn(), loginSso: vi.fn(), logout: vi.fn(),
    });

    it('25. keeps the conversation and the unsent draft when the user leaves and reopens the assistant', async () => {
      mockGenerateAi.mockResolvedValueOnce(answer('Trả lời thứ nhất')).mockResolvedValueOnce(answer('Trả lời thứ hai'));
      const { rerender } = render(session(true));
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/khung nhập tin nhắn/i), 'Câu hỏi thứ nhất');
      await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));
      await screen.findByText('Trả lời thứ nhất');
      await user.type(screen.getByLabelText(/khung nhập tin nhắn/i), 'Câu đang soạn');

      rerender(session(false));
      expect(screen.getByText('Trang công việc')).toBeInTheDocument();
      expect(screen.queryByText('Trả lời thứ nhất')).not.toBeInTheDocument();

      rerender(session(true));
      expect(screen.getByText('Câu hỏi thứ nhất')).toBeInTheDocument();
      expect(screen.getByText('Trả lời thứ nhất')).toBeInTheDocument();
      expect(screen.getByLabelText(/khung nhập tin nhắn/i)).toHaveValue('Câu đang soạn');

      // The kept turns are still sent as history.
      await user.clear(screen.getByLabelText(/khung nhập tin nhắn/i));
      await user.type(screen.getByLabelText(/khung nhập tin nhắn/i), 'Câu hỏi thứ hai');
      await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));
      await screen.findByText('Trả lời thứ hai');
      expect(mockGenerateAi).toHaveBeenLastCalledWith('org-1', expect.objectContaining({
        messages: [
          { role: 'user', content: 'Câu hỏi thứ nhất' },
          { role: 'assistant', content: 'Trả lời thứ nhất' },
          { role: 'user', content: 'Câu hỏi thứ hai' },
        ],
      }));
    });

    it('26. shows an answer that arrived while the user was on another page', async () => {
      let resolveAnswer: (value: unknown) => void = () => {};
      mockGenerateAi.mockReturnValueOnce(new Promise((resolve) => { resolveAnswer = resolve; }));
      const { rerender } = render(session(true));
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/khung nhập tin nhắn/i), 'Câu hỏi chậm');
      await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));
      expect(screen.getByText(/đang tra cứu dữ liệu/i)).toBeInTheDocument();

      rerender(session(false));
      await act(async () => { resolveAnswer(answer('Trả lời về khi đang ở trang khác')); });

      rerender(session(true));
      await screen.findByText('mock:mock-v1');
      expect(screen.getByText('Trả lời về khi đang ở trang khác')).toBeInTheDocument();
      expect(screen.queryByText(/đang tra cứu dữ liệu/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/khung nhập tin nhắn/i)).not.toBeDisabled();
    });

    it('27. discards the kept conversation on logout, even when the same user signs in again', async () => {
      mockGenerateAi.mockResolvedValueOnce(answer('Dữ liệu phiên cũ'));
      const { rerender } = render(session(true));
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/khung nhập tin nhắn/i), 'Câu hỏi phiên cũ');
      await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));
      await screen.findByText('Dữ liệu phiên cũ');
      await user.type(screen.getByLabelText(/khung nhập tin nhắn/i), 'Nháp phiên cũ');

      rerender(session(false));
      signOut();
      rerender(session(false));
      signIn();
      rerender(session(true));
      await screen.findByText('mock:mock-v1');

      expect(screen.queryByText('Dữ liệu phiên cũ')).not.toBeInTheDocument();
      expect(screen.queryByText('Câu hỏi phiên cũ')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/khung nhập tin nhắn/i)).toHaveValue('');
    });

    it('28. drops an answer that arrives after logout, even when the same user has signed in again', async () => {
      let resolveAnswer: (value: unknown) => void = () => {};
      mockGenerateAi.mockReturnValueOnce(new Promise((resolve) => { resolveAnswer = resolve; }));
      const { rerender } = render(session(true));
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/khung nhập tin nhắn/i), 'Câu hỏi trước khi đăng xuất');
      await user.click(screen.getByRole('button', { name: /gửi tin nhắn/i }));

      signOut();
      rerender(session(false));
      signIn();
      rerender(session(true));
      await act(async () => { resolveAnswer(answer('Trả lời của phiên trước')); });

      expect(screen.queryByText('Trả lời của phiên trước')).not.toBeInTheDocument();
      expect(screen.queryByText('Câu hỏi trước khi đăng xuất')).not.toBeInTheDocument();
      expect(screen.queryByText(/đang tra cứu dữ liệu/i)).not.toBeInTheDocument();
    });
  });
});
