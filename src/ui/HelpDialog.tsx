import { useEffect, useRef } from 'react'

interface Props {
  onClose: () => void
}

/** 遊び方。内容は仕様が固まってから書くため、いまは枠だけです。 */
export function HelpDialog({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="help-title" className="screen-title">
          遊び方
        </h2>
        <p className="placeholder-note dialog-body">準備中（内容は後で決めます）</p>
        <button ref={closeRef} type="button" className="primary-button wide" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}
