import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Battle, type BattleEvent, type DefenseResult, type TurnReport } from '../game/battle.ts'
import { requestById } from '../game/enemies.ts'
import { genreInfo } from '../game/genres.ts'
import type { BattleSummary } from '../game/rewards.ts'
import { buildLoadout, type SaveData } from '../game/save.ts'
import type { EnemyAction, GenreId, PromptKind } from '../game/types.ts'
import { ResultDialog } from './ResultDialog.tsx'

interface Props {
  requestId: number
  save: SaveData
  /** 決着後の結果。入っている間は結果ダイアログを重ねて表示します。 */
  summary: BattleSummary | null
  /** 決着がついたとき（勝利・敗北）に呼ばれます。 */
  onFinish: (battle: Battle) => void
  /** 退却、または結果ダイアログの「部室へ戻る」。 */
  onLeave: () => void
  /** 結果ダイアログの「再出現まで待機」（同じ依頼にもう一度挑む）。 */
  onRetry: () => void
}

/** 敵の上に浮かぶダメージ表示。 */
interface Pop {
  id: number
  text: string
  tone: 'hit' | 'crit' | 'burst' | 'whiff'
  x: number
  y: number
}

interface Banner {
  id: number
  text: string
  tone: 'info' | 'danger' | 'end'
}

const KIND_LABEL: Record<PromptKind, string> = {
  word: '単語',
  sentence: '一文',
  short: '短文',
  long: '長文',
}

