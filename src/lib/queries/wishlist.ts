import { db } from '@/lib/db'

/** 撮影希望モデル登録の一覧の1行 */
export interface WishlistRow {
  id: string
  modelName: string
  x: string | null
  instagram: string | null
  eventName: string | null
  costumeOptions: string | null
  shootingMethodOptions: string | null
}

/** 撮影希望モデルを新しく登録した順に返す。マスタから削除したモデルは出さない */
export async function loadWishlist(): Promise<WishlistRow[]> {
  const [wishes, models] = await Promise.all([db.wishlist_models.toArray(), db.models.toArray()])
  const modelMap = new Map(models.map((m) => [m.id, m]))

  return wishes
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .flatMap((wish) => {
      const model = modelMap.get(wish.model_id)
      if (!model || model.deleted_at) return []
      const sns = (model.sns_links ?? {}) as Record<string, string>
      return [
        {
          id: wish.id,
          modelName: model.name,
          x: sns.x ?? null,
          instagram: sns.instagram ?? null,
          eventName: wish.event_name,
          costumeOptions: wish.costume_options,
          shootingMethodOptions: wish.shooting_method_options,
        },
      ]
    })
}
