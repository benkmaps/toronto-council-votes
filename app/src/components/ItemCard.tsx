import { useEffect, useState } from 'react'
import { ActionIcon, Badge, Box, Collapse, Group, Paper, Progress, Stack, Text, Tooltip } from '@mantine/core'
import { IconChevronDown, IconExternalLink, IconFileText } from '@tabler/icons-react'
import type { Item, Motion, Vote } from '../types'
import { itemOutcome, lastDisposition, loadMotions, mainVote, outcomeLabel, shortRef, tmmisUrl, voteSummary } from '../data'
import { MemberGrid } from './MemberGrid'

const outcomeColor = (r: Vote['r']) => (r === 'C' ? 'teal' : 'red')

function Tally({ vote }: { vote: Vote }) {
  const total = vote.y + vote.n + vote.a || 1
  return (
    <Tooltip label={`${vote.y} yes · ${vote.n} no · ${vote.a} absent`} withArrow>
      <Progress.Root size={8} radius="xl" style={{ width: 110 }}>
        <Progress.Section value={(vote.y / total) * 100} color="teal" />
        <Progress.Section value={(vote.n / total) * 100} color="red" />
        <Progress.Section value={(vote.a / total) * 100} color="gray.5" />
      </Progress.Root>
    </Tooltip>
  )
}

function MyVote({ vote, members, who }: { vote: Vote; members: string[]; who: string | null }) {
  if (!who) return null
  const c = vote.s[members.indexOf(who)]
  const map: Record<string, [string, string]> = { Y: ['Yes', 'teal'], N: ['No', 'red'], A: ['Absent', 'gray'], I: ['Absent', 'gray'] }
  const [label, color] = map[c] ?? ['n/a', 'gray']
  return (
    <Badge color={color} variant="filled" size="lg" radius="xl" title={who}>
      {who.split(' ').slice(-1)[0]}: {label}
    </Badge>
  )
}

function VoteRow({ vote, motion, members, who, defaultOpen }: { vote: Vote; motion?: Motion; members: string[]; who: string | null; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Box>
      <Group className="vote-row" wrap="nowrap" gap="sm" p="sm" onClick={() => setOpen((o) => !o)}>
        <Box w={4} style={{ alignSelf: 'stretch', minHeight: 36, borderRadius: 4, background: `var(--mantine-color-${outcomeColor(vote.r)}-6)`, flexShrink: 0 }} />
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={8}>
            <Text fw={600} size="sm">
              {vote.m}
            </Text>
          </Group>
          {motion && (
            <>
              {(motion.n || motion.by) && (
                <Text size="xs" c="dimmed" fw={600}>
                  {motion.n ? `Motion ${motion.n}` : 'Motion'}
                  {motion.by ? ` · moved by ${motion.by}` : ''}
                  {/re-?vote/i.test(vote.d) ? ' · Re-vote' : ''}
                </Text>
              )}
              {motion.x && (
                <Text size="sm" className={open ? undefined : 'clamp-3'} style={{ whiteSpace: 'pre-line' }}>
                  {motion.x}
                </Text>
              )}
            </>
          )}
          {vote.d && (!motion?.x || open) && (
            <Text size="sm" c="dimmed" className={open ? undefined : 'clamp-2'}>
              {vote.d}
            </Text>
          )}
        </Stack>
        <MyVote vote={vote} members={members} who={who} />
        <Text size="xs" fw={700} c={outcomeColor(vote.r)} hiddenFrom="xs" style={{ flexShrink: 0 }}>
          {outcomeLabel(vote.r)} {vote.y}–{vote.n}
        </Text>
        <Stack gap={4} align="flex-end" visibleFrom="xs" style={{ flexShrink: 0 }}>
          <Text size="sm" fw={700} c={outcomeColor(vote.r)}>
            {outcomeLabel(vote.r)} {vote.y}–{vote.n}
          </Text>
          <Tally vote={vote} />
        </Stack>
        <IconChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms', flexShrink: 0 }} />
      </Group>
      <Collapse expanded={open}>
        <Box px="md" pb="md" pl={{ base: 'md', sm: 34 }}>
          <MemberGrid vote={vote} members={members} highlight={who} />
        </Box>
      </Collapse>
    </Box>
  )
}

