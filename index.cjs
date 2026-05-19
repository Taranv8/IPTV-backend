// server.js
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();
const { router: streamHealthRouter, ensureIndexes } = require('./routes/streamHealth');

const { CHANNEL_REFERENCE } = require('./channelData');

const app = express();
app.use(require('cors')());

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME   = 'IPTV';
const COLL_NAME = 'channelinfo';
const EPG_COLL  = 'epgdata';          // ← NEW: EPG collection

let db;

 
// 2. Add JSON body-parser if not already present (add once, near app setup):
app.use(express.json());
 
// 3. Inside your MongoClient.connect() callback, after  db = client.db(DB_NAME):
MongoClient.connect(MONGO_URI)
  .then(async function(client) {          // ← async + function keyword (not arrow)
    db = client.db(DB_NAME);
    app.locals.db = db;
    await ensureIndexes(db);
    app.use('/api/channels', streamHealthRouter);

    console.log('✅ Connected to MongoDB');

    db.collection(COLL_NAME).countDocuments().then(function(n) {
      console.log('📺 Total documents in ' + COLL_NAME + ':', n);
    });
    db.collection(COLL_NAME).countDocuments(WHITELIST_FILTER).then(function(n) {
      console.log('✅ Whitelisted documents available:', n);
    });
    db.collection(EPG_COLL).countDocuments().then(function(n) {
      console.log('📅 EPG records cached:', n);
    });

    app.listen(3000, function() {
      console.log('🚀 Server running on port 3000');
    });
  })
  .catch(function(err) {
    console.error('❌ MongoDB connection error:', err);
  });
