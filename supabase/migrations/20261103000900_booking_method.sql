-- CamFlow: 予約の申込方法
--
-- 予約の取り方は撮影会によって違う（申込ページ / メール / SNS の DM）。
-- 申込先は方法によって URL だったりメールアドレスだったりアカウント名だったりするので、
-- booking_url という名前では実態と合わなくなる。booking_contact に改名する。

create type public.booking_method as enum (
  'page',   -- 予約ページ
  'email',  -- メール
  'dm'      -- SNS の DM
);

alter table public.sessions
  add column booking_method public.booking_method;

-- URL とは限らないので名前を変える（予約ページなら URL、メールならアドレス、DM ならアカウント）
alter table public.sessions
  rename column booking_url to booking_contact;

comment on column public.sessions.booking_method is '予約の申込方法。booking_contact の中身がこれで決まる';
comment on column public.sessions.booking_contact is
  '申込先。booking_method が page なら URL、email ならメールアドレス、dm ならアカウント名';
