'use strict';

/**
 * epgCron.js — JioTV EPG Sync
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches the XMLTV EPG feed (gzipped) every hour, matches each channel to a
 * MongoDB document in `channelinfo`, and upserts current + next 5 shows into
 * the `epgdata` collection.
 *
 * Unmatched EPG channels are appended to  logs/unmatched_epg_channels.txt
 *
 * Run:  node epgCron.js
 * Deps: npm install node-cron axios fast-xml-parser
 * ─────────────────────────────────────────────────────────────────────────────
 */

const cron            = require('node-cron');
const axios           = require('axios');
const zlib            = require('zlib');
const { XMLParser }   = require('fast-xml-parser');
const { MongoClient } = require('mongodb');
const fs              = require('fs');
const path            = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────
const MONGO_URI     = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME       = 'IPTV';
const CHANNEL_COLL  = 'channelinfo';
const EPG_COLL      = 'epgdata';
const EPG_URL       = 'https://github.com/arnab8820/JioTV-epg/raw/main/epg1d.xml.gz';
const LOGS_DIR      = path.join(__dirname, 'logs');
const UNMATCHED_LOG = path.join(LOGS_DIR, 'unmatched_epg_channels.txt');
const MAX_UPCOMING  = 5;   // shows stored after the current one

// ─── EPG name → DB name overrides ────────────────────────────────────────────
// The EPG XML uses its own display names. If a name differs from what your
// DB stores, map it here.  Key = normalised EPG name, Value = exact DB name.
// New mismatches are written to logs/unmatched_epg_channels.txt — use that
// file to discover what to add here.
const EPG_TO_DB = {
  'set hd':                        'SET HD',
  'sony sab':                      'Sony SAB',
  'sony sab hd':                   'Sony SAB HD',
  'sony max sd':                   'Sony Max SD',
  'sony max hd':                   'Sony Max HD',
  'sony max2':                     'Sony MAX2',
  'sony pal':                      'Sony Pal',
  'sony aath':                     'Sony aath',
  'sonic hindi':                   'Sonic Hindi',
  'sonic tamil':                   'sonic Tamil',
  'colors hd':                     'Colors HD',
  'colors sd':                     'Colors SD',
  'colors cineplex':               'Colors Cineplex',
  'colors cineplex hd':            'Colors Cineplex HD',
  'colors cineplex bollywood':     'Colors Cineplex Bollywood',
  'colors cineplex superhit':      'Colors Cineplex Superhit',
  'colors kannada hd':             'Colors Kannada HD',
  'colors kannada sd':             'Colors Kannada SD',
  'colors kannada cinema':         'Colors Kannada Cinema',
  'colors marathi hd':             'Colors Marathi HD',
  'colors marathi sd':             'Colors Marathi SD',
  'colors bangla hd':              'Colors Bengali HD',
  'colors bangla sd':              'Colors Bangla SD',
  'colors bangla cinema':          'Colors Bangla Cinema',
  'colors gujarati':               'Colors Gujarati',
  'colors gujarati cinema':        'Colors Gujarati Cinema',
  'colors infinity hd':            'Colors Infinity HD',
  'colors infinity sd':            'Colors Infinity SD',
  'colors super':                  'Colors Super',
  'colors tamil':                  'Colors Tamil',
  'colors tamil hd':               'Colors Tamil HD',
  'rishtey':                       'Rishtey',
  'movies now hd':                 'Movies Now HD',
  'mnx hd':                        'MNX HD',
  'mn+ hd':                        'MN+ HD',
  'romedy now':                    'Romedy Now',
  'aaj tak':                       'Aaj Tak',
  'india today':                   'India Today',
  'ndtv 24x7':                     'NDTV 24x7',
  'ndtv india':                    'NDTV India',
  'ndtv profit':                   'NDTV Profit',
  'cnbc tv18':                     'CNBC TV18',
  'cnbc tv18 prime':               'CNBC TV18 Prime',
  'cnbc awaaz':                    'CNBC Awaaz',
  'cnbc bajar':                    'CNBC Bajar',
  'dd news':                       'DD News',
  'dd national':                   'DD National',
  'dd sports':                     'DD Sports',
  'dd india':                      'DD India',
  'dd bangla':                     'DD Bangla',
  'dd bharati':                    'DD bharati',
  'dd kisan':                      'DD Kisan',
  'dd gyandarshan':                'DD Gyandarshan',
  'sansad tv hd':                  'Sansad TV HD',
  'sansad tv':                     'Sansad TV',
  'sansad tv rajya sabha':         'Sansad TV Rajya Sabha',
  'sony ten 1 hd':                 'Sony Ten 1 HD',
  'sony ten 1':                    'Sony Ten 1',
  'sony ten 2 hd':                 'Sony Ten 2 HD',
  'ten 2':                         'Ten 2',
  'sony ten 3 hd hindi':           'Sony Ten 3 HD Hindi',
  'sony ten 3 hindi':              'Sony Ten 3 Hindi',
  'sony ten 4 hd tamil':           'Sony Ten 4 HD Tamil',
  'sony ten 4 hd telugu':          'Sony Ten 4 HD Telugu',
  'sony ten 4 tamil':              'Sony Ten 4 Tamil',
  'sony ten 4 telugu':             'Sony Ten 4 Telugu',
  'sony ten 5 hd':                 'Sony Ten 5 HD',
  'sony ten 5':                    'Sony Ten 5',
  'eurosport hd':                  'Eurosport HD',
  'eurosport':                     'Eurosport',
  'dd sports hd':                  'DD Sports',
  'discovery hd world':            'Discovery HD World',
  'discovery':                     'Discovery',
  'discovery turbo':               'Discovery Turbo',
  'discovery science':             'Discovery Science',
  'discovery kids 2':              'Discovery Kids 2',
  'animal planet hd world':        'Animal Planet HD World',
  'animal planet hindi':           'Animal Planet Hindi',
  'animal planet english':         'Animal Planet English',
  'animal planet hd tamil':        'Animal Planet HD Tamil',
  'history tv18 hd':               'History TV18 HD',
  'history tv18 hd hindi':         'History TV18 HD Hindi',
  'history tv18 hd telugu':        'History TV18 HD Telugu',
  'history tv18 hd tamil':         'History TV18 HD Tamil',
  'history tv18 sd':               'History TV18 SD',
  'tlc hd':                        'TLC HD',
  'tlc english':                   'TLC English',
  'tlc hindi':                     'TLC Hindi',
  'investigation discovery':       'Investigation Discovery',
  'travelxp hd':                   'Travelxp HD',
  'travelxp hd hindi':             'Travelxp HD Hindi',
  'travelxp tamil':                'Travelxp Tamil',
  'food food':                     'Food Food',
  'good times':                    'GOOD TiMES',
  'cartoon network hindi':         'Cartoon Network Hindi',
  'cartoon network tamil':         'Cartoon Network Tamil',
  'cartoon network telugu':        'Cartoon Network Telugu',
  'cn hd+ english':                'CN HD+ English',
  'cn hd+ telugu':                 'CN HD+ Telugu',
  'cn hd+ tamil':                  'CN HD+ Tamil',
  'pogo hindi':                    'Pogo Hindi',
  'pogo tamil':                    'Pogo Tamil',
  'pogo telugu':                   'Pogo Telugu',
  'nick hindi':                    'Nick Hindi',
  'nick tamil':                    'Nick Tamil',
  'nick telugu':                   'Nick Telugu',
  'nick kannada':                  'Nick Kannada',
  'nick marathi':                  'Nick Marathi',
  'nick bangla':                   'Nick Bangla',
  'nick malayalam':                'Nick Malayalam',
  'nick hd+':                      'Nick HD+',
  'nick junior':                   'Nick Junior',
  'nickelodeon jr':                'Nickelodeon Jr.',
  'nick jr':                       'Nickelodeon Jr.',
  'sonic marathi':                 'Sonic Marathi',
  'sonic telugu':                  'Sonic Telugu',
  'sonic kannada':                 'Sonic Kannada',
  'sonic bangla':                  'Sonic Bangla',
  'sonic malayalam':               'Sonic Malayalam',
  'sony yay hindi':                'Sony Yay Hindi',
  'sony yay tamil':                'Sony Yay Tamil',
  'sony yay telugu':               'Sony Yay Telugu',
  'ktv hd':                        'KTV HD',
  'sun tv hd':                     'Sun TV HD',
  'sun music hd':                  'Sun Music HD',
  'sun news':                      'Sun News',
  'gemini tv hd':                  'Gemini TV HD',
  'gemini music hd':               'Gemini Music HD',
  'gemini movies hd':              'Gemini Movies HD',
  'gemini comedy':                 'Gemini Comedy',
  'gemini life':                   'Gemini Life',
  'udaya hd':                      'Udaya HD',
  'udaya movies':                  'Udaya Movies',
  'udaya comedy':                  'Udaya Comedy',
  'udaya music':                   'Udaya Music',
  'surya hd':                      'Surya HD',
  'surya music':                   'Surya Music',
  'surya comedy':                  'Surya Comedy',
  'surya movies':                  'Surya Movies',
  'jaya tv hd':                    'Jaya TV HD',
  'jaya plus':                     'Jaya Plus',
  'jaya max':                      'Jaya Max',
  'mazhavil manorama':             'Mazhavil Manorama',
  'mazavali manorama hd':          'Mazavali Manorama HD',
  'manorama news':                 'Manorama News',
  'mathrubhumi news':              'Mathrubhumi News',
  'media one tv':                  'Media One TV',
  'kairali tv':                    'Kairali TV',
  'kairali news':                  'Kairali News',
  'kairali we tv':                 'Kairali WE TV',
  'kappa tv':                      'Kappa TV',
  'janam tv':                      'Janam TV',
  'republic tv':                   'Republic TV',
  'republic bharat':               'Republic Bharat',
  'times now':                     'Times NOW',
  'times now world':               'Times Now World',
  'times now navbharat':           'Times Now Navbharat',
  'mirror now':                    'Mirror Now',
  'et now':                        'ET Now',
  'et now swadesh':                'ET Now Swadesh',
  'bloomberg quint':               'CNBC TV18 Prime',
  'wion':                          'Wion',
  'al jazeera':                    'AL Jazeera',
  'cnn':                           'CNN',
  'cnn news 18':                   'CNN NEWS 18',
  'dw':                            'dw',
  'france 24':                     'France 24',
  'euro news':                     'Euro News',
  'channel news asia international':'Channel News Asia International',
  'nhk world japan':               'NHK World Japan',
  'abc news':                      'ABC News',
  'abc australia':                 'ABC News',
  'rt tv':                         'RT TV',
  'tv5 monde':                     'TV5 Monde',
  'mtv':                           'MTV',
  'mtv hd':                        'MTV HD',
  '9xm':                           '9XM',
  '9x jalwa':                      '9X Jalwa',
  '9x tashan':                     '9X Tashan',
  '9x jhakaas':                    '9x Jhakaas',
  'b4u movies':                    'B4U Movies',
  'b4u music':                     'B4U Music',
  'b4u kadak':                     'B4U Kadak',
  'b4u bhojpuri':                  'B4U Bhojpuri',
  'sangeet marathi':               'Sangeet Marathi',
  'sangeet bangla':                'Sangeet Bangla',
  'sangeet bhojpuri':              'Sangeet Bhojpuri',
  'raj music telugu':              'Raj Music Telugu',
  'raj music malayalam':           'Raj Music Malayalam',
  'raj music kannada':             'Raj Music Kannada',
  'raj musix':                     'Raj Musix',
  'music india':                   'Music India',
  'only music':                    'Only Music',
  'mastiii':                       'Mastiii',
  'zoom':                          'ZOOM',
  'e 24':                          'E 24',
  'aastha':                        'Aastha',
  'aastha bhajan':                 'Aastha Bhajan',
  'aastha gujarati':               'Aastha Gujarati',
  'aastha telugu':                 'Aastha Telugu',
  'aastha kannada':                'Aastha Kannada',
  'sanskar':                       'Sanskar',
  'sadhna':                        'Sadhna',
  'sadhna news plus':              'Sadhna News Plus',
  'ishwar tv':                     'Ishwar TV',
  'paras tv':                      'Paras tv',
  'disha tv':                      'Disha tv',
  'sri venkateshwar bhakti':       'Sri Venkateshwar Bhakti',
  'satsang tv':                    'Satsang TV',
  'darshan 24':                    'Darshan 24',
  'jinvani tv':                    'Jinvani TV',
  'hare krsna':                    'Hare krsna',
  'hare krsna music':              'Hare Krsna Music',
  'hare krsna pravachan':          'Hare Krsna Pravachan',
  'pitaara':                       'Pitaara',
  'shemaroo tv':                   'Shemaroo TV',
  'shemaroo umang':                'Shemaroo Umang',
  'shemaroo marathibana':          'Shemaroo MarathiBana',
  'zee 24 ghanta':                 'Zee 24 Ghanta',
  'zee 24 taas':                   'Zee 24 Taas',
  'zee news':                      'Zee News',
  'zee business':                  'Zee Business',
  'zee bharat':                    'Zee Bharat',
  'zee bihar jharkhand':           'Zee Bihar Jharkhand',
  'zee mp chattisgarh':            'Zee MP Chattisgarh',
  'zee rajasthan':                 'Zee Rajasthan',
  'zee up uk':                     'Zee UP UK',
  'zee delhi ncr haryana':         'Zee Delhi NCR Haryana',
  'zee salaam':                    'Zee Salaam',
  'zee punjab haryana hp':         'Zee Punjab Haryana HP',
  'zee 24 kalak':                  'Zee 24 Kalak',
  'news 18 india':                 'News 18 India',
  'news18 lokmat':                 'News18 Lokmat',
  'news18 mp':                     'News18 MP',
  'news18 up':                     'News18 UP',
  'news18 rajasthan':              'News18 RAJASTHAN',
  'news18 gujarati':               'News18 Gujarati',
  'news18 kannada news':           'News18 Kannada News',
  'news18 punjab haryana':         'News18 Punjab Haryana',
  'news18 tamilnadu':              'News 18 Tamilnadu',
  'news18 assam':                  'News 18 Assam',
  'news18 jklh':                   'News18 JKLH',
  'news18 bangla news':            'News18 Bangla News',
  'news18 oriya':                  'News18 Oriya',
  'news18 bihar':                  'News18 BIHAR',
  'news18 kerala':                 'News 18 Kerala',
  'abp news india':                'ABP News India',
  'abp majha':                     'ABP Majha',
  'abp ananda':                    'ABP Ananda',
  'abp asmita':                    'ABP Asmita',
  'abp ganga':                     'ABP Ganga',
  'abp sanjha':                    'ABP Sanjha',
  'india tv':                      'India TV',
  'india news':                    'India news',
  'india news up':                 'India News UP',
  'india news mp':                 'India News MP',
  'india news rajasthan':          'India News Rajasthan',
  'india news haryana':            'India News Haryana',
  'india news gujarat':            'India News Gujarat',
  'india news punjab':             'India News Punjab',
  'tv9 maharashtra':               'TV9 Maharashtra',
  'tv9 gujarat':                   'Tv 9 Gujarat',
  'tv9 telugu news':               'TV9 Telugu News',
  'tv9 karnataka':                 'TV9 Karnataka',
  'tv9 bharatvarsh':               'TV9 Bharatvarsh',
  'tv9 bangla':                    'TV9 Bangla',
  'puthiya thalimurai':            'Puthiya Thalimurai',
  'polimer news':                  'Polimer News',
  'polimer tv':                    'Polimer TV',
  'thanthi tv':                    'Thanthi TV',
  'news7 tamil':                   'News7 Tamil',
  'sun bangla':                    'Sun Bangla',
  'sun marathi':                   'Sun Marathi',
  'sun life':                      'Sun Life',
  'animax':                        'Animax',
  'ftv hd':                        'FTV HD',
  'jio sports hd':                 'Jio Sports HD',
  'jio exclusive hd':              'Jio Exclusive HD',
  'jio events hd':                 'Jio Events HD',
  'jiogames hd':                   'JioGames HD',
  'star sports 2 hindi hd':        'Star Sports 2 Hindi HD',
  'star sports 2 hindi':           'Star Sports 2 Hindi',
  'star sports khel':              'Star Sports Khel',
  'firstpost':                     'Firstpost',
  'sony wah':                      'Sony Wah',
  'sony marathi sd':               'Sony Marathi SD',
  'sony ten 4 hd':                 'Sony Ten 4 HD Tamil',
  'dd arunprabha':                 'DD Arunprabha',
  'dd gyandarshan':                'DD Gyandarshan',
  'kalaignar tv':                  'Kalaignar TV',
  'kalaignar seithigal':           'Kalaignar Seithigal ',
  'puthiyathalaimurai':            'Puthiya Thalimurai',
  'jai maharashtra':               'Jai Maharashtra',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lowercase + strip non-alphanumeric (except spaces) + collapse whitespace */
const normalize = str =>
  (str ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Parse XMLTV date string to JS Date (UTC).
 * Format:  "20260425123000 +0530"
 */
function parseXMLTVDate(str) {
  if (!str) return null;
  const m = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-])(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, yr, mo, dy, hr, mn, sc, sign, tzH, tzM] = m;
  const offsetMs = (sign === '+' ? 1 : -1) * (parseInt(tzH) * 60 + parseInt(tzM)) * 60_000;
  return new Date(Date.UTC(+yr, +mo - 1, +dy, +hr, +mn, +sc) - offsetMs);
}

