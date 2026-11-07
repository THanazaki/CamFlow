import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadModelDetail, loadModelList } from '@/lib/queries/models'
import { createRow, softDeleteRow } from '@/lib/sync/mutations'

import { splitAffiliations, updateModel, type ModelInput } from '../models'
import { createReservation } from '../reservations'
import { resolveModel } from '../shoots'

const USER = '11111111-1111-4111-8111-111111111111'

function input(overrides: Partial<ModelInput> = {}): ModelInput {
  return {
    name: '栞奈',
    nameKana: '',
    x: '',
    instagram: '',
    contactMethod: '',
    contactValue: '',
    affiliations: [''],
    mainAffiliation: 0,
    aliases: [],
    isFavorite: false,
    status: 'active',
    notes: '',
    ...overrides,
  }
}

function addModel(name = '栞奈', extra: Record<string, unknown> = {}) {
  return createRow('models', { user_id: USER, name, sns_links: {}, ...extra })
}

const aliasesOf = async (modelId: string) =>
  (await db.model_former_names.where('model_id').equals(modelId).toArray()).map((a) => a.name).sort()

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
        x: ' @kanna ',
        instagram: ' @kanna_ig ',
        contactMethod: ' LINE ',
        contactValue: ' kanna ',
        affiliations: [' 秋の撮影会 ', ' 春の撮影会 '],
        mainAffiliation: 1,
        aliases: [' 旧名 '],
        isFavorite: true,
        status: 'inactive',
        notes: ' メモ ',
      }),
    )

    expect(await db.models.get(id)).toMatchObject({
      name: '栞奈改',
      name_kana: 'かんな',
      sns_links: { x: '@kanna', instagram: '@kanna_ig' },
      contact_method: 'LINE',
      contact_value: 'kanna',
      affiliation: '春の撮影会',
      sub_affiliations: ['秋の撮影会'],
      is_favorite: true,
      status: 'inactive',
      notes: 'メモ',
    })
    expect(await aliasesOf(id)).toEqual(['旧名'])
  })

  it('アバターURL・タグ・評価は変更しない', async () => {
    const id = await addModel('栞奈', { avatar_url: 'https://example.com/a.jpg', tags: ['a'], rating: 4 })

    await updateModel(id, input())

    expect(await db.models.get(id)).toMatchObject({
      avatar_url: 'https://example.com/a.jpg',
      tags: ['a'],
      rating: 4,
    })
  })

  it('メインの所属は一覧に出し、その他の所属は数を出す', async () => {
    const id = await addModel()

    await updateModel(id, input({ affiliations: ['フリー', '秋の撮影会', '春の撮影会'] }))

    expect(await loadModelList()).toMatchObject([
      { name: '栞奈', affiliation: 'フリー', otherAffiliationCount: 2 },
    ])
  })

  it('空にした項目は null に戻す。所属が全部空なら所属なし', async () => {
    const id = await addModel('栞奈', {
      name_kana: 'かんな',
      affiliation: 'フリー',
      sub_affiliations: ['秋'],
      notes: 'メモ',
    })

    await updateModel(id, input({ affiliations: ['  ', ''] }))

    expect(await db.models.get(id)).toMatchObject({
      name_kana: null,
      affiliation: null,
      sub_affiliations: [],
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

  it('モデル名が空ならエラーにして変更しない', async () => {
    const id = await addModel()

    await expect(
      updateModel(id, input({ name: '  ', affiliations: ['フリー'] })),
    ).rejects.toThrow('モデル名を入力してください')

    expect((await db.models.get(id))?.affiliation).toBeUndefined()
  })

  it('同じ名前で所属が重なるモデルがあればエラー。メイン以外の所属どうしも見る', async () => {
    await addModel('葵', { affiliation: 'フリー', sub_affiliations: ['秋の撮影会'] })
    const id = await addModel('別のモデル')

    await expect(
      updateModel(id, input({ name: 'aoi', affiliations: ['フリー'] })),
    ).resolves.toBeUndefined()
    await expect(
      updateModel(id, input({ name: '葵', affiliations: ['春', '秋の撮影会'] })),
    ).rejects.toThrow('「葵」（所属：秋の撮影会）は既に登録されています')
    await expect(updateModel(id, input({ name: '葵', affiliations: ['春'] }))).resolves.toBeUndefined()
  })

  it('所属なしどうしの同名はエラー', async () => {
    await addModel('葵')
    const id = await addModel('別のモデル')

    await expect(updateModel(id, input({ name: '葵' }))).rejects.toThrow('所属：なし')
  })

  it('自分の名前の大文字小文字だけを変えられる', async () => {
    const id = await addModel('kanna')

    await updateModel(id, input({ name: 'Kanna' }))

    expect((await db.models.get(id))?.name).toBe('Kanna')
  })

  it('論理削除したモデルとは重複しない', async () => {
    const deleted = await addModel('削除済み')
    await softDeleteRow('models', deleted)
    const id = await addModel('別のモデル')

    await updateModel(id, input({ name: '削除済み' }))

    expect((await db.models.get(id))?.name).toBe('削除済み')
  })

  it('存在しないモデルと論理削除したモデルはエラー', async () => {
    const id = await addModel()
    await softDeleteRow('models', id)

    await expect(updateModel('missing', input())).rejects.toThrow('見つかりません')
    await expect(updateModel(id, input())).rejects.toThrow('見つかりません')
  })
})

describe('splitAffiliations', () => {
  it('選んだ所属をメインにし、空欄と重複（大文字小文字の違いを含む）を除く', () => {
    expect(splitAffiliations(['A', ' B ', '', 'a', 'C'], 1)).toEqual({ main: 'B', subs: ['A', 'C'] })
  })

  it('メインに選んだ欄が空なら先頭をメインにする', () => {
    expect(splitAffiliations(['A', '', 'C'], 1)).toEqual({ main: 'A', subs: ['C'] })
  })

  it('メインに選んだ欄が他と重複していても、その所属をメインにする', () => {
    expect(splitAffiliations(['A', 'B', 'a'], 2)).toEqual({ main: 'A', subs: ['B'] })
  })

  it('全部空なら所属なし', () => {
    expect(splitAffiliations(['', ' '], 0)).toEqual({ main: null, subs: [] })
  })
})

describe('別名義', () => {
  it('追加・削除を入力どおりにし、空欄と重複は除く', async () => {
    const id = await addModel()
    await updateModel(id, input({ aliases: ['A', 'B'] }))
    const kept = (await db.model_former_names.toArray()).find((a) => a.name === 'A')!

    await updateModel(id, input({ aliases: ['A', '', 'C', 'c'] }))

    expect(await aliasesOf(id)).toEqual(['A', 'C'])
    // 残したものは作り直さない
    expect((await db.model_former_names.get(kept.id))?.name).toBe('A')
  })

  it('別名義の変更を送信キューに積む', async () => {
    const id = await addModel()

    await updateModel(id, input({ aliases: ['A'] }))

    const entries = await db._outbox.toArray()
    expect(entries.some((e) => e.table === 'model_former_names' && e.op === 'insert')).toBe(true)
  })

  it('全部消せる', async () => {
    const id = await addModel()
    await updateModel(id, input({ aliases: ['A', 'B'] }))

    await updateModel(id, input({ aliases: [] }))

    expect(await aliasesOf(id)).toEqual([])
  })
})

describe('所属の照合', () => {
  it('撮影会名がメイン以外の所属と一致しても、同じモデルとして扱う', async () => {
    const id = await addModel('葵', { affiliation: 'フリー', sub_affiliations: ['秋の撮影会'] })

    expect(await resolveModel(USER, '葵', '秋の撮影会')).toEqual({ id, created: false })
    expect((await resolveModel(USER, '葵', '春の撮影会')).created).toBe(true)
  })

  it('新しく作るモデルの sub_affiliations は空の配列', async () => {
    const { id } = await resolveModel(USER, '葵', '秋')

    expect((await db.models.get(id))?.sub_affiliations).toEqual([])
  })
})

describe('モデルの詳細', () => {
  it('所属と別名義を含めて返す', async () => {
    const id = await addModel('栞奈', {
      name_kana: 'かんな',
      sns_links: { x: '@kanna' },
      contact_method: 'LINE',
      contact_value: 'kanna',
      affiliation: 'フリー',
      sub_affiliations: ['秋'],
      is_favorite: true,
      status: 'ng',
      notes: 'メモ',
    })
    await updateModel(
      id,
      input({
        nameKana: 'かんな',
        x: '@kanna',
        contactMethod: 'LINE',
        contactValue: 'kanna',
        affiliations: ['フリー', '秋'],
        aliases: ['旧名A', '旧名B'],
        isFavorite: true,
        status: 'inactive',
        notes: 'メモ',
      }),
    )

    expect(await loadModelDetail(id)).toMatchObject({
      id,
      userId: USER,
      name: '栞奈',
      nameKana: 'かんな',
      snsLinks: { x: '@kanna' },
      contactMethod: 'LINE',
      contactValue: 'kanna',
      affiliation: 'フリー',
      subAffiliations: ['秋'],
      aliases: ['旧名A', '旧名B'],
      isFavorite: true,
      status: 'inactive',
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
    await db.models.update(model.id, { sub_affiliations: undefined })

    expect(await loadModelDetail(model.id)).toMatchObject({
      snsLinks: {},
      subAffiliations: [],
      aliases: [],
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
