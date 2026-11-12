import { TypingSession, type SpellingPrefs } from '../typing/engine.ts'
import {
  ATTACK_TIME_MS,
  COMPLETE_FACTOR,
  CRIT_MULTIPLIER,
  DEFENSE_INTRO_MS,
  DEFENSE_LENGTH_MAX,
  DEFENSE_LENGTH_MIN,
  FATIGUE_HP_DRAIN_PER_SEC,
  FORECAST_MS,
  MP_COST,
  NO_MISS_MULTIPLIER,
  PRR_LOSS_PER_TYPO,
  PRR_RECOVER_PER_WAVE,
  RESUME_INPUT_LOCK_MS,
  defenseDamage,
  defenseTimeMs,
  effectiveDefense,
  fatigueAttackMultiplier,
  fatigueStacks,
  keyMultiplier,
} from './balance.ts'
import { enemyById, patternIndex } from './enemies.ts'
import { BASIC_TEXTS } from './texts/basic.ts'
import { TEXTS } from './texts/index.ts'
import type {
  EnemyAction,
  EnemyDef,
  GenreId,
  PlayerStats,
  PromptKind,
  RequestDef,
  TextEntry,
} from './types.ts'

/**
 * 依頼 1 件ぶんの戦闘の進行を管理します。画面（React）には依存しません。
 *
 *   依頼 ＞ ウェーブ（敵 1 体）＞ ターン
 *   1 ターン = コマンドフェーズ → 攻撃フェーズ（30 秒）→ 敵の行動（攻撃なら防御フェーズ）
 *
 * 時刻は呼び出し側から渡すので、テストでは好きな時刻を与えて検証できます。
 */

/** いまの場面。defenseIntro は、防御お題を出してから入力を受け付けるまでの短い間です。 */
export type Phase = 'command' | 'attack' | 'defenseIntro' | 'defense' | 'won' | 'lost'

/** お題の出どころ。basic は MP が尽きたときの「通常攻撃」。 */
export type PromptGenre = GenreId | 'basic'

/** 戦闘に持ち込むプレイヤーの能力。 */
export interface Loadout {
  stats: PlayerStats
  keyLevels: Readonly<Record<string, number>>
  prefs: SpellingPrefs
  /** 戦闘に持ち込むジャンルのセット（並び順どおりに切り替わります）。 */
  genres: readonly GenreId[]
}

export interface Prompt {
  entry: TextEntry
  kind: PromptKind
  genre: PromptGenre
  session: TypingSession
  /** 最初の 1 打鍵（正誤を問わず）が済んだか。初速の計測に使います。 */
  started: boolean
  /** MP を支払い済みか（最初の正しい 1 打鍵で支払います）。 */
  paid: boolean
  /** このお題でミスをしたか。 */
  missed: boolean
}

/** 次に出すお題。 */
export interface NextPrompt {
  entry: TextEntry
  kind: PromptKind
  genre: GenreId
}

/** 防御フェーズで受けている攻撃。 */
export interface DefenseState {
  action: EnemyAction
  /** 元ダメージ D。 */
  base: number
  strong: boolean
  /** お題タイマーの長さ（ミリ秒）。 */
  limitMs: number
}

export type DefenseOutcome = 'dodged' | 'reduced' | 'forced'

/** 防御フェーズの結果。forced は校正力が尽きた状態でのミスによる打ち切りです。 */
export interface DefenseResult {
  outcome: DefenseOutcome
  damage: number
  /** 打ち切り率（0〜1）。 */
  n: number
  completed: boolean
  strong: boolean
}

/** コマンドフェーズに表示する、直前の経過。 */
export interface TurnReport {
  /** start = 戦闘開始、turn = ターン終了、waveClear = 敵を倒して次のウェーブへ。 */
  kind: 'start' | 'turn' | 'waveClear'
  turn: number
  damage: number
  strokes: number
  misses: number
  /** そのターンの敵の行動（倒した場合は null）。 */
  action: EnemyAction | null
  defense: DefenseResult | null
  fatigueDamage: number
  /** waveClear のとき、倒した敵の名前。 */
  defeated?: string
}

