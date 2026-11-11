import type { TextEntry } from '../types.ts'

/** [表記, 読み] の組を TextEntry に変換します。 */
export function entries(list: ReadonlyArray<readonly [string, string]>): TextEntry[] {
  return list.map(([text, kana]) => ({ text, kana }))
}
