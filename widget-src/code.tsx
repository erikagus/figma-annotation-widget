import {
  AnnotationData,
  Author,
  CATEGORIES,
  CategoryId,
  LayerLink,
  PIN_LENGTHS,
  PinLength,
  POINTERS,
  PointerSide,
  Reply,
  StatusId,
  STATUSES,
} from './constants'
import { parseInline } from './markdown'
import { formatTime, toMarkdown, toMarkdownAll } from './summary'

const { widget } = figma
const {
  AutoLayout,
  Ellipse,
  Image,
  Input,
  Rectangle,
  SVG,
  Span,
  Text,
  useEffect,
  usePropertyMenu,
  useSyncedState,
  useWidgetNodeId,
  waitForTask,
} = widget

const AVATAR_COLORS = ['#FF8A7A', '#7AB8FF', '#B58CFF', '#5FD0A5', '#F2B84B']
const colorFor = (name: string) =>
  AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length]

function statusIcon(status: StatusId): string {
  const body: Record<StatusId, string> = {
    open: '<circle cx="11" cy="11" r="11" fill="#EDEDED"/>',
    progress:
      '<circle cx="11" cy="11" r="10" fill="#FFF4D6" stroke="#F59E0B" stroke-width="2"/>' +
      '<path d="M11 1a10 10 0 0 1 0 20z" fill="#F59E0B"/>',
    resolved:
      '<circle cx="11" cy="11" r="11" fill="#22C55E"/>' +
      '<path d="M6 11.5l3.2 3.2L16 7.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    na:
      '<circle cx="11" cy="11" r="11" fill="#EDEDED"/>' +
      '<path d="M7 11h8" stroke="#9AA3AB" stroke-width="2" stroke-linecap="round"/>',
  }
  return `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">${body[status]}</svg>`
}

function Avatar({ author, size }: { author: Author; size: number }) {
  if (author.photoUrl) {
    return <Image src={author.photoUrl} width={size} height={size} cornerRadius={size / 2} />
  }
  return (
    <AutoLayout
      width={size}
      height={size}
      cornerRadius={size / 2}
      fill={colorFor(author.name)}
      horizontalAlignItems="center"
      verticalAlignItems="center"
    >
      <Text fill="#FFFFFF" fontSize={size * 0.5}>
        {author.name.charAt(0).toUpperCase()}
      </Text>
    </AutoLayout>
  )
}

function copyToClipboard(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    figma.showUI(__html__, { visible: false })
    figma.ui.postMessage({ type: 'copy', text })
    const done = (ok: boolean) => {
      figma.notify(ok ? 'Summary copied' : 'Copy failed')
      figma.closePlugin()
      resolve()
    }
    figma.ui.on('message', (msg: { type: string; ok: boolean }) => {
      if (msg.type === 'copied') done(msg.ok)
    })
    setTimeout(() => done(false), 3000)
  })
}

function RichText({ text }: { text: string }) {
  return (
    <Text width="fill-parent" fontSize={14} fill="#1F2933">
      {parseInline(text).map((seg, i) => (
        <Span
          key={i}
          fontWeight={seg.bold ? 700 : 400}
          italic={seg.italic}
          fontFamily={seg.code ? 'Roboto Mono' : 'Inter'}
          fill={seg.code ? '#B4235A' : '#1F2933'}
        >
          {seg.text}
        </Span>
      ))}
    </Text>
  )
}

async function goToLayer(id: string) {
  const node = await figma.getNodeByIdAsync(id)
  if (node && 'absoluteBoundingBox' in node) {
    figma.viewport.scrollAndZoomIntoView([node as SceneNode])
  } else {
    figma.notify('Linked layer no longer exists')
  }
}

// Select the next Open note after this one (wraps around), in reading order.
async function goToNextOpen(selfId: string) {
  const notes = figma.currentPage
    .findWidgetNodesByWidgetId(figma.widgetId ?? '')
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .filter((n) => n.id === selfId || (n.widgetSyncedState as { status?: StatusId }).status !== 'resolved' && (n.widgetSyncedState as { status?: StatusId }).status !== 'na')
  const at = notes.findIndex((n) => n.id === selfId)
  const next = notes.length > 1 ? notes[(at + 1) % notes.length] : null
  if (!next) {
    figma.notify('No other open notes')
    return
  }
  figma.currentPage.selection = [next]
  figma.viewport.scrollAndZoomIntoView([next])
}

