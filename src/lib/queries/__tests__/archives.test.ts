import { beforeEach, describe, expect, it } from 'vitest'

import { createShootHistory, updateShootHistory, type ShootHistoryInput } from '@/lib/actions/archives'
import { createReservation } from '@/lib/actions/reservations'
import { confirmShoot, updateConfirmedShoot, type ShootConfirmInput } from '@/lib/actions/shoots'
import { db } from '@/lib/db'
import {
  EMPTY_SHOOT_SEARCH,
  filterShootArchive,
  loadShootArchive,
  loadShootRecord,
  shootRecordHref,
} from '@/lib/queries/archives'
import { createRow, softDeleteRow } from '@/lib/sync/mutations'

const USER = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-06-15T12:00:00')

function confirmation(overrides: Partial<ShootConfirmInput> = {}): ShootConfirmInput {
  return {
    fromSessionId: '',
    eventName: '確定の撮影会',
    shootCategory: 'solo',
    modelName: '栞奈',
    concept: '',
    placeCategory: 'studio',
    venueName: 'スタジオA',
    meetingPoint: '',
    shootDate: '2026-06-01',
    meetingTime: '',
    startTime: '13:00',
    endTime: '15:00',
    paymentTiming: null,
    paymentDate: '',
    shootFee: '',
    costumeOptions: '',
    shootingMethodOptions: '',
    ...overrides,
  }
}

