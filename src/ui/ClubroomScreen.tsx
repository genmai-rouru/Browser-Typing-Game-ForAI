import { expToNext, playerStats } from '../game/balance.ts'
import type { SaveData } from '../game/save.ts'
import type { RoomId } from './navigation.ts'

interface Props {
  save: SaveData
  /** 部室の中から別の画面（部室机・部室鏡）を開きます。 */
  onOpen: (id: RoomId) => void
  onHelp: () => void
  onReset: () => void
}

export function ClubroomScreen({ save, onOpen, onHelp, onReset }: Props) {
  const need = expToNext(save.level)
  const stats = playerStats(save.level)
  return (
    <main className="room-grid">
      <section className="panel" aria-label="ステータス">
        <h2 className="panel-title">リーダー</h2>
        <div className="status-level">
          <span className="status-lv">Lv {save.level}</span>
          <div className="meter" aria-label="経験値">
            <div className="meter-fill" style={{ transform: `scaleX(${save.exp / need})` }} />
          </div>
          <span className="status-exp">
            {save.exp} / {need}
          </span>
        </div>
        <dl className="status-list">
          <div>
            <dt>HP</dt>
            <dd>{stats.maxHp}</dd>
          </div>
          <div>
            <dt>MP</dt>
            <dd>{stats.maxMp}</dd>
          </div>
          <div>
            <dt>攻撃力</dt>
            <dd>{stats.atk}</dd>
          </div>
          <div>
            <dt>防御力</dt>
            <dd>{stats.def.toFixed(2)}%</dd>
          </div>
          <div>
            <dt>命中率</dt>
            <dd>{stats.hit}%</dd>
          </div>
          <div>
            <dt>幸運</dt>
            <dd>{stats.luk}</dd>
          </div>
          <div>
            <dt>校正力</dt>
            <dd>{stats.prr}</dd>
          </div>
          <div>
            <dt>会心率</dt>
            <dd>{stats.crt.toFixed(2)}%</dd>
          </div>
          <div>
            <dt>欠片</dt>
            <dd>{save.shards.toLocaleString()}</dd>
          </div>
        </dl>
        <button type="button" className="text-button" onClick={onReset}>
          データを初期化
        </button>
      </section>

      <section className="panel" aria-label="パートナー">
        <h2 className="panel-title">パートナー</h2>
        <p className="placeholder-note">準備中（パートナーキャラをここに表示します）</p>
      </section>

      <section className="panel room-links" aria-label="部室の中">
        <h2 className="panel-title">部室の中</h2>
        <div className="link-row">
          <button type="button" className="ghost-button" onClick={() => onOpen('desk')}>
            部室机
          </button>
          <button type="button" className="ghost-button" onClick={() => onOpen('mirror')}>
            部室鏡
          </button>
          <button type="button" className="ghost-button" onClick={onHelp}>
            遊び方
          </button>
        </div>
      </section>
    </main>
  )
}