const ACTION_LABEL: Record<EnemyAction['type'], string> = {
  attack: '通常攻撃',
  strong: '強攻撃',
  idle: '非攻撃',
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 防御フェーズの結果を 1 行の文章にします。 */
function describeDefense(result: DefenseResult): string {
  const rate = `${Math.round(result.n * 100)}%`
  if (result.outcome === 'dodged') return '打ち切って回避した'
  if (result.outcome === 'forced') return `校正力が尽きて ${result.damage} ダメージ（打ち切り率 ${rate}）`
  if (result.completed) return `打ち切って致命傷を避けた（${result.damage} ダメージ）`
  return `${result.damage} ダメージを受けた（打ち切り率 ${rate}）`
}

export function FieldScreen({ requestId, save, summary, onFinish, onLeave, onRetry }: Props) {
  // 戦闘の状態は Battle クラスが持ちます。React 側は毎フレーム再描画するだけです。
  const [battle] = useState(() => new Battle(requestById(requestId), buildLoadout(save), save.lastGenre))
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [pops, setPops] = useState<Pop[]>([])
  const [banner, setBanner] = useState<Banner | null>(null)
  const [imeWarning, setImeWarning] = useState(false)
  const [retreatOpen, setRetreatOpen] = useState(false)
  const [inputLocked, setInputLocked] = useState(false)

  const enemyRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(0)
  const ended = useRef(false)
  const endTimer = useRef<number | undefined>(undefined)
  const callbacks = useRef({ onFinish })
  useEffect(() => {
    callbacks.current = { onFinish }
  })

  const showBanner = useCallback((text: string, tone: Banner['tone']) => {
    setBanner({ id: nextId.current++, text, tone })
  }, [])

  /** 退却の確認ダイアログを開きます。開いている間は戦闘の時間を止めます。 */
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
    const shake = (el: HTMLElement | null, size: number, duration: number) => {
      if (!animate || !el) return
      el.animate(
        [
          { transform: 'translateX(0)' },
          { transform: `translateX(${-size}px)` },
          { transform: `translateX(${size}px)` },
          { transform: 'translateX(0)' },
        ],
        { duration },
      )
    }

    for (const event of events) {
      switch (event.type) {
        case 'hit':
          pop(String(event.amount), event.crit ? 'crit' : 'hit')
          shake(enemyRef.current, event.crit ? 7 : 3, 110)
          break
        case 'whiff':
          pop('ミス', 'whiff')
          break
        case 'burst':
          pop(`${event.noMiss ? '完璧' : '追撃'} ${event.amount}`, 'burst', 0.4)
          shake(enemyRef.current, 10, 260)
          break
        case 'miss':
          shake(cardRef.current, 6, 140)
          cardRef.current?.classList.add('is-miss')
          window.setTimeout(() => cardRef.current?.classList.remove('is-miss'), 160)
          break
        case 'mpShort':
          showBanner('MP が足りません。ジャンルを切り替えてください', 'info')
          break
        case 'defenseStart':
          showBanner(`${event.action.name}！`, 'danger')
          break
        case 'playerDamage':
          if (event.amount > 0) shake(playerRef.current, 8, 220)
          showBanner(event.amount === 0 ? '回避！' : `${event.amount} ダメージ`, event.amount === 0 ? 'info' : 'danger')
          break
        case 'waveClear':
          showBanner(`${event.defeated}を倒した！`, 'info')
          break
        case 'end':
          if (!ended.current) {
            ended.current = true
            showBanner(event.status === 'won' ? '討伐成功！' : '力尽きた…', 'end')
            endTimer.current = window.setTimeout(() => callbacks.current.onFinish(battle), 1200)
          }
          break
      }
    }
    if (added.length > 0) setPops((list) => [...list.slice(-23), ...added])
  }, [battle, showBanner])

  // 毎フレーム、時間を進めて再描画します。
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
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (e.repeat) return
        battle.proceed(now)
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        // 数字キーは、セットの並び順（1 枠目から）に対応します。
        const genre = battle.genres[Number(e.key) - 1]
        if (genre) battle.switchGenre(genre)
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
    rerender()
  }

  const proceed = () => {
    battle.proceed(performance.now())
    rerender()
  }

  // ---- 表示用の値 ----
  const { enemy, prompt, player, phase, report } = battle
  const defending = phase === 'defense' || phase === 'defenseIntro'
  const typing = phase === 'attack' || defending
  const seconds = battle.timeLeftMs / 1000
  const timeRatio = battle.timeLimitMs > 0 ? battle.timeLeftMs / battle.timeLimitMs : 0
  const forecast = battle.forecast
  const fatigue = battle.fatigue
  const canSwitch = (phase === 'attack' || phase === 'command') && !battle.outOfMp
  const urgent = (phase === 'attack' && seconds <= 5) || phase === 'defense'

  return (
    <main className={`battle phase-${phase}`}>
      <header className="battle-head">
        <div className="battle-stage">
          <span className="stage-no">{battle.request.title}</span>
          <span className="battle-progress">
            ウェーブ {battle.waveIndex + 1}/{battle.waveCount}　ターン {Math.max(1, battle.turn)}
          </span>
        </div>
        <div className={`timer ${urgent ? 'is-urgent' : ''}`} aria-label="残り時間">
          {typing ? (
            <>
              <span className="timer-label">{defending ? 'お題タイマー' : '攻撃'}</span>
              <span className="timer-num">{phase === 'defenseIntro' ? '--.-' : seconds.toFixed(1)}</span>
              <span className="timer-unit">秒</span>
            </>
          ) : (
            <span className="timer-label">コマンド</span>
          )}
        </div>
        <button type="button" className="ghost-button" onClick={openRetreat}>
          <kbd>Esc</kbd> 退却
        </button>
      </header>
      <div className="timer-bar" aria-hidden="true">
        <div
          className={`timer-bar-fill ${urgent ? 'is-urgent' : ''}`}
          style={{ transform: `scaleX(${phase === 'defenseIntro' ? 1 : typing ? timeRatio : 0})` }}
        />
      </div>

      <section className="enemy-area">
        <div className="enemy-stage">
          <div
            ref={enemyRef}
            className={`enemy-seal ${enemy.boss ? 'is-boss' : ''} ${phase === 'won' ? 'is-defeated' : ''}`}
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
          <h1 className="enemy-name">
            {enemy.name}
            {enemy.boss && <span className="boss-tag">BOSS</span>}
          </h1>
          <div className="hp">
            <div className="hp-bar">
              <div className="hp-fill" style={{ transform: `scaleX(${battle.enemyHp / enemy.hp})` }} />
            </div>
            <div className="hp-num">
              {battle.enemyHp.toLocaleString()} <span>/ {enemy.hp.toLocaleString()}</span>
            </div>
          </div>
          <div className="forecast-row">
            {forecast ? (
              <span className={`forecast is-${forecast.type}`}>
                {defending ? '行動' : '予告'} <b>{ACTION_LABEL[forecast.type]}</b>「{forecast.name}」
              </span>
            ) : (
              <span className="forecast is-hidden">残り 2 秒で次の行動を予告</span>
            )}
          </div>
        </div>
      </section>

      <section ref={playerRef} className="player-bars" aria-label="リーダーの状態">
        <Gauge label="HP" tone="hp" value={battle.hp} max={player.maxHp} />
        <Gauge label="MP" tone="mp" value={battle.mp} max={player.maxMp} />
        <Gauge label="校正力" tone="prr" value={battle.prr} max={player.prr} />
        {fatigue > 0 && <span className="fatigue-chip">疲労 {fatigue}</span>}
      </section>

      <nav className="genre-tabs" aria-label="お題のジャンル">
        {battle.genres.map((id, index) => ({ ...genreInfo(id), slot: index + 1 })).map((g) => (
          <button
            key={g.id}
            type="button"
            className={`genre-tab genre-${g.id} ${battle.genre === g.id && !battle.outOfMp ? 'is-active' : ''}`}
            onClick={() => switchTo(g.id)}
            disabled={!canSwitch || !battle.canUseGenre(g.id)}
            tabIndex={-1}
          >
            <kbd>{g.slot}</kbd>
            <span className="genre-tab-name">{g.name}</span>
            <span className="genre-tab-lv">MP {battle.mpCost(g.id)}</span>
          </button>
        ))}
        <span className="genre-hint">
          <kbd>Tab</kbd> / 数字キーで切替（次のお題から）
        </span>
      </nav>

      <section
        ref={cardRef}
        className={`prompt-card ${prompt && prompt.genre !== 'basic' ? `genre-${prompt.genre}` : ''} ${defending ? 'is-defense' : ''}`}
      >
        {prompt ? (
          <>
            <div className="prompt-meta">
              <span className="prompt-kind">
                {defending ? (battle.defense?.strong ? '防御（強攻撃）' : '防御') : KIND_LABEL[prompt.kind]}
              </span>
              <span className="prompt-genre">
                {prompt.genre === 'basic' ? '通常攻撃（MP 0）' : genreInfo(prompt.genre).name}
              </span>
              {defending && (
                <span className="prompt-note">打ち切り率 {Math.round(battle.defenseProgress * 100)}%</span>
              )}
              {battle.blocked && <span className="prompt-note is-warn">MP 不足：ジャンルを切り替えてください</span>}
            </div>
            <p className={`prompt-text kind-${prompt.kind}`}>{prompt.entry.text}</p>
            <p className="prompt-kana" aria-hidden="true">
              <span className="done">{prompt.session.kana.slice(0, prompt.session.kanaPosition)}</span>
              <span>{prompt.session.kana.slice(prompt.session.kanaPosition)}</span>
            </p>
            <PromptGuide typed={prompt.session.guide().typed} rest={prompt.session.guide().rest} />
          </>
        ) : (
          <CommandPanel report={report} ended={battle.ended} nextEnemy={enemy.name} onProceed={proceed} />
        )}
      </section>

      <footer className="battle-foot">
        <div className="next">
          <span className="label">NEXT</span>
          <span className="next-text">
            {battle.outOfMp ? (
              '通常攻撃'
            ) : (
              <>
                <span className={`mini-chip genre-${battle.next.genre}`}>{genreInfo(battle.next.genre).name}</span>{' '}
                {battle.next.entry.text}
              </>
            )}
          </span>
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

function Gauge({ label, tone, value, max }: { label: string; tone: string; value: number; max: number }) {
  return (
    <div className={`gauge-row gauge-${tone}`}>
      <span className="gauge-label">{label}</span>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ transform: `scaleX(${max > 0 ? value / max : 0})` }} />
      </div>
      <span className="gauge-num">
        {value}
        <span> / {max}</span>
      </span>
    </div>
  )
}

