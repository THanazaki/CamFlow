import { beforeEach, describe, expect, it } from 'vitest'

import { createReservation } from '@/lib/actions/reservations'
import { confirmShoot, type ShootConfirmInput } from '@/lib/actions/shoots'
import { db } from '@/lib/db'
import { loadDashboard } from '@/lib/queries/dashboard'
import { softDeleteRow } from '@/lib/sync/mutations'

const USER = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-06-10T09:00:00')

function input(overrides: Partial<ShootConfirmInput> = {}): ShootConfirmInput {
  return {
    fromSessionId: '',
    eventName: '秋の撮影会',
    shootCategory: 'solo',
    modelName: '葵',
    concept: '',
    placeCategory: 'studio',
    venueName: '',
    meetingPoint: '',
    shootDate: '2026-06-20',
    meetingTime: '',
    startTime: '13:00',
    endTime: '15:00',
    paymentTiming: 'on_the_day',
    paymentDate: '',
    shootFee: '15000',
    costumeOptions: '',
    shootingMethodOptions: '',
    ...overrides,
  }
}

const fees = async (now = NOW) => (await loadDashboard(now)).fees

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('料金リマインド', () => {
  it('当日払いは、撮影日の撮影開始時刻を期日にして撮影料を出す', async () => {
    const { slotId } = await confirmShoot(USER, input())

    expect((await fees()).items).toEqual([
      {
        slotId,
        title: '秋の撮影会',
        modelNames: ['葵'],
        timing: 'on_the_day',
        dueDate: '2026-06-20',
        dueAt: new Date('2026-06-20T13:00:00').toISOString(),
        amount: 15000,
        daysUntil: 10,
      },
    ])
  })

  it('事前払いは、指定した支払日を期日にして撮影料を出す', async () => {
    await confirmShoot(USER, input({ paymentTiming: 'in_advance', paymentDate: '2026-06-12' }))

    expect((await fees()).items).toMatchObject([
      { timing: 'in_advance', dueDate: '2026-06-12', dueAt: null, amount: 15000, daysUntil: 2 },
    ])
  })

  it('支払済み・未選択は出さない', async () => {
    await confirmShoot(USER, input({ paymentTiming: 'paid' }))
    await confirmShoot(USER, input({ paymentTiming: null }))

    expect((await fees()).totalCount).toBe(0)
  })

  it('予約の段階のものは出さない（確定した撮影から数える）', async () => {
    await createReservation(USER, {
      eventName: '',
      shootCategory: 'solo',
      modelName: '葵',
      concept: '',
      venueName: '',
      shootDate: '2026-06-20',
      bookingOpensAt: '2026-06-01T20:00',
      bookingMethod: 'page',
      bookingContact: 'https://example.com',
      shootFee: '15000',
      costumeOptions: '',
      shootingMethodOptions: '',
      paymentTiming: 'on_the_day',
      paymentDate: '',
    })

    expect((await fees()).totalCount).toBe(0)
  })

  it('撮影が終わったら出さない。撮影中は出す', async () => {
    await confirmShoot(USER, input())

    expect((await fees(new Date('2026-06-20T14:00:00'))).totalCount).toBe(1)
    expect((await fees(new Date('2026-06-20T15:00:00'))).totalCount).toBe(0)
  })

  it('事前払いの支払日を過ぎても撮影前なら、超過として出す', async () => {
    await confirmShoot(USER, input({ paymentTiming: 'in_advance', paymentDate: '2026-06-08' }))

    const result = await fees()
    expect(result.items[0].daysUntil).toBe(-2)
    expect(result.overdueCount).toBe(1)
  })

  it('事前払いで支払日が未入力なら、期日なしの超過として先頭に出す', async () => {
    await confirmShoot(USER, input({ eventName: '当日', shootDate: '2026-06-11' }))
    await confirmShoot(USER, input({ eventName: '未定', paymentTiming: 'in_advance' }))

    const result = await fees()
    expect(result.items.map((f) => f.title)).toEqual(['未定', '当日'])
    expect(result.items[0]).toMatchObject({ dueDate: null, daysUntil: null })
    expect(result.overdueCount).toBe(1)
  })

  it('期日の近い順に並べ、合計額を出す', async () => {
    await confirmShoot(USER, input({ eventName: 'A', shootDate: '2026-06-25', shootFee: '10000' }))
    await confirmShoot(
      USER,
      input({ eventName: 'B', paymentTiming: 'in_advance', paymentDate: '2026-06-15', shootFee: '5000' }),
    )
    await confirmShoot(USER, input({ eventName: 'C', shootDate: '2026-06-15', startTime: '09:00', endTime: '10:00' }))

    const result = await fees()
    expect(result.items.map((f) => f.title)).toEqual(['B', 'C', 'A'])
    expect(result.totalAmount).toBe(30000)
  })

  it('撮影料が未入力でも出す（金額は0）', async () => {
    await confirmShoot(USER, input({ shootFee: '' }))

    expect((await fees()).items[0].amount).toBe(0)
  })

  it('中止の枠と論理削除した撮影は出さない', async () => {
    const cancelled = await confirmShoot(USER, input())
    await db.slots.update(cancelled.slotId, { shoot_status: 'cancelled' })
    const deleted = await confirmShoot(USER, input())
    await softDeleteRow('sessions', deleted.sessionId)

    expect((await fees()).totalCount).toBe(0)
  })

  it('モデル料（slot_models）の未払いは数えない', async () => {
    await confirmShoot(USER, input({ paymentTiming: 'paid' }))
    const [link] = await db.slot_models.toArray()
    await db.slot_models.update(link.id, { fee: 12000, payment_status: 'unpaid' })

    expect((await fees()).totalCount).toBe(0)
  })
})
