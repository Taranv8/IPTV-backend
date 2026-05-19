// routes/streamHealth.js
//
// Stream URL health tracking — two endpoints:
//
//   POST /api/channels/:channelId/stream-report
//     Frontend fires this whenever a URL succeeds, errors, or stalls.
//     Updates per-URL counters and recomputes isDead + score.
//
//   GET  /api/channels/:channelId/stream-health
//     Returns a { [url]: { isDead, score, attempts, successes } } map.
//     VideoPlayer fetches this once per channel load and sorts its URL
//     list so high-score (live) sources are tried first and dead sources
//     are skipped entirely.
//
// Scoring formula (0–100):
//   base  = (successes / attempts) × 80        → up to 80 pts for reliability
//   stall = (stalls    / attempts) × 20        → up to -20 pts for buffering
//   bonus = +15 if last success < 2 h ago      → freshness reward
//           + 5 if last success < 24 h ago
//
// Dead rule:
//   isDead = attempts ≥ MIN_ATTEMPTS && successes === 0
//   MIN_ATTEMPTS = 5  (need a credible sample before condemning a URL)
//
// NOTE: channelId is stored as a plain string (not ObjectId) so the route
//       works whether the caller sends a hex ObjectId string or any other id.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { Router } = require('express');
const crypto     = require('crypto');

const router = Router();

// ─── Config ───────────────────────────────────────────────────────────────────

const COLL         = 'urlStats';
const MIN_ATTEMPTS = 5;   // minimum tries before a URL can be declared dead

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stable 16-char fingerprint for a URL — used as a compound-key component. */
function urlHash(url) {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

/**
 * Compute a 0–100 health score from raw counters.
 * Unknown / brand-new URLs return 50 (neutral, tried before known sources).
 */
function calcScore({ attempts = 0, successes = 0, stalls = 0, lastSuccessAt } = {}) {
  if (attempts === 0) return 50;

  let score = (successes / attempts) * 80;
  score    -= (stalls    / attempts) * 20;

  if (lastSuccessAt) {
    const ageMs = Date.now() - new Date(lastSuccessAt).getTime();
    if      (ageMs < 2  * 3_600_000) score += 15;   // < 2 h
    else if (ageMs < 24 * 3_600_000) score += 5;    // < 24 h
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── POST /api/channels/:channelId/stream-report ──────────────────────────────
//
//  Body (JSON):
//    url            string   — the exact URL that was attempted
//    outcome        string   — "success" | "error" | "stall"
//    stallDurationMs number  — only relevant when outcome = "stall"

router.post('/:channelId/stream-report', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { channelId } = req.params;
    const { url, outcome, stallDurationMs = 0 } = req.body ?? {};

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: '`url` (string) is required' });
    }
    if (!['success', 'error', 'stall'].includes(outcome)) {
      return res.status(400).json({ error: '`outcome` must be "success", "error", or "stall"' });
    }

    const hash = urlHash(url);
    const now  = new Date();

    // ── Build $inc fields ─────────────────────────────────────────────────────
    const inc = { attempts: 1 };
    if (outcome === 'success') {
      inc.successes = 1;
    } else if (outcome === 'error') {
      inc.errors = 1;
    } else {
      // stall
      inc.stalls      = 1;
      inc.totalStallMs = Number(stallDurationMs) || 0;
    }

    // ── Build $set fields ─────────────────────────────────────────────────────
    const set = { lastAttemptAt: now };
    if (outcome === 'success') set.lastSuccessAt = now;

    // ── Upsert the stats document ─────────────────────────────────────────────
    await db.collection(COLL).updateOne(
      { channelId, urlHash: hash },
      {
        $inc:         inc,
        $set:         set,
        $setOnInsert: { url, channelId, urlHash: hash, createdAt: now },
      },
      { upsert: true },
    );

    // ── Re-read to get fresh totals, then recompute isDead + score ────────────
    const doc = await db.collection(COLL).findOne({ channelId, urlHash: hash });

    const isDead = (doc.attempts ?? 0) >= MIN_ATTEMPTS && (doc.successes ?? 0) === 0;
    const score  = calcScore(doc);

    await db.collection(COLL).updateOne(
      { channelId, urlHash: hash },
      { $set: { isDead, score } },
    );

    console.log(
      `[streamHealth] ch=${channelId} outcome=${outcome} isDead=${isDead} score=${score} ` +
      `attempts=${doc.attempts} successes=${doc.successes ?? 0} url=${url.slice(0, 80)}…`,
    );

    return res.json({ ok: true, isDead, score });

  } catch (e) {
    console.error('[streamHealth] POST /stream-report error:', e);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// ─── GET /api/channels/:channelId/stream-health ───────────────────────────────
//
//  Returns:
//    {
//      "https://...": { isDead: false, score: 87, attempts: 23, successes: 20 },
//      "https://...": { isDead: true,  score:  0, attempts: 7,  successes:  0 },
//      ...
//    }

router.get('/:channelId/stream-health', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { channelId } = req.params;

    const docs = await db.collection(COLL)
      .find({ channelId }, { projection: { url: 1, isDead: 1, score: 1, attempts: 1, successes: 1 } })
      .toArray();

    const map = {};
    for (const d of docs) {
      map[d.url] = {
        isDead:    d.isDead    ?? false,
        score:     d.score     ?? 50,
        attempts:  d.attempts  ?? 0,
        successes: d.successes ?? 0,
      };
    }

    return res.json(map);

  } catch (e) {
    console.error('[streamHealth] GET /stream-health error:', e);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// ─── Ensure index exists (call once at server startup) ────────────────────────

async function ensureIndexes(db) {
  await db.collection(COLL).createIndex(
    { channelId: 1, urlHash: 1 },
    { unique: true, name: 'channelId_urlHash_unique' },
  );
  console.log('[streamHealth] Index on urlStats ready');
}

module.exports = { router, ensureIndexes };