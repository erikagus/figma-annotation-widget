import { describe, expect, it } from 'vitest'
import { parseInline } from '../widget-src/markdown'

describe('parseInline', () => {
  it('returns plain text as one segment', () => {
    expect(parseInline('hello')).toEqual([{ text: 'hello' }])
  })

  it('parses bold, italic and code', () => {
    expect(parseInline('a **b** *c* `d` e')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', code: true },
      { text: ' e' },
    ])
  })

  it('keeps newlines and unmatched markers as text', () => {
    expect(parseInline('line1\n**open')).toEqual([{ text: 'line1\n**open' }])
  })

  it('returns no segments for empty text', () => {
    expect(parseInline('')).toEqual([])
  })
})
