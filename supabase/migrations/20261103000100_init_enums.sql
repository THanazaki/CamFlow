-- CamFlow Phase 1: ENUM 型定義
--
-- 値を追加するときは `alter type <name> add value '<new>';` を新しいマイグレーションで行う。
-- （ENUM からの値削除は Postgres では不可。削除が必要な場合は型を作り直す）

-- モデルの状態
create type public.model_status as enum (
  'active',    -- 稼働中
  'inactive',  -- 休止・引退
  'ng'         -- 今後撮影しない
);

-- 撮影イベントの種別
create type public.shoot_type as enum (
  'solo',      -- 個人撮影会
  'event',     -- 撮影会イベント
  'client',    -- 依頼撮影
  'personal'   -- 自主制作
);

-- 撮影イベントの進行状態
create type public.session_status as enum (
  'planned',   -- 予定（仮）
  'confirmed', -- 確定
  'done',      -- 終了
  'cancelled'  -- 中止
);

-- 現場タイマーの状態
create type public.timer_status as enum (
  'idle',      -- 未開始
  'running',   -- 計測中
  'paused',    -- 一時停止
  'finished'   -- 終了
);

-- 撮影枠の実施結果
create type public.shoot_status as enum (
  'planned',   -- 撮影前
  'shot',      -- 撮影済み
  'cancelled', -- 中止
  'no_show'    -- モデル不参加
);

-- 支払い（カメラマン → モデル）の状態
create type public.payment_status as enum (
  'unpaid',    -- 未払い
  'paid'       -- 支払い済み
);

-- 納品の進行状態
create type public.delivery_status as enum (
  'not_started', -- 未着手
  'selecting',   -- セレクト中
  'retouching',  -- レタッチ中
  'delivered'    -- 納品済み
);
