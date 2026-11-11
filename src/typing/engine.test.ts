import { describe, expect, it } from 'vitest'
import {
  candidatesAt,
  defaultRomaji,
  findUntypeable,
  normalizeKana,
  TypingSession,
} from './engine.ts'
import { ROMAJI_TABLE } from './romajiTable.ts'

/** romaji を順に打ち、すべて正解でお題を打ち切れたら true。 */
function accepts(kana: string, romaji: string): boolean {
  const session = new TypingSession(kana)
  for (const ch of romaji) {
    if (!session.input(ch).ok) return false
  }
  return session.finished
}

describe('基本の入力', () => {
  it('標準の綴りで打ち切れる', () => {
    expect(accepts('さくら', 'sakura')).toBe(true)
    expect(accepts('きょうかしょ', 'kyoukasyo')).toBe(true)
  })

  it('間違ったキーはミスになり、進行しない', () => {
    const s = new TypingSession('さくら')
    expect(s.input('s').ok).toBe(true)
    expect(s.input('x').ok).toBe(false)
    expect(s.missCount).toBe(1)
    expect(s.typedCount).toBe(1)
    expect(s.input('a').ok).toBe(true)
    expect(s.kanaPosition).toBe(1)
  })

  it('大文字で打っても受け付ける', () => {
    expect(accepts('さくら', 'SAKURA')).toBe(true)
  })

  it('打ち終えたあとの入力は受け付けない', () => {
    const s = new TypingSession('あ')
    expect(s.input('a')).toEqual({ ok: true, committed: true, finished: true })
    expect(s.input('a').ok).toBe(false)
  })
})

describe('綴りのゆらぎ', () => {
  it('く は ku / cu / qu のどれでも打てる', () => {
    expect(accepts('くるま', 'kuruma')).toBe(true)
    expect(accepts('くるま', 'curuma')).toBe(true)
    expect(accepts('くるま', 'quruma')).toBe(true)
  })

  it('か・こ・せ は c でも打てる', () => {
    expect(accepts('かこ', 'caco')).toBe(true)
    expect(accepts('せかい', 'cecai')).toBe(true)
  })

  it('し・ち・つ・ふ・じ の別綴り', () => {
    expect(accepts('しちつふじ', 'sitituhuzi')).toBe(true)
    expect(accepts('しちつふじ', 'shichitsufuji')).toBe(true)
    expect(accepts('し', 'ci')).toBe(true)
  })

  it('拗音の別綴り', () => {
    expect(accepts('しゃしゅしょ', 'syasyusyo')).toBe(true)
    expect(accepts('しゃしゅしょ', 'shashusho')).toBe(true)
    expect(accepts('ちゃちゅちょ', 'tyatyutyo')).toBe(true)
    expect(accepts('ちゃちゅちょ', 'chachucho')).toBe(true)
    expect(accepts('ちゃちゅちょ', 'cyacyucyo')).toBe(true)
    expect(accepts('じゃじゅじょ', 'zyazyuzyo')).toBe(true)
    expect(accepts('じゃじゅじょ', 'jajujo')).toBe(true)
    expect(accepts('じゃじゅじょ', 'jyajyujyo')).toBe(true)
  })

  it('拗音は 1 文字ずつ分けても打てる', () => {
    expect(accepts('きゃ', 'kilya')).toBe(true)
    expect(accepts('しょ', 'sixyo')).toBe(true)
    expect(accepts('しょ', 'shilyo')).toBe(true)
  })

  it('外来音', () => {
    expect(accepts('ふぁいる', 'fairu')).toBe(true)
    expect(accepts('ふぁいる', 'hulairu')).toBe(true)
    expect(accepts('てぃらみす', 'thiramisu')).toBe(true)
    expect(accepts('てぃらみす', 'texiramisu')).toBe(true)
    expect(accepts('ぴっつぁ', 'pittsa')).toBe(true)
    expect(accepts('くぁ', 'qa')).toBe(true)
    expect(accepts('くぁ', 'kwa')).toBe(true)
    expect(accepts('うぃ', 'wi')).toBe(true)
    expect(accepts('ゔぁ', 'va')).toBe(true)
  })

  it('長音記号はハイフンで打つ', () => {
    expect(accepts('らーめん', 'ra-menn')).toBe(true)
  })
})

