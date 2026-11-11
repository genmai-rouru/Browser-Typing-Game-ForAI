import {
  FINISHER_SHARD_MULTIPLIER,
  KEY_MAX_LEVEL,
  RUNE_REWARDS,
  expReward,
  expToNext,
  keyUpgradeCost,
  masteryLevel,
} from './balance.ts'
import type { Battle } from './battle.ts'
import { GENRE_IDS } from './genres.ts'
import type { SaveData } from './save.ts'
import type { GenreId, RuneType } from './types.ts'

/** 1 戦の結果。結果画面の表示に使います。 */
export interface BattleSummary {
  stage: number
  enemyName: string
  enemyGlyph: string
  won: boolean
  finisher: boolean
  firstClear: boolean
  damage: number
  maxHp: number
  strokes: number
  misses: number
  /** 正確率（0〜1）。 */
  accuracy: number
  /** 1 分あたりの打鍵数。 */
  kpm: number
  maxCombo: number
  crits: number
  bigMoves: number
  timeLeftMs: number
  exp: number
  shards: number
  shardBreakdown: Array<{ label: string; value: string }>
  levelBefore: number
  levelAfter: number
  masteryUps: Array<{ genre: GenreId; from: number; to: number }>
  newRune: RuneType | null
  bestDamageUpdated: boolean
}

/** 戦闘結果を保存データに反映し、新しい保存データと結果の要約を返します。 */
export function applyBattle(save: SaveData, battle: Battle): { save: SaveData; summary: BattleSummary } {
  const { stats, stage } = battle
  const won = battle.status === 'won'
  const firstClear = won && stage > save.clearedStage
  const timeLeftSec = won ? Math.floor(battle.timeLeftMs / 1000) : 0

  // --- 欠片 ---
  const breakdown: Array<{ label: string; value: string }> = []
  const fromDamage = Math.floor(stats.damage / 30)
  breakdown.push({ label: '与えたダメージ', value: `+${fromDamage}` })
  let shards = fromDamage
  if (won) {
    const clearBonus = stage * 8
    const timeBonus = timeLeftSec * stage
    shards += clearBonus + timeBonus
    breakdown.push({ label: '討伐', value: `+${clearBonus}` })
    if (timeBonus > 0) breakdown.push({ label: `残り ${timeLeftSec} 秒`, value: `+${timeBonus}` })
    if (battle.finisher) {
      shards = Math.round(shards * FINISHER_SHARD_MULTIPLIER)
      breakdown.push({ label: '大技でトドメ', value: `×${FINISHER_SHARD_MULTIPLIER}` })
    }
    if (firstClear) {
      const first = stage * 20
      shards += first
      breakdown.push({ label: '初突破', value: `+${first}` })
    }
  }

  // --- 経験値とレベル ---
  const exp = expReward(stats.damage, stage, won)
  let level = save.level
  let pool = save.exp + exp
  while (pool >= expToNext(level)) {
    pool -= expToNext(level)
    level++
  }

  // --- ジャンル熟練度 ---
  const masteryStrokes = { ...save.masteryStrokes }
  const masteryUps: BattleSummary['masteryUps'] = []
  for (const genre of GENRE_IDS) {
    const before = masteryLevel(masteryStrokes[genre])
    masteryStrokes[genre] += stats.genreStrokes[genre]
    const after = masteryLevel(masteryStrokes[genre])
    if (after > before) masteryUps.push({ genre, from: before, to: after })
  }

  // --- キーの累計打鍵数 ---
  const keyStrokes = { ...save.keyStrokes }
  for (const [key, count] of Object.entries(stats.keyStrokes)) {
    keyStrokes[key] = (keyStrokes[key] ?? 0) + count
  }

  // --- 刻印 ---
  const newRune = firstClear ? (RUNE_REWARDS[stage] ?? null) : null
  const runes = newRune ? [...save.runes, { type: newRune, key: null }] : save.runes

  const stageKey = String(stage)
  const bestDamageUpdated = stats.damage > (save.bestDamage[stageKey] ?? 0)
  const total = stats.strokes + stats.misses
  const elapsedSec = Math.max(battle.elapsedMs / 1000, 0.001)

  const nextSave: SaveData = {
    ...save,
    level,
    exp: pool,
    shards: save.shards + shards,
    keyStrokes,
    runes,
    masteryStrokes,
    clearedStage: firstClear ? stage : save.clearedStage,
    bestDamage: bestDamageUpdated ? { ...save.bestDamage, [stageKey]: stats.damage } : save.bestDamage,
    prefs: { ...save.prefs, ...stats.spellings },
    lastGenre: battle.genre,
    battles: save.battles + 1,
  }

  const summary: BattleSummary = {
    stage,
    enemyName: battle.enemy.name,
    enemyGlyph: battle.enemy.glyph,
    won,
    finisher: battle.finisher,
    firstClear,
    damage: stats.damage,
    maxHp: battle.maxHp,
    strokes: stats.strokes,
    misses: stats.misses,
    accuracy: total === 0 ? 1 : stats.strokes / total,
    kpm: Math.round((stats.strokes / elapsedSec) * 60),
    maxCombo: stats.maxCombo,
    crits: stats.crits,
    bigMoves: stats.bigMovesCompleted,
    timeLeftMs: battle.timeLeftMs,
    exp,
    shards,
    shardBreakdown: breakdown,
    levelBefore: save.level,
    levelAfter: level,
    masteryUps,
    newRune,
    bestDamageUpdated,
  }
  return { save: nextSave, summary }
}

// ---- 鍛冶場での操作 ----

/** キーを 1 レベル鍛えます。欠片が足りない・上限のときは元のデータを返します。 */
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

/**
 * index 番目の刻印を key に刻みます（key が null なら外します）。
 * 1 つのキーに刻める刻印は 1 つなので、先に刻まれていたものは外れます。
 */
export function placeRune(save: SaveData, index: number, key: string | null): SaveData {
  if (!save.runes[index]) return save
  const runes = save.runes.map((rune, i) => {
    if (i === index) return { ...rune, key }
    if (key !== null && rune.key === key) return { ...rune, key: null }
    return rune
  })
  return { ...save, runes }
}
