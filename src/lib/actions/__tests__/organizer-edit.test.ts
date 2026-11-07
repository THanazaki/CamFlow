import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadOrganizerDetail, loadOrganizerList } from '@/lib/queries/organizers'
import { createRow, softDeleteRow } from '@/lib/sync/mutations'

import { updateOrganizer, type OrganizerInput } from '../organizers'
import { createReservation } from '../reservations'

const USER = '11111111-1111-4111-8111-111111111111'

function input(overrides: Partial<OrganizerInput> = {}): OrganizerInput {
  return {
    name: '秋の撮影会',
    nameKana: '',
    baseLocation: '',
    url: '',
    contact: '',
    notes: '',
    isFavorite: false,
    ...overrides,
  }
}

function addOrganizer(name = '秋の撮影会', extra: Record<string, unknown> = {}) {
  return createRow('organizers', { user_id: USER, name, is_favorite: false, ...extra })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('撮影会の編集', () => {
  it('全項目を保存し、前後の空白を除く', async () => {
    const id = await addOrganizer()

    await updateOrganizer(
      id,
      input({
        name: ' 秋の撮影会 改 ',
        nameKana: ' あきのさつえいかい ',
        baseLocation: ' 東京 ',
        url: ' https://example.com ',
        contact: ' info@example.com ',
        notes: ' 1行目\n2行目 ',
        isFavorite: true,
      }),
    )

    expect(await db.organizers.get(id)).toMatchObject({
      name: '秋の撮影会 改',
      name_kana: 'あきのさつえいかい',
      base_location: '東京',
      url: 'https://example.com',
      contact: 'info@example.com',
      notes: '1行目\n2行目',
      is_favorite: true,
    })
  })

  it('拠点は一覧に反映される', async () => {
    const id = await addOrganizer()

    await updateOrganizer(id, input({ baseLocation: '関西' }))

    expect(await loadOrganizerList()).toMatchObject([{ name: '秋の撮影会', baseLocation: '関西' }])
  })

  it('空にした項目は null に戻す', async () => {
    const id = await addOrganizer('秋の撮影会', {
      name_kana: 'あき',
      base_location: '東京',
      url: 'https://example.com',
      contact: 'x',
      notes: 'メモ',
    })

    await updateOrganizer(id, input())

    expect(await db.organizers.get(id)).toMatchObject({
      name_kana: null,
      base_location: null,
      url: null,
      contact: null,
      notes: null,
    })
  })

  it('id / user_id / created_at は変えず、更新日時は進める', async () => {
    const id = await addOrganizer()
    const before = await db.organizers.get(id)
    await db.organizers.update(id, { updated_at: '2000-01-01T00:00:00.000Z' })

    await updateOrganizer(id, input({ name: '新しい名前' }))

    const after = await db.organizers.get(id)
    expect(after).toMatchObject({ id, user_id: USER, created_at: before?.created_at, deleted_at: null })
    expect(after?.updated_at).not.toBe('2000-01-01T00:00:00.000Z')
  })

  it('変更を送信キューに積む', async () => {
    const id = await addOrganizer()
    const before = await db._outbox.count()

    await updateOrganizer(id, input({ baseLocation: '東京' }))

    expect(await db._outbox.count()).toBe(before + 1)
  })

  it('撮影会名が空ならエラーにして変更しない', async () => {
    const id = await addOrganizer()

    await expect(updateOrganizer(id, input({ name: '  ', baseLocation: '東京' }))).rejects.toThrow(
      '撮影会名を入力してください',
    )

    expect((await db.organizers.get(id))?.base_location).toBeUndefined()
  })

  it('他の撮影会と同じ名前（大文字小文字の違いを含む）はエラー', async () => {
    await addOrganizer('Autumn')
    const id = await addOrganizer('別の撮影会')

    await expect(updateOrganizer(id, input({ name: 'autumn' }))).rejects.toThrow('既に登録されています')

    expect((await db.organizers.get(id))?.name).toBe('別の撮影会')
  })

  it('自分の名前の大文字小文字だけを変えられる。論理削除した撮影会の名前は使える', async () => {
    const id = await addOrganizer('autumn')
    await updateOrganizer(id, input({ name: 'Autumn' }))
    expect((await db.organizers.get(id))?.name).toBe('Autumn')

    const deleted = await addOrganizer('削除済み')
    await softDeleteRow('organizers', deleted)
    await updateOrganizer(id, input({ name: '削除済み' }))
    expect((await db.organizers.get(id))?.name).toBe('削除済み')
  })

  it('名前を変えても、撮影のタイトルとモデルの所属は変えない', async () => {
    const { sessionId } = await createReservation(USER, {
      eventName: '秋の撮影会',
      shootCategory: 'solo',
      modelName: '葵',
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
    const [organizer] = await db.organizers.toArray()

    await updateOrganizer(organizer.id, input({ name: '名前を変えた撮影会' }))

    expect((await db.sessions.get(sessionId))?.title).toBe('秋の撮影会')
    expect((await db.models.toArray())[0].affiliation).toBe('秋の撮影会')
    expect((await db.sessions.get(sessionId))?.organizer_id).toBe(organizer.id)
  })

  it('存在しない撮影会と論理削除した撮影会はエラー', async () => {
    const id = await addOrganizer()
    await softDeleteRow('organizers', id)

    await expect(updateOrganizer('missing', input())).rejects.toThrow('見つかりません')
    await expect(updateOrganizer(id, input())).rejects.toThrow('見つかりません')
  })
})

describe('撮影会の詳細', () => {
  it('全カラムの値を返す', async () => {
    const id = await addOrganizer('秋の撮影会', {
      name_kana: 'あき',
      base_location: '東京',
      url: 'https://example.com',
      contact: 'x',
      notes: 'メモ',
      is_favorite: true,
    })

    expect(await loadOrganizerDetail(id)).toMatchObject({
      id,
      userId: USER,
      name: '秋の撮影会',
      nameKana: 'あき',
      baseLocation: '東京',
      url: 'https://example.com',
      contact: 'x',
      notes: 'メモ',
      isFavorite: true,
      deletedAt: null,
    })
  })

  it('欠けたカラムは既定値で補う。無いか論理削除済みなら null', async () => {
    const id = await createRow('organizers', { user_id: USER, name: '最小' })
    expect(await loadOrganizerDetail(id)).toMatchObject({
      nameKana: null,
      baseLocation: null,
      isFavorite: false,
    })

    await softDeleteRow('organizers', id)
    expect(await loadOrganizerDetail(id)).toBeNull()
    expect(await loadOrganizerDetail('missing')).toBeNull()
  })
})
