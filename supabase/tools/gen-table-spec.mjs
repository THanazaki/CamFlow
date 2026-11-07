// テーブル仕様書（docs/テーブル仕様.md）を生成する。
//
//   npm run docs:tables
//
// マイグレーションを PGlite に流し、実際にできたテーブル・カラム・制約・インデックス・トリガ・RLS を
// カタログから読んで書き出す。型・NULL・既定値・制約は DB が正なので、手で書かずにここから作る。
// 人が書くのは下の TABLES / COLUMN_NOTES / SCREEN_LABELS（論理名・説明・画面の項目名）だけ。
// マイグレーションを足したら、このコマンドで作り直すこと。説明の無いカラムがあると警告を出す。

import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')
const DIR = `${ROOT}/supabase`
const OUT = `${ROOT}/docs/テーブル仕様.md`

// ── 人が書く部分 ──────────────────────────────────────────────────────────

/** テーブルの論理名・系統・概要。並び順もこの順 */
const TABLES = [
  ['profiles', 'ユーザー基本情報', 'ユーザー', 'ユーザーごとの表示名と既定値。`auth.users` と 1:1'],
  ['models', 'モデルマスタ', 'マスタ', 'モデル1人 = 1行。**名前と所属（撮影会名）の組み合わせで見分ける**（撮影会ごとに同名の別人がいるため）。予約・確定・過去撮影の入力で組み合わせが新しければ自動で作る'],
  ['model_former_names', 'モデルの別名義', 'マスタ', '改名前の名前や別の活動名。画面では「別名義」。現在の活動名は `models.name`'],
  ['organizers', '撮影会マスタ', 'マスタ', '撮影会（主催団体）。各画面で撮影会名を入力すると自動で作る'],
  ['venues', 'ロケ地・スタジオマスタ', 'マスタ', '撮影場所。スタジオとロケ地は `kind` で区別する（持つ項目が共通なのでテーブルは1つ）。確定撮影情報入力・過去撮影登録で場所を入力すると自動で作る'],
  ['wishlist_models', '撮影希望モデル', '予約前', '撮影してみたいモデルの控え。予約になる前の段階なので日付や枠は持たない'],
  ['sessions', '撮影イベント', '運用フロー', '撮影イベント1件（1日 / 1案件）。予約情報入力で `planned`、確定撮影情報入力で `confirmed` になる'],
  ['slots', '撮影枠', '運用フロー', 'イベントの中の撮影枠（1部・2部…）。**現場タイマーと撮影データ保管先の単位**'],
  ['slot_models', '枠 × モデル明細', '運用フロー', '枠に参加したモデル1人分。**モデル料の支払いと納品の単位**（1枠に複数モデルが入りうるため枠ではなくここに持つ）'],
  ['shoot_history', '過去撮影（遡及登録）', '遡及登録', '運用フローを通していない過去の撮影。過去撮影登録で作る。1行 = 1回の撮影'],
  ['shoot_history_models', '過去撮影の参加モデル', '遡及登録', '過去撮影に参加したモデル'],
  ['sync_tombstones', '物理削除ログ', 'システム', 'オフライン同期用。物理削除をトリガで記録し、端末が id の続きから読む。保持期間は90日'],
  ['audit_logs', 'DB 操作ログ', 'システム', 'INSERT / UPDATE / DELETE の記録。トリガだけが書き込み、端末には同期しない'],
]

/** どのテーブルにもある共通カラムの説明 */
const COMMON_NOTES = {
  id: '主キー',
  user_id: '所有者（`auth.users`）。RLS で本人の行だけに絞る',
  created_at: '作成日時',
  updated_at: '更新日時。サーバの書き込みでトリガが必ず上書きする（競合解決の基準）',
  deleted_at: '論理削除の日時。一覧は `deleted_at is null` で絞る',
}

