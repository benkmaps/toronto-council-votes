export type Outcome = 'C' | 'L' | 'T'

export interface Vote {
  m: string // motion type
  d: string // vote description
  r: Outcome
  y: number
  n: number
  a: number
  t?: string // HH:MM
  mi?: number // index into the item's motions (data/motions/<term>.json)
  s: string // one char per member: Y N A I, '.' = not recorded
}

export interface Item {
  ref: string
  title: string
  votes: Vote[] // empty when the item had no recorded vote
  st?: string // TMMIS item status, set on items without a recorded vote
  nv?: 1 // 1 = no recorded vote (added from TMMIS)
}

export interface Meeting {
  id: string
  label: string
  dates: string[]
  year?: string
  items: Item[]
}

export interface Body {
  name: string
  meetings: Meeting[]
}

export interface TermData {
  term: string
  members: string[]
  codes: Record<string, string>
  bodies: Body[]
}

export interface TermIndexEntry {
  term: string
  file: string
  members: number
  votes: number
  items: number
}

export interface ItemMeetingInfo {
  b: string // decision body
  d: string | null // meeting date
  n: string // meeting number
  st: string // status
  x: string // decision text
  a: string // advice
}

export interface ItemDetail {
  t: string
  s: string // summary
  r: string // staff recommendation
  k: string // subjects
  m: ItemMeetingInfo[]
}

export interface Motion {
  n: string | null // motion number, e.g. "1a"
  ty: string // motion type
  by: string // mover
  st: string // outcome as TMMIS reports it
  x: string // motion text
  b?: string // decision body (only set on motions without a recorded vote)
  nv?: 1 // 1 = no recorded vote
}
