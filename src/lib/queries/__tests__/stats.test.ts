import { beforeEach, describe, expect, it } from 'vitest'

import { createShootHistory, type ShootHistoryInput } from '@/lib/actions/archives'
import { confirmShoot, type ShootConfirmInput } from '@/lib/actions/shoots'
import { db } from '@/lib/db'
import { loadHistoryStats } from '@/lib/queries/stats'
import { createRow, softDeleteRow } from '@/lib/sync/mutations'

const USER = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-06-15T12:00:00')

function history(overrides: Partial<ShootHistoryInput> = {}): ShootHistoryInput {
  return {
    eventName: '',
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

function confirmation(overrides: Partial<ShootConfirmInput> = {}): ShootConfirmInput {
  return {
    fromSessionId: '',
    eventName: '',
    shootCategory: 'solo',
    modelName: '葵',
    concept: '',
    placeCategory: 'studio',
    venueName: '',
    meetingPoint: '',
    shootDate: '2026-03-01',
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

describe('モデル別情報', () => {
  it('運用フローと過去撮影登録を合算し、回数と最初・最新の撮影日を出す', async () => {
    await createShootHistory(USER, history({ shootDate: '2026-01-10' }))
    await confirmShoot(USER, confirmation({ shootDate: '2026-05-01' }))
    await createShootHistory(USER, history({ shootDate: '2026-03-01' }))

    expect((await loadHistoryStats(NOW)).models).toMatchObject([
      { name: '葵', shootCount: 3, firstDate: '2026-01-10', lastDate: '2026-05-01' },
    ])
  })

  it('最新撮影日の新しい順に並べる', async () => {
    await createShootHistory(USER, history({ modelName: '栞奈', shootDate: '2026-01-01' }))
    await createShootHistory(USER, history({ modelName: '葵', shootDate: '2026-02-01' }))

    expect((await loadHistoryStats(NOW)).models.map((m) => m.name)).toEqual(['葵', '栞奈'])
  })

  it('同じイベントの複数の枠は1回と数える', async () => {
    const { sessionId, slotId } = await confirmShoot(USER, confirmation())
    const [link] = await db.slot_models.toArray()
    const second = await createRow('slots', {
      user_id: USER,
      session_id: sessionId,
      slot_no: 2,
      start_at: new Date('2026-03-01T16:00:00').toISOString(),
      storage_urls: [],
    })
    await createRow('slot_models', { user_id: USER, slot_id: second, model_id: link.model_id })

    expect(slotId).not.toBe(second)
    expect((await loadHistoryStats(NOW)).models[0].shootCount).toBe(1)
  })

  it('モデルなしの撮影は数えない', async () => {
    await createShootHistory(USER, history({ shootCategory: 'session' }))

    expect((await loadHistoryStats(NOW)).models).toEqual([])
  })

  it('撮影日時になっていない確定済みの撮影は、撮影回数ではなく撮影予定回数に数える', async () => {
    await createShootHistory(USER, history({ shootDate: '2026-01-10' }))
    await confirmShoot(USER, confirmation({ shootDate: '2026-07-01' }))
    await confirmShoot(USER, confirmation({ shootDate: '2026-08-01' }))

    expect((await loadHistoryStats(NOW)).models).toEqual([
      expect.objectContaining({
        name: '葵',
        shootCount: 1,
        plannedCount: 2,
        firstDate: '2026-01-10',
        lastDate: '2026-01-10',
      }),
    ])
  })

  it('撮影予定しか無いモデルも出し、撮影日は null。実績のあるモデルより後に並べる', async () => {
    await confirmShoot(USER, confirmation({ modelName: '栞奈', shootDate: '2026-07-01' }))
    await createShootHistory(USER, history({ modelName: '葵', shootDate: '2026-01-10' }))

    expect((await loadHistoryStats(NOW)).models).toMatchObject([
      { name: '葵', shootCount: 1, plannedCount: 0 },
      { name: '栞奈', shootCount: 0, plannedCount: 1, firstDate: null, lastDate: null },
    ])
  })

  it('撮影予定も同じイベントの複数の枠は1回と数える。予約段階の撮影は数えない', async () => {
    const { sessionId } = await confirmShoot(USER, confirmation({ shootDate: '2026-07-01' }))
    const [link] = await db.slot_models.toArray()
    const second = await createRow('slots', {
      user_id: USER,
      session_id: sessionId,
      slot_no: 2,
      start_at: new Date('2026-07-01T16:00:00').toISOString(),
      storage_urls: [],
    })
    await createRow('slot_models', { user_id: USER, slot_id: second, model_id: link.model_id })
    await db.sessions.update(sessionId, { status: 'planned' })

    expect((await loadHistoryStats(NOW)).models).toEqual([])
    await db.sessions.update(sessionId, { status: 'confirmed' })
    expect((await loadHistoryStats(NOW)).models[0].plannedCount).toBe(1)
  })

  it('論理削除した撮影は数えない。マスタから削除したモデルは実績として残す', async () => {
    const { historyId } = await createShootHistory(USER, history({ modelName: '葵' }))
    await softDeleteRow('shoot_history', historyId)
    await createShootHistory(USER, history({ modelName: '栞奈' }))
    const deletedModel = (await db.models.toArray()).find((m) => m.name === '栞奈')!
    await softDeleteRow('models', deletedModel.id)

    expect((await loadHistoryStats(NOW)).models).toMatchObject([{ name: '栞奈', shootCount: 1 }])
  })
})

describe('撮影会別情報', () => {
  it('撮影モデル数は同じモデルを1人と数え、最初・最新の利用日を出す', async () => {
    await createShootHistory(USER, history({ eventName: '秋', modelName: '葵', shootDate: '2026-01-10' }))
    await createShootHistory(USER, history({ eventName: '秋', modelName: '葵', shootDate: '2026-02-10' }))
    await confirmShoot(USER, confirmation({ eventName: '秋', modelName: '栞奈', shootDate: '2026-03-10' }))

    expect((await loadHistoryStats(NOW)).organizers).toMatchObject([
      { name: '秋', modelCount: 2, firstDate: '2026-01-10', lastDate: '2026-03-10' },
    ])
  })

  it('モデルなしの撮影は撮影モデル数を増やさないが、利用日には含める', async () => {
    await createShootHistory(USER, history({ eventName: '大撮影会', shootCategory: 'large', shootDate: '2026-01-10' }))

    expect((await loadHistoryStats(NOW)).organizers).toMatchObject([
      { name: '大撮影会', modelCount: 0, firstDate: '2026-01-10', lastDate: '2026-01-10' },
    ])
  })

  it('撮影会名が未入力の撮影は数えない', async () => {
    await createShootHistory(USER, history())
    await confirmShoot(USER, confirmation({ concept: 'コンセプト' }))

    expect((await loadHistoryStats(NOW)).organizers).toEqual([])
  })

  it('撮影実績も撮影予定も無い撮影会は出さない', async () => {
    await createRow('organizers', { user_id: USER, name: '未利用', is_favorite: false })

    expect((await loadHistoryStats(NOW)).organizers).toEqual([])
  })

  it('撮影予定モデル数は、撮影日時になっていない確定済みの撮影のモデルを1人ずつ数える', async () => {
    await createShootHistory(USER, history({ eventName: '秋', modelName: '葵', shootDate: '2026-01-10' }))
    await confirmShoot(USER, confirmation({ eventName: '秋', modelName: '葵', shootDate: '2026-07-01' }))
    await confirmShoot(USER, confirmation({ eventName: '秋', modelName: '栞奈', shootDate: '2026-07-02' }))
    await confirmShoot(USER, confirmation({ eventName: '秋', modelName: '栞奈', shootDate: '2026-07-03' }))
    await confirmShoot(USER, confirmation({ eventName: '未来', modelName: '葵', shootDate: '2026-07-01' }))

    expect((await loadHistoryStats(NOW)).organizers).toMatchObject([
      { name: '秋', modelCount: 1, plannedModelCount: 2, firstDate: '2026-01-10', lastDate: '2026-01-10' },
      { name: '未来', modelCount: 0, plannedModelCount: 1, firstDate: null, lastDate: null },
    ])
  })

  it('最新利用日の新しい順に並べる', async () => {
    await createShootHistory(USER, history({ eventName: '春', shootDate: '2026-01-01' }))
    await createShootHistory(USER, history({ eventName: '秋', shootDate: '2026-02-01' }))

    expect((await loadHistoryStats(NOW)).organizers.map((o) => o.name)).toEqual(['秋', '春'])
  })
})
