import type { Ref } from 'react'
import { FATIGUE_HP_DRAIN_PER_SEC, fatigueAttackMultiplier } from '../../game/balance.ts'
import type { PartyMember } from '../../game/battle.ts'
import type { PartnerRole } from '../../game/partners.ts'
import type { EnemyAction, EnemyDef } from '../../game/types.ts'
import { IMAGE_PATHS } from '../stage/assets.ts'
import { GameImage } from '../stage/GameImage.tsx'
import { ACTION_LABEL, type Pop } from './display.ts'

/** 画面上部：ポーズの案内（左上）、ウェーブ（中央）、ターン（右上）。 */
export function TopBar({ wave, waveCount, turn, onPause }: { wave: number; waveCount: number; turn: number; onPause: () => void }) {
  return (
    <>
      <button type="button" className="bt-frame bt-pause-button" onClick={onPause} tabIndex={-1}>
        <kbd>Esc</kbd>ポーズ
      </button>
      <div className="bt-frame bt-wave" aria-label="ウェーブ">
        WAVE {wave} / {waveCount}
      </div>
      <div className="bt-frame bt-turn" aria-label="ターン">
        <b>TURN</b>
        <span>{turn}</span>
      </div>
    </>
  )
}

interface EnemyViewProps {
  enemy: EnemyDef
  hpRatio: number
  /** 予告された（または実行中の）行動。予告前は null。 */
  forecast: EnemyAction | null
  defeated: boolean
  /** 画面上の中心の x 座標。 */
  x: number
  pops: Pop[]
  onPopEnd: (id: number) => void
  artRef?: Ref<HTMLDivElement>
}

/** 敵 1 体の表示。HP バーと行動予告を頭上に出します（名前と HP の数値は出しません）。 */
export function EnemyView({ enemy, hpRatio, forecast, defeated, x, pops, onPopEnd, artRef }: EnemyViewProps) {
  return (
    <div className={`bt-enemy ${enemy.boss ? 'is-boss' : ''} ${defeated ? 'is-defeated' : ''}`} style={{ left: x }}>
      <div className="bt-forecast-slot">
        {forecast && (
          <span className={`bt-forecast is-${forecast.type}`}>
            {ACTION_LABEL[forecast.type]}「{forecast.name}」
          </span>
        )}
      </div>
      <div className="bt-enemy-hp" aria-label="敵の HP">
        <div className="bt-enemy-hp-fill" style={{ transform: `scaleX(${Math.max(0, hpRatio)})` }} />
      </div>
      <div ref={artRef} className="bt-enemy-art">
        <GameImage
          path={IMAGE_PATHS.enemy(enemy.id)}
          className="bt-enemy-img"
          alt={enemy.name}
          fallback={<div className="bt-enemy-fallback">{enemy.glyph}</div>}
        />
      </div>
      <div className="bt-enemy-shadow" aria-hidden="true" />
      <div className="bt-pops" aria-hidden="true">
        {pops.map((p) => (
          <span
            key={p.id}
            className={`bt-pop is-${p.tone}`}
            style={{ left: p.x, top: p.y }}
            onAnimationEnd={() => onPopEnd(p.id)}
          >
            {p.text}
          </span>
        ))}
      </div>
    </div>
  )
}

interface StatusBarProps {
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  atk: number
  def: number
  prr: number
  maxPrr: number
  barRef?: Ref<HTMLDivElement>
}

/** 画面下部のステータス（HP・MP・ATK・DEF・PRR）。HP と MP は下線がゲージになっています。 */
export function StatusBar({ hp, maxHp, mp, maxMp, atk, def, prr, maxPrr, barRef }: StatusBarProps) {
  return (
    <div ref={barRef} className="bt-frame bt-status" aria-label="リーダーの状態">
      <Stat label="HP" value={`${hp} / ${maxHp}`} ratio={maxHp > 0 ? hp / maxHp : 0} tone="hp" />
      <Stat label="MP" value={`${mp} / ${maxMp}`} ratio={maxMp > 0 ? mp / maxMp : 0} tone="mp" />
      <Stat label="ATK" value={String(atk)} />
      <Stat label="DEF" value={`${def.toFixed(2)}%`} />
      <Stat label="PRR" value={`${prr} / ${maxPrr}`} />
    </div>
  )
}

function Stat({ label, value, ratio, tone }: { label: string; value: string; ratio?: number; tone?: string }) {
  return (
    <div className={`bt-stat ${tone ? `bt-stat-${tone}` : ''}`}>
      <small>{label}</small>
      <span className="bt-stat-value">{value}</span>
      {ratio !== undefined && (
        <span className="bt-stat-gauge" aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, ratio))})` }} />
        </span>
      )}
    </div>
  )
}

/** 疲労の段階（疲労が付いている間だけ表示）。 */
export function FatigueBadge({ stacks }: { stacks: number }) {
  if (stacks <= 0) return null
  const atkDown = Math.round((1 - fatigueAttackMultiplier(stacks)) * 100)
  const drain = Number((FATIGUE_HP_DRAIN_PER_SEC * stacks * 100).toFixed(1))
  return (
    <div className="bt-fatigue" role="status">
      疲労 {stacks} 段階　攻撃力 −{atkDown}%　毎秒 HP −{drain}%
    </div>
  )
}

function cooldownText(member: PartyMember): string {
  return member.cooldown <= 0 ? `${member.def.unique.name} 使用可` : `${member.def.unique.name} あと${member.cooldown}ターン`
}

/** 右端のパートナー表示。前衛は立ち絵、後衛はアイコンで表します。 */
export function PartyView({ party }: { party: PartyMember[] }) {
  const member = (role: PartnerRole) => party.find((m) => m.def.role === role)
  const front = member('front')
  const back = member('back')
  return (
    <>
      {front && (
        <>
          <div className="bt-partner-art">
            <GameImage
              path={IMAGE_PATHS.partner(front.def.id)}
              className="bt-partner-img"
              alt={front.def.name}
              fallback={
                <div className="bt-partner-fallback">
                  <span className="bt-partner-glyph">{front.def.glyph}</span>
                  <span className="bt-partner-name">{front.def.name}</span>
                </div>
              }
            />
          </div>
          <div className={`bt-frame bt-cooldown is-front ${front.cooldown <= 0 ? 'is-ready' : ''}`}>{cooldownText(front)}</div>
        </>
      )}
      <div className="bt-back">
        <div className="bt-back-icon">
          {back ? (
            <GameImage
              path={IMAGE_PATHS.partnerIcon(back.def.id)}
              className="bt-back-img"
              alt={back.def.name}
              fallback={<span className="bt-back-glyph">{back.def.glyph}</span>}
            />
          ) : (
            <span className="bt-back-glyph is-empty">空</span>
          )}
        </div>
        <p className={`bt-back-note ${back && back.cooldown <= 0 ? 'is-ready' : ''}`}>
          {back ? cooldownText(back) : '後方支援なし'}
        </p>
      </div>
    </>
  )
}
