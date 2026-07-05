/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Track {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  genre: string;
}

export const PLAYLIST: Track[] = [
  {
    id: "neon-drift",
    title: "Neon Drift",
    artist: "AI Collective",
    bpm: 125,
    description: "High-tempo driving synthwave with pulsing 16th bassline and upbeat lead notes.",
    primaryColor: "rgb(6, 182, 212)", // cyan-500
    secondaryColor: "rgb(59, 130, 246)", // blue-500
    genre: "Synthwave / Outrun"
  },
  {
    id: "cyber-skyline",
    title: "Cyber Skyline",
    artist: "Bit-Hop Labs",
    bpm: 100,
    description: "Chill outrun groove featuring smooth retro pads and a soaring sci-fi lead.",
    primaryColor: "rgb(217, 70, 239)", // fuchsia-500
    secondaryColor: "rgb(168, 85, 247)", // purple-500
    genre: "Chillwave / RetroSynth"
  },
  {
    id: "infinite-void",
    title: "Infinite Void",
    artist: "Synth-Bot 9",
    bpm: 142,
    description: "Hypnotic, dark cyber-techno with heavy low bass, fast hi-hats, and an eerie melody.",
    primaryColor: "rgb(132, 204, 22)", // lime-500
    secondaryColor: "rgb(16, 185, 129)", // emerald-500
    genre: "Darksynth / Cyberpunk"
  }
];

// Frequencies for standard notes
const NOTES = {
  // Octave 1
  C1: 32.70, Cs1: 34.65, D1: 36.71, Ds1: 38.89, E1: 41.20, F1: 43.65, Fs1: 46.25, G1: 49.00, Gs1: 51.91, A1: 55.00, As1: 58.27, B1: 61.74,
  // Octave 2
  C2: 65.41, Cs2: 69.30, D2: 73.42, Ds2: 77.78, E2: 82.41, F2: 87.31, Fs2: 92.50, G2: 98.00, Gs2: 103.83, A2: 110.00, As2: 116.54, B2: 123.47,
  // Octave 3
  C3: 130.81, Cs3: 138.59, D3: 146.83, Ds3: 155.56, E3: 164.81, F3: 174.61, Fs3: 185.00, G3: 196.00, Gs3: 207.65, A3: 220.00, As3: 233.08, B3: 246.94,
  // Octave 4
  C4: 261.63, Cs4: 277.18, D4: 293.66, Ds4: 311.13, E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392.00, Gs4: 415.30, A4: 440.00, As4: 466.16, B4: 493.88,
  // Octave 5
  C5: 523.25, Cs5: 554.37, D5: 587.33, Ds5: 622.25, E5: 659.25, F5: 698.46, Fs5: 739.99, G5: 783.99, Gs5: 830.61, A5: 880.00, As5: 932.33, B5: 987.77,
};

