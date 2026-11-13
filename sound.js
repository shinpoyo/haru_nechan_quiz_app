// はるしねーちゃん サウンドエンジン（モダン・ノベルゲーム風 高品位SE＆心地よい文字送り音）

class HaruSoundEngine {
  constructor() {
    this.ctx = null;
    this.seEnabled = localStorage.getItem("haru_se_enabled") !== "false";
    this.voiceEnabled = false;
    this.isVoicePlaying = false;
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

  setVoiceEnabled(_val) {
    this.voiceEnabled = false;
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

  // 文字送り音（心地よいノベルゲーム風のポポポッ・コロン系ソフトマリンバ音）
  playBlip(pitchOffset = 0) {
    if (!this.seEnabled) return;

    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    const subGain = this.ctx.createGain();

    // 耳に優しく温かみのある中高音域（ペンタトニック風の自然な揺らぎ）
    const offsets = [0, 45, 95, 30];
    const baseFreq = 820 + (offsets[pitchOffset % offsets.length] || 0);

    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.68, now + 0.028);

    subOsc.type = "triangle";
    subOsc.frequency.setValueAtTime(baseFreq * 1.5, now);
    subOsc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.02);

    subGain.gain.setValueAtTime(0.22, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.02);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2100, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.042, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);

    osc.connect(filter);
    subOsc.connect(subGain);
    subGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    subOsc.start(now);
    osc.stop(now + 0.035);
    subOsc.stop(now + 0.025);
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

  stopSpeak() {
    this.isVoicePlaying = false;
  }

  preloadQuestionVoices(_qid) {
    // ボイス機能オフのため何もしない（通信量ゼロ）
  }

  async speakSegment(_pregenKey, _startSec = 0, _endSec = null, _onEnded = null) {
    // ボイス機能オフのため何もしない
  }

  async speak(_text, _mood = "normal", _pregenKey = "") {
    // ボイス機能オフのため何もしない
  }
}

window.haruSound = new HaruSoundEngine();