/** カラムの説明。table.column をキーにする（共通カラムは上書きしたいときだけ） */
const COLUMN_NOTES = {
  'profiles.id': '主キー。`auth.users(id)` と同じ値（cascade）',
  'profiles.display_name': '表示名',
  'profiles.avatar_url': 'アイコン画像の URL（画面では未使用）',
  'profiles.default_timer_minutes': 'タイマーの初期値（分）。1〜600',
  'profiles.default_slot_minutes': '枠を作るときの既定の長さ（分）。1〜600',

  'models.name': '活動名',
  'models.name_kana': '読み。一覧の並び順に使う',
  'models.avatar_url': 'アイコン画像の URL（画面では使わない。カラムと値は残す）',
  'models.sns_links': '**互換用。** `{"x":"…","instagram":"…"}`。`sns_accounts` を持たない古いローカル行を読むときだけ使い、書き換えない',
  'models.sns_accounts': 'モデルアカウント。`[{"service":"x","value":"@…"}]` の配列（登録順）。同じ種類を複数持てる。`service` は `x` / `instagram` / `other`',
  'models.contact_method': '連絡手段（DM / LINE / メールなど）',
  'models.contact_value': '連絡先',
  'models.affiliation': 'メインの所属（撮影会名 / フリー）。入力から作るときは撮影会名、空なら「フリー」',
  'models.sub_affiliations': 'メイン以外の所属。モデルの照合ではメインと同じく扱う',
  'models.tags': 'ジャンル（画面では使わない。カラムと値は残す）',
  'models.rating': '評価 1〜5（画面では使わない。カラムと値は残す）',
  'models.is_favorite': 'お気に入り',
  'models.status': '活動中 / 休止・引退。`ng` は選択肢から外し、休止・引退として扱う',
  'models.notes': 'メモ',

  'model_former_names.model_id': '`models` 参照（cascade）。他ユーザーのモデルは付けられない（トリガで検証）',
  'model_former_names.name': '別名義',
  'model_former_names.name_kana': '別名義の読み',
  'model_former_names.used_from': '使用開始日。分かる場合のみ（画面には出さない）',
  'model_former_names.used_until': '使用終了日。分かる場合のみ（画面には出さない）',

  'organizers.name': '撮影会名。変更すると、その名前を所属に持つモデルの所属も書き換える',
  'organizers.name_kana': '読み。一覧の並び順に使う',
  'organizers.url': '公式サイト・予約ページ',
  'organizers.contact': '連絡先（メール / DM / 電話）',
  'organizers.notes': 'メモ（支払い条件、入館ルールなど）',
  'organizers.base_location': '拠点（自由入力）',
  'organizers.is_favorite': 'お気に入り',
  'organizers.sns_accounts': 'アカウント（X / Instagram など）。`models.sns_accounts` と同じ形の配列',

  'venues.name': '撮影場所の名前。撮影の表示は `venue_id` があればこの名前を使うので、変えると撮影側の表示も変わる',
  'venues.kind': '種別。スタジオ / ロケ地。自動登録では場所区分から決める（屋外 → ロケ地）',
  'venues.address': '住所',
  'venues.url': '公式サイト・予約ページ',
  'venues.nearest_station': '最寄り駅',
  'venues.hourly_rate': '1時間あたりの料金（円）。0以上',
  'venues.notes': 'メモ（機材 / 電源 / NG 事項など）',
  'venues.is_favorite': 'お気に入り',

  'wishlist_models.model_id': '`models` 参照（cascade）。他ユーザーのモデルは付けられない（トリガで検証）',
  'wishlist_models.event_name': '撮影会名',
  'wishlist_models.costume_options': '衣装系オプション（自由入力）',
  'wishlist_models.shooting_method_options': '撮影方法オプション（自由入力）',

  'sessions.title': 'タイトル。撮影会名、無ければコンセプト、どちらも無ければ「葵 撮影」のような自動の名前',
  'sessions.session_date': '撮影日。カレンダー・一覧の軸',
  'sessions.shoot_type': '撮影の種類（旧項目。画面では `shoot_category` を使う）',
  'sessions.shoot_category': '撮影区分。`session` / `large` はモデルを指定しない。NULL（導入前の行）は個撮扱い',
  'sessions.place_category': '場所区分。確定時に選ぶので、確定前と導入前の行は NULL',
  'sessions.meeting_point': '集合場所。屋外のときだけ入力する',
  'sessions.status': '進行状態。予約中 `planned` → 確定 `confirmed`（予約できなければ `cancelled`）',
  'sessions.venue_id': '`venues` 参照（削除時 set null）',
  'sessions.venue_name': '入力した場所の名前。`venue_id` があれば表示はマスタの名前を優先',
  'sessions.organizer_id': '`organizers` 参照（削除時 set null）',
  'sessions.organizer': 'マスタ未登録の主催団体用フォールバック（旧項目）',
  'sessions.booking_opens_at': '予約受付の開始日時。撮影日とは別軸',
  'sessions.booking_method': '申込方法。`booking_contact` の中身がこれで決まる',
  'sessions.booking_contact': '申込先。`page` なら URL、`email` ならアドレス、`dm` ならアカウント',
  'sessions.concept': '撮影コンセプト',
  'sessions.start_at': 'イベントの開始日時（任意）',
  'sessions.end_at': 'イベントの終了日時（任意）。`start_at` より後',
  'sessions.studio_cost': 'スタジオ代。0以上',
  'sessions.transport_cost': '交通費。0以上',
  'sessions.entry_cost': '撮影会参加費など枠に紐づかない支払い。0以上',
  'sessions.other_cost': 'その他の支出。0以上',
  'sessions.other_cost_note': 'その他の支出の内訳',
  'sessions.weather_note': '天気のメモ',
  'sessions.memo': 'メモ',

  'slots.session_id': '`sessions` 参照（cascade）',
  'slots.slot_no': '枠番号（1部 = 1）。1以上',
  'slots.label': '「1部」「延長」など表示名の上書き',
  'slots.start_at': '開始日時。予約段階では撮影日の 0 時を仮置きする',
  'slots.planned_minutes': '予定時間（分）。1以上',
  'slots.end_at': '終了日時。**トリガが維持する**（開始 + 予定 + 延長）',
  'slots.timer_status': '現場タイマーの状態',
  'slots.timer_started_at': 'タイマーの実際の開始時刻',
  'slots.timer_ends_at': 'タイマーの終了予定の絶対時刻。残り時間は端末で計算する',
  'slots.timer_remaining_sec': '一時停止中の残秒数。0以上',
  'slots.timer_finished_at': 'タイマーの終了時刻',
  'slots.extended_minutes': '延長した分の累計',
  'slots.booking_fee': '撮影料（モデル個別でない枠の料金）。0以上',
  'slots.costume_options': '衣装系オプション（自由入力）',
  'slots.shooting_method_options': '撮影方法オプション（自由入力）',
  'slots.fee_payment_timing': '撮影料の支払方法（当日 / 事前 / 支払済み）。未選択は NULL',
  'slots.fee_payment_date': '撮影料の支払日。**支払方法が事前のときだけ持てる**',
  'slots.meeting_at': '集合時刻（撮影日と合成した日時）',
  'slots.theme': '枠ごとのテーマ（画面では未使用）',
  'slots.shoot_status': '枠の実施結果。予定 / 撮影済み / 中止 / 不参加',
  'slots.frame_count': '撮影枚数。0以上',
  'slots.storage_path': '物理的な保管先のフォルダパス',
  'slots.storage_label': 'ドライブ名・HDD ラベル（物理的な特定用）',
  'slots.storage_urls': '保存先ストレージの URL。**最大10個**。撮影が終わるまで登録できない（アプリ側で制御）',
  'slots.storage_size_mb': 'データ容量（MB）。0以上',
  'slots.backup_location': 'バックアップ先',
  'slots.backed_up_at': 'バックアップ日時。NULL = 未バックアップ',
  'slots.rating': '評価 1〜5',
  'slots.memo': 'メモ',

  'slot_models.slot_id': '`slots` 参照（**cascade**）',
  'slot_models.model_id': '`models` 参照（**restrict**：撮影履歴のあるモデルは物理削除できない）',
  'slot_models.costume': '衣装（モデルごとに異なる）',
  'slot_models.fee': 'モデル料。0以上',
  'slot_models.extension_fee': '延長料。0以上',
  'slot_models.payment_status': 'モデルへの支払い状態',
  'slot_models.paid_at': '支払日時。`paid` なら必須',
  'slot_models.payment_method': '支払い手段（現金 / PayPay / 銀行振込など）',
  'slot_models.delivery_status': '納品の進行状態',
  'slot_models.delivery_deadline': '納品期限。ダッシュボードのアラート対象',
  'slot_models.delivered_at': '納品日時。`delivered` なら必須',
  'slot_models.delivery_method': '納品手段（Google ドライブ / ギガファイル便 / AirDrop など）',
  'slot_models.delivery_url': '納品先の URL',
  'slot_models.selected_count': 'セレクト枚数。0以上',
  'slot_models.delivered_count': '納品枚数。0以上',
  'slot_models.memo': 'メモ',

  'shoot_history.shoot_date': '撮影日。今日以前（アプリ側で制御）',
  'shoot_history.title': 'タイトル。作り方は `sessions.title` と同じ',
  'shoot_history.shoot_type': '撮影の種類（旧項目。画面では `shoot_category` を使う）',
  'shoot_history.shoot_category': '撮影区分。`session` / `large` はモデルを指定しない',
  'shoot_history.concept': '撮影コンセプト',
  'shoot_history.place_category': '場所区分',
  'shoot_history.venue_id': '`venues` 参照（削除時 set null）',
  'shoot_history.venue_name': '入力した場所の名前。`venue_id` があれば表示はマスタの名前を優先',
  'shoot_history.organizer_id': '`organizers` 参照（削除時 set null）',
  'shoot_history.organizer': 'マスタ未登録の主催団体用フォールバック（旧項目）',
  'shoot_history.start_at': '開始日時。日付だけで登録できるよう任意',
  'shoot_history.end_at': '終了日時。日付だけで登録できるよう任意',
  'shoot_history.venue_cost': '場所代。0以上',
  'shoot_history.transport_cost': '交通費。0以上',
  'shoot_history.entry_cost': '参加費。0以上',
  'shoot_history.other_cost': 'その他の支出。0以上',
  'shoot_history.frame_count': '撮影枚数。0以上',
  'shoot_history.storage_path': '物理的な保管先のフォルダパス',
  'shoot_history.storage_label': 'ドライブ名・HDD ラベル',
  'shoot_history.storage_urls': '保存先ストレージの URL。**最大10個**',
  'shoot_history.storage_size_mb': 'データ容量（MB）。0以上',
  'shoot_history.backup_location': 'バックアップ先',
  'shoot_history.backed_up_at': 'バックアップ日時',
  'shoot_history.delivery_status': '納品の進行状態。`delivered` なら `delivered_at` 必須',
  'shoot_history.delivered_at': '納品日時',
  'shoot_history.delivery_url': '納品先の URL',
  'shoot_history.rating': '評価 1〜5',
  'shoot_history.memo': 'メモ',

  'shoot_history_models.shoot_history_id': '`shoot_history` 参照（cascade）',
  'shoot_history_models.model_id': '`models` 参照（restrict）',
  'shoot_history_models.costume': '衣装',
  'shoot_history_models.fee': 'モデル料。0以上',
  'shoot_history_models.payment_status': '支払い状態。過去分は基本的に支払い済み',
  'shoot_history_models.paid_at': '支払日時。思い出せない場合があるので必須にしない',
  'shoot_history_models.memo': 'メモ',

  'sync_tombstones.id': '連番。端末はこの id の続きから読む',
  'sync_tombstones.user_id': '削除された行の所有者（`auth.users`、cascade）',
  'sync_tombstones.table_name': '削除元のテーブル',
  'sync_tombstones.row_id': '削除された行の id',
  'sync_tombstones.deleted_at': '削除日時。90日を過ぎたものは掃除され、それより長くオフラインだった端末はフル再同期になる',

  'audit_logs.id': '連番',
  'audit_logs.user_id': '行の所有者（`auth.users`、cascade）',
  'audit_logs.table_name': '操作されたテーブル',
  'audit_logs.row_id': '操作された行の id',
  'audit_logs.operation': '`INSERT` / `UPDATE` / `DELETE`。論理削除は `UPDATE`',
  'audit_logs.old_data': '変更前の行。`INSERT` では NULL',
  'audit_logs.new_data': '変更後の行。`DELETE` では NULL',
  'audit_logs.actor_id': '操作者。ユーザーの JWT が無い接続では NULL',
  'audit_logs.occurred_at': 'サーバが受け取った時刻。オフラインの操作は同期された時刻になる',
}

