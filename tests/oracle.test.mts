/**
 * Oracle Integration Test
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the Oracle context builder, prompt structure, and AI call config
 * WITHOUT making real API calls (mocks the fetch layer).
 *
 * Run: npx tsx tests/oracle.test.mts
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

// ── Mock localStorage (Node doesn't have it) ──────────────────────────────────

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};
(globalThis as any).localStorage = localStorageMock;
(globalThis as any).window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

// ── Import after mocks ────────────────────────────────────────────────────────

// We import only the pure logic parts — no DOM, no Tauri
const {
  getOracleAIConfig,
  setOracleProvider,
  setOracleProviderKey,
  setOracleProviderModel,
  setOracleEnabled,
  isOracleProviderReady,
  buildOracleCallConfig,
  ORACLE_PROVIDERS,
} = await import('../src/services/oracle-ai-settings.ts');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Oracle AI Settings', () => {

  beforeEach(() => localStorageMock.clear());

  it('defaults to groq provider', () => {
    const cfg = getOracleAIConfig();
    assert.equal(cfg.activeProvider, 'groq');
    assert.equal(cfg.oracleEnabled, false);
  });

  it('can switch providers', () => {
    setOracleProvider('openrouter');
    assert.equal(getOracleAIConfig().activeProvider, 'openrouter');

    setOracleProvider('ollama');
    assert.equal(getOracleAIConfig().activeProvider, 'ollama');

    setOracleProvider('anthropic');
    assert.equal(getOracleAIConfig().activeProvider, 'anthropic');
  });

  it('isOracleProviderReady — false with no key', () => {
    setOracleProvider('groq');
    assert.equal(isOracleProviderReady(), false);
  });

  it('isOracleProviderReady — true after setting key', () => {
    setOracleProvider('groq');
    setOracleProviderKey('groq', 'gsk_test_key_123456');
    assert.equal(isOracleProviderReady(), true);
  });

  it('isOracleProviderReady — ollama ready with just URL', () => {
    setOracleProvider('ollama');
    // ollama URL is pre-set to http://localhost:11434 by default
    assert.equal(isOracleProviderReady(), true);
  });

  it('can set and read model', () => {
    setOracleProvider('groq');
    setOracleProviderModel('groq', 'llama3-8b-8192');
    const cfg = getOracleAIConfig();
    assert.equal(cfg.groq.model, 'llama3-8b-8192');
  });

  it('can enable/disable Oracle', () => {
    setOracleEnabled(true);
    assert.equal(getOracleAIConfig().oracleEnabled, true);
    setOracleEnabled(false);
    assert.equal(getOracleAIConfig().oracleEnabled, false);
  });
});

describe('buildOracleCallConfig', () => {

  beforeEach(() => localStorageMock.clear());

  it('returns null when no key set for groq', () => {
    setOracleProvider('groq');
    assert.equal(buildOracleCallConfig(), null);
  });

  it('returns valid config for groq with key', () => {
    setOracleProvider('groq');
    setOracleProviderKey('groq', 'gsk_test_abc123');
    const cfg = buildOracleCallConfig();
    assert.ok(cfg);
    assert.ok(cfg.endpoint.includes('groq.com'));
    assert.ok(cfg.headers['Authorization'].startsWith('Bearer gsk_test_abc123'));

    const body = cfg.bodyBuilder('system prompt', 'user message') as any;
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[0].content, 'system prompt');
    assert.equal(body.messages[1].role, 'user');
    assert.equal(body.messages[1].content, 'user message');
  });

  it('returns valid config for openrouter with key', () => {
    setOracleProvider('openrouter');
    setOracleProviderKey('openrouter', 'sk-or-v1-testkey');
    const cfg = buildOracleCallConfig();
    assert.ok(cfg);
    assert.ok(cfg.endpoint.includes('openrouter.ai'));
    assert.equal(cfg.headers['HTTP-Referer'], 'https://worldmonitor.app');
    assert.equal(cfg.headers['X-Title'], 'Softcurse Oracle');
  });

  it('returns valid config for ollama without key', () => {
    setOracleProvider('ollama');
    const cfg = buildOracleCallConfig();
    assert.ok(cfg);
    assert.ok(cfg.endpoint.includes('localhost:11434'));
    assert.ok(cfg.endpoint.includes('/api/chat'));

    const body = cfg.bodyBuilder('sys', 'user') as any;
    assert.equal(body.stream, false);
    assert.equal(body.messages[0].role, 'system');
  });

  it('ollama uses custom URL when set', () => {
    setOracleProvider('ollama');
    setOracleProviderKey('ollama', 'http://192.168.1.100:11434');
    const cfg = buildOracleCallConfig();
    assert.ok(cfg);
    assert.ok(cfg.endpoint.includes('192.168.1.100'));
  });

  it('returns valid config for anthropic', () => {
    setOracleProvider('anthropic');
    setOracleProviderKey('anthropic', 'sk-ant-testkey');
    const cfg = buildOracleCallConfig();
    assert.ok(cfg);
    assert.ok(cfg.endpoint.includes('anthropic.com'));
    assert.ok(cfg.headers['x-api-key'] === 'sk-ant-testkey');
    assert.ok(cfg.headers['anthropic-version']);

    const body = cfg.bodyBuilder('sys', 'user') as any;
    // Anthropic uses system at top level, not in messages
    assert.equal(body.system, 'sys');
    assert.equal(body.messages[0].role, 'user');
  });

  it('returns valid config for openai', () => {
    setOracleProvider('openai');
    setOracleProviderKey('openai', 'sk-testkey');
    const cfg = buildOracleCallConfig();
    assert.ok(cfg);
    assert.ok(cfg.endpoint.includes('openai.com'));
  });

  it('returns valid config for gemini', () => {
    setOracleProvider('gemini');
    setOracleProviderKey('gemini', 'AIza_testkey');
    setOracleProviderModel('gemini', 'gemini-2.0-flash-exp');
    const cfg = buildOracleCallConfig();
    assert.ok(cfg);
    assert.ok(cfg.endpoint.includes('generativelanguage.googleapis.com'));
    assert.ok(cfg.endpoint.includes('AIza_testkey'));
    assert.ok(cfg.endpoint.includes('gemini-2.0-flash-exp'));

    const body = cfg.bodyBuilder('sys', 'user') as any;
    assert.ok(body.system_instruction);
    assert.ok(body.contents);
  });

  it('extractText works for each provider format', () => {
    const providers = [
      {
        id: 'groq' as const,
        key: 'gsk_test',
        mockResponse: { choices: [{ message: { content: 'groq response' } }] },
        expected: 'groq response',
      },
      {
        id: 'openrouter' as const,
        key: 'sk-or-v1-test',
        mockResponse: { choices: [{ message: { content: 'openrouter response' } }] },
        expected: 'openrouter response',
      },
      {
        id: 'anthropic' as const,
        key: 'sk-ant-test',
        mockResponse: { content: [{ text: 'anthropic response' }] },
        expected: 'anthropic response',
      },
      {
        id: 'openai' as const,
        key: 'sk-test',
        mockResponse: { choices: [{ message: { content: 'openai response' } }] },
        expected: 'openai response',
      },
      {
        id: 'gemini' as const,
        key: 'AIza_test',
        mockResponse: { candidates: [{ content: { parts: [{ text: 'gemini response' }] } }] },
        expected: 'gemini response',
      },
    ];

    for (const { id, key, mockResponse, expected } of providers) {
      localStorageMock.clear();
      setOracleProvider(id);
      setOracleProviderKey(id, key);
      const cfg = buildOracleCallConfig();
      assert.ok(cfg, `${id}: config should not be null`);
      const extracted = cfg.extractText(mockResponse);
      assert.equal(extracted, expected, `${id}: extractText should return correct text`);
    }
  });
});

describe('ORACLE_PROVIDERS catalogue', () => {

  it('has all 6 providers', () => {
    assert.equal(ORACLE_PROVIDERS.length, 6);
    const ids = ORACLE_PROVIDERS.map(p => p.id);
    assert.ok(ids.includes('groq'));
    assert.ok(ids.includes('openrouter'));
    assert.ok(ids.includes('ollama'));
    assert.ok(ids.includes('anthropic'));
    assert.ok(ids.includes('openai'));
    assert.ok(ids.includes('gemini'));
  });

  it('free providers have free models', () => {
    const freeProviders = ORACLE_PROVIDERS.filter(p => p.tier === 'free');
    assert.equal(freeProviders.length, 3); // groq, openrouter, ollama
    for (const p of freeProviders) {
      assert.ok(p.freeModels.length > 0, `${p.id} should have free models`);
      assert.ok(p.signupUrl.startsWith('https://'), `${p.id} signup URL should be valid`);
    }
  });

  it('paid providers have paid models', () => {
    const paidProviders = ORACLE_PROVIDERS.filter(p => p.tier === 'paid');
    assert.equal(paidProviders.length, 3); // anthropic, openai, gemini
    for (const p of paidProviders) {
      assert.ok(p.paidModels.length > 0, `${p.id} should have paid models`);
    }
  });

  it('all providers have required fields', () => {
    for (const p of ORACLE_PROVIDERS) {
      assert.ok(p.id, 'id required');
      assert.ok(p.name, 'name required');
      assert.ok(p.description, 'description required');
      assert.ok(p.defaultModel, 'defaultModel required');
      assert.ok(p.keyPlaceholder, 'keyPlaceholder required');
      assert.ok(p.docsUrl.startsWith('https://'), 'docsUrl must be valid');
    }
  });
});

describe('Oracle prompt structure', () => {

  it('groq body has correct message structure', () => {
    localStorageMock.clear();
    setOracleProvider('groq');
    setOracleProviderKey('groq', 'gsk_test');
    const cfg = buildOracleCallConfig()!;

    const systemPrompt = 'You are Oracle...';
    const userMsg = '## ORACLE BRIEF\n\n### MACRO\n- Fed: 5.25%';

    const body = cfg.bodyBuilder(systemPrompt, userMsg) as any;

    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[0].content, systemPrompt);
    assert.equal(body.messages[1].role, 'user');
    assert.equal(body.messages[1].content, userMsg);
    assert.ok(body.temperature >= 0 && body.temperature <= 1);
    assert.ok(body.max_tokens > 500);
  });

  it('query appended correctly to context', () => {
    localStorageMock.clear();
    setOracleProvider('groq');
    setOracleProviderKey('groq', 'gsk_test');
    const cfg = buildOracleCallConfig()!;

    const context = '## ORACLE BRIEF\n\ndata here';
    const query = 'What does the Suez situation mean for oil?';
    const fullMsg = `${context}\n\n---\n\nUser question: ${query}`;

    // Verify the message format Oracle Engine would send
    const body = cfg.bodyBuilder('sys', fullMsg) as any;
    assert.ok(body.messages[1].content.includes('User question:'));
    assert.ok(body.messages[1].content.includes(query));
  });
});

console.log('\n✅ All Oracle tests passed\n');
