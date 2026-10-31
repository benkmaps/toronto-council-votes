import type { Item, ItemDetail, Meeting, Motion, TermIndexEntry, TermData, Vote } from './types'

const base = import.meta.env.BASE_URL + 'data/'
const cache = new Map<string, Promise<TermData>>()

export const loadIndex = (): Promise<TermIndexEntry[]> => fetch(base + 'index.json').then((r) => r.json())

export const loadTerm = (term: string): Promise<TermData> => {
  let p = cache.get(term)
  if (!p) {
    p = fetch(`${base}${term}.json`).then((r) => r.json())
    cache.set(term, p)
  }
  return p
}

const motionCache = new Map<string, Promise<Record<string, Motion[]> | null>>()

/** Motion text per item, downloaded from TMMIS (see tmmis/README.md); null if not available. */
export const loadMotions = (term: string): Promise<Record<string, Motion[]> | null> => {
  let p = motionCache.get(term)
  if (!p) {
    p = fetch(`${base}motions/${term}.json`)
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .catch(() => null)
    motionCache.set(term, p)
  }
  return p
}

const itemCache = new Map<string, Promise<Record<string, ItemDetail> | null>>()

/** Item details downloaded from TMMIS (see tmmis/README.md); null if not available for this term. */
export const loadItemDetails = (term: string): Promise<Record<string, ItemDetail> | null> => {
  let p = itemCache.get(term)
  if (!p) {
    p = fetch(`${base}items/${term}.json`)
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .catch(() => null)
    itemCache.set(term, p)
  }
  return p
}

export const tmmisUrl = (ref: string) => `https://secure.toronto.ca/council/agenda-item.do?item=${encodeURIComponent(ref)}`
export const TMMIS_HOME = 'https://secure.toronto.ca/council/#/highlights'

// votes that decide the item itself (as opposed to amendments and procedural votes)
const DISPOSITION =
  /^(adopt item|adopt order paper|adopt minutes|receive item|refer item|defer item|without recommendations|take note and file|introduce and pass|nomination of a member|withdraw an item|petition filed|interim control by-law)/i

// votes that end the item without adopting it; if one of these lost, the item was voted on anyway
const REFERRAL_VOTE = /^(defer item|refer item|receive item|take note and file)/i

/** The last item-level vote (adopt, receive, refer, defer, bills...), if any was recorded. */
export function lastDisposition(item: Item): Vote | undefined {
  for (let i = item.votes.length - 1; i >= 0; i--) {
    if (DISPOSITION.test(item.votes[i].m)) return item.votes[i]
  }
  return undefined
}

/**
 * The vote that decided the item, or undefined if there isn't a recorded one: only amendments
 * or procedural votes, or a referral/deferral that lost (the item must then have been voted on
 * anyway, just not in the record).
 */
export function mainVote(item: Item): Vote | undefined {
  const v = lastDisposition(item)
  return v && REFERRAL_VOTE.test(v.m) && v.r !== 'C' ? undefined : v
}

export function meetingTitle(bodyName: string, m: Meeting): string {
  if (m.dates.length) return fmtDateRange(m.dates)
  if (bodyName === 'City Council') return `${m.label}${m.year ? ` · c. ${m.year}` : ''}`
  const [year, code] = m.label.split('.')
  return `Meeting ${code} · ${year}`
}

const parse = (d: string) => new Date(d + 'T12:00:00')

