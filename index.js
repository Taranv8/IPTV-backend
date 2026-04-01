// server.js
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(require('cors')());

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://tandam:61UMWpsKROnyAvXm@cluster0.cqnwuiv.mongodb.net/?appName=Cluster0';
const DB_NAME   = 'IPTV';
const COLL_NAME = 'channelinfo';

let db;

MongoClient.connect(MONGO_URI)
  .then(client => {
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB');

    db.collection(COLL_NAME).countDocuments().then(count =>
      console.log(`📺 Total documents in ${COLL_NAME}:`, count),
    );
    db.collection(COLL_NAME).findOne().then(doc =>
      console.log('📄 Sample document:', JSON.stringify(doc, null, 2)),
    );
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ─── Field mapping ────────────────────────────────────────────────────────────
//
// The React Native app's Channel type expects:
//   id         string   — unique identifier
//   name       string   — display name
//   number     number   — channel number (used for logging / display)
//   streamUrl  string   — direct or wrapper URL to play
//   logo       string   — logo image URL  (may be empty)
//   group      string   — category / group label
//
// MongoDB stores ObjectId in _id and the channel number in tvgId.
// This mapper produces a clean, flat object the app can use directly.
// ─────────────────────────────────────────────────────────────────────────────
function mapChannel(doc) {
  // Normalise streamUrls array from DB
  const streamUrls = (doc.streamUrls ?? [])
    .filter(s => s?.url)
    .map(s => ({
      url:         s.url,
      source:      s.source      ?? undefined,
      logo:        s.logo        ?? undefined,
      group:       s.group       ?? undefined,
      licenseType: s.licenseType ?? null,
      licenseKey:  s.licenseKey  ?? null,
      userAgent:   s.userAgent   ?? null,
      httpHeaders: s.httpHeaders ?? null,
      addedAt:
        s.addedAt
          ? (s.addedAt.$date ?? s.addedAt)
          : undefined,
    }));

  // Legacy flat field fallback (for older docs that haven't been migrated)
  if (streamUrls.length === 0 && doc.streamUrl) {
    streamUrls.push({ url: doc.streamUrl, source: 'legacy' });
  }

  const active = streamUrls[0] ?? null;

  return {
    id:          doc._id.toString(),
    name:        doc.name        ?? 'Unknown Channel',

    // ✅ Fix #2: try all number fields in priority order
    number:
      doc.channelNo
        ?? doc.epgNo
        ?? (doc.tvgId ? parseInt(doc.tvgId, 10) || 0 : 0),

    streamUrl:   active?.url    ?? '',
    streamUrls,                          // ✅ Fix #1: send the full array

    logo:        doc.logo       ?? active?.logo  ?? '',

    // ✅ Fix #3: try both 'group' and 'genre'
    group:       doc.group      ?? doc.genre     ?? active?.group ?? '',

    language:    doc.language   ?? '',
    country:     doc.country    ?? '',

    // ✅ Fix #4: promote active stream's DRM fields to top-level
    licenseType: active?.licenseType ?? null,
    licenseKey:  active?.licenseKey  ?? null,
    userAgent:   active?.userAgent   ?? null,
    httpHeaders: active?.httpHeaders ?? null,
  };
}

// ─── GET /channels ────────────────────────────────────────────────────────────
//
// Query params:
//   page    number  (default 1)
//   limit   number  (default 50, max 200)
//   group   string  filter by group name (case-insensitive)
//   search  string  filter by channel name (case-insensitive substring)
//
// Response:
//   { total, page, limit, data: Channel[] }
// ─────────────────────────────────────────────────────────────────────────────
app.get('/channels', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip   = (page - 1) * limit;

    // Build optional filter
    const filter = {};
    if (req.query.group) {
      filter.group = { $regex: req.query.group, $options: 'i' };
    }
    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: 'i' };
    }

    const coll = db.collection(COLL_NAME);
    const [total, docs] = await Promise.all([
      coll.countDocuments(filter),
      coll.find(filter).skip(skip).limit(limit).toArray(),
    ]);

    const data = docs.map(mapChannel);

    console.log(`[/channels] page=${page} limit=${limit} returned=${data.length} total=${total}`);
    res.json({ total, page, limit, data });
  } catch (err) {
    console.error('❌ /channels error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /channels/:id ────────────────────────────────────────────────────────
app.get('/channels/:id', async (req, res) => {
  try {
    const doc = await db.collection(COLL_NAME).findOne({
      _id: new ObjectId(req.params.id),
    });
    if (!doc) return res.status(404).json({ error: 'Channel not found' });
    res.json(mapChannel(doc));
  } catch (err) {
    console.error('❌ /channels/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /groups ──────────────────────────────────────────────────────────────
// Returns the distinct list of group names — useful for category filters in the app.
app.get('/groups', async (req, res) => {
  try {
    const groups = await db.collection(COLL_NAME).distinct('group');
    res.json(groups.filter(Boolean).sort());
  } catch (err) {
    console.error('❌ /groups error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('🚀 Server running on port 3000'));