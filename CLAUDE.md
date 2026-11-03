# CamFlow - 個人カメラマン向け撮影管理PWA

## 1. プロジェクト概要
- **目的**: 個人カメラマンの撮影ライフ（予約・スケジュール・現場タイマー・モデルマスター・データ管理）を最適化するPWA。
- **技術スタック**: Next.js (App Router), Supabase (Auth / PostgreSQL / Storage), Tailwind CSS.
- **開発方針**: まずはカメラマン機能単体で完成させ、将来的な運営・モデル機能の拡張に備えた設計とする。

---

## 2. デザイン & UIルール
- **ロゴ定義**:
  - 背景: ダークネイビー (`#0A1128`)
  - 要素: カメラアイコン ＋ 斜体（イタリック）の白文字「*CamFlow*」
  - ルール: 確定したアイコン形状やロゴデザインを勝手に変更しないこと。
- **レイアウト**:
  - PC / タブレット: 左固定サイドバーナビゲーション
  - スマホ (SP): ヘッダー ＋ ハンバーガーメニュー
- **メインカラー**: ネイビー (Navy)

---

## 3. Phase 1 実装機能一覧
- **撮影スケジュール・枠管理**: 予約日時、枠（1部〜N部）、場所、費用、タイマー状態の管理
- **モデルマスター管理**: 過去に撮影したモデルの情報、SNSリンク、メモ、撮影回数等の管理
- **現場用撮影タイマー**: セッション撮影対応のカウントダウンタイマー機能
- **データ・フォルダ構成管理**: 撮影後のストレージ構成や納品ステータス管理

---

## 4. データベース設計 (Supabase) ※実装済み
- **ユーザー管理**: `profiles` テーブルでユーザー基本情報を管理。
- **データモデル**:
  - `models`: モデル情報マスター
  - `venues`: スタジオ・ロケ地マスター
  - `sessions`: 撮影イベント・セッション単位の管理
  - `slots`: 各撮影枠（日時、タイマー、保管先など）。**現場タイマーの単位**
  - `slot_models`: 枠 × モデルの明細。**モデル料の支払いと納品の単位**
    （1枠に複数モデルが入りうるため、支払い・納品は枠ではなくこちらに持つ）
  - `sync_tombstones`: オフライン同期用の物理削除ログ
- 全テーブルに `user_id` を保持し、Row Level Security (RLS) を適切に設定する。
- **集計値はカラムで持たない**（撮影回数・累計支払額・総支出）。ビュー
  `v_model_stats` / `v_session_costs` / `v_pending_deliveries` から導出する。
- 詳細は `supabase/README.md` を参照。

---

## 5. アーキテクチャ上の約束（オフラインファースト）
- **読み取りは全て IndexedDB (Dexie) から行う。画面から Supabase を直接読まない。**
  そのためデータを持つ画面は全て Client Component になる。
- **書き込みは必ず `src/lib/sync/mutations.ts` を通す。** ローカル行と outbox を
  同一トランザクションで更新している。Supabase を直接叩くとオフライン中に変更が消える。
- **`supabase.auth` を触るのは `src/lib/auth/session.ts` だけ。**
  ログイン画面は未実装で、開発用アカウントによる自動サインインで代用している。
  RLS は有効なまま維持すること。
- 論理削除があるテーブル（venues / models / sessions / slots）は `softDeleteRow()` を使う。
- Service Worker は `serwist.config.mjs` + `npm run build:sw` で生成する。
  `@serwist/next` のプラグイン方式は Turbopack では**何も生成されない**ので使わない。
- 詳細は `README.md` を参照。

---

## 6. 開発コマンド
- **開発サーバー起動**: `npm run dev`
- **ビルド確認**: `npm run build`（Service Worker の生成を含む）
- **オフライン動作確認**: `npm run build && npm start`（dev では SW が無効）
- **テスト**: `npm test`（同期エンジン） / `npm run test:schema`（DBスキーマ）
- **型生成**: `npm run db:types`（要 Supabase ローカルスタック）

## 作業ルール
- 変更前に必ずgit commitすること