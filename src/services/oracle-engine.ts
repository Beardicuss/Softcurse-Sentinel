/**
 * Oracle Engine v2 - Clean rebuild
 * Uses ALL available Sentinel data sources - 20+ parallel streams.
 */

import { buildOracleCallConfig, getOracleAIConfig, isOracleProviderReady } from './oracle-ai-settings';
import { signalAggregator } from './signal-aggregator';
import { getTopUnstableCountries } from './country-instability';
import { getActiveSurges, getTheaterPostureSummaries } from './military-surge';
import { getAllEscalationScores } from './hotspot-escalation';
import { fetchCrypto, fetchMultipleStocks } from './market';
import { fetchFredData, fetchOilAnalytics } from './economic';
import { fetchShippingRates, fetchChokepointStatus, fetchCriticalMinerals } from './supply-chain';
import { fetchConflictEvents } from './conflict';
import { fetchUSNIFleetReport } from './usni-fleet';
import { fetchAisSignals } from './maritime';
import { fetchCableActivity } from './cable-activity';
import { fetchCyberThreats } from './cyber';
import { fetchClimateAnomalies } from './climate';
import { fetchEarthquakes } from './earthquakes';
import { fetchPredictions } from './prediction';
import { fetchGpsInterference } from './gps-interference';
import { fetchSecurityAdvisories } from './security-advisories';
import { fetchTelegramFeed } from './telegram-intel';
import { fetchTradeRestrictions } from './trade';
import { MARKET_SYMBOLS } from '@/config/markets';

// ---- Types ------------------------------------------------------------------

export type OracleZone =
  | 'all'
  | 'crypto'
  | 'equities'
  | 'macro'
  | 'commodities'
  | 'supplychain'
  | 'geopolitical';

export type OracleStatus = 'idle' | 'gathering' | 'thinking' | 'done' | 'error';

export interface OracleAnalysis {
  id: string;
  timestamp: Date;
  zone: OracleZone;
  query: string | null;
  provider: string;
  model: string;
  thinking: string;
  result: string;
  contextSummary: string;
  durationMs: number;
  error?: string;
}

export interface OracleEngineState {
  status: OracleStatus;
  lastAnalysis: OracleAnalysis | null;
  history: OracleAnalysis[];
}

// ---- System Prompt ----------------------------------------------------------

const ORACLE_SYSTEM_PROMPT = `You are Oracle - a ruthlessly specific financial intelligence engine. ONE job: turn Sentinel data into trades.

ABSOLUTE FORMAT - use EXACTLY this structure every time, no exceptions:

## REGIME
One sentence: current phase (risk-on/risk-off/transitioning) and the single biggest driver right now.

## SIGNAL [ASSET TICKER] - [BUY/SELL/WATCH/AVOID]
Entry: $X | Target: $X (X days) | Stop: $X | Conviction: HIGH/MEDIUM/LOW
Why: [specific data point from brief] + [second data point] + [third] = [price conclusion]

(Max 3 SIGNAL blocks)

## HIDDEN SIGNAL
One thing the market is mispricing. One trade. Entry, target, signal chain from brief data.

---
RULES THAT CANNOT BE BROKEN:
- Every trade MUST cite actual numbers from the intelligence brief
- No disclaimers. No "investors should consider". No "past performance". None.
- Do NOT explain what an asset IS. Only what it WILL DO, based on specific data from brief.
- FORBIDDEN: "Bitcoin is likely to benefit from uncertainty" - too vague, no data cited
- REQUIRED: "BUY BTC $84k target $96k (90d). CII Israel 70/100 + USNI CSG-3 Arabian Sea + GPS jamming 44k hexes = risk-off bid"
- Signal chain must reference named data: CII scores, USNI positions, GPS hex counts, chokepoint transit numbers
- If no data supports a trade, skip it. Never invent signals.`;

// ---- Context Builder --------------------------------------------------------

interface BuiltContext { text: string; summary: string; sourceCount: number; }

