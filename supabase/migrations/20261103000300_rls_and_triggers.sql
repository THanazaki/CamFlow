-- CamFlow Phase 1: トリガ関数と Row Level Security
--
-- すべての SECURITY DEFINER 関数は `set search_path = ''` を付け、
-- オブジェクトはスキーマ修飾する（Supabase の security advisor 準拠）。
-- pg_catalog は常に暗黙で検索されるため now() / btrim() 等はそのまま使える。

-- ============================================================
-- 1. 共通トリガ: updated_at の自動更新
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at    before update on public.profiles    for each row execute function public.set_updated_at();
create trigger models_set_updated_at      before update on public.models      for each row execute function public.set_updated_at();
create trigger venues_set_updated_at      before update on public.venues      for each row execute function public.set_updated_at();
create trigger sessions_set_updated_at    before update on public.sessions    for each row execute function public.set_updated_at();
create trigger slots_set_updated_at       before update on public.slots       for each row execute function public.set_updated_at();
create trigger slot_models_set_updated_at before update on public.slot_models for each row execute function public.set_updated_at();

-- ============================================================
-- 2. slots.end_at の維持
-- ============================================================
-- generated 列にできないためトリガで維持する
-- （timestamptz + interval は STABLE であり、生成列が要求する IMMUTABLE ではない）
create or replace function public.set_slot_end_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.end_at := new.start_at + make_interval(mins => new.planned_minutes + new.extended_minutes);
  return new;
end;
$$;

create trigger slots_set_end_at
  before insert or update of start_at, planned_minutes, extended_minutes
  on public.slots
  for each row execute function public.set_slot_end_at();

-- ============================================================
-- 3. 親レコードの所有者検証
-- ============================================================
-- user_id を冗長保持しているため、RLS だけでは「自分の user_id を入れつつ
-- 他人の session_id / slot_id / model_id を参照する」書き込みを防げない。
-- （FK は所有者を検証しない）そのためトリガで整合性を担保する。

create or replace function public.assert_session_venue_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.venue_id is not null and not exists (
    select 1 from public.venues v
    where v.id = new.venue_id and v.user_id = new.user_id
  ) then
    raise exception 'venues.id=% は user_id=% の所有ではありません', new.venue_id, new.user_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger sessions_assert_venue_owner
  before insert or update of venue_id, user_id
  on public.sessions
  for each row execute function public.assert_session_venue_owner();

create or replace function public.assert_slot_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.sessions s
    where s.id = new.session_id and s.user_id = new.user_id
  ) then
    raise exception 'sessions.id=% は user_id=% の所有ではありません', new.session_id, new.user_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger slots_assert_parent_owner
  before insert or update of session_id, user_id
  on public.slots
  for each row execute function public.assert_slot_parent_owner();

create or replace function public.assert_slot_model_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.slots sl
    where sl.id = new.slot_id and sl.user_id = new.user_id
  ) then
    raise exception 'slots.id=% は user_id=% の所有ではありません', new.slot_id, new.user_id
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.models m
    where m.id = new.model_id and m.user_id = new.user_id
  ) then
    raise exception 'models.id=% は user_id=% の所有ではありません', new.model_id, new.user_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger slot_models_assert_parent_owner
  before insert or update of slot_id, model_id, user_id
  on public.slot_models
  for each row execute function public.assert_slot_model_parent_owner();

-- ============================================================
-- 4. auth.users 作成時に profiles を自動作成
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Photographer'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 5. Row Level Security
-- ============================================================
-- 単一ユーザー（カメラマン）専用のため、全テーブル「所有者のみ全操作可」の1ポリシーに統一する。
-- 未ログイン（anon）はポリシーが存在しないため 0 行・書き込み不可になる。

alter table public.profiles    enable row level security;
alter table public.models      enable row level security;
alter table public.venues      enable row level security;
alter table public.sessions    enable row level security;
alter table public.slots       enable row level security;
alter table public.slot_models enable row level security;

create policy profiles_owner_all on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy models_owner_all on public.models
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy venues_owner_all on public.venues
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy sessions_owner_all on public.sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy slots_owner_all on public.slots
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy slot_models_owner_all on public.slot_models
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- auth.uid() を (select auth.uid()) で包むのは Supabase 推奨の最適化。
-- 行ごとの再評価ではなく InitPlan として1回だけ評価される。

-- ============================================================
-- 6. 権限
-- ============================================================
grant select, insert, update, delete on public.profiles    to authenticated;
grant select, insert, update, delete on public.models      to authenticated;
grant select, insert, update, delete on public.venues      to authenticated;
grant select, insert, update, delete on public.sessions    to authenticated;
grant select, insert, update, delete on public.slots       to authenticated;
grant select, insert, update, delete on public.slot_models to authenticated;
