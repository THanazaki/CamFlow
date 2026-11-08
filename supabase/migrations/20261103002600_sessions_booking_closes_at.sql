-- CamFlow: 予約情報入力に「予約終了日時」を追加する
--
-- 予約受付が締め切られる日時。任意項目で、分からなければ NULL のまま。

alter table public.sessions
  add column booking_closes_at timestamptz;

comment on column public.sessions.booking_closes_at is
  '予約受付の終了日時（任意）。予約開始日時とは別に持つ';