async function buildFullContext(zone: OracleZone): Promise<BuiltContext> {
  const sections: string[] = [];
  const included: string[] = [];

  sections.push(`## ORACLE INTELLIGENCE BRIEF - ${new Date().toUTCString()}\nZone: ${zone.toUpperCase()}\n`);

  const [
    conflictResult, usniResult, aisResult, cableResult, cyberResult,
    climateResult, earthquakeResult, _ignored, predictionsResult, gpsResult,
    advisoriesResult, telegramResult, shippingResult, chokepointResult,
    mineralsResult, tradeResult, fredResult, oilResult, cryptoResult, equityResult,
  ] = await Promise.allSettled([
    fetchConflictEvents(),
    fetchUSNIFleetReport(),
    fetchAisSignals(),
    fetchCableActivity(),
    fetchCyberThreats({ limit: 50 }),
    fetchClimateAnomalies(),
    fetchEarthquakes(),
    Promise.resolve(null),
    fetchPredictions(),
    fetchGpsInterference(),
    fetchSecurityAdvisories(),
    fetchTelegramFeed(20),
    fetchShippingRates(),
    fetchChokepointStatus(),
    fetchCriticalMinerals(),
    fetchTradeRestrictions([], 20),
    fetchFredData(),
    fetchOilAnalytics(),
    fetchCrypto(),
    fetchMultipleStocks(MARKET_SYMBOLS.slice(0, 14)),
  ]);

  void _ignored;

  // 1. GEOPOLITICAL SIGNALS
  const signals = signalAggregator.getSummary();
  {
    const lines = ['### GEOPOLITICAL SIGNALS (24h)'];
    lines.push(`Total: ${signals.totalSignals}`);
    const b = signals.byType;
    const parts: string[] = [];
    if (b.military_flight > 0)  parts.push(`${b.military_flight} mil-flights`);
    if (b.military_vessel > 0)  parts.push(`${b.military_vessel} mil-vessels`);
    if (b.protest > 0)          parts.push(`${b.protest} protests`);
    if (b.internet_outage > 0)  parts.push(`${b.internet_outage} net-outages`);
    if (b.ais_disruption > 0)   parts.push(`${b.ais_disruption} AIS-disruptions`);
    if (b.satellite_fire > 0)   parts.push(`${b.satellite_fire} sat-fires`);
    if (b.active_strike > 0)    parts.push(`${b.active_strike} strikes`);
    if (parts.length) lines.push(`Breakdown: ${parts.join(' | ')}`);
    if (signals.convergenceZones.length > 0) {
      lines.push('Convergence zones:');
      signals.convergenceZones.slice(0, 5).forEach(z => lines.push(`  - ${z.description}`));
    }
    if (signals.topCountries.length > 0) {
      lines.push('Hot countries:');
      signals.topCountries.slice(0, 6).forEach(c => {
        const types = [...c.signalTypes].join(',');
        const sev = c.highSeverityCount > 0 ? ` [${c.highSeverityCount} HIGH]` : '';
        lines.push(`  - ${c.countryName}: ${c.totalCount} signals [${types}]${sev} conv=${c.convergenceScore.toFixed(2)}`);
      });
    }
    sections.push(lines.join('\n'));
    included.push('geo-signals');
  }

  // 2. CII SCORES
  const unstable = getTopUnstableCountries(8);
  if (unstable.length > 0) {
    const lines = ['### COUNTRY INSTABILITY INDEX (CII/100)'];
    unstable.forEach(c => {
      const lvl = c.score > 75 ? 'CRITICAL' : c.score > 50 ? 'HIGH' : c.score > 25 ? 'ELEVATED' : 'MODERATE';
      lines.push(`  - ${c.name}: ${c.score.toFixed(0)} [${lvl}]`);
    });
    sections.push(lines.join('\n'));
    included.push('CII');
  }

  // 3. MILITARY POSTURE
  const surges = getActiveSurges();
  const postures = getTheaterPostureSummaries([])
    .filter(p => p.postureLevel === 'critical' || p.postureLevel === 'elevated' || p.strikeCapable);
  if (surges.length > 0 || postures.length > 0) {
    const lines = ['### MILITARY POSTURE'];
    surges.slice(0, 4).forEach(s => {
      lines.push(`  - ${(s.theater as any)?.name ?? s.theater}: ${s.type} surge`);
    });
    postures.slice(0, 4).forEach(p => {
      const strike = p.strikeCapable ? ' [STRIKE CAPABLE]' : '';
      lines.push(`  - ${p.theaterName}: ${p.totalAircraft} ac ${p.postureLevel.toUpperCase()}${strike}${p.targetNation ? ' target=' + p.targetNation : ''}`);
    });
    sections.push(lines.join('\n'));
    included.push('mil-posture');
  }

  // 4. ESCALATION
  const escalations = getAllEscalationScores()
    .filter(e => e.combinedScore > 50)
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, 5);
  if (escalations.length > 0) {
    const lines = ['### ESCALATION DYNAMICS'];
    escalations.forEach(e => {
      lines.push(`  - ${e.hotspotId}: ${e.combinedScore.toFixed(0)}/100 [${e.trend}]`);
    });
    sections.push(lines.join('\n'));
    included.push('escalation');
  }

  // 5. CONFLICTS
  if (conflictResult.status === 'fulfilled' && conflictResult.value?.events?.length > 0) {
    const conflict = conflictResult.value;
    const lines = ['### CONFLICTS (ACLED/UCDP)'];
    lines.push(`${conflict.events.length} events | ${conflict.totalFatalities?.toLocaleString() ?? 'N/A'} fatalities`);
    [...conflict.byCountry.entries()]
      .map(([country, events]) => ({
        country,
        count: events.length,
        fat: events.reduce((s, e) => s + ((e as any).fatalities ?? 0), 0),
      }))
      .sort((a, b) => b.fat - a.fat).slice(0, 6)
      .forEach(c => lines.push(`  - ${c.country}: ${c.count} events ${c.fat} fatalities`));
    sections.push(lines.join('\n'));
    included.push('conflicts');
  }

  // 6. USNI FLEET
  if (usniResult.status === 'fulfilled' && usniResult.value) {
    const fleet = usniResult.value;
    const lines = ['### US NAVY FLEET (USNI)'];
    if (fleet.battleForceSummary) {
      const s = fleet.battleForceSummary;
      lines.push(`${s.totalShips} ships | ${s.deployed} deployed | ${s.underway} underway`);
    }
    fleet.vessels?.filter(v => v.deploymentStatus === 'deployed').slice(0, 8).forEach(v => {
      lines.push(`  - ${v.name} (${v.vesselType}): ${v.region}${v.strikeGroup ? ' [' + v.strikeGroup + ']' : ''}`);
    });
    sections.push(lines.join('\n'));
    included.push('USNI-fleet');
  }

  // 7. AIS
  if (aisResult.status === 'fulfilled' && aisResult.value?.disruptions?.length > 0) {
    const { disruptions } = aisResult.value;
    const lines = ['### AIS MARITIME DISRUPTIONS'];
    lines.push(`Active: ${disruptions.length}`);
    disruptions.slice(0, 5).forEach(d => {
      lines.push(`  - ${(d as any).location ?? (d as any).area ?? 'Unknown'}: ${(d as any).description ?? ''}`);
    });
    sections.push(lines.join('\n'));
    included.push('AIS');
  }

  // 8. CABLE
  if (cableResult.status === 'fulfilled') {
    const advisories = (cableResult.value as any)?.advisories ?? [];
    if (advisories.length > 0) {
      const lines = ['### UNDERSEA CABLE ALERTS'];
      advisories.slice(0, 4).forEach((a: any) => {
        lines.push(`  - ${a.cableName ?? 'Unknown'}: ${a.type ?? ''} ${a.region ?? ''}`);
      });
      sections.push(lines.join('\n'));
      included.push('cables');
    }
  }

  // 9. CYBER
  if (cyberResult.status === 'fulfilled' && cyberResult.value?.length > 0) {
    const threats = cyberResult.value;
    const bySev = threats.reduce((a, t) => { a[t.severity] = (a[t.severity] ?? 0) + 1; return a; }, {} as Record<string, number>);
    const byType = threats.reduce((a, t) => { a[t.type] = (a[t.type] ?? 0) + 1; return a; }, {} as Record<string, number>);
    const lines = ['### CYBER THREATS'];
    lines.push(`${threats.length} total | Critical: ${bySev['critical'] ?? 0} | High: ${bySev['high'] ?? 0}`);
    lines.push(Object.entries(byType).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(' | '));
    sections.push(lines.join('\n'));
    included.push('cyber');
  }

  // 10. GPS JAMMING
  if (gpsResult.status === 'fulfilled' && gpsResult.value && gpsResult.value.stats && gpsResult.value.stats.totalHexes > 0) {
    const stats = gpsResult.value.stats;
    sections.push(`### GPS JAMMING\n  Hexes: ${stats.totalHexes} | High: ${stats.highCount} | Medium: ${stats.mediumCount}`);
    included.push('GPS-jamming');
  }

  // 11. CLIMATE
  if (zone === 'all' || zone === 'commodities' || zone === 'macro') {
    if (climateResult.status === 'fulfilled') {
      const anomalies = ((climateResult.value as any)?.anomalies ?? (climateResult.value as any)?.data ?? []) as any[];
      const sig = anomalies.filter((a: any) => Math.abs(a.tempDelta ?? 0) > 2 || Math.abs(a.precipDelta ?? 0) > 30).slice(0, 5);
      if (sig.length > 0) {
        const lines = ['### CLIMATE ANOMALIES'];
        sig.forEach((a: any) => {
          const temp = a.tempDelta ? `${a.tempDelta > 0 ? '+' : ''}${a.tempDelta.toFixed(1)}C` : '';
          const prec = a.precipDelta ? ` precip:${a.precipDelta > 0 ? '+' : ''}${a.precipDelta.toFixed(0)}mm` : '';
          lines.push(`  - ${a.zone ?? a.region ?? 'Unknown'}: ${temp}${prec}`);
        });
        sections.push(lines.join('\n'));
        included.push('climate');
      }
    }
  }

  // 12. EARTHQUAKES
  if (earthquakeResult.status === 'fulfilled') {
    const quakes = earthquakeResult.value.filter(q => q.magnitude >= 4.5).sort((a, b) => b.magnitude - a.magnitude).slice(0, 4);
    if (quakes.length > 0) {
      const lines = ['### SEISMIC (M4.5+)'];
      quakes.forEach(q => lines.push(`  - M${q.magnitude.toFixed(1)}: ${q.place}`));
      sections.push(lines.join('\n'));
      included.push('seismic');
    }
  }

  // 13. PREDICTION MARKETS
  if (predictionsResult.status === 'fulfilled' && predictionsResult.value?.length > 0) {
    const markets = predictionsResult.value
      .filter(m => m.volume && m.volume > 10000)
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 6);
    if (markets.length > 0) {
      const lines = ['### PREDICTION MARKETS (Polymarket)'];
      markets.forEach(m => {
        lines.push(`  - "${m.title}": YES=${m.yesPrice.toFixed(0)}%${m.volume ? ` $${(m.volume / 1000).toFixed(0)}k` : ''}`);
      });
      sections.push(lines.join('\n'));
      included.push('polymarket');
    }
  }

  // 14. TELEGRAM
  if (telegramResult.status === 'fulfilled' && telegramResult.value?.enabled && telegramResult.value?.items?.length > 0) {
    const tg = telegramResult.value;
    const lines = ['### TELEGRAM OSINT'];
    lines.push(`${tg.count} signals${tg.earlySignal ? ' [EARLY SIGNAL]' : ''}`);
    tg.items.slice(0, 4).forEach((item: any) => {
      lines.push(`  - [${item.channel ?? 'ch'}] ${(item.text ?? item.title ?? '').slice(0, 100)}`);
    });
    sections.push(lines.join('\n'));
    included.push('Telegram');
  }

  // 15. ADVISORIES
  if (advisoriesResult.status === 'fulfilled') {
    const dnt = advisoriesResult.value.advisories.filter(a => a.level === 'do-not-travel').slice(0, 5);
    if (dnt.length > 0) {
      const lines = ['### DO-NOT-TRAVEL'];
      dnt.forEach(a => lines.push(`  - ${a.sourceCountry}: ${a.title.slice(0, 80)}`));
      sections.push(lines.join('\n'));
      included.push('advisories');
    }
  }

  // 16. SUPPLY CHAIN
  {
    const scLines = ['### SUPPLY CHAIN & CHOKEPOINTS'];
    let hasData = false;
    if (chokepointResult.status === 'fulfilled' && chokepointResult.value?.chokepoints?.length > 0) {
      chokepointResult.value.chokepoints.forEach(cp => {
        const risk = (cp as any).riskLevel ?? 'unknown';
        const transits = (cp as any).dailyTransits ?? '?';
        scLines.push(`  - ${cp.name}: risk=${risk} transits/day=${transits}`);
      });
      hasData = true;
    }
    if (shippingResult.status === 'fulfilled' && shippingResult.value?.indices?.length > 0) {
      shippingResult.value.indices.slice(0, 4).forEach(idx => {
        const chg = (idx as any).changePercent ?? 0;
        scLines.push(`  - ${idx.name}: ${(idx as any).value ?? '?'} ${chg > 0 ? '+' : ''}${chg.toFixed(1)}%`);
      });
      hasData = true;
    }
    if (mineralsResult.status === 'fulfilled') {
      const crit = mineralsResult.value.minerals.filter((m: any) => (m.supplyRisk ?? 0) > 60).slice(0, 3);
      if (crit.length > 0) {
        crit.forEach((m: any) => scLines.push(`  - ${m.name}: supply-risk=${m.supplyRisk}/100 top-producer=${m.topProducer ?? 'N/A'}`));
        hasData = true;
      }
    }
    if (hasData) { sections.push(scLines.join('\n')); included.push('supply-chain'); }
  }

  // 17. TRADE RESTRICTIONS
  if (tradeResult.status === 'fulfilled' && tradeResult.value?.restrictions?.length > 0) {
    const active = tradeResult.value.restrictions.filter((r: any) => !r.status || r.status === 'active').slice(0, 5);
    if (active.length > 0) {
      const lines = ['### TRADE RESTRICTIONS'];
      active.forEach((r: any) => {
        lines.push(`  - ${r.imposingCountry ?? '?'} -> ${r.targetCountry ?? '?'}: ${r.measureType ?? 'restriction'} on ${r.sector ?? r.product ?? 'goods'}`);
      });
      sections.push(lines.join('\n'));
      included.push('trade-restrictions');
    }
  }

  // 18. MACRO
  if (zone === 'all' || zone === 'macro' || zone === 'equities') {
    if (fredResult.status === 'fulfilled' && fredResult.value?.length > 0) {
      const lines = ['### MACRO (FRED)'];
      fredResult.value.slice(0, 10).forEach(s => {
        const val = s.value != null ? `${Number(s.value).toFixed(2)} ${s.unit ?? ''}`.trim() : 'N/A';
        const chg = s.change != null ? ` (${s.change > 0 ? '+' : ''}${Number(s.change).toFixed(2)})` : '';
        lines.push(`  - ${s.name}: ${val}${chg}`);
      });
      sections.push(lines.join('\n'));
      included.push('FRED');
    }
    if (oilResult.status === 'fulfilled' && oilResult.value) {
      const oil = oilResult.value;
      const metrics = [oil.wtiPrice, oil.brentPrice, oil.usProduction, oil.usInventory].filter(Boolean) as NonNullable<typeof oil.wtiPrice>[];
      if (metrics.length > 0) {
        const lines = ['### OIL & ENERGY (EIA)'];
        metrics.forEach(m => {
          const dir = m.trend === 'up' ? '+' : m.trend === 'down' ? '-' : '=';
          lines.push(`  - ${m.name}: ${Number(m.current).toFixed(2)} ${m.unit} [${dir}${Math.abs(Number(m.changePct)).toFixed(1)}%]`);
        });
        sections.push(lines.join('\n'));
        included.push('EIA-oil');
      }
    }
  }

  // 19. CRYPTO
  if (zone === 'all' || zone === 'crypto') {
    if (cryptoResult.status === 'fulfilled' && cryptoResult.value?.length > 0) {
      const lines = ['### CRYPTO'];
      cryptoResult.value.slice(0, 12).forEach(c => {
        const price = c.price != null ? `$${c.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}` : 'N/A';
        const chg = c.change != null ? ` ${c.change > 0 ? '+' : ''}${c.change.toFixed(2)}%` : '';
        lines.push(`  - ${c.symbol}: ${price}${chg}`);
      });
      sections.push(lines.join('\n'));
      included.push('crypto');
    }
  }

  // 20. EQUITIES
  if (zone === 'all' || zone === 'equities') {
    if (equityResult.status === 'fulfilled' && equityResult.value?.data?.length > 0) {
      const lines = ['### EQUITIES'];
      equityResult.value.data.forEach(eq => {
        const price = eq.price != null ? `$${eq.price.toFixed(2)}` : 'N/A';
        const chg = eq.change != null ? ` ${eq.change > 0 ? '+' : ''}${eq.change.toFixed(2)}%` : '';
        lines.push(`  - ${eq.display ?? eq.symbol}: ${price}${chg}`);
      });
      sections.push(lines.join('\n'));
      included.push(`equities(${equityResult.value.data.length})`);
    }
  }

  sections.push(buildZoneInstructions(zone));

  return {
    text: sections.join('\n\n'),
    summary: `${included.length} sources: ${included.join(', ')}`,
    sourceCount: included.length,
  };
}

