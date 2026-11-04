import { AnnotationData, CATEGORIES, STATUSES } from './constants'

const pad = (n: number) => String(n).padStart(2, '0')

export function formatTime(ms: number): string {
  const d = new Date(ms)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

// Markdown that also pastes cleanly into a Jira description.
export function toMarkdown(a: AnnotationData): string {
  const lines = [`### [${CATEGORIES[a.category].label}] ${STATUSES[a.status].label}`]
  lines.push(a.text.trim() || '_(empty)_')
  if (a.target) lines.push(`Layer: ${a.target.name}`)
  if (a.author) lines.push(`_${a.author.name} · ${formatTime(a.createdAt)}_`)
  for (const r of a.replies) {
    lines.push('', `> **${r.author.name}** (${formatTime(r.createdAt)}): ${r.text.trim()}`)
  }
  return lines.join('\n')
}

export function toMarkdownAll(list: AnnotationData[]): string {
  return list.map(toMarkdown).join('\n\n---\n\n')
}