/** 画面での項目名。画面に出ないカラムは書かない */
const SCREEN_LABELS = {
  'models.name': 'モデル名',
  'models.name_kana': '読み',
  'models.sns_accounts': 'モデルアカウント',
  'models.contact_method': '連絡手段',
  'models.contact_value': '連絡先',
  'models.affiliation': '所属（メイン）',
  'models.sub_affiliations': '所属（メイン以外）',
  'models.is_favorite': 'お気に入り',
  'models.status': 'ステータス',
  'models.notes': 'メモ',
  'model_former_names.name': '別名義',
  'model_former_names.name_kana': '別名義の読み',
  'organizers.name': '撮影会名',
  'organizers.name_kana': '読み',
  'organizers.base_location': '拠点',
  'organizers.url': 'URL',
  'organizers.sns_accounts': 'アカウント',
  'organizers.contact': '連絡先',
  'organizers.notes': 'メモ',
  'organizers.is_favorite': 'お気に入り',
  'venues.name': '撮影場所',
  'venues.kind': '種別',
  'venues.address': '住所',
  'venues.nearest_station': '最寄り駅',
  'venues.url': 'URL',
  'venues.hourly_rate': '1時間あたりの料金',
  'venues.notes': 'メモ',
  'venues.is_favorite': 'お気に入り',
  'wishlist_models.model_id': 'モデル名',
  'wishlist_models.event_name': '撮影会名',
  'wishlist_models.costume_options': '衣装系オプション',
  'wishlist_models.shooting_method_options': '撮影方法オプション',
  'sessions.title': '撮影会名',
  'sessions.session_date': '撮影日',
  'sessions.shoot_category': '撮影区分',
  'sessions.place_category': '場所区分',
  'sessions.meeting_point': '集合場所',
  'sessions.venue_name': '場所',
  'sessions.booking_opens_at': '予約開始日時',
  'sessions.booking_method': '予約方法',
  'sessions.booking_contact': '予約ページURL / メールアドレス / DM',
  'sessions.concept': '撮影コンセプト',
  'sessions.memo': 'メモ',
  'slots.start_at': '開始時刻',
  'slots.planned_minutes': '終了時刻（開始からの分）',
  'slots.booking_fee': '撮影料',
  'slots.costume_options': '衣装系オプション',
  'slots.shooting_method_options': '撮影方法オプション',
  'slots.fee_payment_timing': '支払方法',
  'slots.fee_payment_date': '支払日',
  'slots.meeting_at': '集合時刻',
  'slots.storage_urls': '保存先ストレージURL',
  'slot_models.model_id': 'モデル名',
  'shoot_history.shoot_date': '撮影日',
  'shoot_history.title': '撮影会名',
  'shoot_history.shoot_category': '撮影区分',
  'shoot_history.concept': '撮影コンセプト',
  'shoot_history.place_category': '場所区分',
  'shoot_history.venue_name': '場所',
  'shoot_history.storage_urls': 'ストレージのURL',
  'shoot_history.memo': 'メモ',
  'shoot_history_models.model_id': 'モデル名',
}

