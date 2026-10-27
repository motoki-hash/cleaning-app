// 事業計画シートの「予定値」タブ → PJ予算管理アプリ（年度の売上分析）の計画へ、自動で取り込む。
// 使い方は、アプリ側の案内（README or チャット）を参照。シートの「拡張機能 → Apps Script」に貼り付けて使う。

const SHEET_NAME = '予定値';
const APP_URL_KEY = 'APP_URL';
const SECRET_KEY = 'PJB_SYNC_SECRET';
const LAST_HASH_KEY = 'LAST_HASH';

// シートの行の名前 → アプリの事業名
const BUSINESS_MAP = {
  'ホテルPM': 'illi Stays & Hotels',
  'SUO': 'Setup Office',
  'ConceptK': 'Kyo Residence',
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('PJ予算管理')
    .addItem('今すぐアプリに反映', 'syncNow')
    .addItem('初期設定（1回だけ）', 'setup')
    .addToUi();
}

// 初期設定：アプリのURLと合言葉を保存し、10分ごとの自動反映を登録する
function setup() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const u = ui.prompt('アプリのURL', '例）https://bns-pj.vercel.app', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  const s = ui.prompt('合言葉', 'Vercelに登録した PJB_SYNC_SECRET と同じ文字列を入力', ui.ButtonSet.OK_CANCEL);
  if (s.getSelectedButton() !== ui.Button.OK) return;
  props.setProperty(APP_URL_KEY, u.getResponseText().trim().replace(/\/+$/, ''));
  props.setProperty(SECRET_KEY, s.getResponseText().trim());
  props.deleteProperty(LAST_HASH_KEY);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncAuto').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncAuto').timeBased().everyMinutes(10).create();
  syncNow();
}

function syncAuto() { sync_(false); }
function syncNow() { sync_(true); }

function sync_(verbose) {
  const ui = verbose ? SpreadsheetApp.getUi() : null;
  try {
    const props = PropertiesService.getScriptProperties();
    const appUrl = props.getProperty(APP_URL_KEY);
    const secret = props.getProperty(SECRET_KEY);
    if (!appUrl || !secret) throw new Error('先に「PJ予算管理 → 初期設定」を実行してください');

    const payload = readPlans_();
    const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(payload)));
    if (!verbose && hash === props.getProperty(LAST_HASH_KEY)) return;   // 変わっていなければ送らない

    const res = UrlFetchApp.fetch(appUrl + '/api/pjb/fy-plans', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-pjb-sync-secret': secret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code !== 200) throw new Error('アプリが受け付けませんでした（' + code + '）：' + res.getContentText());
    props.setProperty(LAST_HASH_KEY, hash);
    if (ui) ui.alert(payload.fiscal_year + '年度の計画を、アプリに反映しました（' + payload.plans.length + '件）');
  } catch (e) {
    if (ui) ui.alert('反映できませんでした：' + e.message);
    else console.error(e);
  }
}

// 「予定値」タブから、年度と、事業ごと・月ごとの売上／原価を読む。
// 年度は D1（例：「26年度」）から、月は2行目の合計の右隣から12列（4月〜3月）。
// 売上は「売上高」と「売上原価」の間の行、原価は「売上原価」と「売上総利益」の間の行から、名前で探す（行がずれても動く）。
function readPlans_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('「' + SHEET_NAME + '」のタブが見つかりません');
  const values = sheet.getDataRange().getValues();

  const m = String(values[0][3]).match(/(\d{2,4})\s*年度/);
  if (!m) throw new Error('D1セルに「26年度」のような年度が見つかりません');
  const fiscalYear = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);

  const label = r => values[r].slice(0, 3).map(x => String(x).trim()).filter(Boolean).pop() || '';
  const findRow = (name, from) => { for (let r = from; r < values.length; r++) if (label(r) === name) return r; return -1; };
  const sales = findRow('売上高', 0), cost = findRow('売上原価', sales + 1), gross = findRow('売上総利益', cost + 1);
  if (sales < 0 || cost < 0 || gross < 0) throw new Error('「売上高」「売上原価」「売上総利益」の行が見つかりません');

  const num = v => { const n = Number(String(v).replace(/[,¥\s]/g, '')); return isFinite(n) ? n : 0; };
  const pick = (from, to, name) => { for (let r = from + 1; r < to; r++) if (label(r) === name) return r; return -1; };
  const plans = [];
  Object.keys(BUSINESS_MAP).forEach(name => {
    const rs = pick(sales, cost, name), rc = pick(cost, gross, name);
    if (rs < 0 || rc < 0) throw new Error('「' + name + '」の行が見つかりません');
    for (let i = 0; i < 12; i++) {
      plans.push({ business: BUSINESS_MAP[name], month: i + 1, sales: num(values[rs][4 + i]), cost: num(values[rc][4 + i]) });
    }
  });
  return { fiscal_year: fiscalYear, plans: plans };
}
