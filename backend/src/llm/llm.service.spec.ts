import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';

// ─── Mock heavy SDK constructors ──────────────────────────────────────────────

jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));
jest.mock('openai', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@google-cloud/translate', () => ({
  v2: { Translate: jest.fn().mockImplementation(() => ({ translate: jest.fn() })) },
}));

// ─── Helper: build service with empty ConfigService (no real SDKs initialised) ─

async function buildService(env: Record<string, string | undefined> = {}): Promise<LlmService> {
  const configGet = jest.fn((key: string) => env[key]);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LlmService,
      { provide: ConfigService, useValue: { get: configGet } },
    ],
  }).compile();
  return module.get(LlmService);
}

/** Injects mock Gemini/DeepSeek clients directly onto the service instance. */
function injectMockGemini(service: LlmService, mockGenerateContent: jest.Mock, mockEmbedContent: jest.Mock) {
  (service as any).gemini = { models: { generateContent: mockGenerateContent, embedContent: mockEmbedContent } };
}
function injectMockDeepSeek(service: LlmService, mockCreate: jest.Mock) {
  (service as any).deepseek = { chat: { completions: { create: mockCreate } } };
}

// ─── extractJson (exercised through generateStructuredJson) ───────────────────

describe('LlmService — extractJson (via generateStructuredJson)', () => {
  let service: LlmService;
  let mockCreate: jest.Mock;

  beforeEach(async () => {
    service = await buildService();
    mockCreate = jest.fn();
    injectMockDeepSeek(service, mockCreate);
  });

  it('parses plain JSON object', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '{"answer":42}' } }] });
    const result = await service.generateStructuredJson<{ answer: number }>('sys', 'usr');
    expect(result).toEqual({ answer: 42 });
  });

  it('parses JSON inside markdown code block', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '```json\n{"key":"val"}\n```' } }],
    });
    const result = await service.generateStructuredJson<{ key: string }>('sys', 'usr');
    expect(result).toEqual({ key: 'val' });
  });

  it('throws on empty response', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '' } }] });
    await expect(service.generateStructuredJson('sys', 'usr', 1)).rejects.toThrow(
      'No JSON found in LLM response (empty)',
    );
  });

  it('throws when no JSON shape found', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'just plain text, no JSON here' } }],
    });
    await expect(service.generateStructuredJson('sys', 'usr', 1)).rejects.toThrow(/No JSON found/);
  });
});

// ─── Constructor — LLM provider selection ─────────────────────────────────────

describe('LlmService — constructor init', () => {
  beforeEach(() => jest.clearAllMocks());

  it('initialises Gemini with VERTEX_AI_KEY', async () => {
    const { GoogleGenAI } = require('@google/genai');
    await buildService({ VERTEX_AI_KEY: 'vertex-key-123' });
    expect(GoogleGenAI).toHaveBeenCalledWith({ vertexai: true, apiKey: 'vertex-key-123' });
  });

  it('initialises Gemini via ADC when only GOOGLE_CLOUD_PROJECT set', async () => {
    const { GoogleGenAI } = require('@google/genai');
    await buildService({ GOOGLE_CLOUD_PROJECT: 'my-project' });
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({ vertexai: true, project: 'my-project' }),
    );
  });

  it('does not initialise Gemini when neither key nor project set', async () => {
    const { GoogleGenAI } = require('@google/genai');
    await buildService({});
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  it('initialises DeepSeek when DEEPSEEK_API_KEY set', async () => {
    const OpenAI = require('openai').default;
    await buildService({ DEEPSEEK_API_KEY: 'ds-key' });
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'ds-key', baseURL: 'https://api.deepseek.com/v1' }),
    );
  });

  it('throws when web-search requested but Gemini not configured', async () => {
    const service = await buildService();
    injectMockDeepSeek(service, jest.fn());
    await expect(
      service.generateStructuredJsonWithWebSearch('sys', 'usr', { useWebSearch: true }),
    ).rejects.toThrow('Integrity requires Gemini');
  });

  it('throws when no LLM configured at all', async () => {
    const service = await buildService();
    // Both gemini and deepseek are null by default when no keys provided
    await expect(service.generateStructuredJson('sys', 'usr')).rejects.toThrow('No LLM configured');
  });
});

// ─── Retry backoff ────────────────────────────────────────────────────────────

