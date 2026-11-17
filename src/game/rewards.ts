import { KEY_MAX_LEVEL, expReward, expToNext, keyUpgradeCost } from './balance.ts'
import type { Battle } from './battle.ts'
import { enemyById } from './enemies.ts'
import { consumeItems, receiveItems, type Received } from './items.ts'
import { growPartner, partnerById, type SkillLevelUp } from './partners.ts'
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
  /** 討伐報酬金（円）。勝利時のみ。 */
  money: number
  /** 入手したアイテムと行き先（かばん・部室準備室・受け取れなかった数）。勝利時のみ。 */
  items: Received[]
  levelBefore: number
  levelAfter: number
  /** 同行したパートナーの成長。 */
  partners: Array<{ id: string; name: string; exp: number; levelUps: SkillLevelUp[] }>
}

function perMinute(strokes: number, ms: number): number {
  return ms <= 0 ? 0 : Math.round((strokes / ms) * 60_000)
}

/** 戦闘結果を保存データに反映し、新しい保存データと結果の要約を返します。 */
export function applyBattle(
  save: SaveData,
  battle: Battle,
  /** ドロップの抽選に使う乱数。テストで差し替えられます。 */
  rng: () => number = Math.random,
  findEnemy: typeof enemyById = enemyById,
): { save: SaveData; summary: BattleSummary } {
  const { stats, request } = battle
  const won = battle.phase === 'won'
  const firstClear = won && request.id > save.clearedRequest

  // 敗北時は経験値のみ受け取れます（お金もアイテムも入りません）。
  const exp = expReward(stats.damage, request.id, won)
  let money = 0
  const gains: Array<{ id: string; count: number }> = []
  if (won) {
    // 依頼の報酬（達成するたびのものと、初回限りのもの）。
    const rewards = [...request.rewards.repeat, ...(firstClear ? request.rewards.first : [])]
    for (const reward of rewards) {
      if (reward.type === 'money') money += reward.amount
      else gains.push({ id: reward.itemId, count: reward.count })
    }
    // 倒した敵のドロップ。
    for (const id of stats.defeated) {
      for (const drop of findEnemy(id).drops ?? []) {
        if (rng() < drop.rate) gains.push({ id: drop.itemId, count: drop.count ?? 1 })
      }
    }
  }
  // 戦闘中に使ったアイテムを減らしてから、入手したアイテムを受け取ります。
  const held = receiveItems(consumeItems(save, stats.usedItems), gains)

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

  // 同行したパートナーには、プレイヤーと同じ量の経験値が入ります（仮）。
  const partners = { ...save.partners }
  const partnerResults: BattleSummary['partners'] = []
  const record = { won, requestId: request.id, defeated: stats.defeated }
  for (const member of battle.party) {
    const progress = partners[member.def.id]
    const def = partnerById(member.def.id)
    if (!progress || !def) continue
    const grown = growPartner(def, progress, exp, record)
    partners[def.id] = grown.progress
    partnerResults.push({ id: def.id, name: def.name, exp, levelUps: grown.levelUps })
  }

  const nextSave: SaveData = {
    ...held.holdings,
    level,
    exp: pool,
    money: save.money + money,
    keyStrokes,
    clearedRequest: firstClear ? request.id : save.clearedRequest,
    prefs: { ...save.prefs, ...stats.spellings },
    lastGenre: battle.genre,
    partners,
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
    money,
    items: held.received,
    levelBefore: save.level,
    levelAfter: level,
    partners: partnerResults,
  }
  return { save: nextSave, summary }
}

// ---- 技術室での操作 ----

/** 退却したときの処理。報酬は無く、戦闘中に使ったアイテムだけが減ります。 */
export function applyRetreat(save: SaveData, battle: Battle): SaveData {
  return consumeItems(save, battle.stats.usedItems)
}

/** キーを 1 レベル強化します。お金が足りない・上限のときは元のデータを返します。 */
export function upgradeKey(save: SaveData, key: string): SaveData {
  const level = save.keyLevels[key] ?? 0
  const cost = keyUpgradeCost(level)
  if (level >= KEY_MAX_LEVEL || save.money < cost) return save
  return {
    ...save,
    money: save.money - cost,
    keyLevels: { ...save.keyLevels, [key]: level + 1 },
  }
}
