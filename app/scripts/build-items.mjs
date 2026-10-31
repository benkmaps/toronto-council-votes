// Turns the files saved by tmmis/fetch-items.js (tmmis/parts/tmmis-items-*.json) into
//   public/data/items/<term>.json   item text for the pop-up, one file per council term
//   tmmis/history.json              motions + exact vote times, read by build-data.mjs
// Usage: node scripts/build-items.mjs   then   node scripts/build-data.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const partsDir = path.resolve(here, '../tmmis/parts')
const dataDir = path.resolve(here, '../public/data')
const outDir = path.join(dataDir, 'items')

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', deg: '°', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', frac12: '½' }

/** TMMIS HTML -> plain text, one paragraph per line, joined by `sep`. */
function text(html, sep = '\n\n') {
  if (!html) return ''
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(sep)
}

if (!fs.existsSync(partsDir)) {
  console.error('No tmmis/parts folder. Run the browser script first (see tmmis/README.md).')
  process.exit(1)
}

const raw = {}
const councilFiles = {} // term -> City Council item list (tmmis-council-<term>.json)
const committeeFiles = {} // term -> { body: item list } (tmmis-committees-<term>.json)
for (const f of fs.readdirSync(partsDir).filter((f) => f.endsWith('.json')).sort()) {
  const data = JSON.parse(fs.readFileSync(path.join(partsDir, f), 'utf8'))
  const cm = f.match(/^tmmis-council-(\d{4}-\d{4})\.json$/)
  const tm = f.match(/^tmmis-committees-(\d{4}-\d{4})\.json$/)
  if (cm) councilFiles[cm[1]] = data
  else if (tm) committeeFiles[tm[1]] = data
  else Object.assign(raw, data)
}
console.log(Object.keys(raw).length, 'items in downloaded parts;', Object.keys(councilFiles).length, 'council lists;', Object.keys(committeeFiles).length, 'committee lists')

// council items without a recorded vote (the list only keeps their text; voted ones just link to a meeting)
const council = {}
for (const [term, list] of Object.entries(councilFiles)) {
  const c = (council[term] = { meeting: {}, meetingDate: {}, novote: [] })
  for (const r of list) {
    c.meeting[r.r] = r.mid
    if (r.d) c.meetingDate[r.mid] = r.d
    if (r.t !== undefined) c.novote.push({ r: r.r, t: r.t, st: r.st, mid: r.mid, d: r.d, n: r.n, s: text(r.s), rec: text(r.rec), x: text(r.x), k: r.k })
  }
}

// committee / community council item lists, same shape as the council ones
const committees = {} // term -> body -> { meeting, novote }
for (const [term, bodies] of Object.entries(committeeFiles)) {
  for (const [body, list] of Object.entries(bodies)) {
    const c = ((committees[term] ??= {})[body] = { meeting: {}, novote: [] })
    for (const r of list) {
      c.meeting[r.r] = r.mid
      if (r.t !== undefined) c.novote.push({ r: r.r, t: r.t, st: r.st, mid: r.mid, d: r.d, n: r.n, cd: r.cd, y: r.y, s: text(r.s), rec: text(r.rec), x: text(r.x), k: r.k })
    }
  }
}

const simplify = (records) => {
  if (!records?.length) return null
  const pick = (k) => records.map((r) => text(r[k])).find(Boolean) ?? ''
  return {
    t: records.find((r) => r.title)?.title ?? '',
    s: pick('summary'),
    r: pick('recommendation'),
    k: records.find((r) => r.subjects)?.subjects ?? '',
    m: records.map((r) => ({ b: r.body, d: r.date, n: r.num, st: r.status, x: text(r.decision), a: text(r.advice) })),
  }
}