describe('促音「っ」', () => {
  it('次の子音を重ねて打てる', () => {
    expect(accepts('がっこう', 'gakkou')).toBe(true)
    expect(accepts('きって', 'kitte')).toBe(true)
    expect(accepts('ざっし', 'zasshi')).toBe(true)
    expect(accepts('ざっし', 'zassi')).toBe(true)
  })

  it('別綴りの子音でも重ねられる', () => {
    expect(accepts('がっこう', 'gaccou')).toBe(true)
    expect(accepts('そっくり', 'soqquri')).toBe(true)
    expect(accepts('まっちゃ', 'maccha')).toBe(true)
    expect(accepts('まっちゃ', 'mattya')).toBe(true)
    expect(accepts('まっちゃ', 'matcha')).toBe(true)
  })

  it('単独で ltu / xtu / ltsu と打てる', () => {
    expect(accepts('がっこう', 'galtukou')).toBe(true)
    expect(accepts('がっこう', 'gaxtukou')).toBe(true)
    expect(accepts('がっこう', 'galtsukou')).toBe(true)
  })

  it('文末の「っ」は単独で打つ', () => {
    expect(accepts('あっ', 'altu')).toBe(true)
    expect(accepts('あっ', 'axtu')).toBe(true)
  })

  it('母音・な行の前では重ねられない', () => {
    expect(accepts('あっあ', 'aaa')).toBe(false)
    expect(accepts('あっな', 'anna')).toBe(false)
    expect(accepts('あっな', 'altuna')).toBe(true)
  })

  it('「っ」が連続しても打てる', () => {
    expect(accepts('あっっか', 'akkka')).toBe(true)
  })
})

describe('撥音「ん」', () => {
  it('子音の前では n 1 つで打てる', () => {
    expect(accepts('しんぶん', 'sinbunn')).toBe(true)
    expect(accepts('かんじ', 'kanji')).toBe(true)
    expect(accepts('さんぽ', 'sanpo')).toBe(true)
  })

  it('nn / xn でも打てる', () => {
    expect(accepts('かんじ', 'kannji')).toBe(true)
    expect(accepts('かんじ', 'kaxnji')).toBe(true)
    expect(accepts('しんぶん', 'shinnbunn')).toBe(true)
  })

  it('文末の「ん」は nn が必要', () => {
    expect(accepts('ほん', 'hon')).toBe(false)
    expect(accepts('ほん', 'honn')).toBe(true)
    expect(accepts('ほん', 'hoxn')).toBe(true)
  })

  it('母音・な行・や行の前では nn が必要', () => {
    expect(accepts('きんえん', 'kinenn')).toBe(false)
    expect(accepts('きんえん', 'kinnenn')).toBe(true)
    expect(accepts('こんにちは', 'konnnitiha')).toBe(true)
    expect(accepts('こんにちは', 'konnitiha')).toBe(false)
    expect(accepts('こんや', 'konnya')).toBe(true)
    expect(accepts('こんや', 'konya')).toBe(false)
  })

  it('「ん」の後ろの別綴り・促音・長音とも組み合わせられる', () => {
    expect(accepts('けんこう', 'kencou')).toBe(true)
    expect(accepts('あんっか', 'ankka')).toBe(true)
    expect(accepts('んー', 'n-')).toBe(true)
    expect(accepts('しんしゃ', 'shinsha')).toBe(true)
  })
})

