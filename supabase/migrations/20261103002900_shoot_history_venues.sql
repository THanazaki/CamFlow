-- CamFlow: 過去撮影の追加ロケ地
--
-- 屋外の撮影は、1回の撮影で複数のロケ地を回ることがある。
-- 1か所目は従来どおり shoot_history.venue_id / venue_name に持ち（v_shoot_history_all や検索はこれを見る）、
-- 2か所目以降をこの子テーブルに持つ。venues への参照なので、マスタで名前を変えると表示も変わる。

create table public.shoot_history_venues (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  shoot_history_id uuid        not null references public.shoot_history (id) on delete cascade,
  venue_id         uuid        not null references public.venues (id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint shoot_history_venues_unique unique (shoot_history_id, venue_id)
);

comment on table public.shoot_history_venues is
  '過去撮影の追加ロケ地（2か所目以降）。1か所目は shoot_history.venue_id';

create index shoot_history_venues_history_idx on public.shoot_history_venues (shoot_history_id);
create index shoot_history_venues_venue_idx   on public.shoot_history_venues (venue_id);

create trigger shoot_history_venues_set_updated_at
  before update on public.shoot_history_venues
  for each row execute function public.set_updated_at();

create trigger shoot_history_venues_record_tombstone
  after delete on public.shoot_history_venues
  for each row execute function public.record_tombstone();

create trigger shoot_history_venues
  after insert or update or delete on public.shoot_history_venues
  for each row execute function public.record_audit_log();

-- 他ユーザーの撮影履歴・場所を参照する書き込みを防ぐ
create or replace function public.assert_shoot_history_venue_owner()
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
    select 1 from public.venues v where v.id = new.venue_id and v.user_id = new.user_id
  ) then
    raise exception 'venues.id=% は user_id=% の所有ではありません', new.venue_id, new.user_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger shoot_history_venues_assert_owner
  before insert or update of shoot_history_id, venue_id, user_id
  on public.shoot_history_venues
  for each row execute function public.assert_shoot_history_venue_owner();

alter table public.shoot_history_venues enable row level security;

create policy shoot_history_venues_owner_all on public.shoot_history_venues
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.shoot_history_venues to authenticated;