/** 画面演出のために戦闘から通知する出来事。 */
export type BattleEvent =
  | { type: 'hit'; amount: number; crit: boolean; key: string }
  | { type: 'whiff' }
  | { type: 'burst'; amount: number; noMiss: boolean }
  | { type: 'miss' }
  | { type: 'mpShort' }
  | { type: 'defenseStart'; action: EnemyAction }
  | { type: 'playerDamage'; amount: number; result: DefenseResult }
  | { type: 'waveClear'; defeated: string }
  | { type: 'end'; status: 'won' | 'lost' }

export interface BattleStats {
  strokes: number
  misses: number
  damage: number
  damageTaken: number
  crits: number
  /** 経過したターン数（全ウェーブの合計）。 */
  turns: number
  /** 入力できる状態だった時間（攻撃フェーズと防御フェーズ）の合計。 */
  activeMs: number
  /** そのうち、各お題が表示されてから最初の 1 打鍵までの時間（初速）の合計。 */
  latencyMs: number
  keyStrokes: Record<string, number>
  /** 実際に使われた綴り（ガイドの好み学習用）。 */
  spellings: Record<string, string>
}

const ATTACK_KINDS: ReadonlyArray<readonly [PromptKind, number]> = [
  ['word', 0.45],
  ['sentence', 0.35],
  ['short', 0.2],
]

/** 防御お題に使える長さのお題を、ジャンルごとに覚えておきます。 */
const defensePools = new Map<PromptGenre, TextEntry[]>()

function defensePool(genre: PromptGenre): TextEntry[] {
  const cached = defensePools.get(genre)
  if (cached) return cached
  const all = genre === 'basic' ? BASIC_TEXTS : Object.values(TEXTS[genre]).flat()
  const fit = all.filter((entry) => {
    const length = new TypingSession(entry.kana).shortestLength
    return length >= DEFENSE_LENGTH_MIN && length <= DEFENSE_LENGTH_MAX
  })
  const pool = fit.length > 0 ? fit : all
  defensePools.set(genre, pool)
  return pool
}

export class Battle {
  readonly request: RequestDef
  readonly stats: BattleStats
  readonly player: PlayerStats

  phase: Phase = 'command'
  /** いまのウェーブ（0 始まり）。 */
  waveIndex = 0
  /** いまのウェーブでのターン数（1 始まり。開始前は 0）。 */
  turn = 0
  enemy: EnemyDef
  enemyHp: number
  hp: number
  mp: number
  /** 校正力。 */
  prr: number
  /** 選んでいるジャンル。切り替えると「次のお題」から反映されます。 */
  genre: GenreId
  /** 持ち込んだジャンルのセット。 */
  readonly genres: readonly GenreId[]
  /** 攻撃フェーズ 1 回の制限時間（ミリ秒）。 */
  readonly attackTimeMs: number = ATTACK_TIME_MS
  /** 残り時間と、その場面の制限時間（タイマー表示用）。 */
  timeLeftMs = 0
  timeLimitMs = 0
  /** 入力中のお題（コマンドフェーズでは null）。 */
  prompt: Prompt | null = null
  next: NextPrompt
  defense: DefenseState | null = null
  report: TurnReport

  private readonly loadout: Loadout
  private readonly rng: () => number
  private readonly findEnemy: (id: string) => EnemyDef
  private lastNow: number | null = null
  private pausedFlag = false
  private inputLockedUntil = 0
  /** 予告した時点で確定した、このターンの敵の行動。 */
  private lockedAction: EnemyAction | null = null
  private patternIdx = 0
  private actionIdx = 0
  private turnDamage = 0
  private turnStrokes = 0
  private turnMisses = 0
  private turnFatigue = 0
  /** 疲労ダメージの端数。 */
  private fatigueCarry = 0
  private readonly recent = new Set<string>()
  private events: BattleEvent[] = []

  constructor(
    request: RequestDef,
    loadout: Loadout,
    genre: GenreId,
    rng: () => number = Math.random,
    /** 敵の id からデータを引く関数。テストで差し替えられます。 */
    findEnemy: (id: string) => EnemyDef = enemyById,
  ) {
    this.request = request
    this.loadout = loadout
    this.player = loadout.stats
    this.rng = rng
    this.findEnemy = findEnemy
    this.genres = loadout.genres.length > 0 ? loadout.genres : [genre]
    this.genre = this.genres.includes(genre) ? genre : this.genres[0]
    this.enemy = findEnemy(request.waves[0])
    this.enemyHp = this.enemy.hp
    this.hp = this.player.maxHp
    this.mp = this.player.maxMp
    this.prr = this.player.prr
    this.stats = {
      strokes: 0,
      misses: 0,
      damage: 0,
      damageTaken: 0,
      crits: 0,
      turns: 0,
      activeMs: 0,
      latencyMs: 0,
      keyStrokes: {},
      spellings: {},
    }
    this.next = this.rollAttack()
    this.report = this.emptyReport('start')
  }

