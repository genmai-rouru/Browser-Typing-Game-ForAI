import type { GenreId, GenreTexts } from '../types.ts'
import { food } from './food.ts'
import { nature } from './nature.ts'
import { school } from './school.ts'
import { society } from './society.ts'

/** ジャンルごとのお題データ。お題を増やすときは各ファイルに追記してください。 */
export const TEXTS: Readonly<Record<GenreId, GenreTexts>> = {
  school,
  society,
  nature,
  food,
}
