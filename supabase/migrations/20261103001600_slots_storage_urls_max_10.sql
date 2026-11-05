-- CamFlow: 確定撮影情報の保存先ストレージURLを最大10個にする
--
-- 過去撮影登録（shoot_history.storage_urls）と上限をそろえる。

alter table public.slots
  drop constraint slots_storage_urls_max_3;

alter table public.slots
  add constraint slots_storage_urls_max_10
    check (cardinality(storage_urls) <= 10);

comment on column public.slots.storage_urls is
  '保存先ストレージの URL（最大10個）。物理的な保管先は storage_path / storage_label';
