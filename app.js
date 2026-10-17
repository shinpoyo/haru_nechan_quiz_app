// はるしねーちゃん メインゲームロジック（春野詩音・ノベル風UI・確実な意味分割ページネーション）

(() => {
  const state = {
    deck: [],
    currentIndex: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    trickedByLieCount: 0,
    doubtedTruthCount: 0,
    history: [],

    phase: "question", // "question" | "reaction" | "explanation"
    pages: [],
    pageIndex: 0,
    typingTimer: null,
    fullCurrentText: "",
    currentMood: "normal",
    lastModeCount: 7,
    uiOpacityPct: parseInt(localStorage.getItem("haru_ui_opacity") || "75", 10)
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
    judgeStamp: document.getElementById("judgeStamp"),

    titleScreen: document.getElementById("titleScreen"),
    quizScreen: document.getElementById("quizScreen"),
    resultScreen: document.getElementById("resultScreen"),

    btnStartStandard: document.getElementById("btnStartStandard"),
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

    phoneResultCard: document.getElementById("phoneResultCard"),
    phoneVerdictBadge: document.getElementById("phoneVerdictBadge"),
    phoneExplanationText: document.getElementById("phoneExplanationText"),
    btnOpenOssan: document.getElementById("btnOpenOssan"),

    ossanModal: document.getElementById("ossanModal"),
    ossanCard: document.getElementById("ossanCard"),
    ossanHalluType: document.getElementById("ossanHalluType"),
    ossanHalluReason: document.getElementById("ossanHalluReason"),
    btnCloseOssan: document.getElementById("btnCloseOssan"),
    btnCloseOssanTop: document.getElementById("btnCloseOssanTop"),

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
    rngOpacity: document.getElementById("rngOpacity"),
    lblOpacity: document.getElementById("lblOpacity"),
    chkVoice: document.getElementById("chkVoice"),
    chkSE: document.getElementById("chkSE"),
    btnSaveSettings: document.getElementById("btnSaveSettings")
  };

  function init() {
    applyUIOpacity(state.uiOpacityPct);
    updateTopBarIcons();
    updateLifetimeStatsUI();

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
      window.haruSound.stopSpeak();
      el.settingsModal.classList.add("hidden");
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

    el.dialogueBody.addEventListener("click", (e) => {
      e.stopPropagation();
      handleTextboxAdvance();
    });

    el.btnNextAction.addEventListener("click", (e) => {
      e.stopPropagation();
      handleTextboxAdvance();
    });

    if (el.phoneResultCard) {
      el.phoneResultCard.addEventListener("click", (e) => {
        e.stopPropagation();
        handleTextboxAdvance();
      });
    }

    if (el.btnOpenOssan) {
      el.btnOpenOssan.addEventListener("click", (e) => {
        e.stopPropagation();
        openOssanModal();
      });
    }

    if (el.ossanCard) {
      el.ossanCard.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    }

    const closeOssan = (e) => {
      if (e) e.stopPropagation();
      window.haruSound.playClick();
      if (el.ossanModal) el.ossanModal.classList.add("hidden");
    };

    if (el.btnCloseOssan) el.btnCloseOssan.addEventListener("click", closeOssan);
    if (el.btnCloseOssanTop) el.btnCloseOssanTop.addEventListener("click", closeOssan);
    if (el.ossanModal) el.ossanModal.addEventListener("click", closeOssan);

    el.btnReplayVoice.addEventListener("click", (e) => {
      e.stopPropagation();
      window.haruSound.setVoiceEnabled(true);
      updateTopBarIcons();
      playCurrentPageVoice();
    });

    el.btnChooseHallucination.addEventListener("click", () => submitAnswer(true));
    el.btnChooseTruth.addEventListener("click", () => submitAnswer(false));

    el.btnTsukkomi.addEventListener("click", () => {
      const q = state.deck[state.currentIndex];
      if (!q) return;
      window.haruSound.playHint();
      const hintMood = q.hintExpr || (q.isHallucination ? "confused" : "pout");
      setSisterExpression(hintMood, "");
      const cleanHint = q.hint.replace(/^お姉ちゃん/, "").replace(/^「|」$/g, "").trim();
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

    el.charViewport.classList.remove("anim-happy", "anim-shock");
    if (animateType) {
      void el.charViewport.offsetWidth;
      el.charViewport.classList.add(animateType);
    }
  }

  // 括弧（『』「」（）【】）の入れ子を考慮した文末記号による文分割
  function splitSentencesRespectingQuotes(text) {
    const result = [];
    let cur = "";
    let inDouble = 0; // 『』
    let inSingle = 0; // 「」
    let inParen = 0;  // （）
    let inCorner = 0; // 【】

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      cur += ch;
      if (ch === "『") inDouble++;
      else if (ch === "』") inDouble = Math.max(0, inDouble - 1);
      else if (ch === "「") inSingle++;
      else if (ch === "」") inSingle = Math.max(0, inSingle - 1);
      else if (ch === "（" || ch === "(") inParen++;
      else if (ch === "）" || ch === ")") inParen = Math.max(0, inParen - 1);
      else if (ch === "【") inCorner++;
      else if (ch === "】") inCorner = Math.max(0, inCorner - 1);

      if (inDouble === 0 && inSingle === 0 && inParen === 0 && inCorner === 0) {
        if (/[！？。]/.test(ch)) {
          while (i + 1 < text.length && /[」』）】〜…\s！？。]/.test(text[i + 1])) {
            cur += text[++i];
          }
          result.push(cur.trim());
          cur = "";
        }
      }
    }
    if (cur.trim()) result.push(cur.trim());
    return result;
  }

  // 1文が maxLen を超える場合、意味の区切れ（接続助詞・読点）で安全に句分割
  function splitLongSentenceByClauses(sentence, maxLen = 54) {
    if (sentence.length <= maxLen) return [sentence];

    let inDouble = 0;
    let inSingle = 0;
    let inParen = 0;
    let inCorner = 0;
    const breakPoints = [];

    for (let i = 0; i < sentence.length; i++) {
      const ch = sentence[i];
      if (ch === "『") inDouble++;
      else if (ch === "』") inDouble = Math.max(0, inDouble - 1);
      else if (ch === "「") inSingle++;
      else if (ch === "」") inSingle = Math.max(0, inSingle - 1);
      else if (ch === "（" || ch === "(") inParen++;
      else if (ch === "）" || ch === ")") inParen = Math.max(0, inParen - 1);
      else if (ch === "【") inCorner++;
      else if (ch === "】") inCorner = Math.max(0, inCorner - 1);

      if (inDouble === 0 && inSingle === 0 && inParen === 0 && inCorner === 0) {
        if (ch === "、") {
          const prev10 = sentence.slice(Math.max(0, i - 8), i + 1);
          let weight = 10;
          if (/(から|けど|けれど|ので|のに|だが|が|ため|であり|ものの|たり|して)、$/.test(prev10)) {
            weight = 30;
          }
          if (/[』」）】]、$/.test(sentence.slice(Math.max(0, i - 2), i + 1))) {
            weight = 40;
          }
          breakPoints.push({ index: i + 1, weight });
        }
      }
    }

    if (breakPoints.length === 0) {
      const res = [];
      let rem = sentence;
      while (rem.length > maxLen) {
        res.push(rem.slice(0, maxLen));
        rem = rem.slice(maxLen);
      }
      if (rem) res.push(rem);
      return res;
    }

    const chunks = [];
    let start = 0;

    while (start < sentence.length) {
      const remaining = sentence.slice(start);
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }

      const validPoints = breakPoints.filter(bp => bp.index >= start + 18 && bp.index <= start + maxLen);

      if (validPoints.length > 0) {
        validPoints.sort((a, b) => (b.weight - a.weight) || (b.index - a.index));
        const chosen = validPoints[0].index;
        chunks.push(sentence.slice(start, chosen));
        start = chosen;
      } else {
        const fallbackPoints = breakPoints.filter(bp => bp.index > start);
        if (fallbackPoints.length > 0 && fallbackPoints[0].index <= start + maxLen + 8) {
          const chosen = fallbackPoints[0].index;
          chunks.push(sentence.slice(start, chosen));
          start = chosen;
        } else {
          const cut = Math.min(start + maxLen, sentence.length);
          chunks.push(sentence.slice(start, cut));
          start = cut;
        }
      }
    }

    return chunks;
  }

  // 意味の区切れ（文単位・接続句単位）を保ち、スマホ3行に余裕を持って収まるよう自然にページ分割
  function splitIntoPages(text, maxLen = 54) {
    let cleaned = text.trim();
    // 冒頭と末尾の「」を取り除く（セリフを「」で括らない）
    cleaned = cleaned.replace(/^「|」$/g, "").trim();

    const rawSentences = splitSentencesRespectingQuotes(cleaned);
    const units = [];
    for (const s of rawSentences) {
      if (s.length <= maxLen) {
        units.push(s);
      } else {
        units.push(...splitLongSentenceByClauses(s, maxLen));
      }
    }

    const pages = [];
    let cur = "";

    for (const u of units) {
      if (!cur) {
        cur = u;
      } else if ((cur + u).length <= maxLen) {
        cur += u;
      } else {
        pages.push(cur);
        cur = u;
      }
    }
    if (cur) pages.push(cur);

    // 末尾が数文字（例：「！」）だけ孤立した場合は前のページと結合
    if (pages.length > 1 && pages[pages.length - 1].length <= 8) {
      const last = pages.pop();
      pages[pages.length - 1] += last;
    }

    // 「」で括らず、そのまま返す
    return pages.map(p => p.replace(/^「|」$/g, "").trim());
  }

  function playCurrentPageVoice() {
    if (!state.currentPregenKey) return;
    const q = state.deck[state.currentIndex];
    const m = state.currentPregenKey.match(/_([qhr])$/);
    const suffix = m ? m[1] : "";
    const bounds = (q && q.pageBounds && suffix && Array.isArray(q.pageBounds[suffix]))
      ? q.pageBounds[suffix]
      : null;
    const totalPages = state.pages.length;
    const idx = state.pageIndex;

    if (totalPages <= 1 || !bounds || bounds.length !== totalPages - 1) {
      if (idx === 0) {
        window.haruSound.speakSegment(state.currentPregenKey, 0, null);
      }
      return;
    }

    const startSec = idx === 0 ? 0 : bounds[idx - 1];
    const endSec = idx < bounds.length ? bounds[idx] : null;
    window.haruSound.speakSegment(state.currentPregenKey, startSec, endSec);
  }

  function startPagedDialogue(fullText, mood, phase, pregenKey = "") {
    state.phase = phase;
    state.currentPregenKey = pregenKey;
    state.pages = splitIntoPages(fullText);
    state.pageIndex = 0;

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

    playCurrentPageVoice();

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
    } else {
      const isLastQ = state.currentIndex + 1 >= state.deck.length;
      el.pageHintText.textContent = isLastQ ? "タップで結果発表へ" : "タップで次の話へ";
      el.btnNextAction.textContent = isLastQ ? "結果 ▶" : "次へ ▶";
    }
  }

  function handleTextboxAdvance() {
    // 文字送り中なら一瞬で全文表示
    if (state.typingTimer) {
      finishTypewriterImmediately();
      return;
    }

    // 次のページがある場合
    if (state.pageIndex < state.pages.length - 1) {
      window.haruSound.playClick();
      state.pageIndex++;
      showCurrentPage();
      return;
    }

    // 最後のページの場合の進行処理
    if (state.phase === "question") {
      if (state.pages.length > 1) {
        // もう一度最初から読み返す
        window.haruSound.playClick();
        state.pageIndex = 0;
        showCurrentPage();
      } else {
        el.choiceContainer.classList.toggle("hidden");
      }
    } else {
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
    if (el.phoneResultCard) el.phoneResultCard.classList.add("hidden");
    el.titleScreen.classList.remove("hidden");
    el.quizScreen.classList.add("hidden");
    el.resultScreen.classList.add("hidden");
    el.comboPill.classList.add("hidden");
    el.progressPill.textContent = "待機中";
    updateLifetimeStatsUI();
  }

  // フルボイス（_q, _h, _r の3種すべて）が収録済みの問題ID判定
  const FULL_VOICE_NUMS = new Set([
    1, 2, 3, 4, 6, 7, 8, 9, 11, 13, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30,
    31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
    51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
    71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 84, 86
  ]);
  function hasFullVoice(qid) {
    if (!qid) return false;
    const num = parseInt(qid.replace("q", ""), 10);
    return FULL_VOICE_NUMS.has(num);
  }

  function startCuratedGame(count) {
    state.lastModeCount = count;
    const allPool = [...window.HARU_QUESTIONS];
    // ボイスON時は、途中で声が出なくなるのを防ぐためフルボイス完備の問題から出題
    const voicedPool = allPool.filter(q => hasFullVoice(q.id));
    const pool = (window.haruSound && window.haruSound.voiceEnabled && voicedPool.length >= count)
      ? voicedPool
      : allPool;
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

    if (el.phoneResultCard) {
      el.phoneResultCard.classList.add("hidden");
    }
    if (el.btnOpenOssan) {
      el.btnOpenOssan.classList.add("hidden");
    }
    if (el.ossanModal) {
      el.ossanModal.classList.add("hidden");
    }

    if (q.id && window.haruSound && window.haruSound.preloadQuestionVoices) {
      window.haruSound.preloadQuestionVoices(q.id);
    }

    setSisterExpression("normal");
    startPagedDialogue(q.statement, "normal", "question", q.id ? `${q.id}_q` : "");
  }

  function openOssanModal() {
    const q = state.deck[state.currentIndex];
    if (!q || !q.isHallucination) return;

    window.haruSound.playHint();
    if (el.ossanHalluType) {
      el.ossanHalluType.textContent = `🧠 ${q.halluType || "記憶・文脈の混同型"}`;
    }
    if (el.ossanHalluReason) {
      el.ossanHalluReason.textContent = q.halluReason || "フッ、これはもっともらしい言葉を確率的に繋ぎ合わせた典型的なハルシネーションだね！";
    }
    if (el.ossanModal) {
      el.ossanModal.classList.remove("hidden");
    }
  }

  function submitAnswer(guessedHallucination) {
    if (state.phase !== "question") return;

    const q = state.deck[state.currentIndex];
    const isCorrect = guessedHallucination === q.isHallucination;

    if (isCorrect) {
      state.score++;
      state.combo++;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      window.haruSound.playCorrect();
    } else {
      state.combo = 0;
      if (q.isHallucination) {
        state.trickedByLieCount++;
      } else {
        state.doubtedTruthCount++;
      }
      window.haruSound.playWrong();
    }

    const nextExpr = q.reactionExpr || (q.isHallucination ? "shy" : "happy");
    const shockExprs = ["shock", "shy", "cry", "pout", "confused"];
    const animClass = shockExprs.includes(nextExpr) ? "anim-shock" : "anim-happy";

    if (state.combo >= 2) {
      el.comboPill.textContent = `🔥 ${state.combo}`;
      el.comboPill.classList.remove("hidden");
    } else {
      el.comboPill.classList.add("hidden");
    }

    // 1. こっそりスマホ検索ウィンドウ（機械的な正誤判定＋嘘/ホント判定＋スマート解説）を上部エリアに同時表示
    el.judgeStamp.className = "phone-judge-pill " + (isCorrect ? "stamp-correct" : "stamp-wrong");
    el.judgeStamp.textContent = isCorrect ? "⭕ 正解！" : "❌ 不正解…";

    if (el.phoneVerdictBadge) {
      el.phoneVerdictBadge.className = "phone-verdict-badge " + (q.isHallucination ? "verdict-lie" : "verdict-truth");
      el.phoneVerdictBadge.textContent = q.isHallucination
        ? "🚨 調査結果：ねーちゃんの話は【嘘（勘違い）】"
        : "✨ 調査結果：ねーちゃんの話は【ホント】";
    }

    el.pointChip.textContent = q.pointTag || (q.isHallucination ? "嘘ポイント" : "ガチ雑学");
    el.pointChip.className = "phone-point-tag " + (q.isHallucination ? "" : "truth-chip");

    const cleanExplanation = q.explanation.replace(/^【.*?】\s*/, "");
    if (el.phoneExplanationText) {
      el.phoneExplanationText.textContent = cleanExplanation;
    }

    // 嘘（ハルシネーション）の問題のときのみ、厄介な解説おじさん呼び出しボタンを表示
    if (el.btnOpenOssan) {
      if (q.isHallucination) {
        el.btnOpenOssan.classList.remove("hidden");
      } else {
        el.btnOpenOssan.classList.add("hidden");
      }
    }

    if (el.phoneResultCard) {
      el.phoneResultCard.classList.remove("hidden");
    }

    // 2. 下部の固定テキストボックスには春野詩音の1クイズ1リアクションを同時表示＆ボイス再生
    setSisterExpression(nextExpr, animClass);

    const reactionLine = q.reaction || q.reactionCorrect || "";
    const pregenKey = q.id ? `${q.id}_r` : "";
    startPagedDialogue(reactionLine, nextExpr, "reaction", pregenKey);

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

  function showResultScreen() {
    window.haruSound.playFanfare();
    el.quizScreen.classList.add("hidden");
    if (el.phoneResultCard) el.phoneResultCard.classList.add("hidden");
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
      rank = "👑 Sランク：春野詩音 完全攻略ファクトチェッカー";
      comment = "えーっ！？ スマホで調べたら私の雑学、勘違いがいっぱい混ざってたの！？ 全部ホントだと思って話してたから恥ずかしすぎる〜！ でもさすが自慢の弟（妹）だね♪";
      expr = "shy";
    } else if (ratio >= 0.7) {
      rank = "✨ Aランク：詩音ねーちゃん取扱説明書マスター";
      comment = "むむっ、スマホで答え合わせしたら私の思い込みトークが結構あったなんて〜！ 次はもっと正確な雑学を教えてあげるからね♪";
      expr = "happy";
    } else if (ratio >= 0.4) {
      rank = "🐣 Bランク：素直で可愛い信じ屋さん";
      comment = "えへへ〜、ねーちゃんの雑学トークいっぱい聞いてくれてありがとう♪ たまに勘違いも混ざっちゃうけど、もっとお話ししちゃおーっと！";
      expr = "doya";
    } else {
      rank = "🍮 Cランク：ねーちゃん信者（純度100%）";
      comment = "わーい！ ねーちゃんの話をぜんぶ素直に信じてくれるなんて、世界一ピュアで可愛い〜！ これからも一緒にいっぱい雑学トークしようね♪";
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
    el.settingsModal.classList.remove("hidden");
  }

  function saveSettingsFromModal() {
    const opacityVal = parseInt(el.rngOpacity.value, 10);
    applyUIOpacity(opacityVal);
    localStorage.setItem("haru_ui_opacity", String(opacityVal));

    window.haruSound.setVoiceEnabled(el.chkVoice.checked);
    window.haruSound.setSEEnabled(el.chkSE.checked);

    updateTopBarIcons();
    window.haruSound.stopSpeak();
    window.haruSound.playClick();
    el.settingsModal.classList.add("hidden");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
