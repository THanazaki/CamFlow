import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadModelDetail, loadModelList } from '@/lib/queries/models'
import { createRow, softDeleteRow } from '@/lib/sync/mutations'

import {
  findMergeCandidates,
  mergeModelInto,
  splitAffiliations,
  updateModel,
  type ModelInput,
} from '../models'
import { createReservation } from '../reservations'
import { findAffiliationConflict, resolveModel } from '../shoots'

const USER = '11111111-1111-4111-8111-111111111111'

function input(overrides: Partial<ModelInput> = {}): ModelInput {
  return {
    name: '栞奈',
    nameKana: '',
    accounts: [],
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
        accounts: [
          { service: 'x', value: ' @kanna ' },
          { service: 'instagram', value: ' @kanna_ig ' },
        ],
        contactMethod: ' LINE ',
        contactValue: ' kanna ',
        affiliations: [' 秋の撮影会 ', ' 春の撮影会 '],
        mainAffiliation: 1,
        aliases: [{ name: ' 旧名 ', kana: ' きゅうめい ' }],
        isFavorite: true,
        status: 'inactive',
        notes: ' メモ ',
      }),
    )

    expect(await db.models.get(id)).toMatchObject({
      name: '栞奈改',
      name_kana: 'かんな',
      sns_accounts: [
        { service: 'x', value: '@kanna' },
        { service: 'instagram', value: '@kanna_ig' },
      ],
      contact_method: 'LINE',
      contact_value: 'kanna',
      affiliation: '春の撮影会',
      sub_affiliations: ['秋の撮影会'],
      is_favorite: true,
      status: 'inactive',
      notes: 'メモ',
    })
    expect(await aliasesOf(id)).toEqual(['旧名'])
    const [alias] = await db.model_former_names.where('model_id').equals(id).toArray()
    expect(alias.name_kana).toBe('きゅうめい')
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

  it('アカウントは同じ種類でも複数保存でき、空欄と重複は除く。sns_links は書き換えない', async () => {
    const id = await addModel('栞奈', { sns_links: { x: '@old' } })

    await updateModel(
      id,
      input({
        accounts: [
          { service: 'x', value: '@main' },
          { service: 'x', value: '@sub' },
          { service: 'instagram', value: '  ' },
          { service: 'x', value: '@MAIN' },
          { service: 'other', value: 'https://example.com' },
        ],
      }),
    )

    const model = await db.models.get(id)
    expect(model?.sns_accounts).toEqual([
      { service: 'x', value: '@main' },
      { service: 'x', value: '@sub' },
      { service: 'other', value: 'https://example.com' },
    ])
    expect(model?.sns_links).toEqual({ x: '@old' })
  })

  it('アカウントを全部消したら、古い sns_links は表示に出さない', async () => {
    const id = await addModel('栞奈', { sns_links: { x: '@old' } })

    await updateModel(id, input({ accounts: [] }))

    expect((await loadModelDetail(id))?.accounts).toEqual([])
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
    ).resolves.toBeDefined()
    await expect(
      updateModel(id, input({ name: '葵', affiliations: ['春', '秋の撮影会'] })),
    ).rejects.toThrow('「葵」（所属：秋の撮影会）は既に登録されています')
    await expect(updateModel(id, input({ name: '葵', affiliations: ['春'] }))).resolves.toBeDefined()
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
    await updateModel(id, input({ aliases: [{ name: 'A', kana: '' }, { name: 'B', kana: '' }] }))
    const kept = (await db.model_former_names.toArray()).find((a) => a.name === 'A')!

    await updateModel(id, input({ aliases: [{ name: 'A', kana: '' }, { name: '', kana: '' }, { name: 'C', kana: '' }, { name: 'c', kana: '' }] }))

    expect(await aliasesOf(id)).toEqual(['A', 'C'])
    // 残したものは作り直さない
    expect((await db.model_former_names.get(kept.id))?.name).toBe('A')
  })

  it('別名義の変更を送信キューに積む', async () => {
    const id = await addModel()

    await updateModel(id, input({ aliases: [{ name: 'A', kana: '' }] }))

    const entries = await db._outbox.toArray()
    expect(entries.some((e) => e.table === 'model_former_names' && e.op === 'insert')).toBe(true)
  })

  it('全部消せる', async () => {
    const id = await addModel()
    await updateModel(id, input({ aliases: [{ name: 'A', kana: '' }, { name: 'B', kana: '' }] }))

    await updateModel(id, input({ aliases: [] }))

    expect(await aliasesOf(id)).toEqual([])
  })
  it('読みだけ変えたら、行を作り直さずに読みを更新する', async () => {
    const id = await addModel()
    await updateModel(id, input({ aliases: [{ name: 'A', kana: '' }] }))
    const [before] = await db.model_former_names.toArray()
    expect(before.name_kana).toBeNull()

    await updateModel(id, input({ aliases: [{ name: 'A', kana: ' えー ' }] }))

    const rows = await db.model_former_names.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: before.id, name_kana: 'えー' })
  })
})

