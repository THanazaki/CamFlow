-- CamFlow 開発用シードデータ
--
-- `supabase db reset` で自動実行される。
-- auth.users にユーザーが居ればその先頭ユーザーに、居なければテストユーザーを作って紐づける。
-- 固定 UUID と on conflict do nothing を使うため、重複実行しても増殖しない。
--
-- 投入内容: スタジオ2件 / モデル5件 / セッション3件（過去2・未来1）/ 枠8件 / 枠×モデル10件

do $$
declare
  v_user_id uuid;
  v_user_created boolean := false;

  -- スタジオ・ロケ地
  v_venue_studio uuid := 'a0000000-0000-4000-8000-000000000001';
  v_venue_park   uuid := 'a0000000-0000-4000-8000-000000000002';

  -- 主催団体
  v_org_autumn uuid := 'e0000000-0000-4000-8000-000000000001';

  -- モデル
  v_model_a uuid := 'b0000000-0000-4000-8000-000000000001';
  v_model_b uuid := 'b0000000-0000-4000-8000-000000000002';
  v_model_c uuid := 'b0000000-0000-4000-8000-000000000003';
  v_model_d uuid := 'b0000000-0000-4000-8000-000000000004';
  v_model_e uuid := 'b0000000-0000-4000-8000-000000000005';

  -- セッション
  v_sess_past   uuid := 'c0000000-0000-4000-8000-000000000001'; -- 2ヶ月前・納品完了
  v_sess_recent uuid := 'c0000000-0000-4000-8000-000000000002'; -- 2週間前・納品途中
  v_sess_future uuid := 'c0000000-0000-4000-8000-000000000003'; -- 3週間後・予定

  -- 枠
  v_slot_p1 uuid := 'd0000000-0000-4000-8000-000000000001';
  v_slot_p2 uuid := 'd0000000-0000-4000-8000-000000000002';
  v_slot_r1 uuid := 'd0000000-0000-4000-8000-000000000003';
  v_slot_r2 uuid := 'd0000000-0000-4000-8000-000000000004';
  v_slot_r3 uuid := 'd0000000-0000-4000-8000-000000000005'; -- 2人同時撮影
  v_slot_f1 uuid := 'd0000000-0000-4000-8000-000000000006';
  v_slot_f2 uuid := 'd0000000-0000-4000-8000-000000000007';
  v_slot_f3 uuid := 'd0000000-0000-4000-8000-000000000008';
