import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadReservationSchedule } from '@/lib/queries/reservations'
import { loadShootRecord } from '@/lib/queries/archives'

import { createShootHistory, deleteShootRecord, type ShootHistoryInput } from '../archives'
import { createReservation, deleteReservation, type ReservationInput } from '../reservations'
import { confirmShoot, type ShootConfirmInput } from '../shoots'

const USER = '11111111-1111-4111-8111-111111111111'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const reservation: ReservationInput = {
  eventName: '秋の撮影会',
  shootCategory: 'solo',
  modelName: '葵',
  concept: '',
  venueName: '',
  shootDate: '2099-12-20',
  bookingOpensAt: '2099-11-20T20:00',
  bookingClosesAt: '',
  bookingMethod: 'page',
  bookingContact: '',
  shootFee: '',
  costumeOptions: '',
  shootingMethodOptions: '',
  paymentTiming: null,
  paymentDate: '',
} as ReservationInput

describe('予約の削除', () => {
  it('予約スケジュールから消し、モデルのマスタは残す', async () => {
    const { sessionId } = await createReservation(USER, reservation)
    expect(await loadReservationSchedule()).toHaveLength(1)

    await deleteReservation(sessionId)

    expect(await loadReservationSchedule()).toHaveLength(0)
    expect((await db.sessions.get(sessionId))?.deleted_at).not.toBeNull()
    const slots = await db.slots.where('session_id').equals(sessionId).toArray()
    expect(slots.every((s) => s.deleted_at)).toBe(true)
    expect(await db.models.count()).toBe(1)
  })

  it('削除済みの予約は削除できない', async () => {
    const { sessionId } = await createReservation(USER, reservation)
    await deleteReservation(sessionId)
    await expect(deleteReservation(sessionId)).rejects.toThrow()
  })
})

describe('撮影記録の削除', () => {
  it('確定撮影の記録（枠）を消すと、イベントも消える', async () => {
    const confirm: ShootConfirmInput = {
      fromSessionId: '',
      eventName: 'テスト撮影会',
      shootCategory: 'solo',
      modelName: '栞奈',
      concept: '',
      placeCategory: 'studio',
      venueName: '',
      meetingPoint: '',
      shootDate: '2020-01-10',
      startTime: '13:00',
      endTime: '15:00',
      meetingTime: '',
      paymentTiming: null,
      paymentDate: '',
      shootFee: '',
      costumeOptions: '',
      shootingMethodOptions: '',
    } as ShootConfirmInput
    const { slotId } = (await confirmShoot(USER, confirm)) as unknown as { slotId: string }
    const slot = slotId ? await db.slots.get(slotId) : (await db.slots.toArray())[0]
    expect(await loadShootRecord('slot', slot!.id)).not.toBeNull()

    await deleteShootRecord('slot', slot!.id)

    expect(await loadShootRecord('slot', slot!.id)).toBeNull()
    expect((await db.sessions.get(slot!.session_id))?.deleted_at).not.toBeNull()
    expect(await db.models.count()).toBe(1)
  })

  it('遡及登録した過去撮影を消す', async () => {
    const input = {
      eventName: '過去の会',
      shootCategory: 'solo',
      modelName: '花',
      concept: '',
      placeCategory: 'studio',
      venueName: '',
      shootDate: '2025-01-01',
      startTime: '',
      endTime: '',
      paymentTiming: null,
      paymentDate: '',
      shootFee: '',
      costumeOptions: '',
      shootingMethodOptions: '',
      storageUrls: [],
    } as unknown as ShootHistoryInput
    const { historyId } = await createShootHistory(USER, input)
    expect(await loadShootRecord('history', historyId)).not.toBeNull()

    await deleteShootRecord('history', historyId)

    expect(await loadShootRecord('history', historyId)).toBeNull()
    await expect(deleteShootRecord('history', historyId)).rejects.toThrow()
  })
})