function collectPage(): AnnotationData[] {
  if (!figma.widgetId) return []
  const nodes = figma.currentPage.findWidgetNodesByWidgetId(figma.widgetId)
  return nodes
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((n) => {
      const s = n.widgetSyncedState as Partial<AnnotationData>
      return {
        category: s.category ?? 'review',
        status: s.status ?? 'open',
        text: s.text ?? '',
        author: s.author ?? null,
        createdAt: s.createdAt ?? 0,
        replies: s.replies ?? [],
        target: s.target ?? null,
      }
    })
}

function AnnotationWidget() {
  const [category, setCategory] = useSyncedState<CategoryId>('category', 'review')
  const [status, setStatus] = useSyncedState<StatusId>('status', 'open')
  const [pointer, setPointer] = useSyncedState<PointerSide>('pointer', 'top')
  const [pinLength, setPinLength] = useSyncedState<PinLength>('pinLength', 'short')
  const [text, setText] = useSyncedState('text', '')
  const [author, setAuthor] = useSyncedState<Author | null>('author', null)
  const [createdAt, setCreatedAt] = useSyncedState('createdAt', 0)
  const [replies, setReplies] = useSyncedState<Reply[]>('replies', [])
  const [showReplies, setShowReplies] = useSyncedState('showReplies', true)
  const [target, setTarget] = useSyncedState<LayerLink | null>('target', null)
  const [editing, setEditing] = useSyncedState('editing', false)
  const nodeId = useWidgetNodeId()
  const [replyKey, setReplyKey] = useSyncedState('replyKey', 0)

  // Stamp the author once, when the widget is first placed.
  useEffect(() => {
    if (!author && figma.currentUser) {
      setAuthor({ name: figma.currentUser.name, photoUrl: figma.currentUser.photoUrl })
      setCreatedAt(Date.now())
    }
  })

  const current = (): AnnotationData => ({ category, status, text, author, createdAt, replies, target })

  const options = <T extends string>(map: Record<T, string | { label: string }>) =>
    (Object.keys(map) as T[]).map((k) => {
      const v = map[k]
      return { option: k, label: typeof v === 'string' ? v : v.label }
    })

  usePropertyMenu(
    [
      { itemType: 'dropdown', propertyName: 'category', tooltip: 'Type', selectedOption: category, options: options(CATEGORIES) },
      { itemType: 'dropdown', propertyName: 'status', tooltip: 'Status', selectedOption: status, options: options(STATUSES) },
      { itemType: 'dropdown', propertyName: 'pointer', tooltip: 'Pointer', selectedOption: pointer, options: options(POINTERS) },
      {
        itemType: 'dropdown',
        propertyName: 'pinLength',
        tooltip: 'Pin length',
        selectedOption: pinLength,
        options: [
          { option: 'short', label: 'Short' },
          { option: 'long', label: 'Long' },
        ],
      },
      { itemType: 'separator' },
      { itemType: 'toggle', propertyName: 'replies', tooltip: 'Replies', isToggled: showReplies },
      { itemType: 'action', propertyName: 'link', tooltip: target ? 'Relink layer' : 'Link selected layer' },
      ...(target ? [{ itemType: 'action' as const, propertyName: 'goTo', tooltip: 'Go to layer' }] : []),
      { itemType: 'action', propertyName: 'next', tooltip: 'Next open note' },
      { itemType: 'action', propertyName: 'copy', tooltip: 'Copy summary' },
      { itemType: 'action', propertyName: 'copyAll', tooltip: 'Copy all on page' },
    ],
    ({ propertyName, propertyValue }) => {
      switch (propertyName) {
        case 'category': return setCategory(propertyValue as CategoryId)
        case 'status': return setStatus(propertyValue as StatusId)
        case 'pointer': return setPointer(propertyValue as PointerSide)
        case 'pinLength': return setPinLength(propertyValue as PinLength)
        case 'replies': return setShowReplies(!showReplies)
        case 'link': {
          const sel = figma.currentPage.selection[0]
          if (!sel) {
            figma.notify('Select a layer first, then click Link')
            return
          }
          return setTarget({ id: sel.id, name: sel.name })
        }
        case 'goTo': return target ? goToLayer(target.id) : undefined
        case 'next': return goToNextOpen(nodeId)
        case 'copy': return copyToClipboard(toMarkdown(current()))
        case 'copyAll': return copyToClipboard(toMarkdownAll(collectPage()))
      }
    },
  )

  const addReply = (value: string) => {
    const body = value.trim()
    if (!body || !figma.currentUser) return
    const reply: Reply = {
      id: `${Date.now()}`,
      author: { name: figma.currentUser.name, photoUrl: figma.currentUser.photoUrl },
      text: body,
      createdAt: Date.now(),
    }
    setReplies([...replies, reply])
    setReplyKey(replyKey + 1) // remount the input so it clears
  }

  const color = CATEGORIES[category].color
  const len = PIN_LENGTHS[pinLength]
  const horizontal = pointer === 'left' || pointer === 'right'
  const pinFirst = pointer === 'top' || pointer === 'left'

  const card = (
    <AutoLayout
      name="Card"
      direction="vertical"
      width={360}
      padding={{ vertical: 16, horizontal: 20 }}
      spacing={12}
      cornerRadius={8}
      fill="#FFFFFF"
      stroke={color}
      strokeWidth={2}
      effect={{ type: 'drop-shadow', color: '#00000026', offset: { x: 0, y: 4 }, blur: 12 }}
      opacity={status === 'resolved' ? 0.7 : 1}
    >
      <AutoLayout width="fill-parent" verticalAlignItems="center">
        <AutoLayout padding={{ vertical: 3, horizontal: 8 }} cornerRadius={3} fill={color}>
          <Text fill="#FFFFFF" fontSize={12} fontWeight={700}>
            {CATEGORIES[category].label}
          </Text>
        </AutoLayout>
        <AutoLayout width="fill-parent" height={1} />
        <SVG
          src={statusIcon(status)}
          tooltip={STATUSES[status].label}
          onClick={() => setStatus(status === 'resolved' ? 'open' : 'resolved')}
        />
      </AutoLayout>

      {editing || !text ? (
        <Input
          value={text}
          placeholder="Write a note... (**bold**, *italic*, `code`)"
          placeholderProps={{ fill: '#A0A7AE' }}
          onTextEditEnd={(e) => {
            setText(e.characters)
            setEditing(false)
          }}
          inputBehavior="multiline"
          width="fill-parent"
          fontSize={14}
          fill="#1F2933"
        />
      ) : (
        <AutoLayout width="fill-parent" tooltip="Click to edit" onClick={() => setEditing(true)}>
          <RichText text={text} />
        </AutoLayout>
      )}

      {target && (
        <AutoLayout
          padding={{ vertical: 3, horizontal: 8 }}
          cornerRadius={4}
          fill="#F1F3F5"
          tooltip="Go to layer"
          onClick={() => waitForTask(goToLayer(target.id))}
        >
          <Text fontSize={12} fill="#4B5563">{`↗ ${target.name}`}</Text>
        </AutoLayout>
      )}

      {author && (
        <AutoLayout spacing={6} verticalAlignItems="center">
          <Avatar author={author} size={30} />
          <Text fontSize={13} fontWeight={700} fill="#111111">{author.name}</Text>
          <Text fontSize={12} fill="#8A96A3">{formatTime(createdAt)}</Text>
        </AutoLayout>
      )}

      {showReplies && (
        <AutoLayout direction="vertical" width="fill-parent" spacing={10}>
          <Rectangle width="fill-parent" height={1} fill="#E6E9ED" />
          {replies.map((r) => (
            <AutoLayout key={r.id} spacing={8} width="fill-parent">
              <Avatar author={r.author} size={22} />
              <AutoLayout direction="vertical" spacing={2} width="fill-parent">
                <AutoLayout spacing={6}>
                  <Text fontSize={12} fontWeight={700} fill="#111111">{r.author.name}</Text>
                  <Text fontSize={11} fill="#8A96A3">{formatTime(r.createdAt)}</Text>
                </AutoLayout>
                <Text fontSize={13} fill="#1F2933" width="fill-parent">{r.text}</Text>
              </AutoLayout>
            </AutoLayout>
          ))}
          <Input
            key={replyKey}
            value=""
            placeholder="Reply..."
            placeholderProps={{ fill: '#A0A7AE' }}
            onTextEditEnd={(e) => addReply(e.characters)}
            width="fill-parent"
            fontSize={13}
          />
        </AutoLayout>
      )}
    </AutoLayout>
  )

  if (pointer === 'none') return card

  const dot = <Ellipse key="dot" name="Pin" width={14} height={14} fill={color} />
  const line = (
    <Rectangle key="line" name="Line" width={horizontal ? len : 2} height={horizontal ? 2 : len} fill={color} />
  )

  return (
    <AutoLayout
      direction={horizontal ? 'horizontal' : 'vertical'}
      horizontalAlignItems="center"
      verticalAlignItems="center"
      spacing={0}
    >
      {pinFirst ? [dot, line, card] : [card, line, dot]}
    </AutoLayout>
  )
}

widget.register(AnnotationWidget)
