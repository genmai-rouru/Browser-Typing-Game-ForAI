import { useState, type ReactNode } from 'react'

interface Props {
  /** public/ からの相対パス（IMAGE_PATHS で作ります）。 */
  path: string
  className?: string
  alt?: string
  /** 画像が無い（読み込めない）ときに代わりに表示するもの。 */
  fallback: ReactNode
}

/** 画像があれば表示し、無ければ仮表示（fallback）に切り替える部品。 */
export function GameImage({ path, className = '', alt = '', fallback }: Props) {
  // 読み込みに失敗したパスを覚えておきます。パスが変わればもう一度試します。
  const [failed, setFailed] = useState<string | null>(null)
  if (failed === path) return <>{fallback}</>
  return (
    <img
      className={className}
      src={`${import.meta.env.BASE_URL}${path}`}
      alt={alt}
      draggable={false}
      onError={() => setFailed(path)}
    />
  )
}
