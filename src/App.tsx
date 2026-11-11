import { useCallback, useState } from 'react'
import type { Battle } from './game/battle.ts'
import { applyBattle, type BattleSummary } from './game/rewards.ts'
import { clearSave, createSave, loadSave, storeSave, type SaveData } from './game/save.ts'
import { BattleScreen } from './ui/BattleScreen.tsx'
import { ForgeScreen } from './ui/ForgeScreen.tsx'
import { HelpDialog } from './ui/HelpDialog.tsx'
import { HomeScreen } from './ui/HomeScreen.tsx'
import { ResultScreen } from './ui/ResultScreen.tsx'

/** いま表示している画面。 */
type Screen =
  | { name: 'home' }
  | { name: 'battle'; stage: number; run: number }
  | { name: 'result'; summary: BattleSummary }
  | { name: 'forge' }

export default function App() {
  const [save, setSave] = useState<SaveData>(loadSave)
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [helpOpen, setHelpOpen] = useState(() => loadSave().battles === 0)

  /** 保存データを更新し、ブラウザにも書き込みます。 */
  const updateSave = useCallback((next: SaveData) => {
    setSave(next)
    storeSave(next)
  }, [])

  const startBattle = useCallback((stage: number) => {
    setScreen((prev) => ({
      name: 'battle',
      stage,
      run: prev.name === 'battle' ? prev.run + 1 : Date.now(),
    }))
  }, [])

  const goHome = useCallback(() => setScreen({ name: 'home' }), [])

  const finishBattle = (battle: Battle) => {
    const { save: next, summary } = applyBattle(save, battle)
    updateSave(next)
    setScreen({ name: 'result', summary })
  }

  const resetSave = () => {
    if (!window.confirm('これまでのプレイデータをすべて消して、最初から始めますか？')) return
    clearSave()
    setSave(createSave())
    setScreen({ name: 'home' })
  }

  return (
    <div className="app">
      {screen.name === 'home' && (
        <HomeScreen
          save={save}
          onStart={startBattle}
          onForge={() => setScreen({ name: 'forge' })}
          onHelp={() => setHelpOpen(true)}
          onReset={resetSave}
          keyboardEnabled={!helpOpen}
        />
      )}
      {screen.name === 'battle' && (
        <BattleScreen
          key={screen.run}
          stage={screen.stage}
          save={save}
          onFinish={finishBattle}
          onRetreat={goHome}
        />
      )}
      {screen.name === 'result' && (
        <ResultScreen
          summary={screen.summary}
          save={save}
          onRetry={() => startBattle(screen.summary.stage)}
          onNext={() => startBattle(screen.summary.stage + 1)}
          onForge={() => setScreen({ name: 'forge' })}
          onHome={goHome}
        />
      )}
      {screen.name === 'forge' && <ForgeScreen save={save} onChange={updateSave} onBack={goHome} />}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
