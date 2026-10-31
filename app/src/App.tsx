import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
  Button,
  Center,
  Divider,
  CloseButton,
  Group,
  Loader,
  NavLink,
  SegmentedControl,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { IconExternalLink, IconMoon, IconSearch, IconSun } from '@tabler/icons-react'
import type { Body, Item, Meeting, TermData, TermIndexEntry } from './types'
import { TMMIS_HOME, fmtDateRange, groupItems, itemOutcome, loadIndex, loadTerm, meetingTitle } from './data'
import { ItemCard } from './components/ItemCard'
import { MemberRecord } from './components/MemberRecord'
import { ItemDrawer } from './components/ItemDrawer'
import { SECTION_SCROLL_MARGIN, SectionNav, sectionId } from './components/SectionNav'

const PAGE = 40

const haystacks = new WeakMap<Item, string>()
function haystack(item: Item) {
  let h = haystacks.get(item)
  if (h === undefined) {
    h = (item.ref + ' ' + item.title + ' ' + item.votes.map((v) => v.m + ' ' + v.d).join(' ')).toLowerCase()
    haystacks.set(item, h)
  }
  return h
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const groupName = (code: string, codes: Record<string, string>) => {
  const letters = code.replace(/\d+$/, '')
  return (codes[letters] ?? letters).trim()
}

interface Hit {
  item: Item
  term: string
  context: string
  body: string
  members: string[]
}

export default function App() {
  const [navOpen, { toggle: toggleNav, close: closeNav }] = useDisclosure()
  const { setColorScheme } = useMantineColorScheme()
  const scheme = useComputedColorScheme('light')
  const isMobile = !!useMediaQuery('(max-width: 47.99em)')

  const [index, setIndex] = useState<TermIndexEntry[]>([])
  const [term, setTerm] = useState<string | null>(null)
  const [terms, setTerms] = useState<Record<string, TermData>>({})
  const [bodyName, setBodyName] = useState<string>('City Council')
  const [meetingId, setMeetingId] = useState<string | null>(null)
  const [view, setView] = useState<'meetings' | 'members'>('meetings')
  const [query, setQuery] = useState('')
  const [allTerms, setAllTerms] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const [showNoVote, setShowNoVote] = useState(true)
  const [detail, setDetail] = useState<{ ref: string; term: string; body: string; title: string } | null>(null)
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  useEffect(() => {
    loadIndex().then((idx) => {
      setIndex(idx)
      setTerm(idx[0].term)
    })
  }, [])

  const wanted = useMemo(
    () => (term ? (deferredQuery && allTerms ? index.map((i) => i.term) : [term]) : []),
    [term, deferredQuery, allTerms, index],
  )
  useEffect(() => {
    for (const t of wanted) {
      if (!terms[t]) loadTerm(t).then((d) => setTerms((prev) => ({ ...prev, [t]: d })))
    }
  }, [wanted, terms])

  const data = term ? terms[term] : undefined
  const body: Body | undefined = data?.bodies.find((b) => b.name === bodyName) ?? data?.bodies[0]
  const meetings = useMemo(() => (body ? [...body.meetings].reverse() : []), [body])
  const meeting: Meeting | undefined = meetings.find((m) => m.id === meetingId) ?? meetings[0]

  // keep selections valid when term/body changes
  useEffect(() => {
    if (body && body.name !== bodyName) setBodyName(body.name)
  }, [body, bodyName])
  useEffect(() => setShown(PAGE), [deferredQuery, allTerms, term, bodyName, meetingId])

  const searching = deferredQuery.length > 0
  const hits = useMemo<Hit[]>(() => {
    if (!searching) return []
    const tokens = deferredQuery.split(/\s+/)
    const out: Hit[] = []
    for (const t of wanted) {
      const d = terms[t]
      if (!d) continue
      for (const b of d.bodies) {
        for (const m of [...b.meetings].reverse()) {
          for (const item of m.items) {
            const h = haystack(item)
            if (!showNoVote && !item.votes.length) continue
            if (tokens.every((tok) => h.includes(tok))) {
              out.push({ item, term: t, members: d.members, context: `${t} · ${b.name} · ${meetingTitle(b.name, m)}`, body: b.name })
            }
          }
        }
      }
    }
    return out
  }, [searching, deferredQuery, wanted, terms, showNoVote])

  const noVoteCount = useMemo(() => meeting?.items.filter((it) => !it.votes.length).length ?? 0, [meeting])
  const groups = useMemo(
    () => (meeting ? groupItems(showNoVote ? meeting.items : meeting.items.filter((it) => it.votes.length), data?.codes) : []),
    [meeting, data?.codes, showNoVote],
  )

  const stats = useMemo(() => {
    if (!meeting) return null
    const tally = new Map<string, { label: string; color: string; n: number }>()
    for (const it of meeting.items) {
      if (!showNoVote && !it.votes.length) continue
      const { label, color } = itemOutcome(it)
      const t = tally.get(label)
      if (t) t.n++
      else tally.set(label, { label, color, n: 1 })
    }
    return [...tally.values()].sort((a, b) => b.n - a.n)
  }, [meeting, showNoVote])

  const loadingTerm = !!term && !data

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 340, breakpoint: 'sm', collapsed: { mobile: !navOpen, desktop: view !== 'meetings' } }}
      padding={{ base: 'xs', sm: 'md' }}
    >
      <AppShell.Header>
        <Group h="100%" px={{ base: 'xs', sm: 'md' }} justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={navOpen} onClick={toggleNav} hiddenFrom="sm" display={view === 'meetings' ? undefined : 'none'} size="sm" aria-label="Toggle meetings" />
            <Title order={3} lh={1} style={{ whiteSpace: 'nowrap' }}>
              <Text span inherit visibleFrom="sm">Toronto Council Votes</Text>
              <Text span inherit visibleFrom="xs" hiddenFrom="sm">Council Votes</Text>
              <Text span inherit hiddenFrom="xs" className="hdr-emoji">🏛️</Text>
            </Title>
          </Group>
          <Group gap={4} wrap="nowrap">
            <SegmentedControl
              aria-label="View"
              size={isMobile ? 'xs' : 'sm'}
              value={view}
              onChange={(v) => setView(v as 'meetings' | 'members')}
              data={[
                { value: 'meetings', label: 'Meetings' },
                { value: 'members', label: isMobile ? 'Members' : 'Member record' },
              ]}
            />
            <Select
              aria-label="Council term"
              data={index.map((i) => ({ value: i.term, label: isMobile ? i.term.replace('-', '–').replace(/\d{2}(\d{2})$/, '$1') : `${i.term.replace('-', '–')} term` }))}
              value={term}
              onChange={(v) => {
                setTerm(v)
                setMeetingId(null)
              }}
              allowDeselect={false}
              rightSection={isMobile ? <span /> : undefined}
              rightSectionWidth={isMobile ? 6 : undefined}
              w={{ base: 80, '25em': 92, sm: 150 }}
              style={{ flexShrink: 0 }}
              size={isMobile ? 'xs' : 'sm'}
              comboboxProps={{ withinPortal: true }}
            />
            <Tooltip label="TMMIS">
              <ActionIcon component="a" href={TMMIS_HOME} target="_blank" rel="noreferrer" variant="default" size="lg" aria-label="TMMIS" visibleFrom="sm">
                <IconExternalLink size={18} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Toggle color scheme"
              onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
            >
              {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap="sm" h="100%" style={{ minHeight: 0 }}>
          <Select
            label="Council / committee"
            data={data?.bodies.map((b) => ({ value: b.name, label: b.name })) ?? []}
            value={body?.name ?? null}
            onChange={(v) => {
              if (v) {
                setBodyName(v)
                setMeetingId(null)
              }
            }}
            allowDeselect={false}
            searchable
          />
          <Text size="sm" fw={600} mt="xs">
            Meetings{' '}
            <Text span c="dimmed" size="xs">
              ({meetings.length})
            </Text>
          </Text>
          <ScrollArea style={{ flex: 1, minHeight: 0 }} offsetScrollbars>
            {meetings.map((m) => {
              const active = !searching && m.id === meeting?.id
              return (
                <NavLink
                  key={m.id}
                  active={active}
                  label={meetingTitle(body!.name, m)}
                  description={plural((showNoVote ? m.items : m.items.filter((it) => it.votes.length)).length, 'item')}
                  onClick={() => {
                    setMeetingId(m.id)
                    setQuery('')
                    closeNav()
                  }}
                  style={{ borderRadius: 8 }}
                />
              )
            })}
          </ScrollArea>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box maw={960} mx="auto">
          {view === 'members' ? (
            data ? (
              <MemberRecord key={term} data={data} bodyName={body?.name ?? bodyName} onBodyChange={setBodyName} />
            ) : (
              <Center py={80}>
                <Loader />
              </Center>
            )
          ) : (
          <Stack gap="md">
            <TextInput
              size="md"
              placeholder="Search items, titles, motions and item numbers…"
              leftSection={<IconSearch size={18} />}
              rightSection={query ? <CloseButton aria-label="Clear search" onClick={() => setQuery('')} /> : undefined}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
            {searching && (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {hits.length} matching {hits.length === 1 ? 'item' : 'items'} {allTerms ? 'across all terms' : `in ${term}`}
                </Text>
                <Switch label="Search all terms" checked={allTerms} onChange={(e) => setAllTerms(e.currentTarget.checked)} />
              </Group>
            )}

            {loadingTerm || (searching && wanted.some((t) => !terms[t])) ? (
              <Center py={80}>
                <Loader />
              </Center>
            ) : searching ? (
              <Stack gap="sm">
                {hits.slice(0, shown).map((h) => (
                  <ItemCard
                    key={h.context + h.item.ref}
                    item={h.item}
                    members={h.members}
                    who={null}
                    context={h.context}
                    term={h.term}
                    body={h.body}
                    onDetails={(it) => setDetail({ ref: it.ref, term: h.term, body: h.body, title: it.title })}
                  />
                ))}
                {hits.length > shown && (
                  <Button variant="light" onClick={() => setShown((s) => s + PAGE)}>
                    Show more ({hits.length - shown} remaining)
                  </Button>
                )}
              </Stack>
            ) : meeting && body && data ? (
              <Stack gap="sm">
                <Group justify="space-between" align="flex-end" mb={4}>
                  <div>
                    <Text size="sm" c="dimmed">
                      {body.name}
                    </Text>
                    <Title order={2}>{meeting.dates.length ? fmtDateRange(meeting.dates, true) : meetingTitle(body.name, meeting)}</Title>
                  </div>
                  {stats && (
                    <Group gap={6}>
                      <Badge variant="light" color="gray" size="lg">
                        {plural(meeting.items.length - (showNoVote ? 0 : noVoteCount), 'item')}
                      </Badge>
                      {stats.map((s) => (
                        <Badge key={s.label} variant="light" color={s.color} size="lg">
                          {s.n} {s.label.toLowerCase()}
                        </Badge>
                      ))}
                    </Group>
                  )}
                </Group>
                {noVoteCount > 0 && (
                  <Switch
                    size="sm"
                    label={`Show ${noVoteCount} ${noVoteCount === 1 ? 'item' : 'items'} with no recorded vote`}
                    checked={showNoVote}
                    onChange={(e) => setShowNoVote(e.currentTarget.checked)}
                  />
                )}
                {!meeting.dates.length && body.name === 'City Council' && (
                  <Text size="xs" c="dimmed">
                    The source data has no date for this meeting, so meetings are numbered in order. They are identified from the meeting numbers in the
                    item references, so a few items near the edges may be placed in a neighbouring meeting. The year shown is when most of the items originated.
                  </Text>
                )}
                {groups.length > 1 && <SectionNav groups={groups} nameOf={(code) => groupName(code, data.codes)} />}
                {groups.map((g) => (
                  <Stack key={g.key} gap={6} id={sectionId(g)} style={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}>
                    {(groups.length > 1) && (
                      <Group gap="xs" mt="sm" wrap="nowrap">
                        <Badge variant="filled" color="indigo" radius="sm" tt="none" style={{ flexShrink: 0 }}>
                          {g.code}
                        </Badge>
                        <Text fw={700}>{groupName(g.code, data.codes)}</Text>
                        <Text size="sm" c="dimmed">
                          {g.items.length} {g.items.length === 1 ? 'item' : 'items'}
                        </Text>
                        <Divider style={{ flex: 1 }} />
                      </Group>
                    )}
                    {g.items.map((it) => (
                      <ItemCard
                        key={it.ref}
                        item={it}
                        members={data.members}
                        who={null}
                        term={data.term}
                        body={body.name}
                        onDetails={(i) => setDetail({ ref: i.ref, term: data.term, body: body.name, title: i.title })}
                      />
                    ))}
                  </Stack>
                ))}
              </Stack>
            ) : null}
          </Stack>
          )}
        </Box>
      </AppShell.Main>
      <ItemDrawer target={detail} onClose={() => setDetail(null)} />
    </AppShell>
  )
}
