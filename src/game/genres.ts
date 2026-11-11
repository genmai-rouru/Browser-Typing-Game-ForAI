import type { GenreId } from './types.ts'

export interface GenreInfo {
  id: GenreId
  name: string
  /** ジャンルを表す 1 文字。 */
  glyph: string
  /** 戦闘中にこのジャンルへ直接切り替える数字キー。 */
  hotkey: string
}

export const GENRES: readonly GenreInfo[] = [
  { id: 'school', name: '学校', glyph: '学', hotkey: '1' },
  { id: 'society', name: '社会', glyph: '社', hotkey: '2' },
  { id: 'nature', name: '自然', glyph: '森', hotkey: '3' },
  { id: 'food', name: '食', glyph: '食', hotkey: '4' },
]

export const GENRE_IDS: readonly GenreId[] = GENRES.map((g) => g.id)

export function genreInfo(id: GenreId): GenreInfo {
  return GENRES.find((g) => g.id === id)!
}