fs.mkdirSync(outDir, { recursive: true })
const terms = fs.readdirSync(dataDir).filter((f) => /^\d{4}-\d{4}\.json$/.test(f))
let total = 0
for (const f of terms) {
  const term = f.replace('.json', '')
  const d = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'))
  // start from what is already there, so a top-up run with only a few new items keeps the rest
  const itemsFile = path.join(outDir, `${term}.json`)
  const out = fs.existsSync(itemsFile) ? JSON.parse(fs.readFileSync(itemsFile, 'utf8')) : {}
  // details for items that had no recorded vote (council, committees, community councils). A fresh
  // list refreshes these, but never replaces the fuller details already kept for items that have
  // votes. Lists are newest meeting first, so the first record seen for an item is its latest.
  const seen = new Set()
  const addNoVote = (n, body) => {
    const key = `${n.r}|${body}`
    if (raw[n.r] || seen.has(key)) return
    const have = out[n.r]
    const noVoteEntry = have && (have.nv || (have.m.length === 1 && have.m[0].b === 'City Council'))
    if (have && !noVoteEntry) return
    seen.add(key)
    const rec = { b: body, d: n.d, n: n.n, st: n.st, x: n.x, a: '' }
    if (have) {
      have.nv = 1
      have.m = have.m.filter((x) => x.b !== body)
      have.m.push(rec)
    } else out[n.r] = { nv: 1, t: n.t, s: n.s, r: n.rec, k: n.k ?? '', m: [rec] }
  }
  for (const n of council[term]?.novote ?? []) addNoVote(n, 'City Council')
  for (const [body, c] of Object.entries(committees[term] ?? {})) for (const n of c.novote) addNoVote(n, body)
  // items that have votes
  for (const b of d.bodies) for (const m of b.meetings) for (const it of m.items) {
    if (!raw[it.ref]) continue
    const s = simplify(raw[it.ref].records)
    if (s) out[it.ref] = s
  }
  fs.writeFileSync(itemsFile, JSON.stringify(out))
  total += Object.keys(out).length
  console.log(term, Object.keys(out).length, 'items', (fs.statSync(itemsFile).size / 1e6).toFixed(1), 'MB')
}

// motions, exact vote times and meeting dates, matched to the vote data by build-data.mjs
const historyFile = path.resolve(here, '../tmmis/history.json')
const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) : {}
let motions = 0
for (const [ref, v] of Object.entries(raw)) {
  const dates = {}
  for (const r of v.records ?? []) if (r.date) dates[r.body] = r.date
  const ms = (v.history?.motions ?? []).map((m) => ({
    b: m.body,
    n: m.n,
    ty: m.type,
    by: m.mover,
    st: m.status,
    x: text(m.text, '\n'),
    v: m.votes.map((x) => ({ d: x.date, t: x.time, s: x.desc, ty: x.type })),
  }))
  motions += ms.length
  if (ms.length || Object.keys(dates).length) history[ref] = { dates, motions: ms }
}
fs.writeFileSync(historyFile, JSON.stringify(history))
console.log('wrote', total, 'items,', motions, 'motions for', Object.keys(history).length, 'items')

// council meeting links + no-vote item list, read by build-data.mjs
const councilFile = path.resolve(here, '../tmmis/council.json')
const councilOut = fs.existsSync(councilFile) ? JSON.parse(fs.readFileSync(councilFile, 'utf8')) : {}
for (const [term, c] of Object.entries(council)) {
  councilOut[term] = { meeting: c.meeting, meetingDate: c.meetingDate, novote: c.novote.map(({ r, t, st, mid, d }) => ({ r, t, st, mid, d })) }
}
fs.writeFileSync(councilFile, JSON.stringify(councilOut))

// committee meeting links + no-vote item lists, read by build-data.mjs (kept per term and body)
const committeesFile = path.resolve(here, '../tmmis/committees.json')
const committeesOut = fs.existsSync(committeesFile) ? JSON.parse(fs.readFileSync(committeesFile, 'utf8')) : {}
for (const [term, bodies] of Object.entries(committees)) {
  for (const [body, c] of Object.entries(bodies)) {
    ;(committeesOut[term] ??= {})[body] = {
      meeting: c.meeting,
      novote: c.novote.map(({ r, t, st, mid, d, n, cd, y }) => ({ r, t, st, mid, d, n, cd, y })),
    }
  }
}
if (Object.keys(committeesOut).length) fs.writeFileSync(committeesFile, JSON.stringify(committeesOut))
console.log('committee lists in this run:', Object.entries(committees).map(([t, b]) => `${t} ${Object.values(b).reduce((s, c) => s + c.novote.length, 0)} items without a recorded vote in ${Object.keys(b).length} bodies`).join('; '))
console.log('council lists in this run:', Object.entries(council).map(([t, c]) => `${t} ${c.novote.length} items without a recorded vote`).join('; '))
