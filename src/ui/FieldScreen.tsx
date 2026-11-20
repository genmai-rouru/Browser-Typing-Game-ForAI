import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import './field/field.css'
import { MP_COST } from '../game/balance.ts'
import { Battle, type BattleEvent } from '../game/battle.ts'
import { requestById } from '../game/enemies.ts'
import { genreInfo } from '../game/genres.ts'
import { ITEMS, rarityStars } from '../game/items.ts'
import { ROLE_NAMES, describeUnique, type PartnerRole } from '../game/partners.ts'
import type { BattleSummary } from '../game/rewards.ts'
import { buildLoadout, type SaveData } from '../game/save.ts'
import type { GenreId } from '../game/types.ts'
import { enemyPositions, type Pop } from './field/display.ts'
import { EnemyView, FatigueBadge, PartyView, StatusBar, TopBar } from './field/Hud.tsx'
import { InfoWindow, MenuWindow } from './field/MenuWindow.tsx'
import { PauseMenu } from './field/PauseMenu.tsx'
import { PromptWindow, TurnReportWindow } from './field/PromptWindow.tsx'
import { menuInputOf, moveCursor, type MenuEntry, type MenuInfo, type MenuInput } from './field/menu.ts'
import { ResultDialog } from './ResultDialog.tsx'
import { IMAGE_PATHS } from './stage/assets.ts'
import { GameImage } from './stage/GameImage.tsx'
import { GameStage } from './stage/GameStage.tsx'

interface Props {
  requestId: number
  save: SaveData
  /** 決着後の結果。入っている間は結果ダイアログを重ねて表示します。 */
  summary: BattleSummary | null
  /** 決着がついたとき（勝利・敗北）に呼ばれます。 */
  onFinish: (battle: Battle) => void
  /** 退却したとき。使ったアイテムを減らすために、戦闘の状態を渡します。 */
  onRetreat: (battle: Battle) => void
  /** 結果ダイアログの「部室へ戻る」。 */
  onLeave: () => void
  /** 結果ダイアログの「再出現まで待機」（同じ依頼にもう一度挑む）。 */
  onRetry: () => void
}

interface Banner {
  id: number
  text: string
  tone: 'info' | 'danger' | 'end'
}

/** コマンドフェーズのメニューの状態。level が開いているウィンドウです。 */
interface CommandMenu {
  /** genre = スキル（お題のジャンル）、support = サポートスキル、item = アイテム。 */
  level: 'main' | SubLevel
  main: number
  sub: number
}

type SubLevel = 'genre' | 'support' | 'item'

const MENU_TOP: CommandMenu = { level: 'main', main: 0, sub: 0 }

type MainCommand = 'attack' | SubLevel | 'equip'

const SUB_TITLES: Record<SubLevel, string> = { genre: 'スキル', support: 'サポートスキル', item: 'アイテム' }

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ---- メニューの中身（戦闘の状態から毎回作ります） ----

interface MenuModel<T> {
  entries: MenuEntry[]
  values: T[]
}

/** サブ一覧（スキル・サポートスキル・アイテム）は、隣の説明ウィンドウの中身も持ちます。 */
interface SubMenuModel<T> extends MenuModel<T> {
  infos: MenuInfo[]
}

function mainMenu(battle: Battle): MenuModel<MainCommand> {
  const hasParty = battle.party.length > 0
  const items = heldItems(battle)
  const itemBlocked = battle.skillUsedThisTurn
  const anyGenre = battle.genres.some((g) => battle.canUseGenreSkill(g))
  return {
    values: ['attack', 'genre', 'support', 'equip', 'item'],
    entries: [
      { id: 'attack', label: '攻撃' },
      { id: 'genre', label: 'スキル', note: anyGenre ? undefined : 'MP 不足', disabled: !anyGenre },
      { id: 'support', label: 'サポートスキル', note: hasParty ? undefined : 'なし', disabled: !hasParty },
      { id: 'equip', label: '装備', note: '準備中', disabled: true },
      {
        id: 'item',
        label: 'アイテム',
        // サポートスキルを使ったターンは、アイテムを使えません。
        note: items.length === 0 ? 'なし' : itemBlocked ? 'このターンは不可' : undefined,
        disabled: items.length === 0 || itemBlocked,
      },
    ],
  }
}

