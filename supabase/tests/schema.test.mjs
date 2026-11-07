import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'

const DIR = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const db = await PGlite.create()

let pass = 0, fail = 0
const ok = (name, extra = '') => { pass++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`) }
const bad = (name, err) => { fail++; console.log(`  ✗ ${name}\n      ${String(err).split('\n')[0]}`) }

// ── Supabase 環境のスタブ（auth スキーマ / ロール / auth.uid()） ──────────
await db.exec(`
  create role anon;
  create role authenticated;
  create schema if not exists extensions;
  create schema auth;
  create table auth.users (
    instance_id uuid,
    id uuid primary key,
    aud text, role text, email text, encrypted_password text,
    email_confirmed_at timestamptz,
    created_at timestamptz default now(), updated_at timestamptz default now(),
    raw_app_meta_data jsonb, raw_user_meta_data jsonb
  );
  create table auth.identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id), provider_id text, provider text,
    identity_data jsonb, last_sign_in_at timestamptz,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
`)

// ── 1. マイグレーション適用 ───────────────────────────────────────────────
console.log('\n[1] マイグレーション適用')
// ディレクトリから読むので、新しいマイグレーションを足せば自動で検証対象になる
const migrations = readdirSync(`${DIR}/migrations`).filter(f => f.endsWith('.sql')).sort()
for (const f of migrations) {
  try { await db.exec(readFileSync(`${DIR}/migrations/${f}`, 'utf8')); ok(f) }
  catch (e) { bad(f, e); process.exit(1) }
}

// ── 2. handle_new_user トリガ ─────────────────────────────────────────────
console.log('\n[2] auth.users 作成 → profiles 自動作成')
const UA = '11111111-1111-4111-8111-111111111111'
const UB = '22222222-2222-4222-8222-222222222222'
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data)
  values ('${UA}', 'photographer@example.com', '{"display_name":"テストカメラマン"}'::jsonb),
         ('${UB}', 'other@example.com', '{}'::jsonb);
`)
{
  const r = await db.query(`select id, display_name, default_timer_minutes from public.profiles order by display_name`)
  r.rows.length === 2 ? ok('profiles 2件', JSON.stringify(r.rows)) : bad('profiles 2件', JSON.stringify(r.rows))
  const a = r.rows.find(x => x.id === UA)
  a?.display_name === 'テストカメラマン' ? ok('display_name をメタデータから取得') : bad('display_name', a?.display_name)
  const b = r.rows.find(x => x.id === UB)
  b?.display_name === 'other' ? ok('display_name をメール local-part でフォールバック') : bad('fallback', b?.display_name)
}

// ── 3. seed.sql ───────────────────────────────────────────────────────────
console.log('\n[3] seed.sql 適用')
try { await db.exec(readFileSync(`${DIR}/seed.sql`, 'utf8')); ok('seed.sql 実行') }
catch (e) { bad('seed.sql 実行', e) }
{
  const r = await db.query(`
    select
      (select count(*) from public.venues)      as venues,
      (select count(*) from public.organizers)  as organizers,
      (select count(*) from public.models)      as models,
      (select count(*) from public.sessions)    as sessions,
      (select count(*) from public.slots)       as slots,
      (select count(*) from public.slot_models) as slot_models`)
  const c = r.rows[0]
  const want = { venues: 2n, organizers: 1n, models: 5n, sessions: 3n, slots: 8n, slot_models: 9n }
  const got = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, BigInt(v)]))
  JSON.stringify(got, (k, v) => typeof v === 'bigint' ? Number(v) : v) ===
  JSON.stringify(want, (k, v) => typeof v === 'bigint' ? Number(v) : v)
    ? ok('件数一致', JSON.stringify(got, (k, v) => typeof v === 'bigint' ? Number(v) : v))
    : bad('件数', JSON.stringify(got, (k, v) => typeof v === 'bigint' ? Number(v) : v))
}
{ // 冪等性
  await db.exec(readFileSync(`${DIR}/seed.sql`, 'utf8'))
  const r = await db.query(`select count(*)::int n from public.slot_models`)
  r.rows[0].n === 9 ? ok('seed 再実行で増殖しない') : bad('seed 冪等性', r.rows[0].n)
}

// ── 4. end_at トリガ ──────────────────────────────────────────────────────
console.log('\n[4] slots.end_at トリガ')
{
  const r = await db.query(`
    select slot_no, planned_minutes, extended_minutes,
           extract(epoch from (end_at - start_at))/60 as span_min
    from public.slots where session_id = 'c0000000-0000-4000-8000-000000000002' order by slot_no`)
  const allOk = r.rows.every(x => Number(x.span_min) === x.planned_minutes + x.extended_minutes)
  allOk ? ok('end_at = start_at + planned + extended',
    r.rows.map(x => `${x.slot_no}部:${x.span_min}分`).join(' '))
    : bad('end_at', JSON.stringify(r.rows))

  await db.exec(`update public.slots set planned_minutes = 90 where id = 'd0000000-0000-4000-8000-000000000006'`)
  const u = await db.query(`select extract(epoch from (end_at - start_at))/60 m from public.slots where id = 'd0000000-0000-4000-8000-000000000006'`)
  Number(u.rows[0].m) === 90 ? ok('planned_minutes 更新で end_at が追従') : bad('end_at 更新', u.rows[0].m)
}

