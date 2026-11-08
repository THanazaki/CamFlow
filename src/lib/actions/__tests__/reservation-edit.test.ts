import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadReservationInput, loadReservationSchedule } from '@/lib/queries/reservations'

import {
  createReservation,
  markReservationFailed,
  updateReservation,
  type ReservationInput,
} from '../reservations'
import { updateRow } from '@/lib/sync/mutations'

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

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('予約の編集', () => {
  it('登録した内容を読み込める', async () => {
    const { sessionId } = await createReservation(
      USER,
      reservation({ shootFee: '8000', memo: 'メモ' }),
    )

    const loaded = await loadReservationInput(sessionId)

    expect(loaded).toMatchObject({
      eventName: '秋の撮影会',
      modelName: '葵',
      bookingOpensAt: '2026-11-20T20:00',
      shootFee: '8000',
      memo: 'メモ',
    })
  })

  it('内容を変更し、モデルは付け替える', async () => {
    const { sessionId } = await createReservation(USER, reservation())

    await updateReservation(
      sessionId,
      reservation({
        modelName: '栞奈',
        shootDate: '2027-01-05',
        shootFee: '5000',
        concept: '白ホリ',
      }),
    )

    const [row] = await loadReservationSchedule()
    expect(row).toMatchObject({
      sessionId,
      modelNames: ['栞奈'],
      shootDate: '2027-01-05',
      shootFee: 5000,
      concept: '白ホリ',
    })
    expect(await db.slot_models.count()).toBe(1)
    expect(await db.sessions.count()).toBe(1)
  })

  it('モデルを指定しない区分にするとモデルの明細を消す', async () => {
    const { sessionId } = await createReservation(USER, reservation())

    await updateReservation(sessionId, reservation({ shootCategory: 'session', modelName: '' }))

    expect(await db.slot_models.count()).toBe(0)
  })

  it('可否が決まった予約は編集できない', async () => {
    const { sessionId } = await createReservation(USER, reservation())
    await updateRow('sessions', sessionId, { status: 'confirmed' })

    expect(await loadReservationInput(sessionId)).toBeNull()
    await expect(updateReservation(sessionId, reservation())).rejects.toThrow(
      '編集できる予約が見つかりませんでした',
    )
  })

  it('撮影料が不正なら何も変えない', async () => {
    const { sessionId } = await createReservation(USER, reservation())

    await expect(
      updateReservation(sessionId, reservation({ shootFee: 'abc', modelName: '別人' })),
    ).rejects.toThrow()

    expect((await db.models.toArray()).map((m) => m.name)).toEqual(['葵'])
  })
})

describe('予約失敗', () => {
  it('予約スケジュールから外れ、枠も中止にする。マスタと明細は残す', async () => {
    const { sessionId } = await createReservation(USER, reservation())

    await markReservationFailed(sessionId)

    expect(await loadReservationSchedule()).toHaveLength(0)
    expect((await db.sessions.get(sessionId))?.status).toBe('cancelled')
    expect((await db.slots.toArray())[0].shoot_status).toBe('cancelled')
    expect(await db.slot_models.count()).toBe(1)
    expect(await db.models.count()).toBe(1)
  })

  it('可否が決まった予約はエラー', async () => {
    const { sessionId } = await createReservation(USER, reservation())
    await markReservationFailed(sessionId)

    await expect(markReservationFailed(sessionId)).rejects.toThrow('予約が見つかりませんでした')
  })
})
