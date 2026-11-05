-- CamFlow: DB 操作ログ
--
-- 業務テーブルへの INSERT / UPDATE / DELETE を行単位で記録する。
-- アプリ側ではなくトリガで取るのは、オフライン分の送信も、SQL Editor からの直接操作も、
-- cascade 削除も、経路によらず同じように残すため。
--
-- 記録の対象外:
--   - SELECT（Postgres のトリガでは取れない）
--   - sync_tombstones（削除の結果として作られる行で、元の DELETE がここに残る）
--   - audit_logs 自身

create table public.audit_logs (
  id          bigint      generated always as identity primary key,
  -- 行の所有者。アカウントを消すとログも一緒に消える
  user_id     uuid        not null references auth.users (id) on delete cascade,
  table_name  text        not null,
  row_id      uuid        not null,
  operation   text        not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,                                   -- INSERT では NULL
  new_data    jsonb,                                   -- DELETE では NULL
  -- 操作した本人。ユーザーの JWT が無い接続（SQL Editor や service role）では NULL
  actor_id    uuid,
  -- サーバが受け取った時刻。オフラインの操作は同期された時刻になる
  -- （端末で操作した時刻は new_data の updated_at を見る）
  occurred_at timestamptz not null default now()
);

comment on table public.audit_logs is
  '業務テーブルの変更履歴。トリガだけが書き込む追記専用のログで、端末には同期しない';

create index audit_logs_user_id_occurred_at_idx
  on public.audit_logs (user_id, occurred_at desc);

create index audit_logs_table_name_row_id_idx
  on public.audit_logs (table_name, row_id);

create or replace function public.record_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  -- profiles は id = user_id で user_id カラムを持たない
  v_owner uuid := coalesce(v_row ->> 'user_id', v_row ->> 'id')::uuid;
begin
  -- auth.users ごと消えた場合はログも cascade で消えるため記録しない
  if exists (select 1 from auth.users u where u.id = v_owner) then
    insert into public.audit_logs (user_id, table_name, row_id, operation, old_data, new_data, actor_id)
    values (
      v_owner,
      tg_table_name,
      (v_row ->> 'id')::uuid,
      tg_op,
      case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      case when tg_op = 'DELETE' then null else to_jsonb(new) end,
      auth.uid()
    );
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'venues', 'organizers', 'models', 'sessions',
    'slots', 'slot_models', 'shoot_history', 'shoot_history_models'
  ] loop
    execute format(
      'create trigger %1$I after insert or update or delete on public.%1$I
         for each row execute function public.record_audit_log()',
      t
    );
  end loop;
end;
$$;

-- 所有者が読むだけ。ログを書き換えられないよう、クライアントからの書き込みは一切不可
alter table public.audit_logs enable row level security;

create policy audit_logs_owner_select on public.audit_logs
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.audit_logs to authenticated;