// ─── Explicit name overrides ──────────────────────────────────────────────────
const NAME_OVERRIDES = {
  // ── Hindi Entertainment ────────────────────────────────────────────────────
  'Sony Entertainment Television': [
    'Sony Entertainment Television',
    'Sony Entertainment TV',
    'Sony Ent TV',
    'SET India',
    'SET',
    'Sony TV',
  ],
  'Bindass':            ['Bindass', 'Bindaas', 'Bindass TV', 'Bindaas TV'],
  'Big Magic':          ['Big Magic', 'Big Magic TV', 'Rishtey'],
  'Anjan TV':           ['Anjan TV', 'Angan TV'],
  'Ishara':             ['Ishara', 'Ishara TV'],
  'Shemaroo UMANG':     ['Shemaroo UMANG', 'Shemaroo Umang', 'UMANG TV'],
  'NAZARA':             ['NAZARA', 'Nazara TV', 'Nazara'],
  'Sun Neo':            ['Sun Neo', 'SUN NEO'],
  'Manoranjan Grand':   ['Manoranjan Grand', 'MANORANJAN GRAND'],
  'Manoranjan Prime':   ['Manoranjan Prime', 'MANORANJAN PRIME', 'Manoranjan Movies'],

  // ── English Entertainment ──────────────────────────────────────────────────
  'Disney International': [
    'Disney International',
    'Disney International HD',
    'Star Disney International',
  ],

  // ── Hindi Movies ───────────────────────────────────────────────────────────
  'Zee Bollywood':             ['Zee Bollywood', 'ZEE BOLLWOOD', 'Zee Bollwood'],
  '&Xplor':                    ['&Xplor', '& Xplor', 'And Xplor', 'Xplor'],
  'Action Cinema':             ['Action Cinema', 'ACTION CINEMA'],
  'BFLIX':                     ['BFLIX', 'B Flix', 'BFlix', 'B4U Flix'],
  'Star Utsav Movies':         ['Star Utsav Movies', 'STAR UTSAV MOVIES'],
  'Colors Cineplex Superhits': ['Colors Cineplex Superhits', 'COLORS CINEPLEX SUPERHITS'],
  'All Time Movies':           ['All Time Movies', 'ALL TIME MOVIES', 'Alltime Movies'],
  'Zee Anmol Cinema 2':        ['Zee Anmol Cinema 2', 'ZEE ANMOL CINEMA 2'],
  'Chumbak TV':                ['Chumbak TV', 'CHUMBAK TV'],
  'Wow Cinema One':            ['Wow Cinema One', 'WOW CINEMA ONE', 'WOW CINEMA 1'],
  'Colors Cineplex Bollywood': ['Colors Cineplex Bollywood', 'COLORS CINEPLEX BOLLYWOOD'],
  'Zee Anmol Cinema':          ['Zee Anmol Cinema', 'ZEE ANMOL CINEMA'],

  // ── Sports ─────────────────────────────────────────────────────────────────
  'Sony Sports Ten 1': ['Sony Sports Ten 1', 'Sony Ten 1', 'Sony Sports 1', 'Ten Sports 1', 'Ten 1'],
  'Sony Sports Ten 2': ['Sony Sports Ten 2', 'Sony Ten 2', 'Sony Sports 2', 'Ten Sports 2', 'Ten 2'],
  'Sony Sports Ten 3': ['Sony Sports Ten 3', 'Sony Ten 3', 'Sony Sports 3', 'Ten Sports 3', 'Ten 3'],
  'Sony Sports Ten 4': ['Sony Sports Ten 4', 'Sony Ten 4', 'Sony Sports 4', 'Ten Sports 4', 'Ten 4'],
  'Sony Sports Ten 5': ['Sony Sports Ten 5', 'Sony Ten 5', 'Sony Sports 5', 'Ten Sports 5', 'Ten 5'],
  'Sports 18 1':       ['Sports 18 1', 'Sports18 1', 'Sports18-1', 'Sports 18-1', 'Sports18 HD'],
  'Sports 18 2':       ['Sports 18 2', 'Sports18 2', 'Sports18-2', 'Sports 18-2'],
  'Sports 18 3':       ['Sports 18 3', 'Sports18 3', 'Sports18-3', 'Sports 18-3'],
  'Star Sports First': ['Star Sports First', 'Star Sports First HD', 'SS First'],
  'Eurosport':         ['Eurosport', 'Euro Sport', 'Eurosport HD'],

  // ── Hindi News ─────────────────────────────────────────────────────────────
  'Zee Bharat':           ['Zee Bharat', 'ZEE BHARAT', 'Zee Bharat News'],
  'R Bharat':             ['R Bharat', 'R. Bharat', 'RBharat'],
  'India TV Speed News':  ['India TV Speed News', 'INDIA TV SPEED NEWS', 'India TV HD'],
  'India Daily 24x7':     ['India Daily 24x7', 'India Daily', 'INDIA DAILY 24X7'],
  'Live Times':           ['Live Times', 'LIVE TIMES', 'Live Times TV'],
  'TV 100':               ['TV 100', 'TV100', 'TV-100'],
  'Jantantra':            ['Jantantra', 'JANTANTRA', 'Jan Tantra'],
  'Swadesh News':         ['Swadesh News', 'SWADESH NEWS', 'Swadesh'],
  'Sansad TV 1':          ['Sansad TV 1', 'Sansad TV1', 'SANSAD TV 1', 'Sansad TV'],
  'Sansad TV 2':          ['Sansad TV 2', 'Sansad TV2', 'SANSAD TV 2'],
  'CNBC TV18 Prime':      ['CNBC TV18 Prime', 'CNBC TV18', 'CNBC-TV18 Prime', 'CNBCTV18 Prime'],
  'Bloomberg Television': ['Bloomberg Television', 'Bloomberg TV', 'Bloomberg'],
  'Good News Today':      ['Good News Today', 'GOOD NEWS TODAY', 'GNT'],

  // ── English News ───────────────────────────────────────────────────────────
  'TV5 Monde Asie':    ['TV5 Monde Asie', 'TV5 Monde', 'TV5Monde', 'TV5 MONDE ASIE'],
  'DW':                ['DW', 'DW News', 'Deutsche Welle', 'DW TV', 'DW English'],
  'ABC Australia':     ['ABC Australia', 'ABC News Australia', 'ABC AUSTRALIA', 'ABC AU'],
  'Russia Today':      ['Russia Today', 'RT', 'RT News', 'RUSSIA TODAY'],
  'NHK WORLD-JAPAN':   ['NHK WORLD-JAPAN', 'NHK World Japan', 'NHK World', 'NHK WORLD', 'NHK WORLD FHD'],
  'CNBC TV18':         ['CNBC TV18', 'CNBC-TV18', 'CNBCTV18'],

  // ── Kids ───────────────────────────────────────────────────────────────────
  'Hungama TV':    ['Hungama TV', 'HUNGAMA TV', 'Hungama'],
  'ETV Bal Bharat':['ETV Bal Bharat', 'ETV BAL BHARAT', 'Bal Bharat'],
  'Chintu TV':     ['Chintu TV', 'CHINTU TV'],
  'Unique TV':     ['Unique TV', 'UNIQUE TV'],
  'Nick Jr':       ['Nick Jr', 'Nick Jr.', 'NickJr', 'Nick Junior'],
  'CBeeBies':      ['CBeeBies', 'CBeebies', 'CBEEBIES', 'CBeebie'],

  // ── Knowledge & Lifestyle ──────────────────────────────────────────────────
  'National Geographic': [
    'National Geographic',
    'Nat Geo',
    'NatGeo',
    'National Geographic HD',
    'NGC',
  ],
  'DD Gyan Darshan': ['DD Gyan Darshan', 'DD GYAN DARSHAN', 'Gyan Darshan'],
  'Zee Zest':        ['Zee Zest', 'ZEE ZEST', 'Zee Living'],
  'Food Food':       ['Food Food', 'FOOD FOOD', 'Food Food TV'],
  'Fashion TV':      ['Fashion TV', 'FASHION TV', 'FTV'],
  'Epic':            ['Epic', 'Epic TV', 'Epic Channel', 'EPIC'],

  // ── Music ──────────────────────────────────────────────────────────────────
  'MTV Beats':  ['MTV Beats', 'MTV BEATS', 'MTV Beats HD'],
  'Mastiii':    ['Mastiii', 'Masti', 'Mastii', 'MASTIII'],
  'Raj Pariwar':['Raj Pariwar', 'RAJ PARIWAR', 'Raj Parivar'],
  'Zoom':       ['Zoom', 'Zoom TV', 'ZOOM'],
  'Zing':       ['Zing', 'Zing TV', 'ZING'],
  'Showbox':    ['Showbox', 'Show Box', 'SHOWBOX'],

  // ── Spiritual ──────────────────────────────────────────────────────────────
  'Sadhna TV':    ['Sadhna TV', 'SADHNA TV', 'Sadhana TV', 'Sadhana'],
  'Sharnam TV':   ['Sharnam TV', 'SHARNAM TV', 'Sharan TV'],
  'Jinvani Channel':['Jinvani Channel', 'Jinvani', 'JINVANI CHANNEL'],
  'Dharm Sandesh':['Dharm Sandesh', 'DHARMA SANDESH', 'Dharma Sandesh'],
  'Vedic':        ['Vedic', 'VEDIC', 'Vedic TV', 'VEDIC TV'],
  'Subharti TV':  ['Subharti TV', 'SUBHARTI TV'],
  'Divya':        ['Divya', 'DIVYA', 'Divya TV', 'DIVYA TV'],
  'Awakening':    ['Awakening', 'AWAKENING', 'Awakening TV'],
  'Santwani':     ['Santwani', 'SANTWANI', 'Santvani', 'Sant Vani TV'],
  'Studio One +': ['Studio One +', 'Studio One Plus', 'STUDIO ONEP', 'Studio 1+'],
  'Hare Krsna':   ['Hare Krsna', 'Hare Krishna', 'HARE KRSNA', 'HARE KRISHNA', 'Hare Krsna TV'],

  // ── Hindi Regional ─────────────────────────────────────────────────────────
  'MH One Dil Se':    ['MH One Dil Se', 'MH ONE DIL SE'],
  'Oscar Movies Bhojpuri': ['Oscar Movies Bhojpuri', 'OSCAR MOVIES BHOJPURI', 'Oscar Bhojpuri'],
  'Raapchik':         ['Raapchik', 'RAAPCHIK', 'Raapchik TV'],
  'HNN News':         ['HNN News', 'HNN', 'HNN24x7', 'HNN 24x7'],
  'Naxatra News':     ['Naxatra News', 'NAXATRA NEWS', 'Naxatra'],
  'DD Uttarakhand':   ['DD Uttarakhand', 'DD UTTARAKHAND'],
  'DD Jharkhand':     ['DD Jharkhand', 'DD JHARKHAND'],
  'DD Uttar Pradesh': ['DD Uttar Pradesh', 'DD UP', 'DD UTTAR PRADESH'],
  'Zee Madhya Pradesh Chattisgarh': [
    'Zee Madhya Pradesh Chattisgarh',
    'Zee MP Chattisgarh',
    'Zee Madhya Pradesh Chhattisgarh',
    'Zee MP CG',
    'N-NEWS | TS ZEE NEWS MP/CHATTISGARH',
  ],
  'Channel Win': ['Channel Win', 'CHANNEL WIN', 'Win TV'],
};

