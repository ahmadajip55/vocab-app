/**
 * Small offline dictionary (reading -> kanji) used when Google Input Tools
 * cannot be reached. It only covers common beginner words; the online
 * service handles everything else. One entry per line: "reading kanji,kanji".
 */
const RAW = `
あい 愛
あう 会う,合う
あお 青
あか 赤
あかるい 明るい
あき 秋
あける 開ける
あさ 朝
あし 足,脚
あした 明日
あそぶ 遊ぶ
あたま 頭
あたらしい 新しい
あつい 暑い,熱い,厚い
あと 後
あなた 貴方
あに 兄
あね 姉
あまい 甘い
あめ 雨,飴
あらう 洗う
ありがとう 有難う
あるく 歩く
いえ 家
いく 行く
いけ 池
いしゃ 医者
いす 椅子
いそがしい 忙しい
いたい 痛い
いち 一
いちば 市場
いっしょ 一緒
いま 今
いもうと 妹
いろ 色
うた 歌
うたう 歌う
うみ 海
うる 売る
うれしい 嬉しい
え 絵
えいが 映画
えいご 英語
えき 駅
おいしい 美味しい
おおい 多い
おおきい 大きい
おかね お金
おくる 送る
おこる 怒る
おしえる 教える
おす 押す
おそい 遅い
おとうと 弟
おとこ 男
おとな 大人
おなか お腹
おべんとう お弁当
おぼえる 覚える
おもい 重い
おもう 思う
おもしろい 面白い
おわる 終わる
おんがく 音楽
おんな 女
かいぎ 会議
かいしゃ 会社
かいもの 買い物
かう 買う,飼う
かえる 帰る,変える
かお 顔
かぎ 鍵
かく 書く,描く
がくせい 学生
がっこう 学校
かぜ 風,風邪
かぞく 家族
かた 方,肩
かばん 鞄
かみ 紙,髪,神
かようび 火曜日
から 空
からだ 体
かりる 借りる
かわ 川,皮
かんがえる 考える
かんじ 漢字
き 木,気
きく 聞く,聴く
きた 北
きって 切手
きっぷ 切符
きのう 昨日
きゅうにゅう 牛乳
きょう 今日
きょうしつ 教室
きょうだい 兄弟
きらい 嫌い
きる 切る,着る
きれい 綺麗
ぎんこう 銀行
くすり 薬
くだもの 果物
くち 口
くつ 靴
くに 国
くる 来る
くるま 車
くろ 黒
けいざい 経済
けさ 今朝
けっか 結果
けっこん 結婚
げつようび 月曜日
げんき 元気
けんきゅう 研究
こうえん 公園
こうこう 高校
こえ 声
ごご 午後
こころ 心
ごぜん 午前
こたえ 答え
こと 事
こども 子供
ことし 今年
ことば 言葉
ごはん ご飯
さいふ 財布
さかな 魚
さがす 探す
さき 先
さくら 桜
さむい 寒い
さん 三
さんぽ 散歩
し 四,死,詩
じかん 時間
しけん 試験
じしょ 辞書
しごと 仕事
しお 塩
した 下,舌
しち 七
しつもん 質問
じてんしゃ 自転車
じどうしゃ 自動車
しぬ 死ぬ
しま 島
しめる 閉める
しゃかい 社会
しゃしん 写真
じゅう 十
じゆう 自由
しゅくだい 宿題
しょくじ 食事
しる 知る
しろ 白,城
しんじる 信じる
しんぶん 新聞
すき 好き
すくない 少ない
すこし 少し
すむ 住む
すわる 座る
せ 背
せいかつ 生活
せいこう 成功
せいじ 政治
せかい 世界
せつめい 説明
せんしゅう 先週
せんせい 先生
せんそう 戦争
ぜんぶ 全部
そと 外
そら 空
たいせつ 大切
だいがく 大学
だいすき 大好き
だいじ 大事
たかい 高い
たくさん 沢山
たす 足す
たつ 立つ
たべもの 食べ物
たべる 食べる
たまご 卵
たんじょうび 誕生日
ちいさい 小さい
ちかい 近い
ちから 力
ちず 地図
ちち 父
つかう 使う
つかれる 疲れる
つぎ 次
つく 着く
つくる 作る,造る
つとめる 勤める
つま 妻
つめたい 冷たい
て 手
でる 出る
でんき 電気
でんしゃ 電車
でんち 電池
でんわ 電話
てがみ 手紙
てつだう 手伝う
てんき 天気
と 戸
とうきょう 東京
とうふ 豆腐
とけい 時計
とし 年,都市
ともだち 友達
とまる 止まる
とり 鳥
とる 取る,撮る
どようび 土曜日
どりょく 努力
ないよう 内容
なく 泣く,鳴く
なつ 夏
ならう 習う
ならべる 並べる
なまえ 名前
なに 何
に 二
にく 肉
にし 西
にほん 日本,二本
にほんご 日本語
にもつ 荷物
にんげん 人間
にわ 庭
ねこ 猫
ねる 寝る
ねん 年
のむ 飲む
のる 乗る
は 歯,葉
はいる 入る
はこ 箱
はし 橋,箸
はじめて 初めて
はじめる 始める
はしる 走る
はたらく 働く
はな 花,鼻
はなす 話す
はなれる 離れる
はは 母
はやい 早い,速い
はる 春
はれ 晴れ
ばん 晩,番
ばんごはん 晩ご飯
ひ 日,火
ひかり 光
ひがし 東
ひく 引く,弾く
ひこうき 飛行機
ひだり 左
ひと 人
ひとつ 一つ
ひま 暇
ひる 昼
ひろい 広い
ふゆ 冬
ふるい 古い
ぶんか 文化
ぶんしょう 文章
へいわ 平和
へや 部屋
べんきょう 勉強
べんり 便利
ほうほう 方法
ぼうし 帽子
ほん 本
ほんとう 本当
ほんや 本屋
まいあさ 毎朝
まいにち 毎日
まえ 前
まち 町,街
まつ 待つ
まど 窓
まっすぐ 真っ直ぐ
みぎ 右
みず 水
みせ 店
みち 道
みっつ 三つ
みつける 見つける
みなみ 南
みみ 耳
みらい 未来
みる 見る,観る
むずかしい 難しい
め 目
めがね 眼鏡
もくひょう 目標
もくようび 木曜日
もの 物,者
もん 門
もんだい 問題
やさしい 優しい,易しい
やすい 安い
やすみ 休み
やま 山
ゆうびんきょく 郵便局
ゆうめい 有名
ゆき 雪
ゆめ 夢
よぶ 呼ぶ
よむ 読む
よる 夜
らいげつ 来月
らいしゅう 来週
らいねん 来年
りゆう 理由
りょうり 料理
りょこう 旅行
りんご 林檎
れきし 歴史
れんしゅう 練習
わかる 分かる
わすれる 忘れる
わたし 私
わたくし 私
わらう 笑う
わるい 悪い
`;

