import { createShootHistory, localToday } from '@/lib/actions/archives'
import { updateModel } from '@/lib/actions/models'
import { updateOrganizer } from '@/lib/actions/organizers'
import { createReservation } from '@/lib/actions/reservations'
import { confirmShoot, saveStorageUrls, type ShootConfirmInput } from '@/lib/actions/shoots'
import { updateVenue } from '@/lib/actions/venues'
import { createWishlistModel } from '@/lib/actions/wishlist'
import { db, getMeta, setMeta } from '@/lib/db'
import { SYNC_TABLES } from '@/lib/db/types'
import type { FeePaymentTiming } from '@/lib/fee-payment'
import type { PlaceCategory } from '@/lib/place-category'
import type { ShootCategory } from '@/lib/shoot-category'
import { createRow, updateRow } from '@/lib/sync/mutations'

/**
 * デモアカウント（show / show）のサンプルデータ。
 *
 * 人に見せるためのデータなので、画面の入力と同じ関数（createReservation / confirmShoot など）で作る。
 * 入力から自動で作られるモデル・撮影会・場所も、実際の操作と同じ形になる。
 * 日付は「今日」からの相対で決めるので、いつ開いても過去の撮影・これからの撮影・予約がそろう。
 * 名前・団体名・場所はすべて架空。URL は example.com、アカウントは架空の @ハンドル。
 *
 * デモアカウントは同期しないので、作り終えたら送信キューを空にして未送信の表示を出さない。
 */

/** シードを入れたかの印（_meta）。サインアウトするとローカルデータごと消えるので、次のサインインで入れ直す */
const SEEDED_KEY = 'demo_seeded_at'