/** A motion TMMIS lists that has no recorded vote (decided by voice, ruled redundant, withdrawn...). */
function UnvotedRow({ motion }: { motion: Motion }) {
  const [open, setOpen] = useState(false)
  return (
    <Group className="vote-row" wrap="nowrap" align="flex-start" gap="sm" p="sm" onClick={() => setOpen((o) => !o)}>
      <Box w={4} style={{ alignSelf: 'stretch', minHeight: 28, borderRadius: 4, border: '1px dashed var(--mantine-color-gray-6)', flexShrink: 0 }} />
      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Text fw={600} size="sm">
          {motion.ty}
        </Text>
        <Text size="xs" c="dimmed" fw={600}>
          {motion.n ? `Motion ${motion.n}` : 'Motion'}
          {motion.by ? ` · moved by ${motion.by}` : ''}
        </Text>
        {motion.x && (
          <Text size="sm" className={open ? undefined : 'clamp-3'} style={{ whiteSpace: 'pre-line' }}>
            {motion.x}
          </Text>
        )}
      </Stack>
      {motion.st && (
        <Badge variant="outline" color="gray" radius="sm" style={{ flexShrink: 0 }}>
          {motion.st}
        </Badge>
      )}
    </Group>
  )
}

interface Props {
  item: Item
  members: string[]
  who: string | null
  context?: string
  term: string
  body?: string
  onDetails?: (item: Item) => void
}

export function ItemCard({ item, members, who, context, term, body, onDetails }: Props) {
  const [open, setOpen] = useState(false)
  const [motions, setMotions] = useState<Motion[] | null>(null)
  useEffect(() => {
    if (open) loadMotions(term).then((all) => setMotions(all?.[item.ref] ?? null))
  }, [open, term, item])
  const unvoted = (motions ?? []).filter((m) => m.nv && (!body || m.b === body))
  const main = mainVote(item)
  const n = item.votes.length
  const novote = n === 0
  const expandable = !novote || unvoted.length > 0 // nothing to expand on an item with no votes
  const lost = !main ? lastDisposition(item) : undefined // a referral/deferral that lost
  // no vote on the item itself (none recorded, or only amendments): assume it carried,
  // unless TMMIS says otherwise (referred, postponed, withdrawn...)
  const outcome = itemOutcome(item)
  const resultBadge = (
    <Badge color={outcome.color} variant="light" size="md" radius="sm">
      {outcome.label}
      {outcome.vote ? ` ${outcome.vote.y}–${outcome.vote.n}` : ''}
    </Badge>
  )
  const stripe = `5px solid var(--mantine-color-${outcome.color}-6)`
  return (
    <Paper withBorder radius="lg" className="item-card" style={{ overflow: 'hidden', borderLeft: stripe }}>
      <Group
        className={expandable ? 'item-head' : undefined}
        wrap="nowrap"
        align="flex-start"
        p={{ base: 'xs', sm: 'sm' }}
        gap="sm"
        onClick={expandable ? () => setOpen((o) => !o) : undefined}
      >
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={8} wrap="nowrap">
            {onDetails ? (
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
                    onDetails(item)
                  }}
                >
                  {shortRef(item.ref)}
                </Badge>
              </Tooltip>
            ) : (
              <Badge variant="outline" color="gray" radius="sm" ff="monospace" tt="none" style={{ flexShrink: 0 }}>
                {shortRef(item.ref)}
              </Badge>
            )}
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
            {!novote && (
              <Text size="xs" c="dimmed" truncate style={{ minWidth: 0 }}>
                {`${n} ${n === 1 ? 'recorded vote' : 'recorded votes'}${lost ? ` · ${voteSummary(lost)}` : ''}`}
              </Text>
            )}
            <Box hiddenFrom="sm" ml="auto" style={{ flexShrink: 0 }}>
              {resultBadge}
            </Box>
          </Group>
          <Text fw={600} lh={1.3}>
            {item.title}
          </Text>
          {context && (
            <Text size="xs" c="dimmed">
              {context}
            </Text>
          )}
          {main && who && (
            <Box hiddenFrom="sm" mt={2}>
              <MyVote vote={main} members={members} who={who} />
            </Box>
          )}
        </Stack>
        <Stack gap={6} align="flex-end" visibleFrom="sm" style={{ flexShrink: 0 }}>
          {resultBadge}
          {main && <MyVote vote={main} members={members} who={who} />}
        </Stack>
        {expandable && <IconChevronDown size={20} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms', marginTop: 6, flexShrink: 0 }} />}
      </Group>
      <Collapse expanded={open && expandable}>
        <Box
          mx={{ base: 'xs', sm: 'md' }}
          mb={{ base: 'xs', sm: 'md' }}
          style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)', background: 'var(--mantine-color-body)' }}
        >
          {item.votes.map((v, i) => (
            <Box key={i} style={i > 0 ? { borderTop: '1px solid var(--mantine-color-default-border)' } : undefined}>
              <VoteRow vote={v} motion={v.mi !== undefined ? motions?.[v.mi] : undefined} members={members} who={who} defaultOpen={n === 1} />
            </Box>
          ))}
          {unvoted.length > 0 && (
            <Box style={{ borderTop: '1px dashed var(--mantine-color-default-border)', background: 'var(--mantine-color-default-hover)' }}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" px="sm" pt="sm">
                No recorded vote
              </Text>
              {unvoted.map((m, i) => (
                <UnvotedRow key={i} motion={m} />
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  )
}
