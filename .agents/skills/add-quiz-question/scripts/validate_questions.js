// questions.js の整合性およびキャラクター設定・品質チェック用スクリプト
const fs = require('fs');
const path = require('path');

const QUESTIONS_PATH = path.resolve(__dirname, '../../../../questions.js');

const VALID_CATEGORIES = new Set([
  '🐾 いきもの雑学',
  '🍔 食べ物・グルメ',
  '🌌 宇宙・科学',
  '💻 IT・テクノロジー',
  '🏛️ 歴史・偉人',
  '🎨 言葉・文化',
  '🎵 エンタメ・日常',
  '🏥 カラダ・健康',
  '🗾 日本・地理'
]);

const VALID_EXPRESSIONS = new Set([
  'normal', 'happy', 'shy', 'doya', 'pout', 'cry', 'shock', 'confused', 'wink', 'tehe'
]);

// キャラクター設定上の禁止ワード
// 1. 相手の属性決めつけ（弟、妹など）
// 2. 「お姉ちゃん」呼び（本アプリでは「ねーちゃん」に統一）
const FORBIDDEN_WORDS = [
  { pattern: /弟|妹/, reason: 'プレイヤーとの関係性決めつけ（関係性は謎・ねーちゃんが好きな誰か）' },
  { pattern: /お姉ちゃん|ねーちゃん/, reason: '一人称エラー: 春野詩音の一人称は「私」です（「お姉ちゃん」や「ねーちゃん」を一人称として使用するのは禁止）' }
];

function validate() {
  if (!fs.existsSync(QUESTIONS_PATH)) {
    console.error(`Error: ${QUESTIONS_PATH} が見つかりません。`);
    process.exit(1);
  }

  const raw = fs.readFileSync(QUESTIONS_PATH, 'utf8');
  let questions;
  try {
    const sandbox = {};
    const fn = new Function('window', raw);
    fn(sandbox);
    questions = sandbox.HARU_QUESTIONS;
  } catch (err) {
    console.error('Syntax Error in questions.js:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(questions)) {
    console.error('Error: window.HARU_QUESTIONS が配列ではありません。');
    process.exit(1);
  }

  console.log(`🔍 全 ${questions.length} 問のバリデーションを開始します...`);

  let errors = 0;
  let warnings = 0;
  const idSet = new Set();
  let lieCount = 0;
  let truthCount = 0;

  questions.forEach((q, idx) => {
    const prefix = `[Q#${idx + 1} (${q.id || 'NO_ID'})]`;

    // 1. ID チェック
    if (!q.id) {
      console.error(`${prefix} id が存在しません。`);
      errors++;
    } else {
      if (idSet.has(q.id)) {
        console.error(`${prefix} id '${q.id}' が重複しています。`);
        errors++;
      }
      idSet.add(q.id);
    }

    // 2. 必須フィールド
    const required = [
      'id', 'category', 'isHallucination', 'statement',
      'hint', 'hintExpr', 'reaction', 'reactionExpr',
      'pointTag', 'explanation'
    ];
    for (const field of required) {
      if (q[field] === undefined || q[field] === null || q[field] === '') {
        console.error(`${prefix} 必須フィールド '${field}' が欠落または空です。`);
        errors++;
      }
    }

    // 3. カテゴリ
    if (!VALID_CATEGORIES.has(q.category)) {
      console.error(`${prefix} 未知のカテゴリです: '${q.category}'`);
      errors++;
    }

    // 4. 表情差分
    if (q.hintExpr && !VALID_EXPRESSIONS.has(q.hintExpr)) {
      console.warn(`${prefix} ⚠️ hintExpr '${q.hintExpr}' は想定表情リスト外です。`);
      warnings++;
    }
    if (q.reactionExpr && !VALID_EXPRESSIONS.has(q.reactionExpr)) {
      console.warn(`${prefix} ⚠️ reactionExpr '${q.reactionExpr}' は想定表情リスト外です。`);
      warnings++;
    }

    // 5. 禁止ワードチェック（statement, hint, reaction）
    const textToCheck = `${q.statement || ''} ${q.hint || ''} ${q.reaction || ''}`;
    for (const rule of FORBIDDEN_WORDS) {
      if (rule.pattern.test(textToCheck)) {
        console.warn(`${prefix} ⚠️ 禁止ワード検出 (${rule.reason}): /${rule.pattern.source}/`);
        warnings++;
      }
    }

    // 統計
    if (q.isHallucination === true) lieCount++;
    else if (q.isHallucination === false) truthCount++;
  });

  console.log('\n📊 集計結果:');
  console.log(`- 総問題数: ${questions.length} 問`);
  console.log(`- 🚨 嘘（ハルシネーション）: ${lieCount} 問`);
  console.log(`- ✨ ホント（ガチ事実）: ${truthCount} 問`);
  console.log(`- エラー: ${errors} 件, 警告: ${warnings} 件`);

  if (errors > 0) {
    console.error('\n❌ バリデーションに失敗しました。');
    process.exit(1);
  } else {
    console.log('\n✅ すべてのバリデーションを通過しました！');
  }
}

validate();
