-- CamFlow: 撮影会のアカウント（X / Instagram など）
--
-- モデルの sns_accounts と同じ形で持つ。{"service":"x","value":"@example"} の配列で、並び順は登録した順。
-- 同じ種類のアカウントを複数持てる。

alter table public.organizers
  add column sns_accounts jsonb not null default '[]'::jsonb,
  add constraint organizers_sns_accounts_is_array check (jsonb_typeof(sns_accounts) = 'array');

comment on column public.organizers.sns_accounts is
  '撮影会のアカウント。[{"service":"x"|"instagram"|"other","value":"URL か @ハンドル"}]';