/** テーブルごとの補足（カラム表の下に箇条書きで出す） */
const TABLE_REMARKS = {
  models: [
    '撮影回数・累計支払額はカラムで持たない。`v_model_stats` から導出する',
    '一意: `(user_id, lower(name), lower(coalesce(affiliation, \'\')))`（論理削除を除く）。論理削除した組み合わせは再利用できる',
    '編集画面で撮影会マスタに無い所属を保存すると、撮影会マスタにも登録する（「フリー」は除く）',
  ],
  model_former_names: ['論理削除は持たない（物理削除 → tombstone で同期）', 'モデル名の入力では別名義を照合しない'],
  wishlist_models: ['アカウントはモデル自身の情報なので `models.sns_accounts` に置く', '論理削除は持たない（物理削除 → tombstone で同期）'],
  slot_models: ['`deleted_at` を持たない。`slots` の cascade で物理削除される（→ tombstone で同期）', 'モデルは `restrict`。撮影履歴のあるモデルは物理削除できないので `models.deleted_at` を使う'],
  sessions: ['予約情報入力では場所マスタ（`venues`）に登録しない（同名があれば紐づけるだけ）'],
  audit_logs: ['記録しないもの: SELECT、`sync_tombstones`、端末だけの操作（未同期の書き込み、テスト・デモアカウントの操作）', '保持期間は設けていない'],
}

