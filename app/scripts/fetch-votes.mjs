// Downloads the latest member voting records from Toronto Open Data into ../voting_records,
// in the same shape as the files already there, then (with --build) rebuilds the site data.
//
//   node scripts/fetch-votes.mjs                  latest term only
//   node scripts/fetch-votes.mjs --term 2018-2022 one term
//   node scripts/fetch-votes.mjs --all            every term
//   node scripts/fetch-votes.mjs --build          also run build-data.mjs for what changed
//   node scripts/fetch-votes.mjs --force          overwrite even if the download has fewer rows
//
// Dataset: https://open.toronto.ca/dataset/members-of-toronto-city-council-voting-record/
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const votesDir = path.resolve(here, '../../voting_records')
const API = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/'
const PACKAGE = 'members-of-toronto-city-council-voting-record'
const PAGE = 32000 // CKAN's maximum rows per request

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined)

async function api(action, params) {
  const url = `${API}${action}?${new URLSearchParams(params)}`
  let last
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (!body.success) throw new Error(`API error: ${JSON.stringify(body.error)}`)
      return body.result
    } catch (err) {
      last = err
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  throw new Error(`${action} failed: ${last.message}`)
}

const pkg = await api('package_show', { id: PACKAGE })
const tables = pkg.resources
  .filter((r) => r.datastore_active)
  .map((r) => ({ id: r.id, term: (r.name.match(/^member-voting-record-(\d{4}-\d{4})$/) ?? [])[1] }))
  .filter((r) => r.term)
  .sort((a, b) => a.term.localeCompare(b.term))
if (!tables.length) throw new Error('No voting-record tables found in the Open Data package')

const wanted = flag('all') ? tables : [tables.find((t) => t.term === opt('term')) ?? (opt('term') ? null : tables.at(-1))]
if (wanted.includes(null)) throw new Error(`No such term. Available: ${tables.map((t) => t.term).join(', ')}`)

fs.mkdirSync(votesDir, { recursive: true })
const changed = []

for (const { id, term } of wanted) {
  const file = path.join(votesDir, `member-voting-record-${term}.json`)
  const head = await api('datastore_search', { id, limit: 1 })
  const total = head.total

  let local = null
  if (fs.existsSync(file)) local = JSON.parse(fs.readFileSync(file, 'utf8'))
  const localMaxId = local?.at(-1)?._id
  if (local && local.length === total) {
    const tail = await api('datastore_search', { id, limit: 1, sort: '_id desc' })
    if (tail.records[0]?._id === localMaxId) {
      console.log(`${term}: up to date (${total} rows)`)
      continue
    }
  }

  const rows = []
  while (rows.length < total) {
    const page = await api('datastore_search', { id, limit: PAGE, offset: rows.length, sort: '_id asc' })
    if (!page.records.length) break
    rows.push(...page.records)
  }
  if (rows.length !== total) throw new Error(`${term}: expected ${total} rows but received ${rows.length}`)
  if (local && rows.length < local.length && !flag('force')) {
    throw new Error(`${term}: the download has ${rows.length} rows but the local file has ${local.length}; use --force to overwrite`)
  }

  fs.writeFileSync(`${file}.tmp`, JSON.stringify(rows))
  fs.renameSync(`${file}.tmp`, file)
  const added = rows.length - (local?.length ?? 0)
  const last = rows.at(-1)
  console.log(`${term}: ${rows.length} rows${local ? ` (+${added})` : ''}, latest ${last['Date/Time']} ${last['Agenda Item #']}`)
  changed.push(term)
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.length > 0}\nterms=${changed.join(',')}\n`)
}

if (flag('build') && changed.length) {
  for (const term of changed) {
    const r = spawnSync(process.execPath, [path.join(here, 'build-data.mjs'), '--term', term], { stdio: 'inherit' })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
}
