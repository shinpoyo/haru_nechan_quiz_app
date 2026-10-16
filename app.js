// はるしねーちゃん メインゲームロジック（マルチ音声聴き比べ＆3行ノベルUI対応）

(() => {
  const SAMPLE_LINE = "ねえ知ってる？ ウォンバットのうんちって、実はサイコロみたいな四角形なんだよ！ えへへ、バレちゃった〜？";

  const state = {
    deck: [],
    currentIndex: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    trickedByLieCount: 0,
    doubtedTruthCount: 0,
    history: [],

    phase: "question",
    pages: [],
    pageIndex: 0,
    typingTimer: null,
    fullCurrentText: "",
    currentMood: "normal",
    lastModeCount: 7,
    uiOpacityPct: parseInt(localStorage.getItem("haru_ui_opacity") || "75", 10),
    currentVoiceLabel: localStorage.getItem("haru_voice_label") || "はるしねーちゃん公式（Aoede・全問収録済）"
  };

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
    btnOpenVoiceSamples: document.getElementById("btnOpenVoiceSamples"),
    inputCustomTopic: document.getElementById("inputCustomTopic"),
    btnStartAIGen: document.getElementById("btnStartAIGen"),
    aiKeyStatusBadge: document.getElementById("aiKeyStatusBadge"),
    currentVoiceBadge: document.getElementById("currentVoiceBadge"),
    statAccuracy: document.getElementById("statAccuracy"),

    categoryTag: document.getElementById("categoryTag"),
    btnReplayVoice: document.getElementById("btnReplayVoice"),
    dialogueBody: document.getElementById("dialogueBody"),
    dialogueText: document.getElementById("dialogueText"),
    pointChip: document.getElementById("pointChip"),
    pageHintText: document.getElementById("pageHintText"),
    btnNextAction: document.getElementById("btnNextAction"),

    choiceContainer: document.getElementById("choiceContainer"),
    btnChooseHallucination: document.getElementById("btnChooseHallucination"),
    btnChooseTruth: document.getElementById("btnChooseTruth"),
    btnTsukkomi: document.getElementById("btnTsukkomi"),

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
    voiceSampleGrid: document.getElementById("voiceSampleGrid"),
    rngOpacity: document.getElementById("rngOpacity"),
    lblOpacity: document.getElementById("lblOpacity"),
    chkVoice: document.getElementById("chkVoice"),
    chkSE: document.getElementById("chkSE"),
    inputGeminiKey: document.getElementById("inputGeminiKey"),
    selectGeminiModel: document.getElementById("selectGeminiModel"),
    btnSaveSettings: document.getElementById("btnSaveSettings"),

    loadingOverlay: document.getElementById("loadingOverlay"),
    loadingTitle: document.getElementById("loadingTitle")
  };

  const EXPR_META = {
    normal: { bubble: "☝️ 自信満々" },
    doya:   { bubble: "😏 ドヤァ…！" },
    tehe:   { bubble: "😜 てへぺろ♪" },
    happy:  { bubble: "✨ さすが！！" },
    pout:   { bubble: "😤 むーっ！" }
  };

  function init() {
    applyUIOpacity(state.uiOpacityPct);
    updateTopBarIcons();
    updateLifetimeStatsUI();
    updateAIKeyBadge();
    syncSampleCardSelection();

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

    if (el.btnOpenVoiceSamples) {
      el.btnOpenVoiceSamples.addEventListener("click", () => {
        window.haruSound.playClick();
        openSettingsModal();
      });
    }

    el.btnCloseSettings.addEventListener("click", () => {
      window.haruSound.playClick();
      window.haruSound.stopSpeak();
      el.settingsModal.classList.add("hidden");
    });

    // 🎧 ボイスサンプルカードのクリック試聴＆選択
    const sampleCards = el.voiceSampleGrid.querySelectorAll(".sample-card");
    sampleCards.forEach(card => {
      card.addEventListener("click", async () => {
        sampleCards.forEach(c => c.classList.remove("active"));
        card.classList.add("active");

        const engine = card.dataset.engine;
        const speaker = parseInt(card.dataset.speaker || "8", 10);
        const samplePath = card.dataset.sample || "";
        const label = card.dataset.label || "";
        const geminiVoice = card.dataset.geminiVoice || "Aoede";
        const ttsModel = card.dataset.ttsModel || "gemini-2.5-pro-preview-tts";

        window.haruSound.ttsEngine = engine;
        window.haruSound.voicevoxSpeaker = speaker;
        window.haruSound.geminiVoiceName = geminiVoice;
        window.haruSound.geminiTtsModel = ttsModel;
        window.haruSound.setVoiceEnabled(true);
        el.chkVoice.checked = true;
        updateTopBarIcons();

        localStorage.setItem("haru_tts_engine", engine);
        localStorage.setItem("haru_vv_speaker", String(speaker));
        localStorage.setItem("haru_gemini_voice", geminiVoice);
        localStorage.setItem("haru_gemini_tts_model", ttsModel);
        localStorage.setItem("haru_voice_label", label);
        state.currentVoiceLabel = label;
        if (el.currentVoiceBadge) el.currentVoiceBadge.textContent = label;

        // 試聴再生
        if (samplePath) {
          window.haruSound.playAudioUrl(samplePath);
        } else if (engine === "gemini-tts") {
          const apiKey = (el.inputGeminiKey.value || localStorage.getItem("haru_gemini_api_key") || "").trim();
          if (!apiKey) {
            alert("Gemini 2.5 Flash TTSを試聴するには、下の欄にGemini APIキーを入力してください！");
            el.inputGeminiKey.focus();
            return;
          }
          localStorage.setItem("haru_gemini_api_key", apiKey);
          window.haruSound.speak(SAMPLE_LINE, "tehe");
        } else {
          window.haruSound.speakWithWebSpeech(SAMPLE_LINE, "normal");
        }
      });
    });

    el.rngOpacity.addEventListener("input", () => {
      const val = parseInt(el.rngOpacity.value, 10);
      el.lblOpacity.textContent = `${val}%`;
      applyUIOpacity(val);
    });

    el.btnSaveSettings.addEventListener("click", () => {
      saveSettingsFromModal();
    });

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

    el.dialogueBody.addEventListener("click", (e) => {
      e.stopPropagation();
      handleTextboxAdvance();
    });

    el.btnNextAction.addEventListener("click", (e) => {
      e.stopPropagation();
      handleTextboxAdvance();
    });

    el.btnReplayVoice.addEventListener("click", (e) => {
      e.stopPropagation();
      window.haruSound.setVoiceEnabled(true);
      updateTopBarIcons();
      window.haruSound.speak(state.fullCurrentText, state.currentMood);
    });

    el.btnChooseHallucination.addEventListener("click", () => submitAnswer(true));
    el.btnChooseTruth.addEventListener("click", () => submitAnswer(false));

    el.btnTsukkomi.addEventListener("click", () => {
      const q = state.deck[state.currentIndex];
      if (!q) return;
      window.haruSound.playHint();
      const hintMood = q.isHallucination ? "doya" : "pout";
      setSisterExpression(hintMood, "");
      const cleanHint = q.hint.replace(/^お姉ちゃん/, "");
      startPagedDialogue(cleanHint, hintMood, "question", q.id ? `${q.id}_h` : "");
    });

    el.btnRetrySame.addEventListener("click", () => {
      window.haruSound.playClick();
      startCuratedGame(state.lastModeCount);
    });

    el.btnBackToTitle.addEventListener("click", () => {
      window.haruSound.playClick();
      showTitleScreen();
    });
  }

  function syncSampleCardSelection() {
    if (el.currentVoiceBadge) {
      el.currentVoiceBadge.textContent = state.currentVoiceLabel;
    }
    const cards = el.voiceSampleGrid.querySelectorAll(".sample-card");
    cards.forEach(c => {
      const match = c.dataset.label === state.currentVoiceLabel;
      c.classList.toggle("active", match);
    });
  }

  function applyUIOpacity(pct) {
    state.uiOpacityPct = pct;
    const alpha = Math.max(0.2, Math.min(0.98, pct / 100));
    document.documentElement.style.setProperty("--ui-opacity", alpha.toFixed(2));
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
      el.aiKeyStatusBadge.style.color = "#047857";
    } else {
      el.aiKeyStatusBadge.textContent = "APIキー未設定（設定⚙️から登録可）";
      el.aiKeyStatusBadge.style.color = "#735868";
    }
  }

  function updateLifetimeStatsUI() {
    const total = parseInt(localStorage.getItem("haru_total_played") || "0", 10);
    const correct = parseInt(localStorage.getItem("haru_total_correct") || "0", 10);
    el.statAccuracy.textContent = total > 0 ? `${Math.round((correct / total) * 100)}% (${correct}/${total}問)` : "--%";
  }

  function setSisterExpression(expr, animateType = "") {
    state.currentMood = expr;
    el.charLayers.forEach(img => {
      img.classList.toggle("active", img.dataset.expr === expr);
    });

    const meta = EXPR_META[expr] || EXPR_META.normal;
    el.emotionBubble.textContent = meta.bubble;

    el.charViewport.classList.remove("anim-happy", "anim-shock");
    if (animateType) {
      void el.charViewport.offsetWidth;
      el.charViewport.classList.add(animateType);
    }
  }

  function splitIntoPages(text, maxLen = 54) {
    const cleaned = text.trim();
    if (cleaned.length <= maxLen) return [cleaned];

    const tokens = cleaned.split(/(?<=[！？。…])/);
    const pages = [];
    let current = "";

    for (const token of tokens) {
      if ((current + token).length <= maxLen) {
        current += token;
      } else {
        if (current) pages.push(current.trim());
        if (token.length <= maxLen) {
          current = token;
        } else {
          const subTokens = token.split(/(?<=、)/);
          let subCur = "";
          for (const st of subTokens) {
            if ((subCur + st).length <= maxLen) {
              subCur += st;
            } else {
              if (subCur) pages.push(subCur.trim());
              subCur = st;
            }
          }
          current = subCur;
        }
      }
    }
    if (current.trim()) pages.push(current.trim());
    return pages.length > 0 ? pages : [cleaned];
  }

  function startPagedDialogue(fullText, mood, phase, pregenKey = "") {
    state.phase = phase;
    state.pages = splitIntoPages(fullText);
    state.pageIndex = 0;

    window.haruSound.speak(fullText, mood, pregenKey);
    showCurrentPage();
  }

  function showCurrentPage() {
    if (state.typingTimer) {
      clearInterval(state.typingTimer);
      state.typingTimer = null;
    }

    const pageText = state.pages[state.pageIndex] || "";
    state.fullCurrentText = pageText;
    el.dialogueText.textContent = "";

    const isLastPage = state.pageIndex >= state.pages.length - 1;
    updateFooterIndicator(isLastPage);

    if (state.phase === "question") {
      if (isLastPage) {
        el.choiceContainer.classList.remove("hidden");
      } else {
        el.choiceContainer.classList.add("hidden");
      }
    } else {
      el.choiceContainer.classList.add("hidden");
    }

    let idx = 0;
    state.typingTimer = setInterval(() => {
      if (idx < pageText.length) {
        el.dialogueText.textContent += pageText[idx];
        if (idx % 3 === 0) {
          window.haruSound.playBlip(idx % 4);
        }
        idx++;
      } else {
        finishTypewriterImmediately();
      }
    }, 22);
  }

  function finishTypewriterImmediately() {
    if (state.typingTimer) {
      clearInterval(state.typingTimer);
      state.typingTimer = null;
    }
    el.dialogueText.textContent = state.fullCurrentText;
  }

  function updateFooterIndicator(isLastPage) {
    const totalPages = state.pages.length;
    const pageBadge = totalPages > 1 ? `(${state.pageIndex + 1}/${totalPages}) ` : "";

    if (!isLastPage) {
      el.pageHintText.textContent = `${pageBadge}タップで続き`;
      el.btnNextAction.textContent = "▼";
    } else if (state.phase === "question") {
      el.pageHintText.textContent = `${pageBadge}上の選択肢から回答`;
      el.btnNextAction.textContent = totalPages > 1 ? "↺" : "▲";
    } else if (state.phase === "reaction") {
      el.pageHintText.textContent = "タップで真相解説へ";
      el.btnNextAction.textContent = "解説 ▶";
    } else if (state.phase === "explanation") {
      const isLastQ = state.currentIndex + 1 >= state.deck.length;
      el.pageHintText.textContent = isLastQ ? "タップで結果発表へ" : "タップで次の話へ";
      el.btnNextAction.textContent = isLastQ ? "結果 ▶" : "次へ ▶";
    }
  }

  function handleTextboxAdvance() {
    if (state.typingTimer) {
      finishTypewriterImmediately();
      return;
    }

    if (state.pageIndex < state.pages.length - 1) {
      window.haruSound.playClick();
      state.pageIndex++;
      showCurrentPage();
      return;
    }

    if (state.phase === "question") {
      if (state.pages.length > 1) {
        window.haruSound.playClick();
        state.pageIndex = 0;
        showCurrentPage();
      } else {
        el.choiceContainer.classList.toggle("hidden");
      }
    } else if (state.phase === "reaction") {
      window.haruSound.playClick();
      showExplanationInTextbox();
    } else if (state.phase === "explanation") {
      window.haruSound.playClick();
      state.currentIndex++;
      if (state.currentIndex >= state.deck.length) {
        showResultScreen();
      } else {
        presentCurrentQuestion();
      }
    }
  }

  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

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

  function presentCurrentQuestion() {
    const q = state.deck[state.currentIndex];
    el.progressPill.textContent = `Q.${state.currentIndex + 1}/${state.deck.length}`;
    el.categoryTag.textContent = q.category;

    el.judgeStamp.classList.add("hidden");
    el.pointChip.classList.add("hidden");

    setSisterExpression("normal");
    startPagedDialogue(`「${q.statement}」`, "normal", "question", q.id ? `${q.id}_q` : "");
  }

  function submitAnswer(guessedHallucination) {
    if (state.phase !== "question") return;

    const q = state.deck[state.currentIndex];
    const isCorrect = guessedHallucination === q.isHallucination;

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

    if (state.combo >= 2) {
      el.comboPill.textContent = `🔥 ${state.combo}`;
      el.comboPill.classList.remove("hidden");
    } else {
      el.comboPill.classList.add("hidden");
    }

    el.judgeStamp.className = "vn-judge-badge " + (isCorrect ? "stamp-correct" : "stamp-wrong");
    if (isCorrect) {
      el.judgeStamp.textContent = q.isHallucination ? "🎯 ハルシネ見破り！" : "✨ ガチ雑学正解！";
    } else {
      el.judgeStamp.textContent = q.isHallucination ? "😈 騙された〜！" : "💦 ホントでした！";
    }

    setSisterExpression(nextExpr, animClass);

    const reactionLine = isCorrect ? q.reactionCorrect : q.reactionWrong;
    const pregenKey = q.id ? `${q.id}_${isCorrect ? "c" : "w"}` : "";
    startPagedDialogue(`「${reactionLine}」`, nextExpr, "reaction", pregenKey);

    state.history.push({
      statement: q.statement,
      isHallucination: q.isHallucination,
      isCorrect,
      pointTag: q.pointTag
    });

    const total = parseInt(localStorage.getItem("haru_total_played") || "0", 10) + 1;
    const corr = parseInt(localStorage.getItem("haru_total_correct") || "0", 10) + (isCorrect ? 1 : 0);
    const prevBest = parseInt(localStorage.getItem("haru_best_combo") || "0", 10);
    localStorage.setItem("haru_total_played", String(total));
    localStorage.setItem("haru_total_correct", String(corr));
    if (state.maxCombo > prevBest) {
      localStorage.setItem("haru_best_combo", String(state.maxCombo));
    }
  }

  function showExplanationInTextbox() {
    const q = state.deck[state.currentIndex];
    el.pointChip.textContent = q.pointTag || (q.isHallucination ? "嘘ポイント" : "ガチ雑学");
    el.pointChip.className = "vn-point-line " + (q.isHallucination ? "" : "truth-chip");
    el.pointChip.classList.remove("hidden");

    window.haruSound.stopSpeak();
    state.phase = "explanation";
    state.pages = splitIntoPages(q.explanation, 50);
    state.pageIndex = 0;
    showCurrentPage();
  }

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

    el.resultHistoryList.innerHTML = "";
    state.history.forEach((h, i) => {
      const row = document.createElement("div");
      row.className = `history-item ${h.isCorrect ? "item-ok" : "item-ng"}`;
      const badge = h.isHallucination ? "🚨嘘" : "✨事実";
      const mark = h.isCorrect ? "⭕見破り" : "❌失敗";
      row.innerHTML = `
        <div style="flex:1;">
          <strong>Q${i + 1} [${badge}]</strong> ${h.pointTag || ""}<br>
          <span style="color:#6b5863;">${h.statement.slice(0, 38)}…</span>
        </div>
        <strong style="white-space:nowrap;">${mark}</strong>
      `;
      el.resultHistoryList.appendChild(row);
    });
  }

  function openSettingsModal() {
    el.rngOpacity.value = String(state.uiOpacityPct);
    el.lblOpacity.textContent = `${state.uiOpacityPct}%`;
    el.chkVoice.checked = window.haruSound.voiceEnabled;
    el.chkSE.checked = window.haruSound.seEnabled;
    el.inputGeminiKey.value = localStorage.getItem("haru_gemini_api_key") || "";
    el.selectGeminiModel.value = localStorage.getItem("haru_gemini_model") || "gemini-2.5-flash";
    syncSampleCardSelection();
    el.settingsModal.classList.remove("hidden");
  }

  function saveSettingsFromModal() {
    const opacityVal = parseInt(el.rngOpacity.value, 10);
    applyUIOpacity(opacityVal);
    localStorage.setItem("haru_ui_opacity", String(opacityVal));

    window.haruSound.setVoiceEnabled(el.chkVoice.checked);
    window.haruSound.setSEEnabled(el.chkSE.checked);

    const apiKey = el.inputGeminiKey.value.trim();
    const model = el.selectGeminiModel.value;
    localStorage.setItem("haru_gemini_api_key", apiKey);
    localStorage.setItem("haru_gemini_model", model);

    updateTopBarIcons();
    updateAIKeyBadge();
    window.haruSound.stopSpeak();
    window.haruSound.playClick();
    el.settingsModal.classList.add("hidden");
  }

  async function startAIGame() {
    const topic = el.inputCustomTopic.value.trim() || "おまかせの面白い雑学";
    const apiKey = (localStorage.getItem("haru_gemini_api_key") || "").trim();
    const model = localStorage.getItem("haru_gemini_model") || "gemini-2.5-flash";

    if (!apiKey) {
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
