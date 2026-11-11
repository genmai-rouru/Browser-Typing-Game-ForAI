import { useEffect, type ReactNode } from 'react'
import { ROOM_NAMES, TABS, activeTab, backTarget, type RoomId, type RoomState } from './navigation.ts'

interface Props {
  room: RoomState
  /** タブを押したとき。 */
  onTab: (id: RoomId) => void
  /** 「戻る」を押したとき。 */
  onBack: () => void
  /** ダイアログが開いている間など、Esc での「戻る」を止めたいときに false にします。 */
  keyboardEnabled: boolean
  children: ReactNode
}

/** タブと「戻る」ボタンを備えた、校内の各画面の共通の枠。 */
export function Shell({ room, onTab, onBack, keyboardEnabled, children }: Props) {
  const current = activeTab(room)
  const canGoBack = room.id !== 'clubroom'

  useEffect(() => {
    if (!keyboardEnabled || !canGoBack) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keyboardEnabled, canGoBack, onBack])

  return (
    <div className="shell">
      <header className="shell-head">
        <p className="club-name">幻影討伐部</p>
        <nav className="tabs" aria-label="画面の切り替え">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab ${current === tab.id ? 'is-active' : ''}`}
              aria-current={room.id === tab.id ? 'page' : undefined}
              onClick={() => onTab(tab.id)}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </header>
      <div className="room-head">
        <h1 className="screen-title">{ROOM_NAMES[room.id]}</h1>
        {canGoBack && (
          <button type="button" className="ghost-button" onClick={onBack}>
            <kbd>Esc</kbd> 戻る（{ROOM_NAMES[backTarget(room)]}へ）
          </button>
        )}
      </div>
      {children}
    </div>
  )
}
