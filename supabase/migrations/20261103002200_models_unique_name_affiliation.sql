-- CamFlow: モデルをモデル名と所属の組み合わせで見分ける
--
-- 撮影会ごとに同じ名前の別人がいる。予約・確定・過去撮影の入力では、
-- モデル名と撮影会名の組み合わせが新しければ、撮影会名を所属にした別のモデルとして登録する。
-- これまでの「同じ名前は1人」の一意制約では登録できないので、所属を含めた一意制約に替える。

drop index public.models_user_id_name_key;

-- 所属が NULL のモデルどうしも重複させないため coalesce する（NULL は一意制約では別物扱いになる）
create unique index models_user_id_name_affiliation_key
  on public.models (user_id, lower(name), lower(coalesce(affiliation, '')))
  where deleted_at is null;