  // ---- 参照用 ----

  get waveCount(): number {
    return this.request.waves.length
  }

  get ended(): boolean {
    return this.phase === 'won' || this.phase === 'lost'
  }

  get paused(): boolean {
    return this.pausedFlag
  }

  /** いまのターンの疲労の段階（0 なら疲労なし）。 */
  get fatigue(): number {
    return fatigueStacks(Math.max(1, this.turn))
  }

  /** 予告中、または実行中の敵の行動。予告前は null。 */
  get forecast(): EnemyAction | null {
    if (this.phase === 'attack') return this.lockedAction
    if (this.phase === 'defenseIntro' || this.phase === 'defense') return this.defense?.action ?? null
    return null
  }

  mpCost(genre: PromptGenre): number {
    return genre === 'basic' ? 0 : MP_COST[genre]
  }

  canUseGenre(genre: GenreId): boolean {
    return this.mp >= MP_COST[genre]
  }

  /** どのジャンルも MP が足りず、通常攻撃しか打てない状態か。 */
  get outOfMp(): boolean {
    return this.genres.every((g) => !this.canUseGenre(g))
  }

  /** いまのお題が MP 不足で打てない（ジャンルの切り替えが必要な）状態か。 */
  get blocked(): boolean {
    const prompt = this.prompt
    if (this.phase !== 'attack' || !prompt || prompt.paid) return false
    return this.mp < this.mpCost(prompt.genre)
  }

  /** 防御フェーズの打ち切り率（0〜1）。 */
  get defenseProgress(): number {
    return this.defense && this.prompt ? this.prompt.session.progress() : 0
  }

  isInputLocked(now: number): boolean {
    return !this.ended && now < this.inputLockedUntil
  }

  /** たまった出来事を取り出します（取り出すと空になります）。 */
  drainEvents(): BattleEvent[] {
    const list = this.events
    this.events = []
    return list
  }

  // ---- 時間の進行 ----

  /** 時間を進めます。毎フレーム呼び出してください。 */
  tick(now: number): void {
    if (this.lastNow === null) {
      this.lastNow = now
      return
    }
    const dt = this.pausedFlag ? 0 : Math.max(0, now - this.lastNow)
    this.lastNow = now
    if (dt === 0) return

    if (this.phase === 'attack') {
      this.countActive(dt)
      if (this.applyFatigue(dt)) return
      this.timeLeftMs = Math.max(0, this.timeLeftMs - dt)
      if (this.timeLeftMs <= FORECAST_MS && !this.lockedAction) {
        this.lockedAction = this.currentAction()
      }
      if (this.timeLeftMs <= 0) this.endAttack()
    } else if (this.phase === 'defenseIntro') {
      this.timeLeftMs = Math.max(0, this.timeLeftMs - dt)
      if (this.timeLeftMs <= 0 && this.defense) {
        this.phase = 'defense'
        this.timeLeftMs = this.timeLimitMs = this.defense.limitMs
      }
    } else if (this.phase === 'defense') {
      this.countActive(dt)
      this.timeLeftMs = Math.max(0, this.timeLeftMs - dt)
      if (this.timeLeftMs <= 0) this.resolveDefense(false, false)
    }
  }

  /** 一時停止します。止めている間は時間が進まず、入力も受け付けません。 */
  pause(now: number): void {
    if (this.pausedFlag || this.ended) return
    this.tick(now)
    this.pausedFlag = true
  }

  /**
   * 再開します。止めている間にお題を読んで有利にならないよう、
   * 再開直後の少しの間は入力を受け付けません。
   */
  resume(now: number): void {
    if (!this.pausedFlag) return
    this.pausedFlag = false
    this.lastNow = now
    this.inputLockedUntil = now + RESUME_INPUT_LOCK_MS
  }

