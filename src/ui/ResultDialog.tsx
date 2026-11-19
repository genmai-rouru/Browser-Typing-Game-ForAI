import { useEffect, useState } from 'react'
import { itemById, rarityStars } from '../game/items.ts'
import type { BattleSummary } from '../game/rewards.ts'

interface Props {
  summary: BattleSummary
  /** 報酬を受け取ったあとの所持金（円）。 */
  money: number
  /** 「再出現まで待機」（同じ依頼にもう一度挑む）。 */
  onRetry: () => void
  /** 「部室へ戻る」。 */
  onLeave: () => void
}

/** 運動場（16:9 の枠）の上に重ねて表示する、戦闘結果のダイアログ。 */
export function ResultDialog({ summary, money, onRetry, onLeave }: Props) {
  // 戦闘中の打鍵の勢いで誤って画面を進めないよう、少しの間だけキー操作を受け付けません。
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), 900)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!armed) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      if (e.target instanceof HTMLButtonElement && e.key === 'Enter') return
      if (e.key === 'Enter') {
        e.preventDefault()
        onRetry()
      } else if (e.key === 'Escape') {
        onLeave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [armed, onRetry, onLeave])

  const stats: Array<[string, string]> = [
    ['打鍵数', String(summary.strokes)],
    ['ミス数', String(summary.misses)],
    ['打鍵速度（kpm）', String(summary.kpm)],
    ['初速を除く速度（rkpm）', String(summary.rkpm)],
    ['正確率', `${(summary.accuracy * 100).toFixed(1)}%`],
    ['ターン数', String(summary.turns)],
  ]

  return (
    <div className="bt-overlay">
      <div
        className={`bt-frame bt-result ${summary.won ? 'is-won' : 'is-lost'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
      >
        <header className="bt-result-head">
          <p className="bt-result-stage">
            依頼 {summary.requestId}　{summary.title}
          </p>
          <h1 id="result-title" className="bt-result-title">
            {summary.won ? '討伐成功' : '敗北'}
          </h1>
          <p className="bt-result-lead">
            {summary.won
              ? summary.firstClear
                ? '次の依頼が受けられるようになりました。'
                : '依頼を達成しました。'
              : `ウェーブ ${summary.wave}/${summary.waveCount} で力尽きました。経験値のみ受け取れます。`}
          </p>
        </header>

        <div className="bt-result-grid">
          <section className="bt-result-panel">
            <h2 className="bt-result-panel-title">戦闘記録</h2>
            <dl className="bt-result-stats">
              {stats.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="bt-result-panel">
            <h2 className="bt-result-panel-title">報酬</h2>
            <div className="bt-reward-row">
              <span>経験値</span>
              <b>+{summary.exp.toLocaleString()}</b>
            </div>
            {summary.levelAfter > summary.levelBefore && (
              <p className="bt-reward-up">
                レベルアップ！ Lv {summary.levelBefore} → <b>Lv {summary.levelAfter}</b>
              </p>
            )}
            <div className="bt-reward-row">
              <span>討伐報酬金</span>
              <b>{summary.won ? `+${summary.money.toLocaleString()} 円` : '—'}</b>
            </div>
            {summary.partners.map((p) => (
              <div key={p.id}>
                <div className="bt-reward-row">
                  <span>{p.name}の経験値</span>
                  <b>+{p.exp.toLocaleString()}</b>
                </div>
                {p.levelUps.map((up) => (
                  <p key={up.skill} className="bt-reward-up">
                    {up.skill === 'passive' ? 'パッシブ' : '固有スキル'}のレベルアップ！ Lv {up.from} → <b>Lv {up.to}</b>
                  </p>
                ))}
              </div>
            ))}
            <div className="bt-reward-row">
              <span>アイテム</span>
              <b>{summary.items.length === 0 ? '—' : ''}</b>
            </div>
            <ul className="bt-reward-items">
              {summary.items.map((got) => {
                const def = itemById(got.id)
                if (!def) return null
                return (
                  <li key={got.id}>
                    <span className="bt-reward-rarity">{rarityStars(def.rarity)}</span>
                    <span>{def.name}</span>
                    <span>×{got.bag + got.storage + got.lost}</span>
                    {got.storage > 0 && <span className="bt-reward-note">{got.storage} 個は部室準備室へ</span>}
                    {got.lost > 0 && <span className="bt-reward-note is-warn">{got.lost} 個は持ちきれなかった</span>}
                  </li>
                )
              })}
            </ul>
            <p className="bt-result-money">所持金 {money.toLocaleString()} 円</p>
          </section>
        </div>

        <footer className="bt-result-actions">
          <button type="button" className="bt-button is-primary" onClick={onRetry} tabIndex={-1}>
            再出現まで待機 <kbd>Enter</kbd>
          </button>
          <button type="button" className="bt-button" onClick={onLeave} tabIndex={-1}>
            部室へ戻る <kbd>Esc</kbd>
          </button>
        </footer>
      </div>
    </div>
  )
}
