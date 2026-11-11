import { TypingSession, type SpellingPrefs } from '../typing/engine.ts'
import {
  BATTLE_TIME_MS,
  COMPLETE_FACTOR,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  GAUGE_MAX,
  GAUGE_ON_COMPLETE,
  GAUGE_PER_BAR,
  MODE_STROKE_MULTIPLIER,
  NO_MISS_MULTIPLIER,
  RESIST_MULTIPLIER,
  RUNE_CHAIN_BONUS,
  RUNE_CHARGE_BONUS,
  RUNE_CRIT_BONUS,
  SKILL_BURST_FACTOR,
  ULTIMATE_BURST_FACTOR,
  WEAK_MULTIPLIER,
  comboMultiplier,
  keyMultiplier,
  masteryMultiplier,
} from './balance.ts'
import { phaseIndex } from './enemies.ts'
import { GENRE_IDS } from './genres.ts'
import { TEXTS } from './texts/index.ts'
import type { EnemyDef, EnemyPhase, GenreId, PromptKind, RuneType, TextEntry } from './types.ts'

/**
 * 1 戦ぶんの進行を管理します。画面（React）には依存しません。
 * 時刻は呼び出し側から渡すので、テストでは好きな時刻を与えて検証できます。
 */

/** 大技の種類。skill = 大技（短文）、ultimate = 奥義（長文）。 */
export type BigMove = 'skill' | 'ultimate'
export type Mode = 'normal' | BigMove
export type Affinity = 'weak' | 'resist' | 'normal'
export type BattleStatus = 'ready' | 'running' | 'won' | 'timeup'

/** 戦闘に持ち込むプレイヤーの能力。 */
export interface Loadout {
  attack: number
  keyLevels: Readonly<Record<string, number>>
  runeByKey: Readonly<Record<string, RuneType>>
  masteryLevels: Readonly<Record<GenreId, number>>
  prefs: SpellingPrefs
}

export interface Prompt {
  entry: TextEntry
  kind: PromptKind
  mode: Mode
  genre: GenreId
  session: TypingSession
}

/** 画面演出のために戦闘から通知する出来事。 */
export type BattleEvent =
  | { type: 'hit'; amount: number; crit: boolean; affinity: Affinity; key: string }
  | { type: 'burst'; amount: number; mode: Mode; noMiss: boolean; affinity: Affinity }
  | { type: 'miss' }
  | { type: 'phase'; phase: EnemyPhase }
  | { type: 'genre'; genre: GenreId }
  | { type: 'bigMove'; mode: BigMove }
  | { type: 'end'; status: 'won' | 'timeup'; finisher: boolean }

export interface BattleStats {
  strokes: number
  misses: number
  damage: number
  maxCombo: number
  crits: number
  promptsCompleted: number
  bigMovesCompleted: number
  genreStrokes: Record<GenreId, number>
  keyStrokes: Record<string, number>
  /** 実際に使われた綴り（ガイドの好み学習用）。 */
  spellings: Record<string, string>
}

const NORMAL_KINDS: ReadonlyArray<readonly [PromptKind, number]> = [
  ['word', 0.45],
  ['sentence', 0.35],
  ['short', 0.2],
]

export class Battle {
  readonly enemy: EnemyDef
  readonly stage: number
  readonly maxHp: number
  hp: number
  status: BattleStatus = 'ready'
  timeLeftMs = BATTLE_TIME_MS
  genre: GenreId
  mode: Mode = 'normal'
  combo = 0
  gauge = 0
  /** とどめを大技・奥義の最中に刺したか。 */
  finisher = false
  prompt: Prompt
  next: { entry: TextEntry; kind: PromptKind }
  readonly stats: BattleStats

  private readonly loadout: Loadout
  private readonly rng: () => number
  private startedAt = 0
  private promptMissed = false
  private readonly recent = new Set<string>()
  private events: BattleEvent[] = []

  constructor(
    enemy: EnemyDef,
    stage: number,
    loadout: Loadout,
    genre: GenreId,
    rng: () => number = Math.random,
  ) {
    this.enemy = enemy
    this.stage = stage
    this.maxHp = enemy.hp
    this.hp = enemy.hp
    this.loadout = loadout
    this.genre = genre
    this.rng = rng
    this.stats = {
      strokes: 0,
      misses: 0,
      damage: 0,
      maxCombo: 0,
      crits: 0,
      promptsCompleted: 0,
      bigMovesCompleted: 0,
      genreStrokes: Object.fromEntries(GENRE_IDS.map((g) => [g, 0])) as Record<GenreId, number>,
      keyStrokes: {},
      spellings: {},
    }
    this.prompt = this.makePrompt(this.rollNormal(), 'normal')
    this.next = this.rollNormal()
  }