begin
  -- ----------------------------------------------------------
  -- 0. ユーザーの確保
  -- ----------------------------------------------------------
  select id into v_user_id from auth.users order by created_at, id limit 1;

  if v_user_id is null then
    begin
      v_user_id := '11111111-1111-4111-8111-111111111111';

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_user_id, 'authenticated', 'authenticated',
        'photographer@example.com',
        extensions.crypt('password123', extensions.gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"テストカメラマン"}'::jsonb
      );

      insert into auth.identities (
        user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
      ) values (
        v_user_id, v_user_id::text, 'email',
        format('{"sub":"%s","email":"photographer@example.com","email_verified":true}', v_user_id)::jsonb,
        now(), now(), now()
      );

      v_user_created := true;
      raise notice 'テストユーザーを作成しました: photographer@example.com / password123';
    exception when others then
      raise notice 'auth.users へのテストユーザー作成をスキップしました (%)', sqlerrm;
      v_user_id := null;
    end;
  end if;

  if v_user_id is null then
    raise notice 'ユーザーが存在しないためシードを中止しました。サインアップ後に supabase/seed.sql を再実行してください。';
  else
    if not v_user_created then
      raise notice '既存ユーザー % にシードデータを紐づけます', v_user_id;
    end if;

    -- profiles は on_auth_user_created トリガが作る。既存ユーザーで欠けていれば補う
    insert into public.profiles (id, display_name)
    values (v_user_id, 'テストカメラマン')
    on conflict (id) do nothing;

    -- ----------------------------------------------------------
    -- 1. venues
    -- ----------------------------------------------------------
    insert into public.venues (id, user_id, name, kind, address, url, nearest_station, hourly_rate, notes, is_favorite) values
      (v_venue_studio, v_user_id, 'スタジオ ルミエール', 'studio',   '東京都渋谷区神南1-2-3', 'https://example.com/lumiere', '渋谷駅', 3500,
       'ストロボ2灯・バックペーパー白/黒あり。電源は壁面のみ', true),
      (v_venue_park,   v_user_id, '緑ヶ丘中央公園',     'location', '東京都立川市緑ヶ丘1-1',  null,                            '西立川駅', 0,
       '三脚は要申請。日没が早い時期は15時開始が限界', false)
    on conflict (id) do nothing;

    -- ----------------------------------------------------------
    -- 1b. organizers（主催団体）
    -- ----------------------------------------------------------
    insert into public.organizers (id, user_id, name, name_kana, url, contact, notes, is_favorite) values
      (v_org_autumn, v_user_id, 'ポートレート撮影会 秋の回', 'ぽーとれーとさつえいかい',
       'https://example.com/autumn', 'info@example.com',
       '参加費は当日現金払い。モデル料は別途その場で手渡し', false)
    on conflict (id) do nothing;

    -- ----------------------------------------------------------
    -- 2. models
    -- ----------------------------------------------------------
    insert into public.models
      (id, user_id, name, name_kana, sns_links, contact_method, contact_value, affiliation, tags, rating, is_favorite, status, notes)
    values
      (v_model_a, v_user_id, '栞奈',       'かんな',   '{"x":"https://x.com/example_kanna","instagram":"https://instagram.com/example_kanna"}'::jsonb,
       'X DM', '@example_kanna', 'フリー', '{ポートレート,スタジオ}', 5, true,  'active',
       'レタッチは肌の質感を残す方向が好み。納品は1週間以内希望'),
      (v_model_b, v_user_id, 'みなも',     'みなも',   '{"x":"https://x.com/example_minamo"}'::jsonb,
       'LINE', 'minamo_line', 'フリー', '{ポートレート,ロケ}', 4, true,  'active',
       '屋外ロケ中心。日中シンクロが映える'),
      (v_model_c, v_user_id, '蒼井リオ',   'あおいりお', '{"instagram":"https://instagram.com/example_rio","tiktok":"https://tiktok.com/@example_rio"}'::jsonb,
       'Instagram DM', '@example_rio', 'スターライト事務所', '{コスプレ,スタジオ}', 4, false, 'active',
       'コスプレ衣装は本人持ち込み。更衣に20分見ておく'),
      (v_model_d, v_user_id, '七瀬ゆい',   'ななせゆい', '{"x":"https://x.com/example_yui"}'::jsonb,
       'メール', 'yui@example.com', 'フリー', '{ポートレート}', 3, false, 'inactive',
       '2026年春から活動休止中'),
      (v_model_e, v_user_id, '白石ひかる', 'しらいしひかる', '{}'::jsonb,
       null, null, null, '{ポートレート,ロケ}', null, false, 'active',
       '初回撮影は未実施（撮影回数0件の表示確認用）')
    on conflict (id) do nothing;

    -- ----------------------------------------------------------
    -- 3. sessions
    -- ----------------------------------------------------------
    insert into public.sessions
      (id, user_id, title, session_date, shoot_type, status, venue_id, venue_name, organizer_id, organizer,
       start_at, end_at, studio_cost, transport_cost, entry_cost, other_cost, other_cost_note, weather_note, memo)
    values
      (v_sess_past, v_user_id, 'スタジオ個人撮影会（栞奈・みなも）', current_date - 60, 'solo', 'done',
       v_venue_studio, 'スタジオ ルミエール', null, null,
       (current_date - 60 + time '13:00') at time zone 'Asia/Tokyo',
       (current_date - 60 + time '16:00') at time zone 'Asia/Tokyo',
       10500, 1200, 0, 0, null, null, '初回のスタジオ。ホリゾントが広くて使いやすい'),

      (v_sess_recent, v_user_id, '秋ロケ撮影会', current_date - 14, 'event', 'done',
       v_venue_park, '緑ヶ丘中央公園', v_org_autumn, 'ポートレート撮影会 秋の回',
       (current_date - 14 + time '14:00') at time zone 'Asia/Tokyo',
       (current_date - 14 + time '17:00') at time zone 'Asia/Tokyo',
       0, 2400, 3000, 800, '公園入園料', '快晴・西日が強め', '納品が3名分残っている'),

      (v_sess_future, v_user_id, 'スタジオ個人撮影会（12月）', current_date + 21, 'solo', 'confirmed',
       v_venue_studio, 'スタジオ ルミエール', null, null,
       (current_date + 21 + time '12:00') at time zone 'Asia/Tokyo',
       (current_date + 21 + time '16:00') at time zone 'Asia/Tokyo',
       14000, 1200, 0, 0, null, null, 'クリスマス衣装の予定。小物を用意する')
    on conflict (id) do nothing;

    -- ----------------------------------------------------------
    -- 4. slots
    -- ----------------------------------------------------------
    -- 過去セッション（撮影済み・納品完了・タイマー終了済み）
    insert into public.slots
      (id, user_id, session_id, slot_no, label, start_at, planned_minutes,
       timer_status, timer_started_at, timer_ends_at, timer_finished_at, extended_minutes,
       booking_fee, theme, shoot_status, frame_count,
       storage_path, storage_label, storage_size_mb, backup_location, backed_up_at, rating, memo)
    values
      (v_slot_p1, v_user_id, v_sess_past, 1, '1部',
       (current_date - 60 + time '13:00') at time zone 'Asia/Tokyo', 60,
       'finished',
       (current_date - 60 + time '13:02') at time zone 'Asia/Tokyo',
       (current_date - 60 + time '14:02') at time zone 'Asia/Tokyo',
       (current_date - 60 + time '14:05') at time zone 'Asia/Tokyo', 0,
       0, '白ホリ・ナチュラル', 'shot', 412,
       '/Volumes/PHOTO01/2026/個人撮影会/栞奈_1部', 'PHOTO01', 24800,
       'NAS:/photo/archive/2026', (current_date - 58 + time '22:00') at time zone 'Asia/Tokyo', 5,
       'ストロボ1灯＋レフ。表情が良かった'),

      (v_slot_p2, v_user_id, v_sess_past, 2, '2部',
       (current_date - 60 + time '14:15') at time zone 'Asia/Tokyo', 60,
       'finished',
       (current_date - 60 + time '14:18') at time zone 'Asia/Tokyo',
       (current_date - 60 + time '15:18') at time zone 'Asia/Tokyo',
       (current_date - 60 + time '15:20') at time zone 'Asia/Tokyo', 0,
       0, '黒バック・ドラマチック', 'shot', 358,
       '/Volumes/PHOTO01/2026/個人撮影会/みなも_2部', 'PHOTO01', 21300,
       'NAS:/photo/archive/2026', (current_date - 58 + time '22:00') at time zone 'Asia/Tokyo', 4,
       null),

    -- 直近セッション（撮影済み・納品途中）
      (v_slot_r1, v_user_id, v_sess_recent, 1, '1部',
       (current_date - 14 + time '14:00') at time zone 'Asia/Tokyo', 45,
       'finished',
       (current_date - 14 + time '14:00') at time zone 'Asia/Tokyo',
       (current_date - 14 + time '14:45') at time zone 'Asia/Tokyo',
       (current_date - 14 + time '14:47') at time zone 'Asia/Tokyo', 0,
       0, '紅葉・逆光', 'shot', 520,
       '/Volumes/PHOTO02/2026/秋ロケ撮影会/栞奈', 'PHOTO02', 31200,
       null, null, 4, null),

      (v_slot_r2, v_user_id, v_sess_recent, 2, '2部',
       (current_date - 14 + time '15:00') at time zone 'Asia/Tokyo', 45,
       'finished',
       (current_date - 14 + time '15:03') at time zone 'Asia/Tokyo',
       (current_date - 14 + time '16:03') at time zone 'Asia/Tokyo',
       (current_date - 14 + time '16:05') at time zone 'Asia/Tokyo', 15,
       0, '夕景・シルエット', 'shot', 390,
       '/Volumes/PHOTO02/2026/秋ロケ/みなも', 'PHOTO02', 23900,
       null, null, 5, '延長15分。日没ギリギリが一番良かった'),

      (v_slot_r3, v_user_id, v_sess_recent, 3, '3部（2人同時）',
       (current_date - 14 + time '16:15') at time zone 'Asia/Tokyo', 30,
       'finished',
       (current_date - 14 + time '16:15') at time zone 'Asia/Tokyo',
       (current_date - 14 + time '16:45') at time zone 'Asia/Tokyo',
       (current_date - 14 + time '16:46') at time zone 'Asia/Tokyo', 0,
       2000, 'ペア撮影', 'shot', 210,
       '/Volumes/PHOTO02/2026/秋ロケ/ペア_蒼井リオ_七瀬ゆい', 'PHOTO02', 12800,
       null, null, 3, '1枠に複数モデルのケース'),

    -- 未来セッション（タイマー未開始）
      (v_slot_f1, v_user_id, v_sess_future, 1, '1部',
       (current_date + 21 + time '12:00') at time zone 'Asia/Tokyo', 60,
       'idle', null, null, null, 0,
       0, 'クリスマス衣装', 'planned', null, null, null, null, null, null, null, null),

      (v_slot_f2, v_user_id, v_sess_future, 2, '2部',
       (current_date + 21 + time '13:15') at time zone 'Asia/Tokyo', 60,
       'idle', null, null, null, 0,
       0, '私服・ナチュラル', 'planned', null, null, null, null, null, null, null, null),

      (v_slot_f3, v_user_id, v_sess_future, 3, '3部',
       (current_date + 21 + time '14:30') at time zone 'Asia/Tokyo', 60,
       'idle', null, null, null, 0,
       0, null, 'planned', null, null, null, null, null, null, null, '参加モデル未定')
    on conflict (id) do nothing;

    -- ----------------------------------------------------------
    -- 5. slot_models（支払い・納品の単位）
    -- ----------------------------------------------------------
    insert into public.slot_models
      (user_id, slot_id, model_id, costume, fee, extension_fee, payment_status, paid_at, payment_method,
       delivery_status, delivery_deadline, delivered_at, delivery_method, delivery_url,
       selected_count, delivered_count, memo)
    values
      -- 過去セッション: すべて支払い済み・納品済み
      (v_user_id, v_slot_p1, v_model_a, 'ワンピース（白）', 12000, 0, 'paid', current_date - 60, '現金',
       'delivered', current_date - 53, (current_date - 55 + time '23:30') at time zone 'Asia/Tokyo',
       'Google ドライブ', 'https://drive.example.com/kanna-1', 48, 45, null),
      (v_user_id, v_slot_p2, v_model_b, 'セットアップ（黒）', 12000, 0, 'paid', current_date - 60, '現金',
       'delivered', current_date - 53, (current_date - 54 + time '21:00') at time zone 'Asia/Tokyo',
       'Google ドライブ', 'https://drive.example.com/minamo-2', 40, 38, null),

      -- 直近セッション: 納品が残っている（v_pending_deliveries に出る）
      (v_user_id, v_slot_r1, v_model_a, 'ニット＋ロングスカート', 13000, 0, 'paid', current_date - 14, 'PayPay',
       'retouching', current_date - 4, null, 'Google ドライブ', null, 52, null, '期限超過。最優先'),
      (v_user_id, v_slot_r2, v_model_b, 'コート（ベージュ）', 13000, 4000, 'paid', current_date - 14, 'PayPay',
       'selecting', current_date + 3, null, 'ギガファイル便', null, null, null, '延長分あり'),
      (v_user_id, v_slot_r3, v_model_c, 'コスプレ（制服）', 8000, 0, 'unpaid', null, null,
       'not_started', current_date + 7, null, null, null, null, null, '事務所経由で月末振込'),
      (v_user_id, v_slot_r3, v_model_d, 'コスプレ（制服）', 8000, 0, 'paid', current_date - 14, '銀行振込',
       'not_started', current_date + 7, null, null, null, null, null, null),

      -- 未来セッション: 予定のみ
      (v_user_id, v_slot_f1, v_model_a, 'クリスマス衣装（赤）', 13000, 0, 'unpaid', null, null,
       'not_started', current_date + 28, null, null, null, null, null, null),
      (v_user_id, v_slot_f2, v_model_b, null, 13000, 0, 'unpaid', null, null,
       'not_started', current_date + 28, null, null, null, null, null, null),
      (v_user_id, v_slot_f2, v_model_e, null, 13000, 0, 'unpaid', null, null,
       'not_started', current_date + 28, null, null, null, null, null, '初回撮影')
    on conflict (slot_id, model_id) do nothing;

    raise notice 'CamFlow シードデータの投入が完了しました (user_id=%)', v_user_id;
  end if;
end;
$$;
