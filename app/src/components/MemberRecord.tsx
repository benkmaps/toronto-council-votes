import { useMemo, useState } from 'react'
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Paper,
  Progress,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { IconChevronDown, IconExternalLink, IconFileText, IconSearch } from '@tabler/icons-react'
import type { Item, Meeting, TermData, Vote } from '../types'
import { ItemVotes, useItemMotions } from './ItemCard'
import { fmtDateRange, groupItems, mainVote, meetingTitle, shortRef, tmmisUrl, itemOutcome } from '../data'

type Code = 'Y' | 'N' | 'A'
type Filter = 'all' | Code | 'dissent'

const KIND: Record<Code, { label: string; color: string }> = {
  Y: { label: 'Yes', color: 'teal' },
  N: { label: 'No', color: 'red' },
  A: { label: 'Absent', color: 'gray' },
}

/** Y/N/A for the member on one vote, or null if they weren't on the body. */
function codeOf(vote: Vote, idx: number): Code | null {
  const c = vote.s[idx]
  return c === 'Y' || c === 'N' ? c : c === 'A' || c === 'I' ? 'A' : null
}

interface Row {
  item: Item
  main: Vote | undefined // overall vote on the item, if one was recorded
  code: Code
  mixed: boolean
  dissent: boolean
}

function rowFor(item: Item, idx: number): Row | null {
  if (!item.votes.length) return null // no recorded vote
  const main = mainVote(item)
  let code = main ? codeOf(main, idx) : null
  let ref = main
  if (!code) {
    // not recorded on the overall vote (or there is none): use a vote the member did take part in
    ref = [...item.votes].reverse().find((v) => codeOf(v, idx))
    if (!ref) return null
    code = codeOf(ref, idx)!
  }
  const seen = new Set(item.votes.map((v) => codeOf(v, idx)).filter(Boolean))
  const dissent = !!main && ref === main && ((code === 'N' && main.r === 'C') || (code === 'Y' && main.r !== 'C'))
  return { item, main, code, mixed: seen.size > 1, dissent }
}

const counts = (rows: Row[]) => {
  const c = { Y: 0, N: 0, A: 0 }
  for (const r of rows) c[r.code]++
  return c
}

function Chip({ code, w = 66 }: { code: Code; w?: number }) {
  return (
    <Badge color={KIND[code].color} variant={code === 'A' ? 'light' : 'filled'} radius="sm" w={w} style={{ flexShrink: 0 }}>
      {KIND[code].label}
    </Badge>
  )
}

export interface DetailTarget {
  ref: string
  term: string
  body: string
  title: string
}

