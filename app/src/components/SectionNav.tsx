import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionIcon, Box, Group, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import type { ItemGroup } from '../data'

export const sectionId = (g: ItemGroup) => `sec-${g.key}`

// header height + this bar, so a section lands just below them
const HEADER = 60
const NAV = 46
export const SECTION_SCROLL_MARGIN = HEADER + NAV + 8

interface Props {
  groups: ItemGroup[]
  nameOf: (code: string) => string
}

/** Sticky row of chips for jumping between the sections of a meeting; follows the scroll position. */
export function SectionNav({ groups, nameOf }: Props) {
  const [active, setActive] = useState(groups[0]?.key)
  const [edge, setEdge] = useState({ left: false, right: false })
  const bar = useRef<HTMLDivElement>(null)

  // which sections the chip row has hidden off to the left / right
  const measure = useCallback(() => {
    const b = bar.current
    if (!b) return
    setEdge({ left: b.scrollLeft > 2, right: b.scrollLeft + b.clientWidth < b.scrollWidth - 2 })
  }, [])

  useEffect(() => {
    const b = bar.current
    if (!b) return
    measure()
    b.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(b)
    return () => {
      b.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [groups, measure])

  // two-letter committee code; add the meeting number only when two sections share the letters
  const letters = (code: string) => code.replace(/\d+$/, '')
  const label = (g: ItemGroup) =>
    groups.filter((x) => letters(x.code) === letters(g.code)).length > 1 ? g.code : letters(g.code)

  const scrollRow = (dir: -1 | 1) => bar.current?.scrollBy({ left: dir * bar.current.clientWidth * 0.7, behavior: 'smooth' })

  // follow the page scroll
  useEffect(() => {
    setActive(groups[0]?.key)
    let frame = 0
    const update = () => {
      frame = 0
      let current = groups[0]?.key
      for (const g of groups) {
        const el = document.getElementById(sectionId(g))
        if (el && el.getBoundingClientRect().top <= SECTION_SCROLL_MARGIN + 4) current = g.key
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [groups])

  // keep the active chip visible inside the row (without scrolling the page)
  useEffect(() => {
    const box = bar.current
    const chip = box?.querySelector<HTMLElement>(`[data-key="${CSS.escape(active ?? '')}"]`)
    if (!chip || !box) return
    const left = chip.offsetLeft - box.offsetLeft
    if (left < box.scrollLeft || left + chip.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollTo({ left: left - 24, behavior: 'smooth' })
    }
  }, [active])

  const arrow = (dir: -1 | 1) => (
    <ActionIcon
      variant="default"
      radius="xl"
      size="md"
      aria-label={dir < 0 ? 'Scroll sections left' : 'Scroll sections right'}
      disabled={dir < 0 ? !edge.left : !edge.right}
      onClick={() => scrollRow(dir)}
      style={{ flexShrink: 0 }}
    >
      {dir < 0 ? <IconChevronLeft size={16} /> : <IconChevronRight size={16} />}
    </ActionIcon>
  )

  return (
    <Box
      style={{
        position: 'sticky',
        top: 'var(--app-shell-header-height, 60px)',
        zIndex: 20,
        background: 'var(--mantine-color-body)',
        borderBottom: '1px solid var(--mantine-color-default-border)',
        margin: '0 calc(var(--mantine-spacing-xs) * -1)',
        padding: '6px var(--mantine-spacing-xs)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {arrow(-1)}
      <Group
        ref={bar}
        gap={6}
        wrap="nowrap"
        style={{ overflowX: 'auto', scrollbarWidth: 'none', flex: 1, minWidth: 0 }}
        aria-label="Jump to section"
        role="navigation"
      >
        {groups.map((g) => {
          const on = g.key === active
          return (
            <Tooltip key={g.key} label={`${nameOf(g.code)} (${g.code})`} position="top" withArrow openDelay={150}>
              <UnstyledButton
                data-key={g.key}
                aria-label={nameOf(g.code)}
                onClick={() => document.getElementById(sectionId(g))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                style={{
                  flexShrink: 0,
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  border: '1px solid var(--mantine-color-default-border)',
                  background: on ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-color-default)',
                  color: on ? 'var(--mantine-primary-color-contrast)' : 'var(--mantine-color-text)',
                }}
              >
                {label(g)}{' '}
                <Text span inherit fw={400} style={{ opacity: 0.7 }}>
                  {g.items.length}
                </Text>
              </UnstyledButton>
            </Tooltip>
          )
        })}
      </Group>
      {arrow(1)}
    </Box>
  )
}
