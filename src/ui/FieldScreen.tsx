import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { BATTLE_TIME_MS, GAUGE_PER_BAR } from '../game/balance.ts'
import { Battle, type Affinity, type BattleEvent } from '../game/battle.ts'
import { enemyForStage } from '../game/enemies.ts'
import { GENRES, genreInfo } from '../game/genres.ts'
import type { BattleSummary } from '../game/rewards.ts'
import { buildLoadout, masteryLevels, type SaveData } from '../game/save.ts'
import type { GenreId, PromptKind } from '../game/types.ts'
import { ResultDialog } from './ResultDialog.tsx'

interface Props {
  stage: number
  save: SaveData
  /** 決着がついたとき（勝利・時間切れ）に呼ばれます。 */
  onFinish: (battle: Battle) => void
  /** 決着後の結果。入っている間は結果ダイアログを重ねて表示します。 */
  summary: BattleSummary | null
  /** 退却、または結果ダイアログの「部室へ戻る」。 */
  onLeave: () => void
  /** 結果ダイアログの「再出現まで待機」（同じ依頼にもう一度挑む）。 */
  onRetry: () => void
}

/** 敵の上に浮かぶダメージ表示。 */
interface Pop {
  id: number
  text: string
  tone: 'hit' | 'crit' | 'weak' | 'resist' | 'burst'
  x: number
  y: number
}

interface Banner {
  id: number
  text: string
  tone: 'info' | 'big' | 'end'
}

const KIND_LABEL: Record<PromptKind, string> = {
  word: '単語',
  sentence: '一文',
  short: '短文',
  long: '長文',
}

