import { describe, expect, it } from 'vitest'
import { AnnotationData } from '../widget-src/constants'
import { formatTime, toMarkdown, toMarkdownAll } from '../widget-src/summary'

const base: AnnotationData = {
  category: 'fix',
  status: 'open',
  text: 'Button padding is off',
  author: { name: 'Erik', photoUrl: null },
  createdAt: new Date(2026, 9, 30, 10, 25, 33).getTime(),
  replies: [],
}

describe('summary', () => {
  it('formats time as YYYY-MM-DD HH:mm:ss', () => {
    expect(formatTime(base.createdAt)).toBe('2026-10-30 10:25:33')
  })

  it('renders category, status, text and author', () => {
    expect(toMarkdown(base)).toBe(
      '### [Fix / Bug] Open\nButton padding is off\n_Erik · 2026-10-30 10:25:33_',
    )
  })

  it('appends replies as blockquotes', () => {
    const md = toMarkdown({
      ...base,
      replies: [{ id: '1', author: { name: 'Sazia', photoUrl: null }, text: 'Fixed', createdAt: base.createdAt }],
    })
    expect(md).toContain('> **Sazia** (2026-10-30 10:25:33): Fixed')
  })

  it('includes the linked layer name', () => {
    expect(toMarkdown({ ...base, target: { id: '1:2', name: 'Button/Primary' } })).toContain(
      'Layer: Button/Primary',
    )
  })

  it('marks empty text', () => {
    expect(toMarkdown({ ...base, text: '  ' })).toContain('_(empty)_')
  })

  it('joins several annotations with a divider', () => {
    expect(toMarkdownAll([base, base])).toContain('\n\n---\n\n')
  })
})
