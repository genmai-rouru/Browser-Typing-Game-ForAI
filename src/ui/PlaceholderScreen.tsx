interface Props {
  /** この画面に入る予定の機能。 */
  planned: string[]
}

/** 中身がまだ決まっていない画面の仮表示。 */
export function PlaceholderScreen({ planned }: Props) {
  return (
    <main className="panel">
      <h2 className="panel-title">準備中</h2>
      <p className="placeholder-note">この画面はまだ骨組みだけです。次の内容を置く予定です。</p>
      <ul className="planned-list">
        {planned.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </main>
  )
}
