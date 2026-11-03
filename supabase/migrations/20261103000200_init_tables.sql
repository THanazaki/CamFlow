-- CamFlow Phase 1: テーブル定義
--
-- 構成:
--   auth.users ─1:1─ profiles
--              ├─1:N─ models
--              ├─1:N─ venues
--              └─1:N─ sessions ─1:N─ slots ─1:N─ slot_models
--
-- 方針:
--   * 全テーブルに user_id を保持（slots / slot_models は冗長保持）し、JOIN 無しで RLS を判定する
--   * 金額は numeric(10,0)（日本円・小数なし）。すべてカメラマン側の「支出」
--   * 撮影回数・累計支払額などの集計値はカラムで持たず、ビューで導出する（0004_views.sql）
--   * 履歴を壊さないため、マスター系と sessions / slots は deleted_at による論理削除

-- ============================================================
-- 1. profiles（ユーザー基本情報）
-- ============================================================
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  display_name          text        not null,
  avatar_url            text,
  -- 現場タイマーの初期値 / 枠作成時の既定の長さ（分）
  default_timer_minutes int         not null default 30 check (default_timer_minutes between 1 and 600),
  default_slot_minutes  int         not null default 30 check (default_slot_minutes between 1 and 600),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint profiles_display_name_not_blank check (btrim(display_name) <> '')
);

comment on table public.profiles is 'カメラマン（ログインユーザー）の基本情報と既定値';

-- ============================================================
-- 2. models（モデルマスター）
-- ============================================================
create table public.models (
  id             uuid         primary key default gen_random_uuid(),
  user_id        uuid         not null references auth.users (id) on delete cascade,
  name           text         not null,
  name_kana      text,                                      -- 五十音ソート・検索用
  avatar_url     text,                                      -- Supabase Storage を使うのはここだけ
  sns_links      jsonb        not null default '{}'::jsonb,  -- {"x":"...","instagram":"...","tiktok":"..."}
  contact_method text,                                      -- DM / LINE / メール
  contact_value  text,
  affiliation    text,                                      -- 事務所 / フリー / 所属撮影会
  tags           text[]       not null default '{}',         -- ポートレート / コスプレ / ロケ など
  rating         smallint     check (rating between 1 and 5),
  is_favorite    boolean      not null default false,
  status         public.model_status not null default 'active',
  notes          text,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now(),
  deleted_at     timestamptz,
  constraint models_name_not_blank check (btrim(name) <> ''),
  constraint models_sns_links_is_object check (jsonb_typeof(sns_links) = 'object')
);

comment on table public.models is '過去・今後撮影するモデルのマスター。撮影回数は v_model_stats で導出する';
comment on column public.models.sns_links is 'SNS 種別をキーにした URL マップ。種別が増えてもスキーマ変更不要';

-- 同名モデルの二重登録を防ぐ（論理削除済みの名前は再利用できる）
create unique index models_user_id_name_key
  on public.models (user_id, lower(name))
  where deleted_at is null;

create index models_user_id_name_kana_idx on public.models (user_id, name_kana);
create index models_tags_idx               on public.models using gin (tags);

-- ============================================================
-- 3. venues（スタジオ・ロケ地マスター）
-- ============================================================
create table public.venues (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  name            text        not null,
  address         text,
  url             text,                                    -- 予約ページ
  nearest_station text,
  hourly_rate     numeric(10,0) check (hourly_rate >= 0),   -- スタジオ代の自動計算用
  notes           text,                                    -- 機材 / 電源 / NG 事項
  is_favorite     boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint venues_name_not_blank check (btrim(name) <> '')
);

comment on table public.venues is '繰り返し使うスタジオ・ロケ地のマスター';

create unique index venues_user_id_name_key
  on public.venues (user_id, lower(name))
  where deleted_at is null;

-- ============================================================
-- 4. sessions（撮影イベント = 1日 / 1案件）
-- ============================================================
create table public.sessions (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  title           text        not null,
  session_date    date        not null,                     -- カレンダー表示の軸
  shoot_type      public.shoot_type     not null default 'solo',
  status          public.session_status not null default 'planned',
  venue_id        uuid        references public.venues (id) on delete set null,
  venue_name      text,                                     -- マスター未登録の場所用フォールバック
  organizer       text,                                     -- 撮影会主催者・イベント名
  start_at        timestamptz,                              -- イベント全体の時間帯
  end_at          timestamptz,
  -- 支出（枠に紐づかないもの）
  studio_cost     numeric(10,0) not null default 0 check (studio_cost    >= 0),
  transport_cost  numeric(10,0) not null default 0 check (transport_cost >= 0),
  entry_cost      numeric(10,0) not null default 0 check (entry_cost     >= 0),
  other_cost      numeric(10,0) not null default 0 check (other_cost     >= 0),
  other_cost_note text,
  weather_note    text,                                     -- ロケ撮影の天候メモ
  memo            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint sessions_title_not_blank check (btrim(title) <> ''),
  constraint sessions_time_range check (
    start_at is null or end_at is null or end_at > start_at
  )
);

comment on table public.sessions is '撮影イベント1件。枠（slots）の親';
comment on column public.sessions.venue_name is 'venue_id が設定されていればアプリ側の表示は venues.name を優先する';

create index sessions_user_id_date_idx on public.sessions (user_id, session_date desc);
create index sessions_venue_id_idx     on public.sessions (venue_id) where venue_id is not null;

