-- CamFlow: 撮影会マスタの拠点
--
-- 撮影会マスタ画面に表示する。「東京」「関西」のように書くことが多いので自由入力。

alter table public.organizers
  add column base_location text;

comment on column public.organizers.base_location is '拠点（自由入力）';
