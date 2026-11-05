import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadConfirmedShoots } from '@/lib/queries/shoots'

import { confirmShoot, saveStorageUrls } from '../shoots'

const USER = '11111111-1111-4111-8111-111111111111'
const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/${i}`)

async function createShoot(): Promise<string> {
  const { slotId } = await confirmShoot(USER, {
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
  })
  return slotId
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('確定撮影情報の保存先ストレージURL', () => {
  it('10個まで保存でき、一覧にも全部出る', async () => {
    const slotId = await createShoot()

    await saveStorageUrls(slotId, urls(10))

    const [shoot] = await loadConfirmedShoots()
    expect(shoot.storageUrls).toEqual(urls(10))
    expect(shoot.registered).toBe(true)
  })

  it('11個目はエラーにして保存しない', async () => {
    const slotId = await createShoot()

    await expect(saveStorageUrls(slotId, urls(11))).rejects.toThrow('10個まで')
    expect((await db.slots.get(slotId))?.storage_urls).toEqual([])
  })

  it('空欄と前後の空白を除いて保存する', async () => {
    const slotId = await createShoot()

    await saveStorageUrls(slotId, [' https://example.com/a ', '', '  '])

    expect((await db.slots.get(slotId))?.storage_urls).toEqual(['https://example.com/a'])
  })

  it('全部消すと未登録に戻る', async () => {
    const slotId = await createShoot()
    await saveStorageUrls(slotId, urls(2))

    await saveStorageUrls(slotId, [''])

    const [shoot] = await loadConfirmedShoots()
    expect(shoot.storageUrls).toEqual([])
    expect(shoot.registered).toBe(false)
  })
})