// ── 5. updated_at トリガ ──────────────────────────────────────────────────
console.log('\n[5] updated_at トリガ')
{
  const before = await db.query(`select updated_at from public.models where id = 'b0000000-0000-4000-8000-000000000001'`)
  await db.exec(`update public.models set notes = notes || ' / 追記' where id = 'b0000000-0000-4000-8000-000000000001'`)
  const after = await db.query(`select updated_at from public.models where id = 'b0000000-0000-4000-8000-000000000001'`)
  after.rows[0].updated_at > before.rows[0].updated_at
    ? ok('update で updated_at が進む') : bad('updated_at', `${before.rows[0].updated_at} -> ${after.rows[0].updated_at}`)
}

// ── 6. 制約（失敗すべき書き込み） ─────────────────────────────────────────
console.log('\n[6] 制約が不正データを弾く')
const mustFail = async (name, sql) => {
  try { await db.exec(sql); bad(name, '← エラーにならなかった') }
  catch (e) { ok(name, String(e.message || e).split('\n')[0].slice(0, 90)) }
}
await mustFail('同一セッション内の slot_no 重複',
  `insert into public.slots (user_id, session_id, slot_no, start_at, planned_minutes)
   values ('${UA}', 'c0000000-0000-4000-8000-000000000003', 1, now(), 60)`)
await mustFail('同一枠に同じモデルを二重登録',
  `insert into public.slot_models (user_id, slot_id, model_id)
   values ('${UA}', 'd0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003')`)
await mustFail('タイマー不整合 (running だが timer_ends_at が null)',
  `update public.slots set timer_status = 'running', timer_started_at = now(), timer_ends_at = null
   where id = 'd0000000-0000-4000-8000-000000000006'`)
await mustFail('payment_status=paid だが paid_at が null',
  `update public.slot_models set payment_status = 'paid', paid_at = null
   where slot_id = 'd0000000-0000-4000-8000-000000000005'
     and model_id = 'b0000000-0000-4000-8000-000000000003'`)
await mustFail('delivery_status=delivered だが delivered_at が null',
  `update public.slot_models set delivery_status = 'delivered', delivered_at = null
   where slot_id = 'd0000000-0000-4000-8000-000000000003'`)
await mustFail('撮影履歴のあるモデルを物理削除 (on delete restrict)',
  `delete from public.models where id = 'b0000000-0000-4000-8000-000000000001'`)
await mustFail('他ユーザーの session を参照する slot',
  `insert into public.slots (user_id, session_id, slot_no, start_at, planned_minutes)
   values ('${UB}', 'c0000000-0000-4000-8000-000000000003', 99, now(), 60)`)
await mustFail('他ユーザーの model を参照する slot_models',
  `insert into public.slot_models (user_id, slot_id, model_id)
   values ('${UB}', 'd0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000005')`)
await mustFail('他ユーザーの venue を参照する session',
  `insert into public.sessions (user_id, title, session_date, venue_id)
   values ('${UB}', 'NG', current_date, 'a0000000-0000-4000-8000-000000000001')`)
await mustFail('他ユーザーの organizer を参照する session',
  `insert into public.sessions (user_id, title, session_date, organizer_id)
   values ('${UB}', 'NG', current_date, 'e0000000-0000-4000-8000-000000000001')`)
await mustFail('organizers の同名重複登録',
  `insert into public.organizers (user_id, name) values ('${UA}', 'ポートレート撮影会 秋の回')`)
await mustFail('models の同名重複登録',
  `insert into public.models (user_id, name) values ('${UA}', '栞奈')`)
await mustFail('負の金額',
  `insert into public.sessions (user_id, title, session_date, studio_cost)
   values ('${UA}', 'NG', current_date, -1)`)

await mustFail('定義にない撮影区分',
  `insert into public.sessions (user_id, title, session_date, shoot_category)
   values ('${UA}', 'NG', current_date, 'unknown')`)
await mustFail('定義にない場所区分',
  `insert into public.sessions (user_id, title, session_date, place_category)
   values ('${UA}', 'NG', current_date, 'unknown')`)

console.log('\n[6b] 許可されるべき書き込み')
const mustPass = async (name, sql) => {
  try { await db.exec(sql); ok(name) } catch (e) { bad(name, e) }
}
await mustPass('撮影区分 4種を登録できる',
  `begin;
   insert into public.sessions (user_id, title, session_date, shoot_category)
   values ('${UB}', '個撮', current_date, 'solo'), ('${UB}', '団体', current_date, 'group'),
          ('${UB}', 'セッション', current_date, 'session'), ('${UB}', '大撮', current_date, 'large');
   rollback`)
