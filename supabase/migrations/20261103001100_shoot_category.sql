-- CamFlow: 撮影区分
--
-- 予約情報入力・確定撮影情報入力で選ぶ区分。
-- 既存の shoot_type（個人撮影会 / イベント / 依頼 / 自主制作）とは分類の軸が違うので別に持つ。
--
-- セッションと大撮はモデルを指定しないため、slot_models の行を持たない。

create type public.shoot_category as enum (
  'solo',     -- 個撮
  'group',    -- 団体
  'session',  -- セッション
  'large'     -- 大撮
);

-- 区分の導入前に作られた行は NULL のまま残す（画面では個撮として扱う）
alter table public.sessions
  add column shoot_category public.shoot_category;

comment on column public.sessions.shoot_category is
  '撮影区分。session / large はモデルを指定しない';
