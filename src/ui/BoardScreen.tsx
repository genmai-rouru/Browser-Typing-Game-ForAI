import { REQUESTS, enemyById } from '../game/enemies.ts'
import type { SaveData } from '../game/save.ts'
import type { RoomId } from './navigation.ts'

interface Props {
  save: SaveData
  /** 依頼を選んで運動場へ出撃します。 */
  onStart: (requestId: number) => void
  onOpen: (id: RoomId) => void
}

/** 討伐依頼の一覧。前の依頼を達成すると、次の依頼が受けられます（内容は仮）。 */
export function BoardScreen({ save, onStart, onOpen }: Props) {
  const frontier = save.clearedRequest + 1

  return (
    <main className="panel">
      <h2 className="panel-title">討伐依頼</h2>
      <div className="link-row board-actions">
        <button type="button" className="ghost-button" onClick={() => onOpen('desk')}>
          部室机へ
        </button>
      </div>
      <ol className="stage-list">
        {REQUESTS.map((request) => {
          const cleared = request.id <= save.clearedRequest
          const open = request.id <= frontier
          const last = enemyById(request.waves[request.waves.length - 1])
          return (
            <li key={request.id}>
              <button
                type="button"
                className={`stage ${cleared ? 'is-cleared' : ''} ${request.id === frontier ? 'is-frontier' : ''} ${last.boss ? 'is-boss' : ''}`}
                disabled={!open}
                onClick={() => onStart(request.id)}
              >
                <span className="stage-num">依頼 {request.id}</span>
                <span className="stage-glyph" aria-hidden="true">
                  {open ? last.glyph : '？'}
                </span>
                <span className="stage-body">
                  <span className="stage-name">
                    {open ? request.title : '？？？'}
                    {last.boss && open && <span className="boss-tag">BOSS</span>}
                  </span>
                  <span className="stage-detail">
                    {open ? (
                      <>
                        <span>難易度 {'★'.repeat(request.difficulty)}</span>
                        <span>{request.waves.length} ウェーブ</span>
                        <span>{request.waves.map((id) => enemyById(id).name).join(' → ')}</span>
                      </>
                    ) : (
                      '前の依頼を達成すると受けられます'
                    )}
                  </span>
                </span>
                <span className="stage-state">
                  {cleared ? (
                    <span className="stamp">達成</span>
                  ) : request.id === frontier ? (
                    <span className="go">出撃</span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </main>
  )
}
