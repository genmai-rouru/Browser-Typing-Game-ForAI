import { describe, expect, it } from 'vitest'
import { defaultRomaji, findUntypeable, TypingSession } from '../../typing/engine.ts'
import { GENRE_IDS } from '../genres.ts'
import type { PromptKind } from '../types.ts'
import { BASIC_TEXTS } from './basic.ts'
import { TEXTS } from './index.ts'

const KINDS: PromptKind[] = ['word', 'sentence', 'short', 'long']

/** 区分ごとの、標準の綴りで打ったときの打鍵数の許容範囲。 */
const LENGTH_RANGE: Record<PromptKind, [number, number]> = {
  word: [3, 20],
  sentence: [20, 50],
  short: [40, 70],
  long: [70, 95],
}

describe('お題データ', () => {
  for (const genre of GENRE_IDS) {
    for (const kind of KINDS) {
      it(`${genre} / ${kind}: 読みがすべて打てて、長さが区分に合っている`, () => {
        const list = TEXTS[genre][kind]
        expect(list.length).toBeGreaterThanOrEqual(3)
        const [min, max] = LENGTH_RANGE[kind]
        for (const entry of list) {
          expect(findUntypeable(entry.kana), entry.text).toBeNull()
          const romaji = defaultRomaji(entry.kana)
          expect(romaji.length, `${entry.text} (${romaji.length})`).toBeGreaterThanOrEqual(min)
          expect(romaji.length, `${entry.text} (${romaji.length})`).toBeLessThanOrEqual(max)
          const session = new TypingSession(entry.kana)
          for (const ch of romaji) expect(session.input(ch).ok, entry.text).toBe(true)
          expect(session.finished, entry.text).toBe(true)
        }
      })
    }
  }

  it('通常攻撃用のお題がすべて打てる', () => {
    expect(BASIC_TEXTS.length).toBeGreaterThanOrEqual(5)
    for (const entry of BASIC_TEXTS) expect(findUntypeable(entry.kana), entry.text).toBeNull()
  })

  it('同じ表記のお題が重複していない', () => {
    const seen = new Set<string>()
    for (const genre of GENRE_IDS) {
      for (const kind of KINDS) {
        for (const entry of TEXTS[genre][kind]) {
          expect(seen.has(entry.text), entry.text).toBe(false)
          seen.add(entry.text)
        }
      }
    }
  })
})
