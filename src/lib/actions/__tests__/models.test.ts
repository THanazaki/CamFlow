import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadModelDetail, loadModelList } from '@/lib/queries/models'
import { createRow, softDeleteRow } from '@/lib/sync/mutations'

import { createReservation } from '../reservations'
import { parseTags, updateModel, type ModelInput } from '../models'

const USER = '11111111-1111-4111-8111-111111111111'

function input(overrides: Partial<ModelInput> = {}): ModelInput {
  return {
    name: '栞奈',
    nameKana: '',
    avatarUrl: '',
    x: '',
    instagram: '',
    contactMethod: '',
    contactValue: '',
    affiliation: '',
    tags: '',
    rating: '',
    isFavorite: false,
    status: 'active',
    notes: '',
    ...overrides,
  }
}

function addModel(name = '栞奈', extra: Record<string, unknown> = {}) {
  return createRow('models', { user_id: USER, name, sns_links: {}, ...extra })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('モデルの編集', () => {
  it('全項目を保存し、前後の空白を除く', async () => {
    const id = await addModel()

    await updateModel(
      id,
      input({
        name: ' 栞奈改 ',
        nameKana: ' かんな ',
        avatarUrl: ' https://example.com/a.jpg ',
        x: ' @kanna ',
        instagram: ' @kanna_ig ',
        contactMethod: ' LINE ',
        contactValue: ' kanna ',
        affiliation: ' フリー ',
        tags: 'ポートレート、 コスプレ,ポートレート',
        rating: '5',
        isFavorite: true,
        status: 'inactive',
        notes: ' メモ ',
      }),
    )

    expect(await db.models.get(id)).toMatchObject({
      name: '栞奈改',
      name_kana: 'かんな',
      avatar_url: 'https://example.com/a.jpg',
      sns_links: { x: '@kanna', instagram: '@kanna_ig' },
      contact_method: 'LINE',
      contact_value: 'kanna',
      affiliation: 'フリー',
      tags: ['ポートレート', 'コスプレ'],
      rating: 5,
      is_favorite: true,
      status: 'inactive',
      notes: 'メモ',
    })
  })

  it('所属は一覧に反映される', async () => {
    const id = await addModel()

    await updateModel(id, input({ affiliation: 'フリー' }))

    expect(await loadModelList()).toMatchObject([{ name: '栞奈', affiliation: 'フリー' }])
  })

  it('空にした項目は null に戻し、タグは空の配列にする', async () => {
    const id = await addModel('栞奈', {
      name_kana: 'かんな',
      affiliation: 'フリー',
      tags: ['a'],
      rating: 3,
      notes: 'メモ',
    })

    await updateModel(id, input())

    expect(await db.models.get(id)).toMatchObject({
      name_kana: null,
      affiliation: null,
      tags: [],
      rating: null,
      notes: null,
    })
  })

  it('空欄にしたアカウントは消し、X / Instagram 以外の SNS は残す', async () => {
    const id = await addModel('栞奈', {
      sns_links: { x: '@old', instagram: '@old_ig', tiktok: '@tt' },
    })

    await updateModel(id, input({ x: '@new' }))

    expect((await db.models.get(id))?.sns_links).toEqual({ x: '@new', tiktok: '@tt' })
  })

  it('id / user_id / created_at は変えず、更新日時は進める', async () => {
    const id = await addModel()
    const before = await db.models.get(id)
    await db.models.update(id, { updated_at: '2000-01-01T00:00:00.000Z' })

    await updateModel(id, input({ name: '新しい名前' }))

    const after = await db.models.get(id)
    expect(after).toMatchObject({ id, user_id: USER, created_at: before?.created_at, deleted_at: null })
    expect(after?.updated_at).not.toBe('2000-01-01T00:00:00.000Z')
  })

  it('変更を送信キューに積む', async () => {
    const id = await addModel()
    const before = await db._outbox.count()

    await updateModel(id, input({ affiliation: 'フリー' }))

    expect(await db._outbox.count()).toBe(before + 1)
  })

  it('モデル名が空ならエラーにして変更しない', async () => {
    const id = await addModel()

    await expect(updateModel(id, input({ name: '  ', affiliation: 'フリー' }))).rejects.toThrow(
      'モデル名を入力してください',
    )

    expect((await db.models.get(id))?.affiliation).toBeUndefined()
  })

  it('他のモデルと同じ名前（大文字小文字の違いを含む）はエラー', async () => {
    await addModel('Kanna')
    const id = await addModel('別のモデル')

    await expect(updateModel(id, input({ name: 'kanna' }))).rejects.toThrow('既に登録されています')

    expect((await db.models.get(id))?.name).toBe('別のモデル')
  })

  it('自分の名前の大文字小文字だけを変えられる', async () => {
    const id = await addModel('kanna')

    await updateModel(id, input({ name: 'Kanna' }))

    expect((await db.models.get(id))?.name).toBe('Kanna')
  })

  it('論理削除したモデルの名前は使える', async () => {
    const deleted = await addModel('削除済み')
    await softDeleteRow('models', deleted)
    const id = await addModel('別のモデル')

    await updateModel(id, input({ name: '削除済み' }))

    expect((await db.models.get(id))?.name).toBe('削除済み')
  })

  it.each(['0', '6', '1.5', 'abc'])('評価 %s はエラー', async (rating) => {
    const id = await addModel()

    await expect(updateModel(id, input({ rating }))).rejects.toThrow('評価は1〜5')
  })

  it('存在しないモデルと論理削除したモデルはエラー', async () => {
    const id = await addModel()
    await softDeleteRow('models', id)

    await expect(updateModel('missing', input())).rejects.toThrow('見つかりません')
    await expect(updateModel(id, input())).rejects.toThrow('見つかりません')
  })
})

describe('parseTags', () => {
  it('読点、カンマ、全角カンマ、改行で分け、空欄と重複を除く', () => {
    expect(parseTags('a、b,c，d\ne, ,a')).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(parseTags('  ')).toEqual([])
  })
})

describe('モデルの詳細', () => {
  it('全カラムの値を返す', async () => {
    const id = await addModel('栞奈', {
      name_kana: 'かんな',
      avatar_url: 'https://example.com/a.jpg',
      sns_links: { x: '@kanna' },
      contact_method: 'LINE',
      contact_value: 'kanna',
      affiliation: 'フリー',
      tags: ['a'],
      rating: 4,
      is_favorite: true,
      status: 'ng',
      notes: 'メモ',
    })

    expect(await loadModelDetail(id)).toMatchObject({
      id,
      userId: USER,
      name: '栞奈',
      nameKana: 'かんな',
      avatarUrl: 'https://example.com/a.jpg',
      snsLinks: { x: '@kanna' },
      contactMethod: 'LINE',
      contactValue: 'kanna',
      affiliation: 'フリー',
      tags: ['a'],
      rating: 4,
      isFavorite: true,
      status: 'ng',
      notes: 'メモ',
      deletedAt: null,
    })
  })

  it('予約から自動で作ったモデルの欠けたカラムは既定値で補う', async () => {
    await createReservation(USER, {
      eventName: '',
      shootCategory: 'solo',
      modelName: '栞奈',
      concept: '',
      venueName: '',
      shootDate: '2026-12-20',
      bookingOpensAt: '2026-11-20T20:00',
      bookingMethod: 'page',
      bookingContact: 'https://example.com',
      shootFee: '',
      costumeOptions: '',
      shootingMethodOptions: '',
      paymentTiming: null,
      paymentDate: '',
    })
    const [model] = await db.models.toArray()

    expect(await loadModelDetail(model.id)).toMatchObject({
      snsLinks: {},
      tags: [],
      rating: null,
      isFavorite: false,
      status: 'active',
    })
  })

  it('無ければ null。論理削除したモデルも null', async () => {
    const id = await addModel()
    await softDeleteRow('models', id)

    expect(await loadModelDetail('missing')).toBeNull()
    expect(await loadModelDetail(id)).toBeNull()
  })
})
