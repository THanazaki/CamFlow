-- CamFlow: 撮影履歴（遡及登録した過去の撮影）
--
-- 位置づけ:
--   sessions / slots / slot_models は「予約 → 確定 → 撮影 → データ登録」の運用フロー用。
--   shoot_history は、そのフローを通していない過去の撮影を後から取り込むためのもの。
--   画面でいうと「過去撮影データ管理 > 撮影情報登録」の格納先。
--
-- 分けたことの代償:
--   「過去の撮影」が2か所に存在することになる。統計や検索が片方しか見ないと
--   必ず数が合わなくなるため、下部の v_shoot_history_all で統合する。
--   **画面は個別テーブルではなく必ずこのビューを見ること。**
--
-- 遡及登録なのでタイマーは持たない（その場で計測していないため）。
-- 枠番号も持たない（1行 = 1回の撮影）。

-- ============================================================
-- 1. 撮影履歴
-- ============================================================
create table public.shoot_history (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  shoot_date      date        not null,
  title           text        not null,
  shoot_type      public.shoot_type not null default 'solo',

  -- 場所・主催（マスタ参照を正としつつ、未登録はテキストで書ける）
  venue_id        uuid        references public.venues (id) on delete set null,
  venue_name      text,
  organizer_id    uuid        references public.organizers (id) on delete set null,
  organizer       text,

  -- 分かる場合のみ。日付だけで登録できるよう nullable
  start_at        timestamptz,
  end_at          timestamptz,

  -- 支出（モデル料は shoot_history_models 側）
  venue_cost      numeric(10,0) not null default 0 check (venue_cost     >= 0),
  transport_cost  numeric(10,0) not null default 0 check (transport_cost >= 0),
  entry_cost      numeric(10,0) not null default 0 check (entry_cost     >= 0),
  other_cost      numeric(10,0) not null default 0 check (other_cost     >= 0),

  -- 撮影データの保管先
  frame_count     int         check (frame_count     >= 0),
  storage_path    text,
  storage_label   text,
  storage_size_mb bigint      check (storage_size_mb >= 0),
  backup_location text,
  backed_up_at    timestamptz,

  -- 納品
  delivery_status public.delivery_status not null default 'not_started',
  delivered_at    timestamptz,
  delivery_url    text,

  rating          smallint    check (rating between 1 and 5),
  memo            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint shoot_history_title_not_blank check (btrim(title) <> ''),
  constraint shoot_history_time_range check (
    start_at is null or end_at is null or end_at > start_at
  ),
  constraint shoot_history_delivered_at_required
    check (delivery_status <> 'delivered' or delivered_at is not null)
);

comment on table public.shoot_history is
  '運用フロー（sessions/slots）を通していない過去の撮影。1行 = 1回の撮影。統計・検索は v_shoot_history_all を使うこと';

create index shoot_history_user_id_date_idx
  on public.shoot_history (user_id, shoot_date desc)
  where deleted_at is null;
create index shoot_history_venue_id_idx
  on public.shoot_history (venue_id) where venue_id is not null;
create index shoot_history_organizer_id_idx
  on public.shoot_history (organizer_id) where organizer_id is not null;

-- ============================================================
-- 2. 参加モデル
-- ============================================================
-- 1回の撮影に複数モデルが入りうるのは運用フローと同じ（slot_models と対応）
create table public.shoot_history_models (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  shoot_history_id uuid        not null references public.shoot_history (id) on delete cascade,
  model_id         uuid        not null references public.models (id) on delete restrict,
  costume          text,
  fee              numeric(10,0) not null default 0 check (fee >= 0),
  -- 過去分は基本的に支払い済みだが、未払いのまま記録したい場合もあるので持たせる。
  -- これが無いと撮影料積算で遡及登録分だけ支払い状態が欠ける
  payment_status   public.payment_status not null default 'paid',
  paid_at          date,
  memo             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint shoot_history_models_unique unique (shoot_history_id, model_id)
);

comment on table public.shoot_history_models is '撮影履歴に参加したモデル。モデル料はここが単位';

create index shoot_history_models_history_idx on public.shoot_history_models (shoot_history_id);
create index shoot_history_models_model_idx   on public.shoot_history_models (model_id);

-- ============================================================
-- 3. トリガ
-- ============================================================
create trigger shoot_history_set_updated_at
  before update on public.shoot_history
  for each row execute function public.set_updated_at();
create trigger shoot_history_models_set_updated_at
  before update on public.shoot_history_models
  for each row execute function public.set_updated_at();

create trigger shoot_history_record_tombstone
  after delete on public.shoot_history
  for each row execute function public.record_tombstone();
create trigger shoot_history_models_record_tombstone
  after delete on public.shoot_history_models
  for each row execute function public.record_tombstone();

-- 他ユーザーのマスタを参照する書き込みを防ぐ
create or replace function public.assert_shoot_history_refs_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.venue_id is not null and not exists (
    select 1 from public.venues v where v.id = new.venue_id and v.user_id = new.user_id
  ) then
    raise exception 'venues.id=% は user_id=% の所有ではありません', new.venue_id, new.user_id
      using errcode = 'check_violation';
  end if;

  if new.organizer_id is not null and not exists (
    select 1 from public.organizers o where o.id = new.organizer_id and o.user_id = new.user_id
  ) then
    raise exception 'organizers.id=% は user_id=% の所有ではありません', new.organizer_id, new.user_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger shoot_history_assert_refs_owner
  before insert or update of venue_id, organizer_id, user_id
  on public.shoot_history
  for each row execute function public.assert_shoot_history_refs_owner();

