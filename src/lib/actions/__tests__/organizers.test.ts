import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadOrganizerList } from '@/lib/queries/organizers'
import { createRow, softDeleteRow } from '@/lib/sync/mutations'

import { createShootHistory, updateShootHistory, type ShootHistoryInput } from '../archives'
import { createReservation, type ReservationInput } from '../reservations'
import { confirmShoot, updateConfirmedShoot, type ShootConfirmInput } from '../shoots'
import { createWishlistModel } from '../wishlist'

const USER = '11111111-1111-4111-8111-111111111111'

function reservation(overrides: Partial<ReservationInput> = {}): ReservationInput {
  return {
    eventName: '',
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
    ...overrides,
  }
}

function confirmation(overrides: Partial<ShootConfirmInput> = {}): ShootConfirmInput {
  return {
    fromSessionId: '',
    eventName: '',
    shootCategory: 'solo',
    modelName: '葵',
    concept: '',
    placeCategory: 'studio',
    venueName: '',
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
    eventName: '',
    shootCategory: 'solo',
    modelName: '葵',
    concept: '',
    placeCategory: 'studio',
    venueName: '',
    shootDate: '2026-01-10',
    storageUrls: [],
    ...overrides,
  }
}

const names = async () => (await loadOrganizerList()).map((o) => o.name)

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('撮影会マスタの一覧', () => {
  it('撮影会名と拠点を、読みの順に返す。論理削除は出さない', async () => {
    await createRow('organizers', { user_id: USER, name: 'さくら撮影会', base_location: '東京', is_favorite: false })
    await createRow('organizers', { user_id: USER, name: '葵撮影会', name_kana: 'あおい', is_favorite: false })
    const deleted = await createRow('organizers', { user_id: USER, name: '削除', is_favorite: false })
    await softDeleteRow('organizers', deleted)

    expect(await loadOrganizerList()).toMatchObject([
      { name: '葵撮影会', baseLocation: null },
      { name: 'さくら撮影会', baseLocation: '東京' },
    ])
  })
})

describe('撮影会名の自動登録', () => {
  it('予約で入力した撮影会名を登録して紐づける', async () => {
    const { sessionId } = await createReservation(USER, reservation({ eventName: ' 秋の撮影会 ' }))

    expect(await names()).toEqual(['秋の撮影会'])
    const [organizer] = await db.organizers.toArray()
    expect(await db.sessions.get(sessionId)).toMatchObject({ organizer_id: organizer.id })
  })

  it('確定で入力した撮影会名を登録して紐づける', async () => {
    const { sessionId } = await confirmShoot(USER, confirmation({ eventName: '秋の撮影会' }))

    const [organizer] = await db.organizers.toArray()
    expect((await db.sessions.get(sessionId))?.organizer_id).toBe(organizer.id)
  })

  it('過去撮影で入力した撮影会名を登録して紐づける', async () => {
    const { historyId } = await createShootHistory(USER, history({ eventName: '秋の撮影会' }))

    const [organizer] = await db.organizers.toArray()
    expect((await db.shoot_history.get(historyId))?.organizer_id).toBe(organizer.id)
  })

  it('撮影希望で入力した撮影会名を登録する', async () => {
    await createWishlistModel(USER, {
      modelName: '葵',
      eventName: '秋の撮影会',
      modelX: '',
      modelInstagram: '',
      costumeOptions: '',
      shootingMethodOptions: '',
    })

    expect(await names()).toEqual(['秋の撮影会'])
  })

  it('撮影会名が空なら、自動のタイトルをマスタに入れない', async () => {
    const { sessionId } = await createReservation(USER, reservation())
    await confirmShoot(USER, confirmation({ concept: 'コンセプト' }))
    await createShootHistory(USER, history())

    expect(await names()).toEqual([])
    expect((await db.sessions.get(sessionId))?.organizer_id).toBeNull()
  })

  it('同名は大文字小文字の違いも含めて増やさず、同じ行に紐づける', async () => {
    const first = await createReservation(USER, reservation({ eventName: 'Autumn' }))
    const second = await createReservation(USER, reservation({ eventName: 'autumn' }))

    expect(await names()).toEqual(['Autumn'])
    expect((await db.sessions.get(first.sessionId))?.organizer_id).toBe(
      (await db.sessions.get(second.sessionId))?.organizer_id,
    )
  })

  it('論理削除した撮影会と同名なら新しく作る', async () => {
    const id = await createRow('organizers', { user_id: USER, name: '秋の撮影会', is_favorite: false })
    await softDeleteRow('organizers', id)

    await createReservation(USER, reservation({ eventName: '秋の撮影会' }))

    expect(await names()).toEqual(['秋の撮影会'])
    expect((await db.organizers.toArray()).length).toBe(2)
  })

  it('検証で失敗したら撮影会を作らない', async () => {
    await expect(
      createReservation(USER, reservation({ eventName: '秋', shootFee: '-1' })),
    ).rejects.toThrow('撮影料')
    await expect(
      confirmShoot(USER, confirmation({ eventName: '秋', startTime: '15:00', endTime: '15:00' })),
    ).rejects.toThrow('終了時刻')
    await expect(
      createShootHistory(USER, history({ eventName: '秋', shootDate: '2999-01-01' })),
    ).rejects.toThrow('今日以前')

    expect(await names()).toEqual([])
  })
})