/** スキル：どのジャンルのお題で攻撃するかを選びます（図書室のセットの並び順）。 */
function genreMenu(battle: Battle): SubMenuModel<GenreId> {
  return {
    values: [...battle.genres],
    entries: battle.genres.map((g) => ({
      id: g,
      label: genreInfo(g).name,
      note: `MP ${MP_COST[g]}`,
      disabled: !battle.canUseGenreSkill(g),
    })),
    infos: battle.genres.map((g) => ({
      title: genreInfo(g).name,
      sub: `お題 1 つにつき MP ${MP_COST[g]}`,
      lines: [
        `いまの MP（${battle.mp}）で、あと ${Math.floor(battle.mp / MP_COST[g])} 題打てます。`,
        'お題を打ち始めるたびに MP を消費します。戦闘中にジャンルは切り替えられません。',
        'MP が足りなくなると「魔力が足りない！」で攻撃が終わります。',
      ],
      warn: battle.canUseGenre(g) ? undefined : 'MP が足りません',
    })),
  }
}

function supportMenu(battle: Battle): SubMenuModel<PartnerRole> {
  const roles: PartnerRole[] = ['front', 'back']
  const model: SubMenuModel<PartnerRole> = { entries: [], infos: [], values: [] }
  for (const role of roles) {
    const member = battle.partyMember(role)
    model.values.push(role)
    if (!member) {
      model.entries.push({ id: role, label: `${ROLE_NAMES[role]}：空き`, disabled: true })
      model.infos.push({ title: `${ROLE_NAMES[role]}：空き`, lines: ['同行しているパートナーがいません。'] })
      continue
    }
    const ready = battle.canUseSkill(role)
    model.entries.push({
      id: role,
      label: member.def.unique.name,
      note: member.cooldown > 0 ? `あと${member.cooldown}ターン` : ROLE_NAMES[role],
      disabled: !ready,
    })
    model.infos.push({
      title: `${member.def.unique.name} Lv.${member.uniqueLv}`,
      sub: `${ROLE_NAMES[role]}　${member.def.name}`,
      lines: [describeUnique(member.def, member.uniqueLv), `クールダウン ${member.def.unique.cooldown} ターン`],
      warn: member.cooldown > 0 ? `あと ${member.cooldown} ターンで使えます` : undefined,
    })
  }
  return model
}

function itemMenu(battle: Battle): SubMenuModel<string> {
  const defs = heldItems(battle)
  return {
    values: defs.map((d) => d.id),
    entries: defs.map((d) => ({
      id: d.id,
      label: d.name,
      note: `×${battle.items[d.id]}`,
      disabled: !battle.canUseItem(d.id),
    })),
    infos: defs.map((d) => ({
      title: d.name,
      sub: rarityStars(d.rarity),
      lines: [d.description, `残り ${battle.items[d.id]} 個`, '使うとこのターンは攻撃できず、予告なしで敵の行動に移ります。'],
    })),
  }
}

function subMenu(battle: Battle, level: SubLevel): SubMenuModel<string> {
  if (level === 'genre') return genreMenu(battle)
  if (level === 'support') return supportMenu(battle)
  return itemMenu(battle)
}

/** 持ち込んだアイテムのうち、まだ残っているもの（一覧の並び順）。 */
function heldItems(battle: Battle) {
  return ITEMS.filter((def) => (battle.items[def.id] ?? 0) > 0)
}

