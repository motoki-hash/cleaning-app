-- パッチ032：FFE発注リストに「部屋」の列を追加
--   ・pjb_ffe_items に room（どの部屋の品目か／共通か）を追加
--   ・空欄＝未設定、「共通」＝全部屋で共通の品目。部屋名は自由に入力（例：101、客室A、共用部）
ALTER TABLE pjb_ffe_items ADD COLUMN IF NOT EXISTS room TEXT NOT NULL DEFAULT '';