type NoteName = keyof typeof NOTES;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;

  private isPlaying = false;
  private currentTrackIndex = 0;
  private tempoMultiplier = 1.0;
  private volumeValue = 0.5;

  // Sequencer state
  private schedulerTimerId: number | null = null;
  private nextNoteTime = 0.0; // absolute audio timeline time when the next 16th note is due
  private current16thNote = 0; // step counter (0 to 31)
  private lookaheadMs = 25.0; // scheduling lookahead
  private scheduleAheadTimeMs = 100.0; // schedule notes 100ms in advance
  
  // Audio state triggers
  private stepCallbacks: ((step: number) => void)[] = [];

  constructor() {
    // Lazy initialization on user gesture
  }

  public init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128; // fast & responsive spectrum
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volumeValue, this.ctx.currentTime);

      // Create a gorgeous delay (echo) line for synthesizer depth
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayNode.delayTime.setValueAtTime(0.35, this.ctx.currentTime);
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.setValueAtTime(0.35, this.ctx.currentTime);

      // Wire feedback loops
      this.delayNode.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);

      // Wire master connections
      // Synths go to masterGain -> analyser -> destination
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      // Delay goes to analyser as well
      this.delayNode.connect(this.analyser);
    } catch (e) {
      console.error("Web Audio API not supported or failed to initialize", e);
    }
  }

  public start() {
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.isPlaying) return;

    this.isPlaying = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.current16thNote = 0;
    this.runScheduler();
    this.playSfx('start');
  }

  public pause() {
    this.isPlaying = false;
    if (this.schedulerTimerId) {
      clearTimeout(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
    if (this.ctx && this.ctx.state === 'running') {
      // Don't fully suspend so SFX can play if needed, but suspend is safer if desired
    }
  }

  public stop() {
    this.pause();
    this.current16thNote = 0;
  }

  public togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.start();
    }
    return this.isPlaying;
  }

  public setVolume(volume: number) {
    this.volumeValue = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volumeValue, this.ctx.currentTime, 0.05);
    }
  }

  public getVolume(): number {
    return this.volumeValue;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentTrack(): Track {
    return PLAYLIST[this.currentTrackIndex];
  }

  public getPlaylist(): Track[] {
    return PLAYLIST;
  }

  public getCurrentTrackIndex(): number {
    return this.currentTrackIndex;
  }

  public setTrackIndex(index: number) {
    const wasPlaying = this.isPlaying;
    this.stop();
    this.currentTrackIndex = (index + PLAYLIST.length) % PLAYLIST.length;
    if (wasPlaying) {
      this.start();
    }
  }

  public nextTrack() {
    this.setTrackIndex(this.currentTrackIndex + 1);
  }

  public prevTrack() {
    this.setTrackIndex(this.currentTrackIndex - 1);
  }

  public onStep(callback: (step: number) => void) {
    this.stepCallbacks.push(callback);
    return () => {
      this.stepCallbacks = this.stepCallbacks.filter(cb => cb !== callback);
    };
  }

  public setTempoMultiplier(mult: number) {
    this.tempoMultiplier = Math.max(0.5, Math.min(2.5, mult));
  }

  public getTempoMultiplier(): number {
    return this.tempoMultiplier;
  }

  public getBpm(): number {
    return this.getCurrentTrack().bpm * this.tempoMultiplier;
  }

  // Get frequency byte data for visualizer
  public getByteFrequencyData(): Uint8Array {
    if (!this.analyser) {
      return new Uint8Array(64).fill(0);
    }
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  // Scheduler Loop
  private runScheduler() {
    if (!this.isPlaying || !this.ctx) return;

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTimeMs / 1000) {
      this.scheduleNote(this.current16thNote, this.nextNoteTime);
      this.advanceNote();
    }

    this.schedulerTimerId = window.setTimeout(() => this.runScheduler(), this.lookaheadMs);
  }

  private advanceNote() {
    if (!this.ctx) return;
    // Seconds per 16th note: 60s / BPM / 4 (since four 16th notes per beat)
    const currentBpm = this.getBpm();
    const secondsPerBeat = 60.0 / currentBpm;
    const secondsPer16thNote = secondsPerBeat / 4.0;
    
    this.nextNoteTime += secondsPer16thNote;
    this.current16thNote = (this.current16thNote + 1) % 32; // 32 steps = 2 bars loop
  }

  // Play synthesized SFX
  public playSfx(type: 'eat' | 'gameover' | 'start') {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    
    if (type === 'eat') {
      // Classic 8-bit coin sound: quickly rise from low note to high note
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(NOTES.E4, now);
      osc.frequency.setValueAtTime(NOTES.B5, now + 0.08);
      
      gainNode.gain.setValueAtTime(this.volumeValue * 0.4, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      
      osc.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      osc.start(now);
      osc.stop(now + 0.25);

    } else if (type === 'gameover') {
      // Deep sliding dramatic low bass synth drop
      const osc = this.ctx.createOscillator();
      const noise = this.createNoiseNode(0.35); // Add a crunch of noise
      const gainNode = this.ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(NOTES.C3, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.8);
      
      gainNode.gain.setValueAtTime(this.volumeValue * 0.6, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      
      osc.connect(gainNode);
      if (noise) noise.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      osc.start(now);
      osc.stop(now + 0.8);

    } else if (type === 'start') {
      // Modern sci-fi pitch riser
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(NOTES.C4, now);
      osc.frequency.exponentialRampToValueAtTime(NOTES.C5, now + 0.4);
      
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(this.volumeValue * 0.3, now + 0.15);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      
      osc.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      osc.start(now);
      osc.stop(now + 0.45);
    }
  }

  // Create white noise for drums and sound effects
  private createNoiseNode(duration: number): AudioNode | null {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.start();
    return noiseSource;
  }

  // Procedural Music Synthesizer Patterns
  private scheduleNote(step: number, time: number) {
    if (!this.ctx || !this.masterGain || !this.delayNode) return;

    // Dispatch step callbacks to UI
    setTimeout(() => {
      this.stepCallbacks.forEach(cb => cb(step));
    }, Math.max(0, (time - this.ctx.currentTime) * 1000));

    const trackId = this.getCurrentTrack().id;

    // Define sequences depending on the track
    if (trackId === 'neon-drift') {
      this.playNeonDrift(step, time);
    } else if (trackId === 'cyber-skyline') {
      this.playCyberSkyline(step, time);
    } else if (trackId === 'infinite-void') {
      this.playInfiniteVoid(step, time);
    }
  }

  // TRACK 1: Neon Drift (High energy, pulsing minor key progression)
  private playNeonDrift(step: number, time: number) {
    const chordIndex = Math.floor(step / 8) % 4; // 4 chords over 32 steps (8 steps each)
    // E minor, G major, A minor, C major
    const bassChords: NoteName[][] = [
      ['E1', 'E2'], // Em
      ['G1', 'G2'], // G
      ['A1', 'A2'], // Am
      ['C1', 'C2']  // C
    ];
    
    const leadChords: NoteName[][] = [
      ['E4', 'G4', 'B4'], // Em
      ['G4', 'B4', 'D5'], // G
      ['A4', 'C5', 'E5'], // Am
      ['C4', 'E4', 'G4']  // C
    ];

    // Drums sequencer (rhythm base)
    // Kick: steps 0, 4, 8, 12, 16, 20, 24, 28
    if (step % 4 === 0) {
      this.synthKick(time);
    }
    // Snare: steps 4, 12, 20, 28
    if (step % 8 === 4) {
      this.synthSnare(time);
    }
    // Hi-hats: steps 2, 6, 10, 14...
    if (step % 2 === 2) {
      this.synthHiHat(time, 0.15);
    }

    // 16th Note Bassline (Heavy Pulsing!)
    // Syncopated synthwave bass: playing E1/E2 octave jumps on alternate 16th notes
    const activeChord = bassChords[chordIndex];
    const bassNoteName = (step % 2 === 0) ? activeChord[0] : activeChord[1];
    this.synthBass(NOTES[bassNoteName], time, 0.12);

    // Dynamic Lead Melodies
    // Let's program a driving melodic sequence
    const melodyPattern: (NoteName | null)[] = [
      'E4', 'G4', 'B4', 'E5', null, 'D5', 'B4', 'A4',
      'G4', 'A4', 'B4', 'D5', null, 'B4', 'G4', 'E4',
      'A4', 'C5', 'E5', 'A5', null, 'G5', 'E5', 'D5',
      'C5', 'D5', 'E5', 'G5', 'A5', 'G5', 'E5', 'D5'
    ];

    const noteToPlay = melodyPattern[step];
    if (noteToPlay) {
      this.synthLead(NOTES[noteToPlay], time, 0.25, 0.3);
    }

    // Occasional chord pad sweep on first beats
    if (step % 8 === 0) {
      const notes = leadChords[chordIndex];
      this.synthPad(notes.map(n => NOTES[n]), time, 1.2, 0.25);
    }
  }

  // TRACK 2: Cyber Skyline (Chillwave, midtempo, airy pads, smooth keys)
  private playCyberSkyline(step: number, time: number) {
    const chordIndex = Math.floor(step / 8) % 4;
    // A minor, F major, C major, G major
    const bassChords: NoteName[][] = [
      ['A1', 'A2'], // Am
      ['F1', 'F2'], // F
      ['C1', 'C2'], // C
      ['G1', 'G2']  // G
    ];

    const leadChords: NoteName[][] = [
      ['A3', 'C4', 'E4'],
      ['F3', 'A3', 'C4'],
      ['C3', 'E3', 'G3'],
      ['G3', 'B3', 'D4']
    ];

    // Drums - Chill Outrun beat
    // Kick on 0, 8, 16, 24
    if (step % 8 === 0 || (step % 8 === 6 && step < 16)) {
      this.synthKick(time);
    }
    // Snare on 4, 12, 20, 28
    if (step % 8 === 4) {
      this.synthSnare(time, 0.7); // slightly softer
    }
    // Hi-hats: constant 8th notes
    if (step % 2 === 0) {
      this.synthHiHat(time, 0.08, 0.4);
    }

    // Steady 8th Note Bassline
    if (step % 2 === 0) {
      const activeChord = bassChords[chordIndex];
      const bassNoteName = activeChord[0];
      this.synthBass(NOTES[bassNoteName], time, 0.22, 'triangle');
    }

    // Dreamy Chillwave Lead
    const melodyPattern: (NoteName | null)[] = [
      'C5', null, 'E5', null, 'B4', null, 'A4', null,
      'A4', 'B4', 'C5', 'D5', 'E5', null, 'C5', null,
      'G5', null, 'E5', null, 'D5', null, 'C5', null,
      'A4', null, 'C5', 'E5', 'D5', null, 'B4', null
    ];

    const noteToPlay = melodyPattern[step];
    if (noteToPlay) {
      // Soft triangle wave with delay
      this.synthLead(NOTES[noteToPlay], time, 0.4, 0.18, 'triangle');
    }

    // Warm chord sweeps
    if (step % 8 === 0) {
      const notes = leadChords[chordIndex];
      this.synthPad(notes.map(n => NOTES[n]), time, 1.8, 0.35);
    }
  }

  // TRACK 3: Infinite Void (Dark cyber-techno, high tempo, energetic)
  private playInfiniteVoid(step: number, time: number) {
    const chordIndex = Math.floor(step / 8) % 4;
    // D minor, Eb Lydian/Phrygian, G minor, A diminished/minor
    const bassChords: NoteName[][] = [
      ['D1', 'D2'],
      ['Ds1', 'Ds2'], // Eb Phrygian
      ['G1', 'G2'],
      ['C1', 'C2']
    ];

    // Heavy techno kick drum - 4/4 floor kick
    if (step % 4 === 0) {
      this.synthKick(time, 150, 42, 0.15);
    }
    
    // Snare layer / clap on 4, 12, 20, 28
    if (step % 8 === 4) {
      this.synthSnare(time, 1.1);
    }

    // Intense fast hi-hats on off beats + 16th patterns
    if (step % 2 === 1) {
      this.synthHiHat(time, 0.06, 0.7);
    }

    // Aggressive driving bassline
    const activeChord = bassChords[chordIndex];
    const bassNoteName = (step % 4 === 0 || step % 4 === 3) ? activeChord[1] : activeChord[0];
    this.synthBass(NOTES[bassNoteName], time, 0.09, 'sawtooth', 350);

    // Dark cyber melody
    const melodyPattern: (NoteName | null)[] = [
      'D4', 'D4', 'F4', 'D4', 'G4', 'F4', 'Gs4', 'G4',
      'Ds4', 'Ds4', 'G4', 'Ds4', 'As4', 'Gs4', 'G4', 'Ds4',
      'D4', 'D4', 'F4', 'D4', 'A4', 'G4', 'As4', 'A4',
      'C4', 'C4', 'E4', 'C4', 'G4', 'F4', 'E4', 'Cs4'
    ];

    const noteToPlay = melodyPattern[step];
    if (noteToPlay) {
      this.synthLead(NOTES[noteToPlay], time, 0.15, 0.28, 'sawtooth');
    }
  }

  // --- SUB-SYNTHS GENERATORS ---

  private synthKick(time: number, startFreq = 160, endFreq = 45, duration = 0.16) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);

    gainNode.gain.setValueAtTime(this.volumeValue * 1.1, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  private synthSnare(time: number, scale = 1.0) {
    if (!this.ctx || !this.masterGain) return;

    // A white noise burst with high-pass filter
    const duration = 0.22;
    const noise = this.createNoiseNode(duration);
    if (!noise) return;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, time);
    filter.Q.setValueAtTime(1.5, time);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(this.volumeValue * 0.45 * scale, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);

    // Layer with a tone punch
    const toneOsc = this.ctx.createOscillator();
    toneOsc.type = 'triangle';
    toneOsc.frequency.setValueAtTime(180, time);
    toneOsc.frequency.exponentialRampToValueAtTime(80, time + 0.1);
    
    const toneGain = this.ctx.createGain();
    toneGain.gain.setValueAtTime(this.volumeValue * 0.35 * scale, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    toneOsc.connect(toneGain);
    toneGain.connect(this.masterGain);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    toneOsc.start(time);
    toneOsc.stop(time + 0.15);
  }

  private synthHiHat(time: number, duration = 0.08, scale = 1.0) {
    if (!this.ctx || !this.masterGain) return;

    const noise = this.createNoiseNode(duration);
    if (!noise) return;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(this.volumeValue * 0.18 * scale, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);
  }

  private synthBass(freq: number, time: number, duration = 0.12, type: OscillatorType = 'sawtooth', filterFreq = 180) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    // Lowpass filter envelope for snappy synth bass
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq * 3.5, time);
    filter.frequency.exponentialRampToValueAtTime(filterFreq, time + duration);
    filter.Q.setValueAtTime(1.2, time);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(this.volumeValue * 0.4, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  private synthLead(freq: number, time: number, duration = 0.2, scale = 0.22, type: OscillatorType = 'square') {
    if (!this.ctx || !this.masterGain || !this.delayNode) return;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    // Simple auto-vibrato
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 5.5; // Hz
    lfoGain.gain.value = 5.0; // detune cents

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, time);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.001, time);
    gainNode.gain.linearRampToValueAtTime(this.volumeValue * scale, time + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gainNode);
    
    // Connect to BOTH master node and delay line for spatial reverb effect!
    gainNode.connect(this.masterGain);
    gainNode.connect(this.delayNode);

    lfo.start(time);
    osc.start(time);

    lfo.stop(time + duration + 0.05);
    osc.stop(time + duration + 0.05);
  }

  private synthPad(freqs: number[], time: number, duration = 1.8, scale = 0.2) {
    if (!this.ctx || !this.masterGain) return;

    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      
      // Slightly detune oscillators for lush choir/pad thickness
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq + (idx === 0 ? -1.5 : idx === 1 ? 0.0 : 1.5), time);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, time);
      filter.frequency.linearRampToValueAtTime(1200, time + duration * 0.4);
      filter.frequency.linearRampToValueAtTime(400, time + duration);
      filter.Q.setValueAtTime(1.0, time);

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(0.001, time);
      gainNode.gain.linearRampToValueAtTime(this.volumeValue * scale * (1 / freqs.length), time + duration * 0.35);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + duration + 0.1);
    });
  }
}

// Global shared audio engine singleton
export const audioEngine = new AudioEngine();
