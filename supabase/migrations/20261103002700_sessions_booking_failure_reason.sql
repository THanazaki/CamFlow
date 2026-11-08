-- CamFlow: 予約失敗の理由
--
-- 予約スケジュールで「予約失敗」にするときに入力する任意の理由。
-- 予約成功に変えたときは消す。

alter table public.sessions
  add column booking_failure_reason text;

comment on column public.sessions.booking_failure_reason is
  '予約失敗の理由（任意）。予約失敗にしたときだけ持つ';