  // ---- 参照用 ----

  get phase(): EnemyPhase {
    return this.enemy.phases[phaseIndex(this.enemy, this.hp, this.maxHp)]
  }

  affinityOf(genre: GenreId): Affinity {
    const phase = this.phase
    if (phase.weak === genre) return 'weak'
    if (phase.resist === genre) return 'resist'
    return 'normal'
  }

  canUse(move: BigMove): boolean {
    if (this.status !== 'running' || this.mode !== 'normal') return false
    return this.gauge >= (move === 'skill' ? GAUGE_PER_BAR : GAUGE_MAX)
  }

  get elapsedMs(): number {
    return BATTLE_TIME_MS - this.timeLeftMs
  }

  /** たまった出来事を取り出します（取り出すと空になります）。 */
  drainEvents(): BattleEvent[] {
    const list = this.events
    this.events = []
    return list
  }

  // ---- 進行 ----

  start(now: number): void {
    if (this.status !== 'ready') return
    this.status = 'running'
    this.startedAt = now
  }

  /** 残り時間を更新します。毎フレーム呼び出してください。 */
  tick(now: number): void {
    if (this.status !== 'running') return
    this.timeLeftMs = Math.max(0, BATTLE_TIME_MS - (now - this.startedAt))
    if (this.timeLeftMs <= 0) {
      this.status = 'timeup'
      this.collectSpellings()
      this.events.push({ type: 'end', status: 'timeup', finisher: false })
    }
  }

  /** 1 打鍵を処理します。 */
  type(char: string, now: number): void {
    this.tick(now)
    if (this.status !== 'running') return

    const key = char.toLowerCase()
    const session = this.prompt.session
    const result = session.input(key)
    if (!result.ok) {
      this.stats.misses++
      this.combo = 0
      this.promptMissed = true
      this.events.push({ type: 'miss' })
      return
    }

    const rune = this.loadout.runeByKey[key]
    this.combo += 1 + (rune === 'chain' ? RUNE_CHAIN_BONUS : 0)
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo)
    this.stats.strokes++
    this.stats.genreStrokes[this.prompt.genre]++
    this.stats.keyStrokes[key] = (this.stats.keyStrokes[key] ?? 0) + 1
    if (this.mode === 'normal') {
      this.addGauge(1 + (rune === 'charge' ? RUNE_CHARGE_BONUS : 0))
    }

    // --- 1 打鍵ごとのダメージ ---
    const affinity = this.affinityOf(this.prompt.genre)
    const crit = this.rng() < CRIT_CHANCE + (rune === 'crit' ? RUNE_CRIT_BONUS : 0)
    if (crit) this.stats.crits++
    const amount = Math.max(
      1,
      Math.round(
        this.loadout.attack *
          keyMultiplier(this.loadout.keyLevels[key] ?? 0) *
          comboMultiplier(this.combo) *
          this.genreMultiplier(affinity) *
          MODE_STROKE_MULTIPLIER[this.mode] *
          (crit ? CRIT_MULTIPLIER : 1),
      ),
    )
    this.events.push({ type: 'hit', amount, crit, affinity, key })
    if (this.dealDamage(amount)) return

