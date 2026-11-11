import { KEY_MAX_LEVEL, expReward, expToNext, keyUpgradeCost, shardReward } from './balance.ts'
import type { Battle } from './battle.ts'
import type { SaveData } from './save.ts'

/** 依頼 1 件の結果。結果ダイアログの表示に使います。 */
export interface BattleSummary {
  requestId: number
  title: string
  won: boolean
  firstClear: boolean
  /** 到達したウェーブ（1 始まり）と、依頼のウェーブ数。 */
  wave: number
  waveCount: number
  turns: number
  strokes: number
  misses: number
  /** 1 分あたりの打鍵数。 */
  kpm: number
  /** 初速（お題が出てから最初の 1 打鍵までの時間）を除いた、1 分あたりの打鍵数。 */
  rkpm: number
  /** 正確率（0〜1）。 */
  accuracy: number
  exp: number
  /** 勝利時のみ受け取れる報酬（仮）。 */
  shards: number
  levelBefore: number
  levelAfter: number
}

function perMinute(strokes: number, ms: number): number {
  return ms <= 0 ? 0 : Math.round((strokes / ms) * 60_000)
}

/** 戦闘結果を保存データに反映し、新しい保存データと結果の要約を返します。 */
export function applyBattle(save: SaveData, battle: Battle): { save: SaveData; summary: BattleSummary } {
  const { stats, request } = battle
  const won = battle.phase === 'won'
  const firstClear = won && request.id > save.clearedRequest

  // 敗北時は経験値のみ受け取れます。
  const exp = expReward(stats.damage, request.id, won)
  const shards = won ? shardReward(stats.damage, request.id, firstClear) : 0

  let level = save.level
  let pool = save.exp + exp
  while (pool >= expToNext(level)) {
    pool -= expToNext(level)
    level++
  }

  const keyStrokes = { ...save.keyStrokes }
  for (const [key, count] of Object.entries(stats.keyStrokes)) {
    keyStrokes[key] = (keyStrokes[key] ?? 0) + count
  }

  const nextSave: SaveData = {
    ...save,
    level,
    exp: pool,
    shards: save.shards + shards,
    keyStrokes,
    clearedRequest: firstClear ? request.id : save.clearedRequest,
    prefs: { ...save.prefs, ...stats.spellings },
    lastGenre: battle.genre,
    battles: save.battles + 1,
  }

  const total = stats.strokes + stats.misses
  const summary: BattleSummary = {
    requestId: request.id,
    title: request.title,
    won,
    firstClear,
    wave: battle.waveIndex + 1,
    waveCount: battle.waveCount,
    turns: stats.turns,
    strokes: stats.strokes,
    misses: stats.misses,
    kpm: perMinute(stats.strokes, stats.activeMs),
    rkpm: perMinute(stats.strokes, stats.activeMs - stats.latencyMs),
    accuracy: total === 0 ? 1 : stats.strokes / total,
    exp,
    shards,
    levelBefore: save.level,
    levelAfter: level,
  }
  return { save: nextSave, summary }
}

// ---- 技術室での操作 ----

/** キーを 1 レベル強化します。欠片が足りない・上限のときは元のデータを返します。 */
export function upgradeKey(save: SaveData, key: string): SaveData {
  const level = save.keyLevels[key] ?? 0
  const cost = keyUpgradeCost(level)
  if (level >= KEY_MAX_LEVEL || save.shards < cost) return save
  return {
    ...save,
    shards: save.shards - cost,
    keyLevels: { ...save.keyLevels, [key]: level + 1 },
  }
}