await mustPass('場所区分 2種と集合場所を登録できる',
  `begin;
   insert into public.sessions (user_id, title, session_date, place_category, meeting_point)
   values ('${UB}', '屋外', current_date, 'outdoor', '原宿駅'),
          ('${UB}', 'スタジオ', current_date, 'studio', null);
   rollback`)
await mustPass('論理削除後は同名モデルを再登録できる',
  `update public.models set deleted_at = now() where id = 'b0000000-0000-4000-8000-000000000004';
   insert into public.models (user_id, name) values ('${UA}', '七瀬ゆい');
   delete from public.models where name = '七瀬ゆい' and deleted_at is null;
   update public.models set deleted_at = null where id = 'b0000000-0000-4000-8000-000000000004';`)
await mustPass('タイマー: idle → running → paused → running → finished',
  `update public.slots set timer_status='running', timer_started_at=now(), timer_ends_at=now()+interval '60 min'
     where id='d0000000-0000-4000-8000-000000000006';
   update public.slots set timer_status='paused', timer_remaining_sec=1800
     where id='d0000000-0000-4000-8000-000000000006';
   update public.slots set timer_status='running', timer_ends_at=now()+interval '1800 sec'
     where id='d0000000-0000-4000-8000-000000000006';
   update public.slots set timer_status='finished', timer_finished_at=now()
     where id='d0000000-0000-4000-8000-000000000006';
   update public.slots set timer_status='idle', timer_started_at=null, timer_ends_at=null,
     timer_remaining_sec=null, timer_finished_at=null
     where id='d0000000-0000-4000-8000-000000000006';`)

// ── 6c. マスタ（団体 / 場所の種別） ───────────────────────────────────────
console.log('\n[6c] 団体マスタと場所の種別')
{
  const v = await db.query(`select name, kind from public.venues order by kind`)
  const kinds = Object.fromEntries(v.rows.map((r) => [r.kind, r.name]))
  kinds.studio && kinds.location
    ? ok('venues がスタジオ / ロケ地に分かれる', JSON.stringify(kinds))
    : bad('venue_kind', JSON.stringify(v.rows))

  const s = await db.query(`
    select se.title, o.name as organizer_name, se.organizer as organizer_text
    from public.sessions se
    left join public.organizers o on o.id = se.organizer_id
    where se.organizer_id is not null`)
  s.rows.length === 1 && s.rows[0].organizer_name === 'ポートレート撮影会 秋の回'
    ? ok('session から団体マスタを参照できる', s.rows[0].organizer_name)
    : bad('organizer_id 参照', JSON.stringify(s.rows))

  // 団体を消しても撮影履歴は残る（on delete set null）
  await db.exec(`insert into public.organizers (id, user_id, name)
                 values ('e0000000-0000-4000-8000-000000000099', '${UA}', '解散した団体')`)
  await db.exec(`update public.sessions set organizer_id = 'e0000000-0000-4000-8000-000000000099'
                 where id = 'c0000000-0000-4000-8000-000000000001'`)
  await db.exec(`delete from public.organizers where id = 'e0000000-0000-4000-8000-000000000099'`)
  const after = await db.query(`select organizer_id from public.sessions where id = 'c0000000-0000-4000-8000-000000000001'`)
  const stillThere = await db.query(`select count(*)::int n from public.sessions where id = 'c0000000-0000-4000-8000-000000000001'`)
  after.rows[0].organizer_id === null && stillThere.rows[0].n === 1
    ? ok('団体を削除しても撮影イベントは残る（organizer_id が null になる）')
    : bad('organizer 削除', JSON.stringify(after.rows))
}

