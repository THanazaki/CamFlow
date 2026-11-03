-- CamFlow Phase 1: 集計ビュー
--
-- 撮影回数・累計支払額・総支出といった集計値はカラムで持たない（必ず整合性が崩れるため）。
-- すべて security_invoker = true を付け、呼び出したユーザーの RLS が適用されるようにする
-- （付けないとビュー所有者権限で実行され、他人の行が見えてしまう）。

-- ============================================================
-- v_model_stats: モデルごとの撮影実績
-- ============================================================
-- モデル一覧・詳細画面の「撮影回数」「最終撮影日」「累計支払額」に使う。
-- 実績は shoot_status = 'shot' の枠のみを対象とする（予定の枠は数えない）。
create view public.v_model_stats
with (security_invoker = true) as
select
  m.id      as model_id,
  m.user_id,
  m.name    as model_name,
  count(distinct sm.slot_id)    filter (where sl.shoot_status = 'shot') as shot_count,
  count(distinct sl.session_id) filter (where sl.shoot_status = 'shot') as session_count,
  min(se.session_date)          filter (where sl.shoot_status = 'shot') as first_shot_date,
  max(se.session_date)          filter (where sl.shoot_status = 'shot') as last_shot_date,
  coalesce(sum(sm.fee + sm.extension_fee), 0)                           as total_fee,
  coalesce(sum(sm.fee + sm.extension_fee)
    filter (where sm.payment_status = 'paid'), 0)                       as total_paid,
  coalesce(sum(sm.fee + sm.extension_fee)
    filter (where sm.payment_status = 'unpaid'), 0)                     as total_unpaid
from public.models m
  left join public.slot_models sm on sm.model_id   = m.id
  left join public.slots       sl on sl.id         = sm.slot_id    and sl.deleted_at is null
  left join public.sessions    se on se.id         = sl.session_id and se.deleted_at is null
where m.deleted_at is null
group by m.id, m.user_id, m.name;

comment on view public.v_model_stats is 'モデルごとの撮影回数・最終撮影日・累計支払額。models にカラムを持たせず常にここから導出する';

-- ============================================================
-- v_session_costs: 撮影イベントごとの支出合計
-- ============================================================
create view public.v_session_costs
with (security_invoker = true) as
with slot_costs as (
  select
    sl.session_id,
    coalesce(sum(sl.booking_fee), 0) as booking_total,
    coalesce(sum(sm.model_total), 0) as model_total
  from public.slots sl
    left join (
      select slot_id, sum(fee + extension_fee) as model_total
      from public.slot_models
      group by slot_id
    ) sm on sm.slot_id = sl.id
  where sl.deleted_at is null
  group by sl.session_id
)
select
  se.id   as session_id,
  se.user_id,
  se.title,
  se.session_date,
  se.studio_cost,
  se.transport_cost,
  se.entry_cost,
  se.other_cost,
  coalesce(sc.booking_total, 0) as booking_total,
  coalesce(sc.model_total, 0)   as model_total,
  se.studio_cost + se.transport_cost + se.entry_cost + se.other_cost
    + coalesce(sc.booking_total, 0)
    + coalesce(sc.model_total, 0) as total_cost
from public.sessions se
  left join slot_costs sc on sc.session_id = se.id
where se.deleted_at is null;

comment on view public.v_session_costs is 'セッション単位の経費 + 枠料金 + モデル料の総支出。月次集計はこのビューを session_date で集約する';

-- ============================================================
-- v_pending_deliveries: 未納品の TODO 一覧
-- ============================================================
-- ダッシュボードの「納品待ち」表示に使う。days_overdue が正の値なら期限超過。
create view public.v_pending_deliveries
with (security_invoker = true) as
select
  sm.id    as slot_model_id,
  sm.user_id,
  se.id    as session_id,
  se.title as session_title,
  se.session_date,
  sl.id    as slot_id,
  sl.slot_no,
  sl.label as slot_label,
  sl.start_at,
  sl.storage_path,
  m.id     as model_id,
  m.name   as model_name,
  m.avatar_url as model_avatar_url,
  sm.delivery_status,
  sm.delivery_deadline,
  sm.delivery_method,
  sm.delivery_url,
  sm.selected_count,
  sm.delivered_count,
  case
    when sm.delivery_deadline is null then null
    else current_date - sm.delivery_deadline
  end as days_overdue
from public.slot_models sm
  join public.slots    sl on sl.id = sm.slot_id    and sl.deleted_at is null
  join public.sessions se on se.id = sl.session_id and se.deleted_at is null
  join public.models   m  on m.id  = sm.model_id
where sm.delivery_status <> 'delivered'
  and sl.shoot_status = 'shot';

comment on view public.v_pending_deliveries is '撮影済みかつ未納品の明細。days_overdue > 0 が期限超過';

-- ============================================================
-- 権限
-- ============================================================
grant select on public.v_model_stats        to authenticated;
grant select on public.v_session_costs      to authenticated;
grant select on public.v_pending_deliveries to authenticated;