/** @type {Map<string, string[]>} */
const ENTRIES = new Map();
for (const line of RAW.split('\n')) {
  const [reading, forms] = line.trim().split(/\s+/);
  if (!reading || !forms) continue;
  const list = ENTRIES.get(reading) ?? [];
  for (const form of forms.split(',')) if (!list.includes(form)) list.push(form);
  ENTRIES.set(reading, list);
}

/**
 * Kanji spellings for a hiragana reading: exact matches first, then the
 * first spelling of longer words that start with it (prediction, like an IME).
 */
export function lookupKanjiFallback(reading, limit = 8) {
  const key = String(reading ?? '');
  if (!key) return [];
  const found = [...(ENTRIES.get(key) ?? [])];
  if (found.length < limit) {
    for (const [candidateReading, forms] of ENTRIES) {
      if (candidateReading !== key && candidateReading.startsWith(key) && !found.includes(forms[0])) {
        found.push(forms[0]);
        if (found.length >= limit) break;
      }
    }
  }
  return found.slice(0, limit);
}

/** The usual kanji spelling of exactly this reading (no prediction), or ''. */
export function exactKanjiFallback(reading) {
  return ENTRIES.get(String(reading ?? ''))?.[0] ?? '';
}

/** Hiragana readings of a written form (私 -> わたし, わたくし), from the built-in dictionary. */
export function readingsOfWritten(written) {
  const key = String(written ?? '');
  if (!key) return [];
  const readings = [];
  for (const [reading, forms] of ENTRIES) if (forms.includes(key)) readings.push(reading);
  return readings;
}