export function fmtDate(d: string, long = false): string {
  return parse(d).toLocaleDateString('en-CA', {
    weekday: long ? 'long' : 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** "Nov 23–24, 2022", "Jun 30 – Jul 2, 2020", or a single full date. */
export function fmtDateRange(dates: string[], long = false): string {
  if (dates.length === 1) return fmtDate(dates[0], long)
  const a = parse(dates[0])
  const b = parse(dates[dates.length - 1])
  const month = (d: Date) => d.toLocaleDateString('en-CA', { month: 'short' })
  if (a.getFullYear() !== b.getFullYear()) return `${fmtDate(dates[0]).replace(/^\w+, /, '')} – ${fmtDate(dates[dates.length - 1]).replace(/^\w+, /, '')}`
  if (a.getMonth() === b.getMonth()) return `${month(a)} ${a.getDate()}–${b.getDate()}, ${a.getFullYear()}`
  return `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}, ${a.getFullYear()}`
}

/** Drop the year from an item number: 2024.EX17.5 -> EX17.5 */
export const shortRef = (ref: string) => ref.split('.').slice(1).join('.')

export interface ItemGroup {
  key: string
  code: string // e.g. EX33
  year: string
  items: Item[]
}

/** Group a meeting's items by the committee meeting they came from (EX33, PH22, ...). */
export function groupItems(items: Item[], codes: Record<string, string> = {}): ItemGroup[] {
  const groups = new Map<string, ItemGroup>()
  for (const it of items) {
    const [year, code = ''] = it.ref.split('.')
    const key = `${year}.${code}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { key, code, year, items: [] }))
    g.items.push(it)
  }
  const num = (r: string) => r.split('.').slice(2).join('.')
  const letters = (c: string) => c.replace(/\d+$/, '')
  // TMMIS order: routine matters, administrative inquiries, committees (A-Z), community councils, city council, member motions, bills
  const RANK: Record<string, number> = { RM: 0, IA: 1, AI: 1, CC: 3, MM: 4, BL: 5, ST: 5 }
  const label = (c: string) => (codes[letters(c)] ?? letters(c)).trim()
  // the four community councils sit after the committees and before city council items
  const rank = (c: string) => RANK[letters(c)] ?? (/Community Council$/.test(label(c)) ? 2.5 : 2)
  const out = [...groups.values()]
  for (const g of out) g.items.sort((a, b) => num(a.ref).localeCompare(num(b.ref), 'en', { numeric: true }))
  return out.sort(
    (a, b) =>
      rank(a.code) - rank(b.code) ||
      label(a.code).localeCompare(label(b.code)) ||
      a.code.localeCompare(b.code, 'en', { numeric: true }) ||
      a.year.localeCompare(b.year),
  )
}

const REFERRAL: [RegExp, string][] = [
  [/^defer item indefinitely/i, 'Indefinite deferral'],
  [/^defer item/i, 'Deferral'],
  [/^refer item/i, 'Referral'],
  [/^receive item/i, 'Receipt'],
  [/^take note and file/i, 'Note and file'],
]

/** Colour for an item-level result: orange for a referral/deferral, purple for receiving or noting and filing the item (when carried), otherwise green/red. */
export const resultColor = (v: Vote): 'orange' | 'violet' | 'teal' | 'red' =>
  v.r !== 'C' ? 'red' : /^(receive item|take note and file)/i.test(v.m) ? 'violet' : REFERRAL.some(([re]) => re.test(v.m)) ? 'orange' : 'teal'

/** "Carried 25–1", or "Deferral lost 5–20" / "Referral carried 22–3" for referral, deferral and receive votes. */
export function voteSummary(v: Vote): string {
  const score = `${v.y}–${v.n}`
  const kind = REFERRAL.find(([re]) => re.test(v.m))
  if (kind) return `${kind[1]} ${v.r === 'C' ? 'carried' : v.r === 'T' ? 'lost (tie)' : 'lost'} ${score}`
  return `${outcomeLabel(v.r)} ${score}`
}

// wording for an item-level vote, in the style TMMIS uses for item status: [pattern, if carried, if lost]
const ITEM_WORDING: [RegExp, string, string][] = [
  [/^adopt (item|order paper) as amended/i, 'Adopted (amended)', 'Not adopted'],
  [/^adopt (item|order paper|minutes)/i, 'Adopted', 'Not adopted'],
  [/^receive item/i, 'Received', 'Lost'],
  [/^refer item/i, 'Referred', 'Lost'],
  [/^defer item indefinitely/i, 'Deferred indefinitely', 'Lost'],
  [/^defer item/i, 'Deferred', 'Lost'],
  [/^take note and file/i, 'Noted and filed', 'Lost'],
  [/^(introduce and pass|interim control by-law)/i, 'Passed', 'Not passed'],
  [/^without recommendations/i, 'Without recommendations', 'Lost'],
  [/^withdraw an item/i, 'Withdrawn', 'Lost'],
  [/^petition filed/i, 'Petition filed', 'Lost'],
]

// TMMIS item status -> how we word and colour it, for council items with no recorded vote
const STATUS_WORDING: Record<string, [string, ItemColor]> = {
  ADOPTED: ['Adopted', 'teal'],
  AMENDED: ['Adopted (amended)', 'teal'],
  RECEIVED: ['Received', 'violet'],
  REFERRED: ['Referred', 'orange'],
  DEFERRED: ['Deferred', 'orange'],
  POSTPONE: ['Postponed', 'orange'],
  POSTPONED: ['Postponed', 'orange'],
  WITHDRAWN: ['Withdrawn', 'gray'],
}

type ItemColor = 'teal' | 'red' | 'orange' | 'violet' | 'gray'

export interface ItemOutcome {
  label: string // "Adopted", "Adopted (amended)", "Referred"...
  color: ItemColor
  vote?: Vote // the recorded item-level vote, if there is one (its tally is shown beside the label)
}

/** What happened to the item overall, worded the way TMMIS words item status. */
export function itemOutcome(item: Item): ItemOutcome {
  const main = mainVote(item)
  if (main) {
    const w = ITEM_WORDING.find(([re]) => re.test(main.m))
    const label = w ? (main.r === 'C' ? w[1] : w[2]) : outcomeLabel(main.r)
    return { label, color: resultColor(main), vote: main }
  }
  if (!item.votes.length) {
    // council item with no recorded vote: use TMMIS's own status; assume adopted if it has none
    const s = STATUS_WORDING[(item.st ?? '').trim().toUpperCase()]
    if (s) return { label: s[0], color: s[1] }
    const st = (item.st ?? '').trim()
    return st ? { label: st.charAt(0) + st.slice(1).toLowerCase(), color: 'gray' } : { label: 'Adopted', color: 'teal' }
  }
  // a failed vote to waive referral means the item went to committee
  if (item.votes.some((v) => v.r !== 'C' && /^waive referral/i.test(v.m))) return { label: 'Referred', color: 'orange' }
  // voted on, but only amendments / procedural votes (or a lost referral) were recorded: assume adopted
  const amended = item.votes.some((v) => v.r === 'C' && /^amend item/i.test(v.m))
  return { label: amended ? 'Adopted (amended)' : 'Adopted', color: 'teal' }
}

export const outcomeLabel = (r: Vote['r']) => (r === 'C' ? 'Carried' : r === 'T' ? 'Lost (tie)' : 'Lost')
