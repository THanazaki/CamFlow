import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadShootRecord } from '@/lib/queries/archives'
import { loadReservationSchedule } from '@/lib/queries/reservations'
import { loadConfirmableReservations, loadConfirmedShoots } from '@/lib/queries/shoots'

import { createShootHistory, updateShootHistory, type ShootHistoryInput } from '../archives'
import { createReservation, type ReservationInput } from '../reservations'
import { confirmShoot, updateConfirmedShoot, type ShootConfirmInput } from '../shoots'

const USER = '11111111-1111-4111-8111-111111111111'

function reservation(overrides: Partial<ReservationInput> = {}): ReservationInput {
  return {
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
    ...overrides,
  }
}

function confirmation(overrides: Partial<ShootConfirmInput> = {}): ShootConfirmInput {
  return {
    fromSessionId: '',
    eventName: '秋の撮影会',
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
    eventName: '秋の撮影会',
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

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('メモ', () => {
  it('予約のメモを sessions.memo に保存し、予約スケジュールに出す', async () => {
    const { sessionId } = await createReservation(USER, reservation({ memo: ' 1行目\n2行目 ' }))

    expect((await db.sessions.get(sessionId))?.memo).toBe('1行目\n2行目')
    expect((await loadReservationSchedule())[0].memo).toBe('1行目\n2行目')
  })

  it('確定のメモを sessions.memo に保存し、確定撮影情報と詳細に出す', async () => {
    const { sessionId, slotId } = await confirmShoot(USER, confirmation({ memo: '駅から徒歩5分' }))

    expect((await db.sessions.get(sessionId))?.memo).toBe('駅から徒歩5分')
    expect((await loadConfirmedShoots())[0].memo).toBe('駅から徒歩5分')
    expect((await loadShootRecord('slot', slotId))?.memo).toBe('駅から徒歩5分')
  })

  it('過去撮影のメモを shoot_history.memo に保存し、詳細に出す', async () => {
    const { historyId } = await createShootHistory(USER, history({ memo: '夕景がきれいだった' }))

    expect((await db.shoot_history.get(historyId))?.memo).toBe('夕景がきれいだった')
    expect((await loadShootRecord('history', historyId))?.memo).toBe('夕景がきれいだった')
  })

  it('空欄・空白だけ・省略は null にする', async () => {
    const reserved = await createReservation(USER, reservation({ memo: '   ' }))
    const confirmed = await confirmShoot(USER, confirmation())
    const past = await createShootHistory(USER, history({ memo: '' }))

    expect((await db.sessions.get(reserved.sessionId))?.memo).toBeNull()
    expect((await db.sessions.get(confirmed.sessionId))?.memo).toBeNull()
    expect((await db.shoot_history.get(past.historyId))?.memo).toBeNull()
  })

  it('予約を選ぶとメモを引き継ぎ、そのまま確定すれば残る', async () => {
    const { sessionId } = await createReservation(USER, reservation({ memo: '予約時のメモ' }))

    const [candidate] = await loadConfirmableReservations()
    expect(candidate.memo).toBe('予約時のメモ')

    await confirmShoot(USER, confirmation({ fromSessionId: sessionId, memo: candidate.memo }))
    expect((await db.sessions.get(sessionId))?.memo).toBe('予約時のメモ')
  })

  it('撮影情報の編集でメモを変更できる', async () => {
    const { slotId, sessionId } = await confirmShoot(USER, confirmation({ memo: '前' }))
    const { historyId } = await createShootHistory(USER, history({ memo: '前' }))

    await updateConfirmedShoot(USER, slotId, { ...confirmation({ memo: '後' }), storageUrls: [] })
    await updateShootHistory(USER, historyId, history({ memo: '' }))

    expect((await db.sessions.get(sessionId))?.memo).toBe('後')
    expect((await db.shoot_history.get(historyId))?.memo).toBeNull()
  })
})
