// はるしねーちゃん マルチ音声エンジン（IndexedDB永久保存＆Gemini 2.5 Pro/Flash TTS対応）

class HaruSoundEngine {
  constructor() {
    this.ctx = null;
    this.seEnabled = localStorage.getItem("haru_se_enabled") !== "false";
    this.voiceEnabled = localStorage.getItem("haru_voice_enabled") !== "false";

    // デフォルトを Aoede (Gemini TTS) + 七海(甘め)事前生成フォールバックに設定
    this.ttsEngine = localStorage.getItem("haru_tts_engine") || "gemini-tts";
    this.geminiTtsModel = localStorage.getItem("haru_gemini_tts_model") || "gemini-2.5-pro-preview-tts";
    this.geminiVoiceName = localStorage.getItem("haru_gemini_voice") || "Aoede";
    this.voicevoxSpeaker = parseInt(localStorage.getItem("haru_vv_speaker") || "8", 10);
    this.voicevoxApiKey = localStorage.getItem("haru_vv_apikey") || "";

    this.voicePitch = parseFloat(localStorage.getItem("haru_voice_pitch") || "1.12");
    this.voiceRate = parseFloat(localStorage.getItem("haru_voice_rate") || "1.06");

    this.currentAudio = null;
    this.audioCache = new Map();
    this.speakReqId = 0;
    this.dbPromise = this.initIndexedDB();
  }

