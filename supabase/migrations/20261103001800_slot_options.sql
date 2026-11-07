-- CamFlow: 確定撮影情報のオプション
--
-- 衣装系と撮影方法のオプションを枠に持たせる。選択肢はまだ決まっていないので自由入力。
-- セッション・大撮は slot_models を持たないため、枠の単位にする。
-- 撮影料は既存の slots.booking_fee を使う（v_session_costs の集計に含まれる）。

alter table public.slots
  add column costume_options         text,
  add column shooting_method_options text;

comment on column public.slots.costume_options is '衣装系オプション（自由入力）';
comment on column public.slots.shooting_method_options is '撮影方法オプション（自由入力）';
