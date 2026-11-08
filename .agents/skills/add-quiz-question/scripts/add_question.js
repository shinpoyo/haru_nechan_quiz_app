// 新規クイズ問題を questions.js に安全に追加するスクリプト
// 使い方:
//   node add_question.js <questions.json>
// または
//   node add_question.js --single '<json_string>'

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

function loadExistingQuestions() {
  const raw = fs.readFileSync(QUESTIONS_PATH, 'utf8');
  const sandbox = {};
  const fn = new Function('window', raw);
  fn(sandbox);
  return sandbox.HARU_QUESTIONS || [];
}

function getNextId(existing) {
  let maxNum = 0;
  for (const q of existing) {
    const m = (q.id || '').match(/^q(\d+)$/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  const next = maxNum + 1;
  return `q${String(next).padStart(2, '0')}`;
}

function validateNewQuestion(q, index) {
  const prefix = `[New Q#${index + 1}]`;

  if (!VALID_CATEGORIES.has(q.category)) {
    throw new Error(`${prefix} 無効なカテゴリです: '${q.category}'\n利用可能: ${[...VALID_CATEGORIES].join(', ')}`);
  }
  if (typeof q.isHallucination !== 'boolean') {
    throw new Error(`${prefix} isHallucination は true または false で指定してください。`);
  }
  if (!q.statement || typeof q.statement !== 'string') {
    throw new Error(`${prefix} statement が空または文字列ではありません。`);
  }
  if (!q.hint || typeof q.hint !== 'string') {
    throw new Error(`${prefix} hint が空または文字列ではありません。`);
  }
  if (!q.reaction || typeof q.reaction !== 'string') {
    throw new Error(`${prefix} reaction が空または文字列ではありません。`);
  }
  if (!q.pointTag || typeof q.pointTag !== 'string') {
    throw new Error(`${prefix} pointTag が空または文字列ではありません。`);
  }
  if (!q.explanation || typeof q.explanation !== 'string') {
    throw new Error(`${prefix} explanation が空または文字列ではありません。`);
  }

  // キャラクター設定禁止ワードチェック
  const fullText = `${q.statement} ${q.hint} ${q.reaction}`;
  if (/弟|妹/.test(fullText)) {
    throw new Error(`${prefix} 禁止ワード検出: 「弟」「妹」などの関係性決めつけワードは使用禁止です。（関係性は謎・ねーちゃんが好きな誰か）`);
  }
  if (/お姉ちゃん|ねーちゃん/.test(fullText)) {
    throw new Error(`${prefix} 禁止ワード検出: 春野詩音の一人称は「私」です（「お姉ちゃん」や「ねーちゃん」を一人称として使用することは禁止。「ねーちゃん」はプレイヤーからの愛称です）。`);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`
使用方法:
  node add_question.js <path/to/new_questions.json>
  node add_question.js --single '{"category":"...","isHallucination":true,...}'

入力JSONは 1問のオブジェクト または オブジェクトの配列 を受け付けます。
id は自動採番されるため省略可能です（指定された場合は上書きまたは尊重されます）。
`);
    process.exit(1);
  }

  let newItems = [];
  if (args[0] === '--single') {
    if (!args[1]) {
      console.error('Error: JSON文字列を指定してください。');
      process.exit(1);
    }
    newItems = [JSON.parse(args[1])];
  } else {
    const filePath = path.resolve(process.cwd(), args[0]);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: ファイルが見つかりません: ${filePath}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    newItems = Array.isArray(parsed) ? parsed : [parsed];
  }

  const existing = loadExistingQuestions();
  console.log(`現在の問題数: ${existing.length} 問`);

  // バリデーション & ID付与
  let currentMax = existing.length;
  const toAppend = [];

  for (let i = 0; i < newItems.length; i++) {
    const item = newItems[i];
    validateNewQuestion(item, i);

    currentMax++;
    const assignedId = item.id || `q${String(currentMax).padStart(2, '0')}`;

    const formatted = {
      id: assignedId,
      category: item.category,
      isHallucination: item.isHallucination,
      statement: item.statement.trim(),
      hint: item.hint.trim(),
      hintExpr: item.hintExpr || (item.isHallucination ? 'confused' : 'doya'),
      reaction: item.reaction.trim(),
      reactionExpr: item.reactionExpr || (item.isHallucination ? 'shy' : 'happy'),
      pointTag: item.pointTag.trim(),
      explanation: item.explanation.trim()
    };

    toAppend.push(formatted);
    console.log(`➕ 追加準備: [${formatted.id}] ${formatted.category} | ${formatted.isHallucination ? '🚨嘘' : '✨ホント'} - ${formatted.statement.slice(0, 28)}...`);
  }

  const combined = existing.concat(toAppend);
  const outCode = `window.HARU_QUESTIONS = ${JSON.stringify(combined, null, 2)};\n`;

  fs.writeFileSync(QUESTIONS_PATH, outCode, 'utf8');
  console.log(`\n🎉 正常に ${toAppend.length} 問を追加しました！ (総計: ${combined.length} 問)`);
}

main();
