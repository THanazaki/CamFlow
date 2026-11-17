import { db } from '@/lib/db'

/**
 * 撮影への紐づけ（slot_models / shoot_history_models）に残す「登録時の名義」。
 * モデルは改名されうるので、紐づけた時点の名前を明細に持たせ、過去の撮影にはそれを出す。
 * 紐づけるモデルを後から別のモデルに替えたときも、替えた時点の名前を入れ直す。
 */
export async function registeredModelName(modelId: string): Promise<string | null> {
  return (await db.models.get(modelId))?.name ?? null
}
