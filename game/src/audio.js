// Sound, synthesized live with WebAudio: no audio files. A low engine
// hum that follows the car's speed, a two-tone siren when the police are
// close, gunshots, pickups and a small bass-and-hats music loop. M mutes.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let muted = false;
  let started = false;

  /** Build the graph on the first user gesture (browsers demand one). */
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: a sawtooth whose pitch follows speed, kept quiet.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a sine that swings between two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      started = true;
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  /** A short filtered noise burst: gunshots, crashes, punches. */
  function noiseBurst(duration, frequency, volume) {
    if (!ctx || muted) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  /** A short sine blip: pickups, UI, mission chimes. */
  function blip(frequency, duration, volume, slideTo) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  /** A lazy bass line with hats, one bar at a time, on a timer. */
  function startMusic() {
    if (musicTimer) return;
    const bassNotes = [55, 55, 65.4, 49]; // A1 A1 C2 G1
    let step = 0;
    const tick = () => {
      if (!ctx || muted) return;
      const beat = 0.24;
      const note = bassNotes[Math.floor(step / 4) % bassNotes.length];
      if (step % 2 === 0) blip(note, beat * 0.9, 0.16);
      if (step % 4 === 2) noiseBurst(0.05, 6000, 0.05);
      step += 1;
    };
    musicTimer = window.setInterval(tick, 240);
  }

  return {
    ensure,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    isStarted() {
      return started;
    },
    /** Continuous sounds, called every frame with the live game state. */
    update({ driving, speed, sirenNear }) {
      if (!ctx || muted) return;
      const now = ctx.currentTime;
      if (engineGain) {
        const target = driving ? 0.05 + Math.min(0.09, Math.abs(speed) / 5000) : 0;
        engineGain.gain.setTargetAtTime(target, now, 0.1);
        engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 0.16, now, 0.08);
      }
      if (sirenGain) {
        const target = sirenNear ? 0.05 : 0;
        sirenGain.gain.setTargetAtTime(target, now, 0.2);
        // Two-tone wail: alternate 700 and 950 Hz every half second.
        const phase = Math.floor(now * 2) % 2;
        sirenOsc.frequency.setTargetAtTime(phase === 0 ? 700 : 950, now, 0.05);
      }
    },
    gunshot() {
      noiseBurst(0.12, 1800, 0.5);
    },
    crash(power) {
      noiseBurst(0.2, 900, Math.min(0.6, 0.2 + power / 1200));
    },
    explosion() {
      noiseBurst(0.7, 400, 0.8);
      blip(60, 0.5, 0.5, 30);
    },
    pickup() {
      blip(660, 0.12, 0.25);
      window.setTimeout(() => blip(990, 0.16, 0.25), 90);
    },
    melee() {
      noiseBurst(0.08, 700, 0.3);
    },
    hurt() {
      blip(180, 0.15, 0.3, 90);
    },
    missionStart() {
      blip(523, 0.14, 0.25);
      window.setTimeout(() => blip(784, 0.2, 0.25), 140);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => blip(f, 0.22, 0.28), i * 130));
    },
    objective() {
      blip(880, 0.12, 0.2);
    },
    respray() {
      blip(440, 0.2, 0.25, 880);
    },
    click() {
      blip(700, 0.07, 0.18);
    },
  };
}
