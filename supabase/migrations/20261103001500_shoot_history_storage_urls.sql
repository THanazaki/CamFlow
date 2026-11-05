-- CamFlow: 過去撮影登録の項目の見直し
--
-- 過去の撮影に集合場所は要らないので shoot_history から外し、
-- 保存先ストレージURL（最大10個）を持たせる。
--
-- slots.storage_urls の上限は3つのまま。

alter table public.shoot_history
  add column storage_urls text[] not null default '{}';

alter table public.shoot_history
  add constraint shoot_history_storage_urls_max_10
    check (cardinality(storage_urls) <= 10);

comment on column public.shoot_history.storage_urls is
  '保存先ストレージの URL（最大10個）。物理的な保管先は storage_path / storage_label';

-- ビューが参照しているので、meeting_point を外す前に差し替える。
-- meeting_point の列自体は運用フロー側で使うので残す
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
  se.meeting_point,
  sl.storage_urls
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
  null::text,
  h.storage_urls
from public.shoot_history h
where h.deleted_at is null;

alter table public.shoot_history
  drop column meeting_point;