// ── 7. ビュー ─────────────────────────────────────────────────────────────
console.log('\n[7] ビューの集計')
{
  const r = await db.query(`
    select model_name, shot_count::int, session_count::int,
           first_shot_date, last_shot_date, total_fee::int, total_paid::int, total_unpaid::int
    from public.v_model_stats order by shot_count desc, model_name`)
  console.table(r.rows)
  const kanna = r.rows.find(x => x.model_name === '栞奈')
  kanna?.shot_count === 2 && kanna?.session_count === 2
    ? ok('栞奈: 撮影済み枠2・セッション2（予定の枠は数えない）') : bad('v_model_stats 栞奈', JSON.stringify(kanna))
  kanna?.total_fee === 38000 && kanna?.total_paid === 25000 && kanna?.total_unpaid === 13000
    ? ok('栞奈: total_fee 38000 / paid 25000 / unpaid 13000') : bad('栞奈 金額', JSON.stringify(kanna))
  const hikaru = r.rows.find(x => x.model_name === '白石ひかる')
  hikaru?.shot_count === 0 && hikaru?.last_shot_date === null
    ? ok('未撮影モデルは shot_count=0 / 日付 null') : bad('未撮影モデル', JSON.stringify(hikaru))
}
{
  const r = await db.query(`
    select title, studio_cost::int, transport_cost::int, entry_cost::int, other_cost::int,
           booking_total::int, model_total::int, total_cost::int
    from public.v_session_costs order by session_date`)
  console.table(r.rows)
  const recent = r.rows.find(x => x.title === '秋ロケ撮影会')
  // 交通2400 + 参加3000 + その他800 + 枠料2000 + モデル料(13000+13000+4000+8000+8000)=46000 → 54200
  recent?.model_total === 46000 && recent?.total_cost === 54200
    ? ok('秋ロケ撮影会: モデル料46000 / 総支出54200') : bad('v_session_costs', JSON.stringify(recent))
  const sum = r.rows.reduce((a, x) => a + x.total_cost, 0)
  ok('全セッション総支出', `${sum.toLocaleString()} 円`)
}
{
  const r = await db.query(`
    select model_name, slot_label, delivery_status, delivery_deadline, days_overdue
    from public.v_pending_deliveries order by days_overdue desc nulls last`)
  console.table(r.rows)
  // 撮影済みの未納品のみ。2人同時枠はモデルごとに1行（= 納品の単位）なので計4件
  r.rows.length === 4 ? ok('未納品は4件（撮影済みのみ・2人同時枠はモデル単位で2行）') : bad('v_pending_deliveries 件数', r.rows.length)
  r.rows.filter(x => x.slot_label === '3部（2人同時）').length === 2
    ? ok('複数モデル枠は納品行が分かれる') : bad('複数モデル枠の納品行', r.rows.length)
  r.rows[0]?.days_overdue === 4 ? ok('期限超過が days_overdue=4 で先頭') : bad('days_overdue', JSON.stringify(r.rows[0]))
}

// ── 7b. 撮影履歴（遡及登録）と統合ビュー ──────────────────────────────────
console.log('\n[7b] 撮影履歴と統合ビュー')
{
  const HIST = 'f0000000-0000-4000-8000-000000000001'
  const beforeStats = await db.query(
    `select shot_count::int, total_fee::int from public.v_model_stats where model_name = '白石ひかる'`,
  )
  beforeStats.rows[0].shot_count === 0
    ? ok('遡及登録前: 白石ひかるの撮影回数は0')
    : bad('前提', JSON.stringify(beforeStats.rows[0]))

  // 運用フローを通していない過去の撮影を登録
  await db.exec(`
    insert into public.shoot_history
      (id, user_id, shoot_date, title, shoot_type, venue_id, venue_name,
       transport_cost, frame_count, storage_path, storage_label, rating, memo)
    values ('${HIST}', '${UA}', current_date - 400, '去年の自主撮影', 'personal',
            'a0000000-0000-4000-8000-000000000002', '緑ヶ丘中央公園',
            1500, 280, '/Volumes/OLD/2025/自主撮影', 'OLD', 4, 'アプリ導入前の撮影');
    insert into public.shoot_history_models
      (user_id, shoot_history_id, model_id, fee, payment_status, paid_at, costume)
    values ('${UA}', '${HIST}', 'b0000000-0000-4000-8000-000000000005', 10000, 'paid', current_date - 400, '私服');
  `)

  const afterStats = await db.query(
    `select shot_count::int, total_fee::int, total_paid::int, first_shot_date
     from public.v_model_stats where model_name = '白石ひかる'`,
  )
  const a = afterStats.rows[0]
  a.shot_count === 1 && a.total_paid === 10000
    ? ok('遡及登録が v_model_stats に合算される', JSON.stringify({ shot_count: a.shot_count, total_paid: a.total_paid }))
    : bad('v_model_stats 合算', JSON.stringify(a))
  a.first_shot_date !== null
    ? ok('遡及登録で初回撮影日が入る')
    : bad('first_shot_date', JSON.stringify(a))

  // 統合ビュー: 運用フロー分と遡及分の両方が出る
  const all = await db.query(`
    select source, count(*)::int n from public.v_shoot_history_all group by source order by source`)
  const bySource = Object.fromEntries(all.rows.map((r) => [r.source, r.n]))
  bySource.history === 1 && bySource.slot > 0
    ? ok('v_shoot_history_all が両方を統合する', JSON.stringify(bySource))
    : bad('統合ビュー', JSON.stringify(bySource))

  // 履歴を消すとモデル実績から外れる
  await db.exec(`update public.shoot_history set deleted_at = now() where id = '${HIST}'`)
  const deleted = await db.query(
    `select shot_count::int from public.v_model_stats where model_name = '白石ひかる'`,
  )
  const gone = await db.query(
    `select count(*)::int n from public.v_shoot_history_all where source = 'history'`,
  )
  deleted.rows[0].shot_count === 0 && gone.rows[0].n === 0
    ? ok('履歴の論理削除が統計・統合ビューに反映される')
    : bad('論理削除の反映', JSON.stringify({ stats: deleted.rows[0], view: gone.rows[0] }))
  await db.exec(`update public.shoot_history set deleted_at = null where id = '${HIST}'`)

  // 撮影履歴のあるモデルは物理削除できない
  await mustFail('撮影履歴のあるモデルを物理削除',
    `delete from public.models where id = 'b0000000-0000-4000-8000-000000000005'`)
  await mustFail('他ユーザーの撮影履歴にモデルを紐づける',
    `insert into public.shoot_history_models (user_id, shoot_history_id, model_id)
     values ('${UB}', '${HIST}', 'b0000000-0000-4000-8000-000000000005')`)
}

