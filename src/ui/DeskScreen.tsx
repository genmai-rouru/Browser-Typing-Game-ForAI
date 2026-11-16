import { useState } from 'react'
import { SKILL_MAX_LEVEL, skillExpThreshold } from '../game/balance.ts'
import {
  ROLE_NAMES,
  conditionMet,
  describeCondition,
  describePassive,
  describeUnique,
  partnerById,
  type PartnerDef,
  type PartnerProgress,
  type PartnerRole,
  type SkillKind,
} from '../game/partners.ts'
import { setPartyMember, type SaveData } from '../game/save.ts'
import { PartnerPortrait } from './PartnerPortrait.tsx'

interface Props {
  save: SaveData
  onChange: (save: SaveData) => void
}

const ROLES: PartnerRole[] = ['front', 'back']

/** 部室机。同行するパートナーの編成と、パートナーのステータスを確認します。 */
export function DeskScreen({ save, onChange }: Props) {
  const owned = Object.keys(save.partners)
    .map((id) => partnerById(id))
    .filter((p): p is PartnerDef => !!p)
  const [selectedId, setSelectedId] = useState(owned[0]?.id ?? null)
  const selected = selectedId ? partnerById(selectedId) : undefined
  const progress = selectedId ? save.partners[selectedId] : undefined

  return (
    <main className="desk">
      <section className="panel" aria-label="同行するパートナー">
        <h2 className="panel-title">同行するパートナー</h2>
        <div className="party-slots">
          {ROLES.map((role) => {
            const id = save.party[role]
            const def = id ? partnerById(id) : undefined
            return (
              <div key={role} className="party-slot">
                <span className="party-role">{ROLE_NAMES[role]}</span>
                <PartnerPortrait partner={def ?? null} />
                <span className="party-name">{def ? def.name : '空き'}</span>
              </div>
            )
          })}
        </div>
      </section>

      <div className="desk-grid">
        <section className="panel" aria-label="所持しているパートナー">
          <h2 className="panel-title">部員（{owned.length}）</h2>
          <ul className="partner-list">
            {owned.map((def) => {
              const joined = save.party[def.role] === def.id
              return (
                <li key={def.id}>
                  <button
                    type="button"
                    className={`partner-row ${selectedId === def.id ? 'is-selected' : ''}`}
                    aria-pressed={selectedId === def.id}
                    onClick={() => setSelectedId(def.id)}
                  >
                    <PartnerPortrait partner={def} size="small" />
                    <span className="partner-row-body">
                      <span className="partner-row-name">{def.name}</span>
                      <span className="partner-row-role">{ROLE_NAMES[def.role]}</span>
                    </span>
                    {joined && <span className="stamp small">同行中</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {selected && progress && (
          <PartnerDetail
            def={selected}
            progress={progress}
            joined={save.party[selected.role] === selected.id}
            onJoin={() => onChange(setPartyMember(save, selected.role, selected.id))}
            onLeave={() => onChange(setPartyMember(save, selected.role, null))}
          />
        )}
      </div>
    </main>
  )
}

function PartnerDetail({
  def,
  progress,
  joined,
  onJoin,
  onLeave,
}: {
  def: PartnerDef
  progress: PartnerProgress
  joined: boolean
  onJoin: () => void
  onLeave: () => void
}) {
  return (
    <section className="panel partner-detail" aria-label={`${def.name}のステータス`}>
      <div className="partner-head">
        <PartnerPortrait partner={def} size="large" />
        <div>
          <p className="partner-role-label">{ROLE_NAMES[def.role]}</p>
          <h2 className="partner-name">{def.name}</h2>
          <p className="partner-exp">累計経験値 {progress.exp.toLocaleString()}</p>
        </div>
      </div>
      {joined ? (
        <button type="button" className="ghost-button wide" onClick={onLeave}>
          同行をやめる
        </button>
      ) : (
        <button type="button" className="primary-button wide" onClick={onJoin}>
          {ROLE_NAMES[def.role]}として同行させる
        </button>
      )}
      <SkillBlock def={def} progress={progress} skill="passive" />
      <SkillBlock def={def} progress={progress} skill="unique" />
    </section>
  )
}

function SkillBlock({ def, progress, skill }: { def: PartnerDef; progress: PartnerProgress; skill: SkillKind }) {
  const level = skill === 'passive' ? progress.passiveLv : progress.uniqueLv
  const describe = skill === 'passive' ? describePassive : describeUnique
  const maxed = level >= SKILL_MAX_LEVEL
  const need = maxed ? 0 : skillExpThreshold(level + 1)
  const condition = maxed ? undefined : def[skill].conditions?.[level + 1]
  const conditionDone = !maxed && conditionMet(def, progress, skill, level + 1)
  return (
    <div className="skill-block">
      <h3 className="skill-title">
        <span className="skill-kind">{skill === 'passive' ? 'パッシブ' : '固有スキル'}</span>
        {def[skill].name}
        <span className="skill-lv">
          Lv {level}
          <span> / {SKILL_MAX_LEVEL}</span>
        </span>
      </h3>
      <p className="skill-effect">{describe(def, level)}</p>
      {skill === 'unique' && <p className="skill-sub">クールダウン {def.unique.cooldown} ターン（コマンドフェーズで使用）</p>}
      {maxed ? (
        <p className="skill-sub">最大レベルです。</p>
      ) : (
        <dl className="skill-next">
          <div>
            <dt>次のレベル</dt>
            <dd>{describe(def, level + 1)}</dd>
          </div>
          <div>
            <dt>必要経験値</dt>
            <dd>
              {progress.exp.toLocaleString()} / {need.toLocaleString()}
              {progress.exp >= need && <span className="ok-mark">達成</span>}
            </dd>
          </div>
          <div>
            <dt>条件</dt>
            <dd>
              {describeCondition(condition)}
              {condition && conditionDone && <span className="ok-mark">達成</span>}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}
