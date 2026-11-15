-- CamFlow: 撮影に紐づくモデルの「登録時の名義」
--
-- モデルは改名（活動名の変更）されうる。過去の撮影には、撮影を登録した時点の名前を残したいので、
-- 明細（slot_models / shoot_history_models）にその時点の名前を持たせる。
-- 既存の行は、今の名前で埋める（登録時の名前は残っていないため）。
-- null のときは現在のモデル名を使う（互換用）。

alter table public.slot_models
  add column model_name text;
alter table public.shoot_history_models
  add column model_name text;

update public.slot_models sm
   set model_name = m.name
  from public.models m
 where m.id = sm.model_id;

update public.shoot_history_models hm
   set model_name = m.name
  from public.models m
 where m.id = hm.model_id;

comment on column public.slot_models.model_name is
  '登録時のモデル名義。改名後も過去の撮影にはこの名前を出す。null なら models.name を使う';
comment on column public.shoot_history_models.model_name is
  '登録時のモデル名義。改名後も過去の撮影にはこの名前を出す。null なら models.name を使う';
