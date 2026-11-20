import { MenuWindow } from './MenuWindow.tsx'

interface Props {
  /** 依頼名。 */
  title: string
  /** 退却の確認を表示しているか。 */
  confirming: boolean
  cursor: number
  onHover: (index: number) => void
  onPick: (index: number) => void
}

/** Esc で開くポーズメニュー。開いている間は戦闘の時間が止まります。退却は確認を挟みます。 */
export function PauseMenu({ title, confirming, cursor, onHover, onPick }: Props) {
  return (
    <div className="bt-overlay" role="dialog" aria-modal="true" aria-label="ポーズ">
      <div className={`bt-frame bt-pause ${confirming ? 'is-confirm' : ''}`}>
        <p className="bt-pause-label">PAUSE</p>
        <h2 className="bt-pause-title">{confirming ? '退却しますか？' : title}</h2>
        {confirming ? (
          <MenuWindow
            title="退却の確認"
            className="bt-pause-menu"
            entries={[
              { id: 'no', label: 'いいえ' },
              { id: 'yes', label: 'はい（退却する）' },
            ]}
            cursor={cursor}
            active
            onHover={onHover}
            onPick={onPick}
          />
        ) : (
          <MenuWindow
            title="メニュー"
            className="bt-pause-menu"
            entries={[
              { id: 'resume', label: '再開' },
              { id: 'retreat', label: '退却' },
            ]}
            cursor={cursor}
            active
            onHover={onHover}
            onPick={onPick}
          />
        )}
        <p className="bt-pause-note">
          {confirming
            ? 'この戦闘の報酬は手に入りません。使ったアイテムは戻りません。'
            : cursor === 0
              ? '戦闘に戻ります。再開直後の 0.5 秒は入力できません。'
              : '戦闘をやめて部室へ戻ります（確認があります）。'}
        </p>
        <p className="bt-pause-keys">↑↓ / W S で選択　Z / Enter / Space で決定　Esc / X で戻る</p>
      </div>
    </div>
  )
}
