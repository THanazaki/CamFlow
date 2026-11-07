-- CamFlow: 撮影希望モデル
--
-- いつか撮りたいモデルの控え。予約（sessions）になる前の段階なので日付や枠は持たない。
-- モデルのアカウント（X / Instagram）はモデル自身の情報なので models.sns_links に置き、ここでは持たない。

create table public.wishlist_models (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references auth.users (id) on delete cascade,
  model_id                uuid        not null references public.models (id) on delete cascade,
  event_name              text,
  costume_options         text,
  shooting_method_options text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.wishlist_models is '撮影希望モデル。同じモデルを撮影会やオプションを変えて複数登録できる';

create index wishlist_models_user_id_idx  on public.wishlist_models (user_id);
create index wishlist_models_model_id_idx on public.wishlist_models (model_id);

create trigger wishlist_models_set_updated_at
  before update on public.wishlist_models
  for each row execute function public.set_updated_at();

create trigger wishlist_models_record_tombstone
  after delete on public.wishlist_models
  for each row execute function public.record_tombstone();

create trigger wishlist_models_record_audit_log
  after insert or update or delete on public.wishlist_models
  for each row execute function public.record_audit_log();

-- 他ユーザーのモデルを希望に登録する書き込みを防ぐ
create or replace function public.assert_wishlist_model_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create trigger wishlist_models_assert_owner
  before insert or update of model_id, user_id
  on public.wishlist_models
  for each row execute function public.assert_wishlist_model_owner();

alter table public.wishlist_models enable row level security;

create policy wishlist_models_owner_all on public.wishlist_models
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.wishlist_models to authenticated;