create or replace function public.assert_shoot_history_model_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.shoot_history h
    where h.id = new.shoot_history_id and h.user_id = new.user_id
  ) then
    raise exception 'shoot_history.id=% は user_id=% の所有ではありません', new.shoot_history_id, new.user_id
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.models m where m.id = new.model_id and m.user_id = new.user_id
  ) then
    raise exception 'models.id=% は user_id=% の所有ではありません', new.model_id, new.user_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger shoot_history_models_assert_owner
  before insert or update of shoot_history_id, model_id, user_id
  on public.shoot_history_models
  for each row execute function public.assert_shoot_history_model_owner();

-- ============================================================
-- 4. RLS
-- ============================================================
alter table public.shoot_history        enable row level security;
alter table public.shoot_history_models enable row level security;

create policy shoot_history_owner_all on public.shoot_history
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy shoot_history_models_owner_all on public.shoot_history_models
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.shoot_history        to authenticated;
grant select, insert, update, delete on public.shoot_history_models to authenticated;

-- ============================================================
-- 5. 統合ビュー — 「過去の撮影」はここだけを見る
-- ============================================================
-- 運用フローで撮影済みになった枠と、遡及登録した履歴を同じ形にそろえる。
-- source / source_id で元がどちらか分かるので、編集画面への導線はそれで分岐する。
create view public.v_shoot_history_all
with (security_invoker = true) as
select
  'slot'::text                                   as source,
  sl.id                                          as source_id,
  sl.user_id,
  se.session_date                                as shoot_date,
  se.title,
  se.shoot_type,
  se.venue_id,
  se.venue_name,
  se.organizer_id,
  se.organizer,
  sl.start_at,
  sl.end_at,
  sl.frame_count,
  sl.storage_path,
  sl.storage_label,
  sl.storage_size_mb,
  sl.backup_location,
  sl.backed_up_at,
  sl.rating,
  sl.memo,
  se.id                                          as session_id,
  sl.slot_no
from public.slots sl
  join public.sessions se on se.id = sl.session_id and se.deleted_at is null
where sl.deleted_at is null
  and sl.shoot_status = 'shot'

union all

select
  'history'::text,
  h.id,
  h.user_id,
  h.shoot_date,
  h.title,
  h.shoot_type,
  h.venue_id,
  h.venue_name,
  h.organizer_id,
  h.organizer,
  h.start_at,
  h.end_at,
  h.frame_count,
  h.storage_path,
  h.storage_label,
  h.storage_size_mb,
  h.backup_location,
  h.backed_up_at,
  h.rating,
  h.memo,
  null::uuid,
  null::int
from public.shoot_history h
where h.deleted_at is null;

comment on view public.v_shoot_history_all is
  '過去の撮影の統合ビュー。運用フロー（撮影済みの slots）と遡及登録（shoot_history）を合わせたもの。統計・検索は必ずこれを使う';

grant select on public.v_shoot_history_all to authenticated;

-- ============================================================
-- 6. モデル実績も統合する
-- ============================================================
-- v_model_stats は slot_models しか見ていなかったため、このままでは遡及登録分が
-- 撮影回数にも支払額にも反映されない。両方を合わせた実績に差し替える。
create or replace view public.v_model_stats
with (security_invoker = true) as
with shoots as (
  -- 運用フロー側。実績は撮影済みの枠だけを数える（予定の枠は数えない）
  select
    sm.model_id,
    se.session_date                         as shoot_date,
    sl.session_id::text                     as group_key,
    sm.fee + sm.extension_fee               as fee,
    sm.payment_status,
    sl.shoot_status = 'shot'                as is_shot
  from public.slot_models sm
    join public.slots    sl on sl.id = sm.slot_id    and sl.deleted_at is null
    join public.sessions se on se.id = sl.session_id and se.deleted_at is null

  union all

  -- 遡及登録側。登録された時点で実績
  select
    hm.model_id,
    h.shoot_date,
    'history:' || h.id::text,
    hm.fee,
    hm.payment_status,
    true
  from public.shoot_history_models hm
    join public.shoot_history h on h.id = hm.shoot_history_id and h.deleted_at is null
)
select
  m.id      as model_id,
  m.user_id,
  m.name    as model_name,
  count(*)                      filter (where s.is_shot) as shot_count,
  count(distinct s.group_key)   filter (where s.is_shot) as session_count,
  min(s.shoot_date)             filter (where s.is_shot) as first_shot_date,
  max(s.shoot_date)             filter (where s.is_shot) as last_shot_date,
  coalesce(sum(s.fee), 0)                                              as total_fee,
  coalesce(sum(s.fee) filter (where s.payment_status = 'paid'), 0)     as total_paid,
  coalesce(sum(s.fee) filter (where s.payment_status = 'unpaid'), 0)   as total_unpaid
from public.models m
  left join shoots s on s.model_id = m.id
where m.deleted_at is null
group by m.id, m.user_id, m.name;

comment on view public.v_model_stats is
  'モデルごとの撮影実績。運用フロー（撮影済みの枠）と遡及登録（shoot_history）の両方を合算する';
