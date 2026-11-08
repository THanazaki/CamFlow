import { beforeEach, describe, expect, it } from 'vitest'

import { db, getMeta, setMeta } from '@/lib/db'
import { metaKeys } from '@/lib/db/types'

import { createRow, deleteRow, softDeleteRow, updateRow } from '../mutations'
import { pullAll, pullInternals } from '../pull'
import { discardFailed, outboxCounts, pushOutbox, retryFailed } from '../push'
import { FakeTransport, networkError, uniqueViolation } from './fake-transport'

const USER = '11111111-1111-4111-8111-111111111111'

function modelValues(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER,
    name: '栞奈',
    sns_links: {},
    tags: [],
    is_favorite: false,
    status: 'active' as const,
    ...overrides,
  }
}

let transport: FakeTransport

beforeEach(async () => {
  await db.delete()
  await db.open()
  transport = new FakeTransport()
})

describe('書き込みの原子性', () => {
  it('ローカル行と outbox エントリが同時に作られる', async () => {
    const id = await createRow('models', modelValues())

    const row = await db.models.get(id)
    const outbox = await db._outbox.toArray()

    expect(row?.name).toBe('栞奈')
    expect(row?._dirty).toBe(1)
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ table: 'models', op: 'insert', row_id: id, status: 'pending' })
  })

  it('途中で失敗したらローカル行も outbox も残らない', async () => {
    // 存在しない行への update はトランザクション内で例外になる
    await expect(updateRow('models', 'missing-id', { name: 'x' })).rejects.toThrow()

    expect(await db.models.count()).toBe(0)
    expect(await db._outbox.count()).toBe(0)
  })

  it('論理削除のあるテーブルは deleted_at を null で作る', async () => {
    // null を入れないと undefined のままになり、pull で入るサーバ行（null）と
    // 形が食い違う。`deleted_at === null` で絞る一覧から新規行が丸ごと消える
    const id = await createRow('models', modelValues())
    const row = await db.models.get(id)

    expect(row).toHaveProperty('deleted_at')
    expect(row?.deleted_at).toBeNull()
  })

  it('論理削除を持たないテーブルには deleted_at を足さない', async () => {
    const slotId = await createRow('slots', {
      user_id: USER,
      session_id: 's1',
      slot_no: 1,
      start_at: new Date().toISOString(),
    })
    const row = await db.slot_models.get(
      await createRow('slot_models', { user_id: USER, slot_id: slotId, model_id: 'm1' }),
    )

    expect(row).not.toHaveProperty('deleted_at')
  })

  it('ローカル作成した行とサーバ由来の行で deleted_at の形がそろう', async () => {
    const localId = await createRow('models', modelValues({ name: 'ローカル作成' }))
    transport.seed('models', { id: 'server-1', user_id: USER, name: 'サーバ由来', deleted_at: null })
    await pullAll(transport)

    const local = await db.models.get(localId)
    const server = await db.models.get('server-1')
    expect(local?.deleted_at).toBe(server?.deleted_at)

    // 「未削除」で絞る一覧に両方出る
    const visible = (await db.models.toArray()).filter((m) => m.deleted_at === null)
    expect(visible.map((m) => m.name).sort()).toEqual(['サーバ由来', 'ローカル作成'])
  })

  it('update は差分だけを outbox に積む（行全体を送らない）', async () => {
    const id = await createRow('models', modelValues())
    await db._outbox.clear()

    await updateRow('models', id, { rating: 5 })

    const [entry] = await db._outbox.toArray()
    expect(Object.keys(entry.payload ?? {}).sort()).toEqual(['rating', 'updated_at'])
  })
})