describe('所属から撮影会マスタへの登録', () => {
  const organizerNames = async () =>
    (await db.organizers.toArray()).filter((o) => !o.deleted_at).map((o) => o.name).sort()

  it('撮影会マスタに無い所属を登録し、登録した名前を返す。「フリー」は登録しない', async () => {
    const id = await addModel()
    await createRow('organizers', { user_id: USER, name: '秋の撮影会', is_favorite: false })

    const result = await updateModel(
      id,
      input({ affiliations: ['フリー', '秋の撮影会', ' 春の撮影会 '], mainAffiliation: 0 }),
    )

    expect(result.createdOrganizers).toEqual(['春の撮影会'])
    expect(await organizerNames()).toEqual(['春の撮影会', '秋の撮影会'])
    const created = (await db.organizers.toArray()).find((o) => o.name === '春の撮影会')
    expect(created?.user_id).toBe(USER)
  })

  it('大文字小文字の違いだけなら同じ撮影会とみなす。2回目の保存では増えない', async () => {
    const id = await addModel()
    await createRow('organizers', { user_id: USER, name: 'Pista', is_favorite: false })

    expect((await updateModel(id, input({ affiliations: ['pista', 'Nova'] }))).createdOrganizers)
      .toEqual(['Nova'])
    expect((await updateModel(id, input({ affiliations: ['pista', 'Nova'] }))).createdOrganizers)
      .toEqual([])
    expect(await organizerNames()).toEqual(['Nova', 'Pista'])
  })

  it('論理削除した撮影会と同じ名前なら、新しく登録する', async () => {
    const id = await addModel()
    const old = await createRow('organizers', { user_id: USER, name: '秋', is_favorite: false })
    await softDeleteRow('organizers', old)

    expect((await updateModel(id, input({ affiliations: ['秋'] }))).createdOrganizers).toEqual(['秋'])
  })
})

describe('モデルアカウントの読み取り', () => {
  it('sns_accounts を持たない古い行は sns_links から作る（X → Instagram → その他）', async () => {
    const id = await addModel('栞奈', { sns_links: { tiktok: '@tt', instagram: '@ig', x: '@x', y: '' } })

    expect((await loadModelDetail(id))?.accounts).toEqual([
      { service: 'x', value: '@x' },
      { service: 'instagram', value: '@ig' },
      { service: 'tiktok', value: '@tt' },
    ])
  })
})

