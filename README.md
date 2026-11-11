# CamFlow

個人カメラマン向け撮影管理 PWA。予約・枠管理、モデルマスター、現場タイマー、納品管理を扱う。

Next.js 16 (App Router) / React 19 / Tailwind v4 / Supabase / Dexie (IndexedDB) / Serwist。

## セットアップ

```bash
npm install
cp .env.example .env.local     # 接続情報を記入
```

Supabase はホスト側（Docker のある環境）で起動する:

```bash
supabase start
supabase db reset              # マイグレーション + シードデータ
```

`supabase start` が表示する `anon key` を `.env.local` の `NEXT_PUBLIC_SUPABASE_ANON_KEY` に貼る。

```bash
npm run db:types               # DB から TypeScript 型を再生成
npm run dev
```

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（Service Worker は無効） |
| `npm run build` | 本番ビルド + Service Worker 生成 |
| `npm start` | 本番サーバー。**オフライン動作の確認はこちら** |
| `npm test` | 同期エンジンの単体テスト |
| `npm run test:schema` | DB スキーマの検証（Docker 不要、PGlite 上で実行） |
| `npm run docs:tables` | `docs/テーブル仕様.md` をマイグレーションから作り直す（Docker 不要） |
| `npm run typecheck` / `npm run lint` | 型・Lint |

## スマホの実機で開く

開発サーバーはコンテナの中で動いているので、スマホからはそのままでは届かない。目的に合わせて次のどれかを使う。

| 方法 | URL | ホーム画面に追加（PWA） | 向いている用途 |
|---|---|---|---|
| A. 同じ Wi-Fi から開く | `http://<PC の IP>:3000` | できない（HTTP のため） | 画面の見た目と操作の確認 |
| B. VS Code のポート転送（公開） | `https://xxxx-3000.xxx.devtunnels.ms` | できる | 外出先からの確認、PWA の確認 |
| C. 本番環境に公開（Vercel など） | 公開した URL | できる | 実際に使う（[デプロイ手順](docs/デプロイ手順.md)） |

### A. 同じ Wi-Fi から開く（Windows + WSL の場合）

VS Code が転送したポートは Windows の `localhost` でしか待ち受けていないので、Windows 側で LAN からの接続を中継する。
**管理者の PowerShell** で実行する（`<PC の IP>` は `ipconfig` の Wi-Fi の IPv4 アドレス）。

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3000 connectaddress=127.0.0.1 connectport=3000
New-NetFirewallRule -DisplayName "CamFlow dev 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

スマホを同じ Wi-Fi につないで `http://<PC の IP>:3000` を開く。使い終わったら元に戻す。

```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=3000
Remove-NetFirewallRule -DisplayName "CamFlow dev 3000"
```

HTTP なので Service Worker は動かず、ホーム画面への追加とオフライン動作は確認できない
（`crypto.randomUUID` も使えないが、ID は `crypto.getRandomValues` で作るので登録はできる）。

### B. VS Code のポート転送（Dev Tunnels）

VS Code の「ポート」パネルで 3000 を右クリック →「ポートの表示範囲」→「パブリック」にすると、
`https://…devtunnels.ms` の URL が発行される（GitHub か Microsoft アカウントでのサインインが必要）。
HTTPS なので PWA も確認できる。**URL を知っていれば誰でも開けるので、確認が終わったら「プライベート」に戻す。**

### 開発サーバーの許可設定

開発サーバーは `localhost` 以外から開くと開発用のリソースを拒否し、画面が表示されない。
`next.config.ts` の `allowedDevOrigins` で、LAN の IP（`192.168.*.*` / `10.*.*.*` / `172.*.*.*`）と
`**.devtunnels.ms` を許可している。別のトンネルサービスを使う場合はここに足す。

### スマホから開くときの注意

- **Supabase の URL が `127.0.0.1` / `host.docker.internal` だとスマホからは届かない**（同期できない）。
  `test` / `test2026` のテストアカウント（サンプルデータ入りなら `show` / `show2026`）で画面を確認するか、Supabase をクラウドの開発用プロジェクトにする
- 開発サーバーでは Service Worker を登録しない。ホーム画面への追加とオフライン動作は
  `npm run build && npm start` で確認する（B か C の HTTPS が必要）

## アーキテクチャ

### ローカルファースト = クライアント SPA