describe('push', () => {
  it('ローカルの作成がサーバに反映され、_dirty が下りる', async () => {
    const id = await createRow('models', modelValues())

    const result = await pushOutbox(transport)

    expect(result).toMatchObject({ pushed: 1, failed: 0, interrupted: false })
    expect(transport.rows.get('models')?.get(id)?.name).toBe('栞奈')
    expect((await db.models.get(id))?._dirty).toBe(0)
    expect(await db._outbox.count()).toBe(0)
  })

  it('オフライン中の連続編集が1往復にまとまる', async () => {
    const id = await createRow('models', modelValues())
    await updateRow('models', id, { rating: 3 })
    await updateRow('models', id, { rating: 5 })
    await updateRow('models', id, { notes: 'メモ' })

    const result = await pushOutbox(transport)

    expect(result.pushed).toBe(1)
    expect(transport.calls).toHaveLength(1)
    expect(transport.rows.get('models')?.get(id)).toMatchObject({ rating: 5, notes: 'メモ' })
  })

  it('作ってすぐ消した行はサーバに一度も送られない', async () => {
    const id = await createRow('models', modelValues())
    await deleteRow('models', id)

    const result = await pushOutbox(transport)

    expect(result.pushed).toBe(0)
    expect(result.discarded).toBe(2)
    expect(transport.calls).toHaveLength(0)
    expect(await db._outbox.count()).toBe(0)
  })

  it('ネットワークエラーでは中断し、キューを保持したまま _dirty を維持する', async () => {
    const id = await createRow('models', modelValues())
    transport.failNext = { times: 99, error: networkError }

    const result = await pushOutbox(transport)

    expect(result).toMatchObject({ pushed: 0, failed: 0, interrupted: true })
    expect(await db._outbox.count()).toBe(1)
    expect((await db._outbox.toArray())[0].attempts).toBe(1)
    expect((await db.models.get(id))?._dirty).toBe(1)
  })

  it('中断後に再実行すると送信できる（再試行で重複しない）', async () => {
    const id = await createRow('models', modelValues())
    transport.failNext = { times: 1, error: networkError }

    await pushOutbox(transport)
    const result = await pushOutbox(transport)

    expect(result.pushed).toBe(1)
    expect(transport.rows.get('models')?.size).toBe(1)
    expect((await db.models.get(id))?._dirty).toBe(0)
  })

  it('恒久的エラーは failed として outbox に残す（黙って捨てない）', async () => {
    await createRow('models', modelValues())
    transport.failNext = { times: 1, error: uniqueViolation }

    const result = await pushOutbox(transport)

    expect(result).toMatchObject({ pushed: 0, failed: 1, interrupted: false })
    const [entry] = await db._outbox.toArray()
    expect(entry.status).toBe('failed')
    expect(entry.last_error).toContain('duplicate key')
    expect(await outboxCounts()).toEqual({ pending: 0, failed: 1 })
  })

  it('failed は再送できる / 破棄もできる', async () => {
    const id = await createRow('models', modelValues())
    transport.failNext = { times: 1, error: uniqueViolation }
    await pushOutbox(transport)

    await retryFailed()
    expect(await outboxCounts()).toEqual({ pending: 1, failed: 0 })
    await pushOutbox(transport)
    expect(transport.rows.get('models')?.has(id)).toBe(true)

    // 破棄のほう
    await createRow('models', modelValues({ name: 'みなも' }))
    transport.failNext = { times: 1, error: uniqueViolation }
    await pushOutbox(transport)
    expect(await discardFailed()).toBe(1)
    expect(await db._outbox.count()).toBe(0)
  })

  it('恒久的エラーの行を飛ばしても後続は送る', async () => {
    await createRow('models', modelValues({ name: 'A' }))
    await createRow('models', modelValues({ name: 'B' }))
    transport.failNext = { times: 1, error: uniqueViolation }

    const result = await pushOutbox(transport)

    expect(result).toMatchObject({ pushed: 1, failed: 1 })
  })
})