/** Pull text out of a fast-xml-parser node (string | object | array) */
function xmlText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return xmlText(node[0]);
  return node['#text'] ?? node['_'] ?? '';
}

// ─── Fetch + decompress ───────────────────────────────────────────────────────
// The EPG source returns a file named epg.xml.gz
// We download it → save to disk → extract → read epg.xml → clean up

const os   = require('os');
const TMP_GZ  = path.join(os.tmpdir(), 'epg.xml.gz');
const TMP_XML = path.join(os.tmpdir(), 'epg.xml');

async function fetchEPGXML() {
  // ── Step 1: Download epg.xml.gz → disk ──────────────────────────────────
  console.log('[EPG] Downloading epg.xml.gz from', EPG_URL);

  const resp = await axios.get(EPG_URL, {
    responseType: 'stream',
    timeout:      60_000,
    maxRedirects: 10,
    decompress:   false,   // do NOT let axios auto-decompress — we handle it
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(TMP_GZ);
    resp.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error',  reject);
    resp.data.on('error', reject);
  });

  const gzSize = fs.statSync(TMP_GZ).size;
  console.log(`[EPG] Downloaded epg.xml.gz (${(gzSize / 1024).toFixed(1)} KB)`);

  // ── Step 2: Extract epg.xml.gz → epg.xml ────────────────────────────────
  await new Promise((resolve, reject) => {
    const src  = fs.createReadStream(TMP_GZ);
    const dst  = fs.createWriteStream(TMP_XML);
    const gunz = zlib.createGunzip();

    gunz.on('error', err =>
      reject(new Error(`gunzip failed — file may not be valid gzip: ${err.message}`))
    );
    dst.on('error',  reject);
    dst.on('finish', resolve);

    src.pipe(gunz).pipe(dst);
  });

  const xmlSize = fs.statSync(TMP_XML).size;
  console.log(`[EPG] Extracted epg.xml (${(xmlSize / 1024).toFixed(1)} KB)`);

  // ── Step 3: Read epg.xml content ────────────────────────────────────────
  const xml = fs.readFileSync(TMP_XML, 'utf-8');

  // ── Step 4: Clean up temp files ─────────────────────────────────────────
  try { fs.unlinkSync(TMP_GZ);  } catch { /* ignore */ }
  try { fs.unlinkSync(TMP_XML); } catch { /* ignore */ }

  return xml;
}

