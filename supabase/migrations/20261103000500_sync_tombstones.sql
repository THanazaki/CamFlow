-- CamFlow: オフライン同期用の削除記録（tombstone）
--
-- なぜ必要か:
--   クライアントは updated_at のウォーターマークで差分を取得するが、
--   物理削除された行は「もう存在しない」ため差分に現れない。
--   特に slot_models は deleted_at を持たず、slots の cascade で物理削除されるため、
--   これが無いとオフライン端末に削除済みの行が残り続ける。
--
-- 論理削除（deleted_at）は通常の差分取得で拾えるのでここには記録しない。
-- 物理削除のみを AFTER DELETE トリガで記録する（cascade による削除も拾える）。

create table public.sync_tombstones (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  table_name text        not null,
  row_id     uuid        not null,
  deleted_at timestamptz not null default now()
);

comment on table public.sync_tombstones is
  'オフライン同期用の物理削除ログ。クライアントは deleted_at > lastPulledAt で引き、該当行をローカルから消す';

-- クライアントの差分取得クエリ（user_id 一致 + deleted_at 昇順）用
create index sync_tombstones_user_id_deleted_at_idx
  on public.sync_tombstones (user_id, deleted_at, id);

-- ============================================================
-- 削除記録トリガ
-- ============================================================
create or replace function public.record_tombstone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.users ごと消えた場合は tombstone も cascade で消えるため記録しない
  if exists (select 1 from auth.users u where u.id = old.user_id) then
    insert into public.sync_tombstones (user_id, table_name, row_id)
    values (old.user_id, tg_table_name, old.id);
  end if;
  return old;
end;
$$;

create trigger models_record_tombstone
  after delete on public.models      for each row execute function public.record_tombstone();
create trigger venues_record_tombstone
  after delete on public.venues      for each row execute function public.record_tombstone();
create trigger sessions_record_tombstone
  after delete on public.sessions    for each row execute function public.record_tombstone();
create trigger slots_record_tombstone
  after delete on public.slots       for each row execute function public.record_tombstone();
create trigger slot_models_record_tombstone
  after delete on public.slot_models for each row execute function public.record_tombstone();

-- profiles は id = user_id のため専用関数を使う
create or replace function public.record_profile_tombstone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from auth.users u where u.id = old.id) then
    insert into public.sync_tombstones (user_id, table_name, row_id)
    values (old.id, tg_table_name, old.id);
  end if;
  return old;
end;
$$;

create trigger profiles_record_tombstone
  after delete on public.profiles for each row execute function public.record_profile_tombstone();

-- ============================================================
-- RLS: 所有者が読むだけ。クライアントからの書き込みは一切不可
-- ============================================================
alter table public.sync_tombstones enable row level security;

create policy sync_tombstones_owner_select on public.sync_tombstones
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.sync_tombstones to authenticated;

-- ============================================================
-- 保持期間（90日）
-- ============================================================
-- クライアントの lastPulledAt がこの期間より古い場合は差分では追いつけないため、
-- 同期エンジン側でフル再同期にフォールバックすること。
create or replace function public.purge_sync_tombstones(p_retention interval default interval '90 days')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.sync_tombstones where deleted_at < now() - p_retention;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.purge_sync_tombstones is
  '90日より古い削除記録を掃除する。pg_cron で日次実行するか、運用で定期的に呼ぶ';

revoke execute on function public.purge_sync_tombstones(interval) from public, anon, authenticated;
