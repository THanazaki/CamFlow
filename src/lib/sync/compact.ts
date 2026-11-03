import type { OutboxEntry, OutboxOp, SyncTable } from '@/lib/db/types'

/**
 * outbox の圧縮。
 *
 * オフライン中に同じ行を何度も編集すると update が積み上がる。送信前に畳むことで
 * 往復を減らし、「作ってすぐ消した行」をサーバに一度も見せずに済ませる。
 *
 * ルール（行ごとに seq 昇順で畳む）:
 *   insert → update*   = insert 1件（payload をマージ）
 *   insert → delete    = 両方破棄（サーバは存在を知らない）
 *   update → update*   = update 1件（payload をマージ）
 *   update → delete    = delete 1件
 *   delete → insert    = 畳まず順番を保つ（同じ id の作り直し）
 *
 * 各 op は元になったエントリの seq を `sourceSeqs` に持つ。送信が成功したら
 * その seq を outbox から消せばよく、「どれが送れたのか」を推測する必要がない。
 */

export interface CompactedOp {
  table: SyncTable
  op: OutboxOp
  row_id: string
  row_key: string
  payload: Record<string, unknown> | null
  /** 送信順。畳み込んだ元エントリのうち最小の seq */
  seq: number
  /** この op に吸収された元エントリの seq。成功したらまとめて消す */
  sourceSeqs: number[]
}

export interface CompactResult {
  /** 送信すべき op。seq 昇順（テーブルをまたいだ FK の親→子の順序が保たれる） */
  ops: CompactedOp[]
  /** 送信せずに捨てて良いエントリの seq（insert → delete で消えた行など） */
  discarded: number[]
}

export function compactOutbox(entries: OutboxEntry[]): CompactResult {
  const ordered = [...entries]
    .filter((e) => e.seq !== undefined)
    .sort((a, b) => (a.seq as number) - (b.seq as number))

  const closed: CompactedOp[] = []
  const discarded: number[] = []
  /** 行ごとに「まだ畳み込み中」の op */
  const open = new Map<string, CompactedOp>()

  for (const entry of ordered) {
    const seq = entry.seq as number
    const key = entry.row_key
    const current = open.get(key)

    if (entry.op === 'insert') {
      // delete の直後の insert は作り直し。delete を確定させてから新しく開く
      if (current) {
        closed.push(current)
        open.delete(key)
      }
      open.set(key, {
        table: entry.table,
        op: 'insert',
        row_id: entry.row_id,
        row_key: key,
        payload: { ...(entry.payload ?? {}) },
        seq,
        sourceSeqs: [seq],
      })
      continue
    }

    if (entry.op === 'update') {
      if (!current) {
        open.set(key, {
          table: entry.table,
          op: 'update',
          row_id: entry.row_id,
          row_key: key,
          payload: { ...(entry.payload ?? {}) },
          seq,
          sourceSeqs: [seq],
        })
        continue
      }
      if (current.op === 'delete') {
        // 削除済みの行への update は送らない
        discarded.push(seq)
        continue
      }
      // insert / update に吸収する（op は current のまま）
      current.payload = { ...(current.payload ?? {}), ...(entry.payload ?? {}) }
      current.sourceSeqs.push(seq)
      continue
    }

    // entry.op === 'delete'
    if (current?.op === 'insert') {
      // サーバに送る前に消えた行。insert ごと破棄する
      discarded.push(...current.sourceSeqs, seq)
      open.delete(key)
      continue
    }
    if (current?.op === 'update') {
      // 直前までの update は意味を失う
      discarded.push(...current.sourceSeqs)
    }
    open.set(key, {
      table: entry.table,
      op: 'delete',
      row_id: entry.row_id,
      row_key: key,
      payload: null,
      seq,
      sourceSeqs: [seq],
    })
  }

  for (const op of open.values()) closed.push(op)

  return {
    ops: closed.sort((a, b) => a.seq - b.seq),
    discarded: discarded.sort((a, b) => a - b),
  }
}