describe('LlmService — retry & backoff', () => {
  const RATE_LIMIT_RETRY_MS = 30_000;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('retries DeepSeek on 429 with exponential backoff', async () => {
    const service = await buildService();
    const mockCreate = jest.fn();
    injectMockDeepSeek(service, mockCreate);

    const rateLimitErr = Object.assign(new Error('rate limit exceeded'), { code: 429 });
    mockCreate
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });

    const resultPromise = service.generateStructuredJson<{ ok: boolean }>('sys', 'usr', 3);
    await jest.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_MS);

    expect(await resultPromise).toEqual({ ok: true });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('retry delay increases on second rate-limit attempt', async () => {
    const service = await buildService();
    const mockCreate = jest.fn();
    injectMockDeepSeek(service, mockCreate);

    const rateLimitErr = Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 'RESOURCE_EXHAUSTED' });
    mockCreate
      .mockRejectedValueOnce(rateLimitErr)   // attempt 1 → delay 30s
      .mockRejectedValueOnce(rateLimitErr)   // attempt 2 → delay 60s
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });

    const resultPromise = service.generateStructuredJson<{ ok: boolean }>('sys', 'usr', 3);
    await jest.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_MS);
    await jest.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_MS * 2);

    expect(await resultPromise).toEqual({ ok: true });
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('throws after maxRetries exhausted', async () => {
    const service = await buildService();
    const mockCreate = jest.fn().mockRejectedValue(new Error('permanent failure'));
    injectMockDeepSeek(service, mockCreate);

    // Wrap promise immediately to prevent unhandled rejection before assertion runs.
    const assertion = expect(
      service.generateStructuredJson('sys', 'usr', 2),
    ).rejects.toThrow('permanent failure');
    await jest.advanceTimersByTimeAsync(60_000);
    await assertion;

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('retries Gemini on 429 with exponential backoff', async () => {
    const service = await buildService();
    const mockGenerate = jest.fn();
    injectMockGemini(service, mockGenerate, jest.fn());

    const rateLimitErr = Object.assign(new Error('quota exceeded'), { code: 429 });
    mockGenerate
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValueOnce({ text: '{"data":"yes"}' });

    const resultPromise = service.generateStructuredJson<{ data: string }>('sys', 'usr', 3);
    await jest.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_MS);

    expect(await resultPromise).toEqual({ data: 'yes' });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });
});

// ─── embedTexts ───────────────────────────────────────────────────────────────

describe('LlmService — embedTexts', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns all nulls when Gemini is not configured', async () => {
    const service = await buildService();
    expect(await service.embedTexts(['hello', 'world'])).toEqual([null, null]);
  });

  it('returns empty array for empty input', async () => {
    const service = await buildService();
    injectMockGemini(service, jest.fn(), jest.fn());
    expect(await service.embedTexts([])).toEqual([]);
  });

  it('returns vectors for each text sequentially', async () => {
    const service = await buildService();
    const calls: number[] = [];
    const mockEmbed = jest.fn()
      .mockImplementationOnce(() => { calls.push(1); return Promise.resolve({ embeddings: [{ values: [0.1] }] }); })
      .mockImplementationOnce(() => { calls.push(2); return Promise.resolve({ embeddings: [{ values: [0.2] }] }); });
    injectMockGemini(service, jest.fn(), mockEmbed);

    const result = await service.embedTexts(['a', 'b']);
    expect(result).toEqual([[0.1], [0.2]]);
    expect(calls).toEqual([1, 2]);
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });

  it('returns null for a failed embedding item without throwing', async () => {
    const service = await buildService();
    const mockEmbed = jest.fn()
      .mockResolvedValueOnce({ embeddings: [{ values: [1, 2, 3] }] })
      .mockRejectedValueOnce(new Error('embed failed'));
    injectMockGemini(service, jest.fn(), mockEmbed);

    const result = await service.embedTexts(['ok', 'bad']);
    expect(result[0]).toEqual([1, 2, 3]);
    expect(result[1]).toBeNull();
  });

  it('retries embedSingle on 429 before succeeding', async () => {
    const RATE_LIMIT_RETRY_MS = 30_000;
    const service = await buildService();
    const rateLimitErr = Object.assign(new Error('429'), { code: 429 });
    const mockEmbed = jest.fn()
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValueOnce({ embeddings: [{ values: [9.9] }] });
    injectMockGemini(service, jest.fn(), mockEmbed);

    const resultPromise = service.embedTexts(['retry-me']);
    await jest.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_MS);

    expect(await resultPromise).toEqual([[9.9]]);
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });
});
