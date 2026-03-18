/**
 * Oracle Persistent Cache
 * ─────────────────────────────────────────────────────────────────────────────
 * Saves completed Oracle analyses to persistent storage so the last result
 * is immediately visible on next app load — before a fresh scan completes.
 *
 * Uses the existing persistent-cache service (Tauri filesystem on desktop,
 * localStorage on web). Completely optional — if cache fails, Oracle still works.
 */

import { getPersistentCache, setPersistentCache } from '@/services/persistent-cache';
import { oracleEngine, type OracleAnalysis } from '@/services/oracle-engine';

const CACHE_KEY = 'oracle:last-analysis:v1';
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours — stale after that

interface CachedAnalysis {
  analysis: OracleAnalysis;
  savedAt: number;
}

// ─── Save on completed analysis ───────────────────────────────────────────────

let saveSetup = false;

export function setupOraclePersistence(): void {
  if (saveSetup) return;
  saveSetup = true;

  oracleEngine.subscribe((state) => {
    if (state.status === 'done' && state.lastAnalysis?.result) {
      void saveAnalysis(state.lastAnalysis);
    }
  });
}

async function saveAnalysis(analysis: OracleAnalysis): Promise<void> {
  try {
    // Don't save query responses — only auto-scans (query = null)
    if (analysis.query !== null) return;

    const payload: CachedAnalysis = {
      analysis: {
        ...analysis,
        // Convert Date to string for serialization
        timestamp: analysis.timestamp,
      },
      savedAt: Date.now(),
    };

    await setPersistentCache(CACHE_KEY, payload);
  } catch {
    // Non-critical — silent fail
  }
}

// ─── Restore on startup ───────────────────────────────────────────────────────

export async function restoreOracleCache(): Promise<OracleAnalysis | null> {
  try {
    const cached = await getPersistentCache<CachedAnalysis>(CACHE_KEY);
    if (!cached?.data) return null;

    const { analysis, savedAt } = cached.data;

    // Too old — discard
    if (Date.now() - savedAt > MAX_AGE_MS) return null;

    // Restore Date object (was serialized as string/number)
    analysis.timestamp = new Date(analysis.timestamp);

    return analysis;
  } catch {
    return null;
  }
}
