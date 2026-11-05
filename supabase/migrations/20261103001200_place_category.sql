-- CamFlow: 場所区分と集合場所
--
-- 確定撮影情報入力で選ぶ区分。venues.kind（スタジオ / ロケ地）は屋内のロケ地も含むため、
-- 「屋外かどうか」を表すこの区分とは別に持つ。

create type public.place_category as enum (
  'outdoor',  -- 屋外
  'studio'    -- スタジオ
);

-- 予約の段階では入力しないので、確定前の行と導入前の行は NULL
alter table public.sessions
  add column place_category public.place_category,
  add column meeting_point text;

comment on column public.sessions.place_category is
  '場所区分。確定撮影情報入力で選ぶ';
comment on column public.sessions.meeting_point is
  '集合場所。屋外のときだけ入力する';