/** ENUM の値の意味 */
const ENUM_NOTES = {
  model_status: '活動中 / 休止・引退 /（`ng` は使わない。休止・引退として扱う）',
  venue_kind: 'スタジオ / ロケ地',
  booking_method: '予約ページ / メール / DM',
  shoot_type: '個人撮影会 / 撮影会イベント / 依頼撮影 / 自主制作（旧項目）',
  shoot_category: '個撮 / 団体 / セッション / 大撮',
  place_category: '屋外 / スタジオ',
  fee_payment_timing: '当日 / 事前 / 支払済み（予約情報入力では「予約時」と表示）',
  session_status: '予約中 / 確定 / 完了 / 中止',
  timer_status: '待機 / 計測中 / 一時停止 / 終了',
  shoot_status: '予定 / 撮影済み / 中止 / 不参加',
  payment_status: '未払い / 支払い済み',
  delivery_status: '未着手 / セレクト中 / レタッチ中 / 納品済み',
}

const VIEW_NOTES = {
  v_shoot_history_all: '過去の撮影の統合（撮影済みの枠 + 遡及登録）。検索・一覧の基準。※アプリは端末側の同等処理（`lib/queries/archives.ts`）を使い、確定済みで撮影日時を過ぎた枠も含める',
  v_model_stats: 'モデルごとの撮影実績。2系統を合算済み',
  v_session_costs: '撮影イベントごとの支出合計',
  v_pending_deliveries: '未納品一覧。運用フロー分のみ（遡及登録分は未対応）',
}

