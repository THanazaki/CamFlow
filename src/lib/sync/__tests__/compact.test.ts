import { describe, expect, it } from 'vitest'

import type { OutboxEntry, OutboxOp, SyncTable } from '@/lib/db/types'

import { compactOutbox } from '../compact'

let seq = 0

function entry(
  op: OutboxOp,
  id: string,
  payload: Record<string, unknown> | null = null,
  table: SyncTable = 'models',
): OutboxEntry {
  seq += 1
  return {
    seq,
    table,
    op,
    row_id: id,
    row_key: `${table}:${id}`,
    payload,
    status: 'pending',
    attempts: 0,
    last_error: null,
    created_at: new Date(seq).toISOString(),
  }
}

describe('compactOutbox', () => {
  it('同一行への連続 update を1件にまとめ、後勝ちでマージする', () => {
    const entries = [
      entry('update', 'a', { name: '栞奈', rating: 3 }),
      entry('update', 'a', { rating: 5 }),
      entry('update', 'a', { notes: 'メモ' }),
    ]

    const { ops, discarded } = compactOutbox(entries)

    expect(ops).toHaveLength(1)
    expect(ops[0].op).toBe('update')
    expect(ops[0].payload).toEqual({ name: '栞奈', rating: 5, notes: 'メモ' })
    expect(ops[0].sourceSeqs).toEqual(entries.map((e) => e.seq))
    expect(discarded).toEqual([])
  })

  it('insert 後の update は insert に吸収される（1往復で済む）', () => {
    const entries = [
      entry('insert', 'b', { id: 'b', name: '仮' }),
      entry('update', 'b', { name: 'みなも' }),
    ]

    const { ops } = compactOutbox(entries)

    expect(ops).toHaveLength(1)
    expect(ops[0].op).toBe('insert')
    expect(ops[0].payload).toEqual({ id: 'b', name: 'みなも' })
  })

  it('insert → delete は両方破棄する（サーバは存在を知らない）', () => {
    const e1 = entry('insert', 'c', { id: 'c' })
    const e2 = entry('update', 'c', { name: 'x' })
    const e3 = entry('delete', 'c')

    const { ops, discarded } = compactOutbox([e1, e2, e3])

    expect(ops).toEqual([])
    expect(discarded).toEqual([e1.seq, e2.seq, e3.seq].sort((a, b) => (a as number) - (b as number)))
  })

  it('update → delete は delete だけ送る', () => {
    const e1 = entry('update', 'd', { name: 'x' })
    const e2 = entry('delete', 'd')

    const { ops, discarded } = compactOutbox([e1, e2])

    expect(ops).toHaveLength(1)
    expect(ops[0].op).toBe('delete')
    expect(discarded).toContain(e1.seq)
  })

  it('delete 後の update は送らない', () => {
    const e1 = entry('delete', 'e')
    const e2 = entry('update', 'e', { name: 'x' })

    const { ops, discarded } = compactOutbox([e1, e2])

    expect(ops.map((o) => o.op)).toEqual(['delete'])
    expect(discarded).toContain(e2.seq)
  })

  it('delete → insert（同じ id の作り直し）は畳まず順番を保つ', () => {
    const e1 = entry('delete', 'f')
    const e2 = entry('insert', 'f', { id: 'f', name: '再作成' })

    const { ops } = compactOutbox([e1, e2])

    expect(ops.map((o) => o.op)).toEqual(['delete', 'insert'])
    expect(ops[0].seq).toBeLessThan(ops[1].seq)
  })

  it('テーブルをまたいだ相対順序（FK の親→子）を保つ', () => {
    const entries = [
      entry('insert', 's1', { id: 's1' }, 'sessions'),
      entry('insert', 'sl1', { id: 'sl1', session_id: 's1' }, 'slots'),
      entry('update', 's1', { title: '更新' }, 'sessions'),
      entry('insert', 'sm1', { id: 'sm1', slot_id: 'sl1' }, 'slot_models'),
    ]

    const { ops } = compactOutbox(entries)

    // sessions の update は insert に吸収されるので3件。親が先
    expect(ops.map((o) => o.table)).toEqual(['sessions', 'slots', 'slot_models'])
  })

  it('複数行が混ざっていても行ごとに独立して畳む', () => {
    const entries = [
      entry('update', 'x', { a: 1 }),
      entry('update', 'y', { b: 1 }),
      entry('update', 'x', { a: 2 }),
    ]

    const { ops } = compactOutbox(entries)

    expect(ops).toHaveLength(2)
    expect(ops.find((o) => o.row_id === 'x')?.payload).toEqual({ a: 2 })
    expect(ops.find((o) => o.row_id === 'y')?.payload).toEqual({ b: 1 })
  })
})
