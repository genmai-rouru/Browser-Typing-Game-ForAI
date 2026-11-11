import { attackForLevel, masteryLevel } from './balance.ts'
import type { Loadout } from './battle.ts'
import { GENRE_IDS } from './genres.ts'
import type { GenreId, RuneInstance, RuneType } from './types.ts'

/** ブラウザに保存するプレイデータ。 */
export interface SaveData {
  version: 1
  level: number
  exp: number
  /** キー強化に使う「欠片」。 */
  shards: number
  keyLevels: Record<string, number>
  /** キーごとの累計打鍵数（鍛えるキーを選ぶ目安）。 */
  keyStrokes: Record<string, number>
  runes: RuneInstance[]
  /** ジャンルごとの累計打鍵数。熟練度レベルはここから計算します。 */
  masteryStrokes: Record<GenreId, number>
  /** 突破済みの最高階層。 */
  clearedStage: number
  /** 階層ごとの最高ダメージ。 */
  bestDamage: Record<string, number>
  /** ガイドに表示する綴りの好み。 */
  prefs: Record<string, string>
  lastGenre: GenreId
  battles: number
}

const STORAGE_KEY = 'genei-toubatsu-save-v1'

export function createSave(): SaveData {
  return {
    version: 1,
    level: 1,
    exp: 0,
    shards: 0,
    keyLevels: {},
    keyStrokes: {},
    runes: [],
    masteryStrokes: { school: 0, society: 0, nature: 0, food: 0 },
    clearedStage: 0,
    bestDamage: {},
    prefs: {},
    lastGenre: 'school',
    battles: 0,
  }
}

/**
 * 保存データを読み込みます。壊れていたり、プライベートブラウズなどで
 * localStorage が使えなかったりする場合は、新規データで始めます。
 */
export function loadSave(): SaveData {
  const fresh = createSave()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fresh
    const data = JSON.parse(raw) as Partial<SaveData>
    if (typeof data !== 'object' || data === null || data.version !== 1) return fresh
    return {
      ...fresh,
      ...data,
      masteryStrokes: { ...fresh.masteryStrokes, ...data.masteryStrokes },
      lastGenre: GENRE_IDS.includes(data.lastGenre as GenreId) ? data.lastGenre! : fresh.lastGenre,
    }
  } catch {
    return fresh
  }
}

export function storeSave(save: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
  } catch {
    // 保存できなくてもゲームは続けられるようにします。
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 何もしません。
  }
}

export function masteryLevels(save: SaveData): Record<GenreId, number> {
  return Object.fromEntries(
    GENRE_IDS.map((g) => [g, masteryLevel(save.masteryStrokes[g] ?? 0)]),
  ) as Record<GenreId, number>
}

export function runeByKey(runes: readonly RuneInstance[]): Record<string, RuneType> {
  const map: Record<string, RuneType> = {}
  for (const rune of runes) {
    if (rune.key) map[rune.key] = rune.type
  }
  return map
}

/** 保存データから、戦闘に持ち込む能力を組み立てます。 */
export function buildLoadout(save: SaveData): Loadout {
  return {
    attack: attackForLevel(save.level),
    keyLevels: save.keyLevels,
    runeByKey: runeByKey(save.runes),
    masteryLevels: masteryLevels(save),
    prefs: save.prefs,
  }
}
