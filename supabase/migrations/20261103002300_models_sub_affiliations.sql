-- CamFlow: モデルの所属を複数持つ
--
-- 同じモデルが複数の撮影会に出ることがある。メインの所属は models.affiliation のまま、
-- それ以外の所属をこの配列に持つ。予約などの入力では、撮影会名がどちらかの所属と一致すれば
-- 同じモデルとして扱う（一意制約はメインの所属だけで張っている）。

alter table public.models
  add column sub_affiliations text[] not null default '{}';

comment on column public.models.sub_affiliations is 'メイン（affiliation）以外の所属';
