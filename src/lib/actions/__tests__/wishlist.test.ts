import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { SYNC_TABLES } from '@/lib/db/types'
import { loadWishlist } from '@/lib/queries/wishlist'
import { createRow, softDeleteRow } from '@/lib/sync/mutations'

import { createWishlistModel, deleteWishlistModel, type WishlistInput } from '../wishlist'

const USER = '11111111-1111-4111-8111-111111111111'

function input(overrides: Partial<WishlistInput> = {}): WishlistInput {
  return {
    modelName: '栞奈',
    eventName: '',
    costumeOptions: '',
    shootingMethodOptions: '',
    ...overrides,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('撮影希望モデル登録', () => {
  it('FK の親であるモデルより後に同期する', () => {
    expect(SYNC_TABLES.indexOf('wishlist_models')).toBeGreaterThan(SYNC_TABLES.indexOf('models'))
  })

  it('入力内容を保存し、一覧に出す', async () => {
    await createWishlistModel(
      USER,
      input({
        modelName: ' 栞奈 ',
        eventName: ' 秋の撮影会 ',
        costumeOptions: ' 浴衣 ',
        shootingMethodOptions: ' 動画撮影 ',
      }),
    )

    const [model] = await db.models.toArray()
    expect(model.name).toBe('栞奈')
    expect(await loadWishlist()).toMatchObject([
      {
        modelName: '栞奈',
        eventName: '秋の撮影会',
        costumeOptions: '浴衣',
        shootingMethodOptions: '動画撮影',
      },
    ])
  })

  it('モデル名以外は未入力でも登録でき、null で持つ', async () => {
    const id = await createWishlistModel(USER, input({ costumeOptions: '   ' }))

    expect(await db.wishlist_models.get(id)).toMatchObject({
      event_name: null,
      costume_options: null,
      shooting_method_options: null,
    })
    const [model] = await db.models.toArray()
    expect(model.sns_links).toEqual({})
  })

  it('モデル名が空ならエラーにして何も作らない', async () => {
    await expect(createWishlistModel(USER, input({ modelName: '   ' }))).rejects.toThrow(
      'モデル名を入力してください',
    )

    expect(await db.models.count()).toBe(0)
    expect(await db.wishlist_models.count()).toBe(0)
  })

  it('既存のモデルは新しく作らず、大文字小文字の違いも同じモデルとして扱う', async () => {
    await createRow('models', { user_id: USER, name: 'Kanna', sns_links: {} })

    await createWishlistModel(USER, input({ modelName: 'kanna' }))

    expect(await db.models.count()).toBe(1)
    expect((await loadWishlist())[0].modelName).toBe('Kanna')
  })

  it('同じモデルを複数登録でき、新しい順に並ぶ', async () => {
    const first = await createWishlistModel(USER, input({ eventName: '春' }))
    const second = await createWishlistModel(USER, input({ eventName: '秋' }))
    await db.wishlist_models.update(first, { created_at: '2026-01-01T00:00:00.000Z' })
    await db.wishlist_models.update(second, { created_at: '2026-02-01T00:00:00.000Z' })

    expect((await loadWishlist()).map((r) => r.eventName)).toEqual(['秋', '春'])
    expect(await db.models.count()).toBe(1)
  })

  it('マスタから削除したモデルは一覧に出さない', async () => {
    await createWishlistModel(USER, input())
    const [model] = await db.models.toArray()
    await softDeleteRow('models', model.id)

    expect(await loadWishlist()).toEqual([])
  })

  it('撮影希望の登録を送信キューに積む', async () => {
    const id = await createWishlistModel(USER, input())

    const entries = await db._outbox.toArray()
    expect(entries.some((e) => e.table === 'wishlist_models' && e.row_id === id)).toBe(true)
  })
})

describe('撮影希望モデルの削除', () => {
  it('その1件だけを消し、モデルマスタと同じモデルの別の撮影希望は残す', async () => {
    const first = await createWishlistModel(USER, input({ eventName: 'A会' }))
    await createWishlistModel(USER, input({ eventName: 'B会' }))

    await deleteWishlistModel(first)

    const rows = await loadWishlist()
    expect(rows.map((r) => r.eventName)).toEqual(['B会'])
    expect(await db.models.count()).toBe(1)
    // 同期は削除ログ（outbox）で送る
    expect(await db.wishlist_models.get(first)).toBeUndefined()
    await expect(deleteWishlistModel(first)).rejects.toThrow()
  })

  it('一覧にモデルの所属を持たせる（予約入力で撮影会名の初期値に使う）', async () => {
    await createWishlistModel(USER, input())
    expect((await loadWishlist())[0].modelAffiliation).toBe('フリー')
  })
})
