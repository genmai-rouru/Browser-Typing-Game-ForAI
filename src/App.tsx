import { useCallback, useState } from 'react'
import type { Battle } from './game/battle.ts'
import { applyBattle, type BattleSummary } from './game/rewards.ts'
import { clearSave, createSave, loadSave, storeSave, type SaveData } from './game/save.ts'
import { BoardScreen } from './ui/BoardScreen.tsx'
import { ClubroomScreen } from './ui/ClubroomScreen.tsx'
import { FieldScreen } from './ui/FieldScreen.tsx'
import { HelpDialog } from './ui/HelpDialog.tsx'
import { PlaceholderScreen } from './ui/PlaceholderScreen.tsx'
import { Shell } from './ui/Shell.tsx'
import { WorkshopScreen } from './ui/WorkshopScreen.tsx'
import { backTarget, type RoomId, type RoomState } from './ui/navigation.ts'

/** 運動場（戦闘）に出ている間の状態。summary が入ると結果ダイアログを表示します。 */
interface FieldState {
  stage: number
  /** 再挑戦のたびに変えて、戦闘を最初から作り直します。 */
  run: number
  summary: BattleSummary | null
}

export default function App() {
  const [save, setSave] = useState<SaveData>(loadSave)
  const [room, setRoom] = useState<RoomState>({ id: 'clubroom', origin: null })
  const [field, setField] = useState<FieldState | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  /** 保存データを更新し、ブラウザにも書き込みます。 */
  const updateSave = useCallback((next: SaveData) => {
    setSave(next)
    storeSave(next)
  }, [])

  /** タブで移動します。タブからの移動は「どこから来たか」を持ちません。 */
  const goTab = useCallback((id: RoomId) => setRoom({ id, origin: null }), [])

  /** いまの画面の中から別の画面を開きます。「戻る」でいまの画面に帰ります。 */
  const openFromHere = useCallback(
    (id: RoomId) => setRoom((prev) => ({ id, origin: prev.id })),
    [],
  )

  const goBack = useCallback(() => setRoom((prev) => ({ id: backTarget(prev), origin: null })), [])

  const startBattle = (stage: number) => {
    setField((prev) => ({ stage, run: (prev?.run ?? 0) + 1, summary: null }))
  }

  const finishBattle = (battle: Battle) => {
    const { save: next, summary } = applyBattle(save, battle)
    updateSave(next)
    setField((prev) => (prev ? { ...prev, summary } : prev))
  }

  /** 運動場を離れて部室に戻ります。 */
  const leaveField = () => {
    setField(null)
    setRoom({ id: 'clubroom', origin: null })
  }

  const resetSave = () => {
    if (!window.confirm('これまでのプレイデータをすべて消して、最初から始めますか？')) return
    clearSave()
    setSave(createSave())
  }

  if (field) {
    return (
      <div className="app">
        <FieldScreen
          key={field.run}
          stage={field.stage}
          save={save}
          summary={field.summary}
          onFinish={finishBattle}
          onLeave={leaveField}
          onRetry={() => startBattle(field.stage)}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <Shell room={room} onTab={goTab} onBack={goBack} keyboardEnabled={!helpOpen}>
        {room.id === 'clubroom' && (
          <ClubroomScreen
            save={save}
            onOpen={openFromHere}
            onHelp={() => setHelpOpen(true)}
            onReset={resetSave}
          />
        )}
        {room.id === 'board' && <BoardScreen save={save} onStart={startBattle} onOpen={openFromHere} />}
        {room.id === 'workshop' && <WorkshopScreen save={save} onChange={updateSave} />}
        {room.id === 'gym' && <PlaceholderScreen planned={['お題練習（報酬なし、記録のみ）']} />}
        {room.id === 'library' && (
          <PlaceholderScreen planned={['新しいお題ジャンルの入荷（お金を使う）', '戦闘で使うお題セットの変更']} />
        )}
        {room.id === 'shop' && <PlaceholderScreen planned={['キーの購入（付け替えと強化は技術室）']} />}
        {room.id === 'desk' && <PlaceholderScreen planned={['パートナーの選択', 'パートナーのステータス']} />}
        {room.id === 'mirror' && (
          <PlaceholderScreen
            planned={[
              '詳細ステータス（HP、MP、攻撃力、守備力、会心率）',
              '実力（総打鍵数、総ミス数、平均打鍵速度、平均正確率、苦手キー）',
            ]}
          />
        )}
      </Shell>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
