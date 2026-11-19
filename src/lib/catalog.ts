import { TrackSourceType } from '../types/index.ts';

export const STUDIO_IMAGES = {
  heroStudio: '/src/assets/images/hero_vibe_studio_1795013839793.jpg',
  lofiMidnight: '/src/assets/images/cover_lofi_midnight_1795013839511.jpg',
  synthHorizon: '/src/assets/images/cover_synth_horizon_1795013839685.jpg',
  afroGroove: '/src/assets/images/cover_afro_groove_1795013841168.jpg',
  indieSession: '/src/assets/images/cover_indie_session_1795013841039.jpg',
};

export const ROOM_COVERS = [
  { id: 'lofi', label: 'Noite Chuvosa', url: STUDIO_IMAGES.lofiMidnight },
  { id: 'synth', label: 'Onda Sombria', url: STUDIO_IMAGES.synthHorizon },
  { id: 'groove', label: 'Estúdio Analógico', url: STUDIO_IMAGES.afroGroove },
  { id: 'indie', label: 'Sessão Vinil', url: STUDIO_IMAGES.indieSession },
];

export const MUSIC_GENRES = [
  'Lo-Fi',
  'Eletrónica',
  'Hip-Hop',
  'Pop',
  'Rock',
  'Jazz',
  'Afrobeats',
  'Ambient',
] as const;

export const PROFILE_ACCENTS = [
  { name: 'Electric Purple', value: '#8B5CF6' },
  { name: 'Neon Cobalt', value: '#3B82F6' },
  { name: 'Vibrant Pink', value: '#EC4899' },
  { name: 'Emerald Pulse', value: '#10B981' },
  { name: 'Amber Warmth', value: '#F59E0B' },
];

export interface SynthTrackPreset {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  durationMs: number;
  coverUrl: string;
  sourceType: TrackSourceType;
  sourceRef: string;
  chordRoots: number[];
  bassPattern: number[];
  scale: number[];
  waveform: 'sine' | 'triangle' | 'sawtooth';
  hasBeat: boolean;
}