    // --- お題を打ち切ったときの追撃 ---
    if (result.finished) this.completePrompt()
  }

  /** お題のジャンルを切り替えます。打ちかけのお題は捨てて、新しいお題になります。 */
  switchGenre(genre: GenreId): boolean {
    if (this.status !== 'running' && this.status !== 'ready') return false
    if (this.mode !== 'normal' || genre === this.genre) return false
    this.collectSpellings()
    this.genre = genre
    this.prompt = this.makePrompt(this.rollNormal(), 'normal')
    this.next = this.rollNormal()
    this.promptMissed = false
    this.events.push({ type: 'genre', genre })
    return true
  }

  /** いまのジャンルから dir（+1 / -1）方向の隣のジャンルに切り替えます。 */
  cycleGenre(dir: 1 | -1): boolean {
    const index = GENRE_IDS.indexOf(this.genre)
    const next = GENRE_IDS[(index + dir + GENRE_IDS.length) % GENRE_IDS.length]
    return this.switchGenre(next)
  }

  /** ゲージを消費して大技（短文）・奥義（長文）を始めます。 */
  activate(move: BigMove): boolean {
    if (!this.canUse(move)) return false
    this.collectSpellings()
    this.gauge -= move === 'skill' ? GAUGE_PER_BAR : GAUGE_MAX
    this.mode = move
    const kind: PromptKind = move === 'skill' ? 'short' : 'long'
    this.prompt = this.makePrompt({ entry: this.pick(kind), kind }, move)
    this.promptMissed = false
    this.events.push({ type: 'bigMove', mode: move })
    return true
  }

  // ---- 内部処理 ----

  private genreMultiplier(affinity: Affinity): number {
    const base = affinity === 'weak' ? WEAK_MULTIPLIER : affinity === 'resist' ? RESIST_MULTIPLIER : 1
    return base * masteryMultiplier(this.loadout.masteryLevels[this.prompt.genre] ?? 0)
  }

  private completePrompt(): void {
    const { session, kind, mode } = this.prompt
    const noMiss = !this.promptMissed
    const factor =
      mode === 'skill'
        ? SKILL_BURST_FACTOR
        : mode === 'ultimate'
          ? ULTIMATE_BURST_FACTOR
          : COMPLETE_FACTOR[kind]
    const affinity = this.affinityOf(this.prompt.genre)
    const amount = Math.round(
      this.loadout.attack *
        session.typedCount *
        factor *
        this.genreMultiplier(affinity) *
        (noMiss ? NO_MISS_MULTIPLIER : 1),
    )
    this.stats.promptsCompleted++
    if (mode !== 'normal') this.stats.bigMovesCompleted++
    this.events.push({ type: 'burst', amount, mode, noMiss, affinity })
    if (this.dealDamage(amount)) return

    if (mode === 'normal') this.addGauge(GAUGE_ON_COMPLETE)
    this.collectSpellings()
    this.mode = 'normal'
    this.prompt = this.makePrompt(this.next, 'normal')
    this.next = this.rollNormal()
    this.promptMissed = false
  }

  /** ダメージを与えます。敵を倒したら true を返します。 */
  private dealDamage(amount: number): boolean {
    const before = phaseIndex(this.enemy, this.hp, this.maxHp)
    const dealt = Math.min(amount, this.hp)
    this.hp -= dealt
    this.stats.damage += dealt
    if (this.hp <= 0) {
      this.status = 'won'
      this.finisher = this.mode !== 'normal'
      this.collectSpellings()
      this.events.push({ type: 'end', status: 'won', finisher: this.finisher })
      return true
    }
    const after = phaseIndex(this.enemy, this.hp, this.maxHp)
    if (after !== before) this.events.push({ type: 'phase', phase: this.enemy.phases[after] })
    return false
  }

  private addGauge(amount: number): void {
    this.gauge = Math.min(GAUGE_MAX, this.gauge + amount)
  }

  private collectSpellings(): void {
    Object.assign(this.stats.spellings, this.prompt.session.usedSpellings())
  }

  private makePrompt(item: { entry: TextEntry; kind: PromptKind }, mode: Mode): Prompt {
    const prefs = { ...this.loadout.prefs, ...this.stats.spellings }
    return {
      entry: item.entry,
      kind: item.kind,
      mode,
      genre: this.genre,
      session: new TypingSession(item.entry.kana, prefs),
    }
  }

  private rollNormal(): { entry: TextEntry; kind: PromptKind } {
    let roll = this.rng()
    let kind: PromptKind = 'word'
    for (const [k, weight] of NORMAL_KINDS) {
      kind = k
      if (roll < weight) break
      roll -= weight
    }
    return { entry: this.pick(kind), kind }
  }

  /** 最近出したお題を避けて 1 件選びます。 */
  private pick(kind: PromptKind): TextEntry {
    const pool = TEXTS[this.genre][kind]
    let fresh = pool.filter((e) => !this.recent.has(e.text))
    if (fresh.length === 0) {
      for (const e of pool) this.recent.delete(e.text)
      fresh = pool
    }
    const entry = fresh[Math.floor(this.rng() * fresh.length) % fresh.length]
    this.recent.add(entry.text)
    return entry
  }
}
