import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { loadShootArchive } from '@/lib/queries/archives'
import { loadVenueDetail, loadVenueList } from '@/lib/queries/venues'
import { createRow, softDeleteRow } from '@/lib/sync/mutations'

import { createShootHistory, type ShootHistoryInput } from '../archives'
import { createReservation, type ReservationInput } from '../reservations'
import { confirmShoot, type ShootConfirmInput } from '../shoots'
import { parseHourlyRate, updateVenue, type VenueInput } from '../venues'

const USER = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-06-15T12:00:00')

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

function venueInput(overrides: Partial<VenueInput> = {}): VenueInput {
  return {
    name: 'スタジオA',
    kind: 'studio',
    address: '',
    nearestStation: '',
    url: '',
    hourlyRate: '',
    notes: '',
    isFavorite: false,
    ...overrides,
  }
}

const venueNames = async () => (await loadVenueList()).map((v) => v.name)

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('撮影場所の自動登録', () => {
  it('確定撮影情報入力で、場所区分から種別を決めて登録し、撮影に紐づける', async () => {
    await confirmShoot(USER, confirmation({ venueName: ' スタジオA ', placeCategory: 'studio' }))
    await confirmShoot(USER, confirmation({ venueName: '代々木公園', placeCategory: 'outdoor', shootDate: '2026-06-02' }))

    const venues = await db.venues.toArray()
    expect(venues.map((v) => [v.name, v.kind]).sort()).toEqual([
      ['スタジオA', 'studio'],
      ['代々木公園', 'location'],
    ])
    const sessions = await db.sessions.toArray()
    expect(sessions.every((s) => venues.some((v) => v.id === s.venue_id))).toBe(true)
  })

  it('過去撮影登録でも登録する。同じ名前（大文字小文字の違いを含む）は増やさない', async () => {
    await createShootHistory(USER, history({ venueName: 'Studio A' }))
    await createShootHistory(USER, history({ venueName: 'studio a', shootDate: '2026-01-11' }))

    expect(await venueNames()).toEqual(['Studio A'])
    const [history1, history2] = await db.shoot_history.toArray()
    expect(history1.venue_id).toBe(history2.venue_id)
  })

  it('予約情報入力では登録しない。場所が空なら登録しない', async () => {
    await createReservation(USER, reservation({ venueName: '予約だけの場所' }))
    await confirmShoot(USER, confirmation({ venueName: '' }))

    expect(await venueNames()).toEqual([])
  })

  it('論理削除した場所と同じ名前なら新しく登録する', async () => {
    const old = await createRow('venues', { user_id: USER, name: 'スタジオA', kind: 'studio', is_favorite: false })
    await softDeleteRow('venues', old)

    await confirmShoot(USER, confirmation({ venueName: 'スタジオA' }))

    expect((await loadVenueList()).map((v) => v.id)).not.toContain(old)
    expect(await venueNames()).toEqual(['スタジオA'])
  })
})

describe('ロケ地・スタジオマスタの一覧', () => {
  it('名前の順に返し、論理削除は出さない', async () => {
    await createRow('venues', { user_id: USER, name: 'スタジオB', kind: 'studio', is_favorite: false })
    await createRow('venues', { user_id: USER, name: 'スタジオA', kind: 'studio', is_favorite: false })
    const deleted = await createRow('venues', { user_id: USER, name: '消した場所', kind: 'location', is_favorite: false })
    await softDeleteRow('venues', deleted)

    expect(await venueNames()).toEqual(['スタジオA', 'スタジオB'])
  })
})

describe('撮影場所の編集', () => {
  it('全項目を保存し、前後の空白を除く', async () => {
    await confirmShoot(USER, confirmation({ venueName: 'スタジオA' }))
    const [venue] = await db.venues.toArray()

    await updateVenue(
      venue.id,
      venueInput({
        name: ' スタジオA 本館 ',
        kind: 'location',
        address: ' 東京都渋谷区 ',
        nearestStation: ' 渋谷 ',
        url: ' https://example.com ',
        hourlyRate: ' 5,000 ',
        notes: ' 電源あり ',
        isFavorite: true,
      }),
    )

    expect(await loadVenueDetail(venue.id)).toMatchObject({
      name: 'スタジオA 本館',
      kind: 'location',
      address: '東京都渋谷区',
      nearestStation: '渋谷',
      url: 'https://example.com',
      hourlyRate: 5000,
      notes: '電源あり',
      isFavorite: true,
    })
  })

  it('名前を変えると、紐づく撮影の場所の表示も新しい名前になる', async () => {
    await confirmShoot(USER, confirmation({ venueName: 'スタジオA' }))
    const [venue] = await db.venues.toArray()

    await updateVenue(venue.id, venueInput({ name: 'スタジオA 本館' }))

    expect((await loadShootArchive(NOW)).map((r) => r.venueName)).toEqual(['スタジオA 本館'])
  })

  it('空にした項目は null に戻す', async () => {
    const id = await createRow('venues', {
      user_id: USER,
      name: 'スタジオA',
      kind: 'studio',
      is_favorite: false,
      address: '住所',
      hourly_rate: 3000,
      notes: 'メモ',
    })

    await updateVenue(id, venueInput())

    expect(await loadVenueDetail(id)).toMatchObject({ address: null, hourlyRate: null, notes: null })
  })

  it('名前が空、他の場所と同じ名前、料金が不正ならエラーにして変更しない', async () => {
    const id = await createRow('venues', { user_id: USER, name: 'スタジオA', kind: 'studio', is_favorite: false })
    await createRow('venues', { user_id: USER, name: 'スタジオB', kind: 'studio', is_favorite: false })

    await expect(updateVenue(id, venueInput({ name: ' ' }))).rejects.toThrow('撮影場所を入力してください')
    await expect(updateVenue(id, venueInput({ name: 'スタジオb' }))).rejects.toThrow('既に登録されています')
    await expect(updateVenue(id, venueInput({ hourlyRate: '-100' }))).rejects.toThrow('0以上の整数')
    expect((await db.venues.get(id))?.name).toBe('スタジオA')
  })

  it('料金は空なら null、カンマ区切りも受け付け、小数は受け付けない', () => {
    expect(parseHourlyRate('')).toBeNull()
    expect(parseHourlyRate('1,500')).toBe(1500)
    expect(() => parseHourlyRate('1.5')).toThrow()
    expect(() => parseHourlyRate('abc')).toThrow()
  })

  it('論理削除した場所はエラー', async () => {
    const id = await createRow('venues', { user_id: USER, name: 'スタジオA', kind: 'studio', is_favorite: false })
    await softDeleteRow('venues', id)

    await expect(updateVenue(id, venueInput())).rejects.toThrow('見つかりませんでした')
    expect(await loadVenueDetail(id)).toBeNull()
  })
})
