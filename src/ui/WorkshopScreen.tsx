import { useEffect, useState, type CSSProperties } from 'react'
import {
  FORGE_KEYS,
  FORGE_ROWS,
  KEY_BONUS_PER_LEVEL,
  KEY_MAX_LEVEL,
  keyUpgradeCost,
} from '../game/balance.ts'
import { upgradeKey } from '../game/rewards.ts'
import type { SaveData } from '../game/save.ts'

interface Props {
  save: SaveData
  onChange: (save: SaveData) => void
}

const keyLabel = (key: string) => (key === '-' ? 'ー' : key.toUpperCase())

export function WorkshopScreen({ save, onChange }: Props) {
  const [selected, setSelected] = useState('a')
  const level = save.keyLevels[selected] ?? 0
  const cost = keyUpgradeCost(level)
  const maxed = level >= KEY_MAX_LEVEL
  const affordable = save.shards >= cost
  const maxStrokes = Math.max(1, ...FORGE_KEYS.map((k) => save.keyStrokes[k] ?? 0))

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      const key = e.key.toLowerCase()
      if (FORGE_KEYS.includes(key)) {
        // キーボードのキーを押すと、そのキーを選びます。
        setSelected(key)
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        onChange(upgradeKey(save, selected))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save, selected, onChange])

  return (
    <main className="forge">
      <p className="shard-count">
        欠片 <b>{save.shards.toLocaleString()}</b>
      </p>

      <div className="forge-grid">
        <section className="panel keyboard-panel" aria-label="鍵盤">
          <div className="keyboard">
            {FORGE_ROWS.map((row, r) => (
              <div key={row} className={`keyboard-row row-${r}`}>
                {row.split('').map((key) => {
                  const lv = save.keyLevels[key] ?? 0
                  const strokes = save.keyStrokes[key] ?? 0
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`keycap ${selected === key ? 'is-selected' : ''} ${lv > 0 ? 'is-forged' : ''}`}
                      style={{ '--heat': lv / KEY_MAX_LEVEL } as CSSProperties}
                      onClick={() => setSelected(key)}
                      aria-pressed={selected === key}
                      aria-label={`${keyLabel(key)} キー、レベル ${lv}`}
                    >
                      <span className="keycap-letter">{keyLabel(key)}</span>
                      <span className="keycap-lv">{lv > 0 ? `Lv${lv}` : '—'}</span>
                      <span
                        className="keycap-usage"
                        style={{ transform: `scaleX(${strokes / maxStrokes})` }}
                        aria-hidden="true"
                      />
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <p className="panel-note">
            キーの下の線は、これまでにそのキーを打った回数の目安です。よく打つキーほど、鍛えたときの効果が大きくなります。
          </p>
          <div className="forge-tip">
            <h3>綴りは、道すじ。</h3>
            <p>
              ローマ字の綴りは自由に選べます。たとえば「く」は <code>ku</code>・<code>cu</code>・<code>qu</code>
              、「し」は <code>si</code>・<code>shi</code>・<code>ci</code> のどれでも打てます。
              強化したキーを通る綴りを選べば、同じお題でも与えるダメージが変わります。
            </p>
          </div>
        </section>

        <section className="panel detail-panel" aria-label="選んだキー">
          <div className="detail-key">
            <span className="detail-keycap">{keyLabel(selected)}</span>
            <div>
              <p className="detail-level">
                Lv {level} <span>/ {KEY_MAX_LEVEL}</span>
              </p>
              <p className="detail-bonus">
                このキーの打鍵ダメージ <b>+{Math.round(level * KEY_BONUS_PER_LEVEL * 100)}%</b>
              </p>
              <p className="detail-usage">累計 {(save.keyStrokes[selected] ?? 0).toLocaleString()} 打鍵</p>
            </div>
          </div>
          <button
            type="button"
            className="primary-button wide"
            disabled={maxed || !affordable}
            onClick={() => onChange(upgradeKey(save, selected))}
          >
            {maxed ? (
              '最大まで強化済み'
            ) : (
              <>
                強化する（欠片 {cost}）<kbd>Enter</kbd>
              </>
            )}
          </button>
          {!maxed && !affordable && <p className="panel-note">欠片があと {cost - save.shards} 足りません。</p>}

          <p className="panel-note">キーの付け替えは、購買でキーを買えるようになってから追加します。</p>
        </section>
      </div>
    </main>
  )
}