// ── 8. RLS ────────────────────────────────────────────────────────────────
console.log('\n[8] RLS（他ユーザーのデータが見えないこと）')
const asUser = async (uid) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}"}', false);`)
  const r = await db.query(`
    select (select count(*)::int from public.models)      m,
           (select count(*)::int from public.sessions)    s,
           (select count(*)::int from public.slots)       sl,
           (select count(*)::int from public.slot_models) sm,
           (select count(*)::int from public.v_model_stats) v`)
  await db.exec(`reset role`)
  return r.rows[0]
}
{
  const a = await asUser(UA)
  const b = await asUser(UB)
  a.m === 5 && a.s === 3 && a.sl === 8 && a.sm === 9
    ? ok('ユーザーA は自分のデータが見える', JSON.stringify(a)) : bad('RLS userA', JSON.stringify(a))
  b.m === 0 && b.s === 0 && b.sl === 0 && b.sm === 0 && b.v === 0
    ? ok('ユーザーB からは0件（ビューも security_invoker で遮断）', JSON.stringify(b)) : bad('RLS userB', JSON.stringify(b))
}
{ // anon
  await db.exec(`set role anon`)
  let anonBlocked = false
  try { await db.query(`select count(*) from public.models`) } catch { anonBlocked = true }
  if (!anonBlocked) {
    const r = await db.query(`select count(*)::int n from public.models`)
    anonBlocked = r.rows[0].n === 0
  }
  await db.exec(`reset role`)
  anonBlocked ? ok('未ログイン(anon)は0件/権限なし') : bad('RLS anon', '行が見えた')
}
{ // 他人の user_id で書き込もうとする
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${UB}"}', false);`)
  let blocked = false
  try {
    await db.exec(`insert into public.models (user_id, name) values ('${UA}', '乗っ取り')`)
  } catch { blocked = true }
  await db.exec(`reset role`)
  blocked ? ok('他人の user_id を指定した insert は with check で拒否') : bad('RLS with check', '通ってしまった')
}

// ── 9. 削除記録（オフライン同期用の tombstone） ───────────────────────────
// 行を消すのでカウント系の検査より後に置くこと
console.log('\n[9] sync_tombstones（物理削除の記録）')
{
  const count = async () => (await db.query(`select count(*)::int n from public.sync_tombstones`)).rows[0].n
  const before = await count()

  // 子を持たない枠を削除 → 1件
  await db.exec(`delete from public.slots where id = 'd0000000-0000-4000-8000-000000000008'`)
  const t1 = await db.query(`
    select table_name, row_id, user_id from public.sync_tombstones order by id desc limit 1`)
  ;(await count()) === before + 1 && t1.rows[0].table_name === 'slots'
    ? ok('物理削除で tombstone が1件記録される', JSON.stringify(t1.rows[0].table_name))
    : bad('tombstone 記録', JSON.stringify(t1.rows))
  t1.rows[0].user_id === UA ? ok('tombstone に所有者の user_id が入る') : bad('tombstone user_id', t1.rows[0].user_id)

  // slot_models を2件持つ枠を削除 → cascade 分も記録される（これが無いと削除が同期されない）
  const mark = (await db.query(`select coalesce(max(id), 0) m from public.sync_tombstones`)).rows[0].m
  await db.exec(`delete from public.slots where id = 'd0000000-0000-4000-8000-000000000007'`)
  const added = await db.query(`
    select table_name, count(*)::int n from public.sync_tombstones
    where id > ${mark} group by table_name order by table_name`)
  const byTable = Object.fromEntries(added.rows.map(r => [r.table_name, r.n]))
  byTable.slots === 1 && byTable.slot_models === 2
    ? ok('cascade 削除も記録される', JSON.stringify(byTable))
    : bad('cascade tombstone', JSON.stringify(byTable))

  // 論理削除は tombstone を作らない（通常の差分取得で拾えるため）
  const beforeSoft = await count()
  await db.exec(`update public.models set deleted_at = now() where id = 'b0000000-0000-4000-8000-000000000005'`)
  ;(await count()) === beforeSoft
    ? ok('論理削除では tombstone を作らない') : bad('論理削除', '余分に記録された')
  await db.exec(`update public.models set deleted_at = null where id = 'b0000000-0000-4000-8000-000000000005'`)

  // 保持期間の掃除
  await db.exec(`update public.sync_tombstones set deleted_at = now() - interval '100 days' where id = (select min(id) from public.sync_tombstones)`)
  const purged = await db.query(`select public.purge_sync_tombstones() as n`)
  Number(purged.rows[0].n) === 1 ? ok('90日より古い tombstone が purge される') : bad('purge', purged.rows[0].n)

  // RLS
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${UB}"}', false);`)
  const otherSees = (await db.query(`select count(*)::int n from public.sync_tombstones`)).rows[0].n
  let writeBlocked = false
  try {
    await db.exec(`insert into public.sync_tombstones (user_id, table_name, row_id) values ('${UB}', 'models', gen_random_uuid())`)
  } catch { writeBlocked = true }
  await db.exec(`reset role`)
  otherSees === 0 ? ok('他ユーザーの tombstone は見えない') : bad('tombstone RLS', `${otherSees}件見えた`)
  writeBlocked ? ok('クライアントからの tombstone 書き込みは不可') : bad('tombstone 書き込み', '通ってしまった')
}