describe('所属の照合', () => {
  it('撮影会名がメイン以外の所属と一致しても、同じモデルとして扱う', async () => {
    const id = await addModel('葵', { affiliation: 'フリー', sub_affiliations: ['秋の撮影会'] })

    expect(await resolveModel(USER, '葵', '秋の撮影会')).toEqual({ id, created: false })
    expect((await resolveModel(USER, '葵', '春の撮影会')).created).toBe(true)
  })

  it('所属が合わない同名モデルは確認の対象になり、addAffiliation なら所属に加える', async () => {
    const id = await addModel('葵', { affiliation: 'フリー' })

    expect(await findAffiliationConflict('葵', '秋の撮影会')).toMatchObject({ name: '葵' })
    expect(await findAffiliationConflict('葵', 'フリー')).toBeNull()
    expect(await findAffiliationConflict('葵', '')).toBeNull()
    expect(await findAffiliationConflict('桜', '秋の撮影会')).toBeNull()

    expect(await resolveModel(USER, '葵', '秋の撮影会', { addAffiliation: true })).toEqual({
      id,
      created: false,
    })
    expect((await db.models.get(id))?.sub_affiliations).toEqual(['秋の撮影会'])
    expect(await findAffiliationConflict('葵', '秋の撮影会')).toBeNull()
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
        accounts: [{ service: 'x', value: '@kanna' }],
        contactMethod: 'LINE',
        contactValue: 'kanna',
        affiliations: ['フリー', '秋'],
        aliases: [
          { name: '旧名A', kana: 'きゅうめいえー' },
          { name: '旧名B', kana: '' },
        ],
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
      accounts: [{ service: 'x', value: '@kanna' }],
      contactMethod: 'LINE',
      contactValue: 'kanna',
      affiliation: 'フリー',
      subAffiliations: ['秋'],
      aliases: [
        { name: '旧名A', kana: 'きゅうめいえー' },
        { name: '旧名B', kana: null },
      ],
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
      accounts: [],
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

describe('別名義と同名のモデルの統合', () => {
  it('新しく追加した別名義と同名のモデルだけを候補にする', async () => {
    const id = await addModel('栞奈')
    const other = await addModel('旧名', { affiliation: '春の撮影会', sub_affiliations: ['秋の撮影会'] })
    await addModel('別人')

    expect(await findMergeCandidates(id, [{ name: ' 旧名 ', kana: '' }])).toEqual([
      { id: other, name: '旧名', affiliations: ['春の撮影会', '秋の撮影会'] },
    ])

    // 保存済みの別名義は、統合を断った後に毎回聞かない
    await updateModel(id, input({ aliases: [{ name: '旧名', kana: '' }] }))
    expect(await findMergeCandidates(id, [{ name: '旧名', kana: '' }])).toEqual([])
  })

  it('統合すると明細と別名義を移し、統合したモデルを削除する', async () => {
    const target = await addModel('栞奈')
    const source = await addModel('旧名')
    await createRow('model_former_names', { user_id: USER, model_id: source, name: 'さらに旧名', name_kana: null })
    await createRow('model_former_names', { user_id: USER, model_id: source, name: '栞奈', name_kana: null })

    const both = 'slot-both'
    const own = 'slot-own'
    await createRow('slot_models', { user_id: USER, slot_id: both, model_id: target } as never)
    const dup = await createRow('slot_models', { user_id: USER, slot_id: both, model_id: source } as never)
    const moved = await createRow('slot_models', { user_id: USER, slot_id: own, model_id: source } as never)
    const wish = await createRow('wishlist_models', { user_id: USER, model_id: source } as never)

    await mergeModelInto(target, source)

    expect((await db.models.get(source))?.deleted_at).toBeTruthy()
    expect(await db.slot_models.get(dup)).toBeUndefined()
    expect((await db.slot_models.get(moved))?.model_id).toBe(target)
    expect((await db.wishlist_models.get(wish))?.model_id).toBe(target)
    expect(await aliasesOf(target)).toEqual(['さらに旧名'])
    expect(await aliasesOf(source)).toEqual([])
  })
})

describe('統合したモデルの所属', () => {
  it('統合先の所属と同じものを除いて、それ以外の所属に足す', async () => {
    const target = await addModel('栞奈', { affiliation: '春の撮影会', sub_affiliations: ['秋の撮影会'] })
    const source = await addModel('旧名', {
      affiliation: '夏の撮影会',
      sub_affiliations: ['春の撮影会', ' 秋の撮影会 ', '冬の撮影会'],
    })

    await mergeModelInto(target, source)

    expect((await db.models.get(target))?.sub_affiliations).toEqual([
      '秋の撮影会',
      '夏の撮影会',
      '冬の撮影会',
    ])
  })

  it('足すと同名・同所属のモデルが他にもいることになる所属は足さない', async () => {
    const target = await addModel('栞奈', { affiliation: '春の撮影会', sub_affiliations: [] })
    await addModel('栞奈', { affiliation: '夏の撮影会', sub_affiliations: [] })
    const source = await addModel('旧名', { affiliation: '夏の撮影会', sub_affiliations: ['冬の撮影会'] })

    await mergeModelInto(target, source)

    expect((await db.models.get(target))?.sub_affiliations).toEqual(['冬の撮影会'])
  })
})
