/**
 * Oracle AI Settings
 * Manages AI provider configuration for the Oracle financial intelligence module.
 *
 * Providers supported:
 *   Free/Open-source: Groq (llama3), OpenRouter (free tier), Ollama (local)
 *   Paid (future):    Anthropic Claude, OpenAI GPT-4, Google Gemini
 *
 * Keys are stored in localStorage for web, OS keychain via Tauri for desktop.
 * This service is completely independent from the existing AI flow settings —
 * it does NOT touch or break any existing pipeline.
 */

// ─── Storage keys ────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'oracle-ai-';

const KEYS = {
  activeProvider:   `${STORAGE_PREFIX}active-provider`,
  groqKey:          `${STORAGE_PREFIX}groq-key`,
  groqModel:        `${STORAGE_PREFIX}groq-model`,
  openrouterKey:    `${STORAGE_PREFIX}openrouter-key`,
  openrouterModel:  `${STORAGE_PREFIX}openrouter-model`,
  ollamaUrl:        `${STORAGE_PREFIX}ollama-url`,
  ollamaModel:      `${STORAGE_PREFIX}ollama-model`,
  anthropicKey:     `${STORAGE_PREFIX}anthropic-key`,
  anthropicModel:   `${STORAGE_PREFIX}anthropic-model`,
  openaiKey:        `${STORAGE_PREFIX}openai-key`,
  openaiModel:      `${STORAGE_PREFIX}openai-model`,
  geminiKey:        `${STORAGE_PREFIX}gemini-key`,
  geminiModel:      `${STORAGE_PREFIX}gemini-model`,
  oracleEnabled:    `${STORAGE_PREFIX}enabled`,
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type OracleProviderId =
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'anthropic'
  | 'openai'
  | 'gemini';

export interface OracleProviderMeta {
  id: OracleProviderId;
  name: string;
  tier: 'free' | 'paid';
  description: string;
  signupUrl: string;
  docsUrl: string;
  defaultModel: string;
  freeModels: { value: string; label: string }[];
  paidModels: { value: string; label: string }[];
  keyPlaceholder: string;
  /** true = no key needed, connect via URL instead */
  usesUrl?: boolean;
}

export interface OracleAIConfig {
  activeProvider: OracleProviderId;
  oracleEnabled: boolean;
  groq:        { apiKey: string; model: string };
  openrouter:  { apiKey: string; model: string };
  ollama:      { apiUrl: string; model: string };
  anthropic:   { apiKey: string; model: string };
  openai:      { apiKey: string; model: string };
  gemini:      { apiKey: string; model: string };
}

// ─── Provider catalogue ───────────────────────────────────────────────────────

export const ORACLE_PROVIDERS: OracleProviderMeta[] = [
  {
    id: 'groq',
    name: 'Groq',
    tier: 'free',
    description: 'Ultra-fast inference. Free tier includes Llama 3, Mixtral, Gemma. Best for real-time Oracle analysis.',
    signupUrl: 'https://console.groq.com/',
    docsUrl: 'https://console.groq.com/docs/models',
    defaultModel: 'llama-3.3-70b-versatile',
    keyPlaceholder: 'gsk_...',
    freeModels: [
      { value: 'llama-3.3-70b-versatile',    label: 'Llama 3.3 70B (recommended)' },
      { value: 'llama3-70b-8192',             label: 'Llama 3 70B' },
      { value: 'llama3-8b-8192',              label: 'Llama 3 8B (fastest)' },
      { value: 'mixtral-8x7b-32768',          label: 'Mixtral 8x7B' },
      { value: 'gemma2-9b-it',                label: 'Gemma 2 9B' },
    ],
    paidModels: [],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    tier: 'free',
    description: 'Access 200+ models through one API. Many completely free models available. Great for testing different intelligences.',
    signupUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/models?q=free',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    keyPlaceholder: 'sk-or-v1-...',
    freeModels: [
      { value: 'meta-llama/llama-3.3-70b-instruct:free',   label: 'Llama 3.3 70B (free)' },
      { value: 'meta-llama/llama-3.1-8b-instruct:free',    label: 'Llama 3.1 8B (free)' },
      { value: 'microsoft/phi-3-medium-128k-instruct:free', label: 'Phi-3 Medium (free)' },
      { value: 'mistralai/mistral-7b-instruct:free',       label: 'Mistral 7B (free)' },
      { value: 'google/gemma-2-9b-it:free',                label: 'Gemma 2 9B (free)' },
      { value: 'deepseek/deepseek-r1:free',                label: 'DeepSeek R1 (free, reasoning)' },
      { value: 'qwen/qwen3-235b-a22b:free',                label: 'Qwen3 235B (free)' },
    ],
    paidModels: [
      { value: 'anthropic/claude-opus-4',          label: 'Claude Opus 4' },
      { value: 'openai/gpt-4o',                    label: 'GPT-4o' },
      { value: 'google/gemini-2.5-pro-preview',    label: 'Gemini 2.5 Pro' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    tier: 'free',
    usesUrl: true,
    description: 'Run AI completely locally on your machine. 100% private, no API costs. Requires Ollama installed.',
    signupUrl: 'https://ollama.com/download',
    docsUrl: 'https://ollama.com/library',
    defaultModel: 'llama3.2',
    keyPlaceholder: 'http://localhost:11434',
    freeModels: [
      { value: 'llama3.2',         label: 'Llama 3.2 3B (fast, small)' },
      { value: 'llama3.1:8b',      label: 'Llama 3.1 8B' },
      { value: 'llama3.1:70b',     label: 'Llama 3.1 70B (powerful, slow)' },
      { value: 'mistral',          label: 'Mistral 7B' },
      { value: 'mixtral',          label: 'Mixtral 8x7B' },
      { value: 'deepseek-r1:8b',   label: 'DeepSeek R1 8B (reasoning)' },
      { value: 'qwen2.5:7b',       label: 'Qwen 2.5 7B' },
      { value: 'phi3',             label: 'Phi-3 Mini (very fast)' },
    ],
    paidModels: [],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    tier: 'paid',
    description: 'Claude Opus / Sonnet — world-class reasoning and analysis. Best overall intelligence for Oracle.',
    signupUrl: 'https://console.anthropic.com/',
    docsUrl: 'https://docs.anthropic.com/models',
    defaultModel: 'claude-sonnet-4-6',
    keyPlaceholder: 'sk-ant-...',
    freeModels: [],
    paidModels: [
      { value: 'claude-opus-4-6',    label: 'Claude Opus 4.6 (most powerful)' },
      { value: 'claude-sonnet-4-6',  label: 'Claude Sonnet 4.6 (recommended)' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    tier: 'paid',
    description: 'GPT-4o with structured reasoning. Excellent for quantitative financial analysis.',
    signupUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/models',
    defaultModel: 'gpt-4o',
    keyPlaceholder: 'sk-...',
    freeModels: [],
    paidModels: [
      { value: 'gpt-4o',            label: 'GPT-4o (recommended)' },
      { value: 'gpt-4o-mini',       label: 'GPT-4o Mini (cheaper)' },
      { value: 'o3',                label: 'o3 (deep reasoning)' },
      { value: 'o4-mini',           label: 'o4-mini (fast reasoning)' },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    tier: 'paid',
    description: 'Gemini 2.5 Pro with massive context window. Good for processing large intelligence briefs.',
    signupUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    defaultModel: 'gemini-2.5-pro-preview-05-06',
    keyPlaceholder: 'AIza...',
    freeModels: [
      { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (free tier)' },
    ],
    paidModels: [
      { value: 'gemini-2.5-pro-preview-05-06', label: 'Gemini 2.5 Pro (best)' },
      { value: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash (fast)' },
    ],
  },
];

// ─── Read / Write helpers ─────────────────────────────────────────────────────

function lsGet(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* quota / private */ }
}

function lsDel(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getOracleAIConfig(): OracleAIConfig {
  return {
    activeProvider: (lsGet(KEYS.activeProvider) as OracleProviderId) || 'groq',
    oracleEnabled: lsGet(KEYS.oracleEnabled) === 'true',
    groq: {
      apiKey: lsGet(KEYS.groqKey),
      model:  lsGet(KEYS.groqModel) || 'llama-3.3-70b-versatile',
    },
    openrouter: {
      apiKey: lsGet(KEYS.openrouterKey),
      model:  lsGet(KEYS.openrouterModel) || 'meta-llama/llama-3.3-70b-instruct:free',
    },
    ollama: {
      apiUrl: lsGet(KEYS.ollamaUrl) || 'http://localhost:11434',
      model:  lsGet(KEYS.ollamaModel) || 'llama3.2',
    },
    anthropic: {
      apiKey: lsGet(KEYS.anthropicKey),
      model:  lsGet(KEYS.anthropicModel) || 'claude-sonnet-4-6',
    },
    openai: {
      apiKey: lsGet(KEYS.openaiKey),
      model:  lsGet(KEYS.openaiModel) || 'gpt-4o',
    },
    gemini: {
      apiKey: lsGet(KEYS.geminiKey),
      model:  lsGet(KEYS.geminiModel) || 'gemini-2.5-pro-preview-05-06',
    },
  };
}

export function setOracleProvider(id: OracleProviderId): void {
  lsSet(KEYS.activeProvider, id);
  notifyOracleSettingsChanged();
}

export function setOracleEnabled(enabled: boolean): void {
  lsSet(KEYS.oracleEnabled, String(enabled));
  notifyOracleSettingsChanged();
}

export function setOracleProviderKey(provider: OracleProviderId, value: string): void {
  const map: Record<OracleProviderId, string> = {
    groq:        KEYS.groqKey,
    openrouter:  KEYS.openrouterKey,
    ollama:      KEYS.ollamaUrl,
    anthropic:   KEYS.anthropicKey,
    openai:      KEYS.openaiKey,
    gemini:      KEYS.geminiKey,
  };
  if (value.trim()) {
    lsSet(map[provider], value.trim());
  } else {
    lsDel(map[provider]);
  }
  notifyOracleSettingsChanged();
}

export function setOracleProviderModel(provider: OracleProviderId, model: string): void {
  const map: Record<OracleProviderId, string> = {
    groq:        KEYS.groqModel,
    openrouter:  KEYS.openrouterModel,
    ollama:      KEYS.ollamaModel,
    anthropic:   KEYS.anthropicModel,
    openai:      KEYS.openaiModel,
    gemini:      KEYS.geminiModel,
  };
  lsSet(map[provider], model);
  notifyOracleSettingsChanged();
}

export function getActiveOracleProvider(): OracleProviderMeta | undefined {
  const cfg = getOracleAIConfig();
  return ORACLE_PROVIDERS.find(p => p.id === cfg.activeProvider);
}

/** Returns true if the active provider has a key/url configured */
export function isOracleProviderReady(): boolean {
  const cfg = getOracleAIConfig();
  const p = cfg.activeProvider;
  if (p === 'ollama')      return !!cfg.ollama.apiUrl;
  if (p === 'groq')        return !!cfg.groq.apiKey;
  if (p === 'openrouter')  return !!cfg.openrouter.apiKey;
  if (p === 'anthropic')   return !!cfg.anthropic.apiKey;
  if (p === 'openai')      return !!cfg.openai.apiKey;
  if (p === 'gemini')      return !!cfg.gemini.apiKey;
  return false;
}

/** Build a fetch-ready config for the oracle engine to call the API */
export interface OracleCallConfig {
  endpoint: string;
  headers: Record<string, string>;
  bodyBuilder: (systemPrompt: string, userMessage: string) => object;
  extractText: (response: unknown) => string;
}

export function buildOracleCallConfig(): OracleCallConfig | null {
  const cfg = getOracleAIConfig();

  switch (cfg.activeProvider) {

    case 'groq':
      if (!cfg.groq.apiKey) return null;
      return {
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        headers: { 'Authorization': `Bearer ${cfg.groq.apiKey}`, 'Content-Type': 'application/json' },
        bodyBuilder: (sys, user) => ({
          model: cfg.groq.model,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
          temperature: 0.7,
          max_tokens: 2048,
        }),
        extractText: (r: any) => r?.choices?.[0]?.message?.content ?? '',
      };

    case 'openrouter':
      if (!cfg.openrouter.apiKey) return null;
      return {
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${cfg.openrouter.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://worldmonitor.app',
          'X-Title': 'Softcurse Oracle',
        },
        bodyBuilder: (sys, user) => ({
          model: cfg.openrouter.model,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
          temperature: 0.7,
          max_tokens: 2048,
        }),
        extractText: (r: any) => r?.choices?.[0]?.message?.content ?? '',
      };

    case 'ollama':
      return {
        endpoint: `${cfg.ollama.apiUrl}/api/chat`,
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: (sys, user) => ({
          model: cfg.ollama.model,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
          stream: false,
          options: { temperature: 0.7, num_predict: 2048 },
        }),
        extractText: (r: any) => r?.message?.content ?? '',
      };

    case 'anthropic':
      if (!cfg.anthropic.apiKey) return null;
      return {
        endpoint: 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': cfg.anthropic.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        bodyBuilder: (sys, user) => ({
          model: cfg.anthropic.model,
          system: sys,
          messages: [{ role: 'user', content: user }],
          max_tokens: 2048,
        }),
        extractText: (r: any) => r?.content?.[0]?.text ?? '',
      };

    case 'openai':
      if (!cfg.openai.apiKey) return null;
      return {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        headers: { 'Authorization': `Bearer ${cfg.openai.apiKey}`, 'Content-Type': 'application/json' },
        bodyBuilder: (sys, user) => ({
          model: cfg.openai.model,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
          temperature: 0.7,
          max_tokens: 2048,
        }),
        extractText: (r: any) => r?.choices?.[0]?.message?.content ?? '',
      };

    case 'gemini': {
      if (!cfg.gemini.apiKey) return null;
      const model = cfg.gemini.model;
      return {
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.gemini.apiKey}`,
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: (sys, user) => ({
          system_instruction: { parts: [{ text: sys }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
        extractText: (r: any) => r?.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      };
    }

    default:
      return null;
  }
}

// ─── Event bus ────────────────────────────────────────────────────────────────

const EVENT = 'oracle-ai-settings-changed';

export function notifyOracleSettingsChanged(): void {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeOracleSettingsChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