// ── 10. DB 操作ログ ─────────────────────────────────────────────────────
console.log('\n[10] audit_logs（DB 操作ログ）')
{
  // テーブルを追加したときにトリガの付け忘れで記録が漏れないようにする
  const missing = await db.query(`
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('audit_logs', 'sync_tombstones')
      and not exists (
        select 1 from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
        where t.tgrelid = c.oid and p.proname = 'record_audit_log'
      )`)
  missing.rows.length === 0
    ? ok('対象外以外の全テーブルにトリガがある')
    : bad('トリガ漏れ', JSON.stringify(missing.rows))

  const asUser = (id) => `set role authenticated; select set_config('request.jwt.claims', '{"sub":"${id}"}', false);`
  const MODEL = 'b0000000-0000-4000-8000-0000000000aa'
  const logs = async (rowId) => (await db.query(`
    select operation, user_id, actor_id, old_data, new_data from public.audit_logs
    where row_id = '${rowId}' order by id`)).rows

  // 本人の操作として INSERT → UPDATE → 論理削除 → DELETE
  await db.exec(`${asUser(UA)}
    insert into public.models (id, user_id, name) values ('${MODEL}', '${UA}', '監査テスト');
    update public.models set name = '監査テスト改' where id = '${MODEL}';
    update public.models set deleted_at = now() where id = '${MODEL}';
    delete from public.models where id = '${MODEL}';
    reset role;`)
  const rows = await logs(MODEL)
  rows.map(r => r.operation).join() === 'INSERT,UPDATE,UPDATE,DELETE'
    ? ok('INSERT / UPDATE / 論理削除 / DELETE が順に記録される')
    : bad('操作の記録', rows.map(r => r.operation).join())
  rows.every(r => r.user_id === UA && r.actor_id === UA)
    ? ok('所有者と操作者が記録される') : bad('所有者と操作者', JSON.stringify(rows[0]))
  rows[0].old_data === null && rows[0].new_data?.name === '監査テスト'
    ? ok('INSERT は変更後だけを持つ') : bad('INSERT の内容', JSON.stringify(rows[0]))
  rows[1].old_data?.name === '監査テスト' && rows[1].new_data?.name === '監査テスト改'
    ? ok('UPDATE は変更前後を持つ') : bad('UPDATE の内容', JSON.stringify(rows[1]))
  rows[3].old_data?.name === '監査テスト改' && rows[3].new_data === null
    ? ok('DELETE は変更前だけを持つ') : bad('DELETE の内容', JSON.stringify(rows[3]))

  // profiles は user_id カラムを持たない
  const profile = await db.query(`select id from public.profiles where id = '${UA}'`)
  await db.exec(`update public.profiles set updated_at = now() where id = '${UA}'`)
  const profileLog = await logs(UA)
  profile.rows.length === 1 && profileLog.at(-1)?.user_id === UA
    ? ok('profiles の変更も所有者つきで記録される') : bad('profiles', JSON.stringify(profileLog.at(-1)))

  // cascade で消えた子の行も残る
  await db.exec(`
    insert into public.sessions (id, user_id, title, session_date)
      values ('e0000000-0000-4000-8000-0000000000aa', '${UA}', '監査', current_date);
    insert into public.slots (id, user_id, session_id, slot_no, start_at, planned_minutes)
      values ('e0000000-0000-4000-8000-0000000000ab', '${UA}', 'e0000000-0000-4000-8000-0000000000aa', 1, now(), 60);
    delete from public.sessions where id = 'e0000000-0000-4000-8000-0000000000aa';`)
  const cascaded = await logs('e0000000-0000-4000-8000-0000000000ab')
  cascaded.at(-1)?.operation === 'DELETE'
    ? ok('cascade 削除も記録される') : bad('cascade', JSON.stringify(cascaded))

  // RLS: 他人のログは読めず、本人でも書き換えられない
  await db.exec(asUser(UB))
  const otherSees = (await db.query(`select count(*)::int n from public.audit_logs where row_id = '${MODEL}'`)).rows[0].n
  await db.exec(asUser(UA))
  const ownerSees = (await db.query(`select count(*)::int n from public.audit_logs where row_id = '${MODEL}'`)).rows[0].n
  const attempts = {
    insert: `insert into public.audit_logs (user_id, table_name, row_id, operation) values ('${UA}', 'models', gen_random_uuid(), 'INSERT')`,
    update: `update public.audit_logs set table_name = 'x'`,
    delete: `delete from public.audit_logs`,
  }
  const allowed = []
  for (const [name, sql] of Object.entries(attempts)) {
    try { await db.exec(sql); allowed.push(name) } catch { /* 拒否されるのが正しい */ }
  }
  await db.exec(`reset role`)
  otherSees === 0 && ownerSees === 4
    ? ok('ログは本人だけが読める') : bad('ログの RLS', `他人${otherSees}件 / 本人${ownerSees}件`)
  allowed.length === 0
    ? ok('本人でもログを書き換えられない') : bad('ログの書き換え', allowed.join())

  // アカウント削除を止めず、ログも残さない
  const GONE = '99999999-9999-4999-8999-999999999999'
  try {
    await db.exec(`
      insert into auth.users (id, email) values ('${GONE}', 'gone@example.com');
      insert into public.models (user_id, name) values ('${GONE}', '削除されるモデル');
      delete from auth.users where id = '${GONE}';`)
    const left = (await db.query(`select count(*)::int n from public.audit_logs where user_id = '${GONE}'`)).rows[0].n
    left === 0 ? ok('アカウント削除でログも消える') : bad('アカウント削除', `${left}件残った`)
  } catch (e) { bad('アカウント削除', e) }
}

