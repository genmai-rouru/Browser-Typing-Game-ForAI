import { useEffect, useState } from 'react'
import { RUNES } from '../game/balance.ts'
import { genreInfo } from '../game/genres.ts'
import type { BattleSummary } from '../game/rewards.ts'
import type { SaveData } from '../game/save.ts'

interface Props {
  summary: BattleSummary
  save: SaveData
  onRetry: () => void
  onNext: () => void
  onForge: () => void
  onHome: () => void
}

export function ResultScreen({ summary, save, onRetry, onNext, onForge, onHome }: Props) {
  // 戦闘中の打鍵の勢いで誤って画面を進めないよう、少しの間だけキー操作を受け付けません。
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), 900)
    return () => window.clearTimeout(timer)
  }, [])

  const primary = summary.won ? onNext : onRetry

  useEffect(() => {
    if (!armed) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      if (e.target instanceof HTMLButtonElement && e.key === 'Enter') return
      const key = e.key.toLowerCase()
      if (e.key === 'Enter') {
        e.preventDefault()
        primary()
      } else if (key === 'r') onRetry()
      else if (key === 'f') onForge()
      else if (e.key === 'Escape') onHome()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [armed, primary, onRetry, onForge, onHome])

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
    <main className={`result ${summary.won ? 'is-won' : 'is-lost'}`}>
      <header className="result-head">
        <span className={`result-seal ${summary.won ? 'is-defeated' : ''}`} aria-hidden="true">
          {summary.enemyGlyph}
        </span>
        <div>
          <p className="result-stage">
            第{summary.stage}層　{summary.enemyName}
          </p>
          <h1 className="result-title">
            {summary.won ? (summary.finisher ? 'トドメの一撃！' : '討伐成功') : '時間切れ'}
          </h1>
          <p className="result-lead">
            {summary.won
              ? summary.finisher
                ? '大技で仕留めました。欠片の報酬が 1.5 倍になります。'
                : summary.firstClear
                  ? '次の層への道が開きました。'
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
            <span className="reward-label">言霊の欠片</span>
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
                <p className="reward-rune-desc">{RUNES[summary.newRune].description}。鍛冶場で好きなキーに刻めます。</p>
              </div>
            </div>
          )}
          <p className="panel-note">所持している欠片: {save.shards.toLocaleString()}</p>
        </section>
      </div>

      <footer className="result-actions">
        {summary.won && (
          <button type="button" className="primary-button" onClick={onNext}>
            次の層へ <kbd>Enter</kbd>
          </button>
        )}
        <button type="button" className={summary.won ? 'ghost-button' : 'primary-button'} onClick={onRetry}>
          もう一度 <kbd>{summary.won ? 'R' : 'Enter'}</kbd>
        </button>
        <button type="button" className="ghost-button" onClick={onForge}>
          鍛冶場 <kbd>F</kbd>
        </button>
        <button type="button" className="ghost-button" onClick={onHome}>
          塔へ戻る <kbd>Esc</kbd>
        </button>
      </footer>
    </main>
  )
}
