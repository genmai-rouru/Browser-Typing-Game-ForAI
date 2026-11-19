import { useEffect, useRef, type CSSProperties } from 'react'
import type { MenuEntry, MenuInfo } from './menu.ts'

interface MenuWindowProps {
  title: string
  entries: MenuEntry[]
  cursor: number
  /** 操作の対象になっているウィンドウか（対象でないときはカーソルを薄く表示します）。 */
  active: boolean
  onHover: (index: number) => void
  onPick: (index: number) => void
  className?: string
  style?: CSSProperties
}

/** カーソルで選ぶ縦並びのメニュー。マウスでも、乗せると選択・クリックで決定できます。 */
export function MenuWindow({ title, entries, cursor, active, onHover, onPick, className = '', style }: MenuWindowProps) {
  const listRef = useRef<HTMLUListElement>(null)

  // 一覧が長くてスクロールするときは、カーソルの行が見える位置まで送ります。
  // （scrollIntoView は外側の固定画面までずらしてしまうため、一覧の中だけを動かします。）
  useEffect(() => {
    const list = listRef.current
    const item = list?.children[cursor] as HTMLElement | undefined
    if (!list || !item) return
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight
    }
  }, [cursor])

  return (
    <div className={`bt-frame bt-menu ${active ? 'is-active' : ''} ${className}`} style={style} role="menu" aria-label={title}>
      <h2 className="bt-menu-title">{title}</h2>
      <ul ref={listRef} className="bt-menu-list">
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <button
              type="button"
              role="menuitem"
              className={`bt-menu-item ${index === cursor ? 'is-cursor' : ''} ${entry.disabled ? 'is-disabled' : ''}`}
              aria-disabled={entry.disabled || undefined}
              tabIndex={-1}
              onMouseEnter={() => onHover(index)}
              onClick={() => onPick(index)}
            >
              <span className="bt-menu-label">{entry.label}</span>
              {entry.note && <span className="bt-menu-note">{entry.note}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** メニューの横に出す説明ウィンドウ。 */
export function InfoWindow({ info, className = '', style }: { info: MenuInfo; className?: string; style?: CSSProperties }) {
  return (
    <div className={`bt-frame bt-info ${className}`} style={style} aria-live="polite">
      <h3 className="bt-info-title">
        {info.title}
        {info.sub && <span className="bt-info-sub">{info.sub}</span>}
      </h3>
      {info.lines.map((line) => (
        <p key={line} className="bt-info-line">
          {line}
        </p>
      ))}
      {info.warn && <p className="bt-info-warn">{info.warn}</p>}
    </div>
  )
}
