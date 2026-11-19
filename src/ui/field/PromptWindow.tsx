import type { Ref } from 'react'
import { MAX_GENRE_SLOTS, slotKey } from '../../game/balance.ts'
import type { Battle, DefenseResult, TurnReport } from '../../game/battle.ts'
import { genreInfo } from '../../game/genres.ts'
import type { GenreId, PromptKind } from '../../game/types.ts'
import { ACTION_LABEL } from './display.ts'

const KIND_LABEL: Record<PromptKind, string> = {
  word: '単語',
  sentence: '一文',
  short: '短文',
  long: '長文',
}

interface Props {
  battle: Battle
  onSwitchGenre: (genre: GenreId) => void
  windowRef?: Ref<HTMLDivElement>
}

/**
 * 攻撃・防御フェーズのお題ウィンドウ（半透明）と、その上に並ぶジャンル 10 枠。
 * 縁のゲージが残り時間です。防御中は枠が赤くなり、強攻撃ではさらに赤く脈打ちます。
 */
export function PromptWindow({ battle, onSwitchGenre, windowRef }: Props) {
  const { prompt, phase } = battle
  if (!prompt) return null
  const defending = phase === 'defense' || phase === 'defenseIntro'
  const strong = defending && !!battle.defense?.strong
  const waiting = battle.waitingStart
  const seconds = battle.timeLeftMs / 1000
  const ratio =
    waiting || phase === 'defenseIntro' ? 1 : battle.timeLimitMs > 0 ? battle.timeLeftMs / battle.timeLimitMs : 0
  const urgent = (phase === 'attack' && !waiting && seconds <= 5) || phase === 'defense'
  const guide = prompt.session.guide()

  return (
    <div className="bt-typing">
      {!defending && <GenreRow battle={battle} onSwitchGenre={onSwitchGenre} />}
      <div
        ref={windowRef}
        className={`bt-prompt ${defending ? 'is-defense' : ''} ${strong ? 'is-strong' : ''}`}
        aria-label="お題"
      >
        <div className="bt-timer" aria-label="残り時間">
          <i className={urgent ? 'is-urgent' : ''} style={{ transform: `scaleX(${ratio})` }} />
          <span className="bt-timer-text">
            {waiting ? '最初の入力でスタート' : phase === 'defenseIntro' ? '--.-' : `${seconds.toFixed(1)} 秒`}
          </span>
        </div>
        <div className="bt-prompt-meta">
          <span className="bt-prompt-kind">
            {defending ? (strong ? '防御（強攻撃）' : '防御') : KIND_LABEL[prompt.kind]}
          </span>
          <span className="bt-prompt-genre">
            {prompt.genre === 'basic' ? '通常攻撃（MP 0）' : genreInfo(prompt.genre).name}
          </span>
          {defending && <span className="bt-prompt-note">打ち切り率 {Math.round(battle.defenseProgress * 100)}%</span>}
          {defending && battle.defense?.surprised && (
            <span className="bt-prompt-note is-warn">予測できず、お題タイマー −10%</span>
          )}
          {battle.blocked && <span className="bt-prompt-note is-warn">MP 不足：ジャンルを切り替えてください</span>}
        </div>
        <p className={`bt-prompt-text kind-${prompt.kind}`}>{prompt.entry.text}</p>
        <p className="bt-prompt-kana" aria-hidden="true">
          <span className="done">{prompt.session.kana.slice(0, prompt.session.kanaPosition)}</span>
          <span>{prompt.session.kana.slice(prompt.session.kanaPosition)}</span>
        </p>
        <p className="bt-prompt-romaji" aria-label="ローマ字ガイド">
          <span className="done">{guide.typed}</span>
          <span className="cursor">{guide.rest.slice(0, 1)}</span>
          <span>{guide.rest.slice(1)}</span>
        </p>
        {!defending && (
          <p className="bt-prompt-next">
            <span className="bt-next-label">NEXT</span>
            {battle.outOfMp ? '通常攻撃' : `${genreInfo(battle.next.genre).name}｜${battle.next.entry.text}`}
          </p>
        )}
      </div>
    </div>
  )
}

/** ジャンル 10 枠（数字キー 1〜9・0 が枠の順）。 */
function GenreRow({ battle, onSwitchGenre }: { battle: Battle; onSwitchGenre: (genre: GenreId) => void }) {
  const canSwitch = battle.phase === 'attack' && !battle.outOfMp
  return (
    <nav className="bt-genres" aria-label="お題のジャンル">
      {Array.from({ length: MAX_GENRE_SLOTS }, (_, index) => {
        const id = battle.genres[index]
        if (!id) {
          return (
            <span key={`empty-${index}`} className="bt-genre is-empty">
              <b>{slotKey(index)}</b>空き
            </span>
          )
        }
        const active = battle.genre === id && !battle.outOfMp
        return (
          <button
            key={id}
            type="button"
            className={`bt-genre genre-${id} ${active ? 'is-active' : ''}`}
            disabled={!canSwitch || !battle.canUseGenre(id)}
            onClick={() => onSwitchGenre(id)}
            tabIndex={-1}
          >
            <b>{slotKey(index)}</b>
            {genreInfo(id).name}
            <small>MP {battle.mpCost(id)}</small>
          </button>
        )
      })}
    </nav>
  )
}

/** 防御フェーズの結果を 1 行の文章にします。 */
function describeDefense(result: DefenseResult): string {
  const rate = `${Math.round(result.n * 100)}%`
  if (result.outcome === 'dodged') return '打ち切って回避した'
  if (result.outcome === 'forced') return `校正力が尽きて ${result.damage} ダメージ（打ち切り率 ${rate}）`
  if (result.completed) return `打ち切って致命傷を避けた（${result.damage} ダメージ）`
  return `${result.damage} ダメージを受けた（打ち切り率 ${rate}）`
}

/** コマンドフェーズで、直前のターンの経過（簡易リザルト）を表示するウィンドウ。 */
export function TurnReportWindow({ report, enemyName }: { report: TurnReport; enemyName: string }) {
  const title =
    report.kind === 'start'
      ? `${enemyName}が現れた`
      : report.kind === 'waveClear'
        ? `${report.defeated}を倒した。${enemyName}が現れた`
        : `ターン ${report.turn} の経過`
  const lines: string[] = []
  if (report.kind !== 'start') {
    lines.push(`与ダメージ ${report.damage.toLocaleString()}　打鍵数 ${report.strokes}　ミス ${report.misses}`)
  }
  if (report.usedItem) lines.push(`アイテム「${report.usedItem}」を使った`)
  if (report.action) {
    lines.push(
      `敵の行動：${ACTION_LABEL[report.action.type]}「${report.action.name}」${report.defense ? ` → ${describeDefense(report.defense)}` : ''}`,
    )
  }
  if (report.fatigueDamage > 0) lines.push(`疲労で ${report.fatigueDamage} ダメージを受けた`)
  if (report.heal > 0) lines.push(`パートナーのパッシブで HP が ${report.heal} 回復した`)
  return (
    <div className="bt-frame bt-report" role="status">
      <h2 className="bt-report-title">{title}</h2>
      {lines.map((line) => (
        <p key={line} className="bt-report-line">
          {line}
        </p>
      ))}
    </div>
  )
}
