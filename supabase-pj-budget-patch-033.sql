-- パッチ033：納品物一覧（投資家向けの品目カード）のための列を追加
--   ・pjb_ffe_items    に maker（メーカー）・model_no（品番）
--   ・pjb_ffe_settings に property_name（物件名）・address（住所）… 納品物一覧の表紙に使う
--   既存のデータには手を加えません（何度実行しても安全です）。
ALTER TABLE pjb_ffe_items ADD COLUMN IF NOT EXISTS maker TEXT NOT NULL DEFAULT '';
ALTER TABLE pjb_ffe_items ADD COLUMN IF NOT EXISTS model_no TEXT NOT NULL DEFAULT '';
ALTER TABLE pjb_ffe_settings ADD COLUMN IF NOT EXISTS property_name TEXT NOT NULL DEFAULT '';
ALTER TABLE pjb_ffe_settings ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
NOTIFY pgrst, 'reload schema';
