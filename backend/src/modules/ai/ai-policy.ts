export const AI_LIMITS = { messages: 16, messageChars: 4000, totalChars: 16000, inputBytes: 64000,
  outputTokens: 2048, defaultOutputTokens: 1024, outputChars: 8192, metadataBytes: 256, usageCount: 1000000,
  // One tool-calling model response (agent path): text, number of tool calls and size of each call's arguments.
  chatTextChars: 32000, toolCalls: 8, toolArgumentChars: 8000 } as const;
/** Tool names the agent registers and accepts from a model. */
export const AI_TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;
export const AI_MODELS = ['mock-v1'] as const;
