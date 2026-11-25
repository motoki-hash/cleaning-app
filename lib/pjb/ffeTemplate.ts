// FFE・OSE発注リストの雛形（スプレッドシート「発注リストformat_202607~」の中身）
// 「雛形から入れる」で、この品目を、いまの案件に追加する。
//
// 1行の書き方（縦棒で区切る）：
//   購入先|商品|規格|カラー|入数|数量|URL|備考|単価（税込）
//   ・「@発注者|社内発注担当|ステータス」の行で、以下の行の既定値を切り替える（B＝BNS、D＝デザイナー、S＝セカイズ、未＝未選定、済＝選定済）
//   ・「#小見出し」の行で、小見出しを切り替える
//   ・URLの「a:」は https://amzn.asia/d/ の省略
import { FFE_CATEGORIES, blankItem, type FfeItem } from './ffe'

type NewItem = Omit<FfeItem, 'id' | 'project_id' | 'sort_order'>

const ORDERER: Record<string, string> = { B: 'BNS', D: 'デザイナー', S: 'セカイズ' }
const STATUS: Record<string, string> = { 未: '未選定', 済: '選定済' }

function parse(category: string, text: string): NewItem[] {
  const out: NewItem[] = []
  let section = ''
  let orderer = 'BNS', staff = '', status = '未選定'
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) { section = line.slice(1).trim(); continue }
    if (line.startsWith('@')) {
      const [o, s, st] = line.slice(1).split('|')
      orderer = ORDERER[o] ?? o
      staff = s ?? ''
      status = STATUS[st] ?? st ?? '未選定'
      continue
    }
    const [vendor, name, spec, color, pack, qty, url, note, unit] = line.split('|')
    const base = blankItem('', category, section, 0, orderer) as NewItem & { project_id?: string; sort_order?: number }
    delete base.project_id
    delete base.sort_order
    out.push({
      ...base, staff, status, vendor: vendor ?? '', name: name ?? '', spec: spec ?? '', color: color ?? '', pack_qty: pack ?? '',
      qty: Number(qty) || 0, url: url?.startsWith('a:') ? `https://amzn.asia/d/${url.slice(2)}` : (url ?? ''), note: note ?? '', unit_price: Number(unit) || 0,
    })
  }
  return out
}

// ---- 家具・照明（手配する人で、発注者と、一部の備考が変わる）----
export type FurnitureBy = 'BNS' | 'デザイナー'
function furniture(by: FurnitureBy): NewItem[] {
  const d = by === 'デザイナー'
  const who = d ? 'D' : 'B'
  const dn = d ? 'デザイナー選定' : ''
  const text = `
@${who}||未
#テーブル&チェア
|ソファ||||1|||250000
|1Pソファ||||2|||50000
|ローテーブル|大|||1|||60000
|ローテーブル|小|||1|||40000
|ダイニングチェア||||6|||25000
|ダイニングテーブル||||0||施工orFFEを確認|120000
|バルコニーテーブル＆チェア||||0||案件による|20000
#客室備品
|コートハンガー||||1|||25000
|洗面ミラー||||2|||15000
|姿見ミラー||||1|||20000
|収納キャビネット||||1|||25000
|レースカーテン||||1||施工orFFEを確認|35000
|遮光カーテン||||1||施工orFFEを確認|35000
Amazon|カーテンふさかけ||||2|https://www.amazon.co.jp/dp/B003SNTFB6||980
|洗面ゴミ箱||||1|a:09CuTukn||6930
|ベッドスロー|要カラー選定|||3|a:9JFB1WQ||2080
|ティッシュカバー||||1|https://www.fiq-online.com/item_Products.php?id=jeuPtHFbGiJFAyuf0t2RTXNx4I4n8BeV||3520
|ティッシュケース|illi Hotels用|||1|https://item.rakuten.co.jp/sutekimenu/5817/||3200
#意匠備品
|マルニ額縁|illi ロゴポスター額 A1||| 1|https://www.art-maruni.com/products/list?parent_product_id=22037|要カラー選定|11440
|アート|造作or写真|||1|||110000
|クッション||||4|||3000
|クッション中材||||4|||2500
|ラグ||||0||案件による|30000
|意匠ミラー||||0||案件による|20000
|植物||||0||案件による|10000
#水回り備品
|脱衣所バスタオル掛け||||1||${dn}|5000
|洗面ハンドタオル掛け||||1||${dn}|5000
|洗面ポーチフック||||1|a:2mqp7st|${dn}|5000
#配送料他
|家具配送料一式||||1||${d ? '' : '※発注リストFIX時削除'}|50000
${d ? '' : '|フライミー配送料||||1|||50000'}
#BNS手配（家具をデザイナーが手配する場合も、BNSで手配）
@B||未
Graphic|illi ロゴポスター|マット合成紙&マットラミネート加工|||1|https://www.graphic.jp/||4380
`
  return parse('家具', text)
}

