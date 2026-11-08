export type PaperId = 'yellow' | 'pink' | 'blue' | 'green' | 'orange' | 'purple' | 'white'
export type TextureId = 'none' | 'grain' | 'lined' | 'grid' | 'dots'

export const PAPERS: Record<PaperId, { label: string; color: string }> = {
  yellow: { label: 'Yellow', color: '#FFF2A8' },
  pink: { label: 'Pink', color: '#FFD1DC' },
  blue: { label: 'Blue', color: '#CFE8FF' },
  green: { label: 'Green', color: '#D4F4C8' },
  orange: { label: 'Orange', color: '#FFDDB0' },
  purple: { label: 'Purple', color: '#E4D4FF' },
  white: { label: 'White', color: '#FFFFFF' },
}

export const TEXTURES: Record<TextureId, { label: string }> = {
  none: { label: 'Plain' },
  grain: { label: 'Grain' },
  lined: { label: 'Lined' },
  grid: { label: 'Grid' },
  dots: { label: 'Dots' },
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

// Minimal RGBA PNG encoder (zlib "stored" blocks, no compression). Tiles are tiny, so size is fine
// and it avoids needing canvas/zlib inside the widget sandbox.
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4
  const raw = new Uint8Array(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }

  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])]
  for (let i = 0; i < raw.length; i += 65535) {
    const part = raw.subarray(i, Math.min(i + 65535, raw.length))
    const head = new Uint8Array(5)
    head[0] = i + 65535 >= raw.length ? 1 : 0
    head[1] = part.length & 0xff
    head[2] = part.length >>> 8
    head[3] = ~part.length & 0xff
    head[4] = (~part.length >>> 8) & 0xff
    blocks.push(head, part)
  }
  const adler = new Uint8Array(4)
  new DataView(adler.buffer).setUint32(0, adler32(raw))
  blocks.push(adler)
  const idat = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0))
  let at = 0
  for (const b of blocks) {
    idat.set(b, at)
    at += b.length
  }

  const ihdr = new Uint8Array(13)
  const iv = new DataView(ihdr.buffer)
  iv.setUint32(0, width)
  iv.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA

  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  at = 0
  for (const p of parts) {
    png.set(p, at)
    at += p.length
  }
  return png
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// figma.base64Encode is not allowed while a widget renders, so encode by hand.
export function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? B64[n & 63] : '='
  }
  return out
}

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

// Darkness (0..1) of a texture at a pixel; the tile is painted as paper colour darkened by it.
const TILE: Record<Exclude<TextureId, 'none'>, { w: number; h: number; dark: (x: number, y: number) => number }> = {
  grain: {
    w: 64,
    h: 64,
    dark: (x, y) => {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
      return (n - Math.floor(n)) * 0.07
    },
  },
  lined: { w: 4, h: 28, dark: (_x, y) => (y === 27 ? 0.16 : 0) },
  grid: { w: 24, h: 24, dark: (x, y) => (x === 23 || y === 23 ? 0.1 : 0) },
  dots: { w: 20, h: 20, dark: (x, y) => (x >= 9 && x <= 10 && y >= 9 && y <= 10 ? 0.2 : 0) },
}

export function buildTile(bg: string, texture: Exclude<TextureId, 'none'>) {
  const { w, h, dark } = TILE[texture]
  const [r, g, b] = hexToRgb(bg)
  const rgba = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = 1 - dark(x, y)
      const i = (y * w + x) * 4
      rgba[i] = Math.round(r * k)
      rgba[i + 1] = Math.round(g * k)
      rgba[i + 2] = Math.round(b * k)
      rgba[i + 3] = 255
    }
  }
  return { width: w, height: h, rgba }
}
