-- CamFlow: 予約情報入力で使う項目
--
-- 個人撮影会では「予約受付が始まる日時」が決まっていて、その時刻にアクセスして
-- 枠を取りに行く。撮影日とは別の軸なので専用のカラムを持たせる。
-- 予約スケジュール画面はこの日時までのカウントダウンを出す。

alter table public.sessions
  -- 予約受付の開始日時。撮影日（session_date）とは別物
  add column booking_opens_at timestamptz,
  -- 予約ページの URL。団体やスタジオのトップではなく、その回の申込ページ
  add column booking_url      text,
  -- 撮影コンセプト。枠ごとのテーマは slots.theme、ここは予約単位
  add column concept          text;

comment on column public.sessions.booking_opens_at is
  '予約受付の開始日時。予約スケジュール画面はこの時刻までの残り時間を出す';
comment on column public.sessions.booking_url is '予約ページの URL（その回の申込ページ）';
comment on column public.sessions.concept is '撮影コンセプト。枠ごとのテーマは slots.theme';

-- 予約スケジュール: 可否未決の予約を受付開始が近い順に引く
create index sessions_booking_opens_at_idx
  on public.sessions (user_id, booking_opens_at)
  where deleted_at is null and booking_opens_at is not null;
