# CamFlow - 個人カメラマン向け撮影管理PWA

## 1. プロジェクト概要
- **目的**: 個人カメラマンの撮影ライフ（予約・スケジュール・現場タイマー・モデルマスタ・データ管理）を最適化するPWA。
- **技術スタック**: Next.js 16 (App Router) / React 19 / Tailwind v4 / Supabase (Auth / PostgreSQL / Storage) / Dexie (IndexedDB) / Serwist。
- **開発方針**: まずはカメラマン機能単体で完成させ、将来的な運営・モデル機能の拡張に備えた設計とする。
- **現状**: 認証・同期基盤と、予約管理／撮影管理の画面まで実装済み。

---

## 2. デザイン & UIルール
- **ロゴ定義**:
  - 背景: ダークネイビー (`#0A1128`)
  - 要素: カメラアイコン ＋ 斜体（イタリック）の白文字「*CamFlow*」
  - ルール: 確定したアイコン形状やロゴデザインを勝手に変更しないこと。
- **レイアウト**:
  - PC / タブレット: 左固定サイドバーナビゲーション（幅 240px）
  - スマホ (SP): ヘッダー ＋ ハンバーガーメニュー
- **メインカラー**: ネイビー (Navy)。`globals.css` に `--color-navy-50` 〜 `950` を定義。
- サイドバーは幅が狭いので、メニューのラベルを増やすときは**折り返さないか実機で確認すること**。

---

## 3. メニュー構成

```
ダッシュボード              /
予約管理 ▾
  予約情報入力              /reservations/new
  予約スケジュール          /reservations/schedule
  撮影希望モデル登録        /reservations/wishlist
  予約成否分析              /reservations/analysis
撮影管理 ▾
  確定撮影情報入力          /shoots/confirm
  撮影情報                  /shoots/info
過去撮影データ管理 ▾
  過去撮影登録              /archives/new
  撮影情報検索              /archives/search
統計情報 ▾
  予約可否情報              /stats/availability
  過去撮影情報              /stats/history
  撮影料積算                /stats/fees
マスタ管理 ▾
  モデルマスタ              /masters/models
  撮影会マスタ              /masters/organizers
  ロケ地・スタジオマスタ    /masters/venues
設定 ▾
  通知設定                  /settings/notifications
  アカウント設定            /settings/account
  使い方ガイド              /settings/guide
```

- 定義は `src/components/layout/nav-items.ts`。
- **サブメニューを持つ項目は親自体がページを持たない**（開閉トグル）。
  `/reservations` `/shoots` `/archives` `/stats` `/masters` `/settings` に対応するページは作らない。
- 未実装の画面は「準備中」としてグレーアウトし、リンクにしない。
- **画面の操作を変えたら `src/app/settings/guide/page.tsx`（使い方ガイド）の説明も直すこと。**

### 業務フロー

```
予約情報入力 → 確定撮影情報入力 →（撮影）→ 撮影情報 → 統計情報
                                                ▲
                          このフローに乗っていない過去の撮影だけを
                          「過去撮影登録」で後から取り込む
```

**「撮影情報」と「過去撮影登録」は別物。**
前者は既存レコードの**更新**（確定済みの撮影に保管先を登録）、
後者は**新規作成**（フローを通していない過去の撮影を遡及登録）。

---

## 4. データベース設計 (Supabase) ※実装済み

データは**運用フロー**と**遡及登録**の2系統に分かれる。

| 系統 | テーブル | 入口 |
|---|---|---|
| 運用フロー | `sessions` / `slots` / `slot_models` | 予約情報入力 → 確定撮影情報入力 → 撮影情報 |
| 遡及登録 | `shoot_history` / `shoot_history_models` | 過去撮影登録 |

### マスタ（4種）
- `models`: モデルマスタ
  - `model_former_names`: モデルの旧名義（子テーブル）。現在の活動名は `models.name`
- `venues`: スタジオ / ロケ地マスタ。**`kind` カラムで区別**し、テーブルは分けていない
  （持つ項目が共通なため。分けると `sessions.venue_id` の参照先が2つになる）
- `organizers`: 団体マスタ（撮影会の主催団体）
- `profiles`: ユーザー基本情報・既定値

### トランザクション
- `sessions`: 撮影イベント（1日 / 1案件）
- `slots`: 各撮影枠（日時、タイマー、保管先など）。**現場タイマーの単位**
- `slot_models`: 枠 × モデルの明細。**モデル料の支払いと納品の単位**
  （1枠に複数モデルが入りうるため、支払い・納品は枠ではなくこちらに持つ）
- `shoot_history` / `shoot_history_models`: 遡及登録した過去の撮影。1行 = 1回の撮影。
  タイマー系カラムと枠番号は持たない
- `wishlist_models`: 撮影希望モデル。予約になる前の控えで、日付や枠は持たない
- `sync_tombstones`: オフライン同期用の物理削除ログ
- `audit_logs`: DB 操作ログ。トリガだけが書き込み、端末には同期しない

