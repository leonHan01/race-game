import type { Race } from './simulation/race';
import { settings } from './settings';

export class RallyAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private engine?: OscillatorNode;
  private overtone?: OscillatorNode;
  private engineGain?: GainNode;
  private gravelGain?: GainNode;
  private lastNote = -1;
  private lastJump = -1;
  private lastCountdown = -1;

  async unlock() {
    try {
      if (!this.context) this.create();
      await this.context!.resume();
    } catch { /* Gameplay is fully usable when audio is unavailable. */ }
  }
  private create() {
    const c = this.context = new AudioContext();
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(c.destination);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 680;
    this.engineGain = c.createGain(); this.engineGain.gain.value = 0.12;
    filter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engine = c.createOscillator(); this.engine.type = 'sawtooth'; this.engine.frequency.value = 35;
    this.overtone = c.createOscillator(); this.overtone.type = 'triangle'; this.overtone.frequency.value = 71;
    this.engine.connect(filter); this.overtone.connect(filter);
    this.engine.start(); this.overtone.start();
    const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
    const source = c.createBufferSource(); source.buffer = noise; source.loop = true;
    const gravelFilter = c.createBiquadFilter(); gravelFilter.type = 'bandpass'; gravelFilter.frequency.value = 950;
    this.gravelGain = c.createGain(); this.gravelGain.gain.value = 0;
    source.connect(gravelFilter); gravelFilter.connect(this.gravelGain); this.gravelGain.connect(this.master); source.start();
  }
  reset() { this.lastNote = -1; this.lastJump = -1; this.lastCountdown = -1; this.silence(); }
  silence() {
    if (this.context && this.master) this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.06);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
  update(race: Race) {
    if (!this.context || !this.master) return;
    const c = this.context;
    const active = (race.phase === 'racing' || race.phase === 'countdown') && settings.sound;
    this.master.gain.setTargetAtTime(active ? 0.5 : 0, c.currentTime, 0.1);
    if (!active) return;
    const rpm = race.vehicleMode === 'motorcycle' ? 68 + race.engineRevs * 128 : 42 + race.engineRevs * 81.6;
    this.engine!.frequency.setTargetAtTime(rpm, c.currentTime, 0.08);
    this.overtone!.frequency.setTargetAtTime(rpm * 2.01, c.currentTime, 0.08);
    this.gravelGain!.gain.setTargetAtTime(race.airborne ? 0 : Math.min(0.8, Math.abs(race.speed) / (race.isLongboard ? 45 : 95) + race.rearWheelSlip * 0.38), c.currentTime, 0.1);
    if (race.phase === 'countdown') {
      const count = Math.ceil(race.countdown);
      if (count !== this.lastCountdown && count <= 3) { this.beep(440, 0.1); this.lastCountdown = count; }
    } else if (this.lastCountdown !== 0) { this.beep(880, 0.3); this.lastCountdown = 0; }
    const note = race.nextNote;
    const jump = race.nextJump;
    if (race.phase === 'racing' && jump && jump.distance !== this.lastJump && jump.distance - race.distance < 115 && (!note || jump.distance < note.distance)) {
      this.lastJump = jump.distance;
      if (settings.voice && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance('前方坡顶，稳住起跳方向');
        utterance.lang = 'zh-CN'; utterance.rate = 1.2; utterance.volume = 0.75;
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
      }
    } else if (race.phase === 'racing' && note && note.distance !== this.lastNote && note.distance - race.distance < 115 && (!jump || note.distance < jump.distance)) {
      this.lastNote = note.distance;
      if (settings.voice && 'speechSynthesis' in window) {
        const words = `${note.direction === 'left' ? '左' : '右'}${note.severity}，${note.severity <= 3 ? (race.isLongboard ? '减速，提前制动' : '收油，晚切弯') : '保持路线'}`;
        const utterance = new SpeechSynthesisUtterance(words);
        utterance.lang = 'zh-CN'; utterance.rate = 1.2; utterance.volume = 0.75;
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
      }
    }
  }
  private beep(frequency: number, duration: number) {
    const c = this.context!;
    const oscillator = c.createOscillator(); oscillator.frequency.value = frequency;
    const envelope = c.createGain(); envelope.gain.setValueAtTime(0.18, c.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    oscillator.connect(envelope); envelope.connect(this.master!);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(); oscillator.stop(c.currentTime + duration);
  }
}
