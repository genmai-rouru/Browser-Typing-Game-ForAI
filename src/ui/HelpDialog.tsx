import { useEffect, useRef } from 'react'

interface Props {
  onClose: () => void
}

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
        <ol className="help-list">
          <li>
            <h3>30 秒で敵を討つ</h3>
            <p>
              表示されたお題をローマ字で打ちます。<b>1 打鍵ごとに敵へダメージ</b>
              が入り、30 秒以内に HP を削り切れば突破です。日本語入力（IME）はオフにしてください。
            </p>
          </li>
          <li>
            <h3>ジャンルを切り替えて弱点を突く</h3>
            <p>
              お題のジャンルは入力の途中でも <kbd>Tab</kbd> や数字キー <kbd>1</kbd>〜<kbd>4</kbd>{' '}
              で切り替えられます。敵の弱点ジャンルならダメージ 1.5 倍、耐性ジャンルは 0.6 倍。ボスは戦いの途中で弱点を変えてきます。
            </p>
          </li>
          <li>
            <h3>大技と奥義</h3>
            <p>
              打鍵でゲージがたまります。1 本で <kbd>Enter</kbd> の<b>大技（短文）</b>、2 本で <kbd>Shift</kbd>+
              <kbd>Enter</kbd> の<b>奥義（長文）</b>
              。打っている間のダメージが上がり、打ち切ると大ダメージ。大技・奥義の最中に倒すと「トドメ」となり、報酬が増えます。
            </p>
          </li>
          <li>
            <h3>綴りは自由</h3>
            <p>
              「く」は <code>ku</code>・<code>cu</code>・<code>qu</code>、「し」は <code>si</code>・
              <code>shi</code>・<code>ci</code>、「っ」は子音の重ね打ちや <code>ltu</code>{' '}
              など、普段の打ち方のまま打てます。ガイドはあなたの綴りを覚えていきます。
            </p>
          </li>
          <li>
            <h3>鍛冶場でキーを鍛える</h3>
            <p>
              戦いで得た「言霊の欠片」で、<b>キーを 1 つずつ強化</b>
              できます。鍛えたキーを通る綴りを選ぶほどダメージが伸びるので、どのキーを育て、どう綴るかが腕の見せどころです。
            </p>
          </li>
        </ol>
        <button ref={closeRef} type="button" className="primary-button wide" onClick={onClose}>
          はじめる
        </button>
      </div>
    </div>
  )
}
