import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

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
const migrations = [
  '20261103000100_init_enums.sql',
  '20261103000200_init_tables.sql',
  '20261103000300_rls_and_triggers.sql',
  '20261103000400_views.sql',
]
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
      (select count(*) from public.models)      as models,
      (select count(*) from public.sessions)    as sessions,
      (select count(*) from public.slots)       as slots,
      (select count(*) from public.slot_models) as slot_models`)
  const c = r.rows[0]
  const want = { venues: 2n, models: 5n, sessions: 3n, slots: 8n, slot_models: 9n }
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
await mustFail('models の同名重複登録',
  `insert into public.models (user_id, name) values ('${UA}', '栞奈')`)
await mustFail('負の金額',
  `insert into public.sessions (user_id, title, session_date, studio_cost)
   values ('${UA}', 'NG', current_date, -1)`)

console.log('\n[6b] 許可されるべき書き込み')
const mustPass = async (name, sql) => {
  try { await db.exec(sql); ok(name) } catch (e) { bad(name, e) }
}
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

console.log(`\n${'─'.repeat(60)}\n結果: ${pass} 成功 / ${fail} 失敗`)
process.exit(fail > 0 ? 1 : 0)
