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
import { base64, buildTile, encodePng, PaperId, PAPERS, TextureId, TEXTURES } from './paper'
import { parseInline } from './markdown'
import { formatTime, toMarkdown, toMarkdownAll } from './summary'

const { widget } = figma
const {
  AutoLayout,
  Ellipse,
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

const POINTER_OPTIONS = [
  ...(['top', 'bottom', 'left', 'right'] as const).flatMap((side) =>
    (['short', 'long'] as const).map((len) => ({
      option: `${side}:${len}`,
      label: `${POINTERS[side]} · ${len === 'short' ? 'Short' : 'Long'}`,
    })),
  ),
  { option: 'none', label: POINTERS.none },
]

const AVATAR_COLORS = ['#FF8A7A', '#7AB8FF', '#B58CFF', '#5FD0A5', '#F2B84B']
const colorFor = (name: string) =>
  AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length]

const STATUS_ICONS: Record<StatusId, string> = (() => {
  const body: Record<StatusId, string> = {
    open: '<circle cx="11" cy="11" r="10" fill="#fff" fill-opacity=".6" stroke="#000" stroke-opacity=".2" stroke-width="1.5"/>',
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
  const wrap = (inner: string) =>
    `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`
  return {
    open: wrap(body.open),
    progress: wrap(body.progress),
    resolved: wrap(body.resolved),
    na: wrap(body.na),
  }
})()

// 16px white line icons for the dark property-menu toolbar (icon-only keeps it narrow).
const icon = (path: string) =>
  `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${path}</svg>`
const ICONS = {
  texture: icon('<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 6h12M2 10h12M6 2v12M10 2v12"/>'),
  link: icon('<path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1"/>'),
  next: icon('<path d="M3 8h10M9 4l4 4-4 4"/>'),
  copy: icon('<rect x="5" y="5" width="8" height="9" rx="1"/><path d="M3 11V3h7"/>'),
}

function Avatar({ author, size }: { author: Author; size: number }) {
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

type PaperFill = string | WidgetJSX.ImagePaint
const fillCache = new Map<string, PaperFill>()
function paperFill(paper: PaperId, texture: TextureId): PaperFill {
  const color = PAPERS[paper].color
  if (texture === 'none') return color
  const key = `${paper}:${texture}`
  const cached = fillCache.get(key)
  if (cached) return cached
  const tile = buildTile(color, texture)
  const png = encodePng(tile.width, tile.height, tile.rgba)
  const fill: PaperFill = {
    type: 'image',
    src: `data:image/png;base64,${base64(png)}`,
    scaleMode: 'tile',
    scalingFactor: 1,
    imageSize: { width: tile.width, height: tile.height },
  }
  fillCache.set(key, fill)
  return fill
}

function copyToClipboard(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let finished = false
    const done = (ok: boolean) => {
      if (finished) return
      finished = true
      figma.notify(ok ? 'Copied' : 'Copy failed')
      figma.closePlugin()
      resolve()
    }
    figma.showUI(__html__, { visible: false })
    figma.ui.on('message', (msg: { type: string; ok?: boolean }) => {
      if (msg.type === 'ready') figma.ui.postMessage({ type: 'copy', text })
      if (msg.type === 'copied') done(!!msg.ok)
    })
    setTimeout(() => done(false), 5000)
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

// Notes to export: every selected annotation when several are selected, otherwise just this one.
function selectedNotes(): AnnotationData[] | null {
  const picked = figma.currentPage.selection.filter(
    (n): n is WidgetNode => n.type === 'WIDGET' && n.widgetId === figma.widgetId,
  )
  if (picked.length < 2) return null
  return picked
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
  const [paper, setPaper] = useSyncedState<PaperId>('paper', 'yellow')
  const [texture, setTexture] = useSyncedState<TextureId>('texture', 'none')
  const [showReplies, setShowReplies] = useSyncedState('showReplies', false)
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
      {
        itemType: 'dropdown',
        propertyName: 'pointer',
        tooltip: 'Pointer',
        selectedOption: pointer === 'none' ? 'none' : `${pointer}:${pinLength}`,
        options: POINTER_OPTIONS,
      },
      { itemType: 'dropdown', propertyName: 'paper', tooltip: 'Paper', selectedOption: paper, options: options(PAPERS) },
      { itemType: 'separator' },
      { itemType: 'action', propertyName: 'texture', tooltip: `Texture: ${TEXTURES[texture].label} (click to change)`, icon: ICONS.texture },
      { itemType: 'action', propertyName: 'link', tooltip: target ? 'Relink layer' : 'Link selected layer', icon: ICONS.link },
      { itemType: 'action', propertyName: 'next', tooltip: 'Next open note', icon: ICONS.next },
      { itemType: 'action', propertyName: 'copy', tooltip: 'Copy summary (select several notes to copy them all)', icon: ICONS.copy },
    ],
    ({ propertyName, propertyValue }) => {
      switch (propertyName) {
        case 'category': return setCategory(propertyValue as CategoryId)
        case 'pointer': {
          const [side, len] = (propertyValue as string).split(':')
          setPointer(side as PointerSide)
          if (len) setPinLength(len as PinLength)
          return
        }
        case 'paper': return setPaper(propertyValue as PaperId)
        case 'texture': {
          const order = Object.keys(TEXTURES) as TextureId[]
          return setTexture(order[(order.indexOf(texture) + 1) % order.length])
        }
        case 'link': {
          const sel = figma.currentPage.selection[0]
          if (!sel) {
            figma.notify('Select a layer first, then click Link')
            return
          }
          return setTarget({ id: sel.id, name: sel.name })
        }
        case 'next': return goToNextOpen(nodeId)
        case 'copy': {
          const many = selectedNotes()
          return copyToClipboard(many ? toMarkdownAll(many) : toMarkdown(current()))
        }
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
      key="card"
      name="Card"
      direction="vertical"
      width={360}
      padding={{ vertical: 16, horizontal: 20 }}
      spacing={12}
      cornerRadius={4}
      fill={paperFill(paper, texture)}
      effect={{ type: 'drop-shadow', color: '#00000033', offset: { x: 0, y: 3 }, blur: 6 }}
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
          src={STATUS_ICONS[status]}
          tooltip={`${STATUSES[status].label} (click to change)`}
          onClick={() => {
            const order = Object.keys(STATUSES) as StatusId[]
            setStatus(order[(order.indexOf(status) + 1) % order.length])
          }}
        />
      </AutoLayout>

      {editing || !text ? (
        <Input
          value={text}
          placeholder="Write a note... (**bold**, *italic*, `code`)"
          placeholderProps={{ fill: '#00000066' }}
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
          fill="#0000000F"
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
          <Text fontSize={12} fill="#00000080">{formatTime(createdAt)}</Text>
        </AutoLayout>
      )}

      <Text
        fontSize={12}
        fill="#00000099"
        textDecoration="underline"
        tooltip={showReplies ? 'Hide replies' : 'Show replies'}
        onClick={() => setShowReplies(!showReplies)}
      >
        {replies.length ? `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : 'Reply'}
      </Text>

      {showReplies && (
        <AutoLayout direction="vertical" width="fill-parent" spacing={10}>
          <Rectangle width="fill-parent" height={1} fill="#0000001A" />
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
