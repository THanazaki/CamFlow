import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadConfirmedShoots } from '@/lib/queries/shoots'

import { createReservation } from '../reservations'
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

  it('編集で不正な撮影料を渡すとエラーにして変更しない', async () => {
    const { slotId } = await confirmShoot(USER, input({ shootFee: '15000' }))

    await expect(
      saveShootOptions(slotId, { shootFee: '-1', costumeOptions: '', shootingMethodOptions: '' }),
    ).rejects.toThrow('撮影料')
    expect((await db.slots.get(slotId))?.booking_fee).toBe(15000)
  })
})
