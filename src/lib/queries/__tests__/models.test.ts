import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadModelList } from '@/lib/queries/models'
import { createRow, softDeleteRow } from '@/lib/sync/mutations'

const USER = '11111111-1111-4111-8111-111111111111'

function addModel(name: string, extra: { name_kana?: string; affiliation?: string } = {}) {
  return createRow('models', { user_id: USER, name, sns_links: {}, ...extra })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('モデルマスタの一覧', () => {
  it('モデル名と所属を返す。所属が未入力なら null', async () => {
    await addModel('あおい', { affiliation: 'フリー' })
    await addModel('かんな')

    expect(await loadModelList()).toMatchObject([
      { name: 'あおい', affiliation: 'フリー' },
      { name: 'かんな', affiliation: null },
    ])
  })

  it('読みがあれば読みの順、無ければ名前の順に並べる', async () => {
    await addModel('栞奈', { name_kana: 'かんな' })
    await addModel('さくら')
    await addModel('葵', { name_kana: 'あおい' })

    expect((await loadModelList()).map((m) => m.name)).toEqual(['葵', '栞奈', 'さくら'])
  })

  it('論理削除したモデルは出さない', async () => {
    const id = await addModel('削除するモデル')
    await addModel('残すモデル')
    await softDeleteRow('models', id)

    expect((await loadModelList()).map((m) => m.name)).toEqual(['残すモデル'])
  })
})