export const STUDIO_SYNTH_CATALOG: SynthTrackPreset[] = [
  {
    id: 'synth-lofi-rain',
    title: 'Chuva em Shibuya (Lo-Fi Rhodes)',
    artist: 'VIBE Studio Collective',
    genre: 'Lo-Fi',
    bpm: 82,
    durationMs: 180000,
    coverUrl: STUDIO_IMAGES.lofiMidnight,
    sourceType: 'synth',
    sourceRef: 'synth-lofi-rain',
    chordRoots: [220, 174.61, 261.63, 196],
    bassPattern: [110, 0, 87.31, 0, 130.81, 0, 98, 0],
    scale: [440, 523.25, 587.33, 659.25, 783.99],
    waveform: 'sine',
    hasBeat: true,
  },
  {
    id: 'synth-midnight-pulse',
    title: 'Horizonte Néon (Synthwave)',
    artist: 'VIBE Modular Lab',
    genre: 'Eletrónica',
    bpm: 118,
    durationMs: 210000,
    coverUrl: STUDIO_IMAGES.synthHorizon,
    sourceType: 'synth',
    sourceRef: 'synth-midnight-pulse',
    chordRoots: [146.83, 174.61, 130.81, 196],
    bassPattern: [73.42, 73.42, 87.31, 87.31, 65.41, 65.41, 98, 98],
    scale: [293.66, 349.23, 392, 440, 523.25],
    waveform: 'sawtooth',
    hasBeat: true,
  },
  {
    id: 'synth-afro-groove',
    title: 'Calor Atlântico (Afro-House)',
    artist: 'Lisboa Rhythm Dept',
    genre: 'Afrobeats',
    bpm: 114,
    durationMs: 195000,
    coverUrl: STUDIO_IMAGES.afroGroove,
    sourceType: 'synth',
    sourceRef: 'synth-afro-groove',
    chordRoots: [164.81, 196, 146.83, 164.81],
    bassPattern: [82.41, 0, 82.41, 98, 73.42, 0, 82.41, 0],
    scale: [329.63, 392, 440, 493.88, 587.33],
    waveform: 'triangle',
    hasBeat: true,
  },
  {
    id: 'synth-velvet-jazz',
    title: 'Veludo da Meia-Noite (Neo-Jazz)',
    artist: 'Blue Note Sessions',
    genre: 'Jazz',
    bpm: 90,
    durationMs: 200000,
    coverUrl: STUDIO_IMAGES.indieSession,
    sourceType: 'synth',
    sourceRef: 'synth-velvet-jazz',
    chordRoots: [174.61, 196, 164.81, 220],
    bassPattern: [87.31, 98, 82.41, 110, 87.31, 98, 130.81, 110],
    scale: [349.23, 440, 523.25, 587.33, 659.25],
    waveform: 'triangle',
    hasBeat: true,
  },
  {
    id: 'synth-berlin-minimal',
    title: 'Subsolo 04 (Minimal Techno)',
    artist: 'Klangwerk',
    genre: 'Eletrónica',
    bpm: 126,
    durationMs: 220000,
    coverUrl: STUDIO_IMAGES.synthHorizon,
    sourceType: 'synth',
    sourceRef: 'synth-berlin-minimal',
    chordRoots: [110, 110, 130.81, 123.47],
    bassPattern: [55, 55, 55, 0, 65.41, 55, 61.74, 0],
    scale: [220, 261.63, 293.66, 329.63, 392],
    waveform: 'sawtooth',
    hasBeat: true,
  },
  {
    id: 'synth-ambient-aurora',
    title: 'Deriva Estelar (Deep Ambient)',
    artist: 'Observatório Sonoro',
    genre: 'Ambient',
    bpm: 68,
    durationMs: 240000,
    coverUrl: STUDIO_IMAGES.lofiMidnight,
    sourceType: 'synth',
    sourceRef: 'synth-ambient-aurora',
    chordRoots: [130.81, 164.81, 196, 146.83],
    bassPattern: [65.41, 0, 0, 82.41, 98, 0, 0, 73.42],
    scale: [261.63, 329.63, 392, 493.88, 587.33],
    waveform: 'sine',
    hasBeat: false,
  },
];

export interface AchievementBadge {
  id: string;
  titlePt: string;
  titleEn: string;
  descPt: string;
  descEn: string;
  minPoints?: number;
}

export const ACHIEVEMENTS: AchievementBadge[] = [
  {
    id: 'dj_iniciante',
    titlePt: 'DJ Iniciante',
    titleEn: 'Rookie DJ',
    descPt: 'Criaste a tua primeira sala ou partilhaste a primeira música.',
    descEn: 'Created your first room or shared your first track.',
  },
  {
    id: 'mestre_playlist',
    titlePt: 'Mestre da Playlist',
    titleEn: 'Playlist Master',
    descPt: 'Partilhaste 5 ou mais faixas com a comunidade.',
    descEn: 'Shared 5 or more tracks with the community.',
  },
  {
    id: 'descobridor_musical',
    titlePt: 'Descobridor Musical',
    titleEn: 'Music Explorer',
    descPt: 'Entraste em múltiplas salas e exploraste novos géneros.',
    descEn: 'Joined rooms and explored diverse music genres.',
  },
  {
    id: 'rei_das_vibes',
    titlePt: 'Rei das Vibes',
    titleEn: 'King of Vibes',
    descPt: 'Atingiste mais de 250 pontos de comunidade.',
    descEn: 'Reached over 250 community vibe points.',
  },
  {
    id: 'organizador_eventos',
    titlePt: 'Organizador de Eventos',
    titleEn: 'Event Organizer',
    descPt: 'Agendaste ou participaste num evento musical ao vivo.',
    descEn: 'Scheduled or joined a live musical event.',
  },
];

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