// ── 11. 過去撮影登録の入力項目 ─────────────────────────────────────────
console.log('\n[11] shoot_history の入力項目')
{
  const H = 'c1000000-0000-4000-8000-0000000000aa'
  await db.exec(`
    insert into public.shoot_history
      (id, user_id, shoot_date, title, shoot_category, concept, place_category, storage_urls)
    values ('${H}', '${UA}', '2026-01-10', '過去撮影', 'large', '夕景', 'outdoor', array['https://example.com/a', 'https://example.com/b'])`)
  const row = (await db.query(`
    select source, shoot_category, concept, place_category, meeting_point, storage_urls
    from public.v_shoot_history_all where source_id = '${H}'`)).rows[0]
  row?.source === 'history' && row.shoot_category === 'large' && row.concept === '夕景' &&
    row.place_category === 'outdoor' && row.meeting_point === null && row.storage_urls?.length === 2
    ? ok('追加した項目を v_shoot_history_all から引ける')
    : bad('v_shoot_history_all', JSON.stringify(row))

  const urls = (n) => `array[${Array.from({ length: n }, (_, i) => `'https://example.com/${i}'`).join(',')}]`
  await mustPass('ストレージURLを10個登録できる',
    `begin;
     insert into public.shoot_history (user_id, shoot_date, title, storage_urls)
     values ('${UA}', current_date, '10個', ${urls(10)});
     rollback`)
  await mustFail('ストレージURLの11個目',
    `insert into public.shoot_history (user_id, shoot_date, title, storage_urls)
     values ('${UA}', current_date, '11個', ${urls(11)})`)
  const dropped = await db.query(`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shoot_history' and column_name = 'meeting_point'`)
  dropped.rows.length === 0 ? ok('shoot_history は集合場所を持たない') : bad('meeting_point', '列が残っている')

  // 運用フロー側も同じ列を sessions から返す
  await db.exec(`
    insert into public.sessions (id, user_id, title, session_date, shoot_category, concept, place_category, meeting_point)
      values ('c1000000-0000-4000-8000-0000000000ab', '${UA}', '運用', '2026-01-11', 'group', '白ホリ', 'outdoor', '渋谷駅');
    insert into public.slots (id, user_id, session_id, slot_no, start_at, planned_minutes, shoot_status)
      values ('c1000000-0000-4000-8000-0000000000ac', '${UA}', 'c1000000-0000-4000-8000-0000000000ab', 1, now(), 60, 'shot');`)
  const slotRow = (await db.query(`
    select source, shoot_category, concept, place_category, meeting_point
    from public.v_shoot_history_all where source_id = 'c1000000-0000-4000-8000-0000000000ac'`)).rows[0]
  slotRow?.source === 'slot' && slotRow.shoot_category === 'group' && slotRow.concept === '白ホリ' &&
    slotRow.place_category === 'outdoor' && slotRow.meeting_point === '渋谷駅'
    ? ok('運用フロー側の行も同じ項目を返す')
    : bad('運用フロー側', JSON.stringify(slotRow))

  await mustPass('確定撮影情報のURLを10個登録できる',
    `update public.slots set storage_urls = ${urls(10)} where id = 'c1000000-0000-4000-8000-0000000000ac'`)
  await mustFail('確定撮影情報のURLの11個目',
    `update public.slots set storage_urls = ${urls(11)} where id = 'c1000000-0000-4000-8000-0000000000ac'`)
}