function history(overrides: Partial<ShootHistoryInput> = {}): ShootHistoryInput {
  return {
    eventName: '過去の撮影会',
    shootCategory: 'solo',
    modelName: '葵',
    concept: '',
    placeCategory: 'outdoor',
    venueName: '代々木公園',
    shootDate: '2026-01-10',
    storageUrls: [],
    ...overrides,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('撮影情報検索の対象', () => {
  it('運用フローと過去撮影登録を統合し、撮影日の新しい順に返す', async () => {
    await createShootHistory(USER, history({ storageUrls: ['https://example.com/h'] }))
    await confirmShoot(USER, confirmation())

    const rows = await loadShootArchive(NOW)
    expect(rows.map((r) => [r.source, r.title, r.modelNames, r.shootDate])).toEqual([
      ['slot', '確定の撮影会', ['栞奈'], '2026-06-01'],
      ['history', '過去の撮影会', ['葵'], '2026-01-10'],
    ])
    expect(rows[1].storageUrls).toEqual(['https://example.com/h'])
  })

  it('確定済みでも撮影日時がまだ先なら出さない', async () => {
    await confirmShoot(USER, confirmation({ shootDate: '2026-07-01' }))

    expect(await loadShootArchive(NOW)).toEqual([])
  })

  it('予約の段階のものは撮影日を過ぎていても出さない', async () => {
    await createReservation(USER, {
      eventName: '予約',
      shootCategory: 'solo',
      modelName: '栞奈',
      concept: '',
      venueName: '',
      shootDate: '2026-01-01',
      bookingOpensAt: '2025-12-01T20:00',
      bookingMethod: 'page',
      bookingContact: 'https://example.com',
      shootFee: '',
      costumeOptions: '',
      shootingMethodOptions: '',
      paymentTiming: null,
      paymentDate: '',
    })

    expect(await loadShootArchive(NOW)).toEqual([])
  })

  it('撮影済みの枠は日時に関係なく出す。中止・不参加と論理削除は出さない', async () => {
    const shot = await confirmShoot(USER, confirmation({ eventName: '撮影済み', shootDate: '2026-07-01' }))
    await db.slots.update(shot.slotId, { shoot_status: 'shot' })
    const cancelled = await confirmShoot(USER, confirmation({ eventName: '中止' }))
    await db.slots.update(cancelled.slotId, { shoot_status: 'cancelled' })
    const noShow = await confirmShoot(USER, confirmation({ eventName: '不参加' }))
    await db.slots.update(noShow.slotId, { shoot_status: 'no_show' })
    const deletedSlot = await confirmShoot(USER, confirmation({ eventName: '枠を削除' }))
    await softDeleteRow('slots', deletedSlot.slotId)
    const deletedSession = await confirmShoot(USER, confirmation({ eventName: '撮影を削除' }))
    await softDeleteRow('sessions', deletedSession.sessionId)
    const { historyId } = await createShootHistory(USER, history())
    await softDeleteRow('shoot_history', historyId)

    expect((await loadShootArchive(NOW)).map((r) => r.title)).toEqual(['撮影済み'])
  })

  it('マスタから削除したモデルも、過去の記録として名前を出す', async () => {
    await createShootHistory(USER, history())
    const [model] = await db.models.toArray()
    await softDeleteRow('models', model.id)

    expect((await loadShootArchive(NOW))[0].modelNames).toEqual(['葵'])
  })

  it('マスタに紐づく場所はマスタの現在の名前で出す', async () => {
    const venueId = await createRow('venues', { user_id: USER, name: 'スタジオA', kind: 'studio' })
    await confirmShoot(USER, confirmation())
    await db.venues.update(venueId, { name: 'スタジオA改' })

    expect((await loadShootArchive(NOW))[0].venueName).toBe('スタジオA改')
  })
})

describe('撮影情報検索の条件', () => {
  async function records() {
    await confirmShoot(
      USER,
      confirmation({ eventName: 'Autumn 撮影会', modelName: '栞奈', venueName: 'スタジオA', shootDate: '2026-06-01' }),
    )
    await createShootHistory(
      USER,
      history({ eventName: '春の撮影会', modelName: '葵', venueName: '代々木公園', shootDate: '2026-01-10' }),
    )
    return loadShootArchive(NOW)
  }
  const titles = (rows: { title: string }[]) => rows.map((r) => r.title)

  it('条件が空なら全件', async () => {
    expect(filterShootArchive(await records(), EMPTY_SHOOT_SEARCH)).toHaveLength(2)
  })

  it('撮影会名は部分一致で、大文字小文字と前後の空白を無視する', async () => {
    const rows = filterShootArchive(await records(), { ...EMPTY_SHOOT_SEARCH, eventName: ' autumn ' })
    expect(titles(rows)).toEqual(['Autumn 撮影会'])
  })

  it('モデル名と撮影場所は部分一致', async () => {
    const all = await records()
    expect(titles(filterShootArchive(all, { ...EMPTY_SHOOT_SEARCH, modelName: '葵' }))).toEqual(['春の撮影会'])
    expect(titles(filterShootArchive(all, { ...EMPTY_SHOOT_SEARCH, venueName: 'スタジオ' }))).toEqual([
      'Autumn 撮影会',
    ])
  })

  it('モデルなしの撮影はモデル名の条件に一致しない', async () => {
    await confirmShoot(USER, confirmation({ shootCategory: 'session', eventName: 'セッション' }))

    const all = await loadShootArchive(NOW)
    expect(filterShootArchive(all, { ...EMPTY_SHOOT_SEARCH, modelName: '栞奈' })).toEqual([])
  })

  it('撮影日は両端を含む', async () => {
    const all = await records()
    expect(titles(filterShootArchive(all, { ...EMPTY_SHOOT_SEARCH, dateFrom: '2026-06-01' }))).toEqual([
      'Autumn 撮影会',
    ])
    expect(titles(filterShootArchive(all, { ...EMPTY_SHOOT_SEARCH, dateTo: '2026-01-10' }))).toEqual([
      '春の撮影会',
    ])
    expect(
      filterShootArchive(all, { ...EMPTY_SHOOT_SEARCH, dateFrom: '2026-01-11', dateTo: '2026-05-31' }),
    ).toEqual([])
  })

  it('複数の条件は AND', async () => {
    const all = await records()
    expect(
      filterShootArchive(all, { ...EMPTY_SHOOT_SEARCH, eventName: '春', modelName: '栞奈' }),
    ).toEqual([])
  })
})

describe('撮影情報の詳細', () => {
  it('source と id で1件引ける。無ければ null', async () => {
    const { slotId } = await confirmShoot(USER, confirmation({ shootFee: '15000', meetingTime: '12:30' }))
    const { historyId } = await createShootHistory(USER, history())

    expect(await loadShootRecord('slot', slotId)).toMatchObject({
      title: '確定の撮影会',
      shootFee: 15000,
      meetingTime: '12:30',
      startTime: '13:00',
      endTime: '15:00',
    })
    expect((await loadShootRecord('history', historyId))?.title).toBe('過去の撮影会')
    expect(await loadShootRecord('slot', historyId)).toBeNull()
    expect(await loadShootRecord('history', 'missing')).toBeNull()
  })

  it('URL に source と id を含める', () => {
    expect(shootRecordHref('edit', { source: 'history', id: 'abc' })).toBe(
      '/archives/search/edit?source=history&id=abc',
    )
  })
})

describe('確定した撮影の編集', () => {
  const edited = (overrides: Partial<ShootConfirmInput> = {}) => ({
    ...confirmation(overrides),
    storageUrls: [] as string[],
  })

  it('内容を更新し、status は変えない', async () => {
    const { slotId, sessionId } = await confirmShoot(USER, confirmation())
    await db.sessions.update(sessionId, { status: 'done' })

    await updateConfirmedShoot(USER, slotId, {
      ...edited({
        eventName: '変更後',
        concept: '夕景',
        placeCategory: 'outdoor',
        venueName: '代々木公園',
        meetingPoint: '原宿駅',
        shootDate: '2026-05-01',
        meetingTime: '09:30',
        startTime: '10:00',
        endTime: '11:30',
        shootFee: '20000',
        paymentTiming: 'paid',
        costumeOptions: '浴衣',
        shootingMethodOptions: '動画撮影',
      }),
      storageUrls: [' https://example.com/a ', ''],
    })

    expect(await db.sessions.get(sessionId)).toMatchObject({
      title: '変更後',
      status: 'done',
      session_date: '2026-05-01',
      concept: '夕景',
      place_category: 'outdoor',
      venue_name: '代々木公園',
      meeting_point: '原宿駅',
    })
    expect(await db.slots.get(slotId)).toMatchObject({
      start_at: new Date('2026-05-01T10:00:00').toISOString(),
      meeting_at: new Date('2026-05-01T09:30:00').toISOString(),
      planned_minutes: 90,
      booking_fee: 20000,
      fee_payment_timing: 'paid',
      costume_options: '浴衣',
      shooting_method_options: '動画撮影',
      storage_urls: ['https://example.com/a'],
    })
  })

  it('モデルを変えると紐づけを付け替え、モデル料の記録を残す', async () => {
    const { slotId } = await confirmShoot(USER, confirmation())
    const [link] = await db.slot_models.toArray()
    await db.slot_models.update(link.id, { fee: 12000 })

    await updateConfirmedShoot(USER, slotId, edited({ modelName: '葵' }))

    const links = await db.slot_models.toArray()
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ id: link.id, fee: 12000 })
    expect((await loadShootRecord('slot', slotId))?.modelNames).toEqual(['葵'])
  })

  it('モデルなしの区分に変えると紐づけを外す', async () => {
    const { slotId } = await confirmShoot(USER, confirmation())

    await updateConfirmedShoot(USER, slotId, edited({ shootCategory: 'large' }))

    expect(await db.slot_models.count()).toBe(0)
  })

  it('モデルなしの撮影にモデルを追加できる', async () => {
    const { slotId } = await confirmShoot(USER, confirmation({ shootCategory: 'large' }))

    await updateConfirmedShoot(USER, slotId, edited({ modelName: '葵' }))

    expect((await loadShootRecord('slot', slotId))?.modelNames).toEqual(['葵'])
  })

  it('複数モデルの撮影は、どちらかの名前のままなら紐づけを変えない', async () => {
    const { slotId } = await confirmShoot(USER, confirmation())
    const modelId = await createRow('models', { user_id: USER, name: '葵', sns_links: {} })
    await createRow('slot_models', { user_id: USER, slot_id: slotId, model_id: modelId })

    await updateConfirmedShoot(USER, slotId, edited({ modelName: '栞奈' }))

    expect(await db.slot_models.count()).toBe(2)
  })

  it.each([
    ['終了時刻が開始時刻以前', { startTime: '15:00', endTime: '15:00' }, '終了時刻'],
    ['不正な撮影料', { shootFee: '-1' }, '撮影料'],
    ['モデル名が空', { modelName: ' ' }, 'モデル名'],
  ])('%s はエラーにして変更しない', async (_name, overrides, message) => {
    const { slotId, sessionId } = await confirmShoot(USER, confirmation())

    await expect(
      updateConfirmedShoot(USER, slotId, edited({ eventName: '変更後', ...overrides })),
    ).rejects.toThrow(message)

    expect((await db.sessions.get(sessionId))?.title).toBe('確定の撮影会')
    expect(await db.models.count()).toBe(1)
  })

  it('URLが上限を超えるとエラーにしてモデルも作らない', async () => {
    const { slotId } = await confirmShoot(USER, confirmation())
    const urls = Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`)

    await expect(
      updateConfirmedShoot(USER, slotId, { ...edited({ modelName: '新しいモデル' }), storageUrls: urls }),
    ).rejects.toThrow('10個まで')

    expect(await db.models.count()).toBe(1)
  })

  it('存在しない撮影はエラー', async () => {
    await expect(updateConfirmedShoot(USER, 'missing', edited())).rejects.toThrow('見つかりません')
  })
})

describe('過去撮影の編集', () => {
  it('内容を更新する', async () => {
    const { historyId } = await createShootHistory(USER, history())

    await updateShootHistory(
      USER,
      historyId,
      history({
        eventName: '変更後',
        concept: '夕景',
        placeCategory: 'studio',
        venueName: 'スタジオA',
        shootDate: '2026-02-01',
        storageUrls: ['https://example.com/a'],
      }),
    )

    expect(await db.shoot_history.get(historyId)).toMatchObject({
      title: '変更後',
      concept: '夕景',
      place_category: 'studio',
      venue_name: 'スタジオA',
      shoot_date: '2026-02-01',
      storage_urls: ['https://example.com/a'],
      // 編集の対象外は変えない
      shoot_type: 'solo',
      venue_cost: 0,
    })
  })

  it('モデルを変えると紐づけを付け替え、モデル料の記録を残す', async () => {
    const { historyId } = await createShootHistory(USER, history())
    const [link] = await db.shoot_history_models.toArray()
    await db.shoot_history_models.update(link.id, { fee: 12000 })

    await updateShootHistory(USER, historyId, history({ modelName: '栞奈' }))

    const links = await db.shoot_history_models.toArray()
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ id: link.id, fee: 12000 })
    expect((await loadShootRecord('history', historyId))?.modelNames).toEqual(['栞奈'])
  })

  it('モデルなしの区分に変えると紐づけを外し、戻すと作り直す', async () => {
    const { historyId } = await createShootHistory(USER, history())

    await updateShootHistory(USER, historyId, history({ shootCategory: 'session' }))
    expect(await db.shoot_history_models.count()).toBe(0)

    await updateShootHistory(USER, historyId, history())
    expect(await db.shoot_history_models.toArray()).toMatchObject([{ fee: 0, payment_status: 'paid' }])
  })

  it('未来の撮影日はエラーにして変更しない', async () => {
    const { historyId } = await createShootHistory(USER, history())

    await expect(
      updateShootHistory(USER, historyId, history({ eventName: '変更後', shootDate: '2999-01-01' })),
    ).rejects.toThrow('今日以前')

    expect((await db.shoot_history.get(historyId))?.title).toBe('過去の撮影会')
  })

  it('存在しない撮影はエラー', async () => {
    await expect(updateShootHistory(USER, 'missing', history())).rejects.toThrow('見つかりません')
  })
})
