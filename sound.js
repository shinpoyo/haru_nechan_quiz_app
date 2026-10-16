// はるしねーちゃん サウンド＆ボイスエンジン（Web Audio API + Web Speech API）

class HaruSoundEngine {
  constructor() {
    this.ctx = null;
    this.seEnabled = localStorage.getItem("haru_se_enabled") !== "false";
    this.voiceEnabled = localStorage.getItem("haru_voice_enabled") !== "false";
    this.voicePitch = parseFloat(localStorage.getItem("haru_voice_pitch") || "1.18");
    this.voiceRate = parseFloat(localStorage.getItem("haru_voice_rate") || "1.08");
    this.selectedVoiceURI = localStorage.getItem("haru_voice_uri") || "";
    this.voices = [];

    if ("speechSynthesis" in window) {
      const loadVoices = () => {
        this.voices = window.speechSynthesis.getVoices().filter(v => v.lang.includes("ja") || v.lang.includes("JP"));
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
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

  // ノベルゲームの文字送りピポ音
  playBlip(pitchOffset = 0) {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(640 + pitchOffset * 35, now);
    gain.gain.setValueAtTime(0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.036);
  }

  // ボタンクリック音
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
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  // ツッコミ（ヒント）音
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

  // 正解チャイム（ピンポーン！）
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
      gain.gain.setValueAtTime(0.18, now + times[idx]);
      gain.gain.exponentialRampToValueAtTime(0.001, now + times[idx] + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + times[idx]);
      osc.stop(now + times[idx] + 0.26);
    });
  }

  // 不正解・騙された音（ブッブー / いたずら音）
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
      gain.gain.setValueAtTime(0.11, now + idx * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.18);
      osc.stop(now + idx * 0.18 + 0.24);
    });
  }

  // 結果発表ファンファーレ
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
      gain.gain.setValueAtTime(0.16, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  }

  // Web Speech API によるお姉ちゃんボイス読み上げ
  speak(text, mood = "normal") {
    if (!this.voiceEnabled || !("speechSynthesis" in window)) return;
    this.stopSpeak();

    // 読み上げ用に記号や絵文字を整形
    const cleanText = text
      .replace(/【.*?】/g, "")
      .replace(/お姉ちゃん「|」/g, "")
      .replace(/[✨🎵♪🐙🪐🍌🎓🦋🦦💎🥩🍓🐦💨]/g, "")
      .trim();

    if (!cleanText) return;

    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = "ja-JP";

    // 感情に応じたピッチ・速度の微調整
    if (mood === "doya") {
      utter.pitch = Math.min(1.5, this.voicePitch + 0.04);
      utter.rate = this.voiceRate * 0.98;
    } else if (mood === "tehe") {
      utter.pitch = Math.min(1.6, this.voicePitch + 0.1);
      utter.rate = this.voiceRate * 1.04;
    } else if (mood === "pout") {
      utter.pitch = Math.min(1.5, this.voicePitch + 0.06);
      utter.rate = this.voiceRate * 1.06;
    } else {
      utter.pitch = this.voicePitch;
      utter.rate = this.voiceRate;
    }

    const voices = window.speechSynthesis.getVoices().filter(v => v.lang.includes("ja") || v.lang.includes("JP"));
    let chosen = null;
    if (this.selectedVoiceURI) {
      chosen = voices.find(v => v.voiceURI === this.selectedVoiceURI);
    }
    if (!chosen && voices.length > 0) {
      // 女性らしい日本語ボイスを優先選択
      chosen =
        voices.find(v => /Nanami|Kyoko|Haruka|Sayaka|Google 日本語|O-Ren/i.test(v.name)) ||
        voices[0];
    }
    if (chosen) utter.voice = chosen;

    window.speechSynthesis.speak(utter);
  }

  stopSpeak() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
}

window.haruSound = new HaruSoundEngine();