describe('既存の撮影からの更新', () => {
  it('予約を選んでそのまま確定しても、自動のタイトルは登録しない', async () => {
    const { sessionId } = await createReservation(USER, reservation())
    const title = (await db.sessions.get(sessionId))!.title

    await confirmShoot(USER, confirmation({ fromSessionId: sessionId, eventName: title }))

    expect(await names()).toEqual([])
  })

  it('予約を選んでそのまま確定すると、予約の撮影会を引き継ぐ', async () => {
    const { sessionId } = await createReservation(USER, reservation({ eventName: '秋の撮影会' }))
    const before = (await db.sessions.get(sessionId))!.organizer_id

    await confirmShoot(USER, confirmation({ fromSessionId: sessionId, eventName: '秋の撮影会' }))

    expect((await db.sessions.get(sessionId))?.organizer_id).toBe(before)
    expect(await names()).toEqual(['秋の撮影会'])
  })

  it('確定時に撮影会名を変えると、新しい撮影会に紐づける', async () => {
    const { sessionId } = await createReservation(USER, reservation())

    await confirmShoot(USER, confirmation({ fromSessionId: sessionId, eventName: '新しい撮影会' }))

    const [organizer] = await db.organizers.toArray()
    expect(organizer.name).toBe('新しい撮影会')
    expect((await db.sessions.get(sessionId))?.organizer_id).toBe(organizer.id)
  })

  it('確定した撮影の編集で名前を変えなければ登録しない。変えると紐づける', async () => {
    const { slotId, sessionId } = await confirmShoot(USER, confirmation())
    const title = (await db.sessions.get(sessionId))!.title

    await updateConfirmedShoot(USER, slotId, {
      ...confirmation({ eventName: title }),
      storageUrls: [],
    })
    expect(await names()).toEqual([])

    await updateConfirmedShoot(USER, slotId, {
      ...confirmation({ eventName: '編集後の撮影会' }),
      storageUrls: [],
    })
    const [organizer] = await db.organizers.toArray()
    expect((await db.sessions.get(sessionId))?.organizer_id).toBe(organizer.id)
  })

  it('確定した撮影の編集で撮影会名を空にすると紐づけを外す。マスタの行は残す', async () => {
    const { slotId, sessionId } = await confirmShoot(USER, confirmation({ eventName: '秋の撮影会' }))

    await updateConfirmedShoot(USER, slotId, { ...confirmation({ eventName: '' }), storageUrls: [] })

    expect((await db.sessions.get(sessionId))?.organizer_id).toBeNull()
    expect(await names()).toEqual(['秋の撮影会'])
  })

  it('過去撮影の編集で名前を変えなければ登録しない。変えると紐づける', async () => {
    const { historyId } = await createShootHistory(USER, history())
    const title = (await db.shoot_history.get(historyId))!.title

    await updateShootHistory(USER, historyId, history({ eventName: title }))
    expect(await names()).toEqual([])

    await updateShootHistory(USER, historyId, history({ eventName: '編集後の撮影会' }))
    const [organizer] = await db.organizers.toArray()
    expect((await db.shoot_history.get(historyId))?.organizer_id).toBe(organizer.id)
  })
})
