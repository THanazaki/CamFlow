import { beforeEach, describe, expect, it } from 'vitest'

import { createReservation, type ReservationInput } from '@/lib/actions/reservations'
import { db } from '@/lib/db'

import { loadCalendarEvents } from '../calendar'

const USER = '11111111-1111-4111-8111-111111111111'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('カレンダーの予定', () => {
  it('予約は撮影日ではなく受付開始日（ローカル時刻）に出る', async () => {
    await createReservation(USER, {
      eventName: '秋の撮影会',
      shootCategory: 'solo',
      modelName: '葵',
      concept: '',
      venueName: '',
      shootDate: '2099-12-20',
      bookingOpensAt: '2099-11-20T20:00',
      bookingMethod: 'page',
      bookingContact: '',
      shootFee: '',
      costumeOptions: '',
      shootingMethodOptions: '',
      paymentTiming: null,
      paymentDate: '',
    } as ReservationInput)

    const events = await loadCalendarEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'reservation', date: '2099-11-20', time: '20:00' })
  })
})
