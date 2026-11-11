import { STAGE_COUNT, enemyForStage } from '../game/enemies.ts'
import type { SaveData } from '../game/save.ts'
import type { RoomId } from './navigation.ts'

interface Props {
  save: SaveData
  /** 依頼を選んで運動場へ出撃します。 */
  onStart: (stage: number) => void
  onOpen: (id: RoomId) => void
}

/**
 * 討伐依頼の一覧。
 * いまは仮に、敵 1 体を 1 件の依頼として並べています。
 */
export function BoardScreen({ save, onStart, onOpen }: Props) {
  const frontier = save.clearedStage + 1
  const last = Math.max(STAGE_COUNT, frontier)
  const requests = Array.from({ length: last }, (_, i) => i + 1)

  return (
    <main className="panel">
      <h2 className="panel-title">討伐依頼</h2>
      <div className="link-row board-actions">
        <button type="button" className="ghost-button" onClick={() => onOpen('desk')}>
          部室机へ
        </button>
      </div>
      <ol className="stage-list">
        {requests.map((stage) => {
          const enemy = enemyForStage(stage)
          const cleared = stage <= save.clearedStage
          const open = stage <= frontier
          const best = save.bestDamage[String(stage)] ?? 0
          return (
            <li key={stage}>
              <button
                type="button"
                className={`stage ${cleared ? 'is-cleared' : ''} ${stage === frontier ? 'is-frontier' : ''} ${enemy.boss ? 'is-boss' : ''}`}
                disabled={!open}
                onClick={() => onStart(stage)}
              >
                <span className="stage-num">依頼 {stage}</span>
                <span className="stage-glyph" aria-hidden="true">
                  {open ? enemy.glyph : '？'}
                </span>
                <span className="stage-body">
                  <span className="stage-name">
                    {open ? `${enemy.name}の討伐` : '？？？'}
                    {enemy.boss && open && <span className="boss-tag">BOSS</span>}
                  </span>
                  <span className="stage-detail">
                    {open ? `HP ${enemy.hp.toLocaleString()}` : '前の依頼を達成すると受けられます'}
                  </span>
                </span>
                <span className="stage-state">
                  {cleared ? (
                    <span className="stamp">達成</span>
                  ) : stage === frontier ? (
                    <span className="go">出撃</span>
                  ) : null}
                  {best > 0 && !cleared && (
                    <span className="stage-best">最高 {Math.round((best / enemy.hp) * 100)}%</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </main>
  )
}
