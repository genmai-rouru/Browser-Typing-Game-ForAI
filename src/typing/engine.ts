import { MAX_CHUNK_LENGTH, ROMAJI_TABLE } from './romajiTable.ts'

/**
 * ローマ字入力の判定エンジン。
 *
 * 「読み（ひらがな）」を先頭から順に消化していきます。各位置で
 * 「次に打てる綴りの候補（Candidate）」を作り、打鍵がどれかの候補の
 * 続きになっていれば正解、どれにも当てはまらなければミスとします。
 * 画面には依存しない純粋なロジックなので、単体テストで検証できます。
 */

/** 1 かたまり分の「かな」と、それを打った「ローマ字」。 */
export interface CandidatePart {
  kana: string
  romaji: string
}

/** ある位置から打てる綴りの候補。 */
export interface Candidate {
  /** この候補を打ち切るのに必要なローマ字。 */
  romaji: string
  /** この候補で消化されるかなの文字数。 */
  kanaLength: number
  /** 「っ」「ん」を後続とまとめた候補の場合、その内訳。 */
  parts: readonly CandidatePart[]
}

/** かなのかたまりごとの「好みの綴り」。例: { し: 'shi' } */
export type SpellingPrefs = Readonly<Record<string, string>>

const CONSONANT = /^[bcdfghjklmpqrstvwxyz]$/
/** 「ん」を n 1 つで打てない、後続の先頭文字（母音・な行・や行）。 */
const N_BLOCKERS = new Set(['a', 'i', 'u', 'e', 'o', 'n', 'y'])

/**
 * カタカナをひらがなに、英字を小文字にそろえます。
 * お題の読みに「ラーメン」と書かれていても「らーめん」として扱えます。
 */
export function normalizeKana(text: string): string {
  let result = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    // ァ(U+30A1)〜ヶ(U+30F6) は 0x60 引くと対応するひらがなになります。
    if (code >= 0x30a1 && code <= 0x30f6) {
      result += String.fromCodePoint(code - 0x60)
    } else {
      result += ch.toLowerCase()
    }
  }
  return result
}