const AFFINITY_LABEL: Record<Affinity, string> = { weak: '弱点', resist: '耐性', normal: '' }

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function FieldScreen({ stage, save, summary, onFinish, onLeave, onRetry }: Props) {
  // 戦闘の状態は Battle クラスが持ちます。React 側は毎フレーム再描画するだけです。
  const [battle] = useState(
    () => new Battle(enemyForStage(stage), stage, buildLoadout(save), save.lastGenre),
  )
  const [mastery] = useState(() => masteryLevels(save))
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [pops, setPops] = useState<Pop[]>([])
  const [banner, setBanner] = useState<Banner | null>(null)
  const [imeWarning, setImeWarning] = useState(false)
  const [retreatOpen, setRetreatOpen] = useState(false)
  const [inputLocked, setInputLocked] = useState(false)

  const enemyRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(0)
  const ended = useRef(false)
  const endTimer = useRef<number | undefined>(undefined)
  const callbacks = useRef({ onFinish })
  useEffect(() => {
    callbacks.current = { onFinish }
  })

  /** 退却の確認ダイアログを開きます。開いている間は戦闘のタイマーを止めます。 */
  const openRetreat = useCallback(() => {
    if (ended.current) return
    battle.pause(performance.now())
    setRetreatOpen(true)
  }, [battle])

  /** 確認ダイアログを閉じて戦闘に戻ります。再開直後は少しの間、入力が無効になります。 */
  const closeRetreat = useCallback(() => {
    battle.resume(performance.now())
    setRetreatOpen(false)
  }, [battle])

  const showBanner = useCallback((text: string, tone: Banner['tone']) => {
    setBanner({ id: nextId.current++, text, tone })
  }, [])

  /** Battle から出来事を受け取り、演出に変換します。 */
  const handleEvents = useCallback(() => {
    const events: BattleEvent[] = battle.drainEvents()
    if (events.length === 0) return
    const added: Pop[] = []
    const pop = (text: string, tone: Pop['tone'], spread = 1) => {
      added.push({
        id: nextId.current++,
        text,
        tone,
        x: (Math.random() - 0.5) * 220 * spread,
        y: (Math.random() - 0.5) * 70 * spread,
      })
    }
    const animate = !reducedMotion()

    for (const event of events) {
      switch (event.type) {
        case 'hit': {
          const tone = event.crit ? 'crit' : event.affinity === 'normal' ? 'hit' : event.affinity
          pop(String(event.amount), tone)
          if (animate) {
            enemyRef.current?.animate(
              [
                { transform: 'translate(0, 0) scale(1)' },
                { transform: `translate(${event.crit ? 7 : 3}px, -2px) scale(0.97)` },
                { transform: 'translate(0, 0) scale(1)' },
              ],
              { duration: 110 },
            )
          }
          break
        }
        case 'burst': {
          const label =
            event.mode === 'ultimate' ? '奥義' : event.mode === 'skill' ? '大技' : event.noMiss ? '完璧' : '追撃'
          pop(`${label} ${event.amount}`, 'burst', 0.4)
          if (animate) {
            enemyRef.current?.animate(
              [
                { transform: 'scale(1) rotate(0deg)' },
                { transform: 'scale(0.86) rotate(-5deg)' },
                { transform: 'scale(1.04) rotate(2deg)' },
                { transform: 'scale(1) rotate(0deg)' },
              ],
              { duration: 320 },
            )
          }
          break
        }
        case 'miss':
          if (animate) {
            cardRef.current?.animate(
              [
                { transform: 'translateX(0)' },
                { transform: 'translateX(-6px)' },
                { transform: 'translateX(5px)' },
                { transform: 'translateX(0)' },
              ],
              { duration: 140 },
            )
          }
          cardRef.current?.classList.add('is-miss')
          window.setTimeout(() => cardRef.current?.classList.remove('is-miss'), 160)
          break
        case 'phase':
          showBanner(`弱点が「${genreInfo(event.phase.weak).name}」に変わった！`, 'info')
          break
        case 'bigMove':
          showBanner(event.mode === 'ultimate' ? '奥義、解放！' : '大技、発動！', 'big')
          break
        case 'genre':
          break
        case 'end':
          if (!ended.current) {
            ended.current = true
            showBanner(event.status === 'timeup' ? '時間切れ' : event.finisher ? 'トドメ！' : '討伐！', 'end')
            endTimer.current = window.setTimeout(() => callbacks.current.onFinish(battle), 1200)
          }
          break
      }
    }
    if (added.length > 0) setPops((list) => [...list.slice(-23), ...added])
  }, [battle, showBanner])

  // 毎フレーム、残り時間を進めて再描画します。
  useEffect(() => {
    let frame = 0
    const loop = () => {
      const now = performance.now()
      battle.tick(now)
      setInputLocked(battle.isInputLocked(now))
      handleEvents()
      rerender()
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [battle, handleEvents])

  useEffect(() => () => window.clearTimeout(endTimer.current), [])

  // キー入力。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 日本語入力（IME）がオンだと、キーが文字として届きません。
      if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
        setImeWarning(true)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const now = performance.now()

      if (e.key === 'Escape') {
        e.preventDefault()
        if (retreatOpen) closeRetreat()
        else openRetreat()
        return
      }
      // 確認ダイアログや結果ダイアログが出ている間は、戦闘の操作を受け付けません。
      if (retreatOpen || ended.current) return
      if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const back = e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)
        battle.cycleGenre(back ? -1 : 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (battle.status === 'ready') battle.start(now)
        else battle.activate(e.shiftKey ? 'ultimate' : 'skill')
      } else if (e.key === ' ') {
        e.preventDefault()
        if (battle.status === 'ready') battle.start(now)
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const genre = GENRES.find((g) => g.hotkey === e.key)
        if (genre) battle.switchGenre(genre.id)
      } else if (e.key.length === 1) {
        e.preventDefault()
        if (e.repeat) return
        setImeWarning(false)
        battle.type(e.key, now)
      } else {
        return
      }
      handleEvents()
      rerender()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [battle, handleEvents, retreatOpen, openRetreat, closeRetreat])

  const switchTo = (genre: GenreId) => {
    battle.switchGenre(genre)
    handleEvents()
    rerender()
  }

  // ---- 表示用の値 ----
  const { enemy, prompt } = battle
  const session = prompt.session
  const guide = session.guide()
  const kanaDone = session.kana.slice(0, session.kanaPosition)
  const kanaRest = session.kana.slice(session.kanaPosition)
  const seconds = battle.timeLeftMs / 1000
  const hpRatio = battle.hp / battle.maxHp
  const phase = battle.phase
  const promptGenre = genreInfo(prompt.genre)
  const promptAffinity = battle.affinityOf(prompt.genre)
  const bars = [0, 1].map((i) =>
    Math.max(0, Math.min(1, (battle.gauge - i * GAUGE_PER_BAR) / GAUGE_PER_BAR)),
  )
  const canSkill = battle.canUse('skill')
  const canUltimate = battle.canUse('ultimate')

  return (
    <main className={`battle mode-${battle.mode} status-${battle.status}`}>
      <header className="battle-head">
        <div className="battle-stage">
          <span className="stage-no">依頼 {stage}</span>
          {enemy.boss && <span className="boss-tag">BOSS</span>}
        </div>
        <div className={`timer ${seconds <= 5 ? 'is-urgent' : ''}`} aria-label="残り時間">
          <span className="timer-num">{seconds.toFixed(1)}</span>
          <span className="timer-unit">秒</span>
        </div>
        <button type="button" className="ghost-button" onClick={openRetreat}>
          <kbd>Esc</kbd> 退却
        </button>
      </header>
      <div className="timer-bar" aria-hidden="true">
        <div
          className={`timer-bar-fill ${seconds <= 5 ? 'is-urgent' : ''}`}
          style={{ transform: `scaleX(${battle.timeLeftMs / BATTLE_TIME_MS})` }}
        />
      </div>

      <section className="enemy-area">
        <div className="enemy-stage">
          <div
            ref={enemyRef}
            className={`enemy-seal ${enemy.boss ? 'is-boss' : ''} ${battle.status === 'won' ? 'is-defeated' : ''}`}
          >
            <span>{enemy.glyph}</span>
          </div>
          <div className="pops" aria-hidden="true">
            {pops.map((p) => (
              <span
                key={p.id}
                className={`pop pop-${p.tone}`}
                style={{ left: `calc(50% + ${p.x}px)`, top: `calc(42% + ${p.y}px)` }}
                onAnimationEnd={() => setPops((list) => list.filter((q) => q.id !== p.id))}
              >
                {p.text}
              </span>
            ))}
          </div>
          {banner && (
            <div key={banner.id} className={`banner banner-${banner.tone}`} role="status">
              {banner.text}
            </div>
          )}
        </div>
        <div className="enemy-info">
          <h1 className="enemy-name">{enemy.name}</h1>
          <div className="hp">
            <div className="hp-bar">
              <div className="hp-fill" style={{ transform: `scaleX(${hpRatio})` }} />
              {enemy.phases.slice(1).map((_, i) => (
                <span
                  key={i}
                  className="hp-tick"
                  style={{ left: `${(1 - (i + 1) / enemy.phases.length) * 100}%` }}
                />
              ))}
            </div>
            <div className="hp-num">
              {battle.hp.toLocaleString()} <span>/ {battle.maxHp.toLocaleString()}</span>
            </div>
          </div>
          <div className="affinities">
            <span className={`affinity is-weak genre-${phase.weak}`}>
              弱点 <b>{genreInfo(phase.weak).name}</b>
            </span>
            {phase.resist && (
              <span className={`affinity is-resist genre-${phase.resist}`}>
                耐性 <b>{genreInfo(phase.resist).name}</b>
              </span>
            )}
          </div>
        </div>
      </section>

      <nav className="genre-tabs" aria-label="お題のジャンル">
        {GENRES.map((g) => {
          const affinity = battle.affinityOf(g.id)
          return (
            <button
              key={g.id}
              type="button"
              className={`genre-tab genre-${g.id} ${battle.genre === g.id ? 'is-active' : ''} is-${affinity}`}
              onClick={() => switchTo(g.id)}
              disabled={battle.mode !== 'normal'}
              tabIndex={-1}
            >
              <kbd>{g.hotkey}</kbd>
              <span className="genre-tab-name">{g.name}</span>
              <span className="genre-tab-lv">熟練 {mastery[g.id]}</span>
              {affinity !== 'normal' && <span className="genre-tab-mark">{AFFINITY_LABEL[affinity]}</span>}
            </button>
          )
        })}
        <span className="genre-hint">
          <kbd>Tab</kbd> / 数字キーで切替
        </span>
      </nav>

      <section ref={cardRef} className={`prompt-card genre-${prompt.genre}`}>
        <div className="prompt-meta">
          <span className="prompt-kind">
            {prompt.mode === 'ultimate' ? '奥義' : prompt.mode === 'skill' ? '大技' : KIND_LABEL[prompt.kind]}
          </span>
          <span className="prompt-genre">{promptGenre.name}</span>
          {promptAffinity !== 'normal' && (
            <span className={`prompt-affinity is-${promptAffinity}`}>
              {promptAffinity === 'weak' ? '弱点を突いている ×1.5' : '耐性で軽減 ×0.6'}
            </span>
          )}
        </div>
        <p className={`prompt-text kind-${prompt.kind}`}>{prompt.entry.text}</p>
        <p className="prompt-kana" aria-hidden="true">
          <span className="done">{kanaDone}</span>
          <span>{kanaRest}</span>
        </p>
        <p className="prompt-romaji" aria-label="ローマ字ガイド">
          <span className="done">{guide.typed}</span>
          <span className="cursor">{guide.rest.slice(0, 1)}</span>
          <span>{guide.rest.slice(1)}</span>
        </p>
        {battle.status === 'ready' && (
          <div className="ready-overlay">
            <p className="ready-main">
              <kbd>Space</kbd> で戦闘開始
            </p>
            <p className="ready-sub">30 秒のあいだ、1 打鍵ごとに敵へダメージが入ります。開始前でもジャンルは切り替えられます。</p>
          </div>
        )}
      </section>

      <footer className="battle-foot">
        <div className="next">
          <span className="label">NEXT</span>
          <span className="next-text">
            {battle.mode === 'normal' ? battle.next.entry.text : `${battle.next.entry.text}（大技のあと）`}
          </span>
        </div>
        <div className="combo" aria-label="コンボ">
          <span className="combo-num">{battle.combo}</span>
          <span className="label">COMBO</span>
        </div>
        <div className="gauge">
          <div className="gauge-bars" aria-label="大技ゲージ">
            {bars.map((ratio, i) => (
              <div key={i} className={`gauge-bar ${ratio >= 1 ? 'is-full' : ''}`}>
                <div className="gauge-fill" style={{ transform: `scaleX(${ratio})` }} />
              </div>
            ))}
          </div>
          <div className="gauge-keys">
            <span className={`gauge-key ${canSkill ? 'is-ready' : ''}`}>
              <kbd>Enter</kbd> 大技（短文）
            </span>
            <span className={`gauge-key ${canUltimate ? 'is-ready' : ''}`}>
              <kbd>Shift</kbd>+<kbd>Enter</kbd> 奥義（長文）
            </span>
          </div>
        </div>
      </footer>

      {inputLocked && !retreatOpen && (
        <div className="resume-lock" role="status">
          再開中…
        </div>
      )}

      {retreatOpen && (
        <div className="dialog-backdrop">
          <div className="dialog small" role="dialog" aria-modal="true" aria-labelledby="retreat-title">
            <h2 id="retreat-title" className="screen-title">
              退却しますか？
            </h2>
            <p className="dialog-body">退却すると、この戦闘の報酬は手に入りません。</p>
            <div className="dialog-actions">
              <button type="button" className="primary-button" autoFocus onClick={closeRetreat}>
                戦闘に戻る <kbd>Esc</kbd>
              </button>
              <button type="button" className="ghost-button" onClick={onLeave}>
                退却する
              </button>
            </div>
          </div>
        </div>
      )}

      {summary && <ResultDialog summary={summary} shards={save.shards} onRetry={onRetry} onLeave={onLeave} />}

      {imeWarning && (
        <div className="ime-warning" role="alert">
          日本語入力（IME）がオンになっています。半角英数に切り替えてください。
        </div>
      )}
    </main>
  )
}