// ─── Parse XMLTV XML ──────────────────────────────────────────────────────────
function parseXMLTV(xml) {
  const parser = new XMLParser({
    ignoreAttributes:       false,
    attributeNamePrefix:    '@_',
    isArray: name => ['channel', 'programme', 'title', 'desc', 'category', 'icon', 'display-name'].includes(name),
    allowBooleanAttributes: true,
    trimValues:             true,
  });
  return parser.parse(xml);
}

// ─── Core update routine ──────────────────────────────────────────────────────
async function updateEPG(db) {
 const t0 = Date.now();
  console.log(`\n[EPG] ──── Update started: ${new Date().toISOString()} ────`);

  let xml;
  try {
    xml = await fetchEPGXML();
  } catch (err) {
    console.error('[EPG] Failed to fetch EPG feed:', err.message);
    return;
  }

  const parsed = parseXMLTV(xml);
  const tv     = parsed?.tv ?? {};

  const epgChannels   = tv.channel   ?? [];
  const epgProgrammes = tv.programme ?? [];

  console.log(`[EPG] Parsed: ${epgChannels.length} channels, ${epgProgrammes.length} programmes`);

  // ── NEW: show time range of the feed so you can spot a stale file ──────
  if (epgProgrammes.length > 0) {
    const allStops = epgProgrammes
      .map(p => parseXMLTVDate(p['@_stop']))
      .filter(Boolean);

    if (allStops.length) {
      const minStop = new Date(Math.min(...allStops));
      const maxStop = new Date(Math.max(...allStops));
      console.log(`[EPG] Feed programme window: ${minStop.toISOString()} → ${maxStop.toISOString()}`);
      console.log(`[EPG] Current time (UTC):    ${new Date().toISOString()}`);

      if (maxStop <= new Date()) {
        console.warn('[EPG] ⚠️  WARNING: All programmes in feed have already ended. Feed is stale — skipping DB write.');
        return;                       // nothing useful to write
      }
    }
  }

  // ── Build EPG id → display-name lookup ────────────────────────────────
  const epgIdToName = {};
  for (const ch of epgChannels) {
    const id   = ch['@_id'];
    const name = xmlText(ch['display-name']);
    if (id && name) epgIdToName[id] = name;
  }

  // ── Group programmes by EPG channel id (current + upcoming only) ───────
  const now     = new Date();
  const buckets = {};
  let skippedPast   = 0;
  let skippedNoDate = 0;

  for (const prog of epgProgrammes) {
    const chId = prog['@_channel'];
    const stop = parseXMLTVDate(prog['@_stop']);

    if (!stop)        { skippedNoDate++; continue; }
    if (stop <= now)  { skippedPast++;   continue; }

    const start = parseXMLTVDate(prog['@_start']);
    if (!start) { skippedNoDate++; continue; }

    const iconSrc = prog.icon?.[0]?.['@_src'] ?? prog.icon?.['@_src'] ?? '';

    (buckets[chId] ??= []).push({
      title:       xmlText(prog.title),
      description: xmlText(prog.desc),
      category:    xmlText(prog.category),
      icon:        typeof iconSrc === 'string' ? iconSrc : '',
      start,
      stop,
    });
  }

  console.log(`[EPG] Programme filter: ${Object.keys(buckets).length} channels with future shows | skipped_past=${skippedPast} skipped_no_date=${skippedNoDate}`);

  if (Object.keys(buckets).length === 0) {
    console.warn('[EPG] No future programmes found. Nothing to write.');
    return;
  }


  // Sort each bucket chronologically, then slice to current + MAX_UPCOMING
  for (const id of Object.keys(buckets)) {
    buckets[id].sort((a, b) => a.start - b.start);

    // Find the index of the currently-airing show
    const curIdx = buckets[id].findIndex(p => p.start <= now && p.stop > now);
    const from   = curIdx >= 0 ? curIdx : 0;
    buckets[id]  = buckets[id].slice(from, from + MAX_UPCOMING + 1);
  }

  // ── 4. Load all DB channel names for matching ──────────────────────────────
  const dbChannels = await db
    .collection(CHANNEL_COLL)
    .find({}, { projection: { _id: 1, name: 1 } })
    .toArray();

  // Build normalised-name → DB record lookup
  const dbByNorm = {};
  for (const ch of dbChannels) {
    dbByNorm[normalize(ch.name)] = ch;
  }

  // ── 5. Match EPG channels → DB records & build bulk write ops ─────────────
  const ops       = [];
  const unmatched = [];

  for (const [epgId, programmes] of Object.entries(buckets)) {
    if (!programmes.length) continue;

    const epgName = epgIdToName[epgId];
    if (!epgName) continue;

    const normEpg = normalize(epgName);

    // Try: direct name match → alias → give up
    const dbRecord =
      dbByNorm[normEpg] ??
      dbByNorm[normalize(EPG_TO_DB[normEpg] ?? '')] ??
      null;

    if (!dbRecord) {
      unmatched.push({ epgId, epgName });
      continue;
    }

    // Separate current show from upcoming
    const isCurrentOnAir = programmes[0]?.start <= now;
    const current  = isCurrentOnAir ? programmes[0]  : null;
    const upcoming = isCurrentOnAir ? programmes.slice(1) : programmes.slice(0, MAX_UPCOMING);

    ops.push({
      updateOne: {
        filter: { channelId: dbRecord._id.toString() },
        update: {
          $set: {
            channelId:    dbRecord._id.toString(),
            channelName:  dbRecord.name,
            epgChannelId: epgId,
            current,
            upcoming,
            updatedAt:    new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  // ── 6. Bulk write ──────────────────────────────────────────────────────────
  if (ops.length) {
    const result = await db.collection(EPG_COLL).bulkWrite(ops, { ordered: false });
    console.log(`[EPG] DB write: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);
  }

  // ── 7. Log unmatched channels ──────────────────────────────────────────────
  if (unmatched.length) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });

    const ts   = new Date().toISOString();
    const lines = [
      '',
      `=== ${ts} — ${unmatched.length} unmatched EPG channels ===`,
      ...unmatched.map(u => `  [id=${u.epgId}] "${u.epgName}"  →  add to EPG_TO_DB map`),
    ];
    fs.appendFileSync(UNMATCHED_LOG, lines.join('\n') + '\n');
    console.log(`[EPG] ${unmatched.length} unmatched — see ${UNMATCHED_LOG}`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`[EPG] ──── Done in ${elapsed}s | matched=${ops.length} unmatched=${unmatched.length} ────`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────
(async () => {
  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    console.log('[EPG] Connected to MongoDB →', DB_NAME);

    // Ensure indexes
    await db.collection(EPG_COLL).createIndex({ channelId: 1 }, { unique: true });
    await db.collection(EPG_COLL).createIndex({ updatedAt: 1 });
    await db.collection(EPG_COLL).createIndex({ epgChannelId: 1 });
    console.log('[EPG] Indexes ready');

    // ── Run immediately on startup ─────────────────────────────────────────
    await updateEPG(db);

    // ── Schedule: every hour at minute 0 ──────────────────────────────────
    cron.schedule('0 * * * *', async () => {
      try {
        await updateEPG(db);
      } catch (err) {
        console.error('[EPG] Unhandled error in cron run:', err.message);
      }
    });

    console.log('[EPG] Cron scheduled — will sync every hour at :00');
  } catch (err) {
    console.error('[EPG] Fatal startup error:', err.message);
    if (client) await client.close();
    process.exit(1);
  }
})();