// ── ここから下は DB のカタログから作る ─────────────────────────────────────

const src = readFileSync(`${DIR}/tests/schema.test.mjs`, 'utf8')
const stubStart = src.indexOf('const SUPABASE_STUB = `') + 'const SUPABASE_STUB = `'.length
const stub = src.slice(stubStart, src.indexOf('`', stubStart))

const db = await PGlite.create()
await db.exec(stub)
const migrations = readdirSync(`${DIR}/migrations`).filter((f) => f.endsWith('.sql')).sort()
for (const f of migrations) await db.exec(readFileSync(`${DIR}/migrations/${f}`, 'utf8'))
const q = async (sql) => (await db.query(sql)).rows

const tables = await q(`select c.relname as name, c.relrowsecurity as rls from pg_class c
  join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`)
const columns = await q(`select c.relname as table_name, a.attname as column_name, a.attnum,
    not a.attnotnull as nullable, pg_get_expr(d.adbin, d.adrelid) as def,
    format_type(a.atttypid, a.atttypmod) as type, col_description(a.attrelid, a.attnum) as comment
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
  order by c.relname, a.attnum`)
const constraints = await q(`select conrelid::regclass::text as table_name, conname, contype,
    pg_get_constraintdef(oid) as def
  from pg_constraint where connamespace = 'public'::regnamespace and conrelid <> 0 order by 1, 3, 2`)
const indexes = await q(`select i.tablename, i.indexname, i.indexdef from pg_indexes i
  where i.schemaname = 'public'
    and i.indexname not in (select conname from pg_constraint where contype in ('p', 'u'))
  order by 1, 2`)
const triggers = await q(`select event_object_table as table_name, trigger_name, action_timing,
    string_agg(event_manipulation, ' / ' order by event_manipulation) as events, action_statement
  from information_schema.triggers where trigger_schema = 'public' group by 1, 2, 3, 5 order by 1, 2`)
const policies = await q(`select tablename, policyname, cmd, roles::text as roles
  from pg_policies where schemaname = 'public' order by 1, 2`)
const enums = await q(`select t.typname, string_agg(e.enumlabel, ' / ' order by e.enumsortorder) as labels
  from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' group by t.typname order by 1`)
const viewColumns = await q(`select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols
  from information_schema.columns where table_schema = 'public'
    and table_name in (select viewname from pg_views where schemaname = 'public')
  group by 1 order by 1`)

const by = (rows, key) => rows.reduce((m, r) => m.set(r[key], [...(m.get(r[key]) ?? []), r]), new Map())
const colsBy = by(columns, 'table_name')
const consBy = by(constraints, 'table_name')
const idxBy = by(indexes, 'tablename')
const trgBy = by(triggers, 'table_name')
const polBy = by(policies, 'tablename')

