/** タブとして並ぶ画面。 */
export type TabId = 'clubroom' | 'board' | 'gym' | 'library' | 'workshop' | 'shop'

/** タブ画面に加えて、他の画面の中から開く画面（部室机・部室鏡）。 */
export type RoomId = TabId | 'desk' | 'mirror'

export const TABS: ReadonlyArray<{ id: TabId; name: string }> = [
  { id: 'clubroom', name: '部室' },
  { id: 'board', name: '部室前掲示板' },
  { id: 'gym', name: '体育館' },
  { id: 'library', name: '図書室' },
  { id: 'workshop', name: '技術室' },
  { id: 'shop', name: '購買' },
]

export const ROOM_NAMES: Readonly<Record<RoomId, string>> = {
  clubroom: '部室',
  board: '部室前掲示板',
  gym: '体育館',
  library: '図書室',
  workshop: '技術室',
  shop: '購買',
  desk: '部室机',
  mirror: '部室鏡',
}

/**
 * いま開いている画面と、その画面をどこから開いたか。
 * 「戻る」は origin に帰ります。タブから直接開いた画面の origin は null で、
 * その場合の「戻る」は部室に帰ります。
 */
export interface RoomState {
  id: RoomId
  origin: RoomId | null
}

/** 「戻る」を押したときの行き先。 */
export function backTarget(room: RoomState): RoomId {
  return room.origin ?? 'clubroom'
}

/** いまの画面が属するタブ（部室机などは、開いた元のタブ）。 */
export function activeTab(room: RoomState): TabId {
  if (room.id !== 'desk' && room.id !== 'mirror') return room.id
  return room.origin === 'board' ? 'board' : 'clubroom'
}
