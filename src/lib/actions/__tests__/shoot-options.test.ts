import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadReservationSchedule } from '@/lib/queries/reservations'
import { loadConfirmableReservations, loadConfirmedShoots } from '@/lib/queries/shoots'

import { createReservation, type ReservationInput } from '../reservations'
import { confirmShoot, saveShootOptions, type ShootConfirmInput } from '../shoots'

const USER = '11111111-1111-4111-8111-111111111111'

function input(overrides: Partial<ShootConfirmInput> = {}): ShootConfirmInput {
  return {
    fromSessionId: '',
    eventName: '',
    shootCategory: 'solo',
    modelName: '栞奈',
    concept: '',
    placeCategory: 'studio',
    venueName: '',
    meetingPoint: '',
    shootDate: '2026-12-20',
    startTime: '13:00',
    endTime: '15:00',
    meetingTime: '',
    paymentTiming: null,
    paymentDate: '',
    shootFee: '',
    costumeOptions: '',
    shootingMethodOptions: '',
    ...overrides,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('予約情報入力の撮影料とオプション', () => {
  function reservation(overrides: Partial<ReservationInput> = {}): ReservationInput {
    return {
      eventName: '',
      shootCategory: 'solo',
      modelName: '栞奈',
      concept: '',
      venueName: '',
      shootDate: '2026-12-20',
      bookingOpensAt: '2026-11-20T20:00',
      bookingMethod: 'page',
      bookingContact: 'https://example.com/booking',
      shootFee: '',
      costumeOptions: '',
      shootingMethodOptions: '',
      paymentTiming: null,
      paymentDate: '',
      ...overrides,
    }
  }

  const filled = {
    shootFee: '15000',
    costumeOptions: '浴衣',
    shootingMethodOptions: '動画撮影',
    paymentTiming: 'in_advance',
    paymentDate: '2026-12-01',
  } as const

  it('入力した内容を枠に保存し、スケジュールに出す', async () => {
    await createReservation(USER, reservation(filled))

    const [slot] = await db.slots.toArray()
    expect(slot).toMatchObject({
      booking_fee: 15000,
      costume_options: '浴衣',
      shooting_method_options: '動画撮影',
      fee_payment_timing: 'in_advance',
      fee_payment_date: '2026-12-01',
    })
    const [row] = await loadReservationSchedule()
    expect(row).toMatchObject({
      shootFee: 15000,
      costumeOptions: '浴衣',
      shootingMethodOptions: '動画撮影',
      paymentTiming: 'in_advance',
      paymentDate: '2026-12-01',
    })
  })

  it('未入力でも登録でき、NOT NULL の撮影料は0で埋める', async () => {
    await createReservation(USER, reservation())

    const [slot] = await db.slots.toArray()
    expect(slot).toMatchObject({
      booking_fee: 0,
      costume_options: null,
      shooting_method_options: null,
      fee_payment_timing: null,
      fee_payment_date: null,
    })
    const [row] = await loadReservationSchedule()
    expect(row).toMatchObject({ shootFee: 0, costumeOptions: null, paymentTiming: null })
  })

  it('事前以外なら入力済みの支払日を保存しない', async () => {
    await createReservation(
      USER,
      reservation({ paymentTiming: 'on_the_day', paymentDate: '2026-12-01' }),
    )

    const [slot] = await db.slots.toArray()
    expect(slot.fee_payment_date).toBeNull()
  })

  it('不正な撮影料はエラーにして何も作らない', async () => {
    await expect(createReservation(USER, reservation({ shootFee: '-1' }))).rejects.toThrow('撮影料')

    expect(await db.sessions.count()).toBe(0)
    expect(await db.models.count()).toBe(0)
  })

  it('確定フォームの候補に入力内容を引き継ぐ', async () => {
    const { sessionId } = await createReservation(USER, reservation(filled))

    const [candidate] = await loadConfirmableReservations()
    expect(candidate).toMatchObject({ sessionId, ...filled })
  })

  it('撮影料が未入力の予約は、候補でも空欄にする', async () => {
    await createReservation(USER, reservation())

    const [candidate] = await loadConfirmableReservations()
    expect(candidate).toMatchObject({
      shootFee: '',
      costumeOptions: '',
      shootingMethodOptions: '',
      paymentTiming: null,
      paymentDate: '',
    })
  })

  it('引き継いだ内容で確定しても予約時の入力が残る', async () => {
    const { sessionId } = await createReservation(USER, reservation(filled))

    const { slotId } = await confirmShoot(USER, input({ fromSessionId: sessionId, ...filled }))

    expect(await db.slots.get(slotId)).toMatchObject({
      booking_fee: 15000,
      costume_options: '浴衣',
      shooting_method_options: '動画撮影',
      fee_payment_timing: 'in_advance',
      fee_payment_date: '2026-12-01',
    })
    expect(await db.slots.count()).toBe(1)
  })
})

describe('撮影料とオプション', () => {
  it('確定時に入力した内容を枠に保存し、一覧に出す', async () => {
    const { slotId } = await confirmShoot(
      USER,
      input({
        shootFee: ' 15000 ',
        costumeOptions: ' 浴衣 ',
        shootingMethodOptions: ' 動画撮影 ',
      }),
    )

    expect(await db.slots.get(slotId)).toMatchObject({
      booking_fee: 15000,
      costume_options: '浴衣',
      shooting_method_options: '動画撮影',
    })
    const [shoot] = await loadConfirmedShoots()
    expect(shoot).toMatchObject({
      shootFee: 15000,
      costumeOptions: '浴衣',
      shootingMethodOptions: '動画撮影',
    })
  })

  it('未入力なら撮影料は0、オプションは null にする', async () => {
    const { slotId } = await confirmShoot(USER, input({ costumeOptions: '   ' }))

    expect(await db.slots.get(slotId)).toMatchObject({
      booking_fee: 0,
      costume_options: null,
      shooting_method_options: null,
    })
  })

  it('モデルなしの撮影区分でも保存できる', async () => {
    const { slotId } = await confirmShoot(
      USER,
      input({ shootCategory: 'session', shootFee: '8000' }),
    )

    expect((await db.slots.get(slotId))?.booking_fee).toBe(8000)
  })

  it('予約から確定するときは予約の枠に保存する', async () => {
    const { sessionId } = await createReservation(USER, {
      eventName: '',
      shootCategory: 'solo',
      modelName: '栞奈',
      concept: '',
      venueName: '',
      shootDate: '2026-12-20',
      bookingOpensAt: '2026-11-20T20:00',
      bookingMethod: 'page',
      bookingContact: 'https://example.com/booking',
      shootFee: '',
      costumeOptions: '',
      shootingMethodOptions: '',
      paymentTiming: null,
      paymentDate: '',
    })

    const { slotId } = await confirmShoot(
      USER,
      input({ fromSessionId: sessionId, shootFee: '15000' }),
    )

    expect(await db.slots.count()).toBe(1)
    expect((await db.slots.get(slotId))?.booking_fee).toBe(15000)
  })

  it.each(['-1', '1.5', '1e3', '10000000000'])('撮影料 %s はエラーにして何も作らない', async (fee) => {
    await expect(confirmShoot(USER, input({ shootFee: fee }))).rejects.toThrow('撮影料')

    expect(await db.sessions.count()).toBe(0)
    expect(await db.models.count()).toBe(0)
  })

  it('確定後に編集でき、空にすると未入力に戻る', async () => {
    const { slotId } = await confirmShoot(USER, input({ shootFee: '15000', costumeOptions: '浴衣' }))

    await saveShootOptions(slotId, {
      shootFee: '20000',
      costumeOptions: '',
      shootingMethodOptions: '動画撮影',
    })
    expect(await db.slots.get(slotId)).toMatchObject({
      booking_fee: 20000,
      costume_options: null,
      shooting_method_options: '動画撮影',
    })

    await saveShootOptions(slotId, { shootFee: '', costumeOptions: '', shootingMethodOptions: '' })
    expect((await db.slots.get(slotId))?.booking_fee).toBe(0)
  })

  it('支払方法が事前なら支払日も保存する', async () => {
    const { slotId } = await confirmShoot(
      USER,
      input({ paymentTiming: 'in_advance', paymentDate: '2026-12-01' }),
    )

    expect(await db.slots.get(slotId)).toMatchObject({
      fee_payment_timing: 'in_advance',
      fee_payment_date: '2026-12-01',
    })
    const [shoot] = await loadConfirmedShoots()
    expect(shoot).toMatchObject({ paymentTiming: 'in_advance', paymentDate: '2026-12-01' })
  })

  it.each(['on_the_day', 'paid'] as const)(
    '支払方法が %s なら入力済みの支払日を保存しない',
    async (paymentTiming) => {
      const { slotId } = await confirmShoot(USER, input({ paymentTiming, paymentDate: '2026-12-01' }))

      expect(await db.slots.get(slotId)).toMatchObject({
        fee_payment_timing: paymentTiming,
        fee_payment_date: null,
      })
    },
  )

  it('支払方法は未選択でも、事前で支払日が空でも登録できる', async () => {
    const first = await confirmShoot(USER, input())
    const second = await confirmShoot(USER, input({ paymentTiming: 'in_advance' }))

    expect(await db.slots.get(first.slotId)).toMatchObject({
      fee_payment_timing: null,
      fee_payment_date: null,
    })
    expect(await db.slots.get(second.slotId)).toMatchObject({
      fee_payment_timing: 'in_advance',
      fee_payment_date: null,
    })
  })

  it('集合時刻を撮影日と合わせて保存し、一覧に時刻で出す', async () => {
    const { slotId } = await confirmShoot(USER, input({ meetingTime: '12:30' }))

    expect((await db.slots.get(slotId))?.meeting_at).toBe(
      new Date('2026-12-20T12:30:00').toISOString(),
    )
    const [shoot] = await loadConfirmedShoots()
    expect(shoot.meetingTime).toBe('12:30')
  })

  it('集合時刻は未入力なら null', async () => {
    const { slotId } = await confirmShoot(USER, input())

    expect((await db.slots.get(slotId))?.meeting_at).toBeNull()
    const [shoot] = await loadConfirmedShoots()
    expect(shoot.meetingTime).toBeNull()
  })

  it('撮影料を編集しても支払方法と集合時刻は変わらない', async () => {
    const { slotId } = await confirmShoot(
      USER,
      input({ meetingTime: '12:30', paymentTiming: 'in_advance', paymentDate: '2026-12-01' }),
    )

    await saveShootOptions(slotId, { shootFee: '20000', costumeOptions: '', shootingMethodOptions: '' })

    expect(await db.slots.get(slotId)).toMatchObject({
      booking_fee: 20000,
      fee_payment_timing: 'in_advance',
      fee_payment_date: '2026-12-01',
      meeting_at: new Date('2026-12-20T12:30:00').toISOString(),
    })
  })

  it('編集で不正な撮影料を渡すとエラーにして変更しない', async () => {
    const { slotId } = await confirmShoot(USER, input({ shootFee: '15000' }))

    await expect(
      saveShootOptions(slotId, { shootFee: '-1', costumeOptions: '', shootingMethodOptions: '' }),
    ).rejects.toThrow('撮影料')
    expect((await db.slots.get(slotId))?.booking_fee).toBe(15000)
  })
})
