-- CamFlow: 保存先ストレージURL（最大3つ）
--
-- 既存の storage_path / storage_label / backup_location は NAS や外付け HDD の
-- 物理的な保管先を想定したもの。ここで足すのはクラウドストレージの URL で、
-- 1回の撮影を複数のサービス（原本・共有用・バックアップなど）に置くため配列にする。

alter table public.slots
  add column storage_urls text[] not null default '{}';

alter table public.slots
  add constraint slots_storage_urls_max_3
    check (array_length(storage_urls, 1) is null or array_length(storage_urls, 1) <= 3);

comment on column public.slots.storage_urls is
  '保存先ストレージの URL（最大3つ）。物理的な保管先は storage_path / storage_label';

-- 撮影データ登録の済/未を引く。撮影リマインドが使う
create index slots_awaiting_storage_idx
  on public.slots (user_id, start_at)
  where deleted_at is null
    and storage_path is null
    and cardinality(storage_urls) = 0;