### 守るべきルール
- 全テーブルに `user_id` を保持し、Row Level Security (RLS) を適切に設定する。
- **テーブルを追加したら `record_audit_log()` のトリガも付けること。** 付け忘れると
  `npm run test:schema` が失敗する。
- **集計値はカラムで持たない**（撮影回数・累計支払額・総支出）。ビューから導出する。
- **「過去の撮影」を扱う画面は個別テーブルではなく必ずビューを見ること。**
  2系統に分かれているため、片方しか見ないと数が合わなくなる。
  撮影情報検索（`src/lib/queries/archives.ts`）だけは、撮影済みへ変更する画面がまだ無いため、
  確定済みで撮影日時を過ぎた枠も含めている（`docs/仕様書.md` 8.11.1）。

| ビュー | 用途 |
|---|---|
| `v_shoot_history_all` | 過去の撮影の統合（撮影済みの枠＋遡及登録）。検索・一覧はこれ |
| `v_model_stats` | モデルの撮影実績。2系統を合算済み |
| `v_session_costs` | 撮影イベントごとの支出合計 |
| `v_pending_deliveries` | 未納品一覧。**運用フロー分のみ。遡及登録分は未対応** |

- 詳細は `docs/仕様書.md` と `supabase/README.md` を参照。

---

## 5. アーキテクチャ上の約束（オフラインファースト）
- **読み取りは全て IndexedDB (Dexie) から行う。画面から Supabase を直接読まない。**
  そのためデータを持つ画面は全て Client Component になる。
- **読み取りクエリは `src/lib/queries/` に置く。画面で `db.slots` などを直接組み立てない。**
  サーバ側のビュー（`v_shoot_history_all` など）は Dexie に同期されず画面から引けないため、
  「ビュー相当」をここに用意する。画面側で組むと同じ結合ロジックが散らばってズレる。
- **書き込みは必ず `src/lib/sync/mutations.ts` を通す。** ローカル行と outbox を
  同一トランザクションで更新している。Supabase を直接叩くとオフライン中に変更が消える。
- **`supabase.auth` を触るのは `src/lib/auth/session.ts` だけ。**
  メール＋パスワードのアカウント制。サインインするまで `AppShell` がアプリを出さない。
  RLS は有効なまま維持すること。
- **サインイン／新規登録は `/api/auth` を経由する。** reCAPTCHA の秘密鍵は
  サーバにしか置けないため。Supabase Auth の CAPTCHA 連携は hCaptcha と
  Turnstile のみで reCAPTCHA に非対応なので、自前で検証している。
  なおこれで守れるのはフォームだけで、Supabase の認証エンドポイント自体は守れない。
- **ユーザーが変わったら IndexedDB を空にすること**（`switchUser` / `signOut`）。
  RLS が守るのはサーバだけで、ローカルの中身は端末を使う誰でも読める。
- 開発中は `test` / `test` でサインインできる（Supabase 不要）。同期はされず
  データはその端末にだけ残る。本番ビルドでは API の分岐も画面の導線も無効。
- 論理削除があるテーブル（`venues` / `organizers` / `models` / `sessions` / `slots` /
  `shoot_history`）は `softDeleteRow()` を使う。一覧は `deleted_at is null` で絞る。
- テーブルを追加したら `SYNC_TABLES`（`src/lib/db/types.ts`）と Dexie のストア定義にも
  足すこと。足さないと同期対象から漏れる。
- **`createRow` には NOT NULL + 既定値のカラムを明示的に渡すこと**（`storage_urls: []` など）。
  省くとローカル行だけ `undefined` になり、pull で入るサーバ行（`[]` や `null`）と形が
  食い違う。`deleted_at` は `SOFT_DELETABLE` を見て自動で埋めているが、それ以外は手動。
- Service Worker は `serwist.config.mjs` + `npm run build:sw` で生成する。
  `@serwist/next` のプラグイン方式は Turbopack では**何も生成されない**ので使わない。
- 詳細は `README.md`（アーキテクチャ）と `docs/仕様書.md`（全仕様）を参照。

---

## 6. 開発コマンド
- **開発サーバー起動**: `npm run dev`
- **ビルド確認**: `npm run build`（Service Worker の生成を含む）
- **オフライン動作確認**: `npm run build && npm start`（dev では SW が無効）
- **テスト**: `npm test`（単体テスト149項目） / `npm run test:schema`（DBスキーマ122項目）
- **型生成**: `npm run db:types`（要 Supabase ローカルスタック）

### 環境メモ
- このコンテナには **Docker が無い**ため `supabase start` は使えない。
  Supabase はホスト側で起動する。`npm run test:schema` は PGlite 上で動くので Docker 不要。
- devcontainer からホストの Supabase に繋ぐ場合、`127.0.0.1` では届かない。
  `host.docker.internal` を使う（`.env.example` 参照）。
- `npm run dev` はバインドマウント上でファイル変更を取りこぼすことがある。
  反映されないときは dev サーバーを再起動する。

## 作業ルール
- 変更前に必ずgit commitすること
- 変更が終わったら、そのつど git commit すること（push は依頼があるときだけ）
