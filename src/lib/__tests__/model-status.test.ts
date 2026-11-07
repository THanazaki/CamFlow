import { beforeEach, describe, expect, it } from 'vitest'

import { updateModel } from '@/lib/actions/models'
import { db } from '@/lib/db'
import { MODEL_STATUSES, modelStatusLabel, toSelectableModelStatus } from '@/lib/model-status'
import { loadModelDetail } from '@/lib/queries/models'
import { loadSuggestions } from '@/lib/queries/reservations'
import { createRow } from '@/lib/sync/mutations'

const USER = '11111111-1111-4111-8111-111111111111'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('モデルのステータス', () => {
  it('選べるのは「活動中」「休止・引退」の2つ', () => {
    expect(MODEL_STATUSES).toEqual([
      { value: 'active', label: '活動中' },
      { value: 'inactive', label: '休止・引退' },
    ])
  })

  it('選択肢から外した ng（今後撮影しない）は休止・引退として扱う', () => {
    expect(toSelectableModelStatus('ng')).toBe('inactive')
    expect(modelStatusLabel('ng')).toBe('休止・引退')
    expect(modelStatusLabel('active')).toBe('活動中')
    expect(toSelectableModelStatus(undefined)).toBe('active')
  })

  it('ng のモデルは詳細で休止・引退になり、保存すると休止・引退で書き戻す', async () => {
    const id = await createRow('models', { user_id: USER, name: '葵', sns_links: {}, status: 'ng' })

    const detail = await loadModelDetail(id)
    expect(detail?.status).toBe('inactive')

    await updateModel(id, {
      name: '葵',
      nameKana: '',
      x: '',
      instagram: '',
      contactMethod: '',
      contactValue: '',
      affiliations: [''],
      mainAffiliation: 0,
      aliases: [],
      isFavorite: false,
      status: detail!.status,
      notes: '',
    })
    expect((await db.models.get(id))?.status).toBe('inactive')
  })

  it('ng のモデルも入力候補に出す', async () => {
    await createRow('models', { user_id: USER, name: '葵', sns_links: {}, status: 'ng' })

    expect((await loadSuggestions()).models).toEqual(['葵'])
  })
})
