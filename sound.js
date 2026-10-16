// はるしねーちゃん マルチ音声エンジン
// 対応エンジン:
// 1. "voicevox"    : VOICEVOX (春日部つむぎ / 四国めたん / もち子さん / No.7)
// 2. "gemini-tts"  : Gemini 2.5 Flash Preview TTS (演技指導プロンプト付きAI音声)
// 3. "edge-neural" : Edge Neural TTS (ja-JP-NanamiNeural 事前生成高音質音声)
// 4. "webspeech"   : ブラウザ標準 Web Speech API

class HaruSoundEngine {
  constructor() {
    this.ctx = null;
    this.seEnabled = localStorage.getItem("haru_se_enabled") !== "false";
    this.voiceEnabled = localStorage.getItem("haru_voice_enabled") !== "false";

    // デフォルトをアニメ声の「voicevox（春日部つむぎ）」に設定
    this.ttsEngine = localStorage.getItem("haru_tts_engine") || "voicevox";
    this.voicevoxSpeaker = parseInt(localStorage.getItem("haru_vv_speaker") || "8", 10); // 8: 春日部つむぎ
    this.voicevoxApiKey = localStorage.getItem("haru_vv_apikey") || "";
    this.geminiVoiceName = localStorage.getItem("haru_gemini_voice") || "Kore";

    this.voicePitch = parseFloat(localStorage.getItem("haru_voice_pitch") || "1.12");
    this.voiceRate = parseFloat(localStorage.getItem("haru_voice_rate") || "1.06");

    this.currentAudio = null;
    this.audioCache = new Map();
    this.speakReqId = 0;
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

  // ===== 効果音（Web Audio API） =====
  playBlip(pitchOffset = 0) {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(640 + pitchOffset * 35, now);
    gain.gain.setValueAtTime(0.022, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.036);
  }

  playClick() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  playHint() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [587.33, 880].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.1, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.13);
    });
  }

  playCorrect() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [659.25, 523.25, 783.99, 1046.5];
    const times = [0, 0.12, 0.24, 0.36];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + times[idx]);
      gain.gain.setValueAtTime(0.16, now + times[idx]);
      gain.gain.exponentialRampToValueAtTime(0.001, now + times[idx] + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + times[idx]);
      osc.stop(now + times[idx] + 0.26);
    });
  }

  playWrong() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [240, 195].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now + idx * 0.18);
      gain.gain.setValueAtTime(0.1, now + idx * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.18);
      osc.stop(now + idx * 0.18 + 0.24);
    });
  }

  playFanfare() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      const start = now + idx * 0.11;
      const dur = idx === notes.length - 1 ? 0.5 : 0.16;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  }

  // ===== 音声読み上げメインエントリ =====
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

  // サンプル音声ファイルまたはURLを直接再生
  playAudioUrl(url) {
    this.stopSpeak();
    const audio = new Audio(url);
    this.currentAudio = audio;
    audio.play().catch(e => console.warn("Audio play blocked or failed:", e));
    return audio;
  }

  // 事前収録ボイスがあれば優先再生（qId: "q01" など, part: "q"|"h"|"c"|"w"）
  async speak(text, mood = "normal", pregenKey = "") {
    if (!this.voiceEnabled) return;
    const cleanText = this.cleanTextForSpeech(text);
    if (!cleanText) return;

    this.stopSpeak();
    const reqId = this.speakReqId;

    // 1. Edge Neural 事前生成モードかつ事前収録MP3が存在する場合
    if (this.ttsEngine === "edge-neural" && pregenKey) {
      const mp3Path = `assets/voices/${pregenKey}.mp3`;
      try {
        const audio = new Audio(mp3Path);
        this.currentAudio = audio;
        await audio.play();
        return;
      } catch (_) {
        // ファイルが無い場合はフォールバック
      }
    }

    // 2. Gemini 2.5 Flash Preview TTS モード
    if (this.ttsEngine === "gemini-tts") {
      const apiKey = (localStorage.getItem("haru_gemini_api_key") || "").trim();
      if (apiKey) {
        const ok = await this.speakWithGeminiTTS(cleanText, mood, apiKey, reqId);
        if (ok || reqId !== this.speakReqId) return;
      }
    }

    // 3. VOICEVOX Web API モード
    if (this.ttsEngine === "voicevox") {
      const ok = await this.speakWithVoicevox(cleanText, mood, reqId);
      if (ok || reqId !== this.speakReqId) return;
    }

    // 4. 事前収録MP3があればフォールバック再生（棒読み回避！）
    if (pregenKey) {
      try {
        const audio = new Audio(`assets/voices/${pregenKey}.mp3`);
        this.currentAudio = audio;
        await audio.play();
        return;
      } catch (_) {}
    }

    // 5. 最終フォールバック: Web Speech API
    if (reqId === this.speakReqId) {
      this.speakWithWebSpeech(cleanText, mood);
    }
  }

  // VOICEVOX Web API (tts.quest) による合成
  async speakWithVoicevox(cleanText, mood, reqId) {
    let speaker = this.voicevoxSpeaker;
    // 四国めたん(2)選択時は感情に合わせてスタイル自動切替
    if (speaker === 2) {
      if (mood === "tehe" || mood === "happy") speaker = 0; // あまあま
      else if (mood === "pout") speaker = 6; // ツンツン
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

      // 音声生成完了をポーリング確認してから再生
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

  // Gemini 2.5 Flash Preview TTS による感情演技付き合成
  async speakWithGeminiTTS(cleanText, mood, apiKey, reqId) {
    const voiceName = this.geminiVoiceName || "Kore";
    const cacheKey = `gem_${voiceName}_${mood}_${cleanText}`;
    if (this.audioCache.has(cacheKey)) {
      if (reqId !== this.speakReqId) return true;
      this.playAudioUrl(this.audioCache.get(cacheKey));
      return true;
    }

    const styleMap = {
      normal: "明るく自信満々で可愛いお姉ちゃん口調で、自然な抑揚をつけて読み上げてください",
      doya: "超ドヤ顔で得意げに、イタズラっぽく笑みを浮かべたお姉ちゃん口調で読み上げてください",
      tehe: "嘘がバレて「てへぺろ♪」と可愛く照れ隠しするような弾んだお姉ちゃん口調で読み上げてください",
      happy: "満面の笑顔で弟や妹を褒めるように、嬉しそうで華やかなお姉ちゃん口調で読み上げてください",
      pout: "「むーっ！本当なのに！」とほっぺを膨らませて可愛く拗ねたお姉ちゃん口調で読み上げてください"
    };
    const styleInst = styleMap[mood] || styleMap.normal;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(apiKey)}`,
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

      if (!res.ok) return false;
      const data = await res.json();
      const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData || !inlineData.data) return false;

      const wavBlob = this.pcmBase64ToWavBlob(inlineData.data, 24000);
      const blobUrl = URL.createObjectURL(wavBlob);
      this.audioCache.set(cacheKey, blobUrl);

      if (reqId === this.speakReqId) {
        this.playAudioUrl(blobUrl);
      }
      return true;
    } catch (e) {
      console.warn("Gemini TTS error:", e);
      return false;
    }
  }

  // Gemini TTS の Base64 Linear16 PCM (24kHz, mono) を WAV Blob に変換
  pcmBase64ToWavBlob(base64Pcm, sampleRate = 24000) {
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
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, 1, true);  // 1 channel (mono)
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true);  // block align
    view.setUint16(34, 16, true); // bits per sample
    writeStr(36, "data");
    view.setUint32(40, pcmLen, true);

    const uint8 = new Uint8Array(wavBuffer, 44);
    for (let i = 0; i < pcmLen; i++) {
      uint8[i] = binaryStr.charCodeAt(i);
    }

    return new Blob([wavBuffer], { type: "audio/wav" });
  }

  // ブラウザ標準 Web Speech API
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
