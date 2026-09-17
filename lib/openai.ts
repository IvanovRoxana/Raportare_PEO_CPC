import { createOpenAI } from '@ai-sdk/openai';

export const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

export function getActivityAgentModelName() {
  return process.env.OPENAI_ACTIVITY_AGENT_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export function getEligibilityModelName() {
  return process.env.OPENAI_ELIGIBILITY_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export class OpenAIConfigurationError extends Error {
  code = 'OPENAI_API_KEY_MISSING';
  status = 500;

  constructor() {
    super('OPENAI_API_KEY is not configured on the server.');
    this.name = 'OpenAIConfigurationError';
  }
}

let openAIClient: ReturnType<typeof createOpenAI> | null = null;

export function getOpenAIApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new OpenAIConfigurationError();
  }

  return apiKey;
}

export function getOpenAIClient() {
  if (!openAIClient) {
    openAIClient = createOpenAI({
      apiKey: getOpenAIApiKey(),
    });
  }

  return openAIClient;
}

export function openaiModel(model = DEFAULT_OPENAI_MODEL) {
  return getOpenAIClient()(model);
}

export function isOpenAIConfigurationError(error: unknown): error is OpenAIConfigurationError {
  return error instanceof OpenAIConfigurationError;
}