/** 同じ結果になる乱数（mulberry32）。開くたびに内容が変わらないように */
function random(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ORGANIZERS = [
  { name: 'あおぞら撮影会', kana: 'あおぞらさつえいかい', base: '東京', x: '@aozora_satsuei', ig: '@aozora_photo' },
  { name: 'ルミナス撮影会', kana: 'るみなすさつえいかい', base: '東京', x: '@luminous_satsuei', ig: null },
  { name: 'ひかり撮影会', kana: 'ひかりさつえいかい', base: '横浜', x: '@hikari_satsuei', ig: '@hikari_satsuei_ig' },
  { name: 'ステラ撮影会', kana: 'すてらさつえいかい', base: '大阪', x: '@stella_satsuei', ig: '@stella_photo' },
  { name: 'みなと撮影会', kana: 'みなとさつえいかい', base: '神戸', x: null, ig: '@minato_satsuei' },
  { name: 'ポートレート・ノア', kana: 'ぽーとれーとのあ', base: '名古屋', x: '@portrait_noa', ig: null },
] as const

/** [モデル名, 読み, 主に出る撮影会（null はフリー）] */
const MODELS: [string, string, string | null][] = [
  ['葵', 'あおい', 'あおぞら撮影会'],
  ['栞奈', 'かんな', 'あおぞら撮影会'],
  ['凛', 'りん', 'ルミナス撮影会'],
  ['結衣', 'ゆい', 'ルミナス撮影会'],
  ['美桜', 'みお', 'ひかり撮影会'],
  ['陽菜', 'ひな', 'ひかり撮影会'],
  ['莉子', 'りこ', 'ステラ撮影会'],
  ['彩花', 'あやか', 'ステラ撮影会'],
  ['七海', 'ななみ', 'みなと撮影会'],
  ['楓', 'かえで', 'みなと撮影会'],
  ['真白', 'ましろ', 'ポートレート・ノア'],
  ['琴音', 'ことね', 'ポートレート・ノア'],
  ['花音', 'かのん', null],
  ['紗良', 'さら', null],
  ['心晴', 'こはる', null],
  ['澪', 'みお', 'あおぞら撮影会'],
  ['千尋', 'ちひろ', 'ルミナス撮影会'],
  ['柚葉', 'ゆずは', 'ひかり撮影会'],
  ['杏', 'あん', 'ステラ撮影会'],
  ['詩織', 'しおり', null],
]

/** [場所, 場所区分, 住所, 最寄り駅, 1時間あたりの料金] */
const VENUES: [string, PlaceCategory, string, string, number | null][] = [
  ['スタジオ ルーチェ', 'studio', '東京都渋谷区（架空）', '渋谷', 6000],
  ['スタジオ アトリエ白', 'studio', '東京都目黒区（架空）', '中目黒', 5000],
  ['ハウススタジオ 木漏れ日', 'studio', '神奈川県横浜市（架空）', '元町・中華街', 8000],
  ['スタジオ ネオン', 'studio', '大阪府大阪市（架空）', '心斎橋', 4500],
  ['代々木公園', 'outdoor', '東京都渋谷区', '原宿', null],
  ['山下公園', 'outdoor', '神奈川県横浜市', '元町・中華街', null],
  ['昭和記念公園', 'outdoor', '東京都立川市', '西立川', null],
  ['メリケンパーク', 'outdoor', '兵庫県神戸市', '元町', null],
]

const CONCEPTS = ['', '', '', '浴衣', '制服', 'カフェ風', '白ワンピース', '夜景', 'ドレス', '桜']
const COSTUMES = ['', '', '浴衣', '水着', 'ドレス', '私服', '制服']
const METHODS = ['', '', '動画撮影', 'ストロボ使用', 'スマホ']
const START_TIMES = ['10:00', '11:00', '13:00', '14:00', '15:30', '17:00']

/** 時刻に分を足した HH:mm */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** 今日から days 日ずらした YYYY-MM-DD（ローカル時刻） */
function dayOffset(now: Date, days: number): string {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  return localToday(d)
}

/** デモアカウントのデータがまだ入っていなければ入れる。入れたら true */
export async function seedDemoDataIfNeeded(userId: string, now: Date = new Date()): Promise<boolean> {
  if (await getMeta<string>(SEEDED_KEY)) {
    await replaceRetiredMethodOption()
    return false
  }
  await seedDemoData(userId, now)
  await setMeta(SEEDED_KEY, now.toISOString())
  return true
}

/** 以前のサンプルに入っていた撮影方法「ローアングル可」を、入れ済みの端末でも「スマホ」に直す */
async function replaceRetiredMethodOption(): Promise<void> {
  for (const table of ['slots', 'shoot_history', 'wishlist_models'] as const) {
    const rows = await db.syncTable(table).toArray()
    for (const row of rows as { id: string; shooting_method_options?: string | null }[]) {
      const value = row.shooting_method_options
      if (value && value.includes('ローアングル可')) {
        await updateRow(table, row.id, { shooting_method_options: value.replaceAll('ローアングル可', 'スマホ') })
      }
    }
  }
}

export async function seedDemoData(userId: string, now: Date = new Date()): Promise<void> {
  const rand = random(20261107)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]

  // ── プロフィール ─────────────────────────────────────────
  await createRow('profiles', {
    id: userId,
    display_name: 'デモ カメラマン',
    default_timer_minutes: 25,
    default_slot_minutes: 30,
  })

  const modelEvent = (name: string) => MODELS.find(([n]) => n === name)?.[2] ?? null
  const venueCategory = (name: string) => VENUES.find(([v]) => v === name)?.[1] ?? 'studio'

  // ── 過去撮影登録（1年半前〜2か月前） ──────────────────────
  for (let i = 0; i < 30; i++) {
    const [modelName] = pick(MODELS)
    const event = modelEvent(modelName)
    const venue = pick(VENUES)[0]
    const category: ShootCategory = i % 9 === 0 ? 'session' : i % 7 === 0 ? 'group' : 'solo'
    await createShootHistory(userId, {
      eventName: event ?? '',
      shootCategory: category,
      modelName: category === 'session' ? '' : modelName,
      concept: pick(CONCEPTS),
      placeCategory: venueCategory(venue),
      venueName: venue,
      shootDate: dayOffset(now, -(60 + Math.floor(rand() * 480))),
      storageUrls:
        rand() < 0.7 ? [`https://drive.example.com/demo/history-${String(i + 1).padStart(2, '0')}`] : [],
      memo: i % 6 === 0 ? 'お気に入りのカットが多かった回' : '',
    })
  }

  // ── 確定撮影情報入力（過去2か月〜今後6週間） ───────────────
  const confirm = (overrides: Partial<ShootConfirmInput> & { modelName: string; shootDate: string }) => {
    const venue = pick(VENUES)[0]
    const start = pick(START_TIMES)
    const timing: FeePaymentTiming | null = pick(['on_the_day', 'in_advance', 'paid', null] as const)
    const fee = pick([0, 5000, 6000, 8000, 10000, 12000])
    return confirmShoot(userId, {
      fromSessionId: '',
      eventName: modelEvent(overrides.modelName) ?? '',
      shootCategory: 'solo',
      concept: pick(CONCEPTS),
      placeCategory: venueCategory(venue),
      venueName: venue,
      meetingPoint: venueCategory(venue) === 'outdoor' ? '駅の改札前' : '',
      meetingTime: rand() < 0.5 ? addMinutes(start, -15) : '',
      startTime: start,
      endTime: addMinutes(start, pick([30, 60, 90])),
      paymentTiming: timing,
      paymentDate: timing === 'in_advance' ? dayOffset(now, -1) : '',
      shootFee: fee > 0 ? String(fee) : '',
      costumeOptions: pick(COSTUMES),
      shootingMethodOptions: pick(METHODS),
      memo: '',
      ...overrides,
    })
  }

  const pastSlots: string[] = []
  for (let i = 0; i < 14; i++) {
    const [modelName] = pick(MODELS)
    const { slotId } = await confirm({ modelName, shootDate: dayOffset(now, -(3 + i * 4)) })
    pastSlots.push(slotId)
  }
  for (let i = 0; i < 10; i++) {
    const [modelName] = pick(MODELS)
    const date = dayOffset(now, 2 + i * 4)
    await confirm({
      modelName,
      shootDate: date,
      memo: i === 0 ? '前日に持ち物を確認する' : '',
      ...(i % 3 === 0 ? { paymentTiming: 'in_advance', paymentDate: dayOffset(now, 1 + i * 4) } : {}),
    })
  }

  // 撮影済みの枠: 撮影済みにして、多くは保存先も登録する（残りは「データ未登録」として見せる）
  for (const [i, slotId] of pastSlots.entries()) {
    await updateRow('slots', slotId, { shoot_status: 'shot', frame_count: 150 + Math.floor(rand() * 400) })
    if (i % 4 !== 3) {
      await saveStorageUrls(slotId, [`https://drive.example.com/demo/shoot-${String(i + 1).padStart(2, '0')}`], now)
    }
  }

  // モデル料・納品の明細（slot_models）
  const deliveries = ['delivered', 'delivered', 'retouching', 'selecting', 'not_started'] as const
  for (const link of await db.slot_models.toArray()) {
    const past = pastSlots.includes(link.slot_id)
    const delivery = past ? pick(deliveries) : 'not_started'
    await updateRow('slot_models', link.id, {
      fee: pick([3000, 4000, 5000]),
      payment_status: past || rand() < 0.3 ? 'paid' : 'unpaid',
      paid_at: past ? now.toISOString() : null,
      delivery_status: delivery,
      delivery_deadline: past ? dayOffset(now, 14) : null,
      delivered_at: delivery === 'delivered' ? now.toISOString() : null,
      selected_count: past ? 20 + Math.floor(rand() * 30) : null,
    })
  }
  for (const link of await db.shoot_history_models.toArray()) {
    await updateRow('shoot_history_models', link.id, {
      fee: pick([3000, 4000, 5000]),
      payment_status: 'paid',
    })
  }

  // ── 予約情報入力（予約受付がこれから / 予約から確定 / 予約できなかった） ──
  const reservationIds: string[] = []
  for (let i = 0; i < 10; i++) {
    const [modelName] = pick(MODELS)
    const opens = new Date(now)
    opens.setDate(opens.getDate() + 1 + i * 2)
    opens.setHours(i % 2 === 0 ? 20 : 21, 0, 0, 0)
    const venue = pick(VENUES)[0]
    const { sessionId } = await createReservation(userId, {
      eventName: modelEvent(modelName) ?? '',
      shootCategory: 'solo',
      modelName,
      concept: pick(CONCEPTS),
      venueName: venue,
      shootDate: dayOffset(now, 20 + i * 3),
      bookingOpensAt: `${localToday(opens)}T${String(opens.getHours()).padStart(2, '0')}:00`,
      bookingMethod: pick(['page', 'page', 'email', 'dm'] as const),
      bookingContact: 'https://example.com/booking',
      shootFee: String(pick([5000, 6000, 8000])),
      costumeOptions: pick(COSTUMES),
      shootingMethodOptions: pick(METHODS),
      paymentTiming: pick(['on_the_day', 'in_advance', 'paid'] as const),
      paymentDate: dayOffset(now, 18 + i * 3),
      memo: i === 0 ? '争奪戦になりそう。開始前にログインしておく' : '',
    })
    reservationIds.push(sessionId)
  }
  // 2件は予約が取れて確定、1件は取れなかった
  for (const sessionId of reservationIds.slice(0, 2)) {
    const session = await db.sessions.get(sessionId)
    const link = await db.slot_models
      .where('slot_id')
      .anyOf((await db.slots.where('session_id').equals(sessionId).toArray()).map((s) => s.id))
      .first()
    const model = link ? await db.models.get(link.model_id) : undefined
    await confirm({
      fromSessionId: sessionId,
      eventName: session?.title ?? '',
      modelName: model?.name ?? '葵',
      shootDate: session?.session_date ?? dayOffset(now, 20),
    })
  }
  await updateRow('sessions', reservationIds[2], { status: 'cancelled' })

  // ── 撮影希望モデル ────────────────────────────────────────
  const wishes: [string, string, string, string][] = [
    ['花音', 'あおぞら撮影会', '浴衣', '動画撮影'],
    ['紗良', '', 'ドレス', ''],
    ['心晴', 'ひかり撮影会', '', 'ストロボ使用'],
    ['詩織', '', '私服', ''],
    ['真白', 'ポートレート・ノア', '制服', ''],
    ['七海', 'みなと撮影会', '水着', ''],
    ['杏', 'ステラ撮影会', '', ''],
    ['新人モデル 茜', 'ルミナス撮影会', '白ワンピース', 'スマホ'],
  ]
  for (const [modelName, eventName, costume, method] of wishes) {
    await createWishlistModel(userId, {
      modelName,
      eventName,
      costumeOptions: costume,
      shootingMethodOptions: method,
    })
  }

  // ── マスタの中身（読み・別名義・アカウント・拠点・住所など） ──
  for (const [index, model] of (await db.models.toArray()).entries()) {
    const kana = MODELS.find(([n]) => n === model.name)?.[1] ?? ''
    const handle = `demo_model_${String(index + 1).padStart(2, '0')}`
    await updateModel(model.id, {
      name: model.name,
      nameKana: kana,
      accounts: [
        { service: 'x', value: `@${handle}` },
        ...(index % 2 === 0 ? [{ service: 'instagram', value: `@${handle}_ig` }] : []),
        ...(index % 5 === 0 ? [{ service: 'x', value: `@${handle}_sub` }] : []),
      ],
      contactMethod: index % 3 === 0 ? 'DM' : '',
      contactValue: '',
      affiliations: [model.affiliation ?? '', ...(model.sub_affiliations ?? [])],
      mainAffiliation: 0,
      aliases: index % 6 === 0 ? [{ name: `${model.name}（旧名義）`, kana: `${kana}きゅうめいぎ` }] : [],
      isFavorite: index % 4 === 0,
      status: index % 10 === 4 ? 'inactive' : 'active',
      notes: index % 7 === 0 ? '表情の引き出しが多い。次は屋外で撮りたい' : '',
    })
  }

  for (const organizer of await db.organizers.toArray()) {
    const data = ORGANIZERS.find((o) => o.name === organizer.name)
    const slug = data ? data.x?.slice(1) ?? data.ig?.slice(1) ?? 'organizer' : 'organizer'
    await updateOrganizer(organizer.id, {
      name: organizer.name,
      nameKana: data?.kana ?? '',
      baseLocation: data?.base ?? '',
      url: data ? `https://example.com/${slug}` : '',
      accounts: [
        ...(data?.x ? [{ service: 'x', value: data.x }] : []),
        ...(data?.ig ? [{ service: 'instagram', value: data.ig }] : []),
      ],
      contact: data ? `info@${slug.replace(/_/g, '-')}.example.com` : '',
      notes: data?.name === 'あおぞら撮影会' ? '支払いは当日現金のみ' : '',
      isFavorite: data?.name === 'あおぞら撮影会',
    })
  }

  for (const venue of await db.venues.toArray()) {
    const data = VENUES.find(([name]) => name === venue.name)
    await updateVenue(venue.id, {
      name: venue.name,
      kind: venue.kind,
      address: data?.[2] ?? '',
      nearestStation: data?.[3] ?? '',
      url: data?.[1] === 'studio' ? 'https://example.com/studio' : '',
      hourlyRate: data?.[4] != null ? String(data[4]) : '',
      notes: data?.[1] === 'studio' ? '自然光あり。電源は各部屋2口' : '',
      isFavorite: venue.name === 'スタジオ ルーチェ',
    })
  }

  // ── 同期しないので、送信キューを空にして同期済みの形にそろえる ──
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.syncTable(t)), db._outbox], async () => {
    await db._outbox.clear()
    for (const table of SYNC_TABLES) {
      await db.syncTable(table).toCollection().modify({ _dirty: 0 })
    }
  })
}