**全ての読み取りは IndexedDB から行う。画面から Supabase を直接読まない。**
そのためサーバーコンポーネントでデータを描画できず、データを持つ画面は全て Client Component になる。
Next.js はルーティングとビルドのために使っている。

```
画面 ──読み取り──> Dexie (IndexedDB) <──同期──> Supabase
  └──書き込み──> lib/sync/mutations ──> ローカル行 + outbox（同一トランザクション）
```

| 場所 | 役割 |
|---|---|
| `src/lib/db/` | Dexie スキーマ。サーバの6テーブルをミラー + `_outbox` / `_meta` |
| `src/lib/sync/mutations.ts` | **書き込みの唯一の入口。** ローカル行と outbox を同一トランザクションで更新 |
| `src/lib/sync/pull.ts` | 差分取り込み。`updated_at` ウォーターマーク + tombstone |
| `src/lib/sync/push.ts` | outbox のフラッシュ。圧縮 → 直列送信 |
| `src/lib/sync/compact.ts` | outbox の圧縮（連続 update の畳み込み等） |
| `src/lib/sync/engine.ts` | push → pull のループ。オンライン復帰・タブ復帰・定期ポーリングで起動 |
| `src/lib/auth/session.ts` | **認証の唯一の境界。** ここ以外で `supabase.auth` を触らない |
| `supabase/` | マイグレーション・シード・スキーマ検証（[詳細](supabase/README.md)） |

### 守るべき約束

- **書き込みは必ず `lib/sync/mutations.ts` を通す。** Supabase を直接 insert/update すると
  オフライン中に消えるうえ、ローカルとキューがずれる
- **ローカル行と outbox は同一 Dexie トランザクションで更新する。** 分けると
  「ローカルだけ変わって永遠に送信されない変更」が生まれる
- **`_dirty = 1` の行を pull で上書きしない。** 未送信のローカル変更が消える
- **論理削除があるテーブル**（venues / models / sessions / slots）は `softDeleteRow()` を使う。
  `deleteRow()`（物理削除）は slot_models 用
- 一覧クエリは必ず `deleted_at is null` 相当で絞る

### 競合解決（LWW）

サーバーの `updated_at` が常に権威。`set_updated_at()` トリガがサーバー側の書き込みで必ず
上書きするため、クライアントの時計は信用しなくてよい。衝突時は「後からサーバーに届いた書き込みが勝つ」。

### 物理削除の同期

`updated_at` のウォーターマークでは物理削除を検知できない（行が消えているので差分に現れない）。
サーバー側の AFTER DELETE トリガが `sync_tombstones` に記録し、クライアントが id の続きから読む。
保持期間は90日で、それより長くオフラインだった端末はフル再同期に落ちる。

### 認証

**ログイン画面はまだ無い。** `.env.local` の開発用アカウントで自動サインインする。
RLS は有効なまま維持している（外すと本番に戻し忘れたとき全データが公開されるため）。
ログイン画面を足すときは `src/lib/auth/session.ts` の `signIn()` だけ差し替えればよく、
RLS もスキーマも触らない。

### PWA

Service Worker は `next.config.ts` のプラグインではなく **Serwist の configurator モード**
（`serwist.config.mjs` + `npm run build:sw`）で生成している。
Next.js 16 は Turbopack が既定だが `@serwist/next` のプラグインは webpack プラグインとして動くため、
**Turbopack では警告だけ出してビルドが成功し、SW が生成されない**。configurator モードは
`next build` の後段で SW を単体ビルドするのでバンドラに依存しない。

オフラインの cold start（SW 登録後にオフラインのままアプリを再起動）では、
アプリシェルの precache と `/~offline` への navigation fallback が効く。
この2つが無いと白画面になる。

## 検証済みの動作

- マイグレーション46項目（`npm run test:schema`）
- 同期エンジン31項目（`npm test`）— 書き込みの原子性、圧縮、再送の冪等性、
  `_dirty` 保護、tombstone 伝播、キーセットページング、フル再同期フォールバック
- ブラウザ実機 — Service Worker の登録、オフライン再読み込み、未キャッシュルートの fallback、
  SP のハンバーガーメニュー

## 次フェーズ

models / venues / sessions / slots / slot_models の CRUD 画面、現場タイマー UI、
納品ダッシュボード（`v_pending_deliveries` を使う）。