// ── 12. モデルの旧名義 ───────────────────────────────────────────────
console.log('\n[12] model_former_names（旧名義）')
{
  const M = 'c2000000-0000-4000-8000-0000000000aa'
  const former = (values, user = UA, model = M) =>
    `insert into public.model_former_names (user_id, model_id, name, used_from, used_until)
     values ('${user}', '${model}', ${values})`
  await db.exec(`insert into public.models (id, user_id, name) values ('${M}', '${UA}', '現在の名義')`)

  await mustPass('旧名義を複数登録できる（期間は任意）',
    `${former(`'旧名義A', '2024-01-01', '2024-12-31'`)}; ${former(`'旧名義B', null, null`)}`)
  await mustFail('同じモデルに同じ旧名義（大文字小文字違いも）',
    `${former(`'Kanna', null, null`)}; ${former(`'kanna', null, null`)}`)
  await mustFail('空白のみの旧名義', former(`'   ', null, null`))
  await mustFail('終了日が開始日より前', former(`'旧名義C', '2025-01-02', '2025-01-01'`))
  await mustFail('他ユーザーのモデルへの登録', former(`'旧名義D', null, null`, UB))

  // 別のモデルが同じ旧名義を使っていてもよい
  const M2 = 'c2000000-0000-4000-8000-0000000000ab'
  await db.exec(`insert into public.models (id, user_id, name) values ('${M2}', '${UA}', '別のモデル')`)
  await mustPass('別のモデルなら同じ旧名義を登録できる', former(`'旧名義A', null, null`, UA, M2))

  // RLS
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${UB}"}', false);`)
  const otherSees = (await db.query(`select count(*)::int n from public.model_former_names`)).rows[0].n
  await db.exec(`select set_config('request.jwt.claims', '{"sub":"${UA}"}', false);`)
  const ownerSees = (await db.query(`select count(*)::int n from public.model_former_names`)).rows[0].n
  await db.exec(`reset role`)
  otherSees === 0 && ownerSees === 3
    ? ok('旧名義は本人だけが読める') : bad('旧名義の RLS', `他人${otherSees}件 / 本人${ownerSees}件`)

  // モデルを物理削除すると旧名義も消え、削除が端末へ同期され、ログにも残る
  const tomb = async () => (await db.query(`
    select count(*)::int n from public.sync_tombstones where table_name = 'model_former_names'`)).rows[0].n
  const before = await tomb()
  await db.exec(`delete from public.models where id = '${M}'`)
  const left = (await db.query(`select count(*)::int n from public.model_former_names where model_id = '${M}'`)).rows[0].n
  left === 0 && (await tomb()) === before + 2
    ? ok('モデルの物理削除で旧名義も消え、tombstone が残る') : bad('cascade', `残り${left}件`)
  const audited = (await db.query(`
    select count(*)::int n from public.audit_logs
    where table_name = 'model_former_names' and operation = 'DELETE'`)).rows[0].n
  audited === 2 ? ok('旧名義の操作もログに残る') : bad('旧名義のログ', `${audited}件`)
}

// ── 13. 確定撮影情報の撮影料とオプション ─────────────────────────────
console.log('\n[13] slots の撮影料とオプション')
{
  const SLOT = 'c1000000-0000-4000-8000-0000000000ac'
  await mustPass('撮影料とオプションを保存できる',
    `update public.slots
     set booking_fee = 15000, costume_options = '浴衣', shooting_method_options = '動画撮影'
     where id = '${SLOT}'`)
  await mustFail('負の撮影料', `update public.slots set booking_fee = -1 where id = '${SLOT}'`)
  const cost = (await db.query(`
    select booking_total::int as n from public.v_session_costs
    where session_id = 'c1000000-0000-4000-8000-0000000000ab'`)).rows[0]
  cost?.n === 15000 ? ok('撮影料が v_session_costs に集計される') : bad('撮影料の集計', JSON.stringify(cost))

  await mustPass('支払方法が事前なら支払日を持てる',
    `update public.slots
     set fee_payment_timing = 'in_advance', fee_payment_date = '2026-01-01'
     where id = '${SLOT}'`)
  await mustFail('事前以外で支払日を持つ',
    `update public.slots set fee_payment_timing = 'on_the_day' where id = '${SLOT}'`)
  await mustFail('支払方法が未選択で支払日を持つ',
    `update public.slots set fee_payment_timing = null where id = '${SLOT}'`)
  await mustPass('支払日を消せば別の支払方法にできる',
    `update public.slots set fee_payment_timing = 'paid', fee_payment_date = null where id = '${SLOT}'`)
  await mustFail('定義にない支払方法',
    `update public.slots set fee_payment_timing = 'later' where id = '${SLOT}'`)
  await mustPass('集合時刻を保存できる',
    `update public.slots set meeting_at = now() where id = '${SLOT}'`)
}

console.log(`\n${'─'.repeat(60)}\n結果: ${pass} 成功 / ${fail} 失敗`)
process.exit(fail > 0 ? 1 : 0)
