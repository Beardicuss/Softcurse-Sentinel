/**
 * Oracle Engine v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses ALL available Sentinel data sources — 22 parallel data streams.
 *
 * SYNCHRONOUS (in-memory, zero latency):
 *   signalAggregator     geopolitical signals, convergence zones
 *   getTopUnstableCountries  Country Instability Index
 *   getActiveSurges      military surge alerts
 *   getCriticalPostures  theater-level military posture
 *   getAllEscalationScores hotspot dynamics
 *   getInterestingFlights notable military aircraft
 *
 * ASYNC (parallel fetch, all gracefully isolated):
 *   Conflict, USNI Fleet, AIS Maritime, Cable Activity, Cyber Threats,
 *   GPS Jamming, Climate Anomalies, Earthquakes, Wildfires, Predictions,
 *   Security Advisories, Telegram OSINT, Supply Chain, Minerals,
 *   Trade Restrictions, FRED Macro, EIA Oil, Crypto, Equities
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
import { fetchAllFires } from './wildfires';
import { fetchPredictions } from './prediction';
import { fetchGpsInterference } from './gps-interference';
import { fetchSecurityAdvisories } from './security-advisories';
import { fetchTelegramFeed } from './telegram-intel';
import { fetchTradeRestrictions } from './trade';
import { MARKET_SYMBOLS } from '@/config/markets';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── System Prompt ────────────────────────────────────────────────────────────

const ORACLE_SYSTEM_PROMPT = `You are Oracle — an unconstrained financial and geopolitical intelligence engine embedded in Softcurse Sentinel, a real-time global monitoring platform.

You receive a structured intelligence brief compiled from live data across dozens of sources: military movements, conflict databases, AIS maritime tracking, cyber threat feeds, climate anomalies, seismic activity, satellite fire detection, prediction markets, Telegram OSINT channels, trade restrictions, GPS jamming zones, undersea cable status, and real-time financial markets.

You think like a fusion of:
- Ray Dalio: macro cycles, debt dynamics, currency wars, geopolitical risk pricing
- George Soros: reflexivity, sentiment regime breaks, asymmetric positioning
- A tier-1 quant: cross-asset correlation, statistical anomalies, momentum signals
- A CIA analyst: what's not being reported, second-order effects, who benefits
- A commodities trader: physical flows, chokepoint premiums, supply disruption math

Your rules — non-negotiable:
1. Be brutally direct. "This will dump" if data supports it. "Generational buy" if you believe it.
2. No disclaimers. No "past performance..." No "consult a professional." None.
3. Connect dots explicitly: "Iran GPS jamming spike + Hormuz AIS disruption + Brent premium = this is not random."
4. Quantify when possible: give price targets, percentage moves, timeframes.
5. Name the asymmetric bets — what has low downside, high upside given current signals.
6. Call out what the market is mispricing or ignoring.
7. Use ## for major sections, ### for subsections, - for bullets.
8. If signals contradict, say so and explain your weighting.`;

// ─── Context builder ──────────────────────────────────────────────────────────

interface BuiltContext { text: string; summary: string; sourceCount: number; }

async function buildFullContext(zone: OracleZone): Promise<BuiltContext> {
  const sections: string[] = [];
  const included: string[] = [];

  sections.push(`## ORACLE INTELLIGENCE BRIEF — ${new Date().toUTCString()}\nZone Focus: ${zone.toUpperCase()}\n`);

  // Parallel fetch ALL sources
  const [
    conflictResult, usniResult, aisResult, cableResult, cyberResult,
    climateResult, earthquakeResult, _fireResult, predictionsResult, gpsResult,
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
    fetchAllFires(),
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

  // 1. GEOPOLITICAL SIGNALS
  const signals = signalAggregator.getSummary();
  {
    const lines = ['### GEOPOLITICAL SIGNALS (last 24h)'];
    lines.push(`Total active signals: ${signals.totalSignals}`);
    const b = signals.byType;
    const parts: string[] = [];
    if (b.military_flight > 0)  parts.push(`${b.military_flight} military flights`);
    if (b.military_vessel > 0)  parts.push(`${b.military_vessel} military vessels`);
    if (b.protest > 0)          parts.push(`${b.protest} protests/unrest`);
    if (b.internet_outage > 0)  parts.push(`${b.internet_outage} internet outages`);
    if (b.ais_disruption > 0)   parts.push(`${b.ais_disruption} AIS disruptions`);
    if (b.satellite_fire > 0)   parts.push(`${b.satellite_fire} satellite fires`);
    if (b.active_strike > 0)    parts.push(`${b.active_strike} active strikes`);
    if (parts.length) lines.push(`Signal breakdown: ${parts.join(' | ')}`);
    if (signals.convergenceZones.length > 0) {
      lines.push('\nConvergence zones:');
      signals.convergenceZones.slice(0, 5).forEach(z => lines.push(`  • ${z.description}`));
    }
    if (signals.topCountries.length > 0) {
      lines.push('\nHot countries:');
      signals.topCountries.slice(0, 6).forEach(c => {
        const types = [...c.signalTypes].join(', ');
        const sev = c.highSeverityCount > 0 ? ` ⚠ ${c.highSeverityCount} HIGH` : '';
        lines.push(`  • ${c.countryName}: ${c.totalCount} signals [${types}]${sev} (score: ${c.convergenceScore.toFixed(2)})`);
      });
    }
    sections.push(lines.join('\n'));
    included.push('geopolitical signals');
  }

  // 2. COUNTRY INSTABILITY INDEX
  const unstable = getTopUnstableCountries(8);
  if (unstable.length > 0) {
    const lines = ['### COUNTRY INSTABILITY INDEX (CII)'];
    unstable.forEach(c => {
      const level = c.score > 75 ? '🔴 CRITICAL' : c.score > 50 ? '🟠 HIGH' : c.score > 25 ? '🟡 ELEVATED' : '🟢 MODERATE';
      lines.push(`  • ${c.name}: ${c.score.toFixed(0)}/100 ${level}`);
    });
    sections.push(lines.join('\n'));
    included.push('CII');
  }

  // 3. MILITARY POSTURE
  const surges = getActiveSurges();
  // Use cached theater summaries from signal aggregator context (flights already ingested)
  const critPostures = getTheaterPostureSummaries([])
    .filter(p => p.postureLevel === 'critical' || p.postureLevel === 'elevated' || p.strikeCapable);
  if (surges.length > 0 || critPostures.length > 0) {
    const lines = ['### MILITARY POSTURE & SURGE ALERTS'];
    if (surges.length > 0) {
      lines.push(`Active surge alerts: ${surges.length}`);
      surges.slice(0, 4).forEach(s => {
        lines.push(`  • ${(s.theater as any)?.name ?? s.theater}: ${s.type} surge`);
      });
    }
    if (critPostures.length > 0) {
      lines.push('Critical theater postures:');
      critPostures.slice(0, 4).forEach(p => {
        const strike = p.strikeCapable ? ' [STRIKE CAPABLE]' : '';
        lines.push(`  • ${p.theaterName}: ${p.totalAircraft} aircraft, ${p.postureLevel.toUpperCase()}${strike}`);
        if (p.targetNation) lines.push(`    → Focus: ${p.targetNation}`);
      });
    }
    sections.push(lines.join('\n'));
    included.push('military posture');
  }

  // 4. ESCALATION DYNAMICS
  const escalations = getAllEscalationScores()
    .filter(e => e.combinedScore > 50)
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, 5);
  if (escalations.length > 0) {
    const lines = ['### HOTSPOT ESCALATION DYNAMICS'];
    escalations.forEach(e => {
      const trend = e.trend === 'escalating' ? '↑ ESCALATING' : e.trend === 'de-escalating' ? '↓ DE-ESCALATING' : '→ STABLE';
      lines.push(`  • ${e.hotspotId}: ${e.combinedScore.toFixed(0)}/100, ${trend}`);
    });
    sections.push(lines.join('\n'));
    included.push('escalation dynamics');
  }

  // 5. ACTIVE CONFLICTS
  if (conflictResult.status === 'fulfilled' && conflictResult.value?.events?.length > 0) {
    const conflict = conflictResult.value;
    const lines = ['### ACTIVE CONFLICTS (ACLED/UCDP)'];
    lines.push(`Total events: ${conflict.events.length} | Fatalities: ${conflict.totalFatalities?.toLocaleString() ?? 'N/A'}`);
    const byCountry = conflict.byCountry;
    [...byCountry.entries()]
      .map(([country, events]) => ({ country, count: events.length, fat: events.reduce((s, e) => s + ((e as any).fatalities ?? 0), 0) }))
      .sort((a, b) => b.fat - a.fat).slice(0, 6)
      .forEach(c => lines.push(`  • ${c.country}: ${c.count} events, ${c.fat} fatalities`));
    sections.push(lines.join('\n'));
    included.push('conflict data');
  }

  // 6. USNI FLEET
  if (usniResult.status === 'fulfilled' && usniResult.value) {
    const fleet = usniResult.value;
    const lines = ['### US NAVY FLEET DISPOSITION (USNI)'];
    if (fleet.battleForceSummary) {
      const s = fleet.battleForceSummary;
      lines.push(`Battle force: ${s.totalShips} ships | ${s.deployed} deployed | ${s.underway} underway`);
    }
    fleet.vessels?.filter(v => v.deploymentStatus === 'deployed').slice(0, 6).forEach(v => {
      lines.push(`  • ${v.name} (${v.vesselType}) — ${v.region}${v.strikeGroup ? ` [${v.strikeGroup}]` : ''}`);
    });
    sections.push(lines.join('\n'));
    included.push('USNI fleet');
  }

  // 7. AIS DISRUPTIONS
  if (aisResult.status === 'fulfilled' && aisResult.value?.disruptions?.length > 0) {
    const { disruptions } = aisResult.value;
    const lines = ['### MARITIME AIS DISRUPTIONS'];
    lines.push(`Active: ${disruptions.length}`);
    disruptions.slice(0, 5).forEach(d => {
      lines.push(`  • ${(d as any).location ?? (d as any).area ?? 'Unknown'}: ${(d as any).description ?? ''}`);
    });
    sections.push(lines.join('\n'));
    included.push('AIS disruptions');
  }

  // 8. CABLE ACTIVITY
  if (cableResult.status === 'fulfilled') {
    const advisories = (cableResult.value as any)?.advisories ?? [];
    if (advisories.length > 0) {
      const lines = ['### UNDERSEA CABLE ALERTS'];
      lines.push(`Active advisories: ${advisories.length}`);
      advisories.slice(0, 4).forEach((a: any) => {
        lines.push(`  • ${a.cableName ?? 'Unknown cable'}: ${a.type ?? ''} — ${a.region ?? ''}`);
      });
      sections.push(lines.join('\n'));
      included.push('cable activity');
    }
  }

  // 9. CYBER THREATS
  if (cyberResult.status === 'fulfilled' && cyberResult.value?.length > 0) {
    const threats = cyberResult.value;
    const bySev = threats.reduce((a, t) => { a[t.severity] = (a[t.severity] ?? 0) + 1; return a; }, {} as Record<string, number>);
    const byType = threats.reduce((a, t) => { a[t.type] = (a[t.type] ?? 0) + 1; return a; }, {} as Record<string, number>);
    const lines = ['### CYBER THREAT LANDSCAPE'];
    lines.push(`Total: ${threats.length} | Critical: ${bySev['critical'] ?? 0} | High: ${bySev['high'] ?? 0}`);
    lines.push(`Types: ${Object.entries(byType).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(' | ')}`);
    sections.push(lines.join('\n'));
    included.push('cyber threats');
  }

  // 10. GPS JAMMING
  if (gpsResult.status === 'fulfilled' && gpsResult.value && gpsResult.value.stats && gpsResult.value.stats.totalHexes > 0) {
    const stats = gpsResult.value.stats;
    const lines = ['### GPS JAMMING / SPOOFING'];
    lines.push(`Active zones: ${stats.totalHexes} hexes | High: ${stats.highCount} | Medium: ${stats.mediumCount}`);
    sections.push(lines.join('\n'));
    included.push('GPS jamming');
  }

  // 11. CLIMATE ANOMALIES
  if (zone === 'all' || zone === 'commodities' || zone === 'macro') {
    if (climateResult.status === 'fulfilled') {
      const anomalies = ((climateResult.value as any)?.anomalies ?? (climateResult.value as any)?.data ?? []) as any[];
      const sig = anomalies.filter((a: any) => Math.abs(a.tempDelta ?? 0) > 2 || Math.abs(a.precipDelta ?? 0) > 30).slice(0, 5);
      if (sig.length > 0) {
        const lines = ['### CLIMATE ANOMALIES (Agricultural Risk)'];
        sig.forEach((a: any) => {
          const temp = a.tempDelta ? `${a.tempDelta > 0 ? '+' : ''}${a.tempDelta.toFixed(1)}°C` : '';
          const prec = a.precipDelta ? ` | precip: ${a.precipDelta > 0 ? '+' : ''}${a.precipDelta.toFixed(0)}mm` : '';
          lines.push(`  • ${a.zone ?? a.region ?? 'Unknown'}: ${temp}${prec}`);
        });
        sections.push(lines.join('\n'));
        included.push('climate anomalies');
      }
    }
  }

  // 12. EARTHQUAKES (M4.5+)
  if (earthquakeResult.status === 'fulfilled') {
    const quakes = earthquakeResult.value.filter(q => q.magnitude >= 4.5).sort((a, b) => b.magnitude - a.magnitude).slice(0, 4);
    if (quakes.length > 0) {
      const lines = ['### SIGNIFICANT SEISMIC EVENTS (M4.5+)'];
      quakes.forEach(q => lines.push(`  • M${q.magnitude.toFixed(1)} — ${q.place}`));
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
        lines.push(`  • "${m.title}": YES ${m.yesPrice.toFixed(0)}%${m.volume ? ` ($${(m.volume/1000).toFixed(0)}k vol)` : ''}`);
      });
      sections.push(lines.join('\n'));
      included.push('prediction markets');
    }
  }

  // 14. TELEGRAM OSINT
  if (telegramResult.status === 'fulfilled' && telegramResult.value?.enabled && telegramResult.value?.items?.length > 0) {
    const tg = telegramResult.value;
    const lines = ['### TELEGRAM OSINT CHANNELS'];
    lines.push(`${tg.count} signals${tg.earlySignal ? ' ⚡ EARLY SIGNAL' : ''}`);
    tg.items.slice(0, 4).forEach((item: any) => {
      lines.push(`  • [${item.channel ?? 'channel'}] ${(item.text ?? item.title ?? '').slice(0, 100)}`);
    });
    sections.push(lines.join('\n'));
    included.push('Telegram OSINT');
  }

  // 15. SECURITY ADVISORIES
  if (advisoriesResult.status === 'fulfilled') {
    const doNotTravel = advisoriesResult.value.advisories.filter(a => a.level === 'do-not-travel').slice(0, 5);
    if (doNotTravel.length > 0) {
      const lines = ['### TRAVEL ADVISORIES — DO NOT TRAVEL'];
      doNotTravel.forEach(a => lines.push(`  • ${a.sourceCountry} warns: ${a.title.slice(0, 80)}`));
      sections.push(lines.join('\n'));
      included.push('security advisories');
    }
  }

  // 16. SUPPLY CHAIN
  {
    const scLines = ['### SUPPLY CHAIN & CHOKEPOINTS'];
    let hasData = false;
    if (chokepointResult.status === 'fulfilled' && chokepointResult.value?.chokepoints?.length > 0) {
      scLines.push('Chokepoints:');
      chokepointResult.value.chokepoints.forEach(cp => {
        const risk = (cp as any).riskLevel ?? 'unknown';
        const transits = (cp as any).dailyTransits ?? '?';
        scLines.push(`  • ${cp.name}: risk=${risk}, transits/day≈${transits}`);
      });
      hasData = true;
    }
    if (shippingResult.status === 'fulfilled' && shippingResult.value?.indices?.length > 0) {
      scLines.push('Shipping indices:');
      shippingResult.value.indices.slice(0, 4).forEach(idx => {
        const chg = (idx as any).changePercent ?? 0;
        scLines.push(`  • ${idx.name}: ${(idx as any).value ?? '?'} ${chg > 0 ? '↑' : '↓'}${Math.abs(chg).toFixed(1)}%`);
      });
      hasData = true;
    }
    if (mineralsResult.status === 'fulfilled') {
      const critical = mineralsResult.value.minerals.filter((m: any) => (m.supplyRisk ?? 0) > 60).slice(0, 3);
      if (critical.length > 0) {
        scLines.push('High-risk critical minerals:');
        critical.forEach((m: any) => scLines.push(`  • ${m.name}: risk=${m.supplyRisk}/100, top producer: ${m.topProducer ?? 'N/A'}`));
        hasData = true;
      }
    }
    if (hasData) { sections.push(scLines.join('\n')); included.push('supply chain'); }
  }

  // 17. TRADE RESTRICTIONS
  if (tradeResult.status === 'fulfilled' && tradeResult.value?.restrictions?.length > 0) {
    const active = tradeResult.value.restrictions.filter((r: any) => !r.status || r.status === 'active').slice(0, 5);
    if (active.length > 0) {
      const lines = ['### ACTIVE TRADE RESTRICTIONS'];
      active.forEach((r: any) => {
        lines.push(`  • ${r.imposingCountry ?? '?'} → ${r.targetCountry ?? '?'}: ${r.measureType ?? 'restriction'} on ${r.sector ?? r.product ?? 'goods'}`);
      });
      sections.push(lines.join('\n'));
      included.push('trade restrictions');
    }
  }

  // 18. MACRO
  if (zone === 'all' || zone === 'macro' || zone === 'equities') {
    if (fredResult.status === 'fulfilled' && fredResult.value?.length > 0) {
      const lines = ['### MACRO INDICATORS (FRED)'];
      fredResult.value.slice(0, 10).forEach(s => {
        const val = s.value != null ? `${Number(s.value).toFixed(2)}${s.unit ? ' ' + s.unit : ''}` : 'N/A';
        const chg = s.change != null ? ` (${s.change > 0 ? '+' : ''}${Number(s.change).toFixed(2)})` : '';
        lines.push(`  • ${s.name}: ${val}${chg}`);
      });
      sections.push(lines.join('\n'));
      included.push('FRED macro');
    }
    if (oilResult.status === 'fulfilled' && oilResult.value) {
      const oil = oilResult.value;
      const metrics = [oil.wtiPrice, oil.brentPrice, oil.usProduction, oil.usInventory].filter(Boolean) as NonNullable<typeof oil.wtiPrice>[];
      if (metrics.length > 0) {
        const lines = ['### ENERGY & OIL (EIA)'];
        metrics.forEach(m => {
          const dir = m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→';
          lines.push(`  • ${m.name}: ${m.current.toFixed(2)} ${m.unit} ${dir} ${m.changePct > 0 ? '+' : ''}${m.changePct.toFixed(1)}%`);
        });
        sections.push(lines.join('\n'));
        included.push('EIA oil');
      }
    }
  }

  // 19. CRYPTO
  if (zone === 'all' || zone === 'crypto') {
    if (cryptoResult.status === 'fulfilled' && cryptoResult.value?.length > 0) {
      const lines = ['### CRYPTO MARKETS'];
      cryptoResult.value.slice(0, 12).forEach(c => {
        const price = c.price != null ? `$${c.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}` : 'N/A';
        const chg = c.change != null ? ` (${c.change > 0 ? '+' : ''}${c.change.toFixed(2)}% 24h)` : '';
        lines.push(`  • ${c.name} (${c.symbol}): ${price}${chg}`);
      });
      sections.push(lines.join('\n'));
      included.push('crypto');
    }
  }

  // 20. EQUITIES
  if (zone === 'all' || zone === 'equities') {
    if (equityResult.status === 'fulfilled' && equityResult.value?.data?.length > 0) {
      const lines = ['### EQUITIES & INDICES'];
      equityResult.value.data.forEach(eq => {
        const price = eq.price != null ? `$${eq.price.toFixed(2)}` : 'N/A';
        const chg = eq.change != null ? ` (${eq.change > 0 ? '+' : ''}${eq.change.toFixed(2)}%)` : '';
        lines.push(`  • ${eq.display ?? eq.symbol}: ${price}${chg}`);
      });
      sections.push(lines.join('\n'));
      included.push(`equities (${equityResult.value.data.length})`);
    }
  }

  // Analysis instructions
  sections.push(buildZoneInstructions(zone));

  return {
    text: sections.join('\n\n'),
    summary: `${included.length} sources: ${included.join(', ')}`,
    sourceCount: included.length,
  };
}

function buildZoneInstructions(zone: OracleZone): string {
  const base = '### ANALYSIS REQUEST';
  switch (zone) {
    case 'crypto':
      return `${base}\nFocus: Crypto markets. Provide: (1) Macro/geopolitical drivers affecting crypto right now, (2) Top 3 signals — BUY/WATCH/AVOID with price targets and reasoning, (3) Anomalies in current price action vs signals.`;
    case 'equities':
      return `${base}\nFocus: Equity markets. Provide: (1) Risk-on/risk-off regime, (2) Sector rotation signals, (3) 2-3 specific opportunities with reasoning, (4) Geopolitical events that will move equities in 2-4 weeks.`;
    case 'macro':
      return `${base}\nFocus: Macroeconomics. Provide: (1) Current cycle phase, (2) Fed trajectory, (3) Dollar implications, (4) Recession probability, (5) Most mispriced macro factor.`;
    case 'commodities':
      return `${base}\nFocus: Commodities. Provide: (1) Oil price trajectory given chokepoints and conflicts, (2) Commodities at risk from climate anomalies, (3) Critical minerals supply risk, (4) One specific commodity trade with entry rationale.`;
    case 'supplychain':
      return `${base}\nFocus: Supply chains. Provide: (1) Highest-risk chokepoints right now, (2) Shipping rate trajectory, (3) Vulnerable supply chains given signals, (4) Industries most exposed to disruptions.`;
    case 'geopolitical':
      return `${base}\nFocus: Geopolitical risk. Provide: (1) Top 3 risk zones ranked by financial impact, (2) Most underpriced geopolitical risk, (3) Assets that benefit from each scenario, (4) Connect GPS jamming + AIS + military posture + prediction markets into one thesis.`;
    default:
      return `${base}
Provide a full Oracle analysis:

## 1. MACRO REGIME
What phase are we in? What's driving it?

## 2. HIDDEN SIGNALS
What is the market underpricing? Connect at least 2 data sources from the brief.

## 3. TOP OPPORTUNITIES
Three asymmetric bets: asset name, current level, thesis, timeframe.

## 4. TOP RISKS
Two or three underappreciated tail risks with specific signal references.

## 5. GEOPOLITICAL ALPHA
One specific development — using military posture, CII, AIS, GPS jamming, Telegram, or prediction markets — with direct financial implications most analysts miss.

Be specific. Name assets, prices, regions. Connect the dots.`;
  }
}

async function callOracleAI(
  context: string,
  userQuery: string | null,
  onThinking?: (chunk: string) => void,
): Promise<string> {
  const callCfg = buildOracleCallConfig();
  if (!callCfg) throw new Error('No AI provider configured. Add an API key in Settings → Oracle AI.');

  const userMessage = userQuery ? `${context}\n\n---\n\nUser question: ${userQuery}` : context;

  const response = await fetch(callCfg.endpoint, {
    method: 'POST',
    headers: callCfg.headers,
    body: JSON.stringify(callCfg.bodyBuilder(ORACLE_SYSTEM_PROMPT, userMessage)),
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch { /**/ }
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
      if (i % 8 === 0 || i === words.length - 1) { onThinking(acc); await new Promise(r => setTimeout(r, 0)); }
    }
  }
  return text;
}

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
    if (!force && zone === 'all' && Date.now() - this.lastAutoScanAt < CACHE_TTL_MS) return this.state.lastAnalysis;
    return this.run(zone, null);
  }

  async query(question: string, zone: OracleZone = 'all'): Promise<OracleAnalysis | null> {
    if (!question.trim() || !isOracleProviderReady()) return null;
    return this.run(zone, question.trim());
  }

  abort(): void { this.abortController?.abort(); this.abortController = null; this.setStatus('idle'); }

  restoreFromCache(analysis: OracleAnalysis): void {
    if (this.state.status !== 'idle') return;
    this.setState({ status: 'done', lastAnalysis: analysis, history: [analysis, ...this.state.history].slice(0, HISTORY_MAX) });
  }

  private async run(zone: OracleZone, userQuery: string | null): Promise<OracleAnalysis | null> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const startMs = Date.now();
    const id = `oracle-${startMs}`;
    const cfg = getOracleAIConfig();
    const pending: OracleAnalysis = {
      id, timestamp: new Date(), zone, query: userQuery,
      provider: cfg.activeProvider,
      model: (cfg[cfg.activeProvider as keyof typeof cfg] as any)?.model ?? '',
      thinking: '', result: '', contextSummary: '', durationMs: 0,
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
      this.setState({ status: 'error', lastAnalysis: pending, history: [pending, ...this.state.history].slice(0, HISTORY_MAX) });
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