describe('pull', () => {
  it('サーバの行をローカルに取り込み、ウォーターマークを進める', async () => {
    transport.seed('models', { id: 'm1', user_id: USER, name: 'みなも' })

    const result = await pullAll(transport)

    expect(result.upserted.models).toBe(1)
    expect((await db.models.get('m1'))?.name).toBe('みなも')
    expect((await db.models.get('m1'))?._dirty).toBe(0)
    expect(await getMeta<string>(metaKeys.lastPulledAt('models'))).toBeDefined()
  })

  it('2回目の pull は差分だけを取る', async () => {
    transport.seed('models', { id: 'm1', user_id: USER, name: 'A' })
    await pullAll(transport)

    transport.seed('models', { id: 'm2', user_id: USER, name: 'B' })
    const result = await pullAll(transport)

    // オーバーラップ(2秒)の分だけ既存行も取り直すが、新規は m2
    expect(await db.models.count()).toBe(2)
    expect(result.upserted.models).toBeGreaterThanOrEqual(1)
  })

  it('未送信のローカル変更（_dirty）は pull で上書きされない', async () => {
    transport.seed('models', { id: 'm1', user_id: USER, name: 'サーバ版' })
    await pullAll(transport)

    await updateRow('models', 'm1', { name: 'ローカル編集' })
    // サーバ側でも別の変更が入った状況を作る
    transport.seed('models', { id: 'm1', user_id: USER, name: 'サーバ側の別更新' })

    const result = await pullAll(transport)

    expect((await db.models.get('m1'))?.name).toBe('ローカル編集')
    expect(result.skippedDirty).toBeGreaterThan(0)
  })

  it('push が通ったあとはサーバの正規版が入る（LWW: サーバが権威）', async () => {
    transport.seed('models', { id: 'm1', user_id: USER, name: 'サーバ版' })
    await pullAll(transport)

    await updateRow('models', 'm1', { name: 'ローカル編集' })
    await pushOutbox(transport)
    await pullAll(transport)

    const local = await db.models.get('m1')
    const server = transport.rows.get('models')?.get('m1')
    expect(local?.name).toBe('ローカル編集')
    expect(local?._dirty).toBe(0)
    // updated_at はサーバ側のトリガが付け直したものが入っている
    expect(local?.updated_at).toBe(server?.updated_at)
  })

  it('論理削除された行はローカルから消える', async () => {
    transport.seed('models', { id: 'm1', user_id: USER, name: 'A' })
    await pullAll(transport)
    expect(await db.models.count()).toBe(1)

    transport.seed('models', { id: 'm1', user_id: USER, name: 'A', deleted_at: '2026-11-02T00:00:00Z' })
    const result = await pullAll(transport)

    expect(await db.models.count()).toBe(0)
    expect(result.removed).toBeGreaterThan(0)
  })

  it('物理削除は tombstone 経由でローカルに伝わる', async () => {
    transport.seed('slot_models', { id: 'sm1', user_id: USER, slot_id: 's1', model_id: 'm1' })
    await pullAll(transport)
    expect(await db.slot_models.count()).toBe(1)

    await transport.deleteRow('slot_models', 'sm1')
    const result = await pullAll(transport)

    expect(await db.slot_models.count()).toBe(0)
    expect(result.removed).toBe(1)
    expect(await getMeta<number>(metaKeys.lastTombstoneId)).toBe(1)
  })

  it('tombstone は一度取り込んだら読み直さない', async () => {
    transport.seed('models', { id: 'm1', user_id: USER, name: 'A' })
    await pullAll(transport)
    await transport.deleteRow('models', 'm1')
    await pullAll(transport)

    const result = await pullAll(transport)
    expect(result.removed).toBe(0)
  })

  it('ページ境界をまたいでも取りこぼさない（キーセットページング）', async () => {
    const { PAGE_SIZE } = pullInternals
    for (let i = 0; i < PAGE_SIZE + 25; i += 1) {
      transport.seed('models', { id: `m${String(i).padStart(4, '0')}`, user_id: USER, name: `M${i}` })
    }

    await pullAll(transport)

    expect(await db.models.count()).toBe(PAGE_SIZE + 25)
  })

  it('updated_at が同値の行が並んでも無限ループしない', async () => {
    // 同一トランザクションで入った行＝ updated_at が完全に同じケース
    const sameTime = '2026-11-01T12:00:00.000Z'
    for (let i = 0; i < 5; i += 1) {
      transport.rows.set(
        'models',
        (transport.rows.get('models') ?? new Map()).set(`same${i}`, {
          id: `same${i}`,
          user_id: USER,
          name: `S${i}`,
          updated_at: sameTime,
        }),
      )
    }

    await pullAll(transport)

    expect(await db.models.count()).toBe(5)
  })

  it('updated_at の同値がページ境界を跨いでも取りこぼさない', async () => {
    // 1トランザクションで500件超を入れた場合＝ updated_at が全く同じ行がページを跨ぐ。
    // 単純な「cursor = 最後の updated_at」方式だとここで無限ループか取りこぼしになる
    const { PAGE_SIZE } = pullInternals
    const sameTime = '2026-11-01T12:00:00.000Z'
    const store = new Map()
    const total = PAGE_SIZE + 37
    for (let i = 0; i < total; i += 1) {
      const id = `tie${String(i).padStart(5, '0')}`
      store.set(id, { id, user_id: USER, name: `T${i}`, updated_at: sameTime })
    }
    transport.rows.set('models', store)

    await pullAll(transport)

    expect(await db.models.count()).toBe(total)
  })

  it('最終同期が保持期間より古いとフル再同期に落ちる', async () => {
    transport.seed('models', { id: 'm1', user_id: USER, name: 'A' })
    await pullAll(transport)

    // ローカルに「サーバにはもう無い」ゴミを置き、ウォーターマークを保持期間より前に戻す
    await db.models.put({ id: 'stale', user_id: USER, name: 'ゴミ', _dirty: 0 } as never)
    const old = new Date(Date.now() - pullInternals.TOMBSTONE_RETENTION_MS - 60_000).toISOString()
    await setMeta(metaKeys.lastPulledAt('models'), old)
    await setMeta(metaKeys.lastPullRunAt('models'), old)

    const result = await pullAll(transport)

    expect(result.fullResynced).toContain('models')
    expect(await db.models.get('stale')).toBeUndefined()
    expect(await db.models.get('m1')).toBeDefined()
  })
})