function isAsciiTypeable(ch: string): boolean {
  return /^[a-z0-9 \-,.!?'/]$/.test(ch)
}

/** 表の綴りを、好みの綴りが先頭に来るように並べ替えます。 */
function spellingsFor(chunk: string, prefs: SpellingPrefs): readonly string[] {
  const list = ROMAJI_TABLE[chunk]
  if (!list) return []
  const preferred = prefs[chunk]
  if (!preferred || preferred === list[0] || !list.includes(preferred)) {
    return list
  }
  return [preferred, ...list.filter((r) => r !== preferred)]
}

/**
 * kana の pos 文字目から打てる候補を、ガイド表示の優先順で返します。
 * 先頭の候補が「標準の綴り」です。
 */
export function candidatesAt(
  kana: string,
  pos: number,
  prefs: SpellingPrefs = {},
): Candidate[] {
  if (pos >= kana.length) return []
  const head = kana[pos]
  const result: Candidate[] = []

  if (head === 'っ' || head === 'ん') {
    // 後続のかたまりと組み合わせる綴り（kka / nka など）。
    const nextCandidates = candidatesAt(kana, pos + 1, prefs)
    for (const next of nextCandidates) {
      const first = next.romaji[0]
      if (head === 'っ') {
        // 子音を重ねて打つ。「っん」は nn と区別できないため n は除外します。
        if (!CONSONANT.test(first) || first === 'n') continue
        result.push(combine(head, first, next))
        // 「っち」は tchi でも打てます。
        if (next.romaji.startsWith('ch')) result.push(combine(head, 't', next))
      } else {
        // 母音・な行・や行の前では n 1 つだと別の文字になるため不可。
        if (N_BLOCKERS.has(first)) continue
        result.push(combine(head, 'n', next))
      }
    }
  }

  // 表にあるかたまりを、長いもの（拗音など）から順に探します。
  for (let len = Math.min(MAX_CHUNK_LENGTH, kana.length - pos); len >= 1; len--) {
    const chunk = kana.slice(pos, pos + len)
    for (const romaji of spellingsFor(chunk, prefs)) {
      result.push({ romaji, kanaLength: len, parts: [{ kana: chunk, romaji }] })
    }
  }

  // 表にない半角英数字・記号は、そのまま打つものとして扱います。
  if (result.length === 0 && isAsciiTypeable(head)) {
    result.push({ romaji: head, kanaLength: 1, parts: [{ kana: head, romaji: head }] })
  }
  return result
}

function combine(head: string, prefix: string, next: Candidate): Candidate {
  return {
    romaji: prefix + next.romaji,
    kanaLength: 1 + next.kanaLength,
    parts: [{ kana: head, romaji: prefix }, ...next.parts],
  }
}

/** 読みの中に、打てない文字が含まれていないかを調べます（お題データの検証用）。 */
export function findUntypeable(kanaText: string): string | null {
  const kana = normalizeKana(kanaText)
  let pos = 0
  while (pos < kana.length) {
    const candidates = candidatesAt(kana, pos)
    if (candidates.length === 0) return kana[pos]
    pos += candidates[0].kanaLength
  }
  return null
}

/** 標準の綴りで打った場合のローマ字全体を返します。 */
export function defaultRomaji(kanaText: string, prefs: SpellingPrefs = {}): string {
  return new TypingSession(kanaText, prefs).guide().rest
}

export interface InputResult {
  /** 正しい打鍵だったか。 */
  ok: boolean
  /** この打鍵でかなのかたまりが確定したか。 */
  committed: boolean
  /** この打鍵でお題を打ち終えたか。 */
  finished: boolean
}

export interface Guide {
  /** すでに打ったローマ字。 */
  typed: string
  /** これから打つローマ字（今の打ち方に合わせて変化します）。 */
  rest: string
}

/** 1 つのお題に対する入力の進行状況。 */
export class TypingSession {
  readonly kana: string
  private readonly prefs: SpellingPrefs
  private pos = 0
  /** 確定済みのローマ字。 */
  private typedRomaji = ''
  /** いま打っている途中のかたまりのローマ字。 */
  private buffer = ''
  private current: Candidate[]
  private misses = 0
  /** このお題の中で実際に使われた綴り（好みの学習用）。 */
  private readonly used: Record<string, string> = {}

  constructor(kanaText: string, prefs: SpellingPrefs = {}) {
    this.kana = normalizeKana(kanaText)
    this.prefs = prefs
    this.current = candidatesAt(this.kana, 0, prefs)
  }

  /** 1 文字（1 打鍵）を入力します。 */
  input(char: string): InputResult {
    if (this.finished) return { ok: false, committed: false, finished: true }
    const next = this.buffer + char.toLowerCase()
    const matching = this.current.filter((c) => c.romaji.startsWith(next))
    if (matching.length === 0) {
      this.misses++
      return { ok: false, committed: false, finished: false }
    }

    this.buffer = next
    this.current = matching
    const done = matching.find((c) => c.romaji === next)
    if (!done) return { ok: true, committed: false, finished: false }

    // かたまりが確定。使われた綴りを記録して次の位置へ進みます。
    for (const part of done.parts) {
      if (ROMAJI_TABLE[part.kana]?.includes(part.romaji)) {
        this.used[part.kana] = part.romaji
      }
    }
    this.typedRomaji += next
    this.buffer = ''
    this.pos += done.kanaLength
    this.current = candidatesAt(this.kana, this.pos, this.prefs)
    return { ok: true, committed: true, finished: this.finished }
  }

  get finished(): boolean {
    return this.pos >= this.kana.length
  }

  /** 確定済みのかなの文字数。 */
  get kanaPosition(): number {
    return this.pos
  }

  get missCount(): number {
    return this.misses
  }

  /** 正しく打った打鍵の数。 */
  get typedCount(): number {
    return this.typedRomaji.length + this.buffer.length
  }

  /** 次に打てるキーの一覧（重複なし）。 */
  nextKeys(): string[] {
    const keys = new Set<string>()
    for (const c of this.current) keys.add(c.romaji[this.buffer.length])
    return [...keys]
  }

  /** このお題で使われた綴り。SpellingPrefs にそのまま統合できます。 */
  usedSpellings(): Readonly<Record<string, string>> {
    return this.used
  }

  /** ローマ字ガイド。打っている途中の綴りに合わせて続きを組み立てます。 */
  guide(): Guide {
    const typed = this.typedRomaji + this.buffer
    if (this.finished) return { typed, rest: '' }

    let rest = ''
    let pos = this.pos
    // いま打っているかたまりは、途中まで一致している候補の先頭を採用します。
    const active = this.current[0]
    if (!active) return { typed, rest }
    rest += active.romaji.slice(this.buffer.length)
    pos += active.kanaLength
    // 以降は標準の綴りで埋めます。
    while (pos < this.kana.length) {
      const first = candidatesAt(this.kana, pos, this.prefs)[0]
      if (!first) break
      rest += first.romaji
      pos += first.kanaLength
    }
    return { typed, rest }
  }
}
