import { useEffect, useState } from 'react'
import { RUNES } from '../game/balance.ts'
import { genreInfo } from '../game/genres.ts'
import type { BattleSummary } from '../game/rewards.ts'

interface Props {
  summary: BattleSummary
  /** 報酬を受け取ったあとの、欠片の所持数。 */
  shards: number
  /** 「再出現まで待機」（同じ依頼にもう一度挑む）。 */
  onRetry: () => void
  /** 「部室へ戻る」。 */
  onLeave: () => void
}

/** 運動場の上に重ねて表示する、戦闘結果のダイアログ。 */
export function ResultDialog({ summary, shards, onRetry, onLeave }: Props) {
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

  const damageRatio = Math.round((summary.damage / summary.maxHp) * 100)
  const stats: Array<[string, string]> = [
    ['与ダメージ', `${summary.damage.toLocaleString()}（${damageRatio}%）`],
    ['打鍵数', String(summary.strokes)],
    ['正確率', `${(summary.accuracy * 100).toFixed(1)}%`],
    ['打鍵速度', `${summary.kpm} 打/分`],
    ['最大コンボ', String(summary.maxCombo)],
    ['会心', `${summary.crits} 回`],
    ['大技・奥義の完遂', `${summary.bigMoves} 回`],
    ['残り時間', summary.won ? `${(summary.timeLeftMs / 1000).toFixed(1)} 秒` : '—'],
  ]

  return (
    <div className="dialog-backdrop">
      <div
        className={`dialog wide result ${summary.won ? 'is-won' : 'is-lost'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
      >
      <header className="result-head">
        <span className={`result-seal ${summary.won ? 'is-defeated' : ''}`} aria-hidden="true">
          {summary.enemyGlyph}
        </span>
        <div>
          <p className="result-stage">
            依頼 {summary.stage}　{summary.enemyName}
          </p>
          <h1 id="result-title" className="result-title">
            {summary.won ? (summary.finisher ? 'トドメの一撃！' : '討伐成功') : '時間切れ'}
          </h1>
          <p className="result-lead">
            {summary.won
              ? summary.finisher
                ? '大技で仕留めました。欠片の報酬が 1.5 倍になります。'
                : summary.firstClear
                  ? '次の依頼が受けられるようになりました。'
                  : '見事な打鍵でした。'
              : `あと ${(summary.maxHp - summary.damage).toLocaleString()} ダメージでした。与えたぶんの報酬は手に入ります。`}
          </p>
        </div>
      </header>

      <div className="result-grid">
        <section className="panel">
          <h2 className="panel-title">戦闘記録{summary.bestDamageUpdated && !summary.won && <span className="new-tag">自己最高</span>}</h2>
          <dl className="stat-grid">
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel">
          <h2 className="panel-title">報酬</h2>
          <div className="reward-row">
            <span className="reward-label">経験値</span>
            <span className="reward-value">+{summary.exp.toLocaleString()}</span>
          </div>
          {summary.levelAfter > summary.levelBefore && (
            <p className="reward-up">
              レベルアップ！ Lv {summary.levelBefore} → <b>Lv {summary.levelAfter}</b>（攻撃力が上がりました）
            </p>
          )}
          <div className="reward-row">
            <span className="reward-label">欠片</span>
            <span className="reward-value">+{summary.shards.toLocaleString()}</span>
          </div>
          <ul className="reward-breakdown">
            {summary.shardBreakdown.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <span>{row.value}</span>
              </li>
            ))}
          </ul>
          {summary.masteryUps.map((up) => (
            <p key={up.genre} className={`reward-up genre-${up.genre}`}>
              「{genreInfo(up.genre).name}」の熟練度が Lv {up.from} → <b>Lv {up.to}</b>
            </p>
          ))}
          {summary.newRune && (
            <div className="reward-rune">
              <span className={`rune-glyph rune-${summary.newRune}`}>{RUNES[summary.newRune].glyph}</span>
              <div>
                <p className="reward-rune-name">{RUNES[summary.newRune].name} を手に入れた！</p>
                <p className="reward-rune-desc">{RUNES[summary.newRune].description}。技術室で好きなキーに刻めます。</p>
              </div>
            </div>
          )}
          <p className="panel-note">所持している欠片: {shards.toLocaleString()}</p>
        </section>
      </div>

        <footer className="result-actions">
          <button type="button" className="primary-button" onClick={onRetry}>
            再出現まで待機 <kbd>Enter</kbd>
          </button>
          <button type="button" className="ghost-button" onClick={onLeave}>
            部室へ戻る <kbd>Esc</kbd>
          </button>
        </footer>
      </div>
    </div>
  )
}