describe('サーバに行が無いテーブル', () => {
  it('2回目以降の pull でもローカルの行を消さない', async () => {
    await pullAll(transport)
    // ウォーターマークは 1970 年のまま。ここで「保持期間切れ」と誤判定するとローカルが消える
    expect(await getMeta<string>(metaKeys.lastPulledAt('models'))).toBe('1970-01-01T00:00:00.000Z')

    await db.models.put({ id: 'local', user_id: USER, name: '手元だけ', _dirty: 0 } as never)
    const result = await pullAll(transport)

    expect(result.fullResynced).toEqual([])
    expect(await db.models.get('local')).toBeDefined()
  })

  it('フル再同期でも未送信の行は消さない', async () => {
    await pullAll(transport)
    await db.models.put({ id: 'dirty', user_id: USER, name: '未送信', _dirty: 1 } as never)
    const old = new Date(Date.now() - pullInternals.TOMBSTONE_RETENTION_MS - 60_000).toISOString()
    await setMeta(metaKeys.lastPullRunAt('models'), old)

    const result = await pullAll(transport)

    expect(result.fullResynced).toContain('models')
    expect(await db.models.get('dirty')).toBeDefined()
  })
})

describe('論理削除のヘルパ', () => {
  it('softDeleteRow は deleted_at を立てて outbox に積む', async () => {
    transport.seed('models', { id: 'm1', user_id: USER, name: 'A' })
    await pullAll(transport)

    await softDeleteRow('models', 'm1')
    await pushOutbox(transport)

    expect(transport.rows.get('models')?.get('m1')?.deleted_at).toBeTruthy()
  })
})
