import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/lib/db'
import { nextPathAfterSave, NEW_MODEL_MESSAGE } from '@/lib/new-model-prompt'
import { createRow } from '@/lib/sync/mutations'

import { createShootHistory, updateShootHistory, type ShootHistoryInput } from '../archives'
import { updateModel } from '../models'
import { createReservation, type ReservationInput } from '../reservations'
import {
  confirmShoot,
  findFreeModelCandidates,
  resolveModel,
  updateConfirmedShoot,
  type ShootConfirmInput,
} from '../shoots'
import { createWishlistModel } from '../wishlist'

const USER = '11111111-1111-4111-8111-111111111111'

function reservation(overrides: Partial<ReservationInput> = {}): ReservationInput {
  return {
    eventName: '',
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

const models = async () =>
  (await db.models.toArray())
    .map((m) => `${m.name}/${m.affiliation ?? null}`)
    .sort()

async function slotModelNames(slotId: string) {
  const links = await db.slot_models.where('slot_id').equals(slotId).toArray()
  return Promise.all(links.map(async (l) => (await db.models.get(l.model_id))?.name))
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('モデル名と撮影会名の組み合わせ', () => {
  it('新しい組み合わせなら、撮影会名を所属にして登録し、そのモデルを返す', async () => {
    const reserved = await createReservation(USER, reservation({ eventName: '秋の撮影会' }))
    const confirmed = await confirmShoot(USER, confirmation({ eventName: '春の撮影会' }))
    const past = await createShootHistory(USER, history({ eventName: '夏の撮影会' }))

    expect(await models()).toEqual(['葵/夏の撮影会', '葵/春の撮影会', '葵/秋の撮影会'])
    for (const { newModelId } of [reserved, confirmed, past]) {
      expect(newModelId).not.toBeNull()
      expect(await db.models.get(newModelId!)).toBeDefined()
    }
  })

  it('同じ組み合わせ（大文字小文字の違いを含む）なら登録せず、既存のモデルを使う', async () => {
    const first = await createReservation(USER, reservation({ eventName: 'Autumn', modelName: 'Aoi' }))
    const second = await confirmShoot(USER, confirmation({ eventName: 'autumn', modelName: 'aoi' }))
    const third = await createShootHistory(USER, history({ eventName: 'AUTUMN', modelName: 'AOI' }))

    expect(first.newModelId).not.toBeNull()
    expect(second.newModelId).toBeNull()
    expect(third.newModelId).toBeNull()
    expect(await db.models.count()).toBe(1)
  })

  it('撮影会名が空なら所属を「フリー」で登録し、次からはそのモデルを使う', async () => {
    const first = await createReservation(USER, reservation())
    const second = await confirmShoot(USER, confirmation())

    expect(await models()).toEqual(['葵/フリー'])
    expect(first.newModelId).not.toBeNull()
    expect(second.newModelId).toBeNull()
  })

  it('撮影会名が空なら、所属が未設定の既存の同名モデルを使う', async () => {
    await createRow('models', { user_id: USER, name: '葵', sns_links: {} })

    const { newModelId } = await createShootHistory(USER, history())

    expect(newModelId).toBeNull()
    expect(await db.models.count()).toBe(1)
  })

  it('撮影会名があれば、所属が未設定や「フリー」の同名モデルとは別のモデルにする', async () => {
    await createRow('models', { user_id: USER, name: '葵', sns_links: {} })
    await createReservation(USER, reservation())

    const { newModelId } = await createReservation(USER, reservation({ eventName: '秋の撮影会' }))

    expect(newModelId).not.toBeNull()
    expect(await models()).toEqual(['葵/null', '葵/秋の撮影会'])
  })

  it('モデルなしの区分では登録しない', async () => {
    const { newModelId } = await createReservation(
      USER,
      reservation({ shootCategory: 'session', eventName: '秋の撮影会' }),
    )

    expect(newModelId).toBeNull()
    expect(await db.models.count()).toBe(0)
  })

  it('撮影希望は名前だけで照合し、新しく作るときは「フリー」にする', async () => {
    await createReservation(USER, reservation({ eventName: '秋の撮影会' }))
    const wish = { eventName: '春', modelX: '', modelInstagram: '', costumeOptions: '', shootingMethodOptions: '' }

    await createWishlistModel(USER, { ...wish, modelName: '葵' })
    await createWishlistModel(USER, { ...wish, modelName: '栞奈' })

    expect(await models()).toEqual(['栞奈/フリー', '葵/秋の撮影会'])
  })
})

describe('予約から確定するとき', () => {
  it('撮影会名もモデル名も変えなければ、予約のモデルのまま', async () => {
    const { sessionId } = await createReservation(USER, reservation({ eventName: '秋の撮影会' }))

    const { slotId, newModelId } = await confirmShoot(
      USER,
      confirmation({ fromSessionId: sessionId, eventName: '秋の撮影会' }),
    )

    expect(newModelId).toBeNull()
    expect(await slotModelNames(slotId)).toEqual(['葵'])
    expect(await db.models.count()).toBe(1)
  })

  it('撮影会名が未入力の予約は、自動のタイトルのまま確定してもモデルを作らない', async () => {
    const { sessionId } = await createReservation(USER, reservation())
    const title = (await db.sessions.get(sessionId))!.title

    const { newModelId } = await confirmShoot(
      USER,
      confirmation({ fromSessionId: sessionId, eventName: title }),
    )

    expect(newModelId).toBeNull()
    expect(await models()).toEqual(['葵/フリー'])
  })

  it('所属を手で変えたモデルでも、撮影会名とモデル名を変えなければ同じモデルのまま', async () => {
    const { sessionId } = await createReservation(USER, reservation({ eventName: '秋の撮影会' }))
    const [model] = await db.models.toArray()
    await db.models.update(model.id, { affiliation: 'スターライト事務所' })

    const { newModelId } = await confirmShoot(
      USER,
      confirmation({ fromSessionId: sessionId, eventName: '秋の撮影会' }),
    )

    expect(newModelId).toBeNull()
    expect(await db.models.count()).toBe(1)
  })

  it('撮影会名を変えると新しいモデルに付け替え、元のモデルは外す', async () => {
    const { sessionId } = await createReservation(USER, reservation({ eventName: '秋の撮影会' }))

    const { slotId, newModelId } = await confirmShoot(
      USER,
      confirmation({ fromSessionId: sessionId, eventName: '春の撮影会' }),
    )

    expect(newModelId).not.toBeNull()
    const links = await db.slot_models.where('slot_id').equals(slotId).toArray()
    expect(links.map((l) => l.model_id)).toEqual([newModelId])
  })

  it('モデル名を変えると付け替え、元のモデルは外す', async () => {
    const { sessionId } = await createReservation(USER, reservation({ eventName: '秋の撮影会' }))

    const { slotId } = await confirmShoot(
      USER,
      confirmation({ fromSessionId: sessionId, eventName: '秋の撮影会', modelName: '栞奈' }),
    )

    expect(await slotModelNames(slotId)).toEqual(['栞奈'])
  })
})

describe('撮影の編集', () => {
  it('確定した撮影は撮影会名とモデル名を変えなければ同じモデルのまま', async () => {
    const { slotId } = await confirmShoot(USER, confirmation({ eventName: '秋の撮影会' }))
    const [model] = await db.models.toArray()
    await db.models.update(model.id, { affiliation: 'スターライト事務所' })

    await updateConfirmedShoot(USER, slotId, {
      ...confirmation({ eventName: '秋の撮影会', venueName: '変更' }),
      storageUrls: [],
    })

    expect(await db.models.count()).toBe(1)
  })

  it('過去撮影は撮影会名を変えると、新しい組み合わせのモデルに付け替える', async () => {
    const { historyId } = await createShootHistory(USER, history({ eventName: '秋の撮影会' }))

    await updateShootHistory(USER, historyId, history({ eventName: '春の撮影会' }))

    expect(await models()).toEqual(['葵/春の撮影会', '葵/秋の撮影会'])
    const links = await db.shoot_history_models.toArray()
    expect(links).toHaveLength(1)
    expect((await db.models.get(links[0].model_id))?.affiliation).toBe('春の撮影会')
  })
})

describe('モデルマスタの編集の重複チェック', () => {
  it('所属が違えば同じ名前にできる。名前と所属の両方が同じなら統合して削除する', async () => {
    await createRow('models', { user_id: USER, name: '葵', affiliation: '秋', sns_links: {} })
    const id = await createRow('models', { user_id: USER, name: '栞奈', affiliation: '春', sns_links: {} })
    const base = {
      nameKana: '', accounts: [], contactMethod: '', contactValue: '',
      mainAffiliation: 0, aliases: [], isFavorite: false, status: 'active' as const, notes: '',
    }

    await updateModel(id, { ...base, name: '葵', affiliations: ['春'] })
    expect((await db.models.get(id))?.name).toBe('葵')

    const result = await updateModel(id, { ...base, name: '葵', affiliations: ['秋'] })
    expect(result.mergedCount).toBe(1)
    expect((await db.models.toArray()).filter((m) => !m.deleted_at)).toHaveLength(1)
  })
})

describe('登録後の確認', () => {
  it('新しいモデルを作っていて「はい」ならモデルマスタの編集画面へ', () => {
    const confirm = vi.fn(() => true)

    expect(nextPathAfterSave('m1', '/', confirm)).toBe('/masters/models/edit?id=m1')
    expect(confirm).toHaveBeenCalledWith(NEW_MODEL_MESSAGE)
    expect(NEW_MODEL_MESSAGE).toBe('新規モデルが登録されました。モデルマスタを編集しますか？')
  })

  it('「いいえ」なら通常の遷移先', () => {
    expect(nextPathAfterSave('m1', '/reservations/schedule', () => false)).toBe(
      '/reservations/schedule',
    )
  })

  it('新しいモデルを作っていなければ確認しない', () => {
    const confirm = vi.fn(() => true)

    expect(nextPathAfterSave(null, '/', confirm)).toBe('/')
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('撮影会名が空（フリー）のモデルの確認', () => {
  it('同名のフリーのモデルを候補に出す。撮影会名があるときと、同名がいないときは出さない', async () => {
    const { id } = await resolveModel(USER, '葵', '')
    const found = await findFreeModelCandidates('葵', '')
    expect(found.map((m) => m.id)).toEqual([id])
    expect(await findFreeModelCandidates('葵', 'ABC撮影会')).toEqual([])
    expect(await findFreeModelCandidates('茜', '')).toEqual([])
  })

  it("freeModel に id を渡すとそのモデル、'new' なら同名の別モデルを作る", async () => {
    const first = await resolveModel(USER, '葵', '')
    const same = await resolveModel(USER, '葵', '', { freeModel: first.id })
    expect(same).toEqual({ id: first.id, created: false })

    const other = await resolveModel(USER, '葵', '', { freeModel: 'new' })
    expect(other.created).toBe(true)
    expect(other.id).not.toBe(first.id)
    expect((await findFreeModelCandidates('葵', '')).length).toBe(2)
  })

  it('今の撮影が紐づくモデルを優先する', async () => {
    const first = await resolveModel(USER, '葵', '')
    const second = await resolveModel(USER, '葵', '', { freeModel: 'new' })
    const kept = await resolveModel(USER, '葵', '', { preferIds: [second.id] })
    expect(kept.id).toBe(second.id)
    expect(first.id).not.toBe(second.id)
  })
})
