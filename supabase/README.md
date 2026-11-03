# CamFlow データベース

Phase 1 のスキーマ定義。設計の根拠は `/home/vscode/.claude/plans/pwa-db-tingly-shamir.md` を参照。

## 構成

```
auth.users ─1:1─ profiles
           ├─1:N─ models        モデルマスター
           ├─1:N─ venues        スタジオ・ロケ地マスター
           └─1:N─ sessions      撮影イベント（1日 / 1案件）
                    └─1:N─ slots        撮影枠（1部・2部…）= 現場タイマーの単位
                             └─1:N─ slot_models   枠 × モデル = 支払い・納品の単位
```

| ファイル | 内容 |
|---|---|
| `migrations/20261103000100_init_enums.sql` | ENUM 型 7種 |
| `migrations/20261103000200_init_tables.sql` | テーブル6件・制約・インデックス |
| `migrations/20261103000300_rls_and_triggers.sql` | トリガ・RLS・権限 |
| `migrations/20261103000400_views.sql` | 集計ビュー3件 |
| `seed.sql` | 開発用ダミーデータ |
| `tests/schema.test.mjs` | スキーマの自動検証（Docker 不要） |

## 設計上の約束

- **集計値はカラムで持たない。** 撮影回数・累計支払額・総支出はすべてビューから導出する（`v_model_stats` / `v_session_costs` / `v_pending_deliveries`）
- **金額はすべてカメラマン側の「支出」。** セッション単位の経費は `sessions` のカラム、モデル料は `slot_models.fee`
- **タイマーは絶対時刻で保存する。** `slots.timer_ends_at` を持ち、残り時間はクライアントで `timer_ends_at - now()` を計算する。一時停止中のみ `timer_remaining_sec` を使い、再開時に `timer_ends_at = now() + timer_remaining_sec` を書き直す。これで PWA のリロード・バックグラウンド復帰・別端末間で状態が一致する
- **写真の実データは保存しない。** `slots.storage_path` / `storage_label` / `storage_size_mb` / `backed_up_at` にメタ情報のみ。Supabase Storage を使うのは `models.avatar_url` だけ
- **論理削除。** `models` / `venues` / `sessions` / `slots` は `deleted_at`。一覧クエリは必ず `deleted_at is null` で絞る。一意制約も `where deleted_at is null` の部分インデックスなので、論理削除した名前・枠番号は再利用できる
- **所有者検証はトリガで行う。** `user_id` を冗長保持しているため、RLS だけでは「自分の user_id を入れつつ他人の `session_id` を参照する」書き込みを防げない（FK は所有者を見ない）。`assert_*_owner()` トリガが担保する

## 適用

### 本番 / ステージング（Supabase プロジェクト）

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push          # migrations/ を順に適用
```

### ローカル（Docker が必要）

```bash
npx supabase start
npx supabase db reset         # migrations + seed.sql を実行
```

`seed.sql` は auth ユーザーが居なければ `photographer@example.com` / `password123` を作成し、
既に居ればその先頭ユーザーにデータを紐づける。固定 UUID + `on conflict do nothing` なので再実行しても増殖しない。

### 型生成

```bash
# ローカルスタック使用時
npx supabase gen types typescript --local > ../src/types/database.ts
# リンク済みリモート使用時
npx supabase gen types typescript --linked > ../src/types/database.ts
```

## 検証

Docker を使わず、WASM 版 Postgres 17（PGlite）上でマイグレーション・制約・トリガ・ビュー・RLS を検証する。

```bash
npm i -D @electric-sql/pglite
node supabase/tests/schema.test.mjs
```

`auth` スキーマと `auth.uid()` をスタブして Supabase 環境を再現し、38項目を検査する:

- 4ファイルのマイグレーションが順に適用できること
- `auth.users` 追加で `profiles` が自動作成され、`display_name` がメタデータ → メール local-part の順にフォールバックすること
- `seed.sql` が通り、再実行しても件数が増えないこと
- `slots.end_at` が `start_at + planned_minutes + extended_minutes` に追従すること
- `updated_at` が update で進むこと
- 不正な書き込みが弾かれること — 枠番号重複 / 同一枠へのモデル二重登録 / タイマー状態の不整合 / `paid` なのに `paid_at` が null / `delivered` なのに `delivered_at` が null / 撮影履歴のあるモデルの物理削除 / 他ユーザーの親レコード参照 / モデル同名重複 / 負の金額
- タイマーの `idle → running → paused → running → finished → idle` が全て通ること
- ビューの集計値が手計算と一致すること
- RLS: 別ユーザーからは全テーブル・全ビューが0件、anon は参照不可、他人の `user_id` を指定した insert が `with check` で拒否されること

> PGlite では `pgcrypto` が `extensions` スキーマに無いため、テストは `seed.sql` の
> 「既存ユーザーに紐づける」分岐を通る。`auth.users` への新規作成分岐は
> `supabase db reset`（Docker）または実プロジェクトで確認する。

## 今後の拡張

| 要件が出たとき | 対応 |
|---|---|
| 経費を科目別に集計したい（確定申告など） | `expenses` テーブルに切り出す。`sessions` の `*_cost` カラムから移行 |
| クライアントからの売上・請求を管理したい | `invoices` テーブルを追加（Phase 1 は支出のみ） |
| 運営 / モデル側ログイン | `profiles.role` と `models.linked_user_id` を追加し、RLS ポリシーを拡張 |
| 枠ごとに納品フォルダを分けたい | `slot_models` に `storage_path` を追加（現在は枠単位） |
