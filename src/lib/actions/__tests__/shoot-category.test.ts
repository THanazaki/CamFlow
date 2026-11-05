import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadConfirmableReservations, loadConfirmedShoots } from '@/lib/queries/shoots'
import type { ShootCategory } from '@/lib/shoot-category'

import { createReservation, type ReservationInput } from '../reservations'
import { confirmShoot, type ShootConfirmInput } from '../shoots'

const USER = '11111111-1111-4111-8111-111111111111'

function reservation(overrides: Partial<ReservationInput> = {}): ReservationInput {
  return {
    eventName: '',
    shootCategory: 'solo',
    modelName: '栞奈',
    concept: '',
    venueName: '',
    shootDate: '2026-12-20',
    bookingOpensAt: '2026-11-20T10:00',
    bookingMethod: 'page',
    bookingContact: 'https://example.com/booking',
    ...overrides,
  }
}

function confirmation(overrides: Partial<ShootConfirmInput> = {}): ShootConfirmInput {
  return {
    fromSessionId: '',
    eventName: '',
    shootCategory: 'solo',
    modelName: '栞奈',
    modelX: '',
    modelInstagram: '',
    concept: '',
    placeCategory: 'studio',
    venueName: '',
    meetingPoint: '',
    shootDate: '2026-12-20',
    startTime: '13:00',
    endTime: '15:00',
    ...overrides,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('予約情報入力の撮影区分', () => {
  it.each<ShootCategory>(['solo', 'group'])('%s はモデルを紐づける', async (shootCategory) => {
    const { sessionId } = await createReservation(USER, reservation({ shootCategory }))

    expect((await db.sessions.get(sessionId))?.shoot_category).toBe(shootCategory)
    expect(await db.slot_models.count()).toBe(1)
  })

  it.each<[ShootCategory, string]>([
    ['session', 'セッション'],
    ['large', '大撮'],
  ])('%s はモデルなしで登録でき、タイトルは区分名になる', async (shootCategory, title) => {
    const { sessionId, createdModel } = await createReservation(
      USER,
      reservation({ shootCategory, modelName: '' }),
    )

    const session = await db.sessions.get(sessionId)
    expect(session?.shoot_category).toBe(shootCategory)
    expect(session?.title).toBe(title)
    expect(createdModel).toBe(false)
    expect(await db.slots.count()).toBe(1)
    expect(await db.slot_models.count()).toBe(0)
    expect(await db.models.count()).toBe(0)
  })

  it('欄を隠す前に入力したモデル名は保存しない', async () => {
    await createReservation(USER, reservation({ shootCategory: 'large', modelName: '栞奈' }))

    expect(await db.models.count()).toBe(0)
    expect(await db.slot_models.count()).toBe(0)
  })

  it('モデルが必要な区分で空白だけの名前はエラーにする', async () => {
    await expect(
      createReservation(USER, reservation({ shootCategory: 'group', modelName: '   ' })),
    ).rejects.toThrow('モデル名を入力してください')
    expect(await db.sessions.count()).toBe(0)
  })
})

describe('確定撮影情報入力の撮影区分', () => {
  it('モデルなしの区分を直接登録できる', async () => {
    const { sessionId } = await confirmShoot(
      USER,
      confirmation({ shootCategory: 'session', modelName: '栞奈', modelX: '@kanna' }),
    )

    const session = await db.sessions.get(sessionId)
    expect(session?.shoot_category).toBe('session')
    expect(session?.status).toBe('confirmed')
    expect(await db.models.count()).toBe(0)
    expect(await db.slot_models.count()).toBe(0)
  })

  it('予約の区分を確定フォームに引き継ぐ', async () => {
    await createReservation(USER, reservation({ shootCategory: 'large', modelName: '' }))

    const [candidate] = await loadConfirmableReservations()
    expect(candidate.shootCategory).toBe('large')
    expect(candidate.modelName).toBe('')
  })

  it('区分の導入前の予約（NULL）は個撮として引き継ぐ', async () => {
    const { sessionId } = await createReservation(USER, reservation())
    await db.sessions.update(sessionId, { shoot_category: null })

    const [candidate] = await loadConfirmableReservations()
    expect(candidate.shootCategory).toBe('solo')
  })

  it('確定時にモデルなしの区分へ変えると、予約時のモデルの紐づけを外す', async () => {
    const { sessionId } = await createReservation(USER, reservation())
    expect(await db.slot_models.count()).toBe(1)

    await confirmShoot(
      USER,
      confirmation({ fromSessionId: sessionId, shootCategory: 'large', eventName: '春の大撮' }),
    )

    const session = await db.sessions.get(sessionId)
    expect(session?.shoot_category).toBe('large')
    expect(session?.status).toBe('confirmed')
    expect(await db.slot_models.count()).toBe(0)
    // モデルマスタ自体は残す。他の撮影でも使うため
    expect(await db.models.count()).toBe(1)
  })

  it('モデルありの区分は従来どおり紐づける', async () => {
    const { sessionId } = await createReservation(USER, reservation({ shootCategory: 'group' }))

    await confirmShoot(USER, confirmation({ fromSessionId: sessionId, shootCategory: 'group' }))

    expect(await db.slot_models.count()).toBe(1)
  })
})

describe('確定撮影情報入力の場所区分', () => {
  it('屋外は集合場所を前後の空白を除いて保存する', async () => {
    const { sessionId } = await confirmShoot(
      USER,
      confirmation({ placeCategory: 'outdoor', meetingPoint: ' 原宿駅 表参道口 ' }),
    )

    const session = await db.sessions.get(sessionId)
    expect(session?.place_category).toBe('outdoor')
    expect(session?.meeting_point).toBe('原宿駅 表参道口')
  })

  it('屋外でも集合場所は空のまま登録できる', async () => {
    const { sessionId } = await confirmShoot(USER, confirmation({ placeCategory: 'outdoor' }))

    expect((await db.sessions.get(sessionId))?.meeting_point).toBeNull()
  })

  it('スタジオでは欄を隠す前に入力した集合場所を保存しない', async () => {
    const { sessionId } = await confirmShoot(
      USER,
      confirmation({ placeCategory: 'studio', meetingPoint: '原宿駅' }),
    )

    const session = await db.sessions.get(sessionId)
    expect(session?.place_category).toBe('studio')
    expect(session?.meeting_point).toBeNull()
  })

  it('予約から確定するときも保存し、確定撮影情報に出す', async () => {
    const { sessionId } = await createReservation(USER, reservation())

    await confirmShoot(
      USER,
      confirmation({
        fromSessionId: sessionId,
        placeCategory: 'outdoor',
        meetingPoint: '原宿駅',
      }),
    )

    const [shoot] = await loadConfirmedShoots()
    expect(shoot.placeCategory).toBe('outdoor')
    expect(shoot.meetingPoint).toBe('原宿駅')
  })
})