const shortType = (t) =>
  t
    .replace('timestamp with time zone', 'timestamptz')
    .replace('character varying', 'varchar')
    .replace(/^public\./, '')
const shortDefault = (d) =>
  d == null ? '—' : `\`${d.replace(/::[\w. ]+(\[\])?/g, '').replace(/^'(.*)'$/, '$1')}\``
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

const known = new Set(TABLES.map(([t]) => t))
const missingTables = tables.map((t) => t.name).filter((t) => !known.has(t))
if (missingTables.length) console.warn(`⚠ TABLES に無いテーブル: ${missingTables.join(', ')}`)
const missingNotes = []

const lines = []
const w = (s = '') => lines.push(s)

w('# テーブル仕様')
w()
w('CamFlow のデータベース（Supabase / PostgreSQL）のテーブル定義。')
w()
w('> **このファイルは自動生成。直接編集しないこと。**')
w('> `npm run docs:tables`（`supabase/tools/gen-table-spec.mjs`）がマイグレーションを PGlite に流して作る。')
w('> 型・NULL・既定値・制約・インデックス・トリガ・RLS は DB のカタログから読むので、マイグレーションと必ず一致する。')
w('> 論理名・説明・画面の項目名を直すときは、生成スクリプトの中の表を直して作り直す。')
w()
w(`対象マイグレーション: \`${migrations[0]}\` 〜 \`${migrations.at(-1)}\`（${migrations.length}本）`)
w()
w('## 目次')
w()
w('| テーブル | 論理名 | 系統 | 論理削除 | 概要 |')
w('|---|---|---|---|---|')
for (const [name, label, group, summary] of TABLES) {
  const soft = (colsBy.get(name) ?? []).some((c) => c.column_name === 'deleted_at' && name !== 'sync_tombstones')
  w(`| [\`${name}\`](#${name}) | ${label} | ${group} | ${soft ? '○' : '—'} | ${cell(summary.split('。')[0])} |`)
}
w()
w('### 全体の約束')
w()
w('- 全テーブルに RLS を有効にし、本人（`auth.uid() = user_id`）の行だけを読み書きできる')
w('- 主キーはすべて uuid（`sync_tombstones` / `audit_logs` は連番）。端末で採番してからサーバに送る')
w('- `updated_at` はサーバの書き込みで `set_updated_at()` が必ず上書きする。競合はサーバに後から届いた書き込みが勝つ')
w('- 物理削除は `record_tombstone()` が `sync_tombstones` に記録し、端末に伝える')
w('- すべての操作は `record_audit_log()` が `audit_logs` に記録する。**テーブルを足したらこのトリガも付ける**')
w('- 撮影回数などの集計値はカラムで持たず、ビューから導出する')
w('- 端末側（IndexedDB / Dexie）は `sync_tombstones` と `audit_logs` 以外の11テーブルを同じ形でミラーし、各行に `_dirty`（未送信フラグ）を足して持つ')
w()
w('**データは2系統に分かれる。** 「過去の撮影」を扱う画面は、片方だけを見ると数が合わなくなる。')
w()
w('| 系統 | テーブル | 入口の画面 |')
w('|---|---|---|')
w('| 運用フロー | `sessions` / `slots` / `slot_models` | 予約情報入力 → 確定撮影情報入力 → 確定撮影情報 |')
w('| 遡及登録 | `shoot_history` / `shoot_history_models` | 過去撮影登録 |')
w()
w('```')
w('auth.users ─1:1─ profiles')
w('           ├─1:N─ models ─1:N─ model_former_names')
w('           │        └─1:N─ wishlist_models')
w('           ├─1:N─ organizers')
w('           ├─1:N─ venues')
w('           └─1:N─ sessions ─1:N─ slots ─1:N─ slot_models ─N:1─ models')
w('                    ├ venue_id     → venues')
w('                    └ organizer_id → organizers')
w()
w('shoot_history ─1:N─ shoot_history_models ─N:1─ models')
w('  ├ venue_id     → venues')
w('  └ organizer_id → organizers')
w('```')
w()

