-- CamFlow: 団体マスタの追加と、場所の種別（スタジオ / ロケ地）
--
-- これまで sessions.organizer（主催団体）はフリーテキストだったため、
-- 同じ団体を何度も手入力することになり表記ゆれも防げなかった。マスタ化する。
--
-- スタジオとロケ地は「一覧を分けたいだけ」で持つ項目は共通のため、
-- テーブルは venues のまま種別カラムで分ける。テーブルを割ると
-- sessions.venue_id の参照先が2つになり、結合も RLS も二重になる。

-- ============================================================
-- 1. 場所の種別
-- ============================================================
create type public.venue_kind as enum (
  'studio',   -- スタジオ
  'location'  -- ロケ地
);

alter table public.venues
  add column kind public.venue_kind not null default 'studio';

comment on column public.venues.kind is 'スタジオ / ロケ地。一覧を分けるための種別で、持つ項目は共通';

-- 種別ごとの一覧用
create index venues_user_id_kind_idx
  on public.venues (user_id, kind)
  where deleted_at is null;

-- ============================================================
-- 2. 団体マスタ（撮影会の主催団体）
-- ============================================================
create table public.organizers (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null,
  name_kana  text,
  url        text,                                     -- 公式サイト・予約ページ
  contact    text,                                     -- 連絡先（メール / DM / 電話）
  notes      text,                                     -- 支払い条件、入館ルールなど
  is_favorite boolean    not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint organizers_name_not_blank check (btrim(name) <> '')
);

comment on table public.organizers is '撮影会の主催団体マスタ。sessions.organizer_id から参照する';

create unique index organizers_user_id_name_key
  on public.organizers (user_id, lower(name))
  where deleted_at is null;

-- ============================================================
-- 3. sessions から団体を参照する
-- ============================================================
-- venue と同じ方針: マスタ参照を正としつつ、未登録の団体はテキストで書ける。
-- 表記ゆれを嫌ってマスタ必須にすると、思い出しながらの遡及登録が止まるため。
alter table public.sessions
  add column organizer_id uuid references public.organizers (id) on delete set null;

comment on column public.sessions.organizer is
  'マスタ未登録の主催団体用フォールバック。organizer_id があればアプリ側の表示はそちらを優先する';

create index sessions_organizer_id_idx
  on public.sessions (organizer_id)
  where organizer_id is not null;

-- ============================================================
-- 4. トリガ・RLS・権限
-- ============================================================
create trigger organizers_set_updated_at
  before update on public.organizers
  for each row execute function public.set_updated_at();

create trigger organizers_record_tombstone
  after delete on public.organizers
  for each row execute function public.record_tombstone();

-- sessions.venue_id と同じく、他ユーザーの団体を参照する書き込みを防ぐ
create or replace function public.assert_session_organizer_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organizer_id is not null and not exists (
    select 1 from public.organizers o
    where o.id = new.organizer_id and o.user_id = new.user_id
  ) then
    raise exception 'organizers.id=% は user_id=% の所有ではありません', new.organizer_id, new.user_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger sessions_assert_organizer_owner
  before insert or update of organizer_id, user_id
  on public.sessions
  for each row execute function public.assert_session_organizer_owner();

alter table public.organizers enable row level security;

create policy organizers_owner_all on public.organizers
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.organizers to authenticated;
