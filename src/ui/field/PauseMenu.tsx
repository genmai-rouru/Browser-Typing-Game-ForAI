import { MenuWindow } from './MenuWindow.tsx'

interface Props {
  /** 依頼名。 */
  title: string
  cursor: number
  onHover: (index: number) => void
  onPick: (index: number) => void
}

/** Esc で開くポーズメニュー。開いている間は戦闘の時間が止まります。 */
export function PauseMenu({ title, cursor, onHover, onPick }: Props) {
  return (
    <div className="bt-overlay" role="dialog" aria-modal="true" aria-label="ポーズ">
      <div className="bt-frame bt-pause">
        <p className="bt-pause-label">PAUSE</p>
        <h2 className="bt-pause-title">{title}</h2>
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
        <p className="bt-pause-note">
          {cursor === 0
            ? '戦闘に戻ります。再開直後の 0.5 秒は入力できません。'
            : '退却すると、この戦闘の報酬は手に入りません。使ったアイテムは戻りません。'}
        </p>
        <p className="bt-pause-keys">
          ↑↓ / W S で選択　Z / Enter / Space で決定　Esc / X で戻る
        </p>
      </div>
    </div>
  )
}
