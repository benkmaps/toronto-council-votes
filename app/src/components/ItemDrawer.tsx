import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Divider, Drawer, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { IconExternalLink, IconInfoCircle } from '@tabler/icons-react'
import type { ItemDetail } from '../types'
import { fmtDate, loadItemDetails, shortRef, tmmisUrl } from '../data'

interface Props {
  target: { ref: string; term: string; title: string } | null
  onClose: () => void
}

function Paragraphs({ text }: { text: string }) {
  return (
    <Stack gap="xs">
      {text.split('\n\n').map((p, i) => (
        <Text key={i} size="sm" style={{ lineHeight: 1.55 }}>
          {p}
        </Text>
      ))}
    </Stack>
  )
}

function Section({ title, text }: { title: string; text: string }) {
  if (!text) return null
  return (
    <Stack gap={6}>
      <Text fw={700} size="sm" tt="uppercase" c="dimmed">
        {title}
      </Text>
      <Paragraphs text={text} />
    </Stack>
  )
}

export function ItemDrawer({ target, onClose }: Props) {
  const [detail, setDetail] = useState<ItemDetail | null | undefined>(undefined) // undefined = loading
  const ref = target?.ref
  const term = target?.term

  useEffect(() => {
    if (!ref || !term) return
    let live = true
    setDetail(undefined)
    loadItemDetails(term).then((all) => live && setDetail(all?.[ref] ?? null))
    return () => {
      live = false
    }
  }, [ref, term])

  return (
    <Drawer
      opened={!!target}
      onClose={onClose}
      position="right"
      size="xl"
      title={
        <Group gap="xs">
          <Badge variant="outline" color="gray" radius="sm" ff="monospace" tt="none">
            {ref && shortRef(ref)}
          </Badge>
          <Text fw={600}>Item details</Text>
        </Group>
      }
    >
      {target && (
        <Stack gap="md">
          <Title order={3} lh={1.3}>
            {detail?.t || target.title}
          </Title>

          {detail === undefined && <Loader size="sm" />}

          {detail === null && (
            <Alert icon={<IconInfoCircle size={18} />} color="gray" variant="light">
              The full text of this item has not been added to the site yet. You can read it on TMMIS.
            </Alert>
          )}

          {detail && (
            <>
              <Group gap={6}>
                {detail.m.map((m) => (
                  <Badge key={m.b + m.d} variant="light" color="indigo" tt="none" size="lg">
                    {m.b}
                    {m.d ? ` · ${fmtDate(m.d)}` : ''}
                    {m.st ? ` · ${m.st.toLowerCase()}` : ''}
                  </Badge>
                ))}
              </Group>
              {detail.k && (
                <Text size="xs" c="dimmed">
                  Subjects: {detail.k}
                </Text>
              )}
              <Divider />
              <Section title="Summary" text={detail.s} />
              <Section title="Recommendations" text={detail.r} />
              {detail.m
                .filter((m) => m.x || m.a)
                .map((m) => (
                  <Stack key={m.b + m.d} gap="md">
                    <Divider />
                    <Section title={`${m.b} — decision`} text={m.x} />
                    <Section title={`${m.b} — advice`} text={m.a} />
                  </Stack>
                ))}
            </>
          )}

          <Divider />
          <Button
            component="a"
            href={tmmisUrl(target.ref)}
            target="_blank"
            rel="noreferrer"
            variant="light"
            leftSection={<IconExternalLink size={16} />}
          >
            Open on TMMIS
          </Button>
        </Stack>
      )}
    </Drawer>
  )
}
