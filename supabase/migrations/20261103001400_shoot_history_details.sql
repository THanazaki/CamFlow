-- CamFlow: 過去撮影登録の入力項目
--
-- 過去撮影登録は確定撮影情報入力と同じ項目を入力するので、sessions にあって
-- shoot_history に無かったカラムを足す。

-- 導入前の行があるので、sessions と同じく NULL を許す
alter table public.shoot_history
  add column shoot_category public.shoot_category,
  add column concept text,
  add column place_category public.place_category,
  add column meeting_point text;

comment on column public.shoot_history.shoot_category is
  '撮影区分。session / large はモデルを指定しない';
comment on column public.shoot_history.place_category is
  '場所区分';
comment on column public.shoot_history.meeting_point is
  '集合場所。屋外のときだけ入力する';

-- 検索や統計はこのビューを見るので、追加した項目もここから引けるようにする。
-- create or replace view で足せるのは末尾だけ
create or replace view public.v_shoot_history_all
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
  sl.slot_no,
  se.shoot_category,
  se.concept,
  se.place_category,
  se.meeting_point
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
  null::int,
  h.shoot_category,
  h.concept,
  h.place_category,
  h.meeting_point
from public.shoot_history h
where h.deleted_at is null;
