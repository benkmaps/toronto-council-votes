import { Box, Group, Text, ThemeIcon } from '@mantine/core'
import { IconCheck, IconMinus, IconX } from '@tabler/icons-react'
import type { Vote } from '../types'

interface Props {
  vote: Vote
  members: string[] // alphabetical
  highlight: string | null
}

const KIND = {
  Y: { color: 'teal', label: 'Yes', icon: IconCheck },
  N: { color: 'red', label: 'No', icon: IconX },
  A: { color: 'gray', label: 'Absent', icon: IconMinus },
  I: { color: 'gray', label: 'Absent (interest declared)', icon: IconMinus },
} as const

export function MemberGrid({ vote, members, highlight }: Props) {
  const present = members.map((name, i) => ({ name, code: vote.s[i] as keyof typeof KIND })).filter((m) => m.code in KIND)
  return (
    <Box>
      <Group gap="md" mb="xs">
        {(['Y', 'N', 'A'] as const).map((k) => (
          <Group key={k} gap={6}>
            <ThemeIcon size={18} radius="xl" color={KIND[k].color}>
              {(() => {
                const Icon = KIND[k].icon
                return <Icon size={12} stroke={3} />
              })()}
            </ThemeIcon>
            <Text size="xs" c="dimmed">
              {KIND[k].label} {k === 'Y' ? vote.y : k === 'N' ? vote.n : vote.a}
            </Text>
          </Group>
        ))}
      </Group>
      <Box style={{ columnWidth: 210, columnGap: 16 }}>
        {present.map(({ name, code }) => {
          const k = KIND[code]
          const Icon = k.icon
          return (
            <Group
              key={name}
              gap={10}
              wrap="nowrap"
              py={3}
              px={6}
              title={k.label}
              style={{
                breakInside: 'avoid',
                borderRadius: 8,
                background: name === highlight ? `var(--mantine-color-${k.color}-light)` : undefined,
              }}
            >
              <ThemeIcon size={22} radius="xl" color={k.color} variant={code === 'A' || code === 'I' ? 'filled' : 'filled'}>
                <Icon size={14} stroke={3} />
              </ThemeIcon>
              <Text size="sm" fw={name === highlight ? 700 : 400}>
                {name}
                {code === 'I' && (
                  <Text span size="xs" c="dimmed">
                    {' '}
                    (interest declared)
                  </Text>
                )}
              </Text>
            </Group>
          )
        })}
      </Box>
    </Box>
  )
}