// ---- 家電 ----
const APPLIANCE = `
@B||未
YAMADA|ドラム式洗濯乾燥機|右開き|||1|https://www.yamada-denkiweb.com/404833037/|AQUA8kg/4.5kg|148320
YAMADA|ドラム式洗濯乾燥機|左開き|||1|https://www.yamada-denkiweb.com/404833013/|AQUA8kg/4.5kg|148320
その他EC|ドラム式洗濯乾燥機|高さが小さいもの|BLK||1|https://www.xprice.co.jp/d.php?id=300000153512101&status=1|MAXZEN12kg/6kg|119980
YAMADA|電子レンジ||||1|a:1vg1s9x|TWINBIRD|13640
YAMADA|ヘアドライヤー①||BLK||2|a:02ebj9EB|サロニア|6226
YAMADA|アイロン台||||1|a:2s8rVEw|山崎実業|6600
BNS按分|アイロン||||1|a:0ep502j|SURE男前|6600
BNS按分|電気ケトル①||||1|a:0c5EfLLv|Russel Hobbs|7920
@S||未
Amazon|電気ケトル②||カッパー||1|a:02Y0iQZG|APIN ITNL|9800
@B||未
JTB|空気清浄機||BLK||1|https://prospe.net/product/detail?product_id=42134|SHARP|28600
JTB|空気清浄機||WHT||1|https://prospe.net/product/detail?product_id=42132|SHARP|28600
@S||未
Amazon|チューナーレスTV|55型|||1|a:aLLhiWw||52450
Amazon|テレビ壁掛け金具||||1|a:6iKohwF||4399
Amazon|冷凍冷蔵庫||||1|a:5TxSVym|illi Stays|23990
その他EC|冷蔵庫|右ヒンジ|||1|https://www.monotaro.com/p/5263/6275/|illi Hotels|25278
その他EC|冷蔵庫|左ヒンジ|||1|https://www.monotaro.com/p/5263/6284/|illi Hotels|25278
@B||未
YAMADA|掃除機|客室用|||1|a:0aVB6Zub|TWINBIRD|10000
@S||未
Amazon|掃除機|共用部用|||1|a:08vwkRiu||20460
Amazon|インパクトドライバー|HIKOKI|||1|a:2XhKYUi|必要不要は案件次第|14877
Amazon|インパクトビット||||1|a:f0FJUIo|必要不要は案件次第|1399
Amazon|脱臭機||||1|a:8XkrlHr|駆け付けに１台|14980
@B||未
YAMADA|充電コード|タブレット用|||2|a:e6JalUE|Anker|1529
YAMADA|充電器|タブレット用|||2|a:6kaci8S|Anker|1568
`

