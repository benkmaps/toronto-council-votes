// Converts the flat one-row-per-member-per-vote JSON exports in ../voting_records
// into compact per-term files grouped body -> meeting -> item -> vote.
// Usage: node scripts/build-data.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '../../voting_records')
const outDir = path.resolve(here, '../public/data')
fs.mkdirSync(outDir, { recursive: true })

const COUNCIL = 'City Council'
const CODE = { Yes: 'Y', No: 'N', Absent: 'A', 'Absent(Interest Declared)': 'I' }
const isConfirmatory = (v) => /Confirmatory/i.test(v.motion)

function parseDateTime(s) {
  if (!s) return {}
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) return {}
  const time = m[2] && !(m[2] === '00' && m[3] === '00') ? `${m[2]}:${m[3]}` : undefined
  return { date: m[1], time }
}

function outcome(result) {
  if (/^Carried/i.test(result)) return 'C'
  if (/tie/i.test(result)) return 'T'
  return 'L'
}

function mode(arr) {
  const c = new Map()
  for (const x of arr) c.set(x, (c.get(x) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

// motions, exact vote times and meeting dates fetched from TMMIS (tmmis/history.json,
// written by build-items.mjs, see tmmis/README.md); optional
const historyFile = path.resolve(here, '../tmmis/history.json')
const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) : {}
// council item list from TMMIS incl. items with no recorded vote (tmmis/council.json); optional
const councilFile = path.resolve(here, '../tmmis/council.json')
const councilList = fs.existsSync(councilFile) ? JSON.parse(fs.readFileSync(councilFile, 'utf8')) : {}
// committee / community council item lists from TMMIS (tmmis/committees.json); optional
const committeesFile = path.resolve(here, '../tmmis/committees.json')
const committeeList = fs.existsSync(committeesFile) ? JSON.parse(fs.readFileSync(committeesFile, 'utf8')) : {}
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
fs.mkdirSync(path.join(outDir, 'motions'), { recursive: true })

/** Pairs our votes with TMMIS's motion records by description (and time when ambiguous). */
function makeMatcher() {
  const pools = new Map() // ref -> [{ mi, body, vote, used }]
  const poolFor = (ref) => {
    let p = pools.get(ref)
    if (!p) {
      p = []
      history[ref]?.motions.forEach((m, mi) => m.v.forEach((vote) => p.push({ mi, body: m.b, vote, used: false })))
      pools.set(ref, p)
    }
    return p
  }
  return (v) => {
    const cands = poolFor(v.ref).filter((e) => !e.used && e.body === v.body && norm(e.vote.s) === norm(v.desc))
    const hit = (v.time && cands.find((e) => e.vote.t === v.time)) || cands[0]
    if (hit) hit.used = true
    return hit
  }
}

// --term 2022-2026 rebuilds just that term (used for automatic updates); other terms are left as they are
const onlyTerm = process.argv.includes('--term') ? process.argv[process.argv.indexOf('--term') + 1] : null
const files = fs
  .readdirSync(srcDir)
  .filter((f) => f.endsWith('.json') && (!onlyTerm || f === `member-voting-record-${onlyTerm}.json`))
  .sort()
if (onlyTerm && !files.length) {
  console.error(`No voting record file for term ${onlyTerm} in ${srcDir}`)
  process.exit(1)
}
const index = []

for (const file of files) {
  const rows = JSON.parse(fs.readFileSync(path.join(srcDir, file), 'utf8'))
  const term = rows[0].Term

  const memberNames = new Map() // name -> sort key
  for (const r of rows) {
    const name = `${r['First Name']} ${r['Last Name']}`.trim()
    if (!memberNames.has(name)) memberNames.set(name, `${r['Last Name']} ${r['First Name']}`)
  }
  const members = [...memberNames.keys()].sort((a, b) => memberNames.get(a).localeCompare(memberNames.get(b)))
  const mIdx = new Map(members.map((m, i) => [m, i]))

  // 1. rebuild individual votes. Rows are usually grouped by vote, but some exports are sorted by
  // member instead, so group by key; the n-th time a member appears under a key it belongs to the
  // n-th vote with that key (identical repeated votes on an item).
  const votes = []
  const byKey = new Map() // key -> votes sharing that key, in order
  const occurrence = new Map() // `${key}|${name}` -> times this member was seen under key
  for (const r of rows) {
    const key = [r.Committee, r['Agenda Item #'], r['Date/Time'], r['Motion Type'], r['Vote Description'], r.Result].join('|')
    const name = `${r['First Name']} ${r['Last Name']}`.trim()
    const occ = occurrence.get(`${key}|${name}`) ?? 0
    occurrence.set(`${key}|${name}`, occ + 1)
    let group = byKey.get(key)
    if (!group) byKey.set(key, (group = []))
    let cur = group[occ]
    if (!cur) {
      const parsed = parseDateTime(r['Date/Time'])
      cur = {
        key,
        body: r.Committee,
        ref: r['Agenda Item #'],
        title: r['Agenda Item Title'],
        motion: r['Motion Type'],
        desc: r['Vote Description'] ?? '',
        result: r.Result,
        date: parsed.date,
        time: parsed.time,
        codes: new Array(members.length).fill('.'),
      }
      group[occ] = cur
      votes.push(cur)
    }
    cur.codes[mIdx.get(name)] = CODE[r.Vote] ?? '?'
  }

  // 1b. attach TMMIS motions and exact vote dates/times
  const match = makeMatcher()
  const motionsOut = {} // ref -> compact motions that have a matched vote
  const motionSlot = new Map() // `${ref}|${mi}` -> index in motionsOut[ref]
  let matched = 0
  for (const v of votes) {
    const hit = history[v.ref] && match(v)
    if (hit) {
      matched++
      v.date ??= hit.vote.d ?? undefined
      v.time ??= hit.vote.t ?? undefined
      const k = `${v.ref}|${hit.mi}`
      if (!motionSlot.has(k)) {
        const { n, ty, by, st, x } = history[v.ref].motions[hit.mi]
        const list = (motionsOut[v.ref] ??= [])
        motionSlot.set(k, list.push({ n, ty, by, st, x }) - 1)
      }
      v.mi = motionSlot.get(k)
    } else if (history[v.ref]?.dates[v.body] && !v.date) {
      v.date = history[v.ref].dates[v.body] // item-level meeting date as a fallback
    }
  }
  // motions TMMIS lists but that had no recorded vote (voice votes, redundant, withdrawn...)
  let unvoted = 0
  for (const ref of new Set(votes.map((v) => v.ref))) {
    ;(history[ref]?.motions ?? []).forEach((m, mi) => {
      if (m.v.length || motionSlot.has(`${ref}|${mi}`) || (!m.x && !m.by)) return
      ;(motionsOut[ref] ??= []).push({ n: m.n, ty: m.ty, by: m.by, st: m.st, x: m.x, b: m.b, nv: 1 })
      unvoted++
    })
  }
  if (Object.keys(history).length) console.log(' ', term, 'matched', matched, 'of', votes.length, 'votes to TMMIS motions,', unvoted, 'motions without a recorded vote')
  fs.writeFileSync(path.join(outDir, 'motions', `${term}.json`), JSON.stringify(motionsOut))

  // 2. assign votes to meetings
  const bodies = new Map() // name -> meetings[]
  const meetingOf = new Map()
  const addMeeting = (body, id, label, v) => {
    let list = bodies.get(body)
    if (!list) bodies.set(body, (list = []))
    const m = { id, label, dates: new Set(), refs: [], items: new Map() }
    list.push(m)
    return m
  }

  let councilMeeting = null
  let councilEnded = true
  for (const v of votes) {
    let m
    if (v.body === COUNCIL) {
      // new sitting after a confirmatory-bill vote, or when the known date changes
      const dateChanged = councilMeeting?.dates.size && v.date && !councilMeeting.dates.has(v.date)
      // CC<n>/BL<n> items name the council meeting; split when that number moves forward
      const km = v.ref.match(/^(\d{4})\.(?:CC|BL)(\d+)\./)
      const key = km ? [Number(km[1]), Number(km[2])] : null
      const ck = councilMeeting?.key
      const keyAdvanced = key && ck && (key[0] > ck[0] || (key[0] === ck[0] && key[1] > ck[1]))
      if (!councilMeeting || (councilEnded && !isConfirmatory(v)) || dateChanged || keyAdvanced) {
        const n = (bodies.get(COUNCIL)?.length ?? 0) + 1
        councilMeeting = addMeeting(COUNCIL, `c${n}`, `Session ${n}`, v)
        councilMeeting.n = n
      }
      councilEnded = isConfirmatory(v)
      if (key && !councilMeeting.key) councilMeeting.key = key
      if (v.date) councilMeeting.dates.add(v.date)
      m = councilMeeting
    } else {
      const prefix = v.ref.split('.').slice(0, 2).join('.')
      const k = `${v.body}|${prefix}`
      m = meetingOf.get(k)
      if (!m) {
        m = addMeeting(v.body, k, prefix, v)
        meetingOf.set(k, m)
      }
      if (v.date) m.dates.add(v.date)
    }
    m.refs.push(v.ref)
    let item = m.items.get(v.ref)
    if (!item) m.items.set(v.ref, (item = { ref: v.ref, title: v.title, votes: [] }))
    const y = v.codes.filter((c) => c === 'Y').length
    const n = v.codes.filter((c) => c === 'N').length
    item.votes.push({
      m: v.motion,
      d: v.desc,
      r: outcome(v.result),
      y,
      n,
      a: v.codes.filter((c) => c === 'A' || c === 'I').length,
      t: v.time,
      mi: v.mi,
      s: v.codes.join(''),
    })
  }


  // 2b. a council "meeting" can sit over several consecutive days: merge sittings
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
  const consecutive = (a, b) => {
    const d = dayDiff(a, b)
    return d <= 1 || (d <= 3 && new Date(a + 'T12:00:00').getDay() === 5)
  }
  // CC<n>, BL<n> and ST<n> items all carry the council meeting number
  const ccKeyOf = (refs) =>
    mode(
      refs
        .map((r) => r.match(/^(\d{4})\.(?:CC|BL|ST)(\d+)\./))
        .filter(Boolean)
        .map((mm) => `${mm[1]}.${mm[2]}`),
    )
  const sittings = bodies.get(COUNCIL) ?? []
  const merged = []
  for (const s of sittings) {
    const dates = [...s.dates].sort()
    const cc = ccKeyOf(s.refs)
    const prev = merged.at(-1)
    let same = false
    if (prev) {
      const prevLast = [...prev.dates].sort().at(-1)
      if (dates.length && prevLast) same = consecutive(prevLast, dates[0]) || dates[0] === prevLast
      else if (cc && prev.cc) same = cc === prev.cc
      else same = true
    }
    if (same) {
      for (const d of dates) prev.dates.add(d)
      prev.cc ??= cc
      prev.refs.push(...s.refs)
      for (const [ref, item] of s.items) {
        const have = prev.items.get(ref)
        if (have) have.votes.push(...item.votes)
        else prev.items.set(ref, item)
      }
    } else {
      merged.push({ id: '', label: '', dates: new Set(dates), refs: [...s.refs], items: new Map(s.items), cc })
    }
  }
  // 2c. council items TMMIS lists that had no recorded vote (tmmis/council.json, from build-items.mjs)
  const cl = councilList[term]
  if (cl) {
    // which of our meetings is which TMMIS meeting, judged by the voted items inside it
    const midOf = new Map()
    for (const m of merged) {
      const mid = mode([...m.items.keys()].map((r) => cl.meeting[r]).filter(Boolean))
      if (mid && !midOf.has(mid)) midOf.set(mid, m)
    }
    let added = 0
    for (const n of cl.novote) {
      let m = midOf.get(n.mid)
      if (!m) {
        // a council meeting with no recorded votes at all in our data
        m = { id: '', label: '', dates: new Set(), refs: [], items: new Map(), cc: undefined }
        const at = n.d ? merged.findIndex((x) => [...x.dates].sort()[0] > n.d) : -1
        if (at >= 0) merged.splice(at, 0, m)
        else merged.push(m)
        midOf.set(n.mid, m)
      }
      if (n.d) m.dates.add(n.d)
      if (!m.items.has(n.r)) {
        m.items.set(n.r, { ref: n.r, title: n.t, votes: [], st: n.st, nv: 1 })
        m.refs.push(n.r)
        added++
      }
    }
    console.log(' ', term, 'added', added, 'council items without a recorded vote')
  }
  // 2d. the same for committees and community councils: items that had no recorded vote
  const extraCodes = {} // item code letters -> body name, for bodies whose votes did not reveal them
  for (const [bodyName, list] of Object.entries(committeeList[term] ?? {})) {
    const meetings = bodies.get(bodyName)
    if (!meetings) continue // the body has no recorded votes this term, so it is not in the data
    const midOf = new Map()
    for (const m of meetings) {
      const mid = mode([...m.items.keys()].map((r) => list.meeting[r]).filter(Boolean))
      if (mid && !midOf.has(mid)) midOf.set(mid, m)
    }
    let added = 0
    for (const n of list.novote) {
      const label = n.y && n.cd && n.n ? `${n.y}.${n.cd}${n.n}` : `Meeting ${n.n ?? n.mid}`
      let m = midOf.get(n.mid) ?? meetings.find((x) => x.label === label)
      if (!m) {
        m = { id: `${bodyName}|${label}`, label, dates: new Set(), refs: [], items: new Map() }
        const at = n.d ? meetings.findIndex((x) => [...x.dates].sort()[0] > n.d) : -1
        if (at >= 0) meetings.splice(at, 0, m)
        else meetings.push(m)
      }
      midOf.set(n.mid, m)
      if (n.d) m.dates.add(n.d)
      if (!m.items.has(n.r)) {
        m.items.set(n.r, { ref: n.r, title: n.t, votes: [], st: n.st, nv: 1 })
        m.refs.push(n.r)
        added++
      }
      if (n.cd) extraCodes[n.cd] ??= bodyName
    }
    console.log(' ', term, bodyName.trim(), 'added', added, 'items without a recorded vote')
  }
  merged.forEach((m, i) => {
    m.id = `c${i + 1}`
    m.label = `Meeting ${i + 1}`
  })
  if (merged.length) bodies.set(COUNCIL, merged)

  // committee code (EX, PH, ...) -> name, learnt from the committee votes
  const codeVotes = {}
  for (const v of votes) {
    if (v.body === COUNCIL) continue
    const code = v.ref.split('.')[1]?.replace(/\d+$/, '')
    if (!code) continue
    ;((codeVotes[code] ??= {})[v.body] = (codeVotes[code][v.body] ?? 0) + 1)
  }
  const codes = Object.fromEntries(
    Object.entries(codeVotes).map(([c, o]) => [c, Object.entries(o).sort((a, b) => b[1] - a[1])[0][0]]),
  )
  for (const [c, name] of Object.entries(extraCodes)) codes[c] ??= name
  Object.assign(codes, {
    RM: 'Routine Matters',
    IA: 'Administrative Inquiry',
    DM: 'Other Deferred Matters',
    CC: 'City Council',
    MM: 'Member Motions',
    BL: 'Bills and By-laws',
  })

  // 3. serialise
  const out = {
    term,
    members,
    codes,
    bodies: [...bodies.entries()]
      .map(([name, meetings]) => ({
        name,
        meetings: meetings.map((m) => {
          const year = mode(m.refs.map((r) => r.split('.')[0]))
          return {
            id: m.id,
            label: m.label,
            dates: [...m.dates].sort(),
            year,
            items: [...m.items.values()],
          }
        }),
      }))
      .sort((a, b) => (a.name === COUNCIL ? -1 : b.name === COUNCIL ? 1 : a.name.localeCompare(b.name))),
  }
  const slug = term
  fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(out))
  const total = out.bodies.reduce((s, b) => s + b.meetings.reduce((t, m) => t + m.items.length, 0), 0)
  index.push({ term, file: `${slug}.json`, members: members.length, votes: votes.length, items: total })
  console.log(term, 'votes', votes.length, 'items', total, 'bytes', fs.statSync(path.join(outDir, `${slug}.json`)).size)
}

// keep the other terms' entries when only one term was rebuilt
const indexFile = path.join(outDir, 'index.json')
if (onlyTerm && fs.existsSync(indexFile)) {
  for (const e of JSON.parse(fs.readFileSync(indexFile, 'utf8'))) if (!index.some((i) => i.term === e.term)) index.push(e)
}
index.sort((a, b) => b.term.localeCompare(a.term))
fs.writeFileSync(indexFile, JSON.stringify(index))
