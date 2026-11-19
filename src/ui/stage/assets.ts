/**
 * 画像ファイルの場所。public/images/ 以下に、決まった名前で置くと表示されます。
 *
 *   背景         public/images/backgrounds/<場所>.png   （1920×1080）
 *   敵           public/images/enemies/<敵の id>.png     （透過 PNG、正方形 512×512 程度）
 *   立ち絵       public/images/partners/<パートナーの id>.png       （透過 PNG、縦長）
 *   アイコン     public/images/partners/<パートナーの id>-icon.png  （正方形）
 */
export const IMAGE_PATHS = {
  background: (place: string) => `images/backgrounds/${place}.png`,
  enemy: (id: string) => `images/enemies/${id}.png`,
  partner: (id: string) => `images/partners/${id}.png`,
  partnerIcon: (id: string) => `images/partners/${id}-icon.png`,
} as const
