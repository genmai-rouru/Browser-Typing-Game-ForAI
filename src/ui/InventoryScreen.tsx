import { useState } from 'react'
import {
  BAG_SLOTS,
  CATEGORY_NAMES,
  ITEM_CATEGORIES,
  STORAGE_CATEGORIES,
  STORAGE_SLOTS,
  depositSlot,
  itemById,
  rarityStars,
  withdrawSlot,
  type ItemCategory,
  type Stack,
  type StorageCategory,
} from '../game/items.ts'
import type { SaveData } from '../game/save.ts'

interface Props {
  /** bag = かばんの中、storage = 部室準備室。 */
  place: 'bag' | 'storage'
  save: SaveData
  onChange: (save: SaveData) => void
}

/** かばんの中と部室準備室。持ち物を種類ごとに表示し、もう一方へ移せます。 */
export function InventoryScreen({ place, save, onChange }: Props) {
  const categories: readonly ItemCategory[] = place === 'bag' ? ITEM_CATEGORIES : STORAGE_CATEGORIES
  const [category, setCategory] = useState<ItemCategory>('item')
  const slots: Stack[] = place === 'bag' ? save.bag[category] : (save.storage[category as StorageCategory] ?? [])
  const maxSlots = place === 'bag' ? BAG_SLOTS : STORAGE_SLOTS
  const movable = category !== 'valuable'

  const move = (index: number) => {
    const key = category as StorageCategory
    onChange(place === 'bag' ? depositSlot(save, key, index) : withdrawSlot(save, key, index))
  }

  return (
    <main className="panel inventory">
      <div className="inventory-head">
        <div className="category-tabs" role="tablist" aria-label="持ち物の種類">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              className={`category-tab ${category === c ? 'is-active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {CATEGORY_NAMES[c]}
            </button>
          ))}
        </div>
        <span className="slot-usage">
          {slots.length} / {maxSlots} スロット
        </span>
      </div>

      {slots.length === 0 ? (
        <p className="placeholder-note">{CATEGORY_NAMES[category]}は入っていません。</p>
      ) : (
        <ul className="item-list">
          {slots.map((stack, index) => {
            const def = itemById(stack.id)
            if (!def) return null
            return (
              <li key={`${stack.id}-${index}`} className={`item-row rarity-${def.rarity}`}>
                <span className="item-rarity">{rarityStars(def.rarity)}</span>
                <span className="item-body">
                  <span className="item-name">{def.name}</span>
                  <span className="item-desc">{def.description}</span>
                </span>
                <span className="item-count">×{stack.count}</span>
                {movable && (
                  <button type="button" className="ghost-button small" onClick={() => move(index)}>
                    {place === 'bag' ? '準備室へ預ける' : 'かばんへ取り出す'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="panel-note">
        {place === 'bag'
          ? '戦闘で使えるのは、かばんの中のアイテムです。かばんに入りきらないアイテムと装備は、部室準備室に送られます。'
          : '部室準備室には、アイテムと装備を置いておけます。戦闘で使うには、かばんへ取り出してください。'}
        {' '}1 スロットには同じものを 999 個まで重ねられます。
      </p>
    </main>
  )
}