for (const [name, label, , summary] of TABLES) {
  const cols = colsBy.get(name)
  if (!cols) {
    console.warn(`⚠ DB に無いテーブル: ${name}`)
    continue
  }
  w('---')
  w()
  w(`## ${name}`)
  w()
  w(`**${label}**。${summary}`)
  w()
  w('| # | カラム | 型 | NULL | 既定値 | 画面の項目 | 説明 |')
  w('|---|---|---|---|---|---|---|')
  for (const c of cols) {
    const key = `${name}.${c.column_name}`
    const note = COLUMN_NOTES[key] ?? COMMON_NOTES[c.column_name] ?? c.comment ?? ''
    if (!note) missingNotes.push(key)
    w(`| ${c.attnum} | \`${c.column_name}\` | ${shortType(c.type)} | ${c.nullable ? '○' : '×'} | ${cell(shortDefault(c.def))} | ${SCREEN_LABELS[key] ?? ''} | ${cell(note)} |`)
  }
  w()
  for (const remark of TABLE_REMARKS[name] ?? []) w(`- ${remark}`)
  if (TABLE_REMARKS[name]) w()

  const cons = (consBy.get(name) ?? []).filter((c) => c.contype !== 'n')
  if (cons.length) {
    const kinds = { p: '主キー', u: '一意', f: '外部キー', c: 'CHECK', x: '排他' }
    w('<details><summary>制約</summary>')
    w()
    w('| 種類 | 名前 | 定義 |')
    w('|---|---|---|')
    for (const c of cons) w(`| ${kinds[c.contype] ?? c.contype} | \`${c.conname}\` | \`${cell(c.def)}\` |`)
    w()
    w('</details>')
    w()
  }
  const idx = idxBy.get(name) ?? []
  if (idx.length) {
    w('<details><summary>インデックス</summary>')
    w()
    w('| 名前 | 定義 |')
    w('|---|---|')
    for (const i of idx) {
      const def = i.indexdef.replace(/^CREATE (UNIQUE )?INDEX \S+ ON public\.\S+ USING /, (_, u) => (u ? 'UNIQUE ' : ''))
      w(`| \`${i.indexname}\` | \`${cell(def)}\` |`)
    }
    w()
    w('</details>')
    w()
  }
  const trg = trgBy.get(name) ?? []
  if (trg.length) {
    w('<details><summary>トリガ</summary>')
    w()
    w('| 名前 | タイミング | 関数 |')
    w('|---|---|---|')
    for (const t of trg) {
      const fn = t.action_statement.replace(/^EXECUTE FUNCTION (public\.)?/, '')
      w(`| \`${t.trigger_name}\` | ${t.action_timing} ${t.events} | \`${cell(fn)}\` |`)
    }
    w()
    w('</details>')
    w()
  }
  const pol = polBy.get(name) ?? []
  const rls = tables.find((t) => t.name === name)?.rls
  w(`RLS: ${rls ? '有効' : '**無効**'}${pol.length ? ` / ポリシー ${pol.map((p) => `\`${p.policyname}\`（${p.cmd}・${p.roles.replace(/[{}]/g, '')}）`).join('、')}` : ''}`)
  w()
}

w('---')
w()
w('## ENUM 型')
w()
w('| 型 | 値 | 意味（値の順） |')
w('|---|---|---|')
for (const e of enums) w(`| \`${e.typname}\` | ${e.labels.split(' / ').map((l) => `\`${l}\``).join(' / ')} | ${ENUM_NOTES[e.typname] ?? ''} |`)
w()
w('値の追加は `alter type ... add value` で行う。Postgres では ENUM の値を削除できない。')
w()
w('## ビュー')
w()
w('| ビュー | 用途 | カラム |')
w('|---|---|---|')
for (const v of viewColumns) w(`| \`${v.table_name}\` | ${VIEW_NOTES[v.table_name] ?? ''} | ${cell(v.cols)} |`)
w()

writeFileSync(OUT, lines.join('\n'))
console.log(`書き出し: ${OUT}（テーブル ${tables.length} / カラム ${columns.length}）`)
if (missingNotes.length) {
  console.warn(`⚠ 説明の無いカラム（${missingNotes.length}）: ${missingNotes.join(', ')}`)
  process.exitCode = 1
}