export function FieldScreen({ requestId, save, summary, onFinish, onRetreat, onLeave, onRetry }: Props) {
  // 戦闘の状態は Battle クラスが持ちます。React 側は毎フレーム再描画するだけです。
  const [battle] = useState(() => new Battle(requestById(requestId), buildLoadout(save), save.lastGenre))
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [pops, setPops] = useState<Pop[]>([])
  const [banner, setBanner] = useState<Banner | null>(null)
  const [imeWarning, setImeWarning] = useState(false)
  const [pauseOpen, setPauseOpen] = useState(false)
  /** ポーズ中に表示している内容（ポーズメニュー / 退却の確認）。 */
  const [pauseView, setPauseView] = useState<'menu' | 'confirm'>('menu')
  const [pauseCursor, setPauseCursor] = useState(0)
  const [inputLocked, setInputLocked] = useState(false)
  const [menu, setMenu] = useState<CommandMenu>(MENU_TOP)

  const enemyRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
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

  /** ポーズメニューを開きます。開いている間は戦闘の時間を止めます。 */
  const openPause = useCallback(() => {
    if (ended.current) return
    battle.pause(performance.now())
    setPauseCursor(0)
    setPauseView('menu')
    setPauseOpen(true)
  }, [battle])

  /** ポーズを解除します。再開直後は少しの間、入力が無効になります。 */
  const closePause = useCallback(() => {
    battle.resume(performance.now())
    setPauseOpen(false)
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
        x: (Math.random() - 0.5) * 300 * spread,
        y: -40 + (Math.random() - 0.5) * 200 * spread,
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
          shake(enemyRef.current, event.crit ? 10 : 4, 110)
          break
        case 'whiff':
          pop('ミス', 'whiff')
          break
        case 'burst':
          pop(`${event.noMiss ? '完璧' : '追撃'} ${event.amount}`, 'burst', 0.4)
          shake(enemyRef.current, 14, 260)
          break
        case 'miss':
          shake(promptRef.current, 8, 140)
          promptRef.current?.classList.add('is-miss')
          window.setTimeout(() => promptRef.current?.classList.remove('is-miss'), 160)
          break
        case 'mpOut':
          showBanner('魔力が足りない！', 'danger')
          break
        case 'defenseStart':
          showBanner(`${event.action.name}！`, 'danger')
          break
        case 'playerDamage':
          if (event.amount > 0) shake(statusRef.current, 10, 220)
          showBanner(event.amount === 0 ? '回避！' : `${event.amount} ダメージ`, event.amount === 0 ? 'info' : 'danger')
          break
        case 'partnerSkill':
          pop(`${event.skill} ${event.amount}`, 'burst', 0.4)
          shake(enemyRef.current, 16, 320)
          showBanner(`${event.partner}「${event.skill}」！`, 'info')
          break
        case 'itemUsed':
          showBanner(`${event.name}を使った（${event.text}）`, 'info')
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

  // ---- コマンドフェーズのメニュー操作 ----

  const pickMain = useCallback(
    (index: number) => {
      const model = mainMenu(battle)
      const entry = model.entries[index]
      if (!entry || entry.disabled) return
      const command = model.values[index]
      if (command === 'attack') {
        // 攻撃：MP を使わない通常攻撃のお題。
        if (battle.proceed(performance.now(), 'basic')) setMenu(MENU_TOP)
      } else if (command === 'genre') {
        // スキルの一覧は、前回使ったジャンルにカーソルを合わせて開きます。
        setMenu({ level: 'genre', main: index, sub: Math.max(0, battle.genres.indexOf(battle.genre)) })
      } else if (command === 'support' || command === 'item') {
        setMenu({ level: command, main: index, sub: 0 })
      }
    },
    [battle],
  )

  const pickSub = useCallback(
    (level: SubLevel, index: number) => {
      const now = performance.now()
      if (level === 'genre') {
        const model = genreMenu(battle)
        if (model.entries[index]?.disabled) return
        if (battle.proceed(now, model.values[index])) setMenu(MENU_TOP)
      } else if (level === 'support') {
        const model = supportMenu(battle)
        if (model.entries[index]?.disabled) return
        if (battle.useSkill(model.values[index], now)) setMenu(MENU_TOP)
      } else {
        const model = itemMenu(battle)
        if (model.entries[index]?.disabled) return
        if (battle.useItem(model.values[index], now)) setMenu(MENU_TOP)
      }
      handleEvents()
      rerender()
    },
    [battle, handleEvents],
  )

  const handleMenuInput = useCallback(
    (input: MenuInput) => {
      if (menu.level === 'main') {
        const length = mainMenu(battle).entries.length
        if (input === 'up' || input === 'down') {
          setMenu({ ...menu, main: moveCursor(menu.main, input === 'up' ? -1 : 1, length) })
        } else if (input === 'confirm') {
          pickMain(menu.main)
        } else if (input === 'escape') {
          openPause()
        }
        // いちばん上のメニューでは X は何もしません。
        return
      }
      const length = subMenu(battle, menu.level).entries.length
      if (input === 'up' || input === 'down') {
        setMenu({ ...menu, sub: moveCursor(menu.sub, input === 'up' ? -1 : 1, length) })
      } else if (input === 'confirm') {
        pickSub(menu.level, menu.sub)
      } else {
        setMenu({ ...menu, level: 'main' })
      }
    },
    [battle, menu, pickMain, pickSub, openPause],
  )

  // ---- ポーズメニュー ----

  const pickPause = useCallback(
    (index: number) => {
      if (pauseView === 'menu') {
        if (index === 0) closePause()
        else {
          // 退却は確認を挟みます。最初は「いいえ」を選んだ状態です。
          setPauseView('confirm')
          setPauseCursor(0)
        }
      } else if (index === 0) {
        setPauseView('menu')
        setPauseCursor(1)
      } else {
        onRetreat(battle)
      }
    },
    [battle, pauseView, closePause, onRetreat],
  )

  /** ポーズ中の「戻る」。退却の確認ならポーズメニューへ、ポーズメニューなら戦闘へ戻ります。 */
  const backInPause = useCallback(() => {
    if (pauseView === 'confirm') {
      setPauseView('menu')
      setPauseCursor(1)
    } else {
      closePause()
    }
  }, [pauseView, closePause])

  // キー入力。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 日本語入力（IME）がオンだと、キーが文字として届きません。
      if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
        setImeWarning(true)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // 決着後は、結果ダイアログが自分でキーを受け取ります。
      if (ended.current) return
      const input = menuInputOf(e.key)

      if (pauseOpen) {
        if (e.key === 'Tab') e.preventDefault()
        if (!input) return
        e.preventDefault()
        if (e.repeat && input === 'confirm') return
        if (input === 'up' || input === 'down') setPauseCursor((c) => moveCursor(c, input === 'up' ? -1 : 1, 2))
        else if (input === 'confirm') pickPause(pauseCursor)
        else backInPause()
        return
      }

      if (battle.phase === 'command') {
        if (e.key === 'Tab') e.preventDefault()
        if (!input) return
        e.preventDefault()
        if (e.repeat && input === 'confirm') return
        setImeWarning(false)
        handleMenuInput(input)
        return
      }

      // ---- 攻撃・防御フェーズ ----
      const now = performance.now()
      if (e.key === 'Escape') {
        e.preventDefault()
        openPause()
        return
      }
      // 戦闘中にジャンルは切り替えられません（お題はコマンドの「スキル」で選びます）。
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') {
        e.preventDefault()
        return
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
  }, [battle, handleEvents, handleMenuInput, pauseOpen, pauseCursor, pickPause, openPause, backInPause])

  // ---- 表示 ----
  const { enemy, phase } = battle
  const defending = phase === 'defense' || phase === 'defenseIntro'
  const commanding = phase === 'command' && !battle.ended
  const main = mainMenu(battle)
  const sub = menu.level === 'main' ? null : subMenu(battle, menu.level)
  const subCursor = sub ? Math.min(menu.sub, Math.max(0, sub.entries.length - 1)) : 0
  const info = sub ? sub.infos[subCursor] : null
  const [enemyX] = enemyPositions(1)

  return (
    <GameStage className={`bt phase-${phase} ${defending && battle.defense?.strong ? 'is-strong' : ''}`}>
      <div className="bt-bg">
        <GameImage path={IMAGE_PATHS.background('field')} className="bt-bg-img" fallback={<div className="bt-bg-fallback" />} />
      </div>

      <TopBar
        wave={battle.waveIndex + 1}
        waveCount={battle.waveCount}
        // コマンドフェーズは、これから始まるターンの一部として数えます。
        turn={phase === 'command' ? battle.turn + 1 : Math.max(1, battle.turn)}
        onPause={openPause}
      />

      <EnemyView
        enemy={enemy}
        hpRatio={battle.enemyHp / enemy.hp}
        forecast={battle.forecast}
        defeated={phase === 'won'}
        x={enemyX}
        pops={pops}
        onPopEnd={(id) => setPops((list) => list.filter((q) => q.id !== id))}
        artRef={enemyRef}
      />

      <PartyView party={battle.party} />

      {commanding && (
        <>
          <MenuWindow
            title="コマンド"
            className="bt-command"
            entries={main.entries}
            cursor={menu.main}
            active={menu.level === 'main'}
            onHover={(index) => menu.level === 'main' && setMenu({ ...menu, main: index })}
            onPick={(index) => {
              setMenu((m) => ({ ...m, main: index }))
              pickMain(index)
            }}
          />
          {sub && (
            <MenuWindow
              title={SUB_TITLES[menu.level as SubLevel]}
              className="bt-sublist"
              entries={sub.entries}
              cursor={subCursor}
              active
              onHover={(index) => setMenu({ ...menu, sub: index })}
              onPick={(index) => pickSub(menu.level as SubLevel, index)}
            />
          )}
          {info && <InfoWindow info={info} className="bt-info-pos" />}
          <TurnReportWindow report={battle.report} enemyName={enemy.name} />
        </>
      )}

      <PromptWindow battle={battle} windowRef={promptRef} />

      <FatigueBadge stacks={battle.fatigue} />
      <StatusBar
        hp={battle.hp}
        maxHp={battle.player.maxHp}
        mp={battle.mp}
        maxMp={battle.player.maxMp}
        atk={battle.player.atk}
        def={battle.player.def}
        prr={battle.prr}
        maxPrr={battle.player.prr}
        barRef={statusRef}
      />

      {banner && !summary && (
        <div key={banner.id} className={`bt-banner is-${banner.tone}`} role="status">
          {banner.text}
        </div>
      )}

      {inputLocked && !pauseOpen && (
        <div className="bt-resume-lock" role="status">
          再開中…
        </div>
      )}

      {imeWarning && (
        <div className="bt-ime-warning" role="alert">
          日本語入力（IME）がオンになっています。半角英数に切り替えてください。
        </div>
      )}

      {pauseOpen && (
        <PauseMenu
          title={battle.request.title}
          confirming={pauseView === 'confirm'}
          cursor={pauseCursor}
          onHover={setPauseCursor}
          onPick={pickPause}
        />
      )}

      {summary && <ResultDialog summary={summary} money={save.money} onRetry={onRetry} onLeave={onLeave} />}
    </GameStage>
  )
}