  // 生成したAI音声をブラウザ内に永久保存するIndexedDB
  initIndexedDB() {
    return new Promise((resolve) => {
      if (!("indexedDB" in window)) {
        resolve(null);
        return;
      }
      const req = indexedDB.open("HaruVoiceCacheDB", 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("voices")) {
          db.createObjectStore("voices");
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    });
  }

  async getCachedBlob(key) {
    const db = await this.dbPromise;
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction("voices", "readonly");
      const req = tx.objectStore("voices").get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async saveCachedBlob(key, blob) {
    const db = await this.dbPromise;
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction("voices", "readwrite");
      tx.objectStore("voices").put(blob, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  setSEEnabled(val) {
    this.seEnabled = val;
    localStorage.setItem("haru_se_enabled", String(val));
  }

  setVoiceEnabled(val) {
    this.voiceEnabled = val;
    localStorage.setItem("haru_voice_enabled", String(val));
    if (!val) this.stopSpeak();
  }

  // ===== モダン・ノベルゲーム風 高品位サウンドエフェクト（FM倍音＋フィルタ＋残響合成） =====

  // ヘルパー: 柔らかいベル/ガラス系の単音（基本波＋倍音＋ローパス＋残響ディレイ）を鳴らす
  _playBellNote(freq, startTime, duration, vol = 0.12, brightness = 2800) {
    if (!this.ctx) return;

    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, startTime);
    masterGain.gain.linearRampToValueAtTime(vol, startTime + 0.006);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(brightness, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, brightness * 0.35), startTime + duration);

    // 基音 (Sine) + 2倍音 (Triangle) + 3倍音きらめき (Sine)
    const harmonics = [
      { ratio: 1, amp: 1.0, type: "sine", durMul: 1.0 },
      { ratio: 2, amp: 0.32, type: "triangle", durMul: 0.65 },
      { ratio: 3, amp: 0.12, type: "sine", durMul: 0.35 }
    ];

    harmonics.forEach(h => {
      const osc = this.ctx.createOscillator();
      const hGain = this.ctx.createGain();
      osc.type = h.type;
      osc.frequency.setValueAtTime(freq * h.ratio, startTime);

      hGain.gain.setValueAtTime(h.amp, startTime);
      hGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration * h.durMul);

      osc.connect(hGain);
      hGain.connect(filter);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    });

    filter.connect(masterGain);
    masterGain.connect(this.ctx.destination);
  }

  // 文字送り音（フルボイスを邪魔しない極小・上質なコトッというソフトタップ音）
  playBlip(pitchOffset = 0) {
    if (!this.seEnabled) return;
    // ボイス再生中は声が一番綺麗に聞こえるよう文字送りピポ音を鳴らさない
    if (this.voiceEnabled && this.currentAudio && !this.currentAudio.paused) return;

    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    const baseFreq = 980 + (pitchOffset % 3) * 45;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, now + 0.022);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1600, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.018, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.024);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.026);
  }

  // ボタンタップ・ページ送り音（スマホゲーム風の澄んだガラス・マリンバ系「コロンッ」音）
  playClick() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // 2音の短いクリスタルプラック（E6 -> B6 の微小アルペジオ）
    this._playBellNote(1174.66, now, 0.065, 0.075, 3400);        // D6
    this._playBellNote(1760.00, now + 0.018, 0.085, 0.06, 4200); // A6
  }

  // ツッコミ（揺さぶり）音（キュートなキラッ✨＋エレピベルの「ポロロン♪」）
  playHint() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // F#maj7 系の可愛いキラキラ上昇アルペジオ
    const notes = [739.99, 932.33, 1108.73, 1396.91, 1864.66];
    notes.forEach((freq, i) => {
      this._playBellNote(freq, now + i * 0.042, 0.28, 0.075, 4800);
    });
  }

  // 正解チャイム（現代アニメゲーム風の華やかなクリスタルベル＋キラキラ残響）
  playCorrect() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // メインのクリスタルチャイム (A5 -> E6 -> A6 + 和音)
    this._playBellNote(880.00, now, 0.28, 0.12, 4500);          // A5
    this._playBellNote(1108.73, now + 0.09, 0.32, 0.11, 4800);  // C#6
    this._playBellNote(1318.51, now + 0.18, 0.55, 0.13, 5200);  // E6
    this._playBellNote(1760.00, now + 0.18, 0.65, 0.11, 6000);  // A6

    // 後ろで鳴るキラキラ粒子 (高域の微細なアルペジオ)
    const sparkles = [2217.46, 2637.02, 3520.00];
    sparkles.forEach((f, idx) => {
      this._playBellNote(f, now + 0.24 + idx * 0.055, 0.35, 0.04, 7000);
    });
  }

  // 不正解・騙された音（耳障りなブザーを廃止し、可愛いいたずら風の柔らかい「ポワワ〜ン」マリンバ音）
  playWrong() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // 柔らかいローパスを通したコミカルな下降2音（E4+Bb4 -> Eb4+A4）
    const pairs = [
      { f1: 329.63, f2: 466.16, t: 0, dur: 0.16 },
      { f1: 293.66, f2: 415.30, t: 0.15, dur: 0.36 }
    ];

    pairs.forEach(p => {
      this._playBellNote(p.f1, now + p.t, p.dur, 0.11, 1200);
      this._playBellNote(p.f2, now + p.t, p.dur, 0.08, 1400);
    });
  }

  // 結果発表ファンファーレ（透明感のあるノベルゲーム風クリアジングル＋キラキラコード）
  playFanfare() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // 華やかな上昇メロディ (D5 -> F#5 -> A5 -> C#6 -> D6)
    const melody = [
      { f: 587.33, t: 0.00, d: 0.22, v: 0.10 },
      { f: 739.99, t: 0.09, d: 0.22, v: 0.10 },
      { f: 880.00, t: 0.18, d: 0.25, v: 0.11 },
      { f: 1108.73, t: 0.27, d: 0.30, v: 0.11 },
      { f: 1174.66, t: 0.38, d: 0.85, v: 0.14 }
    ];
    melody.forEach(m => this._playBellNote(m.f, now + m.t, m.d, m.v, 5200));

    // 最終コードの厚み (F#5 + A5 +F#6)
    this._playBellNote(739.99, now + 0.38, 0.85, 0.08, 3600);
    this._playBellNote(1479.98, now + 0.44, 0.75, 0.07, 6000);
    this._playBellNote(2349.32, now + 0.50, 0.65, 0.045, 7500);
  }

  cleanTextForSpeech(text) {
    return text
      .replace(/【.*?】/g, "")
      .replace(/^「|」$/g, "")
      .replace(/お姉ちゃん「|」/g, "")
      .replace(/[✨🎵♪🐙🪐🍌🎓🦋🦦💎🥩🍓🐦💨🎯😈💦🚨👑🐣🍮]/g, "")
      .trim();
  }

  stopSpeak() {
    this.speakReqId++;
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  playAudioUrl(url) {
    this.stopSpeak();
    const audio = new Audio(url);
    this.currentAudio = audio;
    audio.play().catch(e => console.warn("Audio play blocked or failed:", e));
    return audio;
  }

  async tryPlayFile(path, reqId) {
    return new Promise((resolve) => {
      if (reqId !== this.speakReqId) {
        resolve(true);
        return;
      }
      const audio = new Audio(path);
      audio.oncanplaythrough = () => {
        if (reqId !== this.speakReqId) {
          resolve(true);
          return;
        }
        this.currentAudio = audio;
        audio.play().then(() => resolve(true)).catch(() => resolve(false));
      };
      audio.onerror = () => resolve(false);
    });
  }

  // 音声再生メインエントリ
  async speak(text, mood = "normal", pregenKey = "") {
    if (!this.voiceEnabled) return;
    const cleanText = this.cleanTextForSpeech(text);
    if (!cleanText) return;

    this.stopSpeak();
    const reqId = this.speakReqId;

    // 1. 事前保存された Aoede 音声ファイルがあれば最優先で再生（待ち時間0秒・API消費0）
    if (this.ttsEngine === "gemini-tts" && pregenKey) {
      const playedAoedeFile = await this.tryPlayFile(`assets/voices_aoede/${pregenKey}.mp3`, reqId);
      if (playedAoedeFile) return;
    }

    // 2. Gemini 2.5 Pro / Flash TTS モード（IndexedDB永久キャッシュ対応）
    if (this.ttsEngine === "gemini-tts") {
      const apiKey = (localStorage.getItem("haru_gemini_api_key") || "").trim();
      if (apiKey) {
        const ok = await this.speakWithGeminiTTS(cleanText, mood, apiKey, reqId);
        if (ok || reqId !== this.speakReqId) return;
      }
    }

    // 3. Edge Neural 事前生成ボイス（七海・甘め）があれば再生（APIキー未設定時の高音質バックアップ！）
    if ((this.ttsEngine === "edge-neural" || this.ttsEngine === "gemini-tts") && pregenKey) {
      const playedEdgeFile = await this.tryPlayFile(`assets/voices_nanami/${pregenKey}.mp3`, reqId);
      if (playedEdgeFile) return;
    }

    // 4. VOICEVOX Web API モード
    if (this.ttsEngine === "voicevox") {
      const ok = await this.speakWithVoicevox(cleanText, mood, reqId);
      if (ok || reqId !== this.speakReqId) return;
    }

    // 5. 最終バックアップ: 七海(甘め)事前生成ファイル -> Web Speech API
    if (pregenKey) {
      const playedFallback = await this.tryPlayFile(`assets/voices_nanami/${pregenKey}.mp3`, reqId);
      if (playedFallback) return;
    }

    if (reqId === this.speakReqId) {
      this.speakWithWebSpeech(cleanText, mood);
    }
  }

  async speakWithVoicevox(cleanText, mood, reqId) {
    let speaker = this.voicevoxSpeaker;
    if (speaker === 2) {
      if (mood === "tehe" || mood === "happy") speaker = 0;
      else if (mood === "pout") speaker = 6;
    }

    const cacheKey = `vv_${speaker}_${cleanText}`;
    if (this.audioCache.has(cacheKey)) {
      if (reqId !== this.speakReqId) return true;
      this.playAudioUrl(this.audioCache.get(cacheKey));
      return true;
    }

    try {
      const params = new URLSearchParams({
        text: cleanText,
        speaker: String(speaker)
      });
      if (this.voicevoxApiKey) {
        params.set("key", this.voicevoxApiKey);
      }

      const res = await fetch(`https://api.tts.quest/v3/voicevox/synthesis?${params.toString()}`);
      if (!res.ok) return false;
      const data = await res.json();
      const mp3Url = data.mp3StreamingUrl || data.mp3DownloadUrl;
      if (!mp3Url) return false;

      for (let i = 0; i < 12; i++) {
        if (reqId !== this.speakReqId) return true;
        const check = await fetch(mp3Url);
        if (check.ok) {
          const blob = await check.blob();
          if (blob.size > 800) {
            const blobUrl = URL.createObjectURL(blob);
            this.audioCache.set(cacheKey, blobUrl);
            if (reqId === this.speakReqId) {
              this.playAudioUrl(blobUrl);
            }
            return true;
          }
        }
        await new Promise(r => setTimeout(r, 700));
      }
    } catch (e) {
      console.warn("VOICEVOX API fallback:", e);
    }
    return false;
  }

  // Gemini 2.5 Pro / Flash Preview TTS（IndexedDBへの永久保存付き）
  async speakWithGeminiTTS(cleanText, mood, apiKey, reqId) {
    const voiceName = this.geminiVoiceName || "Aoede";
    const ttsModel = this.geminiTtsModel || "gemini-2.5-pro-preview-tts";
    const cacheKey = `gem_${ttsModel}_${voiceName}_${mood}_${cleanText}`;

    // メモリキャッシュ確認
    if (this.audioCache.has(cacheKey)) {
      if (reqId !== this.speakReqId) return true;
      this.playAudioUrl(this.audioCache.get(cacheKey));
      return true;
    }

    // IndexedDB永久キャッシュ確認
    const savedBlob = await this.getCachedBlob(cacheKey);
    if (savedBlob) {
      const blobUrl = URL.createObjectURL(savedBlob);
      this.audioCache.set(cacheKey, blobUrl);
      if (reqId === this.speakReqId) {
        this.playAudioUrl(blobUrl);
      }
      return true;
    }

    const styleMap = {
      normal: "明るく自信満々で愛嬌たっぷりの可愛いお姉ちゃん口調で、自然な息遣いと抑揚をつけて楽しそうに話してください",
      doya: "「ふっふっふ、引っかかったね♪」という超ドヤ顔で得意げに、イタズラっぽく可愛いお姉ちゃん口調で話してください",
      tehe: "嘘がバレて「えへへ、バレちゃった〜？」と可愛く照れ隠しするような、甘めで弾んだお姉ちゃん口調で話してください",
      happy: "満面の笑顔で弟や妹を褒めるように、嬉しそうで華やかなお姉ちゃん口調で話してください",
      pout: "「むーっ！今回は本当なのに！」とほっぺを膨らませて可愛く拗ねたお姉ちゃん口調で話してください"
    };
    const styleInst = styleMap[mood] || styleMap.normal;

    // Proモデルでエラーまたはクォータ制限の場合は自動でFlashモデルにフォールバック
    const modelsToTry = ttsModel.includes("pro")
      ? ["gemini-2.5-pro-preview-tts", "gemini-2.5-flash-preview-tts"]
      : ["gemini-2.5-flash-preview-tts"];

    for (const modelName of modelsToTry) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `${styleInst}：\n「${cleanText}」`
                    }
                  ]
                }
              ],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: voiceName
                    }
                  }
                }
              }
            })
          }
        );

        if (!res.ok) continue;
        const data = await res.json();
        const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (!inlineData || !inlineData.data) continue;

        const wavBlob = this.pcmBase64ToWavBlob(inlineData.data, 24000);
        await this.saveCachedBlob(cacheKey, wavBlob);
        const blobUrl = URL.createObjectURL(wavBlob);
        this.audioCache.set(cacheKey, blobUrl);

        if (reqId === this.speakReqId) {
          this.playAudioUrl(blobUrl);
        }
        return true;
      } catch (e) {
        console.warn(`Gemini TTS (${modelName}) error:`, e);
      }
    }
    return false;
  }

  pcmBase64ToWavBlob(base64Pcm, sampleRate = 25000) {
    const binaryStr = atob(base64Pcm);
    const pcmLen = binaryStr.length;
    const wavBuffer = new ArrayBuffer(44 + pcmLen);
    const view = new DataView(wavBuffer);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + pcmLen, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, pcmLen, true);

    const uint8 = new Uint8Array(wavBuffer, 44);
    for (let i = 0; i < pcmLen; i++) {
      uint8[i] = binaryStr.charCodeAt(i);
    }

    return new Blob([wavBuffer], { type: "audio/wav" });
  }

  speakWithWebSpeech(cleanText, mood = "normal") {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = "ja-JP";
    utter.pitch = this.voicePitch;
    utter.rate = this.voiceRate;

    const voices = window.speechSynthesis.getVoices().filter(v => v.lang.includes("ja") || v.lang.includes("JP"));
    if (voices.length > 0) {
      const chosen =
        voices.find(v => /Nanami|Kyoko|Haruka|Sayaka|Google 日本語|O-Ren/i.test(v.name)) ||
        voices[0];
      if (chosen) utter.voice = chosen;
    }
    window.speechSynthesis.speak(utter);
  }
}

window.haruSound = new HaruSoundEngine();
