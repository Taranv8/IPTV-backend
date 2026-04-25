// diagnose.js  —  run once: node diagnose.js
// Shows which CHANNEL_REFERENCE names have no match in MongoDB,
// and suggests the closest DB name for each miss.

const { MongoClient } = require('mongodb');
require('dotenv').config();

const { CHANNEL_REFERENCE } = require('./channelData');

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://tandam:61UMWpsKROnyAvXm@cluster0.cqnwuiv.mongodb.net/?appName=Cluster0';

// ─── Simple similarity: ratio of matching characters after normalising ────────
function normalise(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')   // strip punctuation / special chars
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return 1;

  // Longest common subsequence length as a cheap proxy
  const longer  = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  if (longer.length === 0) return 1;

  let matches = 0;
  for (const ch of shorter) {
    if (longer.includes(ch)) matches++;
  }
  return matches / longer.length;
}

async function main() {
  const client = await MongoClient.connect(MONGO_URI);
  const db     = client.db('IPTV');
  const coll   = db.collection('channelinfo');

  // Fetch every distinct name currently in the DB
  const dbNames = await coll.distinct('name');
  const dbNamesLower = new Map(dbNames.map(n => [n.toLowerCase(), n]));

  const refNames = [...new Set(CHANNEL_REFERENCE.map(c => c.name))];

  const matched   = [];
  const unmatched = [];

  for (const refName of refNames) {
    // 1. Exact case-insensitive match
    if (dbNamesLower.has(refName.toLowerCase())) {
      matched.push({ ref: refName, db: dbNamesLower.get(refName.toLowerCase()), type: 'exact' });
      continue;
    }

    // 2. Normalised match (strips punctuation)
    const normRef = normalise(refName);
    let found = null;
    for (const [lower, original] of dbNamesLower) {
      if (normalise(lower) === normRef) { found = original; break; }
    }
    if (found) {
      matched.push({ ref: refName, db: found, type: 'normalised' });
      continue;
    }

    // 3. No match — find closest DB name for a hint
    let bestScore = 0;
    let bestMatch = null;
    for (const [, original] of dbNamesLower) {
      const score = similarity(refName, original);
      if (score > bestScore) { bestScore = score; bestMatch = original; }
    }
    unmatched.push({ ref: refName, closest: bestMatch, score: bestScore.toFixed(2) });
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log(` CHANNEL NAME DIAGNOSTIC`);
  console.log('══════════════════════════════════════════════════');
  console.log(` Reference list  : ${refNames.length} unique names`);
  console.log(` DB distinct names: ${dbNames.length}`);
  console.log(` Matched         : ${matched.length}`);
  console.log(` UNMATCHED       : ${unmatched.length}`);
  console.log('══════════════════════════════════════════════════\n');

  if (unmatched.length) {
    console.log('── UNMATCHED (reference name → closest DB name) ──');
    for (const { ref, closest, score } of unmatched) {
      console.log(`  ✗ "${ref}"`);
      console.log(`      closest: "${closest}"  (score ${score})`);
    }
  }

  const normalised = matched.filter(m => m.type === 'normalised');
  if (normalised.length) {
    console.log('\n── NORMALISED MATCHES (punctuation/case difference) ──');
    for (const { ref, db } of normalised) {
      console.log(`  ~ "${ref}"  →  "${db}"`);
    }
  }

  console.log('\n── DB NAMES NOT IN REFERENCE (sample, first 30) ──');
  const refSet = new Set(refNames.map(n => n.toLowerCase()));
  const extras = dbNames.filter(n => !refSet.has(n.toLowerCase())).slice(0, 30);
  for (const name of extras) console.log(`  + "${name}"`);

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });