import { STUDIO_SYNTH_CATALOG, SynthTrackPreset } from './catalog.ts';
import { TrackSourceType } from '../types/index.ts';

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        options: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
            onStateChange?: (event: { data: number; target: YTPlayer }) => void;
            onError?: () => void;
          };
        }
      ) => YTPlayer;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

export interface EngineTrack {
  id: string;
  sourceType: TrackSourceType;
  sourceRef: string;
  durationMs: number;
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeIframeAPI(): Promise<void> {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

export class SyncedAudioEngine {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private htmlAudio: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;

  private ytPlayer: YTPlayer | null = null;
  private ytContainerId: string | null = null;
  private ytReady = false;
  private pendingYtVideoId: string | null = null;
  private pendingYtStartSec = 0;

  private currentTrack: EngineTrack | null = null;
  private isPlaying = false;
  private basePositionMs = 0;
  private baseTimeMs = Date.now();
  private volume = 0.75;
  private needsUnlock = false;
  private onUnlockChange?: (needsUnlock: boolean) => void;

  // Synth sequencer state
  private synthTimer: number | null = null;
  private lastSynthStep = -1;

  constructor(onUnlockChange?: (needsUnlock: boolean) => void) {
    this.onUnlockChange = onUnlockChange;
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.volume;
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    }
    return this.audioCtx;
  }

  private setNeedsUnlock(val: boolean) {
    if (this.needsUnlock !== val) {
      this.needsUnlock = val;
      this.onUnlockChange?.(val);
    }
  }

  public async unlock(): Promise<void> {
    try {
      const ctx = this.ensureAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (this.currentTrack?.sourceType === 'upload' && this.htmlAudio && this.isPlaying) {
        await this.htmlAudio.play();
      }
      if (this.currentTrack?.sourceType === 'youtube' && this.ytPlayer && this.ytReady && this.isPlaying) {
        this.ytPlayer.playVideo();
      }
      this.setNeedsUnlock(false);
    } catch {
      this.setNeedsUnlock(true);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.audioCtx.currentTime, 0.03);
    }
    if (this.htmlAudio) {
      this.htmlAudio.volume = this.volume;
    }
    if (this.ytPlayer && this.ytReady) {
      this.ytPlayer.setVolume(Math.round(this.volume * 100));
    }
  }

  public attachYouTubeContainer(elementId: string) {
    this.ytContainerId = elementId;
  }

  public getExpectedPositionMs(): number {
    if (!this.currentTrack) return 0;
    if (!this.isPlaying) return Math.min(this.basePositionMs, this.currentTrack.durationMs);
    const elapsed = Date.now() - this.baseTimeMs;
    return Math.min(this.basePositionMs + Math.max(0, elapsed), this.currentTrack.durationMs);
  }

  public getFrequencyBars(count = 24): number[] {
    if (this.analyser && this.isPlaying && this.currentTrack?.sourceType !== 'youtube') {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      const bars: number[] = [];
      for (let i = 0; i < count; i++) {
        const idx = Math.floor((i / count) * Math.min(data.length, count));
        bars.push(data[idx] / 255);
      }
      return bars;
    }
    // Harmonic rhythmic fallback when YouTube plays or audio paused
    const pos = this.getExpectedPositionMs();
    const bars: number[] = [];
    for (let i = 0; i < count; i++) {
      if (!this.isPlaying) {
        bars.push(0.08);
      } else {
        const wave = Math.abs(Math.sin(pos * 0.004 + i * 0.45)) * 0.65 + Math.abs(Math.cos(pos * 0.009 - i * 0.25)) * 0.35;
        bars.push(Math.max(0.12, Math.min(1, wave)));
      }
    }
    return bars;
  }

  public async syncState(
    track: EngineTrack | null,
    isPlaying: boolean,
    authoritativePosMs: number
  ) {
    const trackChanged =
      track?.id !== this.currentTrack?.id ||
      track?.sourceType !== this.currentTrack?.sourceType ||
      track?.sourceRef !== this.currentTrack?.sourceRef;

    this.currentTrack = track;
    this.isPlaying = isPlaying;
    this.basePositionMs = authoritativePosMs;
    this.baseTimeMs = Date.now();

    if (!track) {
      this.stopAllSources();
      return;
    }

    if (trackChanged) {
      this.stopAllSources();
    }

    if (track.sourceType === 'upload') {
      await this.syncUploadAudio(track.sourceRef, isPlaying, authoritativePosMs, trackChanged);
    } else if (track.sourceType === 'synth') {
      this.syncSynthAudio(track.sourceRef, isPlaying);
    } else if (track.sourceType === 'youtube') {
      await this.syncYouTubeAudio(track.sourceRef, isPlaying, authoritativePosMs, trackChanged);
    }
  }

  private stopAllSources() {
    if (this.htmlAudio) {
      this.htmlAudio.pause();
    }
    if (this.synthTimer !== null) {
      window.clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
    this.lastSynthStep = -1;
    if (this.ytPlayer && this.ytReady) {
      try {
        this.ytPlayer.pauseVideo();
      } catch {
        // ignore
      }
    }
  }

  private async syncUploadAudio(
    srcUrl: string,
    isPlaying: boolean,
    posMs: number,
    trackChanged: boolean
  ) {
    if (!this.htmlAudio) {
      this.htmlAudio = new Audio();
      this.htmlAudio.crossOrigin = 'anonymous';
      this.htmlAudio.preload = 'auto';
      this.htmlAudio.volume = this.volume;
    }

    if (trackChanged || !this.htmlAudio.src.endsWith(srcUrl)) {
      this.htmlAudio.src = srcUrl;
      this.htmlAudio.load();
    }

    // Wire HTMLAudio into Web Audio AnalyserNode safely once
    try {
      const ctx = this.ensureAudioContext();
      if (!this.mediaSource) {
        this.mediaSource = ctx.createMediaElementSource(this.htmlAudio);
        this.mediaSource.connect(this.masterGain!);
      }
      if (ctx.state === 'suspended' && isPlaying) {
        ctx.resume().catch(() => {});
      }
    } catch {
      // Fallback to direct HTMLAudio volume if WebAudio media source cannot attach
    }

    const targetSec = posMs / 1000;
    const drift = Math.abs((this.htmlAudio.currentTime || 0) - targetSec);
    if (trackChanged || drift > 0.45) {
      try {
        this.htmlAudio.currentTime = targetSec;
      } catch {
        // Wait for metadata if not loaded yet
        const onMeta = () => {
          if (this.htmlAudio) {
            this.htmlAudio.currentTime = this.getExpectedPositionMs() / 1000;
          }
          this.htmlAudio?.removeEventListener('loadedmetadata', onMeta);
        };
        this.htmlAudio.addEventListener('loadedmetadata', onMeta);
      }
    }

    if (isPlaying) {
      try {
        await this.htmlAudio.play();
        this.setNeedsUnlock(false);
      } catch {
        this.setNeedsUnlock(true);
      }
    } else {
      this.htmlAudio.pause();
    }
  }

  private syncSynthAudio(presetId: string, isPlaying: boolean) {
    const preset: SynthTrackPreset =
      STUDIO_SYNTH_CATALOG.find((t) => t.id === presetId || t.sourceRef === presetId) ||
      STUDIO_SYNTH_CATALOG[0];

    if (!isPlaying) {
      if (this.synthTimer !== null) {
        window.clearInterval(this.synthTimer);
        this.synthTimer = null;
      }
      return;
    }

    const ctx = this.ensureAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().then(
        () => this.setNeedsUnlock(false),
        () => this.setNeedsUnlock(true)
      );
      if (ctx.state === 'suspended') {
        this.setNeedsUnlock(true);
      }
    }

    if (this.synthTimer !== null) return;

    // 16th-note deterministic clock indexed directly by authoritative positionMs
    const stepDurationMs = (60_000 / preset.bpm) / 2; // 8th-note steps
    this.lastSynthStep = -1;

    this.synthTimer = window.setInterval(() => {
      if (!this.isPlaying || !this.audioCtx || this.audioCtx.state !== 'running') {
        if (this.audioCtx?.state === 'suspended' && this.isPlaying) {
          this.setNeedsUnlock(true);
        }
        return;
      }
      this.setNeedsUnlock(false);
      const posMs = this.getExpectedPositionMs();
      const currentStep = Math.floor(posMs / stepDurationMs);
      if (currentStep === this.lastSynthStep) return;
      this.lastSynthStep = currentStep;
      this.triggerSynthStep(preset, currentStep);
    }, 45);
  }

  private triggerSynthStep(preset: SynthTrackPreset, step: number) {
    if (!this.audioCtx || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    // 1. Chord pad on step 0 of every 8-step bar
    if (step % 8 === 0) {
      const barIdx = Math.floor(step / 8) % preset.chordRoots.length;
      const root = preset.chordRoots[barIdx];
      const intervals = [1, 1.2, 1.5, 1.875]; // warm minor7/maj7 voicing
      intervals.forEach((mult) => {
        if (!this.audioCtx || !this.masterGain) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const filter = this.audioCtx.createBiquadFilter();
        osc.type = preset.waveform;
        osc.frequency.setValueAtTime(root * mult, now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.065, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 1.5);
      });
    }

    // 2. Bassline
    const bassFreq = preset.bassPattern[step % preset.bassPattern.length];
    if (bassFreq > 0) {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bassFreq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.3);
    }

    // 3. Deterministic melodic pluck
    const melodyPattern = [0, -1, 2, 1, -1, 4, 3, 2];
    const noteIndex = melodyPattern[(step + Math.floor(step / 8)) % melodyPattern.length];
    if (noteIndex >= 0) {
      const freq = preset.scale[noteIndex % preset.scale.length];
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.35);
    }

    // 4. Drum synthesis (Kick + Snare/Clap + Hat)
    if (preset.hasBeat) {
      // Kick on 0 and 4 (and syncopated 5 occasionally)
      if (step % 4 === 0) {
        const kickOsc = this.audioCtx.createOscillator();
        const kickGain = this.audioCtx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(135, now);
        kickOsc.frequency.exponentialRampToValueAtTime(42, now + 0.12);
        kickGain.gain.setValueAtTime(0.32, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        kickOsc.connect(kickGain);
        kickGain.connect(this.masterGain);
        kickOsc.start(now);
        kickOsc.stop(now + 0.24);
      }

      // Snare / Rim on 2 and 6
      if (step % 4 === 2) {
        const bufferSize = this.audioCtx.sampleRate * 0.12;
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
        }
        const noise = this.audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1800, now);
        const snareGain = this.audioCtx.createGain();
        snareGain.gain.setValueAtTime(0.14, now);
        snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        noise.connect(filter);
        filter.connect(snareGain);
        snareGain.connect(this.masterGain);
        noise.start(now);
      }

      // Crisp closed hi-hat every step
      const hatSize = Math.floor(this.audioCtx.sampleRate * 0.035);
      const hatBuf = this.audioCtx.createBuffer(1, hatSize, this.audioCtx.sampleRate);
      const hatData = hatBuf.getChannelData(0);
      for (let i = 0; i < hatSize; i++) {
        hatData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (hatSize * 0.25));
      }
      const hatSrc = this.audioCtx.createBufferSource();
      hatSrc.buffer = hatBuf;
      const hp = this.audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(7500, now);
      const hatGain = this.audioCtx.createGain();
      hatGain.gain.setValueAtTime(step % 2 === 1 ? 0.055 : 0.03, now);
      hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      hatSrc.connect(hp);
      hp.connect(hatGain);
      hatGain.connect(this.masterGain);
      hatSrc.start(now);
    }
  }

  private async syncYouTubeAudio(
    videoId: string,
    isPlaying: boolean,
    posMs: number,
    trackChanged: boolean
  ) {
    await loadYouTubeIframeAPI();
    if (!this.ytContainerId) return;
    const el = document.getElementById(this.ytContainerId);
    if (!el || !window.YT?.Player) return;

    const startSec = Math.floor(posMs / 1000);

    if (!this.ytPlayer) {
      this.pendingYtVideoId = videoId;
      this.pendingYtStartSec = startSec;
      this.ytPlayer = new window.YT.Player(el, {
        height: '100%',
        width: '100%',
        videoId,
        playerVars: {
          autoplay: isPlaying ? 1 : 0,
          controls: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          start: startSec,
          origin: window.location.origin,
        },
        events: {
          onReady: (ev) => {
            this.ytReady = true;
            ev.target.setVolume(Math.round(this.volume * 100));
            const targetId = this.pendingYtVideoId || videoId;
            const targetSec = this.pendingYtStartSec;
            if (this.isPlaying) {
              ev.target.loadVideoById(targetId, targetSec);
            } else {
              ev.target.cueVideoById(targetId, targetSec);
            }
          },
          onStateChange: (ev) => {
            if (ev.data === 1) {
              this.setNeedsUnlock(false);
            } else if (this.isPlaying && ev.data === 5) {
              // Video stayed cued because browser blocked unmuted autoplay
              this.setNeedsUnlock(true);
            }
          },
          onError: () => {
            // Keep UI responsive if a video disables external embedding
          },
        },
      });
      return;
    }

    if (!this.ytReady) {
      this.pendingYtVideoId = videoId;
      this.pendingYtStartSec = startSec;
      return;
    }

    if (trackChanged) {
      if (isPlaying) {
        this.ytPlayer.loadVideoById(videoId, startSec);
      } else {
        this.ytPlayer.cueVideoById(videoId, startSec);
      }
      return;
    }

    const currentSec = this.ytPlayer.getCurrentTime?.() || 0;
    if (Math.abs(currentSec - startSec) > 1.2) {
      this.ytPlayer.seekTo(startSec, true);
    }

    if (isPlaying) {
      this.ytPlayer.playVideo();
    } else {
      this.ytPlayer.pauseVideo();
    }
  }

  public destroy() {
    this.stopAllSources();
    if (this.ytPlayer) {
      try {
        this.ytPlayer.destroy();
      } catch {
        // ignore
      }
      this.ytPlayer = null;
      this.ytReady = false;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
