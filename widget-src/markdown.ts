export interface Segment {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
}

// Inline-only Markdown: **bold**, *italic*, `code`. Anything unmatched stays literal.
const TOKEN = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`/g

export function parseInline(input: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of input.matchAll(TOKEN)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: input.slice(last, at) })
    if (m[1] !== undefined) out.push({ text: m[1], bold: true })
    else if (m[2] !== undefined) out.push({ text: m[2], italic: true })
    else out.push({ text: m[3], code: true })
    last = at + m[0].length
  }
  if (last < input.length) out.push({ text: input.slice(last) })
  return out
}
