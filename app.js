// はるしねーちゃん メインゲームロジック

(() => {
  // 状態管理
  const state = {
    deck: [],
    currentIndex: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    trickedByLieCount: 0, // ハルシネーションをホントと信じた回数
    doubtedTruthCount: 0, // ホントをハルシネーションと疑った回数
    history: [],
    isAnswering: false,
    typingTimer: null,
    fullCurrentText: "",
    currentMood: "normal",
    lastModeCount: 7
  };

  // DOM要素
  const el = {
    btnHomeLogo: document.getElementById("btnHomeLogo"),
    progressPill: document.getElementById("progressPill"),
    comboPill: document.getElementById("comboPill"),
    btnToggleVoice: document.getElementById("btnToggleVoice"),
    btnToggleSE: document.getElementById("btnToggleSE"),
    btnOpenSettings: document.getElementById("btnOpenSettings"),

    charViewport: document.getElementById("charViewport"),
    charLayers: document.querySelectorAll(".char-layer"),
    emotionBubble: document.getElementById("emotionBubble"),
    judgeStamp: document.getElementById("judgeStamp"),

    titleScreen: document.getElementById("titleScreen"),
    quizScreen: document.getElementById("quizScreen"),
    resultScreen: document.getElementById("resultScreen"),

    btnStartStandard: document.getElementById("btnStartStandard"),
    btnStartAll: document.getElementById("btnStartAll"),
    inputCustomTopic: document.getElementById("inputCustomTopic"),
    btnStartAIGen: document.getElementById("btnStartAIGen"),
    aiKeyStatusBadge: document.getElementById("aiKeyStatusBadge"),
    statAccuracy: document.getElementById("statAccuracy"),
    statBestCombo: document.getElementById("statBestCombo"),

    hintBalloon: document.getElementById("hintBalloon"),
    hintText: document.getElementById("hintText"),
    speakerMood: document.getElementById("speakerMood"),
    categoryTag: document.getElementById("categoryTag"),
    btnReplayVoice: document.getElementById("btnReplayVoice"),
    dialogueBody: document.getElementById("dialogueBody"),
    dialogueText: document.getElementById("dialogueText"),
    textCursor: document.getElementById("textCursor"),

    explanationPanel: document.getElementById("explanationPanel"),
    pointChip: document.getElementById("pointChip"),
    explanationText: document.getElementById("explanationText"),

    choiceContainer: document.getElementById("choiceContainer"),
    btnChooseHallucination: document.getElementById("btnChooseHallucination"),
    btnChooseTruth: document.getElementById("btnChooseTruth"),
    btnTsukkomi: document.getElementById("btnTsukkomi"),
    btnNextQuestion: document.getElementById("btnNextQuestion"),

    resultRankTitle: document.getElementById("resultRankTitle"),
    resultSisterComment: document.getElementById("resultSisterComment"),
    resultScoreValue: document.getElementById("resultScoreValue"),
    resultMaxCombo: document.getElementById("resultMaxCombo"),
    resultGullibility: document.getElementById("resultGullibility"),
    resultHistoryList: document.getElementById("resultHistoryList"),
    btnRetrySame: document.getElementById("btnRetrySame"),
    btnBackToTitle: document.getElementById("btnBackToTitle"),

    settingsModal: document.getElementById("settingsModal"),
    btnCloseSettings: document.getElementById("btnCloseSettings"),
    chkVoice: document.getElementById("chkVoice"),
    chkSE: document.getElementById("chkSE"),
    rngPitch: document.getElementById("rngPitch"),
    lblPitch: document.getElementById("lblPitch"),
    rngRate: document.getElementById("rngRate"),
    lblRate: document.getElementById("lblRate"),
    btnTestVoice: document.getElementById("btnTestVoice"),
    inputGeminiKey: document.getElementById("inputGeminiKey"),
    selectGeminiModel: document.getElementById("selectGeminiModel"),
    btnSaveSettings: document.getElementById("btnSaveSettings"),

    loadingOverlay: document.getElementById("loadingOverlay"),
    loadingTitle: document.getElementById("loadingTitle")
  };

  // 表情プリセット定義
  const EXPR_META = {
    normal: { bubble: "☝️ 自信満々", moodText: "博識お姉ちゃんモード" },
    doya:   { bubble: "😏 ドヤァ…！", moodText: "してやったりドヤ顔" },
    tehe:   { bubble: "😜 てへぺろ♪", moodText: "嘘がバレて照れ隠し中" },
    happy:  { bubble: "✨ さすが！！", moodText: "ご機嫌お姉ちゃん" },
    pout:   { bubble: "😤 むーっ！", moodText: "疑われてぷくーっ顔" }
  };

  // 初期化
  function init() {
    updateTopBarIcons();
    updateLifetimeStatsUI();
    updateAIKeyBadge();

    // イベント登録
    el.btnHomeLogo.addEventListener("click", () => {
      window.haruSound.playClick();
      showTitleScreen();
    });

    el.btnToggleVoice.addEventListener("click", () => {
      window.haruSound.setVoiceEnabled(!window.haruSound.voiceEnabled);
      updateTopBarIcons();
    });

    el.btnToggleSE.addEventListener("click", () => {
      window.haruSound.setSEEnabled(!window.haruSound.seEnabled);
      window.haruSound.playClick();
      updateTopBarIcons();
    });

    el.btnOpenSettings.addEventListener("click", () => {
      window.haruSound.playClick();
      openSettingsModal();
    });

    el.btnCloseSettings.addEventListener("click", () => {
      window.haruSound.playClick();
      el.settingsModal.classList.add("hidden");
    });

    el.btnSaveSettings.addEventListener("click", () => {
      saveSettingsFromModal();
    });

    el.rngPitch.addEventListener("input", () => {
      el.lblPitch.textContent = Number(el.rngPitch.value).toFixed(2);
    });

    el.rngRate.addEventListener("input", () => {
      el.lblRate.textContent = Number(el.rngRate.value).toFixed(2);
    });

    el.btnTestVoice.addEventListener("click", () => {
      window.haruSound.voicePitch = parseFloat(el.rngPitch.value);
      window.haruSound.voiceRate = parseFloat(el.rngRate.value);
      window.haruSound.setVoiceEnabled(true);
      el.chkVoice.checked = true;
      updateTopBarIcons();
      window.haruSound.speak("ねえねえ、この雑学ってハルシネーションだと思う？ それともホントかな？", "normal");
    });

    // ゲーム開始ボタン
    el.btnStartStandard.addEventListener("click", () => {
      window.haruSound.playClick();
      startCuratedGame(7);
    });

    el.btnStartAll.addEventListener("click", () => {
      window.haruSound.playClick();
      startCuratedGame(15);
    });

    el.btnStartAIGen.addEventListener("click", () => {
      window.haruSound.playClick();
      startAIGame();
    });

    // 文字送りスキップ
    el.dialogueBody.addEventListener("click", () => {
      if (state.typingTimer) {
        finishTypewriterImmediately();
      }
    });

    el.btnReplayVoice.addEventListener("click", () => {
      window.haruSound.setVoiceEnabled(true);
      updateTopBarIcons();
      window.haruSound.speak(state.fullCurrentText, state.currentMood);
    });

    // 回答選択
    el.btnChooseHallucination.addEventListener("click", () => submitAnswer(true));
    el.btnChooseTruth.addEventListener("click", () => submitAnswer(false));

    // ツッコミ（ヒント）
    el.btnTsukkomi.addEventListener("click", () => {
      const q = state.deck[state.currentIndex];
      if (!q) return;
      window.haruSound.playHint();
      el.hintText.textContent = q.hint;
      el.hintBalloon.classList.remove("hidden");
      setSisterExpression(q.isHallucination ? "doya" : "pout", false);
      window.haruSound.speak(q.hint, q.isHallucination ? "doya" : "pout");
    });

    // 次の問題へ
    el.btnNextQuestion.addEventListener("click", () => {
      window.haruSound.playClick();
      state.currentIndex++;
      if (state.currentIndex >= state.deck.length) {
        showResultScreen();
      } else {
        presentCurrentQuestion();
      }
    });

    // リザルト画面ボタン
    el.btnRetrySame.addEventListener("click", () => {
      window.haruSound.playClick();
      startCuratedGame(state.lastModeCount);
    });

    el.btnBackToTitle.addEventListener("click", () => {
      window.haruSound.playClick();
      showTitleScreen();
    });
  }

  function updateTopBarIcons() {
    el.btnToggleVoice.classList.toggle("muted", !window.haruSound.voiceEnabled);
    el.btnToggleVoice.textContent = window.haruSound.voiceEnabled ? "🔊" : "🔇";
    el.btnToggleSE.classList.toggle("muted", !window.haruSound.seEnabled);
  }

  function updateAIKeyBadge() {
    const key = localStorage.getItem("haru_gemini_api_key") || "";
    if (key.trim()) {
      el.aiKeyStatusBadge.textContent = "✅ Gemini API連携ON";
      el.aiKeyStatusBadge.style.color = "#059669";
    } else {
      el.aiKeyStatusBadge.textContent = "APIキー未設定（設定⚙️で登録すると自由生成！）";
      el.aiKeyStatusBadge.style.color = "#7d6574";
    }
  }

  function updateLifetimeStatsUI() {
    const total = parseInt(localStorage.getItem("haru_total_played") || "0", 10);
    const correct = parseInt(localStorage.getItem("haru_total_correct") || "0", 10);
    const bestCombo = parseInt(localStorage.getItem("haru_best_combo") || "0", 10);

    el.statAccuracy.textContent = total > 0 ? `${Math.round((correct / total) * 100)}% (${correct}/${total}問)` : "--%";
    el.statBestCombo.textContent = String(bestCombo);
  }

  // 表情切り替え
  function setSisterExpression(expr, animateType = "") {
    state.currentMood = expr;
    el.charLayers.forEach(img => {
      img.classList.toggle("active", img.dataset.expr === expr);
    });

    const meta = EXPR_META[expr] || EXPR_META.normal;
    el.emotionBubble.textContent = meta.bubble;
    el.speakerMood.textContent = meta.moodText;

    el.charViewport.classList.remove("anim-happy", "anim-shock");
    if (animateType) {
      void el.charViewport.offsetWidth;
      el.charViewport.classList.add(animateType);
    }
  }

  // タイプライター文字表示
  function startTypewriter(text, mood = "normal") {
    if (state.typingTimer) {
      clearInterval(state.typingTimer);
      state.typingTimer = null;
    }
    state.fullCurrentText = text;
    el.dialogueText.textContent = "";
    el.textCursor.classList.add("hidden");

    let idx = 0;
    state.typingTimer = setInterval(() => {
      if (idx < text.length) {
        el.dialogueText.textContent += text[idx];
        if (idx % 3 === 0) {
          window.haruSound.playBlip(idx % 4);
        }
        idx++;
        el.dialogueBody.scrollTop = el.dialogueBody.scrollHeight;
      } else {
        finishTypewriterImmediately();
      }
    }, 24);

    window.haruSound.speak(text, mood);
  }

  function finishTypewriterImmediately() {
    if (state.typingTimer) {
      clearInterval(state.typingTimer);
      state.typingTimer = null;
    }
    el.dialogueText.textContent = state.fullCurrentText;
    el.textCursor.classList.remove("hidden");
  }

  // 配列シャッフル
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // タイトル画面表示
  function showTitleScreen() {
    window.haruSound.stopSpeak();
    setSisterExpression("normal");
    el.judgeStamp.classList.add("hidden");
    el.titleScreen.classList.remove("hidden");
    el.quizScreen.classList.add("hidden");
    el.resultScreen.classList.add("hidden");
    el.comboPill.classList.add("hidden");
    el.progressPill.textContent = "待機中";
    updateLifetimeStatsUI();
  }

  // 収録問題でゲーム開始
  function startCuratedGame(count, filterTopic = "") {
    state.lastModeCount = count;
    let pool = [...window.HARU_QUESTIONS];

    if (filterTopic) {
      const matched = pool.filter(
        q => q.category.includes(filterTopic) || q.statement.includes(filterTopic) || q.explanation.includes(filterTopic)
      );
      if (matched.length >= 3) {
        pool = matched;
      }
    }

    const shuffled = shuffleArray(pool).slice(0, Math.min(count, pool.length));
    beginQuizSession(shuffled);
  }

  function beginQuizSession(questions) {
    state.deck = questions;
    state.currentIndex = 0;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.trickedByLieCount = 0;
    state.doubtedTruthCount = 0;
    state.history = [];

    el.titleScreen.classList.add("hidden");
    el.resultScreen.classList.add("hidden");
    el.quizScreen.classList.remove("hidden");
    el.comboPill.classList.add("hidden");

    presentCurrentQuestion();
  }

  // 問題出題
  function presentCurrentQuestion() {
    const q = state.deck[state.currentIndex];
    state.isAnswering = true;

    el.progressPill.textContent = `Q. ${state.currentIndex + 1} / ${state.deck.length}`;
    el.categoryTag.textContent = q.category;

    el.judgeStamp.classList.add("hidden");
    el.hintBalloon.classList.add("hidden");
    el.explanationPanel.classList.add("hidden");
    el.choiceContainer.classList.remove("hidden");
    el.btnTsukkomi.classList.remove("hidden");
    el.btnNextQuestion.classList.add("hidden");

    setSisterExpression("normal");
    startTypewriter(`「${q.statement}」`, "normal");
  }

  // 回答判定
  function submitAnswer(guessedHallucination) {
    if (!state.isAnswering) return;
    state.isAnswering = false;

    const q = state.deck[state.currentIndex];
    const isCorrect = guessedHallucination === q.isHallucination;

    // 4パターンの表情＆リアクション分岐
    // 1. 嘘を見破った(正解) -> tehe
    // 2. 嘘に騙された(不正解) -> doya
    // 3. ホントを見抜いた(正解) -> happy
    // 4. ホントを疑った(不正解) -> pout
    let nextExpr = "normal";
    let animClass = "";

    if (isCorrect) {
      state.score++;
      state.combo++;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      window.haruSound.playCorrect();

      nextExpr = q.isHallucination ? "tehe" : "happy";
      animClass = "anim-happy";
    } else {
      state.combo = 0;
      if (q.isHallucination) {
        state.trickedByLieCount++;
      } else {
        state.doubtedTruthCount++;
      }
      window.haruSound.playWrong();

      nextExpr = q.isHallucination ? "doya" : "pout";
      animClass = "anim-shock";
    }

    // コンボ表示更新
    if (state.combo >= 2) {
      el.comboPill.textContent = `🔥 ${state.combo} COMBO!`;
      el.comboPill.classList.remove("hidden");
    } else {
      el.comboPill.classList.add("hidden");
    }

    // スタンプ表示
    el.judgeStamp.className = "judge-stamp " + (isCorrect ? "stamp-correct" : "stamp-wrong");
    if (isCorrect) {
      el.judgeStamp.textContent = q.isHallucination ? "🎯 ハルシネ見破り！" : "✨ ガチ雑学正解！";
    } else {
      el.judgeStamp.textContent = q.isHallucination ? "😈 お姉ちゃんに騙された！" : "💦 ホントの話でした！";
    }

    setSisterExpression(nextExpr, animClass);

    // 姉のリアクションセリフ表示
    const reactionLine = isCorrect ? q.reactionCorrect : q.reactionWrong;
    startTypewriter(`「${reactionLine}」`, nextExpr);

    // 解説パネル表示
    el.pointChip.textContent = q.pointTag || (q.isHallucination ? "ハルシネーション解説" : "ガチ雑学解説");
    el.pointChip.className = "point-chip " + (q.isHallucination ? "" : "truth-chip");
    el.explanationText.textContent = q.explanation;
    el.explanationPanel.classList.remove("hidden");

    // ボタン切り替え
    el.choiceContainer.classList.add("hidden");
    el.btnTsukkomi.classList.add("hidden");
    el.hintBalloon.classList.add("hidden");
    el.btnNextQuestion.textContent =
      state.currentIndex + 1 >= state.deck.length ? "🎉 診断結果を見る ▶" : "次のお姉ちゃんの話へ ▶";
    el.btnNextQuestion.classList.remove("hidden");

    // 履歴保存
    state.history.push({
      statement: q.statement,
      isHallucination: q.isHallucination,
      isCorrect,
      pointTag: q.pointTag
    });

    // 通算成績保存
    const total = parseInt(localStorage.getItem("haru_total_played") || "0", 10) + 1;
    const corr = parseInt(localStorage.getItem("haru_total_correct") || "0", 10) + (isCorrect ? 1 : 0);
    const prevBest = parseInt(localStorage.getItem("haru_best_combo") || "0", 10);
    localStorage.setItem("haru_total_played", String(total));
    localStorage.setItem("haru_total_correct", String(corr));
    if (state.maxCombo > prevBest) {
      localStorage.setItem("haru_best_combo", String(state.maxCombo));
    }
  }

  // リザルト画面表示
  function showResultScreen() {
    window.haruSound.playFanfare();
    el.quizScreen.classList.add("hidden");
    el.judgeStamp.classList.add("hidden");
    el.resultScreen.classList.remove("hidden");

    const total = state.deck.length;
    const ratio = state.score / total;
    const halluTotal = state.deck.filter(q => q.isHallucination).length || 1;
    const gullibilityPct = Math.round((state.trickedByLieCount / halluTotal) * 100);

    el.resultScoreValue.textContent = `${state.score} / ${total}`;
    el.resultMaxCombo.textContent = `${state.maxCombo} 連続`;
    el.resultGullibility.textContent = `${gullibilityPct}%`;

    // ランク判定とお姉ちゃんコメント
    let rank = "";
    let comment = "";
    let expr = "happy";

    if (ratio === 1) {
      rank = "👑 Sランク：お姉ちゃん完全攻略ファクトチェッカー";
      comment = "「えーっ！？ 1問も騙せなかったなんて悔しすぎる〜！ 私のこと誰よりも知り尽くしてるじゃん…！ えへへ、さすが自慢の弟（妹）だね♪」";
      expr = "tehe";
    } else if (ratio >= 0.7) {
      rank = "✨ Aランク：お姉ちゃん取扱説明書マスター";
      comment = "「やるじゃん！ かなり巧妙なハルシネーション混ぜたのに、ほとんど見抜かれちゃった〜！ 次はもっとハイレベルな知ったかぶりするからね！」";
      expr = "happy";
    } else if (ratio >= 0.4) {
      rank = "🐣 Bランク：素直で可愛い信じ屋さん";
      comment = "「ふっふっふ〜、お姉ちゃんのドヤ顔トークに半分くらいコロッと引っかかってたね♪ でも素直で可愛いから許してあげる！」";
      expr = "doya";
    } else {
      rank = "🍮 Cランク：お姉ちゃんのカモ（純粋培養100%）";
      comment = "「あははは！ お姉ちゃんのハルシネーションを全部信じてくれるなんて、世界一ピュアで可愛い弟（妹）だな〜！ これからもいっぱい雑学教えてあげるね♪」";
      expr = "doya";
    }

    el.resultRankTitle.textContent = rank;
    el.resultSisterComment.textContent = comment;
    setSisterExpression(expr, "anim-happy");
    window.haruSound.speak(comment, expr);

    // 履歴リスト生成
    el.resultHistoryList.innerHTML = "";
    state.history.forEach((h, i) => {
      const row = document.createElement("div");
      row.className = `history-item ${h.isCorrect ? "item-ok" : "item-ng"}`;
      const badge = h.isHallucination ? "🚨嘘" : "✨事実";
      const mark = h.isCorrect ? "⭕見破り" : "❌失敗";
      row.innerHTML = `
        <div style="flex:1;">
          <strong>Q${i + 1} [${badge}]</strong> ${h.pointTag || ""}<br>
          <span style="color:#6b5863;">${h.statement.slice(0, 44)}…</span>
        </div>
        <strong style="white-space:nowrap;">${mark}</strong>
      `;
      el.resultHistoryList.appendChild(row);
    });
  }

  // 設定モーダル
  function openSettingsModal() {
    el.chkVoice.checked = window.haruSound.voiceEnabled;
    el.chkSE.checked = window.haruSound.seEnabled;
    el.rngPitch.value = String(window.haruSound.voicePitch);
    el.lblPitch.textContent = window.haruSound.voicePitch.toFixed(2);
    el.rngRate.value = String(window.haruSound.voiceRate);
    el.lblRate.textContent = window.haruSound.voiceRate.toFixed(2);
    el.inputGeminiKey.value = localStorage.getItem("haru_gemini_api_key") || "";
    el.selectGeminiModel.value = localStorage.getItem("haru_gemini_model") || "gemini-2.5-flash";
    el.settingsModal.classList.remove("hidden");
  }

  function saveSettingsFromModal() {
    window.haruSound.setVoiceEnabled(el.chkVoice.checked);
    window.haruSound.setSEEnabled(el.chkSE.checked);
    window.haruSound.voicePitch = parseFloat(el.rngPitch.value);
    window.haruSound.voiceRate = parseFloat(el.rngRate.value);
    localStorage.setItem("haru_voice_pitch", String(window.haruSound.voicePitch));
    localStorage.setItem("haru_voice_rate", String(window.haruSound.voiceRate));

    const apiKey = el.inputGeminiKey.value.trim();
    const model = el.selectGeminiModel.value;
    localStorage.setItem("haru_gemini_api_key", apiKey);
    localStorage.setItem("haru_gemini_model", model);

    updateTopBarIcons();
    updateAIKeyBadge();
    window.haruSound.playClick();
    el.settingsModal.classList.add("hidden");
  }

  // Gemini API でお姉ちゃんクイズを動的生成
  async function startAIGame() {
    const topic = el.inputCustomTopic.value.trim() || "おまかせの面白い雑学";
    const apiKey = (localStorage.getItem("haru_gemini_api_key") || "").trim();
    const model = localStorage.getItem("haru_gemini_model") || "gemini-2.5-flash";

    if (!apiKey) {
      // APIキー未設定時はテーマに関連する収録問題を優先ピックアップしつつ案内
      openSettingsModal();
      return;
    }

    el.loadingTitle.textContent = `お姉ちゃんが「${topic}」の知ったかぶりを準備中…`;
    el.loadingOverlay.classList.remove("hidden");

    const prompt = `
あなたは少しドヤ顔で知ったかぶりをする可愛いお姉ちゃん「はるしねーちゃん（春野詩音）」です。
弟や妹に向けて、テーマ「${topic}」に関する雑学クイズを5問作成してください。
5問のうち2〜3問は「ハルシネーション（実在しそうな人名・年号・専門用語や本当の知識に絶妙な嘘を混ぜた、もっともらしい知ったかぶり）」、残りは「嘘みたいに聞こえるけど100%本当のガチ雑学」にしてください。

以下のJSON配列フォーマットのみで出力してください：
[
  {
    "category": "カテゴリ名",
    "statement": "ねえ知ってる？ 〜〜なんだよ！（お姉ちゃん口調の出題セリフ）",
    "isHallucination": true または false,
    "hint": "お姉ちゃん「（ツッコまれた時の動揺または自信満々な一言）」",
    "reactionCorrect": "見破られた時（または本当と見抜かれた時）のお姉ちゃんの可愛いリアクションセリフ",
    "reactionWrong": "騙せた時（または本当なのに疑われた時）のお姉ちゃんのドヤ顔・膨れっ面セリフ",
    "explanation": "【ハルシネーション！】または【ホント！】から始まる客観的で詳しい真相解説",
    "pointTag": "嘘ポイント：〇〇 / ガチ雑学：〇〇（短い要約）"
  }
]`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.9,
              responseMimeType: "application/json"
            }
          })
        }
      );

      if (!res.ok) {
        throw new Error(`API Error (${res.status})`);
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      const parsed = JSON.parse(rawText);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("生成データの形式が不正です");
      }

      el.loadingOverlay.classList.add("hidden");
      state.lastModeCount = parsed.length;
      beginQuizSession(parsed);
    } catch (err) {
      el.loadingOverlay.classList.add("hidden");
      alert(`AI生成に失敗しました（${err.message}）。収録問題から「${topic}」に近い問題でスタートします！`);
      startCuratedGame(7, topic);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
