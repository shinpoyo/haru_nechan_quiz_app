// はるしねーちゃん サウンド＆フルボイス再生エンジン（事前収録フルボイス＆高品位SE）

class HaruSoundEngine {
  constructor() {
    this.ctx = null;
    this.seEnabled = localStorage.getItem("haru_se_enabled") !== "false";
    this.voiceEnabled = localStorage.getItem("haru_voice_enabled") !== "false";

    this.voicePitch = 1.12;
    this.voiceRate = 1.06;

    this.currentAudio = null;
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

  // ボタンタップ・ページ送り音（澄んだガラス・マリンバ系「コロンッ」音）
  playClick() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    this._playBellNote(1174.66, now, 0.065, 0.075, 3400);        // D6
    this._playBellNote(1760.00, now + 0.018, 0.085, 0.06, 4200); // A6
  }

  // ツッコミ（揺さぶり）音（キュートなキラッ✨＋エレピベルの「ポロロン♪」）
  playHint() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
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
    this._playBellNote(880.00, now, 0.28, 0.12, 4500);          // A5
    this._playBellNote(1108.73, now + 0.09, 0.32, 0.11, 4800);  // C#6
    this._playBellNote(1318.51, now + 0.18, 0.55, 0.13, 5200);  // E6
    this._playBellNote(1760.00, now + 0.18, 0.65, 0.11, 6000);  // A6

    const sparkles = [2217.46, 2637.02, 3520.00];
    sparkles.forEach((f, idx) => {
      this._playBellNote(f, now + 0.24 + idx * 0.055, 0.35, 0.04, 7000);
    });
  }

  // 不正解・騙された音（柔らかいいたずら風の「ポワワ〜ン」マリンバ音）
  playWrong() {
    if (!this.seEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
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
    const melody = [
      { f: 587.33, t: 0.00, d: 0.22, v: 0.10 },
      { f: 739.99, t: 0.09, d: 0.22, v: 0.10 },
      { f: 880.00, t: 0.18, d: 0.25, v: 0.11 },
      { f: 1108.73, t: 0.27, d: 0.30, v: 0.11 },
      { f: 1174.66, t: 0.38, d: 0.85, v: 0.14 }
    ];
    melody.forEach(m => this._playBellNote(m.f, now + m.t, m.d, m.v, 5200));

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

  async tryPlayFile(path, reqId) {
    return new Promise((resolve) => {
      if (reqId !== this.speakReqId) {
        resolve(true);
        return;
      }
      const cacheBustedPath = `${path}?v=20261018_3`;
      const audio = new Audio(cacheBustedPath);
      audio.preload = "auto";
      this.currentAudio = audio;

      let settled = false;
      const finish = (ok) => {
        if (!settled) {
          settled = true;
          resolve(ok);
        }
      };

      audio.onerror = () => finish(false);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          if (reqId !== this.speakReqId) {
            audio.pause();
          }
          finish(true);
        }).catch(() => finish(false));
      } else {
        finish(true);
      }
    });
  }

  // 音声再生メインエントリ（事前収録Aoedeボイス専用・未収録問題は静かにスキップ）
  async speak(text, mood = "normal", pregenKey = "") {
    if (!this.voiceEnabled || !pregenKey) return;
    const cleanText = this.cleanTextForSpeech(text);
    if (!cleanText) return;

    this.stopSpeak();
    const reqId = this.speakReqId;

    // 事前収録 Aoede（春野詩音ボイス）音声ファイルを再生
    const playedAoede = await this.tryPlayFile(`assets/voices_aoede/${pregenKey}.mp3`, reqId);
    if (playedAoede || reqId !== this.speakReqId) return;

    // 1クイズ1リアクション化対応: `${id}_r` が未作成で `${id}_c` が存在する場合は `${id}_c.mp3` を再生
    if (pregenKey.endsWith("_r")) {
      const fallbackKey = pregenKey.replace(/_r$/, "_c");
      await this.tryPlayFile(`assets/voices_aoede/${fallbackKey}.mp3`, reqId);
    }
  }
}

window.haruSound = new HaruSoundEngine();
