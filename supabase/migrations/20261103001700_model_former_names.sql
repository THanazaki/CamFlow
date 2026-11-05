-- CamFlow: モデルの旧名義
--
-- 改名前の名義を models の子テーブルとして持つ。models.name は現在の活動名のまま。
-- 1人のモデルが複数回改名することがあるので、配列ではなく行で持ち、名義ごとの使用期間を残す。

create table public.model_former_names (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  model_id   uuid        not null references public.models (id) on delete cascade,
  name       text        not null,
  -- 分かる場合のみ。覚えていないことが多いので必須にしない
  used_from  date,
  used_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint model_former_names_name_not_blank check (btrim(name) <> ''),
  constraint model_former_names_period check (
    used_from is null or used_until is null or used_until >= used_from
  )
);

comment on table public.model_former_names is 'モデルの旧名義。現在の活動名は models.name';

-- 同じモデルに同じ旧名義を二重に登録しない。別のモデルが同じ名前を使っていた場合は許す
create unique index model_former_names_model_id_name_key
  on public.model_former_names (model_id, lower(name));

-- 旧名義からモデルを引く
create index model_former_names_user_id_name_idx
  on public.model_former_names (user_id, lower(name));

create trigger model_former_names_set_updated_at
  before update on public.model_former_names
  for each row execute function public.set_updated_at();

create trigger model_former_names_record_tombstone
  after delete on public.model_former_names
  for each row execute function public.record_tombstone();

create trigger model_former_names
  after insert or update or delete on public.model_former_names
  for each row execute function public.record_audit_log();

-- 他ユーザーのモデルに旧名義を付ける書き込みを防ぐ
create or replace function public.assert_model_former_name_owner()
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

create trigger model_former_names_assert_owner
  before insert or update of model_id, user_id
  on public.model_former_names
  for each row execute function public.assert_model_former_name_owner();

alter table public.model_former_names enable row level security;

create policy model_former_names_owner_all on public.model_former_names
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.model_former_names to authenticated;