  // ---- プレイヤーの操作 ----

  /** コマンドフェーズを終えて、攻撃フェーズを始めます。 */
  proceed(now: number): boolean {
    if (this.phase !== 'command' || this.pausedFlag) return false
    this.tick(now)
    this.turn++
    this.stats.turns++
    this.phase = 'attack'
    this.timeLeftMs = this.timeLimitMs = this.attackTimeMs
    this.lockedAction = null
    this.turnDamage = this.turnStrokes = this.turnMisses = this.turnFatigue = 0
    this.fatigueCarry = 0
    this.setAttackPrompt(this.next)
    this.next = this.rollAttack()
    return true
  }

  /** 1 打鍵を処理します。 */
  type(char: string, now: number): void {
    this.tick(now)
    if (this.pausedFlag || now < this.inputLockedUntil) return
    const key = char.toLowerCase()
    if (this.phase === 'attack') this.typeAttack(key)
    else if (this.phase === 'defense') this.typeDefense(key)
  }

  /**
   * お題のジャンルを切り替えます。MP が足りないジャンルには切り替えられません。
   * 入力中のお題はそのままで、「次のお題」から新しいジャンルになります。
   * 何度切り替えても、次のお題が上書きされるだけです。
   */
  switchGenre(genre: GenreId): boolean {
    if (this.phase !== 'attack' && this.phase !== 'command') return false
    if (this.pausedFlag || genre === this.genre) return false
    if (!this.genres.includes(genre) || !this.canUseGenre(genre)) return false
    // 入力中のお題が MP 不足で打てないときだけは、先へ進めるようにその場で置き換えます。
    const replaceNow = this.blocked
    this.genre = genre
    this.next = this.rollAttack()
    if (replaceNow) {
      this.setAttackPrompt(this.next)
      this.next = this.rollAttack()
    }
    return true
  }

  /** いまのジャンルから dir（+1 / -1）方向で、次に使えるジャンルに切り替えます。 */
  cycleGenre(dir: 1 | -1): boolean {
    const count = this.genres.length
    const index = this.genres.indexOf(this.genre)
    for (let step = 1; step < count; step++) {
      const genre = this.genres[(index + dir * step + count * step) % count]
      if (this.switchGenre(genre)) return true
    }
    return false
  }

  // ---- 攻撃フェーズ ----

  private typeAttack(key: string): void {
    let prompt = this.prompt
    if (!prompt) return
    if (this.blocked) {
      if (!this.outOfMp) {
        this.events.push({ type: 'mpShort' })
        return
      }
      // どのジャンルも打てないので、通常攻撃のお題に切り替えます。
      this.setAttackPrompt(this.rollAttack())
      prompt = this.prompt!
    }

    const result = prompt.session.input(key)
    prompt.started = true
    if (!result.ok) {
      this.countMiss()
      prompt.missed = true
      this.loseProofreading()
      this.events.push({ type: 'miss' })
      return
    }
    if (!prompt.paid) {
      this.mp -= this.mpCost(prompt.genre)
      prompt.paid = true
    }
    this.countStroke(key)

    // --- 1 打鍵ごとのダメージ ---
    const { atk, hit, crt } = this.player
    if (hit < 100 && this.rng() >= hit / 100) {
      this.events.push({ type: 'whiff' })
    } else {
      const crit = this.rng() < crt / 100
      if (crit) this.stats.crits++
      const amount = Math.max(
        1,
        Math.round(
          atk *
            keyMultiplier(this.loadout.keyLevels[key] ?? 0) *
            fatigueAttackMultiplier(this.fatigue) *
            (crit ? CRIT_MULTIPLIER : 1),
        ),
      )
      this.events.push({ type: 'hit', amount, crit, key })
      if (this.dealDamage(amount)) return
    }

    // --- お題を打ち切ったときの追撃 ---
    if (result.finished) {
      const noMiss = !prompt.missed
      const amount = Math.round(
        atk *
          prompt.session.typedCount *
          COMPLETE_FACTOR[prompt.kind] *
          fatigueAttackMultiplier(this.fatigue) *
          (noMiss ? NO_MISS_MULTIPLIER : 1),
      )
      this.events.push({ type: 'burst', amount, noMiss })
      if (this.dealDamage(amount)) return
      this.collectSpellings()
      this.setAttackPrompt(this.next)
      this.next = this.rollAttack()
    }
  }

