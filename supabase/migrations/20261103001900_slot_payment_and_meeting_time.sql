-- CamFlow: 撮影料の支払方法と集合時刻
--
-- どちらも確定撮影情報入力で入力する。セッション・大撮は slot_models を持たないため枠に置く。
-- slot_models.payment_status / payment_method はモデル料の支払い状態と手段（現金など）で、
-- 撮影料（slots.booking_fee）をいつ払うかを表すこの区分とは別物。

create type public.fee_payment_timing as enum (
  'on_the_day',  -- 当日
  'in_advance',  -- 事前
  'paid'         -- 支払済み
);

alter table public.slots
  add column fee_payment_timing public.fee_payment_timing,
  add column fee_payment_date   date,
  add column meeting_at         timestamptz;

-- 単純な「= 'in_advance'」だと支払方法が NULL のとき判定も NULL になり、CHECK を素通りする
alter table public.slots
  add constraint slots_fee_payment_date_only_in_advance
    check (fee_payment_date is null or fee_payment_timing is not distinct from 'in_advance');

comment on column public.slots.fee_payment_timing is '撮影料の支払方法（当日 / 事前 / 支払済み）。未選択は NULL';
comment on column public.slots.fee_payment_date is '撮影料の支払日。支払方法が事前のときだけ持つ';
comment on column public.slots.meeting_at is '集合時刻。撮影日と合成した日時';
