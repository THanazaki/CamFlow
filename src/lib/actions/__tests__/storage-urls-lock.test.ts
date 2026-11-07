import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadShootRecord } from '@/lib/queries/archives'
import { loadConfirmedShoots } from '@/lib/queries/shoots'
import { isSlotFinished, slotEndMs } from '@/lib/slot-time'

import { confirmShoot, saveStorageUrls, updateConfirmedShoot, type ShootConfirmInput } from '../shoots'

const USER = '11111111-1111-4111-8111-111111111111'
const URLS = ['https://example.com/a']

const BEFORE = new Date('2026-06-01T12:00:00')
const DURING = new Date('2026-06-01T14:00:00')
const AT_END = new Date('2026-06-01T15:00:00')

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

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('撮影の終了の判定', () => {
  const slot = {
    start_at: new Date('2026-06-01T13:00:00').toISOString(),
    planned_minutes: 120,
    extended_minutes: 0,
    shoot_status: 'planned',
  }

  it('終了時刻ちょうどから終わったものとして扱う', () => {
    expect(isSlotFinished(slot, new Date(AT_END.getTime() - 1))).toBe(false)
    expect(isSlotFinished(slot, AT_END)).toBe(true)
  })

  it('延長した分だけ終了が遅くなる', () => {
    const extended = { ...slot, extended_minutes: 30 }
    expect(slotEndMs(extended)).toBe(new Date('2026-06-01T15:30:00').getTime())
    expect(isSlotFinished(extended, AT_END)).toBe(false)
  })

  it('撮影済みの枠は終了時刻より前でも終わったものとして扱う', () => {
    expect(isSlotFinished({ ...slot, shoot_status: 'shot' }, BEFORE)).toBe(true)
  })
})

describe('確定撮影情報の保存先ストレージURL', () => {
  it.each([
    ['撮影前', BEFORE],
    ['撮影中', DURING],
  ])('%s は保存せずエラーにする', async (_name, now) => {
    const { slotId } = await confirmShoot(USER, input())

    await expect(saveStorageUrls(slotId, URLS, now)).rejects.toThrow('撮影が終わるまで')

    expect((await db.slots.get(slotId))?.storage_urls).toEqual([])
  })

  it('撮影が終わると保存できる', async () => {
    const { slotId } = await confirmShoot(USER, input())

    await saveStorageUrls(slotId, URLS, AT_END)

    expect((await db.slots.get(slotId))?.storage_urls).toEqual(URLS)
  })

  it('延長中は保存できない', async () => {
    const { slotId } = await confirmShoot(USER, input())
    await db.slots.update(slotId, { extended_minutes: 30 })

    await expect(saveStorageUrls(slotId, URLS, AT_END)).rejects.toThrow('撮影が終わるまで')
  })

  it('撮影済みの枠は終了時刻より前でも保存できる', async () => {
    const { slotId } = await confirmShoot(USER, input())
    await db.slots.update(slotId, { shoot_status: 'shot' })

    await saveStorageUrls(slotId, URLS, BEFORE)

    expect((await db.slots.get(slotId))?.storage_urls).toEqual(URLS)
  })

  it('存在しない撮影はエラー', async () => {
    await expect(saveStorageUrls('missing', URLS, AT_END)).rejects.toThrow('見つかりません')
  })

  it('一覧は撮影の前後で finished が変わる', async () => {
    await confirmShoot(USER, input())

    expect((await loadConfirmedShoots(BEFORE))[0]).toMatchObject({ past: false, finished: false })
    expect((await loadConfirmedShoots(DURING))[0]).toMatchObject({ past: true, finished: false })
    expect((await loadConfirmedShoots(AT_END))[0]).toMatchObject({ past: true, finished: true })
  })
})

describe('撮影情報の編集', () => {
  const future = { shootDate: '2999-01-01' }

  it('撮影が終わる前は URL を変更できず、他の項目も保存しない', async () => {
    const { slotId, sessionId } = await confirmShoot(USER, input(future))

    await expect(
      updateConfirmedShoot(USER, slotId, {
        ...input({ ...future, eventName: '変更後' }),
        storageUrls: URLS,
      }),
    ).rejects.toThrow('撮影が終わるまで')

    expect((await db.slots.get(slotId))?.storage_urls).toEqual([])
    expect((await db.sessions.get(sessionId))?.title).not.toBe('変更後')
  })

  it('撮影が終わる前でも、URL を変えなければ他の項目は保存できる', async () => {
    const { slotId, sessionId } = await confirmShoot(USER, input(future))

    await updateConfirmedShoot(USER, slotId, {
      ...input({ ...future, eventName: '変更後' }),
      storageUrls: [''],
    })

    expect((await db.sessions.get(sessionId))?.title).toBe('変更後')
  })

  it('詳細の finished は撮影の前後で変わる', async () => {
    const past = await confirmShoot(USER, input())
    const coming = await confirmShoot(USER, input(future))

    expect((await loadShootRecord('slot', past.slotId))?.finished).toBe(true)
    expect((await loadShootRecord('slot', coming.slotId))?.finished).toBe(false)
  })
})