function PromptGuide({ typed, rest }: { typed: string; rest: string }) {
  return (
    <p className="prompt-romaji" aria-label="ローマ字ガイド">
      <span className="done">{typed}</span>
      <span className="cursor">{rest.slice(0, 1)}</span>
      <span>{rest.slice(1)}</span>
    </p>
  )
}

/** コマンドフェーズ。直前の経過（簡易リザルト）を表示し、次のターンへ進みます。 */
function CommandPanel({
  report,
  ended,
  nextEnemy,
  onProceed,
}: {
  report: TurnReport
  ended: boolean
  nextEnemy: string
  onProceed: () => void
}) {
  if (ended) return <div className="command" />
  const title =
    report.kind === 'start'
      ? `${nextEnemy}が現れた`
      : report.kind === 'waveClear'
        ? `${report.defeated}を倒した。${nextEnemy}が現れた`
        : `ターン ${report.turn} の経過`
  return (
    <div className="command">
      <h2 className="command-title">{title}</h2>
      {report.kind !== 'start' && (
        <dl className="command-stats">
          <div>
            <dt>与ダメージ</dt>
            <dd>{report.damage.toLocaleString()}</dd>
          </div>
          <div>
            <dt>打鍵数</dt>
            <dd>{report.strokes}</dd>
          </div>
          <div>
            <dt>ミス</dt>
            <dd>{report.misses}</dd>
          </div>
        </dl>
      )}
      {report.action && (
        <p className="command-line">
          敵の行動：<b>{ACTION_LABEL[report.action.type]}</b>「{report.action.name}」
          {report.defense ? ` → ${describeDefense(report.defense)}` : ''}
        </p>
      )}
      {report.fatigueDamage > 0 && <p className="command-line">疲労で {report.fatigueDamage} ダメージを受けた</p>}
      <p className="command-items">アイテム：準備中</p>
      <button type="button" className="primary-button" onClick={onProceed}>
        {report.kind === 'start' ? '戦闘開始' : '次のターンへ'} <kbd>Space</kbd>
      </button>
    </div>
  )
}