  /** 敵にダメージを与えます。倒したら true を返します。 */
  private dealDamage(amount: number): boolean {
    const dealt = Math.min(amount, this.enemyHp)
    this.enemyHp -= dealt
    this.stats.damage += dealt
    this.turnDamage += dealt
    if (this.enemyHp <= 0) {
      this.defeatEnemy()
      return true
    }
    // HP が減ると行動パターンが変わります。変わったら、そのパターンの先頭から行動します。
    const index = patternIndex(this.enemy, this.enemyHp / this.enemy.hp)
    if (index !== this.patternIdx) {
      this.patternIdx = index
      this.actionIdx = 0
    }
    return false
  }

  private defeatEnemy(): void {
    this.collectSpellings()
    const defeated = this.enemy.name
    if (this.waveIndex >= this.waveCount - 1) {
      this.phase = 'won'
      this.prompt = null
      this.events.push({ type: 'end', status: 'won' })
      return
    }
    // 次のウェーブへ。HP と MP は引き継ぎ、疲労は解除、校正力は少し回復します。
    this.report = { ...this.currentReport('waveClear', null, null), defeated }
    this.waveIndex++
    this.enemy = this.findEnemy(this.request.waves[this.waveIndex])
    this.enemyHp = this.enemy.hp
    this.turn = 0
    this.patternIdx = this.actionIdx = 0
    this.lockedAction = null
    this.prr = Math.min(this.player.prr, this.prr + Math.round(this.player.prr * PRR_RECOVER_PER_WAVE))
    this.phase = 'command'
    this.prompt = null
    this.next = this.rollAttack()
    this.events.push({ type: 'waveClear', defeated })
  }

  /** 攻撃フェーズの時間切れ。敵が行動します。 */
  private endAttack(): void {
    this.collectSpellings()
    const action = this.lockedAction ?? this.currentAction()
    this.actionIdx = (this.actionIdx + 1) % this.enemy.patterns[this.patternIdx].actions.length
    if (action.type === 'idle') {
      this.finishTurn(action, null)
      return
    }
    const strong = action.type === 'strong'
    const pool = defensePool(this.outOfMp ? 'basic' : this.genre)
    const entry = pool[Math.floor(this.rng() * pool.length) % pool.length]
    const session = new TypingSession(entry.kana, this.prefs())
    this.prompt = {
      entry,
      kind: 'sentence',
      genre: this.outOfMp ? 'basic' : this.genre,
      session,
      started: false,
      paid: true,
      missed: false,
    }
    this.defense = {
      action,
      base: Math.round(this.enemy.attack * (action.power ?? 1)),
      strong,
      limitMs: defenseTimeMs(session.shortestLength, this.enemy.kpm, strong, this.request.difficulty),
    }
    this.phase = 'defenseIntro'
    this.timeLeftMs = this.timeLimitMs = DEFENSE_INTRO_MS
    this.events.push({ type: 'defenseStart', action })
  }

  // ---- 防御フェーズ ----

  private typeDefense(key: string): void {
    const prompt = this.prompt
    if (!prompt) return
    const result = prompt.session.input(key)
    prompt.started = true
    if (!result.ok) {
      this.countMiss()
      this.events.push({ type: 'miss' })
      // 校正力が尽きた状態でのミスは、その時点の打ち切り率で確定します。
      if (this.prr <= 0) this.resolveDefense(false, true)
      else this.loseProofreading()
      return
    }
    this.countStroke(key)
    if (result.finished) this.resolveDefense(true, false)
  }

  private resolveDefense(completed: boolean, forced: boolean): void {
    const defense = this.defense
    const prompt = this.prompt
    if (!defense || !prompt) return
    const n = prompt.session.progress()
    const d = effectiveDefense(this.player.def, this.prr, this.player.prr)
    const damage = defenseDamage(defense.base, defense.strong, completed, n, d)
    const result: DefenseResult = {
      outcome: forced ? 'forced' : damage === 0 ? 'dodged' : 'reduced',
      damage,
      n,
      completed,
      strong: defense.strong,
    }
    this.collectSpellings()
    this.hp = Math.max(0, this.hp - damage)
    this.stats.damageTaken += damage
    this.events.push({ type: 'playerDamage', amount: damage, result })
    if (this.hp <= 0) {
      this.lose()
      return
    }
    this.finishTurn(defense.action, result)
  }