// ---- Zone Instructions ------------------------------------------------------

function buildZoneInstructions(zone: OracleZone): string {
  const fmt = [
    '### REQUIRED OUTPUT FORMAT:',
    '## REGIME - one sentence, current phase + primary driver',
    '## SIGNAL [TICKER] - [BUY/SELL/WATCH/AVOID]',
    'Entry: $X | Target: $X (Xd) | Stop: $X | Conviction: HIGH/MEDIUM/LOW',
    'Why: [data from brief] + [data from brief] = [price effect]',
    '(max 3 SIGNAL blocks)',
    '## HIDDEN SIGNAL - one mispriced asset, signal chain from brief, entry+target',
  ].join('\n');

  switch (zone) {
    case 'crypto':
      return `### ANALYSIS REQUEST - CRYPTO\nFind which geopolitical/macro signals in this brief directly affect crypto prices. Cite specific data.\n${fmt}\nExtra: identify divergence between current risk level and crypto price action.`;
    case 'equities':
      return `### ANALYSIS REQUEST - EQUITIES\nConnect CII scores, USNI positions, and conflict zones to specific sectors/stocks.\n${fmt}\nExtra: which sector benefits most from current military configuration?`;
    case 'macro':
      return `### ANALYSIS REQUEST - MACRO\nFed rate + CPI + 10Y yield = current phase. Recession probability as one number.\nUse TLT, GLD, UUP, or forex pairs for SIGNAL blocks.\n${fmt}`;
    case 'commodities':
      return `### ANALYSIS REQUEST - COMMODITIES\nChokepoint transit data + AIS disruptions + climate anomalies = commodity price effects.\n${fmt}\nExtra: one critical mineral at supply risk given active conflict zones in brief.`;
    case 'supplychain':
      return `### ANALYSIS REQUEST - SUPPLY CHAIN\nConnect chokepoint data + AIS + shipping index values to stocks (tankers, shippers).\n${fmt}\nExtra: which chokepoint has biggest unpriced risk?`;
    case 'geopolitical':
      return `### ANALYSIS REQUEST - GEOPOLITICAL ALPHA\nGPS jamming hexes + military posture + CII scores + prediction market % = trades.\n${fmt}\nExtra: one geopolitical development in brief with direct price impact not yet in mainstream news.`;
    default:
      return `### ANALYSIS REQUEST - FULL SCAN\nCross-reference at minimum 3 data sources per trade. Every signal chain must cite specific numbers.\n${fmt}\nRequired: HIDDEN SIGNAL must use Telegram OSINT, GPS jamming data, AIS disruptions, or prediction markets.`;
  }
}

