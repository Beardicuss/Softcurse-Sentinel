/**
 * Oracle AI Settings Tab
 * Renders the "Oracle AI" configuration panel inside UnifiedSettings.
 *
 * Plugs into the existing settings modal by injecting a new tab button
 * and tab panel. Does NOT modify any existing tab or functionality.
 *
 * Usage (in UnifiedSettings.ts after open()):
 *   import { attachOracleAITab } from '@/services/oracle-ai-tab';
 *   this.oracleTabCleanup = attachOracleAITab(this.overlay);
 */

import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import {
  ORACLE_PROVIDERS,
  getOracleAIConfig,
  setOracleProvider,
  setOracleEnabled,
  setOracleProviderKey,
  setOracleProviderModel,
  isOracleProviderReady,
  type OracleProviderId,
} from '@/services/oracle-ai-settings';

// ─── SVG icons ────────────────────────────────────────────────────────────────

const EYE_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const CHECK_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const LINK_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

// ─── CSS (injected once) ──────────────────────────────────────────────────────

const STYLE_ID = 'oracle-ai-tab-styles';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    /* ── Oracle tab layout ── */
    .oracle-tab-content {
      display: flex;
      flex-direction: column;
      gap: 0;
      padding: 0;
      height: 100%;
      overflow-y: auto;
    }

    /* ── Master toggle ── */
    .oracle-master-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      background: color-mix(in srgb, var(--color-accent, #00d4ff) 6%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--color-accent, #00d4ff) 15%, transparent);
    }
    .oracle-master-toggle-info { display: flex; flex-direction: column; gap: 2px; }
    .oracle-master-toggle-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text, #e0e0e0);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .oracle-master-toggle-desc {
      font-size: 11px;
      color: var(--color-text-muted, #888);
    }
    .oracle-status-badge {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 10px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    .oracle-status-badge.ready   { background: #16a34a22; color: #4ade80; border: 1px solid #16a34a55; }
    .oracle-status-badge.no-key  { background: #92400e22; color: #fbbf24; border: 1px solid #92400e55; }
    .oracle-status-badge.off     { background: #1f2937; color: #6b7280; border: 1px solid #374151; }

    /* ── Provider grid ── */
    .oracle-provider-section {
      padding: 14px 18px 6px;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
    }
    .oracle-section-title {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--color-text-muted, #666);
      margin-bottom: 10px;
    }
    .oracle-provider-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 7px;
      margin-bottom: 4px;
    }
    .oracle-provider-card {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 9px 10px;
      border-radius: 7px;
      border: 1px solid var(--color-border, #2a2a2a);
      cursor: pointer;
      transition: all 0.15s ease;
      background: var(--color-surface, #1a1a1a);
      position: relative;
    }
    .oracle-provider-card:hover {
      border-color: var(--color-accent, #00d4ff);
      background: color-mix(in srgb, var(--color-accent, #00d4ff) 5%, var(--color-surface, #1a1a1a));
    }
    .oracle-provider-card.active {
      border-color: var(--color-accent, #00d4ff);
      background: color-mix(in srgb, var(--color-accent, #00d4ff) 10%, var(--color-surface, #1a1a1a));
    }
    .oracle-provider-card.active::after {
      content: '';
      position: absolute;
      top: 6px; right: 6px;
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--color-accent, #00d4ff);
    }
    .oracle-provider-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text, #e0e0e0);
    }
    .oracle-provider-tier {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 8px;
      font-weight: 600;
      width: fit-content;
    }
    .oracle-provider-tier.free { background: #14532d22; color: #4ade80; border: 1px solid #16a34a44; }
    .oracle-provider-tier.paid { background: #78350f22; color: #fb923c; border: 1px solid #92400e44; }
    .oracle-provider-desc {
      font-size: 10px;
      color: var(--color-text-muted, #777);
      line-height: 1.4;
      margin-top: 2px;
    }

    /* ── Config area ── */
    .oracle-config-area {
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .oracle-config-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--color-text, #e0e0e0);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .oracle-config-links {
      display: flex;
      gap: 10px;
    }
    .oracle-config-link {
      font-size: 10px;
      color: var(--color-accent, #00d4ff);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 3px;
      opacity: 0.8;
    }
    .oracle-config-link:hover { opacity: 1; text-decoration: underline; }

    .oracle-input-group { display: flex; flex-direction: column; gap: 5px; }
    .oracle-input-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--color-text-muted, #777);
    }
    .oracle-input-row { display: flex; gap: 6px; align-items: center; }
    .oracle-input {
      flex: 1;
      background: var(--color-bg, #111);
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 6px;
      padding: 7px 10px;
      font-size: 12px;
      color: var(--color-text, #e0e0e0);
      font-family: var(--font-mono, monospace);
      transition: border-color 0.15s;
      outline: none;
    }
    .oracle-input:focus { border-color: var(--color-accent, #00d4ff); }
    .oracle-input.valid { border-color: #16a34a88; }
    .oracle-input::placeholder { color: var(--color-text-muted, #555); }

    .oracle-toggle-btn {
      background: none;
      border: 1px solid var(--color-border, #333);
      border-radius: 5px;
      padding: 6px 8px;
      cursor: pointer;
      color: var(--color-text-muted, #777);
      display: flex;
      align-items: center;
      transition: all 0.15s;
      flex-shrink: 0;
    }
    .oracle-toggle-btn:hover { color: var(--color-text, #e0e0e0); border-color: #555; }

    .oracle-select {
      width: 100%;
      background: var(--color-bg, #111);
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 6px;
      padding: 7px 10px;
      font-size: 12px;
      color: var(--color-text, #e0e0e0);
      outline: none;
      cursor: pointer;
    }
    .oracle-select:focus { border-color: var(--color-accent, #00d4ff); }

    .oracle-optgroup-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--color-text-muted, #666);
      padding: 4px 0 2px;
      border-top: 1px solid var(--color-border, #2a2a2a);
      margin-top: 4px;
    }

    .oracle-save-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .oracle-save-status {
      font-size: 11px;
      color: #4ade80;
      display: flex;
      align-items: center;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .oracle-save-status.visible { opacity: 1; }
    .oracle-save-btn {
      padding: 7px 16px;
      border-radius: 6px;
      background: var(--color-accent, #00d4ff);
      color: #000;
      font-size: 12px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .oracle-save-btn:hover { opacity: 0.85; }

    /* ── ai-flow-switch reuse ── */
    .oracle-master-switch { position: relative; display: inline-flex; align-items: center; }
    .oracle-master-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
    .oracle-master-slider {
      display: flex; align-items: center;
      width: 40px; height: 22px;
      background: #333; border-radius: 11px;
      cursor: pointer; transition: background 0.2s;
      position: relative;
    }
    .oracle-master-slider::after {
      content: ''; position: absolute;
      left: 3px; width: 16px; height: 16px;
      background: #fff; border-radius: 50%;
      transition: left 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    }
    .oracle-master-switch input:checked + .oracle-master-slider { background: var(--color-accent, #00d4ff); }
    .oracle-master-switch input:checked + .oracle-master-slider::after { left: 21px; }

    /* ── Info note ── */
    .oracle-info-note {
      margin: 0 18px 14px;
      padding: 10px 12px;
      background: color-mix(in srgb, var(--color-accent, #00d4ff) 5%, transparent);
      border: 1px solid color-mix(in srgb, var(--color-accent, #00d4ff) 20%, transparent);
      border-radius: 7px;
      font-size: 11px;
      color: var(--color-text-muted, #888);
      line-height: 1.5;
    }
  `;
  document.head.appendChild(el);
}

// ─── Main render ──────────────────────────────────────────────────────────────

function renderTabContent(container: HTMLElement): void {
  const cfg = getOracleAIConfig();
  const activeProvider = ORACLE_PROVIDERS.find(p => p.id === cfg.activeProvider)!;
  const ready = isOracleProviderReady();

  const statusBadge = cfg.oracleEnabled
    ? (ready
        ? `<span class="oracle-status-badge ready">● READY</span>`
        : `<span class="oracle-status-badge no-key">⚠ KEY NEEDED</span>`)
    : `<span class="oracle-status-badge off">OFF</span>`;

  // ── Provider cards ──
  const freeCards = ORACLE_PROVIDERS
    .filter(p => p.tier === 'free')
    .map(p => providerCard(p, cfg.activeProvider))
    .join('');
  const paidCards = ORACLE_PROVIDERS
    .filter(p => p.tier === 'paid')
    .map(p => providerCard(p, cfg.activeProvider))
    .join('');

  // ── Models select ──
  const allModels = [...activeProvider.freeModels, ...activeProvider.paidModels];
  const currentModel = cfg[activeProvider.id as keyof typeof cfg] as { model?: string; apiKey?: string; apiUrl?: string } | undefined;
  const currentModelValue = (currentModel as any)?.model ?? activeProvider.defaultModel;

  const modelOptions = [
    ...(activeProvider.freeModels.length ? [`<optgroup label="Free models">`] : []),
    ...activeProvider.freeModels.map(m =>
      `<option value="${escapeHtml(m.value)}"${m.value === currentModelValue ? ' selected' : ''}>${escapeHtml(m.label)}</option>`
    ),
    ...(activeProvider.freeModels.length ? ['</optgroup>'] : []),
    ...(activeProvider.paidModels.length ? [`<optgroup label="Paid models">`] : []),
    ...activeProvider.paidModels.map(m =>
      `<option value="${escapeHtml(m.value)}"${m.value === currentModelValue ? ' selected' : ''}>${escapeHtml(m.label)}</option>`
    ),
    ...(activeProvider.paidModels.length ? ['</optgroup>'] : []),
  ].join('');

  // ── Key/URL field ──
  const isOllama = activeProvider.id === 'ollama';
  const currentKeyOrUrl = isOllama
    ? cfg.ollama.apiUrl
    : (cfg[activeProvider.id as keyof typeof cfg] as any)?.apiKey ?? '';
  const fieldLabel = isOllama ? 'Ollama Server URL' : 'API Key';
  const fieldPlaceholder = activeProvider.keyPlaceholder;
  const hasValue = !!currentKeyOrUrl;

  container.innerHTML = `
    <div class="oracle-tab-content">

      <!-- Master toggle -->
      <div class="oracle-master-toggle">
        <div class="oracle-master-toggle-info">
          <div class="oracle-master-toggle-title">
            ${t('oracle.settings.title')}
            ${statusBadge}
          </div>
          <div class="oracle-master-toggle-desc">
            ${t('oracle.settings.desc')}
          </div>
        </div>
        <label class="oracle-master-switch">
          <input type="checkbox" id="oracle-enabled-toggle"${cfg.oracleEnabled ? ' checked' : ''}>
          <span class="oracle-master-slider"></span>
        </label>
      </div>

      <!-- Free providers -->
      <div class="oracle-provider-section">
        <div class="oracle-section-title">Free &amp; Open Source</div>
        <div class="oracle-provider-grid" id="oracle-free-grid">${freeCards}</div>
      </div>

      <!-- Paid providers -->
      <div class="oracle-provider-section">
        <div class="oracle-section-title">Premium Providers</div>
        <div class="oracle-provider-grid" id="oracle-paid-grid">${paidCards}</div>
      </div>

      <!-- Active provider config -->
      <div class="oracle-config-area">
        <div class="oracle-config-title">
          <span>Configure: ${escapeHtml(activeProvider.name)}</span>
          <div class="oracle-config-links">
            <a class="oracle-config-link" href="${escapeHtml(activeProvider.signupUrl)}" target="_blank" rel="noopener">
              ${LINK_SVG} Get key
            </a>
            <a class="oracle-config-link" href="${escapeHtml(activeProvider.docsUrl)}" target="_blank" rel="noopener">
              ${LINK_SVG} Models
            </a>
          </div>
        </div>

        <!-- Key / URL input -->
        <div class="oracle-input-group">
          <label class="oracle-input-label" for="oracle-key-input">${escapeHtml(fieldLabel)}</label>
          <div class="oracle-input-row">
            <input
              class="oracle-input${hasValue ? ' valid' : ''}"
              id="oracle-key-input"
              type="password"
              placeholder="${escapeHtml(fieldPlaceholder)}"
              value="${escapeHtml(currentKeyOrUrl)}"
              autocomplete="off"
              spellcheck="false"
            />
            <button class="oracle-toggle-btn" id="oracle-key-toggle" title="Show/hide" aria-label="Toggle visibility">
              ${EYE_SVG}
            </button>
          </div>
        </div>

        <!-- Model select -->
        ${allModels.length > 0 ? `
        <div class="oracle-input-group">
          <label class="oracle-input-label" for="oracle-model-select">Model</label>
          <select class="oracle-select" id="oracle-model-select">${modelOptions}</select>
        </div>
        ` : ''}

        <!-- Save row -->
        <div class="oracle-save-row">
          <span class="oracle-save-status" id="oracle-save-status">
            ${CHECK_SVG} Saved
          </span>
          <button class="oracle-save-btn" id="oracle-save-btn">Save Configuration</button>
        </div>
      </div>

      <!-- Info note -->
      <div class="oracle-info-note">
        <strong>Start free:</strong> Groq and OpenRouter both offer generous free tiers with no credit card required.
        For maximum Oracle intelligence, Groq's <em>Llama 3.3 70B</em> is recommended — fast, free, and powerful.
        Upgrade to Claude or GPT-4o anytime for deeper reasoning.
      </div>

    </div>
  `;

  // ── Attach event handlers ──
  attachHandlers(container);
}

function providerCard(provider: typeof ORACLE_PROVIDERS[0], activeId: OracleProviderId): string {
  const isActive = provider.id === activeId;
  return `
    <div class="oracle-provider-card${isActive ? ' active' : ''}" data-oracle-provider="${provider.id}" title="${escapeHtml(provider.description)}">
      <span class="oracle-provider-name">${escapeHtml(provider.name)}</span>
      <span class="oracle-provider-tier ${provider.tier}">${provider.tier === 'free' ? '✓ Free' : '★ Paid'}</span>
    </div>
  `;
}

function attachHandlers(container: HTMLElement): void {
  // Master toggle
  const enabledToggle = container.querySelector<HTMLInputElement>('#oracle-enabled-toggle');
  enabledToggle?.addEventListener('change', () => {
    setOracleEnabled(enabledToggle.checked);
  });

  // Provider card clicks
  container.querySelectorAll<HTMLElement>('[data-oracle-provider]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.oracleProvider as OracleProviderId;
      setOracleProvider(id);
      renderTabContent(container); // re-render with new active provider
    });
  });

  // Key input show/hide
  const keyInput = container.querySelector<HTMLInputElement>('#oracle-key-input');
  const keyToggle = container.querySelector<HTMLButtonElement>('#oracle-key-toggle');
  let keyVisible = false;
  keyToggle?.addEventListener('click', () => {
    keyVisible = !keyVisible;
    if (keyInput) keyInput.type = keyVisible ? 'text' : 'password';
    keyToggle.innerHTML = keyVisible ? EYE_OFF_SVG : EYE_SVG;
  });

  // Live validation indicator
  keyInput?.addEventListener('input', () => {
    if (keyInput.value.trim().length > 8) {
      keyInput.classList.add('valid');
    } else {
      keyInput.classList.remove('valid');
    }
  });

  // Save button
  const saveBtn = container.querySelector<HTMLButtonElement>('#oracle-save-btn');
  const saveStatus = container.querySelector<HTMLElement>('#oracle-save-status');

  saveBtn?.addEventListener('click', () => {
    const cfg = getOracleAIConfig();
    const activeId = cfg.activeProvider;

    // Save key/URL
    const keyVal = keyInput?.value ?? '';
    setOracleProviderKey(activeId, keyVal);

    // Save model
    const modelSelect = container.querySelector<HTMLSelectElement>('#oracle-model-select');
    if (modelSelect?.value) {
      setOracleProviderModel(activeId, modelSelect.value);
    }

    // Show saved feedback
    if (saveStatus) {
      saveStatus.classList.add('visible');
      setTimeout(() => saveStatus.classList.remove('visible'), 2200);
    }

    // Re-render master toggle status badge
    renderTabContent(container);
  });
}

// ─── Tab injection into UnifiedSettings ──────────────────────────────────────

const TAB_ID = 'oracle-ai';

/**
 * Call this after UnifiedSettings renders its HTML.
 * Injects the Oracle AI tab button and panel into the existing modal.
 * Returns a cleanup function.
 */
export function attachOracleAITab(modal: HTMLElement): () => void {
  injectStyles();

  // 1. Add tab button
  const tabBar = modal.querySelector('.unified-settings-tabs');
  if (!tabBar) return () => {};

  const tabBtn = document.createElement('button');
  tabBtn.className = 'unified-settings-tab';
  tabBtn.dataset.tab = TAB_ID;
  tabBtn.setAttribute('role', 'tab');
  tabBtn.setAttribute('aria-selected', 'false');
  tabBtn.setAttribute('id', `us-tab-${TAB_ID}`);
  tabBtn.setAttribute('aria-controls', `us-tab-panel-${TAB_ID}`);
  tabBtn.textContent = '👁 Oracle AI';
  tabBar.appendChild(tabBtn);

  // 2. Add tab panel
  const tabPanel = document.createElement('div');
  tabPanel.className = 'unified-settings-tab-panel';
  tabPanel.dataset.panelId = TAB_ID;
  tabPanel.id = `us-tab-panel-${TAB_ID}`;
  tabPanel.setAttribute('role', 'tabpanel');
  tabPanel.setAttribute('aria-labelledby', `us-tab-${TAB_ID}`);

  // Insert after the last existing tab panel
  const existingPanels = modal.querySelectorAll('.unified-settings-tab-panel');
  const lastPanel = existingPanels[existingPanels.length - 1];
  if (lastPanel?.parentNode) {
    lastPanel.parentNode.insertBefore(tabPanel, lastPanel.nextSibling);
  } else {
    modal.querySelector('.unified-settings-modal')?.appendChild(tabPanel);
  }

  // 3. Hook into the existing tab-switch logic by listening for clicks on ALL tabs
  //    and toggling our panel accordingly
  const handleTabClick = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('.unified-settings-tab');
    if (!target) return;

    const clickedTab = target.dataset.tab;

    // Toggle our button's active state
    tabBtn.classList.toggle('active', clickedTab === TAB_ID);
    tabBtn.setAttribute('aria-selected', String(clickedTab === TAB_ID));

    // Toggle our panel's active state
    tabPanel.classList.toggle('active', clickedTab === TAB_ID);

    // If our tab was clicked, render content
    if (clickedTab === TAB_ID && !tabPanel.hasChildNodes()) {
      renderTabContent(tabPanel);
    }

    // If our tab button was clicked, also deactivate the other tab buttons/panels
    // (The existing code handles deactivating itself via switchTab, we just sync ours)
  };

  tabBtn.addEventListener('click', () => {
    // Deactivate all other tabs/panels (mirror what switchTab does for the others)
    modal.querySelectorAll('.unified-settings-tab').forEach(t => {
      if ((t as HTMLElement).dataset.tab !== TAB_ID) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      }
    });
    modal.querySelectorAll('.unified-settings-tab-panel').forEach(p => {
      if ((p as HTMLElement).dataset.panelId !== TAB_ID) {
        p.classList.remove('active');
      }
    });

    tabBtn.classList.add('active');
    tabBtn.setAttribute('aria-selected', 'true');
    tabPanel.classList.add('active');

    if (!tabPanel.querySelector('.oracle-tab-content')) {
      renderTabContent(tabPanel);
    }
  });

  modal.addEventListener('click', handleTabClick);

  return () => {
    modal.removeEventListener('click', handleTabClick);
    tabBtn.remove();
    tabPanel.remove();
  };
}
