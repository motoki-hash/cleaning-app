-- ============================================================================
-- PJ予算管理アプリ パッチ 013
-- 内容: VE（採用）の反映方法を変える
--   今まで: 採用すると、カテゴリーの「最新予算」を直接減らしていた
--           （最新予算が0円のカテゴリーでは、減額が切り捨てられて反映されず、削除すると逆に増えていた）
--   これから: 最新予算（内訳の合計）はそのままにして、採用したVEの金額は表示・計算のときに差し引く
--           （採用・取り消し・削除を何度しても、金額がずれない）
--
-- このパッチは、過去にVEの採用・削除で最新予算が動いた分を、元に戻す。
-- 予算変更履歴（pjb_cost_changes）に残っている「VE…」の変更の合計を、最新予算から取り除く。
-- 1回だけ実行してください（2回実行すると、二重に戻ってしまいます）。
--
-- 適用方法: Supabase Dashboard の SQL Editor でこのファイルの内容を実行してください。
-- ============================================================================

UPDATE pjb_budget_categories c
SET latest_budget = GREATEST(c.latest_budget - s.net, 0),
    updated_at = now()
FROM (
  SELECT category_id, SUM(COALESCE(after_amount, 0) - COALESCE(before_amount, 0)) AS net
  FROM pjb_cost_changes
  WHERE reason LIKE 'VE%'
  GROUP BY category_id
) s
WHERE c.id = s.category_id AND s.net <> 0;

NOTIFY pgrst, 'reload schema';