// ─── Helper functions ─────────────────────────────────────────────────────────
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildWhitelistFilter(referenceList, overrides) {
  const refNames       = [...new Set(referenceList.map(c => c.name))];
  const overrideDbNames = Object.values(overrides).flat();
  const allNames        = [...new Set([...refNames, ...overrideDbNames])];
  const pattern         = `^(${allNames.map(escapeRegex).join('|')})$`;
  return { name: { $regex: pattern, $options: 'i' } };
}

const WHITELIST_FILTER = buildWhitelistFilter(CHANNEL_REFERENCE, NAME_OVERRIDES);
const uniqueCount = [...new Set(CHANNEL_REFERENCE.map(c => c.name))].length;
console.log(`📋 Whitelist built: ${uniqueCount} ref names + ${Object.keys(NAME_OVERRIDES).length} override entries`);

function buildFilter(userFilter = {}) {
  const userClauses = Object.keys(userFilter).length ? [userFilter] : [];
  return { $and: [WHITELIST_FILTER, ...userClauses] };
}

// ─── Connect ──────────────────────────────────────────────────────────────────
MongoClient.connect(MONGO_URI)
  .then(client => {
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB');
    db.collection(COLL_NAME).countDocuments().then(n =>
      console.log(`📺 Total documents in ${COLL_NAME}:`, n));
    db.collection(COLL_NAME).countDocuments(WHITELIST_FILTER).then(n =>
      console.log(`✅ Whitelisted documents available:`, n));
    db.collection(EPG_COLL).countDocuments().then(n =>
      console.log(`📅 EPG records cached:`, n));
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ─── Field mapping ────────────────────────────────────────────────────────────
function mapChannel(doc) {
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
      addedAt:     s.addedAt ? (s.addedAt.$date ?? s.addedAt) : undefined,
    }));

  if (streamUrls.length === 0 && doc.streamUrl) {
    streamUrls.push({ url: doc.streamUrl, source: 'legacy' });
  }

  const active = streamUrls[0] ?? null;

  return {
    id:          doc._id.toString(),
    name:        doc.name        ?? 'Unknown Channel',
    number:
      doc.channelNo
        ?? doc.epgNo
        ?? (doc.tvgId ? parseInt(doc.tvgId, 10) || 0 : 0),
    streamUrl:   active?.url    ?? '',
    streamUrls,
    logo:        doc.logo       ?? active?.logo  ?? '',
    group:       doc.group      ?? doc.genre     ?? active?.group ?? '',
    language:    doc.language   ?? '',
    excelGenre:  doc.excelGenre ?? '', 
    country:     doc.country    ?? '',
    licenseType: active?.licenseType ?? null,
    licenseKey:  active?.licenseKey  ?? null,
    userAgent:   active?.userAgent   ?? null,
    httpHeaders: active?.httpHeaders ?? null,
  };
}

