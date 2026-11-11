import { useEffect, useState, type CSSProperties } from 'react'
import {
  FORGE_KEYS,
  FORGE_ROWS,
  KEY_BONUS_PER_LEVEL,
  KEY_MAX_LEVEL,
  RUNES,
  keyUpgradeCost,
} from '../game/balance.ts'
import { placeRune, upgradeKey } from '../game/rewards.ts'
import { runeByKey, type SaveData } from '../game/save.ts'

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
  const runes = runeByKey(save.runes)
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
                  const rune = runes[key]
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
                      {rune && <span className={`keycap-rune rune-${rune}`}>{RUNES[rune].glyph}</span>}
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
              鍛えたキーを通る綴りを選べば、同じお題でも与えるダメージが変わります。
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
              '鍛え上げた'
            ) : (
              <>
                鍛える（欠片 {cost}）<kbd>Enter</kbd>
              </>
            )}
          </button>
          {!maxed && !affordable && <p className="panel-note">欠片があと {cost - save.shards} 足りません。</p>}

          <h2 className="panel-title">刻印</h2>
          {save.runes.length === 0 ? (
            <p className="panel-note">
              まだ刻印を持っていません。決まった依頼を初めて達成すると手に入ります（最初は依頼 2）。
            </p>
          ) : (
            <ul className="rune-list">
              {save.runes.map((rune, index) => {
                const info = RUNES[rune.type]
                const here = rune.key === selected
                return (
                  <li key={index} className={`rune ${here ? 'is-here' : ''}`}>
                    <span className={`rune-glyph rune-${rune.type}`}>{info.glyph}</span>
                    <div className="rune-body">
                      <p className="rune-name">
                        {info.name}
                        <span className="rune-where">{rune.key ? `${keyLabel(rune.key)} キーに刻印中` : '未使用'}</span>
                      </p>
                      <p className="rune-desc">{info.description}</p>
                    </div>
                    <button
                      type="button"
                      className="ghost-button small"
                      onClick={() => onChange(placeRune(save, index, here ? null : selected))}
                    >
                      {here ? '外す' : `${keyLabel(selected)} に刻む`}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
