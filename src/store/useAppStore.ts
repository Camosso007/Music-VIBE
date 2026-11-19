import { create } from 'zustand';
import {
  AppView,
  FloatingReaction,
  GlobalPresenceUser,
  Language,
  LiveParticipant,
  MusicBattleDoc,
  NotificationDoc,
  RoomTrackDoc,
  UserPrivate,
  UserPublic,
} from '../types/index.ts';

export interface ToastItem {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'error';
}

export interface RoomPlaybackState {
  currentTrack: {
    id: string;
    title: string;
    artist: string;
    coverUrl?: string;
    sourceType: 'upload' | 'youtube' | 'synth';
    sourceRef: string;
    durationMs: number;
    addedByUid: string;
    addedByName: string;
  } | null;
  playlist: RoomTrackDoc[];
  isPlaying: boolean;
  positionMs: number;
  updatedAtServerMs: number;
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
  partyMode: boolean;
}

interface AppState {
  authReady: boolean;
  userUid: string | null;
  publicProfile: UserPublic | null;
  privateProfile: UserPrivate | null;
  needsOnboarding: boolean;
  language: Language;
  activeView: AppView;
  activeRoomId: string | null;
  selectedProfileUid: string | null;
  activeDmThreadId: string | null;

  // Real-time WebSocket & Clock Sync
  wsConnected: boolean;
  clockOffsetMs: number;
  globalOnlineUsers: GlobalPresenceUser[];
  roomParticipants: LiveParticipant[];
  playback: RoomPlaybackState;
  liveBattle: MusicBattleDoc | null;
  floatingReactions: FloatingReaction[];
  notifications: NotificationDoc[];
  toasts: ToastItem[];
  needsAudioUnlock: boolean;
  volume: number;

  // Actions
  setAuthReady: (ready: boolean) => void;
  setUserUid: (uid: string | null) => void;
  setProfiles: (pub: UserPublic | null, priv: UserPrivate | null, needsOnboarding: boolean) => void;
  setLanguage: (lang: Language) => void;
  setActiveView: (view: AppView) => void;
  openRoom: (roomId: string) => void;
  leaveActiveRoomState: () => void;
  openUserProfile: (uid: string) => void;
  openDmThread: (threadId: string) => void;

  setWsConnected: (connected: boolean) => void;
  setClockOffsetMs: (offset: number) => void;
  setGlobalOnlineUsers: (users: GlobalPresenceUser[]) => void;
  setRoomParticipants: (participants: LiveParticipant[]) => void;
  setPlayback: (playback: Partial<RoomPlaybackState>) => void;
  setLiveBattle: (battle: MusicBattleDoc | null) => void;
  pushReaction: (reaction: FloatingReaction) => void;
  removeReaction: (id: string) => void;
  setNotifications: (notifs: NotificationDoc[]) => void;
  addToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
  removeToast: (id: string) => void;
  setNeedsAudioUnlock: (val: boolean) => void;
  setVolume: (vol: number) => void;
}

const initialPlayback: RoomPlaybackState = {
  currentTrack: null,
  playlist: [],
  isPlaying: false,
  positionMs: 0,
  updatedAtServerMs: Date.now(),
  shuffle: false,
  repeat: 'all',
  partyMode: false,
};

export const useAppStore = create<AppState>((set) => ({
  authReady: false,
  userUid: null,
  publicProfile: null,
  privateProfile: null,
  needsOnboarding: false,
  language: 'pt',
  activeView: 'dashboard',
  activeRoomId: null,
  selectedProfileUid: null,
  activeDmThreadId: null,

  wsConnected: false,
  clockOffsetMs: 0,
  globalOnlineUsers: [],
  roomParticipants: [],
  playback: initialPlayback,
  liveBattle: null,
  floatingReactions: [],
  notifications: [],
  toasts: [],
  needsAudioUnlock: false,
  volume: 0.75,

  setAuthReady: (authReady) => set({ authReady }),
  setUserUid: (userUid) => set({ userUid }),
  setProfiles: (publicProfile, privateProfile, needsOnboarding) =>
    set((state) => ({
      publicProfile,
      privateProfile,
      needsOnboarding,
      language: privateProfile?.languagePref || state.language,
      volume: privateProfile?.defaultVolume ?? state.volume,
    })),
  setLanguage: (language) => set({ language }),
  setActiveView: (activeView) => set({ activeView }),
  openRoom: (roomId) =>
    set({
      activeRoomId: roomId,
      activeView: 'room',
      playback: initialPlayback,
      roomParticipants: [],
      liveBattle: null,
    }),
  leaveActiveRoomState: () =>
    set({
      activeRoomId: null,
      activeView: 'dashboard',
      playback: initialPlayback,
      roomParticipants: [],
      liveBattle: null,
    }),
  openUserProfile: (uid) => set({ selectedProfileUid: uid, activeView: 'profile' }),
  openDmThread: (threadId) => set({ activeDmThreadId: threadId, activeView: 'messages' }),

  setWsConnected: (wsConnected) => set({ wsConnected }),
  setClockOffsetMs: (clockOffsetMs) => set({ clockOffsetMs }),
  setGlobalOnlineUsers: (globalOnlineUsers) => set({ globalOnlineUsers }),
  setRoomParticipants: (roomParticipants) => set({ roomParticipants }),
  setPlayback: (patch) => set((state) => ({ playback: { ...state.playback, ...patch } })),
  setLiveBattle: (liveBattle) => set({ liveBattle }),
  pushReaction: (reaction) =>
    set((state) => ({
      floatingReactions: [...state.floatingReactions.slice(-18), reaction],
    })),
  removeReaction: (id) =>
    set((state) => ({
      floatingReactions: state.floatingReactions.filter((r) => r.id !== id),
    })),
  setNotifications: (notifications) => set({ notifications }),
  addToast: (message, tone = 'info') =>
    set((state) => ({
      toasts: [...state.toasts.slice(-3), { id: `${Date.now()}-${Math.random()}`, message, tone }],
    })),
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  setNeedsAudioUnlock: (needsAudioUnlock) => set({ needsAudioUnlock }),
  setVolume: (volume) => set({ volume }),
}));