  // ---- ターンの締め ----

  private finishTurn(action: EnemyAction, defense: DefenseResult | null): void {
    this.report = this.currentReport('turn', action, defense)
    this.phase = 'command'
    this.defense = null
    this.prompt = null
    this.lockedAction = null
  }

  private lose(): void {
    this.hp = 0
    this.phase = 'lost'
    this.defense = null
    this.prompt = null
    this.events.push({ type: 'end', status: 'lost' })
  }

  /** 疲労による HP の減少。倒れたら true を返します。 */
  private applyFatigue(dt: number): boolean {
    const stacks = this.fatigue
    if (stacks <= 0) return false
    this.fatigueCarry += this.player.maxHp * FATIGUE_HP_DRAIN_PER_SEC * stacks * (dt / 1000)
    const damage = Math.floor(this.fatigueCarry)
    if (damage <= 0) return false
    this.fatigueCarry -= damage
    this.hp = Math.max(0, this.hp - damage)
    this.stats.damageTaken += damage
    this.turnFatigue += damage
    if (this.hp > 0) return false
    this.collectSpellings()
    this.lose()
    return true
  }

  // ---- 内部の小さな処理 ----

  private currentAction(): EnemyAction {
    const actions = this.enemy.patterns[this.patternIdx].actions
    return actions[this.actionIdx % actions.length]
  }

  private emptyReport(kind: TurnReport['kind']): TurnReport {
    return { kind, turn: 0, damage: 0, strokes: 0, misses: 0, action: null, defense: null, fatigueDamage: 0 }
  }

  private currentReport(
    kind: TurnReport['kind'],
    action: EnemyAction | null,
    defense: DefenseResult | null,
  ): TurnReport {
    return {
      kind,
      turn: this.turn,
      damage: this.turnDamage,
      strokes: this.turnStrokes,
      misses: this.turnMisses,
      action,
      defense,
      fatigueDamage: this.turnFatigue,
    }
  }

  private countActive(dt: number): void {
    this.stats.activeMs += dt
    if (this.prompt && !this.prompt.started) this.stats.latencyMs += dt
  }

  private countStroke(key: string): void {
    this.stats.strokes++
    this.turnStrokes++
    this.stats.keyStrokes[key] = (this.stats.keyStrokes[key] ?? 0) + 1
  }

  private countMiss(): void {
    this.stats.misses++
    this.turnMisses++
  }

  private loseProofreading(): void {
    this.prr = Math.max(0, this.prr - PRR_LOSS_PER_TYPO)
  }

  private prefs(): SpellingPrefs {
    return { ...this.loadout.prefs, ...this.stats.spellings }
  }

  private collectSpellings(): void {
    if (this.prompt) Object.assign(this.stats.spellings, this.prompt.session.usedSpellings())
  }

  private setAttackPrompt(item: NextPrompt): void {
    // どのジャンルも打てないときは、消費 MP 0 の通常攻撃にします。
    const basic = this.outOfMp
    const entry = basic ? this.pick(BASIC_TEXTS) : item.entry
    this.prompt = {
      entry,
      kind: basic ? 'word' : item.kind,
      genre: basic ? 'basic' : item.genre,
      session: new TypingSession(entry.kana, this.prefs()),
      started: false,
      paid: false,
      missed: false,
    }
  }

  private rollAttack(): NextPrompt {
    let roll = this.rng()
    let kind: PromptKind = 'word'
    for (const [k, weight] of ATTACK_KINDS) {
      kind = k
      if (roll < weight) break
      roll -= weight
    }
    return { entry: this.pick(TEXTS[this.genre][kind]), kind, genre: this.genre }
  }

  /** 最近出したお題を避けて 1 件選びます。 */
  private pick(pool: readonly TextEntry[]): TextEntry {
    let fresh = pool.filter((e) => !this.recent.has(e.text))
    if (fresh.length === 0) {
      for (const e of pool) this.recent.delete(e.text)
      fresh = [...pool]
    }
    const entry = fresh[Math.floor(this.rng() * fresh.length) % fresh.length]
    this.recent.add(entry.text)
    return entry
  }
}