// ---- 客室備品 ----
const ROOM_SUPPLIES = `
@S|PA|未
#キッチン
Amazon|箸|BLK||10膳入り|1|https://www.amazon.co.jp/dp/B0C57Z1542||891
IKEA|カトラリー|||1cs4ヶ入り|2|https://www.ikea.com/jp/ja/p/mopsig-16-piece-cutlery-set-80343004/||999
Amazon|ティースプーン|||1cs6本入り|2|a:0fuiUa0s|illi Hotels用|653
Amazon|タンブラー|||1cs6個入り|4|a:053Qo9Gl|タンブラー|1976
Amazon|ワイングラス|||1cs6個入り|4|https://www.amazon.co.jp/dp/B00FOIY0TK|コブレット|5258
Amazon|食器セット|||1cs2人用|3|a:2bUiVvX|illi Stays用|3158
Amazon|マグカップ||||6|a:05OakyAs|illi Hotels用|1540
Amazon|ソムリエナイフ||||4|a:05ar2Y9a||1099
Amazon|お玉||||4|a:5iHl1TC||684
Amazon|トング||||4|a:8SA5pvd||2000
Amazon|スパチュラ||||4|a:4q2fcqS||2970
Amazon|はさみ||||4|a:bS3AHQf||2480
Amazon|ぺティーナイフ||||4|a:hIc8oAD||2750
Amazon|包丁ケース（ぺティー）||||4|https://item.rakuten.co.jp/passageshop/10011800/||1670
Amazon|まな板||||4|a:jk4e31G||2701
Amazon|ステンレスボール・ボウル||||4|a:0i1Fj8lo||2055
Amazon|キッチンロールホルダー|BLK|||4|a:00YJH1xh||1650
Amazon|ゴミ箱①|BLK|||8|https://www.amazon.co.jp/dp/B0868L8BF2|横向き|3960
Amazon|ゴミ箱②|BLK|||8|a:0b1djrTF|縦向き|2491
Amazon|ゴミ箱③||||8|https://item.rakuten.co.jp/model-bon/dtb600047/|プッシュ式/細身|5380
Amazon|鍋/フライパンセット||||4|a:gCAHic1||12980
IKEA|食器用水切りラック||||4|https://www.ikea.com/jp/ja/p/lillhavet-multifunctional-dish-rack-anthracite-60503475/||1999
無印良品|食器用洗剤 容器||||4|https://www.muji.com/jp/ja/store/cmdty/detail/4550344144985||390
#洗面・トイレ
@B|LCM|未
BNS按分|洗面コップ||||6|||264
@S|PA|未
楽天市場|ペーパータオルホルダー|サンドホワイト|||4|https://item.rakuten.co.jp/yamayuu/id-torel110/||4400
楽天市場|トイレットペーパーストックホルダー||||4|https://item.rakuten.co.jp/favoritestyle/00003788/||7590
Amazon|サニタリー用ゴミ箱|BLK|||4|a:0sF2xXq||3267
楽天市場|洗濯かご①||||4|https://item.rakuten.co.jp/parusu-2/pato8861-291t061815-149-cspa2408/||3810
Amazon|洗濯かご②||||4|a:05QwL8ud||1280
IKEA|トイレブラシ||||4|https://www.ikea.com/jp/ja/p/ekoln-toilet-brush-beige-70493008/||1499
IKEA|タオルハンガー||||4|https://www.ikea.com/jp/ja/p/jaell-drying-rack-in-outdoor-white-00242891/||999
無印良品|小物入れ||||8|https://www.muji.com/jp/ja/store/cmdty/detail/4550182220223||590
#玄関・リビング
@B|LCM|未
JTB|靴べら||||4|||2420
JTB|ハンガー||||6|||495
JTB|ハンガー||||6|||473
JTB|スリッパ(26.5)||||6|https://www.monotaro.com/p/1917/6736/|合皮スリッパ Lサイズ（26.5cm）|1188
JTB|スリッパロット割れ手数料||||1|||165
@S|PA|未
楽天市場|変圧器（1部屋2個）||||8|a:iauPTIn||860
Amazon|延長コード||||4|a:0dV9sZOH||2530
Amazon|アクリルスタンド||||8|a:28GkeXp|サイン計画次第|3160
Amazon|アクリルスタンド||||4|a:0RuzFRs|サイン計画次第|2060
Amazon|スリッパラック||||4|https://www.amazon.co.jp/dp/B002TUK0GS||3594
Amazon|傘立て||||4|a:0fyKuPJb||3300
`

