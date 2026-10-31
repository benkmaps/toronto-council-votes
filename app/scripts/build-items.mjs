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
for (const f of fs.readdirSync(partsDir).filter((f) => f.endsWith('.json')).sort()) {
  const data = JSON.parse(fs.readFileSync(path.join(partsDir, f), 'utf8'))
  const cm = f.match(/^tmmis-council-(\d{4}-\d{4})\.json$/)
  if (cm) councilFiles[cm[1]] = data
  else Object.assign(raw, data)
}
console.log(Object.keys(raw).length, 'items in downloaded parts;', Object.keys(councilFiles).length, 'council lists')

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
  const out = {}
  for (const b of d.bodies) for (const m of b.meetings) for (const it of m.items) {
    if (out[it.ref] || !raw[it.ref]) continue
    const s = simplify(raw[it.ref].records)
    if (s) out[it.ref] = s
  }
  // details for council items that had no recorded vote
  for (const n of council[term]?.novote ?? []) {
    out[n.r] ??= { t: n.t, s: n.s, r: n.rec, k: n.k ?? '', m: [{ b: 'City Council', d: n.d, n: n.n, st: n.st, x: n.x, a: '' }] }
  }
  fs.writeFileSync(path.join(outDir, `${term}.json`), JSON.stringify(out))
  total += Object.keys(out).length
  console.log(term, Object.keys(out).length, 'items', (fs.statSync(path.join(outDir, `${term}.json`)).size / 1e6).toFixed(1), 'MB')
}

// motions, exact vote times and meeting dates, matched to the vote data by build-data.mjs
const history = {}
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
fs.writeFileSync(path.resolve(here, '../tmmis/history.json'), JSON.stringify(history))
console.log('wrote', total, 'items,', motions, 'motions for', Object.keys(history).length, 'items')

// council meeting links + no-vote item list, read by build-data.mjs
const councilOut = {}
for (const [term, c] of Object.entries(council)) {
  councilOut[term] = { meeting: c.meeting, meetingDate: c.meetingDate, novote: c.novote.map(({ r, t, st, mid, d }) => ({ r, t, st, mid, d })) }
}
fs.writeFileSync(path.resolve(here, '../tmmis/council.json'), JSON.stringify(councilOut))
console.log('council:', Object.entries(council).map(([t, c]) => `${t} ${c.novote.length} items without a recorded vote`).join('; '))