function ItemRow({ row, idx, data, bodyName, onDetails }: { row: Row; idx: number; data: TermData; bodyName: string; onDetails: (t: DetailTarget) => void }) {
  const [open, setOpen] = useState(false)
  const { item, code } = row
  const { motions, unvoted } = useItemMotions(open, data.term, item, bodyName)
  const outcome = itemOutcome(item)
  const resultBadge = (
    <Badge color={outcome.color} variant="light" size="md" radius="sm">
      {outcome.label}
      {outcome.vote ? ` ${outcome.vote.y}–${outcome.vote.n}` : ''}
    </Badge>
  )
  return (
    <Box style={{ borderLeft: `3px solid var(--mantine-color-${KIND[code].color}-${code === 'A' ? 4 : 6})` }}>
      <Group className="mr-row" wrap="nowrap" align="flex-start" gap="sm" py={8} px={{ base: 'xs', sm: 'sm' }} onClick={() => setOpen((o) => !o)}>
        <Box pt={2} style={{ flexShrink: 0 }}>
          <Chip code={code} w={60} />
        </Box>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Tooltip label="Open item details" withArrow>
              <Badge
                component="button"
                type="button"
                className="item-code"
                variant="outline"
                color="gray"
                radius="sm"
                ff="monospace"
                tt="none"
                aria-label={`Item details for ${shortRef(item.ref)}`}
                rightSection={<IconFileText size={12} />}
                style={{ flexShrink: 0, cursor: 'pointer' }}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation()
                  onDetails({ ref: item.ref, term: data.term, body: bodyName, title: item.title })
                }}
              >
                {shortRef(item.ref)}
              </Badge>
            </Tooltip>
            <Tooltip label="Open on TMMIS" withArrow>
              <ActionIcon
                component="a"
                href={tmmisUrl(item.ref)}
                target="_blank"
                rel="noreferrer"
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Open ${shortRef(item.ref)} on TMMIS`}
                style={{ flexShrink: 0, marginLeft: -4 }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                <IconExternalLink size={14} />
              </ActionIcon>
            </Tooltip>
            {row.mixed && (
              <Tooltip label="Voted differently across this item's votes — expand to see" withArrow>
                <Badge size="xs" variant="outline" color="orange" style={{ flexShrink: 0 }}>
                  mixed
                </Badge>
              </Tooltip>
            )}
            {row.dissent && !row.mixed && (
              <Tooltip label="Voted against the final result" withArrow>
                <Badge size="xs" variant="outline" color="grape" style={{ flexShrink: 0 }}>
                  dissent
                </Badge>
              </Tooltip>
            )}
            <Box hiddenFrom="sm" ml="auto" style={{ flexShrink: 0 }}>
              {resultBadge}
            </Box>
          </Group>
          <Text size="sm" lh={1.3} className={open ? undefined : 'clamp-2'} title={item.title}>
            {item.title}
          </Text>
        </Stack>
        <Box visibleFrom="sm" style={{ flexShrink: 0 }}>
          {resultBadge}
        </Box>
        <IconChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms', flexShrink: 0, marginTop: 6 }} />
      </Group>
      <Collapse expanded={open}>
        {open && <ItemVotes item={item} members={data.members} who={data.members[idx]} motions={motions} unvoted={unvoted} />}
      </Collapse>
    </Box>
  )
}

function Split({ c }: { c: { Y: number; N: number; A: number } }) {
  const total = c.Y + c.N + c.A || 1
  return (
    <Progress.Root size={6} radius="xl" w={90} visibleFrom="xs" style={{ flexShrink: 0 }}>
      <Progress.Section value={(c.Y / total) * 100} color="teal" />
      <Progress.Section value={(c.N / total) * 100} color="red" />
      <Progress.Section value={(c.A / total) * 100} color="gray.4" />
    </Progress.Root>
  )
}

function MeetingSection({
  meeting,
  bodyName,
  rows,
  all,
  idx,
  data,
  open,
  onToggle,
  onDetails,
}: {
  meeting: Meeting
  bodyName: string
  rows: Row[]
  all: Row[]
  idx: number
  data: TermData
  open: boolean
  onToggle: () => void
  onDetails: (t: DetailTarget) => void
}) {
  const c = counts(all)
  const groups = useMemo(
    () => (open ? groupItems(rows.map((r) => r.item), data.codes) : []),
    [open, rows, data.codes],
  )
  const byRef = useMemo(() => new Map(rows.map((r) => [r.item.ref, r])), [rows])
  const codeName = (code: string) => {
    const letters = code.replace(/\d+$/, '')
    return (data.codes[letters] ?? letters).trim()
  }
  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <Group className="mr-meeting" wrap="nowrap" gap="sm" p="sm" onClick={onToggle}>
        <IconChevronDown size={18} style={{ transform: open ? undefined : 'rotate(-90deg)', transition: 'transform 150ms', flexShrink: 0 }} />
        <Text fw={600} style={{ flex: 1, minWidth: 0 }} truncate>
          {meeting.dates.length ? fmtDateRange(meeting.dates) : meetingTitle(bodyName, meeting)}
        </Text>
        <Text size="xs" c="dimmed" style={{ flexShrink: 0 }} visibleFrom="xs">
          {rows.length === all.length ? `${all.length} items` : `${rows.length} of ${all.length} items`}
        </Text>
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          <Badge size="sm" variant="light" color="teal">{c.Y} yes</Badge>
          <Badge size="sm" variant="light" color="red">{c.N} no</Badge>
          {c.A > 0 && <Badge size="sm" variant="light" color="gray" visibleFrom="xs">{c.A} absent</Badge>}
        </Group>
        <Split c={c} />
      </Group>
      {open && (
        <Box style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          {groups.map((g) => (
            <Box key={g.key}>
              {groups.length > 1 && (
                <Group gap="xs" px="sm" pt="sm" pb={4} wrap="nowrap">
                  <Badge variant="filled" color="indigo" radius="sm" tt="none" style={{ flexShrink: 0 }}>
                    {g.code}
                  </Badge>
                  <Text fw={700} truncate>
                    {codeName(g.code)}
                  </Text>
                  <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                    {g.items.length === 1 ? '1 item' : `${g.items.length} items`}
                  </Text>
                  <Divider style={{ flex: 1 }} />
                </Group>
              )}
              {g.items.map((it) => (
                <ItemRow key={it.ref} row={byRef.get(it.ref)!} idx={idx} data={data} bodyName={bodyName} onDetails={onDetails} />
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  )
}

export function MemberRecord({ data, bodyName, onBodyChange, onDetails }: { data: TermData; bodyName: string; onBodyChange: (b: string) => void; onDetails: (t: DetailTarget) => void }) {
  const [member, setMember] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  // meetings the user flipped away from their default (first meeting open, or all open while filtering)
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const reset = () => setFlipped(new Set())

  const idx = member ? data.members.indexOf(member) : -1

  // only bodies where the member has a recorded vote
  const bodies = useMemo(
    () => (idx < 0 ? data.bodies : data.bodies.filter((b) => b.meetings.some((m) => m.items.some((it) => rowFor(it, idx))))),
    [data.bodies, idx],
  )
  const body = bodies.find((b) => b.name === bodyName) ?? bodies[0] ?? data.bodies[0]

  const sections = useMemo(() => {
    if (idx < 0) return []
    const q = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return [...body.meetings]
      .reverse()
      .map((meeting) => {
        const all = meeting.items.map((it) => rowFor(it, idx)).filter((r): r is Row => !!r)
        const rows = all.filter(
          (r) =>
            (filter === 'all' || (filter === 'dissent' ? r.dissent : r.code === filter)) &&
            (!q.length || q.every((t) => (r.item.ref + ' ' + r.item.title).toLowerCase().includes(t))),
        )
        return { meeting, all, rows }
      })
      .filter((s) => s.all.length > 0)
  }, [body, idx, filter, query])

  const total = useMemo(() => counts(sections.flatMap((s) => s.all)), [sections])
  const shownSections = sections.filter((s) => s.rows.length > 0)
  const filtering = filter !== 'all' || query.trim() !== ''
  const grand = total.Y + total.N + total.A

  const toggle = (id: string) =>
    setFlipped((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const isOpen = (id: string, i: number) => (filtering || i === 0) !== flipped.has(id)

  return (
    <Stack gap="md">
      <Group align="flex-end" grow className="stack-sm">
        <Select
          label="Council member"
          placeholder="Choose a member"
          data={data.members}
          value={member}
          onChange={(v) => (setMember(v), reset())}
          searchable
          clearable
          size="md"
        />
        <Select
          label="Council / committee"
          data={bodies.map((b) => b.name)}
          value={body.name}
          onChange={(v) => v && onBodyChange(v)}
          allowDeselect={false}
          searchable
          size="md"
        />
      </Group>

      {!member ? (
        <Paper withBorder radius="lg" p="xl">
          <Text ta="center" c="dimmed">
            Choose a council member to see how they voted on every item this term.
          </Text>
        </Paper>
      ) : grand === 0 ? (
        <Paper withBorder radius="lg" p="xl">
          <Text ta="center" c="dimmed">
            {member} has no recorded votes in {body.name} this term.
          </Text>
        </Paper>
      ) : (
        <>
          <Paper withBorder radius="lg" p="md">
            <Group justify="space-between" align="center" gap="md">
              <div>
                <Title order={3}>{member}</Title>
                <Text size="sm" c="dimmed">
                  {body.name} · {grand} items · {sections.length} meetings
                </Text>
              </div>
              <Group gap="xs">
                <Badge size="lg" variant="light" color="teal">{total.Y} yes</Badge>
                <Badge size="lg" variant="light" color="red">{total.N} no</Badge>
                <Badge size="lg" variant="light" color="gray">{total.A} absent</Badge>
              </Group>
            </Group>
            <Progress.Root size={8} radius="xl" mt="sm">
              <Progress.Section value={(total.Y / grand) * 100} color="teal" />
              <Progress.Section value={(total.N / grand) * 100} color="red" />
              <Progress.Section value={(total.A / grand) * 100} color="gray.4" />
            </Progress.Root>
          </Paper>

          <Group justify="space-between" gap="sm">
            <SegmentedControl
              className="filter-seg"
              value={filter}
              onChange={(v) => (setFilter(v as Filter), reset())}
              data={[
                { value: 'all', label: 'All' },
                { value: 'Y', label: 'Yes' },
                { value: 'N', label: 'No' },
                { value: 'A', label: 'Absent' },
                { value: 'dissent', label: 'Against result' },
              ]}
            />
            <TextInput
              placeholder="Filter items…"
              leftSection={<IconSearch size={16} />}
              value={query}
              onChange={(e) => (setQuery(e.currentTarget.value), reset())}
              style={{ flex: 1, minWidth: 180, maxWidth: 320 }}
              className="filter-input"
            />
          </Group>

          <Divider />
          {filtering && (
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {shownSections.reduce((n, s) => n + s.rows.length, 0)} matching items in {shownSections.length} meetings
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={() => (setFilter('all'), setQuery(''), reset())}>
                Clear filters
              </Button>
            </Group>
          )}
          <Stack gap="xs">
            {shownSections.map((s, i) => (
              <MeetingSection
                key={s.meeting.id}
                meeting={s.meeting}
                bodyName={body.name}
                rows={s.rows}
                all={s.all}
                idx={idx}
                data={data}
                open={isOpen(s.meeting.id, i)}
                onToggle={() => toggle(s.meeting.id)}
                onDetails={onDetails}
              />
            ))}
            {shownSections.length === 0 && (
              <Text ta="center" c="dimmed" py="xl">
                No items match.
              </Text>
            )}
          </Stack>
        </>
      )}
    </Stack>
  )
}
