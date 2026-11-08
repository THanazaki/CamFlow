import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadConfirmedShoots } from '@/lib/queries/shoots'

import { cancelConfirmedShoot, confirmShoot, type ShootConfirmInput } from '../shoots'

const USER = '11111111-1111-4111-8111-111111111111'

function input(overrides: Partial<ShootConfirmInput> = {}): ShootConfirmInput {
  return {
    fromSessionId: '',
    eventName: 'テスト撮影会',
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

describe('確定した撮影の取り消し', () => {
  it('撮影予定から外し、モデルと撮影会の情報は残す', async () => {
    await confirmShoot(USER, input())
    const [shoot] = await loadConfirmedShoots(new Date('2026-12-01T00:00:00'))
    const modelsBefore = await db.models.count()
    const organizersBefore = await db.organizers.count()
    const slotModelsBefore = await db.slot_models.count()

    await cancelConfirmedShoot(shoot.slotId)

    expect(await loadConfirmedShoots(new Date('2026-12-01T00:00:00'))).toEqual([])
    const slot = await db.slots.get(shoot.slotId)
    expect(slot?.shoot_status).toBe('cancelled')
    expect(slot?.deleted_at).toBeNull()
    expect((await db.sessions.get(shoot.sessionId))?.status).toBe('cancelled')
    expect(await db.models.count()).toBe(modelsBefore)
    expect(await db.organizers.count()).toBe(organizersBefore)
    expect(await db.slot_models.count()).toBe(slotModelsBefore)
  })

  it('無い撮影はエラーにする', async () => {
    await expect(cancelConfirmedShoot('missing')).rejects.toThrow('撮影が見つかりませんでした')
  })
})
