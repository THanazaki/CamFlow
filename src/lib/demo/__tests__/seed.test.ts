import { beforeEach, describe, expect, it } from 'vitest'

import { DEMO_ACCOUNT_USER_ID } from '@/lib/auth/test-account'
import { db } from '@/lib/db'
import { SYNC_TABLES } from '@/lib/db/types'
import { seedDemoDataIfNeeded } from '@/lib/demo/seed'
import { loadShootArchive, loadUpcomingShoots } from '@/lib/queries/archives'
import { loadHistoryStats } from '@/lib/queries/stats'

const NOW = new Date('2026-11-07T12:00:00')

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('デモアカウントのサンプルデータ', () => {
  it('全テーブルにデータを入れ、送信キューは空・未送信の行は無い', async () => {
    expect(await seedDemoDataIfNeeded(DEMO_ACCOUNT_USER_ID, NOW)).toBe(true)

    for (const table of SYNC_TABLES) {
      expect(await db.syncTable(table).count(), table).toBeGreaterThan(0)
      expect(await db.syncTable(table).where('_dirty').equals(1).count(), table).toBe(0)
    }
    expect(await db._outbox.count()).toBe(0)
  })

  it('過去の撮影・これからの撮影・予約中の撮影がそろう', async () => {
    await seedDemoDataIfNeeded(DEMO_ACCOUNT_USER_ID, NOW)

    expect((await loadShootArchive(NOW)).length).toBeGreaterThanOrEqual(40)
    expect((await loadUpcomingShoots(NOW)).length).toBeGreaterThanOrEqual(10)
    expect(await db.sessions.where('status').equals('planned').count()).toBeGreaterThan(0)
    const stats = await loadHistoryStats(NOW)
    expect(stats.models.length).toBeGreaterThan(5)
    expect(stats.organizers.length).toBeGreaterThan(3)
  })

  it('すべての行がデモアカウントのもの', async () => {
    await seedDemoDataIfNeeded(DEMO_ACCOUNT_USER_ID, NOW)

    for (const table of SYNC_TABLES) {
      const rows = (await db.syncTable(table).toArray()) as { id: string; user_id?: string }[]
      for (const row of rows) {
        expect(row.user_id ?? row.id, table).toBe(DEMO_ACCOUNT_USER_ID)
      }
    }
  })

  it('2回目は入れない（同じ内容が二重にならない）', async () => {
    await seedDemoDataIfNeeded(DEMO_ACCOUNT_USER_ID, NOW)
    const before = await db.sessions.count()

    expect(await seedDemoDataIfNeeded(DEMO_ACCOUNT_USER_ID, NOW)).toBe(false)
    expect(await db.sessions.count()).toBe(before)
  })
})
