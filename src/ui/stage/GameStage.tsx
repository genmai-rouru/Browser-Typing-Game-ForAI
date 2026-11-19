import { useEffect, useState, type ReactNode } from 'react'

/** ゲーム画面の基準サイズ（16:9）。中の部品はすべてこの座標で配置します。 */
export const STAGE_WIDTH = 1920
export const STAGE_HEIGHT = 1080

/** ウィンドウに収まる拡大率（縦横のうち、先に端に届く方に合わせます）。 */
function fitScale(): number {
  if (typeof window === 'undefined') return 1
  return Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT)
}

/**
 * 1920×1080 の固定画面を、ウィンドウいっぱいに拡大縮小して表示する枠。
 * 16:9 からはみ出した部分は黒帯になります。Unity の Canvas Scaler に近い考え方です。
 */
export function GameStage({ className = '', children }: { className?: string; children: ReactNode }) {
  const [scale, setScale] = useState(fitScale)

  useEffect(() => {
    const onResize = () => setScale(fitScale())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="stage-viewport">
      <div
        className={`stage-canvas ${className}`}
        style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
