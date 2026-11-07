-- CamFlow: モデルアカウントの複数登録と、別名義の読み
--
-- 1. models.sns_accounts
--    sns_links は SNS の種類ごとに1つしか持てない（{"x":"...","instagram":"..."}）。
--    同じ種類のアカウントを複数持つモデル（本垢・撮影会用など）がいるため、
--    {"service":"x","value":"@example"} の配列で持つ。並び順は登録した順。
--    以後の読み書きはこちらを使う。sns_links は古い端末のローカル行を読むための互換用に残す。
-- 2. model_former_names.name_kana
--    別名義の読み。モデル名の読み（models.name_kana）と同じく任意。

alter table public.models
  add column sns_accounts jsonb not null default '[]'::jsonb,
  add constraint models_sns_accounts_is_array check (jsonb_typeof(sns_accounts) = 'array');

comment on column public.models.sns_accounts is
  'モデルアカウント。[{"service":"x"|"instagram"|"other"|…,"value":"URL か @ハンドル"}]。sns_links は互換用';

-- 既存の sns_links を移す。X → Instagram → それ以外（キー順）の順に並べる
update public.models m
set sns_accounts = coalesce((
  select jsonb_agg(
           jsonb_build_object('service', e.key, 'value', btrim(e.value #>> '{}'))
           order by case e.key when 'x' then 0 when 'instagram' then 1 else 2 end, e.key
         )
  from jsonb_each(m.sns_links) e
  where jsonb_typeof(e.value) = 'string' and btrim(e.value #>> '{}') <> ''
), '[]'::jsonb)
where m.sns_links <> '{}'::jsonb;

alter table public.model_former_names
  add column name_kana text;

comment on column public.model_former_names.name_kana is '別名義の読み';