// ─── NEW: EPG field mapping ───────────────────────────────────────────────────
function mapEPG(doc) {
  if (!doc) return null;
  return {
    channelId:    doc.channelId,
    channelName:  doc.channelName,
    epgChannelId: doc.epgChannelId,
    current:      doc.current  ?? null,
    upcoming:     doc.upcoming ?? [],
    updatedAt:    doc.updatedAt,
    isStale:      doc.updatedAt
      ? (Date.now() - new Date(doc.updatedAt).getTime()) > 2 * 60 * 60 * 1000   // warn if >2h old
      : true,
  };
}

// ─── GET /channels ────────────────────────────────────────────────────────────
app.get('/channels', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip  = (page - 1) * limit;

    const userFilter = {};
    if (req.query.group) {
      userFilter.$or = [
        { group: { $regex: req.query.group, $options: 'i' } },
        { genre: { $regex: req.query.group, $options: 'i' } },
      ];
    }
    if (req.query.search) {
      userFilter.name = { $regex: req.query.search, $options: 'i' };
    }

    const filter = buildFilter(userFilter);
    const coll   = db.collection(COLL_NAME);
    const [total, docs] = await Promise.all([
      coll.countDocuments(filter),
      coll.find(filter).skip(skip).limit(limit).toArray(),
    ]);

    // ── Optionally embed EPG when ?epg=true ───────────────────────────────
    let epgMap = {};
    if (req.query.epg === 'true' && docs.length) {
      const ids     = docs.map(d => d._id.toString());
      const epgDocs = await db.collection(EPG_COLL)
        .find({ channelId: { $in: ids } })
        .toArray();
      for (const e of epgDocs) epgMap[e.channelId] = mapEPG(e);
    }

    const data = docs.map(doc => {
      const ch = mapChannel(doc);
      if (req.query.epg === 'true') {
        ch.epg = epgMap[ch.id] ?? null;
      }
      return ch;
    });

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
    const filter = buildFilter({ _id: new ObjectId(req.params.id) });
    const doc    = await db.collection(COLL_NAME).findOne(filter);
    if (!doc) return res.status(404).json({ error: 'Channel not found' });
    res.json(mapChannel(doc));
  } catch (err) {
    console.error('❌ /channels/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /groups ──────────────────────────────────────────────────────────────
app.get('/groups', async (req, res) => {
  try {
    const coll = db.collection(COLL_NAME);
    const [byGenre, byGroup] = await Promise.all([
      coll.distinct('genre', WHITELIST_FILTER),
      coll.distinct('group', WHITELIST_FILTER),
    ]);
    const groups = [...new Set([...byGenre, ...byGroup])].filter(Boolean).sort();
    res.json(groups);
  } catch (err) {
    console.error('❌ /groups error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  EPG ROUTES  (new)
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /epg/:channelId
 * Returns EPG (current + upcoming) for a single channel by its DB _id.
 *
 * Example:  GET /epg/69d955b233bbc2bff8ed6d59
 */
app.get('/epg/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;

    // Validate that the channel exists and is whitelisted
    let channelDoc;
    try {
      const filter = buildFilter({ _id: new ObjectId(channelId) });
      channelDoc   = await db.collection(COLL_NAME).findOne(filter, { projection: { name: 1 } });
    } catch {
      return res.status(400).json({ error: 'Invalid channelId format' });
    }

    if (!channelDoc) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const epgDoc = await db.collection(EPG_COLL).findOne({ channelId });

    if (!epgDoc) {
      return res.status(404).json({
        error:       'EPG data not available for this channel',
        channelId,
        channelName: channelDoc.name,
      });
    }

    res.json(mapEPG(epgDoc));
  } catch (err) {
    console.error('❌ /epg/:channelId error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /epg
 * Bulk EPG retrieval.
 *
 * Query params:
 *   ids      — comma-separated list of channel DB _ids  (max 100)
 *              e.g. ?ids=abc123,def456,ghi789
 *
 * If no ?ids provided, returns EPG for ALL whitelisted channels (paginated).
 *   page     — page number (default 1)
 *   limit    — results per page (default 50, max 200)
 *
 * Example:
 *   GET /epg?ids=69d955b233bbc2bff8ed6d59,69d955b233bbc2bff8ed6d60
 *   GET /epg?page=1&limit=100
 */
app.get('/epg', async (req, res) => {
  try {
    // ── Mode 1: specific ids ───────────────────────────────────────────────
    if (req.query.ids) {
      const ids = req.query.ids
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 100);

      if (!ids.length) {
        return res.status(400).json({ error: 'No valid ids provided' });
      }

      const epgDocs = await db.collection(EPG_COLL)
        .find({ channelId: { $in: ids } })
        .toArray();

      // Preserve requested order; fill missing slots with null
      const epgMap = {};
      for (const doc of epgDocs) epgMap[doc.channelId] = mapEPG(doc);

      const data = ids.map(id => epgMap[id] ?? { channelId: id, current: null, upcoming: [], available: false });
      return res.json({ count: data.length, data });
    }

    // ── Mode 2: paginated full list (whitelisted channels only) ───────────
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip  = (page - 1) * limit;

    // Get whitelisted channel IDs first
    const whitelistDocs = await db.collection(COLL_NAME)
      .find(WHITELIST_FILTER, { projection: { _id: 1 } })
      .toArray();
    const whitelistedIds = whitelistDocs.map(d => d._id.toString());

    const [total, epgDocs] = await Promise.all([
      db.collection(EPG_COLL).countDocuments({ channelId: { $in: whitelistedIds } }),
      db.collection(EPG_COLL)
        .find({ channelId: { $in: whitelistedIds } })
        .sort({ channelName: 1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
    ]);

    const data = epgDocs.map(mapEPG);
    console.log(`[/epg] page=${page} limit=${limit} returned=${data.length} total=${total}`);
    res.json({ total, page, limit, data });
  } catch (err) {
    console.error('❌ /epg error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /epg/status
 * Returns EPG sync health — how many channels have data, when last updated.
 */
app.get('/epg/status', async (req, res) => {
  try {
    const [total, withEPG, latestDoc] = await Promise.all([
      db.collection(COLL_NAME).countDocuments(WHITELIST_FILTER),
      db.collection(EPG_COLL).countDocuments(),
      db.collection(EPG_COLL).findOne({}, { sort: { updatedAt: -1 }, projection: { updatedAt: 1 } }),
    ]);

    const lastSync = latestDoc?.updatedAt ?? null;
    const ageMs    = lastSync ? Date.now() - new Date(lastSync).getTime() : null;

    res.json({
      whitelistedChannels: total,
      channelsWithEPG:     withEPG,
      coveragePercent:     total ? Math.round((withEPG / total) * 100) : 0,
      lastSync,
      ageMinutes:          ageMs !== null ? Math.round(ageMs / 60_000) : null,
      isStale:             ageMs !== null ? ageMs > 2 * 60 * 60 * 1000 : true,
    });
  } catch (err) {
    console.error('❌ /epg/status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

app.listen(3000, () => console.log('🚀 Server running on port 3000'));