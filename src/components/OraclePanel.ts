/**
 * OraclePanel
 * ─────────────────────────────────────────────────────────────────────────────
 * The main UI panel for Oracle financial intelligence.
 * Extends the standard Panel base class — fits naturally into the grid,
 * supports resize, drag, all existing panel behaviors.
 *
 * Features:
 *   • Zone filter tabs (All / Crypto / Equities / Macro / Commodities / ...)
 *   • Streaming AI output with typewriter effect
 *   • Free Query box — ask Oracle anything
 *   • Analysis history (last 20 runs)
 *   • Status indicators, duration, context summary
 *   • Scan cooldown timer
 */

import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import {
  oracleEngine,
  type OracleZone,
  type OracleAnalysis,
  type OracleStatus,
} from '@/services/oracle-engine';
import {
  getOracleAIConfig,
  getActiveOracleProvider,
  isOracleProviderReady,
  subscribeOracleSettingsChanged,
} from '@/services/oracle-ai-settings';

// ─── Styles (injected once) ───────────────────────────────────────────────────

const STYLE_ID = 'oracle-panel-styles';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
  /* ── Oracle panel base ── */
  .oracle-panel-content {
    scrollbar-width: thin;
    scrollbar-color: rgba(0,212,255,0.15) transparent;
  }
  .oracle-panel-content::-webkit-scrollbar { width: 3px; }
  .oracle-panel-content::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.2); }

  /* ── Zone tabs ── */
  .oracle-zones {
    display: flex;
    gap: 4px;
    padding: 8px 10px 7px;
    flex-wrap: wrap;
    border-bottom: 1px solid rgba(0,212,255,0.08);
    background: rgba(0,0,0,0.3);
    flex-shrink: 0;
  }
  .oracle-zone-btn {
    padding: 4px 12px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.03);
    color: #3a4a5a;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }
  .oracle-zone-btn:hover {
    border-color: rgba(0,212,255,0.45);
    color: #00d4ff;
    background: rgba(0,212,255,0.07);
    box-shadow: 0 0 10px rgba(0,212,255,0.12);
  }
  .oracle-zone-btn.active {
    background: rgba(0,212,255,0.12);
    border-color: rgba(0,212,255,0.6);
    color: #00d4ff;
    box-shadow: 0 0 14px rgba(0,212,255,0.18), inset 0 0 6px rgba(0,212,255,0.06);
  }

  /* ── No-key state ── */
  .oracle-no-key {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 40px 24px;
    text-align: center;
  }
  .oracle-no-key-icon { font-size: 42px; opacity: 0.25; }
  .oracle-no-key-title { font-size: 13px; font-weight: 700; color: #6a7a8a; letter-spacing: 0.5px; }
  .oracle-no-key-desc { font-size: 11px; color: #3a4a5a; line-height: 1.6; max-width: 260px; }
  .oracle-no-key-btn {
    padding: 9px 22px;
    border-radius: 3px;
    background: linear-gradient(135deg, #00d4ff, #0099cc);
    color: #000;
    font-size: 11px;
    font-weight: 800;
    border: none;
    cursor: pointer;
    letter-spacing: 0.5px;
    box-shadow: 0 4px 18px rgba(0,212,255,0.35);
    transition: all 0.2s;
    font-family: monospace;
  }
  .oracle-no-key-btn:hover { box-shadow: 0 4px 28px rgba(0,212,255,0.55); transform: translateY(-1px); }

  /* ── Status bar ── */
  .oracle-status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 12px;
    background: rgba(0,0,0,0.4);
    border-bottom: 1px solid rgba(255,255,255,0.03);
    font-size: 10px;
    flex-shrink: 0;
  }
  .oracle-status-left { display: flex; align-items: center; gap: 7px; }
  .oracle-provider-pill {
    padding: 2px 8px;
    border-radius: 2px;
    background: rgba(74,222,128,0.08);
    border: 1px solid rgba(74,222,128,0.25);
    color: #4ade80;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    font-family: monospace;
  }
  .oracle-provider-pill.no-key {
    background: rgba(251,146,60,0.08);
    border-color: rgba(251,146,60,0.25);
    color: #fb923c;
  }
  .oracle-model-label {
    color: #2a3a4a;
    font-size: 9px;
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
  }
  .oracle-duration { color: #2a3a4a; font-size: 9px; font-family: monospace; }

  /* ── Scan bar ── */
  .oracle-scan-bar {
    display: flex;
    gap: 7px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    align-items: center;
    background: rgba(0,0,0,0.25);
    flex-shrink: 0;
  }
  .oracle-scan-btn {
    padding: 7px 18px;
    border-radius: 3px;
    background: linear-gradient(135deg, rgba(0,212,255,0.12), rgba(0,153,204,0.08));
    color: #00d4ff;
    font-size: 11px;
    font-weight: 800;
    border: 1px solid rgba(0,212,255,0.35);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    letter-spacing: 0.5px;
    font-family: monospace;
    box-shadow: 0 0 12px rgba(0,212,255,0.08);
  }
  .oracle-scan-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,153,204,0.15));
    box-shadow: 0 0 22px rgba(0,212,255,0.22);
    border-color: rgba(0,212,255,0.65);
    transform: translateY(-1px);
  }
  .oracle-scan-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
  .oracle-scan-btn.scanning {
    background: rgba(74,222,128,0.07);
    color: #4ade80;
    border-color: rgba(74,222,128,0.3);
    animation: oracle-glow-pulse 2s ease-in-out infinite;
  }
  @keyframes oracle-glow-pulse {
    0%,100% { box-shadow: 0 0 8px rgba(74,222,128,0.1); }
    50% { box-shadow: 0 0 22px rgba(74,222,128,0.28); }
  }
  .oracle-abort-btn {
    padding: 6px 12px;
    border-radius: 3px;
    background: rgba(248,113,113,0.07);
    border: 1px solid rgba(248,113,113,0.25);
    color: #f87171;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    font-family: monospace;
  }
  .oracle-abort-btn:hover { background: rgba(248,113,113,0.14); border-color: rgba(248,113,113,0.5); }
  .oracle-scan-cooldown { font-size: 9px; color: #1e2a35; font-family: monospace; margin-left: 2px; }

  /* ── Output area ── */
  .oracle-output {
    flex: 1;
    padding: 14px 14px 6px;
    overflow-y: auto;
    min-height: 100px;
    scrollbar-width: thin;
    scrollbar-color: rgba(0,212,255,0.15) transparent;
  }
  .oracle-output::-webkit-scrollbar { width: 3px; }
  .oracle-output::-webkit-scrollbar-track { background: transparent; }
  .oracle-output::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.18); border-radius: 2px; }

  /* ── Oracle text ── */
  .oracle-output-text {
    font-size: 11.5px;
    line-height: 1.8;
    color: #7a8a9a;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  }
  .oracle-output-text .o-h2 {
    font-size: 11px;
    font-weight: 800;
    color: #00d4ff;
    margin: 18px 0 7px;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    padding-bottom: 5px;
    border-bottom: 1px solid rgba(0,212,255,0.12);
    display: block;
  }
  .oracle-output-text .o-h2::before { content: '// '; color: rgba(0,212,255,0.35); }
  .oracle-output-text .o-h3 {
    font-size: 10px;
    font-weight: 700;
    color: #3a8aaa;
    margin: 12px 0 5px;
    text-transform: uppercase;
    letter-spacing: 1px;
    display: block;
  }
  .oracle-output-text .o-h3::before { content: '> '; color: rgba(0,212,255,0.4); }
  .oracle-output-text .o-bullet {
    padding-left: 16px;
    position: relative;
    color: #6a7a8a;
    display: block;
    margin: 3px 0;
  }
  .oracle-output-text .o-bullet::before {
    content: '▸';
    position: absolute;
    left: 0;
    color: rgba(0,212,255,0.45);
    font-size: 9px;
    top: 2px;
  }
  .oracle-output-text .o-bold { font-weight: 700; color: #c0cdd8; }
  .oracle-output-text .o-buy {
    color: #4ade80;
    font-weight: 800;
    text-shadow: 0 0 10px rgba(74,222,128,0.5);
    letter-spacing: 0.5px;
  }
  .oracle-output-text .o-sell {
    color: #f87171;
    font-weight: 800;
    text-shadow: 0 0 10px rgba(248,113,113,0.5);
    letter-spacing: 0.5px;
  }
  .oracle-output-text .o-watch {
    color: #fbbf24;
    font-weight: 800;
    text-shadow: 0 0 10px rgba(251,191,36,0.4);
    letter-spacing: 0.5px;
  }
  .oracle-output-text .o-num { color: #a78bfa; font-weight: 600; }

  /* Cursor */
  .oracle-cursor {
    display: inline-block;
    width: 7px;
    height: 13px;
    background: #00d4ff;
    animation: oracle-blink 0.8s steps(1) infinite;
    vertical-align: text-bottom;
    margin-left: 2px;
    border-radius: 1px;
    box-shadow: 0 0 8px rgba(0,212,255,0.7);
  }
  @keyframes oracle-blink { 0%,100%{opacity:1} 50%{opacity:0} }

  /* ── Thinking ── */
  .oracle-thinking-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 24px 14px;
    color: #2a4050;
    font-size: 11px;
    font-family: monospace;
    letter-spacing: 0.3px;
  }
  .oracle-thinking-dots span {
    display: inline-block;
    width: 5px; height: 5px;
    border-radius: 50%;
    background: #00d4ff;
    animation: oracle-dot 1.2s ease-in-out infinite;
    margin: 0 2px;
    box-shadow: 0 0 6px rgba(0,212,255,0.6);
  }
  .oracle-thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
  .oracle-thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes oracle-dot { 0%,80%,100%{transform:scale(0.5);opacity:0.2} 40%{transform:scale(1);opacity:1} }

  /* ── Query box ── */
  .oracle-query-box {
    display: flex;
    gap: 7px;
    padding: 8px 12px;
    border-top: 1px solid rgba(0,212,255,0.07);
    background: rgba(0,0,0,0.35);
    align-items: flex-end;
    flex-shrink: 0;
  }
  .oracle-query-input {
    flex: 1;
    background: rgba(0,0,0,0.5);
    border: 1px solid rgba(0,212,255,0.1);
    border-radius: 3px;
    padding: 8px 11px;
    font-size: 11px;
    color: #8aa0b5;
    resize: none;
    min-height: 34px;
    max-height: 80px;
    outline: none;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    line-height: 1.4;
    transition: all 0.2s;
  }
  .oracle-query-input:focus {
    border-color: rgba(0,212,255,0.35);
    background: rgba(0,212,255,0.03);
    color: #a0b8cc;
    box-shadow: 0 0 12px rgba(0,212,255,0.06);
  }
  .oracle-query-input::placeholder { color: #1a2a35; font-style: italic; }
  .oracle-query-send {
    padding: 8px 16px;
    border-radius: 3px;
    background: rgba(0,212,255,0.08);
    border: 1px solid rgba(0,212,255,0.22);
    color: #00d4ff;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
    align-self: flex-end;
    transition: all 0.2s;
    height: 34px;
    letter-spacing: 0.3px;
    font-family: monospace;
  }
  .oracle-query-send:hover {
    background: rgba(0,212,255,0.14);
    box-shadow: 0 0 14px rgba(0,212,255,0.2);
    border-color: rgba(0,212,255,0.45);
  }
  .oracle-query-send:disabled { opacity: 0.25; cursor: not-allowed; }

  /* ── History ── */
  .oracle-history-toggle {
    padding: 5px 12px;
    font-size: 9px;
    color: #1e2a35;
    cursor: pointer;
    text-align: center;
    border-top: 1px solid rgba(255,255,255,0.02);
    background: none;
    border-left: none; border-right: none; border-bottom: none;
    width: 100%;
    transition: color 0.15s;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    font-weight: 700;
    font-family: monospace;
    flex-shrink: 0;
  }
  .oracle-history-toggle:hover { color: #3a5a6a; }
  .oracle-history-list {
    border-top: 1px solid rgba(255,255,255,0.02);
    max-height: 140px;
    overflow-y: auto;
    flex-shrink: 0;
  }
  .oracle-history-item {
    padding: 6px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.02);
    cursor: pointer;
    transition: background 0.12s;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .oracle-history-item:hover { background: rgba(0,212,255,0.04); }
  .oracle-history-zone {
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 2px;
    background: rgba(0,212,255,0.07);
    border: 1px solid rgba(0,212,255,0.18);
    color: #00a8cc;
    font-weight: 700;
    text-transform: uppercase;
    white-space: nowrap;
    font-family: monospace;
  }
  .oracle-history-preview {
    font-size: 10px;
    color: #2a3a4a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    font-family: monospace;
  }
  .oracle-history-time { font-size: 9px; color: #1a2a32; white-space: nowrap; font-family: monospace; }

  /* ── Error ── */
  .oracle-error-msg {
    padding: 10px 14px;
    font-size: 11px;
    color: #f87171;
    line-height: 1.5;
    display: flex;
    gap: 8px;
    font-family: monospace;
    border-left: 2px solid rgba(248,113,113,0.4);
    margin: 10px;
    border-radius: 0 3px 3px 0;
    background: rgba(248,113,113,0.04);
  }
  .oracle-error-msg::before {
    content: 'ERR';
    font-size: 8px;
    font-weight: 800;
    padding: 2px 5px;
    background: rgba(248,113,113,0.15);
    border-radius: 2px;
    flex-shrink: 0;
    margin-top: 1px;
    letter-spacing: 0.5px;
  }

  /* ── Idle ── */
  .oracle-idle-msg {
    padding: 28px 16px;
    text-align: center;
    color: #1e2a35;
    font-size: 11px;
    line-height: 1.7;
    font-family: monospace;
  }
  .oracle-idle-msg strong {
    display: block;
    color: #2a3a48;
    font-size: 12px;
    margin-bottom: 7px;
    letter-spacing: 0.5px;
  }
  `;
  document.head.appendChild(el);
}

// ─── Zone definitions ─────────────────────────────────────────────────────────

const ZONES: { id: OracleZone; labelKey: string }[] = [
  { id: 'all',          labelKey: 'oracle.zones.all' },
  { id: 'crypto',       labelKey: 'oracle.zones.crypto' },
  { id: 'equities',     labelKey: 'oracle.zones.equities' },
  { id: 'macro',        labelKey: 'oracle.zones.macro' },
  { id: 'commodities',  labelKey: 'oracle.zones.commodities' },
  { id: 'supplychain',  labelKey: 'oracle.zones.supplychain' },
  { id: 'geopolitical', labelKey: 'oracle.zones.geopolitical' },
];

// ─── Text renderer (lightweight markdown → HTML) ──────────────────────────────

function renderOracleText(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  const out: string[] = [];

  for (const raw of lines) {
    let line = escapeHtml(raw);

    // ## Heading
    if (line.startsWith('## ')) {
      out.push(`<div class="o-h2">${line.slice(3)}</div>`);
      continue;
    }
    // ### Heading
    if (line.startsWith('### ')) {
      out.push(`<div class="o-h3">${line.slice(4)}</div>`);
      continue;
    }
    // Bullet
    if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ')) {
      line = line.slice(2);
      out.push(`<div class="o-bullet">${applyInline(line)}</div>`);
      continue;
    }
    // Numbered
    if (/^\d+\.\s/.test(line)) {
      out.push(`<div class="o-bullet">${applyInline(line)}</div>`);
      continue;
    }
    // Empty
    if (!line.trim()) {
      out.push('<br>');
      continue;
    }
    out.push(`<span>${applyInline(line)}</span><br>`);
  }

  return `<div class="oracle-output-text">${out.join('')}</div>`;
}

function applyInline(line: string): string {
  // **bold**
  line = line.replace(/\*\*(.+?)\*\*/g, '<span class="o-bold">$1</span>');
  // BUY / SELL / WATCH / AVOID signals
  line = line.replace(/\b(BUY|LONG)\b/g, '<span class="o-buy">$1</span>');
  line = line.replace(/\b(SELL|SHORT|AVOID|DUMP)\b/g, '<span class="o-sell">$1</span>');
  line = line.replace(/\b(WATCH|HOLD|NEUTRAL)\b/g, '<span class="o-watch">$1</span>');
  // Dollar amounts and percentages
  line = line.replace(/(\$[\d,]+(?:\.\d+)?[KMBTkb]?|[\d.]+%)/g, '<span class="o-num">$1</span>');
  return line;
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

// ─── OraclePanel ──────────────────────────────────────────────────────────────

export class OraclePanel extends Panel {
  private activeZone: OracleZone = 'all';
  private showHistory = false;
  private viewingHistoryItem: OracleAnalysis | null = null;
  private unsubscribeEngine: (() => void) | null = null;
  private unsubscribeSettings: (() => void) | null = null;
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;
  private cooldownSeconds = 0;

  constructor() {
    super({
      id: 'oracle',
      title: '👁 Oracle',
      showCount: false,
      defaultRowSpan: 3,
      infoTooltip: 'Oracle — AI financial intelligence powered by live Sentinel data. Combines geopolitical signals, market data, macro indicators and supply chain intelligence into actionable analysis.',
    });

    injectStyles();
    this.renderShell();
    this.bindEngine();
    this.bindSettings();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  public destroy(): void {
    this.unsubscribeEngine?.();
    this.unsubscribeSettings?.();
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
  }

  // ── Initial shell render ────────────────────────────────────────────────────

  private renderShell(): void {
    const ready = isOracleProviderReady();

    if (!ready) {
      this.renderNoKey();
      return;
    }

    this.content.innerHTML = '';
    this.content.className = 'panel-content oracle-panel-content';
    this.content.style.cssText = `
      display: flex;
      flex-direction: column;
      padding: 0;
      background: linear-gradient(180deg, #060b14 0%, #050a12 100%);
      position: relative;
      overflow: hidden;
    `;

    this.content.appendChild(this.buildZoneTabs());
    this.content.appendChild(this.buildStatusBar());
    this.content.appendChild(this.buildScanBar());

    const output = document.createElement('div');
    output.className = 'oracle-output';
    output.id = 'oracle-output';
    output.appendChild(this.buildIdlePlaceholder());
    this.content.appendChild(output);

    this.content.appendChild(this.buildQueryBox());
    this.content.appendChild(this.buildHistorySection());

    this.attachPanelEvents();
  }

  private renderNoKey(): void {
    this.content.innerHTML = `
      <div class="oracle-no-key">
        <div class="oracle-no-key-icon">👁</div>
        <div class="oracle-no-key-title">${t('oracle.noKeyTitle')}</div>
        <div class="oracle-no-key-desc">${t('oracle.noKeyDesc')}</div>
        <button class="oracle-no-key-btn" id="oracle-open-settings">${t('oracle.openSettings')}</button>
      </div>
    `;
    this.content.querySelector('#oracle-open-settings')?.addEventListener('click', () => {
      document.querySelector<HTMLButtonElement>('#unifiedSettingsBtn')?.click();
    });
  }

  // ── Sub-element builders ────────────────────────────────────────────────────

  private buildZoneTabs(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'oracle-zones';
    bar.id = 'oracle-zone-bar';
    for (const z of ZONES) {
      const btn = document.createElement('button');
      btn.className = `oracle-zone-btn${z.id === this.activeZone ? ' active' : ''}`;
      btn.dataset.zone = z.id;
      btn.textContent = t(z.labelKey);
      bar.appendChild(btn);
    }
    return bar;
  }

  private buildStatusBar(): HTMLElement {
    const cfg = getOracleAIConfig();
    const providerMeta = getActiveOracleProvider();
    const ready = isOracleProviderReady();
    const modelLabel = (cfg[cfg.activeProvider as keyof typeof cfg] as any)?.model ?? '';

    const bar = document.createElement('div');
    bar.className = 'oracle-status-bar';
    bar.id = 'oracle-status-bar';
    bar.innerHTML = `
      <div class="oracle-status-left">
        <span class="oracle-provider-pill${ready ? '' : ' no-key'}">
          ${ready ? '●' : '⚠'} ${escapeHtml(providerMeta?.name ?? cfg.activeProvider)}
        </span>
        <span class="oracle-model-label">${escapeHtml(modelLabel)}</span>
      </div>
      <span class="oracle-duration" id="oracle-duration"></span>
    `;
    return bar;
  }

  private buildScanBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'oracle-scan-bar';
    bar.id = 'oracle-scan-bar';
    bar.innerHTML = `
      <button class="oracle-scan-btn" id="oracle-scan-btn">
        ${t('oracle.scanNow')}
      </button>
      <button class="oracle-abort-btn" id="oracle-abort-btn" style="display:none">${t('oracle.stop')}</button>
      <span class="oracle-scan-cooldown" id="oracle-cooldown"></span>
    `;
    return bar;
  }

  private buildQueryBox(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'oracle-query-box';
    box.innerHTML = `
      <textarea
        class="oracle-query-input"
        id="oracle-query-input"
        placeholder="${escapeHtml(t('oracle.queryPlaceholder'))}"
        rows="1"
      ></textarea>
      <button class="oracle-query-send" id="oracle-query-send">${t('oracle.askOracle')}</button>
    `;
    return box;
  }

  private buildHistorySection(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.id = 'oracle-history-wrap';

    const toggle = document.createElement('button');
    toggle.className = 'oracle-history-toggle';
    toggle.id = 'oracle-history-toggle';
    toggle.textContent = `▾ ${t('oracle.history')}`;
    wrap.appendChild(toggle);

    const list = document.createElement('div');
    list.className = 'oracle-history-list';
    list.id = 'oracle-history-list';
    list.style.display = 'none';
    wrap.appendChild(list);

    return wrap;
  }

  private buildIdlePlaceholder(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'oracle-idle-msg';
    el.innerHTML = `
      <strong>${t('oracle.idleTitle')}</strong>
      ${t('oracle.idleDesc')}
    `;
    return el;
  }

  // ── Event wiring ────────────────────────────────────────────────────────────

  private attachPanelEvents(): void {
    // Zone tabs
    this.content.querySelector('#oracle-zone-bar')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-zone]');
      if (!btn?.dataset.zone) return;
      this.activeZone = btn.dataset.zone as OracleZone;
      this.content.querySelectorAll('.oracle-zone-btn').forEach(b =>
        b.classList.toggle('active', (b as HTMLElement).dataset.zone === this.activeZone)
      );
    });

    // Scan
    this.content.querySelector('#oracle-scan-btn')?.addEventListener('click', () => {
      this.viewingHistoryItem = null;
      void oracleEngine.scan(this.activeZone, true);
    });

    // Abort
    this.content.querySelector('#oracle-abort-btn')?.addEventListener('click', () => {
      oracleEngine.abort();
    });

    // Query send
    const sendQuery = () => {
      const input = this.content.querySelector<HTMLTextAreaElement>('#oracle-query-input');
      const text = input?.value?.trim() ?? '';
      if (!text) return;
      this.viewingHistoryItem = null;
      void oracleEngine.query(text, this.activeZone);
      if (input) input.value = '';
    };

    this.content.querySelector('#oracle-query-send')?.addEventListener('click', sendQuery);

    this.content.querySelector<HTMLTextAreaElement>('#oracle-query-input')
      ?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendQuery();
        }
      });

    // History toggle
    this.content.querySelector('#oracle-history-toggle')?.addEventListener('click', () => {
      this.showHistory = !this.showHistory;
      const list = this.content.querySelector<HTMLElement>('#oracle-history-list');
      const toggle = this.content.querySelector<HTMLButtonElement>('#oracle-history-toggle');
      if (list) list.style.display = this.showHistory ? 'block' : 'none';
      if (toggle) toggle.textContent = this.showHistory ? `▴ ${t('oracle.history')}` : `▾ ${t('oracle.history')}`;
      if (this.showHistory) this.renderHistory();
    });
  }

  // ── Engine subscription ─────────────────────────────────────────────────────

  private bindEngine(): void {
    this.unsubscribeEngine = oracleEngine.subscribe((state) => {
      this.handleEngineUpdate(state.status, state.lastAnalysis, state.history);
    });
  }

  private bindSettings(): void {
    this.unsubscribeSettings = subscribeOracleSettingsChanged(() => {
      // Re-render shell when provider/key changes
      this.renderShell();
      this.attachPanelEvents();
    });
  }

  // ── State → UI ──────────────────────────────────────────────────────────────

  private handleEngineUpdate(
    status: OracleStatus,
    analysis: OracleAnalysis | null,
    history: OracleAnalysis[],
  ): void {
    if (!isOracleProviderReady()) return;

    const scanBtn   = this.content.querySelector<HTMLButtonElement>('#oracle-scan-btn');
    const abortBtn  = this.content.querySelector<HTMLButtonElement>('#oracle-abort-btn');
    const sendBtn   = this.content.querySelector<HTMLButtonElement>('#oracle-query-send');
    const output    = this.content.querySelector<HTMLElement>('#oracle-output');
    const durationEl = this.content.querySelector<HTMLElement>('#oracle-duration');

    const busy = status === 'gathering' || status === 'thinking';

    // Buttons
    if (scanBtn) {
      scanBtn.disabled = busy;
      scanBtn.classList.toggle('scanning', busy);
      scanBtn.textContent = status === 'gathering' ? t('oracle.gathering')
        : status === 'thinking' ? t('oracle.thinking')
        : t('oracle.scanNow');
    }
    if (abortBtn) abortBtn.style.display = busy ? 'inline-flex' : 'none';
    if (sendBtn) sendBtn.disabled = busy;

    if (!output) return;

    // Output content
    const target = this.viewingHistoryItem ?? analysis;

    if (status === 'gathering') {
      output.innerHTML = `
        <div class="oracle-thinking-indicator">
          <div class="oracle-thinking-dots">
            <span></span><span></span><span></span>
          </div>
          ${t('oracle.gathering')}
        </div>`;
      return;
    }

    if (status === 'thinking' && target) {
      const html = renderOracleText(target.thinking);
      output.innerHTML = `${html}<span class="oracle-cursor"></span>`;
      output.scrollTop = output.scrollHeight;
      return;
    }

    if (status === 'error' && target?.error) {
      output.innerHTML = `<div class="oracle-error-msg">${escapeHtml(target.error)}</div>`;
      return;
    }

    if (status === 'done' && target?.result) {
      output.innerHTML = renderOracleText(target.result);
      if (durationEl && target.durationMs) {
        durationEl.textContent = `${(target.durationMs / 1000).toFixed(1)}s`;
      }
      if (this.showHistory) this.renderHistory();
      this.startCooldown();
    }

    // Update history list if visible
    if (this.showHistory) this.renderHistory();

    // Render history items
    void history;
  }

  // ── History list render ─────────────────────────────────────────────────────

  private renderHistory(): void {
    const list = this.content.querySelector<HTMLElement>('#oracle-history-list');
    if (!list) return;

    const { history } = oracleEngine.getState();
    if (history.length === 0) {
      list.innerHTML = `<div style="padding:8px 12px;font-size:10px;color:var(--color-text-muted,#555)">No history yet</div>`;
      return;
    }

    list.innerHTML = history.map((item, i) => {
      const preview = item.result
        ? item.result.replace(/[#*\n]/g, ' ').slice(0, 80)
        : item.error
          ? `⚠ ${item.error.slice(0, 60)}`
          : '…';
      return `
        <div class="oracle-history-item" data-history-idx="${i}">
          <span class="oracle-history-zone">${item.zone}</span>
          ${item.query ? `<span class="oracle-history-preview">Q: ${escapeHtml(item.query.slice(0, 50))}</span>` : `<span class="oracle-history-preview">${escapeHtml(preview)}</span>`}
          <span class="oracle-history-time">${timeAgo(item.timestamp)}</span>
        </div>
      `;
    }).join('');

    list.querySelectorAll<HTMLElement>('[data-history-idx]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.historyIdx ?? '0', 10);
        const item = oracleEngine.getState().history[idx];
        if (!item) return;
        this.viewingHistoryItem = item;
        const output = this.content.querySelector<HTMLElement>('#oracle-output');
        if (output) output.innerHTML = renderOracleText(item.result || item.error || '');
      });
    });
  }

  // ── Cooldown timer ──────────────────────────────────────────────────────────

  private startCooldown(): void {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldownSeconds = 300; // 5 min matches engine cache

    const update = () => {
      const el = this.content.querySelector<HTMLElement>('#oracle-cooldown');
      if (!el) return;
      if (this.cooldownSeconds <= 0) {
        el.textContent = '';
        if (this.cooldownTimer) clearInterval(this.cooldownTimer);
        return;
      }
      const m = Math.floor(this.cooldownSeconds / 60);
      const s = this.cooldownSeconds % 60;
      el.textContent = `${t('oracle.nextScan')} ${m}:${String(s).padStart(2, '0')}`;
      this.cooldownSeconds--;
    };

    update();
    this.cooldownTimer = setInterval(update, 1_000);
  }
}