// ---- AI Caller --------------------------------------------------------------

async function callOracleAI(
  context: string,
  userQuery: string | null,
  onThinking?: (chunk: string) => void,
): Promise<string> {
  const callCfg = buildOracleCallConfig();
  if (!callCfg) throw new Error('No AI provider configured. Add API key in Settings -> Oracle AI.');

  const userMessage = userQuery ? `${context}\n\n---\n\nUser question: ${userQuery}` : context;

  const response = await fetch(callCfg.endpoint, {
    method: 'POST',
    headers: callCfg.headers,
    body: JSON.stringify(callCfg.bodyBuilder(ORACLE_SYSTEM_PROMPT, userMessage)),
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch { /* ignore */ }
    throw new Error(`AI provider error ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = callCfg.extractText(data);
  if (!text) throw new Error('AI provider returned empty response');

  if (onThinking) {
    const words = text.split(' ');
    let acc = '';
    for (let i = 0; i < words.length; i++) {
      acc += (i === 0 ? '' : ' ') + words[i];
      if (i % 8 === 0 || i === words.length - 1) {
        onThinking(acc);
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }
  return text;
}

// ---- Engine -----------------------------------------------------------------

const EVENT_UPDATE = 'oracle-engine-update';
const HISTORY_MAX = 20;
const CACHE_TTL_MS = 5 * 60 * 1000;

class OracleEngine {
  private state: OracleEngineState = { status: 'idle', lastAnalysis: null, history: [] };
  private lastAutoScanAt = 0;
  private abortController: AbortController | null = null;

  getState(): OracleEngineState { return { ...this.state }; }

  subscribe(cb: (state: OracleEngineState) => void): () => void {
    const handler = () => cb(this.getState());
    window.addEventListener(EVENT_UPDATE, handler);
    return () => window.removeEventListener(EVENT_UPDATE, handler);
  }

  async scan(zone: OracleZone = 'all', force = false): Promise<OracleAnalysis | null> {
    if (!isOracleProviderReady()) { this.setStatus('error'); return null; }
    if (!force && zone === 'all' && Date.now() - this.lastAutoScanAt < CACHE_TTL_MS) {
      return this.state.lastAnalysis;
    }
    return this.run(zone, null);
  }

  async query(question: string, zone: OracleZone = 'all'): Promise<OracleAnalysis | null> {
    if (!question.trim() || !isOracleProviderReady()) return null;
    return this.run(zone, question.trim());
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.setStatus('idle');
  }

  restoreFromCache(analysis: OracleAnalysis): void {
    if (this.state.status !== 'idle') return;
    this.setState({
      status: 'done',
      lastAnalysis: analysis,
      history: [analysis, ...this.state.history].slice(0, HISTORY_MAX),
    });
  }

  private async run(zone: OracleZone, userQuery: string | null): Promise<OracleAnalysis | null> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const startMs = Date.now();
    const id = `oracle-${startMs}`;
    const cfg = getOracleAIConfig();

    const pending: OracleAnalysis = {
      id,
      timestamp: new Date(),
      zone,
      query: userQuery,
      provider: cfg.activeProvider,
      model: (cfg[cfg.activeProvider as keyof typeof cfg] as any)?.model ?? '',
      thinking: '',
      result: '',
      contextSummary: '',
      durationMs: 0,
    };

    try {
      this.setState({ status: 'gathering', lastAnalysis: pending });
      const context = await buildFullContext(zone);
      pending.contextSummary = context.summary;

      this.setState({ status: 'thinking', lastAnalysis: { ...pending } });
      const result = await callOracleAI(context.text, userQuery, (partial) => {
        pending.thinking = partial;
        this.setState({ status: 'thinking', lastAnalysis: { ...pending } });
      });

      pending.result = result;
      pending.thinking = result;
      pending.durationMs = Date.now() - startMs;

      if (zone === 'all' && !userQuery) this.lastAutoScanAt = Date.now();

      const history = [pending, ...this.state.history].slice(0, HISTORY_MAX);
      this.setState({ status: 'done', lastAnalysis: pending, history });
      return pending;

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      pending.error = message;
      pending.durationMs = Date.now() - startMs;
      this.setState({
        status: 'error',
        lastAnalysis: pending,
        history: [pending, ...this.state.history].slice(0, HISTORY_MAX),
      });
      console.error('[OracleEngine]', message);
      return pending;
    }
  }

  private setState(partial: Partial<OracleEngineState>): void {
    this.state = { ...this.state, ...partial };
    window.dispatchEvent(new CustomEvent(EVENT_UPDATE, { detail: this.state }));
  }

  private setStatus(status: OracleStatus): void { this.setState({ status }); }
}

export const oracleEngine = new OracleEngine();
