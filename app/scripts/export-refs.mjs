// Writes the reference list the browser script (tmmis/fetch-items.js) works through:
//   items    every distinct item reference that appears in the vote data
//   council  the subset that had a recorded vote at City Council (so the council item
//            list download can tell which council items are missing from the vote data)
//   terms    (only when a term is given) limits the council item list to those terms
//
// Usage: node scripts/export-refs.mjs                 all terms   -> tmmis/refs.json
//        node scripts/export-refs.mjs 2022-2026       one term     -> tmmis/refs-2022-2026.json
//        node scripts/export-refs.mjs --new           latest term, only items not downloaded yet -> tmmis/refs-new.json
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(here, '../public/data')
const wantNew = process.argv.includes('--new')
const termArg = process.argv.slice(2).find((a) => /^\d{4}-\d{4}$/.test(a))
const latest = fs.readdirSync(dataDir).filter((f) => /^\d{4}-\d{4}\.json$/.test(f)).sort().at(-1)?.replace('.json', '')
const only = wantNew ? termArg ?? latest : termArg // e.g. 2022-2026

const items = new Set()
const council = new Set()
for (const f of fs.readdirSync(dataDir).filter((f) => /^\d{4}-\d{4}\.json$/.test(f))) {
  if (only && f !== `${only}.json`) continue
  const d = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'))
  for (const b of d.bodies)
    for (const m of b.meetings)
      for (const it of m.items) {
        if (!it.votes.length) continue // items added from TMMIS with no recorded vote
        items.add(it.ref)
        if (b.name === 'City Council') council.add(it.ref)
      }
}
if (only && !items.size) {
  console.error(`No data for term "${only}". Terms available: ${fs.readdirSync(dataDir).filter((f) => /^\d{4}-\d{4}\.json$/.test(f)).join(', ')}`)
  process.exit(1)
}
// --new: skip items already downloaded (tmmis/history.json holds everything fetched so far)
const historyFile = path.resolve(here, '../tmmis/history.json')
const done = wantNew && fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) : {}
const todo = [...items].filter((r) => !(r in done)).sort()
const out = { items: wantNew ? todo : [...items].sort(), council: [...council].sort(), ...(only ? { terms: [only] } : {}) }
const file = path.resolve(here, `../tmmis/${wantNew ? 'refs-new' : only ? `refs-${only}` : 'refs'}.json`)
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, JSON.stringify(out))
console.log(out.items.length, 'items,', out.council.length, 'with a council vote ->', path.relative(path.resolve(here, '..'), file))
