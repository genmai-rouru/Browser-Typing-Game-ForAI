import { MAX_GENRE_SLOTS, MP_COST, slotKey } from '../game/balance.ts'
import { genreInfo } from '../game/genres.ts'
import {
  addToGenreSet,
  moveInGenreSet,
  ownedGenres,
  removeFromGenreSet,
  type SaveData,
} from '../game/save.ts'

interface Props {
  save: SaveData
  onChange: (save: SaveData) => void
}

/** 図書室。戦闘に持ち込むジャンルのセットを編集します（入荷は準備中）。 */
export function LibraryScreen({ save, onChange }: Props) {
  const set = save.genreSet
  const spare = ownedGenres(save).filter((g) => !set.includes(g))
  const slots = Array.from({ length: MAX_GENRE_SLOTS }, (_, i) => set[i] ?? null)
  const full = set.length >= MAX_GENRE_SLOTS

  return (
    <main className="room-grid library">
      <section className="panel" aria-label="お題セット">
        <h2 className="panel-title">
          お題セット（{set.length} / {MAX_GENRE_SLOTS}）
        </h2>
        <ol className="slot-list">
          {slots.map((genre, index) =>
            genre ? (
              <li key={genre} className={`slot genre-${genre}`}>
                <kbd>{slotKey(index)}</kbd>
                <span className="slot-glyph">{genreInfo(genre).glyph}</span>
                <span className="slot-name">{genreInfo(genre).name}</span>
                <span className="slot-cost">MP {MP_COST[genre]}</span>
                <span className="slot-actions">
                  <button
                    type="button"
                    className="ghost-button small"
                    disabled={index === 0}
                    aria-label={`${genreInfo(genre).name}を前へ`}
                    onClick={() => onChange(moveInGenreSet(save, genre, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="ghost-button small"
                    disabled={index === set.length - 1}
                    aria-label={`${genreInfo(genre).name}を後ろへ`}
                    onClick={() => onChange(moveInGenreSet(save, genre, 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="ghost-button small"
                    disabled={set.length <= 1}
                    onClick={() => onChange(removeFromGenreSet(save, genre))}
                  >
                    外す
                  </button>
                </span>
              </li>
            ) : (
              <li key={`empty-${index}`} className="slot is-empty">
                <kbd>{slotKey(index)}</kbd>
                <span className="slot-name">空き</span>
              </li>
            ),
          )}
        </ol>
        <p className="panel-note">
          番号は、戦闘中に切り替えるときの数字キーです（10 枠目は 0 キー）。Tab キーではこの順に切り替わります。最低 1 つは必要です。
        </p>
      </section>

      <section className="panel" aria-label="所持しているジャンル">
        <h2 className="panel-title">セットしていないジャンル</h2>
        {spare.length === 0 ? (
          <p className="placeholder-note">所持しているジャンルは、すべてセットしています。</p>
        ) : (
          <ul className="slot-list">
            {spare.map((genre) => (
              <li key={genre} className={`slot genre-${genre}`}>
                <span className="slot-glyph">{genreInfo(genre).glyph}</span>
                <span className="slot-name">{genreInfo(genre).name}</span>
                <span className="slot-cost">MP {MP_COST[genre]}</span>
                <span className="slot-actions">
                  <button
                    type="button"
                    className="ghost-button small"
                    disabled={full}
                    onClick={() => onChange(addToGenreSet(save, genre))}
                  >
                    セットする
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <h2 className="panel-title">入荷</h2>
        <p className="placeholder-note">準備中（新しいお題ジャンルを、お金を使って入荷します）</p>
      </section>
    </main>
  )
}
