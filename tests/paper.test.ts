import { describe, expect, it } from 'vitest'
import { adler32, base64, buildTile, crc32, encodePng, PAPERS, TextureId, TEXTURES } from '../widget-src/paper'

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)))

describe('checksums', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926)
  })
  it('adler32 matches a known value', () => {
    expect(adler32(ascii('Wikipedia'))).toBe(0x11e60398)
  })
})

describe('base64', () => {
  it('encodes with and without padding', () => {
    expect(base64(ascii('Man'))).toBe('TWFu')
    expect(base64(ascii('Ma'))).toBe('TWE=')
    expect(base64(ascii('M'))).toBe('TQ==')
    expect(base64(new Uint8Array(0))).toBe('')
  })
})

describe('encodePng', () => {
  it('writes a PNG signature and the right dimensions', () => {
    const png = encodePng(3, 2, new Uint8Array(3 * 2 * 4))
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const view = new DataView(png.buffer)
    expect(view.getUint32(16)).toBe(3)
    expect(view.getUint32(20)).toBe(2)
  })
})

describe('buildTile', () => {
  it('has w*h*4 bytes for every texture', () => {
    for (const t of Object.keys(TEXTURES)) {
      if (t === 'none') continue
      const tile = buildTile('#FFF2A8', t as Exclude<TextureId, 'none'>)
      expect(tile.rgba.length).toBe(tile.width * tile.height * 4)
    }
  })
  it('keeps the paper colour opaque', () => {
    const tile = buildTile('#FFF2A8', 'grain')
    expect(tile.rgba[3]).toBe(255)
  })
  it('ships several paper colours', () => {
    expect(Object.keys(PAPERS).length).toBeGreaterThanOrEqual(6)
  })
})
