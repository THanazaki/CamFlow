import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'

import { CamFlowDB, db } from '@/lib/db'
import { SYNC_TABLES } from '@/lib/db/types'
import { createRow, deleteRow } from '@/lib/sync/mutations'

const USER = '11111111-1111-4111-8111-111111111111'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('model_former_names', () => {
  it('FK の親であるモデルより後に同期する', () => {
    expect(SYNC_TABLES.indexOf('model_former_names')).toBeGreaterThan(SYNC_TABLES.indexOf('models'))
  })

  it('追加と削除が送信キューに積まれる', async () => {
    const modelId = await createRow('models', {
      user_id: USER,
      name: '現在の名義',
      sns_links: {},
      tags: [],
      is_favorite: false,
      status: 'active',
    })
    const id = await createRow('model_former_names', {
      user_id: USER,
      model_id: modelId,
      name: '旧名義',
    })

    expect((await db.model_former_names.where('model_id').equals(modelId).first())?.name).toBe(
      '旧名義',
    )

    await deleteRow('model_former_names', id)

    expect(await db.model_former_names.count()).toBe(0)
    const ops = (await db._outbox.orderBy('seq').toArray()).map((e) => `${e.op}:${e.table}`)
    expect(ops).toEqual([
      'insert:models',
      'insert:model_former_names',
      'delete:model_former_names',
    ])
  })

  it('既存の端末は既存データを保ったままアップグレードできる', async () => {
    const name = 'camflow-upgrade-test'
    await Dexie.delete(name)

    const old = new Dexie(name)
    old.version(1).stores({ models: 'id, name' })
    await old.open()
    await old.table('models').add({ id: 'm1', name: '現在の名義' })
    old.close()

    const upgraded = new CamFlowDB(name)
    await upgraded.open()

    expect((await upgraded.models.get('m1'))?.name).toBe('現在の名義')
    expect(await upgraded.model_former_names.count()).toBe(0)

    upgraded.close()
    await Dexie.delete(name)
  })
})