-- ============================================================
-- 5. slots（撮影枠 = 1部・2部…／現場タイマーの単位）
-- ============================================================
create table public.slots (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  session_id          uuid        not null references public.sessions (id) on delete cascade,
  slot_no             int         not null check (slot_no > 0),   -- 1部 = 1
  label               text,                                      -- 「1部」「延長」など表示名の上書き
  start_at            timestamptz not null,
  planned_minutes     int         not null default 30 check (planned_minutes > 0),
  -- 終了予定時刻。トリガ set_slot_end_at() が維持する。
  -- （generated 列にできない: timestamptz + interval は STABLE で IMMUTABLE ではないため）
  end_at              timestamptz,

  -- --- 現場タイマー ---
  -- 残り秒数をカウントダウン保存するのではなく timer_ends_at（絶対時刻）を保持する。
  -- これにより PWA のリロード・バックグラウンド復帰・別端末間で状態が一致する。
  timer_status        public.timer_status not null default 'idle',
  timer_started_at    timestamptz,                               -- 実際の開始時刻
  timer_ends_at       timestamptz,                               -- 終了予定の絶対時刻
  timer_remaining_sec int         check (timer_remaining_sec >= 0), -- 一時停止中の残秒数
  timer_finished_at   timestamptz,                               -- 実際の終了時刻
  extended_minutes    int         not null default 0 check (extended_minutes >= 0),

  -- --- 支出 ---
  booking_fee         numeric(10,0) not null default 0 check (booking_fee >= 0), -- モデル個別でない枠料金

  -- --- 撮影内容・データ保管 ---
  theme               text,
  shoot_status        public.shoot_status not null default 'planned',
  frame_count         int         check (frame_count >= 0),       -- 撮影枚数
  storage_path        text,                                      -- 保管先フォルダパス
  storage_label       text,                                      -- ドライブ名・HDD ラベル（物理特定用）
  storage_size_mb     bigint      check (storage_size_mb >= 0),
  backup_location     text,
  backed_up_at        timestamptz,                               -- null = 未バックアップ
  rating              smallint    check (rating between 1 and 5),
  memo                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  -- タイマー状態の整合性をDB側で担保する（クライアントのバグで不整合な状態を書けないように）
  constraint slots_timer_consistency check (
    case timer_status
      when 'idle'     then timer_started_at is null and timer_ends_at is null and timer_finished_at is null
      when 'running'  then timer_started_at is not null and timer_ends_at is not null
      when 'paused'   then timer_started_at is not null and timer_remaining_sec is not null
      when 'finished' then timer_started_at is not null
    end
  )
);

comment on table  public.slots is '撮影枠。現場タイマーの単位。支払い・納品はモデル単位なので slot_models 側に持つ';
comment on column public.slots.timer_ends_at is '終了予定の絶対時刻。残り時間はクライアントで timer_ends_at - now() を計算する';
comment on column public.slots.timer_remaining_sec is '一時停止時の残秒数。再開時に timer_ends_at = now() + timer_remaining_sec を書き直す';

-- 枠番号の重複防止（論理削除済みの番号は再利用できる）
create unique index slots_session_id_slot_no_key
  on public.slots (session_id, slot_no)
  where deleted_at is null;

create index slots_user_id_start_at_idx on public.slots (user_id, start_at);
create index slots_session_id_idx       on public.slots (session_id);

-- 進行中タイマーの即時復元用（アプリ起動時に1クエリで復帰させる）
create index slots_active_timer_idx
  on public.slots (user_id, timer_status)
  where timer_status in ('running', 'paused');

-- ============================================================
-- 6. slot_models（枠 × モデル明細／支払い・納品の単位）
-- ============================================================
create table public.slot_models (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  slot_id           uuid        not null references public.slots (id)  on delete cascade,
  -- 撮影履歴を守るため restrict。モデルを消したいときは models.deleted_at を使う
  model_id          uuid        not null references public.models (id) on delete restrict,
  costume           text,                                   -- 衣装（モデルごとに異なる）

  -- --- 支払い（カメラマン → モデル） ---
  fee               numeric(10,0) not null default 0 check (fee >= 0),
  extension_fee     numeric(10,0) not null default 0 check (extension_fee >= 0),
  payment_status    public.payment_status not null default 'unpaid',
  paid_at           date,
  payment_method    text,                                   -- 現金 / PayPay / 銀行振込

  -- --- 納品 ---
  delivery_status   public.delivery_status not null default 'not_started',
  delivery_deadline date,                                   -- ダッシュボードのアラート対象
  delivered_at      timestamptz,
  delivery_method   text,                                   -- Google ドライブ / ギガファイル便 / AirDrop
  delivery_url      text,
  selected_count    int         check (selected_count  >= 0),
  delivered_count   int         check (delivered_count >= 0),
  memo              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint slot_models_slot_id_model_id_key unique (slot_id, model_id),
  constraint slot_models_paid_at_required
    check (payment_status  <> 'paid'      or paid_at      is not null),
  constraint slot_models_delivered_at_required
    check (delivery_status <> 'delivered' or delivered_at is not null)
);

comment on table public.slot_models is '枠に参加したモデルの明細。1枠に複数モデルが入りうるため、モデル料の支払いと納品はこのテーブルが単位になる';

create index slot_models_slot_id_idx  on public.slot_models (slot_id);
create index slot_models_model_id_idx on public.slot_models (model_id);

-- 納品アラート用の部分インデックス（未納品だけを期限順に引く）
create index slot_models_pending_delivery_idx
  on public.slot_models (user_id, delivery_deadline)
  where delivery_status <> 'delivered';

-- 未払いモデル料の一覧用
create index slot_models_unpaid_idx
  on public.slot_models (user_id, slot_id)
  where payment_status = 'unpaid';
