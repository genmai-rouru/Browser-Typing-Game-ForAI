import { useEffect } from 'react'
import {
  MASTERY_MAX_LEVEL,
  attackForLevel,
  expToNext,
  masteryLevel,
  masteryThreshold,
} from '../game/balance.ts'
import { STAGE_COUNT, enemyForStage } from '../game/enemies.ts'
import { GENRES, genreInfo } from '../game/genres.ts'
import type { SaveData } from '../game/save.ts'

interface Props {
  save: SaveData
  onStart: (stage: number) => void
  onForge: () => void
  onHelp: () => void
  onReset: () => void
  /** 説明ダイアログなどが開いている間は、キー操作を止めます。 */
  keyboardEnabled: boolean
}

export function HomeScreen({ save, onStart, onForge, onHelp, onReset, keyboardEnabled }: Props) {
  const frontier = save.clearedStage + 1
  const lastStage = Math.max(STAGE_COUNT, frontier)
  const stages = Array.from({ length: lastStage }, (_, i) => i + 1)
  const need = expToNext(save.level)
  const freeRunes = save.runes.filter((r) => r.key === null).length

  useEffect(() => {
    if (!keyboardEnabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      // ボタンにフォーカスがあるときは、ブラウザ標準の Enter 動作に任せます。
      if (e.target instanceof HTMLButtonElement) return
      if (e.key === 'Enter') {
        e.preventDefault()
        onStart(frontier)
      } else if (e.key.toLowerCase() === 'f') {
        onForge()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keyboardEnabled, frontier, onStart, onForge])

  return (
    <main className="home">
      <header className="home-head">
        <div className="title-block">
          <span className="title-seal" aria-hidden="true">
            言
          </span>
          <div>
            <h1 className="title">三十秒の言霊</h1>
            <p className="subtitle">打鍵が刃になる、RPG タイピング</p>
          </div>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost-button" onClick={onHelp}>
            遊び方
          </button>
          <button type="button" className="ghost-button" onClick={onForge}>
            <kbd>F</kbd> 鍛冶場
            {freeRunes > 0 && <span className="notice-dot">{freeRunes}</span>}
          </button>
        </div>
      </header>

      <div className="home-grid">
        <section className="panel status-panel" aria-label="ステータス">
          <h2 className="panel-title">言霊使い</h2>
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
              <dt>攻撃力</dt>
              <dd>{attackForLevel(save.level)}</dd>
            </div>
            <div>
              <dt>言霊の欠片</dt>
              <dd>{save.shards.toLocaleString()}</dd>
            </div>
            <div>
              <dt>最高到達</dt>
              <dd>{save.clearedStage === 0 ? '—' : `第${save.clearedStage}層`}</dd>
            </div>
            <div>
              <dt>戦闘回数</dt>
              <dd>{save.battles}</dd>
            </div>
          </dl>

          <h2 className="panel-title">ジャンル熟練度</h2>
          <ul className="mastery-list">
            {GENRES.map((g) => {
              const strokes = save.masteryStrokes[g.id]
              const level = masteryLevel(strokes)
              const base = masteryThreshold(level)
              const next = masteryThreshold(level + 1)
              const ratio = level >= MASTERY_MAX_LEVEL ? 1 : (strokes - base) / (next - base)
              return (
                <li key={g.id} className={`mastery genre-${g.id}`}>
                  <span className="mastery-glyph">{g.glyph}</span>
                  <span className="mastery-name">{g.name}</span>
                  <span className="mastery-lv">Lv {level}</span>
                  <div className="meter">
                    <div className="meter-fill" style={{ transform: `scaleX(${ratio})` }} />
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="panel-note">そのジャンルのお題を打つほど育ち、ダメージが伸びます（Lv ごとに +3%）。</p>
          <button type="button" className="text-button" onClick={onReset}>
            データを初期化
          </button>
        </section>

        <section className="panel stage-panel" aria-label="階層の選択">
          <h2 className="panel-title">言の葉の塔</h2>
          <ol className="stage-list">
            {stages.map((stage) => {
              const enemy = enemyForStage(stage)
              const cleared = stage <= save.clearedStage
              const open = stage <= frontier
              const best = save.bestDamage[String(stage)] ?? 0
              return (
                <li key={stage}>
                  <button
                    type="button"
                    className={`stage ${cleared ? 'is-cleared' : ''} ${stage === frontier ? 'is-frontier' : ''} ${enemy.boss ? 'is-boss' : ''}`}
                    disabled={!open}
                    onClick={() => onStart(stage)}
                  >
                    <span className="stage-num">第{stage}層</span>
                    <span className="stage-glyph" aria-hidden="true">
                      {open ? enemy.glyph : '？'}
                    </span>
                    <span className="stage-body">
                      <span className="stage-name">
                        {open ? enemy.name : '？？？'}
                        {enemy.boss && open && <span className="boss-tag">BOSS</span>}
                      </span>
                      <span className="stage-detail">
                        {open ? (
                          <>
                            HP {enemy.hp.toLocaleString()}
                            <span className="stage-weak">
                              弱点{' '}
                              {enemy.phases.map((p, i) => (
                                <span key={i} className={`mini-chip genre-${p.weak}`}>
                                  {genreInfo(p.weak).name}
                                </span>
                              ))}
                            </span>
                          </>
                        ) : (
                          '前の層を突破すると挑めます'
                        )}
                      </span>
                    </span>
                    <span className="stage-state">
                      {cleared ? (
                        <span className="stamp">突破</span>
                      ) : stage === frontier ? (
                        <span className="go">
                          挑む <kbd>Enter</kbd>
                        </span>
                      ) : null}
                      {best > 0 && !cleared && (
                        <span className="stage-best">最高 {Math.round((best / enemy.hp) * 100)}%</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      </div>
    </main>
  )
}