describe('ガイド表示', () => {
  it('標準の綴りを表示する', () => {
    expect(defaultRomaji('がっこう')).toBe('gakkou')
    expect(defaultRomaji('しんぶん')).toBe('sinbunn')
    expect(defaultRomaji('きんえん')).toBe('kinnenn')
    expect(defaultRomaji('きょうしつ')).toBe('kyousitu')
  })

  it('打っている綴りに合わせて続きが変わる', () => {
    const s = new TypingSession('しゃかい')
    expect(s.guide()).toEqual({ typed: '', rest: 'syakai' })
    s.input('s')
    s.input('h')
    expect(s.guide()).toEqual({ typed: 'sh', rest: 'akai' })
    s.input('a')
    s.input('c')
    expect(s.guide()).toEqual({ typed: 'shac', rest: 'ai' })
  })

  it('nextKeys は次に打てるキーをすべて返す', () => {
    const s = new TypingSession('くじ')
    expect(s.nextKeys().sort()).toEqual(['c', 'k', 'q'])
    s.input('q')
    expect(s.nextKeys()).toEqual(['u'])
    s.input('u')
    expect(s.nextKeys().sort()).toEqual(['j', 'z'])
  })

  it('好みの綴りをガイドの初期表示に反映する', () => {
    const prefs = { し: 'shi', く: 'cu', じゃ: 'ja' }
    expect(defaultRomaji('しかく', prefs)).toBe('shikacu')
    expect(defaultRomaji('じゃっく', prefs)).toBe('jaccu')
  })

  it('使った綴りを記録する', () => {
    const s = new TypingSession('しんかんせん')
    for (const ch of 'shincansenn') s.input(ch)
    expect(s.finished).toBe(true)
    expect(s.usedSpellings()).toMatchObject({ し: 'shi', か: 'ca', せ: 'se', ん: 'nn' })
  })
})

describe('かなの正規化と検証', () => {
  it('カタカナはひらがなとして扱う', () => {
    expect(normalizeKana('ラーメン')).toBe('らーめん')
    expect(normalizeKana('ヴァイオリン')).toBe('ゔぁいおりん')
    expect(accepts('チョコレート', 'chokore-to')).toBe(true)
  })

  it('打てない文字を見つける', () => {
    expect(findUntypeable('こくばん')).toBeNull()
    expect(findUntypeable('黒板')).toBe('黒')
  })
})

describe('表全体の性質', () => {
  const chunks = Object.keys(ROMAJI_TABLE)

  it('表のすべての綴りで、そのかなを打ち切れる', () => {
    for (const chunk of chunks) {
      for (const romaji of ROMAJI_TABLE[chunk]) {
        expect(accepts(chunk, romaji), `${chunk} = ${romaji}`).toBe(true)
      }
    }
  })

  it('同じ位置の候補どうしで、一方が他方の途中で確定してしまうことがない', () => {
    // 例: 「si」で確定する候補と「sixx」まで続く候補が同居すると、後者が打てなくなる。
    const samples = chunks.flatMap((a) => [a, `っ${a}`, `ん${a}`, `${a}ゃ`, `${a}ぁ`])
    for (const kana of samples) {
      const list = candidatesAt(kana, 0)
      for (const a of list) {
        for (const b of list) {
          if (a.romaji !== b.romaji) {
            expect(b.romaji.startsWith(a.romaji), `${kana}: ${a.romaji} / ${b.romaji}`).toBe(false)
          }
        }
      }
    }
  })

  it('ランダムなかな列でも、ガイドどおりに打てば必ず打ち切れる', () => {
    let seed = 12345
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const singles = chunks.filter((c) => c.length === 1 && /[ぁ-ゖー]/.test(c))
    for (let i = 0; i < 500; i++) {
      let kana = ''
      const len = 1 + Math.floor(rand() * 12)
      for (let j = 0; j < len; j++) kana += singles[Math.floor(rand() * singles.length)]
      const s = new TypingSession(kana)
      let guard = 0
      while (!s.finished && guard++ < 200) {
        const { rest } = s.guide()
        expect(rest.length, kana).toBeGreaterThan(0)
        expect(s.input(rest[0]).ok, `${kana} @ ${s.guide().typed}`).toBe(true)
      }
      expect(s.finished, kana).toBe(true)
      // 毎回ランダムに「打てるキー」を選んでも打ち切れる。
      const t = new TypingSession(kana)
      guard = 0
      while (!t.finished && guard++ < 400) {
        const keys = t.nextKeys()
        expect(keys.length, kana).toBeGreaterThan(0)
        expect(t.input(keys[Math.floor(rand() * keys.length)]).ok, kana).toBe(true)
      }
      expect(t.finished, kana).toBe(true)
    }
  })
})