// ---- 運営関係 ----
const OPERATIONS = `
@B|PA|未
#システム機器
その他EC|チェックイン用タブレット|Aグレード|スペースグレー32GB||1|https://www.backmarket.co.jp/ja-jp/p/ipad-2021-a13-series|https://amzn.asia/d/00C6Mpap|30000
その他EC|チェックインタブレットケース||||1|https://www.amazon.co.jp/dp/B0BCNMXXK8||6050
@B|LCM|未
その他メーカー品|パニックオープン設置費||||1|||401390
BCL|リモートロック・KEYVOX||||1|||81000
BCL|単体買い出精値引き||||1|||-8099
BCL|送料||||1|||1980
キャトルプラン|監視カメラ||||2|||12100
キャトルプラン|NVR||||1|||52800
キャトルプラン|HUB||||1|||25300
キャトルプラン|無線アクセスポイント||||1|||29700
キャトルプラン|ルーター||||1|||12100
キャトルプラン|設定費用||||1|||150000
キャトルプラン|出精値引き||||1|||0
その他メーカー品|NTT工事費||||1|||22880
#運営準備
@S|PA|未
Amazon|工具セット||||1|a:0f3s6siw||6980
Amazon|脚立||||1|a:0fbhpkmL||5886
Amazon|火災報知器セーフティー①|平|||1|a:702MW4n|PM要確認|3000
Amazon|火災報知器セーフティー②|立体|||1|a:0eyYCXio|PM要確認|3445
その他EC|消火器カバー||||1|https://pieceofsign.jp/products/fire-extinguisher-cover?variant=42400727728306|向き・個数確認|17380
Amazon|キーボックス||||1|a:3nKP358||3709
@B|LCM|未
その他EC|A看板||||1||施設名決まり次第発注|24000
その他EC|A看板特急料金||||1||施設名決まり次第発注|5000
その他EC|クリエイティブデザイン||||1|||50000
その他EC|クリエイティブマテリアル||||1|||50000
@S|PA|未
Amazon|ゴミ回収BOX||||1|a:05t0FDrQ||21600
@B|LCM|未
その他メーカー品|ゴミ初期保証料||||1|||100000
#保健所検査用
@S|PA|済
ニトリ|駆け付け事務所デスク|ハイタイプ|||1|https://www.nitori-net.jp/ec/product/8761101s/|駆け付け事務所による|3600
Amazon|駆け付け事務所チェア||||3|https://www.nitori-net.jp/ec/product/8700457s/|駆け付け事務所による|1290
Amazon|保健所検査用リネンラック||||1|a:iLf6bYM|駆け付け事務所による|17702
Amazon|折り畳みマットレス||||1||駆け付け事務所による|0
Amazon|折り畳みマットレス収納ケース||||1||駆け付け事務所による|0
@S|PA|未
Amazon|リネン収納ケース||||1|a:05Y0MdrQ|駆け付け事務所による|2790
#寝具・リネン
@B|LCM|未
JTB|マットレス①|ダブル/210厚|||3|||40480
JTB|マットレス②|ダブル/300厚|||3|||46750
JTB|送料/搬入設置費||||1|||0
ニッケ商事|マットレス③|ダブル|||3|||46750
@S|PA|未
Amazon|マットレス④|ダブル|||3|a:027YPiHD|ゴクミン|34998
@B|LCM|未
ニッケ商事|マットレスパッド|ダブル・ホワイト|||3|||2640
ニッケ商事|デュベ|クイーン|||3|||11000
ニッケ商事|枕ハード||||6|||1870
ニッケ商事|枕ソフト||||6|||880
ニッケ商事|送料||||1|||1650
その他メーカー品|リネン初期保証料||||1|||100000
#アメニティー
BNS按分|ディスペンサー(シャンプー)|空容器|||6|||220
BNS按分|バルク(シャンプー)|5L|||5|||2750
BNS按分|ディスペンサー(コンディショナー)|空容器|||6|||220
BNS按分|バルク(コンディショナー)|5L|||5|||2750
BNS按分|ディスペンサー(ボディーウォッシュ)|空容器|||6|||220
BNS按分|バルク(ハンド&ボディーウォッシュ)|5L|||9|||2750
BNS按分|ディスペンサー(ハンドウォッシュ)|空容器|||10|||220
BNS按分|ディスペンサー(ボディーローション)|空容器|||6|||220
BNS按分|バルク(ボディーローション)|5L|||5|||2750
BNS按分|スキンケアセット|||1cs60入|60||illiコラボ|429
その他メーカー品|スキンケアセット|||1cs60入|60||既製品|429
BNS按分|耳栓|||1cs500入|1|||7040
BNS按分|BOX歯ブラシ|||1cs250入|250|https://www.amazon.co.jp/dp/B09NC2DV1P||65
Amazon|ミネラルウォーター①|||1cs6入|10|a:0g9sKCKX||1264
JTB|ミネラルウォーター②|最小ロット240|||240|a:0g9sKCKX||81
Amazon|ポップコーン|||1cs3個入|20|a:0fu3WuD5||699
Amazon|ドリップバックコーヒー(赤)|||1cs100入|1|a:06VDvIsr|illi Stays|3799
Amazon|ドリップバックコーヒー(緑)|||1cs100入|1|a:0hdwY2cT|illi Stays|3898
Amazon|ドリップバックコーヒー(青)|||1cs100入|1|a:02kvDtUe|illi Stays|3677
Amazon|スティックコーヒー|||1cs100入|1|a:0icDik54|illi Hotels|3114
Amazon|スティックコーヒー(カフェインレス)|||1cs50入|1|a:08LaSmnE|illi Hotels|2376
JTB|シュガー|||1cs200入|1|||1265
Amazon|マリーム|||1cs100入|1|a:06qtV0Rs||872
@S|PA|未
Amazon|小瓶|||1cs2個入|1|a:hrtQ7Mh||5089
Amazon|お菓子トレー|35×25×2.2|||1|a:0jELWMU||4199
#消耗品
Amazon|ジェルボール||||4|a:01QGdIAw||1699
Amazon|キュキュット 詰替用||||1|a:0jcbY7oX||2710
Amazon|食器用スポンジ||||1|https://www.amazon.co.jp/dp/B09Z99TS15||121
Amazon|キッチンペーパー||||2|a:07gGJmk0||1984
Amazon|トイレットペーパー||||2|a:08VItktr||3148
Amazon|ティッシュペーパー①|||1cs24pc入|1|a:6mxiDHo||2603
Amazon|ティッシュペーパー②|||1cs5個入|6|a:03pe8rGZ||999
Amazon|ハンドタオル(スリムタイプ)|||1cs36pc入|1|a:04pco96Y||5400
Amazon|ハンドタオル(ワイドタイプ)||||1|a:08rpaEX3||5430
Amazon|水切りネット||||1|a:0dSWrIUS||1516
Amazon|45Lゴミ袋(橙)|キッチン|||10|a:0fkFA9jU||284
Amazon|20Lゴミ袋(白)|洗面|||1|a:5BS0k3N||803
Amazon|ゴミ袋 (トイレコーナー用)||||1|a:4BYkteC||478
#清掃備品
Amazon|清掃収納用ラック大|W100|||2|a:0dKbvjoy||10990
Amazon|収納ケース①||||4|a:6QkYSQ1||858
Amazon|収納ケース②||||8|a:3LcsMWP||891
Amazon|コンテナ||||2|a:exjZZcx||848
Amazon|メンテナンスバケツ|テラモト|||2|a:2NXs4EI||2970
Amazon|リセッシュ ボトル||||1|a:03YbWkpR||450
Amazon|リセッシュ 詰替用||||1|a:07ZK5iJ0||1167
Amazon|マイペット ボトル||||1|a:5uhseJK||306
Amazon|マイペット 詰替用||||1|a:0hNLABBy||1540
Amazon|バスマジックリン ボトル||||1|a:22a5hLU||330
Amazon|バスマジックリン 詰替用||||1|a:06Mqnw3v||2070
Amazon|トイレマジックリン ボトル||||1|a:0aWiIGXD||330
Amazon|トイレマジックリン 詰替用||||1|a:06IOgRxJ||1997
Amazon|ガラスマジックリン ボトル||||1|a:4HHvUG2||350
Amazon|ガラスマジックリン 詰替用||||1|a:0fh2UEOz||1815
Amazon|キッチンマジックリン ボトル||||1|a:1GBsVO1||380
Amazon|キッチンマジックリン 詰替用||||1|a:00gHQsmH||1480
Amazon|キッチンアルコール ボトル||||1|a:b06oSUE||1450
Amazon|キッチンアルコール 詰替用||||1|a:0hLcrkn2||3920
Amazon|カビキラー||||1|a:0j1l4cf0||999
Amazon|ハイター||||1|a:0hswyR37||364
Amazon|ドメスト||||1|a:07Cw2kMk||859
Amazon|クエン酸|ケトル清掃用|||1|a:0fArTuc1||299
Amazon|激落ちくん||||1|a:064oFBuq||800
Amazon|パイプユニッシュ||||1|a:0BCpUQL||1330
Amazon|ニトリル手袋||||1|a:0vCVlYv||1501
Amazon|コロコロ（ロング）||||1|a:3fBymor||4770
Amazon|コロコロ||||1|a:gugJS50||1776
Amazon|コロコロ替え|大|||1|a:adfqub2||2817
Amazon|コロコロ替え|小|||3|a:0gB7V4a3||1067
Amazon|トイレ用ウェットシート||||1|a:iRHIvhN||1980
Amazon|トイレブラシ|清掃用|||1|a:idyg8wJ||660
Amazon|ほうき＆ちりとり||||1|a:0aeqWfTV||2420
Amazon|モップ||||1|a:0a5T4taK||7975
Amazon|伸縮フローリングワイパー|業務用|||1|a:c8xXPVB||3046
Amazon|フローリングウェットシート|業務用|||1|a:3DIOyhC||1840
Amazon|フローリングドライシート|業務用|||1|a:eozK3hU||1884
Amazon|伸縮フローリングワイパー|通常サイズ|||1|a:09GNonOJ||1408
Amazon|フローリングウェットシート|通常サイズ|||1|a:0j2ioLWb||1085
Amazon|フローリングドライシート|通常サイズ|||1|a:04wDvMrc||590
Amazon|クイックルワイパー|本体|||1|a:clGMpvJ||747
Amazon|クイックルワイパー|詰替|||1|a:01gqZfve||1416
Amazon|埃とり-ハンディー||||1|a:2uX1wOQ||1705
Amazon|埃とり-ロング||||1|a:fBXytfV||2567
`

// ---- 諸経費 ----
const EXPENSES = `
@B|PA|未
|撮影費||||2|||49500
|サイン（部屋・ロゴ）||||1|||40000
|防火管理 外部委託初期費用||||1|||70000
@S|PA|未
|セカイズ代理発注費用|商品代金の10%|||1|||80000
|セカイズ家具搬入設置費用|先行納品|||1|||33000
|セカイズ家具搬入設置費用|本納品|||1|||66000
`

export const TEMPLATE_CATEGORIES = ['家具', '家電', '客室備品', '運営関係', '諸経費'] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

// 雛形の品目を、選んだ区分ぶん作る
export function templateItems(cats: readonly string[], furnitureBy: FurnitureBy): NewItem[] {
  const out: NewItem[] = []
  for (const c of FFE_CATEGORIES) {
    if (!cats.includes(c)) continue
    if (c === '家具') out.push(...furniture(furnitureBy))
    else if (c === '家電') out.push(...parse('家電', APPLIANCE))
    else if (c === '客室備品') out.push(...parse('客室備品', ROOM_SUPPLIES))
    else if (c === '運営関係') out.push(...parse('運営関係', OPERATIONS))
    else if (c === '諸経費') out.push(...parse('諸経費', EXPENSES))
  }
  return out
}
