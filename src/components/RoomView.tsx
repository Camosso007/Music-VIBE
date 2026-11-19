import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Disc3,
  Flag,
  Heart,
  Image as ImageIcon,
  Pause,
  Pin,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Send,
  ShieldAlert,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Swords,
  ThumbsUp,
  Trash2,
  UserCheck,
  UserX,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { SyncedAudioEngine } from '../lib/audioEngine.ts';
import { formatDurationMs } from '../lib/catalog.ts';
import { auth } from '../lib/firebase.ts';
import {
  addTrackToRoom,
  closeRoomFirestore,
  createMusicBattle,
  createNotification,
  deleteRoomMessage,
  finishMusicBattle,
  joinRoom,
  leaveRoomFirestore,
  recordRoomHistory,
  removeRoomMember,
  removeTrackFromRoom,
  respondTrackRequest,
  sendRoomMessage,
  submitReport,
  submitTrackRequest,
  subscribeRoomSubcollections,
  toggleBlockUser,
  toggleFavoriteRoom,
  toggleMessageReaction,
  togglePinMessage,
  toggleTrackVote,
  updateMemberModeration,
} from '../lib/firestoreService.ts';
import { t } from '../lib/i18n.ts';
import { realtimeClient } from '../lib/realtimeClient.ts';
import { useAppStore } from '../store/useAppStore.ts';
import {
  MusicBattleDoc,
  RoomDoc,
  RoomHistoryDoc,
  RoomMemberDoc,
  RoomMessageDoc,
  RoomRole,
  RoomTrackDoc,
  TrackRequestDoc,
  UserPublic,
} from '../types/index.ts';
import { AddTrackModal, NewTrackPayload } from './AddTrackModal.tsx';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { CoverImage } from './CoverImage.tsx';

interface RoomViewProps {
  roomId: string;
  allUsers: UserPublic[];
}

const REACTION_EMOJIS = ['❤️', '🔥', '🎶', '😂', '😍', '🕺'];

export function RoomView({ roomId, allUsers }: RoomViewProps) {
  const language = useAppStore((s) => s.language);
  const publicProfile = useAppStore((s) => s.publicProfile);
  const privateProfile = useAppStore((s) => s.privateProfile);
  const wsConnected = useAppStore((s) => s.wsConnected);
  const playback = useAppStore((s) => s.playback);
  const roomParticipants = useAppStore((s) => s.roomParticipants);
  const liveBattle = useAppStore((s) => s.liveBattle);
  const setLiveBattle = useAppStore((s) => s.setLiveBattle);
  const floatingReactions = useAppStore((s) => s.floatingReactions);
  const needsAudioUnlock = useAppStore((s) => s.needsAudioUnlock);
  const setNeedsAudioUnlock = useAppStore((s) => s.setNeedsAudioUnlock);
  const volume = useAppStore((s) => s.volume);
  const setVolume = useAppStore((s) => s.setVolume);
  const leaveActiveRoomState = useAppStore((s) => s.leaveActiveRoomState);
  const openUserProfile = useAppStore((s) => s.openUserProfile);
  const addToast = useAppStore((s) => s.addToast);

  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [members, setMembers] = useState<RoomMemberDoc[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [tracks, setTracks] = useState<RoomTrackDoc[]>([]);
  const [tracksLoaded, setTracksLoaded] = useState(false);
  const [requests, setRequests] = useState<TrackRequestDoc[]>([]);
  const [messages, setMessages] = useState<RoomMessageDoc[]>([]);
  const [history, setHistory] = useState<RoomHistoryDoc[]>([]);
  const [battles, setBattles] = useState<MusicBattleDoc[]>([]);

  const [leftTab, setLeftTab] = useState<'playlist' | 'requests' | 'history'>('playlist');
  const [rightTab, setRightTab] = useState<'chat' | 'participants'>('chat');
  const [mobileTab, setMobileTab] = useState<'playlist' | 'player' | 'chat'>('player');

  const [trackModalMode, setTrackModalMode] = useState<'add' | 'request' | null>(null);
  const [battleModalOpen, setBattleModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: 'user' | 'room'; id: string; label: string } | null>(null);

  // Chat states
  const [chatText, setChatText] = useState('');
  const [chatImageUrl, setChatImageUrl] = useState('');
  const [replyTo, setReplyTo] = useState<RoomMessageDoc | null>(null);
  const [uploadingChatImg, setUploadingChatImg] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  // Battle form
  const [battleTheme, setBattleTheme] = useState('');
  const [battleTrackAId, setBattleTrackAId] = useState('');
  const [battleTrackBId, setBattleTrackBId] = useState('');

  // Report form
  const [reportReason, setReportReason] = useState('Comportamento impróprio');
  const [reportDetails, setReportDetails] = useState('');

  // Invite friend select
  const [inviteFriendUid, setInviteFriendUid] = useState('');

  // Synchronized Audio Engine & Live Playhead Clock
  const engineRef = useRef<SyncedAudioEngine | null>(null);
  const [displayPositionMs, setDisplayPositionMs] = useState(0);
  const lastRecordedTrackIdRef = useRef<string | null>(null);

  const myMember = useMemo(
    () => members.find((m) => m.uid === publicProfile?.uid) || null,
    [members, publicProfile?.uid]
  );

  // Also check WS participant list in case of automatic admin handover
  const myLiveParticipant = useMemo(
    () => roomParticipants.find((p) => p.uid === publicProfile?.uid) || null,
    [roomParticipants, publicProfile?.uid]
  );

  const myRole: RoomRole =
    myLiveParticipant?.role ||
    myMember?.role ||
    (room?.creatorId === publicProfile?.uid ? 'admin' : 'listener');
  const isAdmin = myRole === 'admin';
  const isStaff = myRole === 'admin' || myRole === 'dj';
  const isMuted = myLiveParticipant?.isMuted || myMember?.isMuted || false;

  // Initialize Audio Engine once
  useEffect(() => {
    const engine = new SyncedAudioEngine((unlockNeeded) => {
      setNeedsAudioUnlock(unlockNeeded);
    });
    engine.attachYouTubeContainer('yt-room-player');
    engine.setVolume(volume);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Keep engine volume synced with individual user slider
  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  // Subscribe to Firestore room subcollections
  useEffect(() => {
    setTracksLoaded(false);
    setMembersLoaded(false);
    const unsub = subscribeRoomSubcollections(roomId, {
      onRoom: (r) => setRoom(r),
      onMembers: (list) => {
        setMembers(list);
        setMembersLoaded(true);
      },
      onTracks: (list) => {
        setTracks(list);
        setTracksLoaded(true);
      },
      onRequests: setRequests,
      onMessages: setMessages,
      onHistory: setHistory,
      onBattles: (list) => {
        setBattles(list);
        const active = list.find((b) => b.status === 'active');
        if (active) setLiveBattle(active);
      },
    });
    return () => unsub();
  }, [roomId, setLiveBattle]);

  // Ensure Firestore membership exists if user entered room directly
  useEffect(() => {
    if (!room || !publicProfile || !membersLoaded) return;
    const isAlreadyMember = members.some((m) => m.uid === publicProfile.uid);
    if (!isAlreadyMember) {
      joinRoom(room.id, publicProfile, room.inviteCode).catch(() => {});
    }
  }, [room?.id, publicProfile?.uid, membersLoaded, members]);

  // Sorted playlist for authoritative playback order
  const sortedTracks = useMemo(() => {
    return [...tracks].sort((a, b) => {
      if ((b.votesCount || 0) !== (a.votesCount || 0)) {
        return (b.votesCount || 0) - (a.votesCount || 0);
      }
      return (a.orderIndex || 0) - (b.orderIndex || 0);
    });
  }, [tracks]);

  // Join WebSocket room once room metadata & initial tracks snapshot are loaded
  const joinedWsRef = useRef(false);
  useEffect(() => {
    if (!room || !publicProfile || !tracksLoaded) return;
    joinedWsRef.current = true;
    realtimeClient.joinRoom({
      roomId: room.id,
      roomName: room.name,
      user: {
        uid: publicProfile.uid,
        username: publicProfile.username,
        displayName: publicProfile.displayName,
        avatarUrl: publicProfile.avatarUrl,
        role: room.creatorId === publicProfile.uid ? 'admin' : myMember?.role || 'listener',
        isMuted: myMember?.isMuted || false,
      },
      initialPlaylist: sortedTracks,
    });

    return () => {
      joinedWsRef.current = false;
      realtimeClient.leaveRoom();
    };
  }, [room?.id, publicProfile?.uid, tracksLoaded]);

  // Keep WS role metadata synced if member role updates in Firestore
  useEffect(() => {
    if (!room || !publicProfile || !joinedWsRef.current) return;
    realtimeClient.joinRoom({
      roomId: room.id,
      roomName: room.name,
      user: {
        uid: publicProfile.uid,
        username: publicProfile.username,
        displayName: publicProfile.displayName,
        avatarUrl: publicProfile.avatarUrl,
        role: myRole,
        isMuted,
      },
      initialPlaylist: sortedTracks,
    });
  }, [myRole, isMuted]);

  // Whenever staff modifies Firestore tracks, push authoritative playlist to WS hub
  useEffect(() => {
    if (!isStaff || !joinedWsRef.current) return;
    realtimeClient.send({ type: 'room:sync_playlist', playlist: sortedTracks });
  }, [sortedTracks, isStaff]);

  // Sync Audio Engine whenever authoritative WS playback state updates
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const elapsedSinceSync = playback.isPlaying
      ? Math.max(0, Date.now() - playback.updatedAtServerMs)
      : 0;
    const currentAuthoritativePos = playback.positionMs + elapsedSinceSync;

    engine.syncState(
      playback.currentTrack
        ? {
            id: playback.currentTrack.id,
            sourceType: playback.currentTrack.sourceType,
            sourceRef: playback.currentTrack.sourceRef,
            durationMs: playback.currentTrack.durationMs,
          }
        : null,
      playback.isPlaying,
      currentAuthoritativePos
    );

    if (
      isStaff &&
      publicProfile &&
      playback.currentTrack &&
      lastRecordedTrackIdRef.current !== playback.currentTrack.id
    ) {
      lastRecordedTrackIdRef.current = playback.currentTrack.id;
      recordRoomHistory(roomId, publicProfile, playback.currentTrack);
    }
  }, [playback, isStaff, roomId, publicProfile]);

  // Smooth playhead ticker
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!playback.currentTrack) {
        setDisplayPositionMs(0);
        return;
      }
      const pos = playback.isPlaying
        ? playback.positionMs + Math.max(0, Date.now() - playback.updatedAtServerMs)
        : playback.positionMs;
      setDisplayPositionMs(Math.min(pos, playback.currentTrack.durationMs));
    }, 200);
    return () => window.clearInterval(interval);
  }, [playback]);

  // Scroll chat to newest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!publicProfile || !room) {
    return (
      <div className="p-8 text-center text-sm text-zinc-400">
        {language === 'pt' ? 'A ligar à sala sincronizada...' : 'Connecting to synced room...'}
      </div>
    );
  }

  const blockedSet = new Set(privateProfile?.blockedUids || []);
  const isFavorite = Boolean(privateProfile?.favoriteRoomIds?.includes(roomId));
  const partyActive = playback.partyMode || room.partyMode;
  const pinnedMessage = messages.find((m) => m.isPinned);
  const visibleMessages = messages.filter((m) => !blockedSet.has(m.senderUid));
  const typingNames = roomParticipants
    .filter((p) => p.isTyping && p.uid !== publicProfile.uid)
    .map((p) => p.displayName);

  const handleLeave = async () => {
    realtimeClient.leaveRoom();
    await leaveRoomFirestore(roomId, publicProfile.uid);
    leaveActiveRoomState();
  };

  const handleCloseRoom = async () => {
    realtimeClient.send({ type: 'room:close' });
    await closeRoomFirestore(roomId);
    leaveActiveRoomState();
  };

  const handleCopyInvite = () => {
    const url = `${window.location.origin}/?invite=${room.inviteCode}`;
    navigator.clipboard.writeText(`${room.inviteCode} — ${url}`).catch(() => {});
    addToast(`${t(language, 'inviteCopied')} (${room.inviteCode})`, 'success');
  };

  const handleTrackModalSubmit = async (payload: NewTrackPayload) => {
    if (trackModalMode === 'add') {
      const added = await addTrackToRoom(roomId, publicProfile, {
        ...payload,
        orderIndex: tracks.length,
      });
      const nextPlaylist = [...sortedTracks, added];
      realtimeClient.send({ type: 'room:sync_playlist', playlist: nextPlaylist });
      if (!playback.currentTrack) {
        realtimeClient.send({ type: 'player:select_track', trackId: added.id });
      }
      setLeftTab('playlist');
      addToast(
        language === 'pt' ? 'Música adicionada à fila!' : 'Track added to queue!',
        'success'
      );
    } else {
      await submitTrackRequest(roomId, publicProfile, payload);
      setLeftTab('requests');
      addToast(
        language === 'pt' ? 'Pedido enviado ao DJ!' : 'Track request sent to DJ!',
        'success'
      );
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMuted) return;
    if (!chatText.trim() && !chatImageUrl) return;
    const textToSend = chatText.trim();
    const imgToSend = chatImageUrl;
    const reply = replyTo;

    setChatText('');
    setChatImageUrl('');
    setReplyTo(null);
    realtimeClient.send({ type: 'chat:typing', isTyping: false });

    await sendRoomMessage(roomId, publicProfile, myRole, {
      text: textToSend || '📷',
      imageUrl: imgToSend || undefined,
      replyToId: reply?.id,
      replyPreview: reply ? `${reply.senderName}: ${reply.text}` : undefined,
    });
  };

  const handleChatTyping = (val: string) => {
    setChatText(val);
    realtimeClient.send({ type: 'chat:typing', isTyping: val.length > 0 });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      realtimeClient.send({ type: 'chat:typing', isTyping: false });
    }, 1800);
  };

  const handleChatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    setUploadingChatImg(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload/image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar imagem.');
      setChatImageUrl(data.url);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro no upload.', 'error');
    } finally {
      setUploadingChatImg(false);
    }
  };

  const handleStartBattle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tracks.length < 2) {
      addToast(
        language === 'pt'
          ? 'Adiciona pelo menos 2 músicas à playlist para iniciar uma batalha.'
          : 'Add at least 2 tracks to the playlist to start a battle.',
        'error'
      );
      return;
    }
    const trackA = tracks.find((t) => t.id === battleTrackAId) || tracks[0];
    const trackB = tracks.find((t) => t.id === battleTrackBId) || tracks[1];
    if (trackA.id === trackB.id) {
      addToast(
        language === 'pt' ? 'Escolhe duas faixas diferentes.' : 'Pick two different tracks.',
        'error'
      );
      return;
    }

    const battle = await createMusicBattle(roomId, publicProfile, {
      theme: battleTheme.trim() || 'Duelo da Sala',
      trackATitle: trackA.title,
      trackAArtist: trackA.artist,
      trackASourceType: trackA.sourceType,
      trackASourceRef: trackA.sourceRef,
      trackBTitle: trackB.title,
      trackBArtist: trackB.artist,
      trackBSourceType: trackB.sourceType,
      trackBSourceRef: trackB.sourceRef,
    });
    setLiveBattle(battle);
    realtimeClient.send({ type: 'battle:sync', battle });
    setBattleModalOpen(false);
    setBattleTheme('');
  };

  const handleFinishBattle = async () => {
    if (!liveBattle) return;
    const finished = await finishMusicBattle(roomId, liveBattle);
    setLiveBattle(finished);
    realtimeClient.send({ type: 'battle:sync', battle: finished });
    addToast(
      finished.winner === 'tie'
        ? language === 'pt'
          ? 'Music Battle terminou empatada!'
          : 'Music Battle ended in a tie!'
        : language === 'pt'
        ? `Vencedor da batalha: Faixa ${finished.winner}!`
        : `Battle winner: Track ${finished.winner}!`,
      'success'
    );
  };

  const handleInviteFriend = async () => {
    if (!inviteFriendUid) return;
    await createNotification({
      recipientUid: inviteFriendUid,
      senderUid: publicProfile.uid,
      senderName: publicProfile.displayName,
      type: 'room_invite',
      title: `${publicProfile.displayName} convidou-te para "${room.name}"`,
      body: `Código da sala: ${room.inviteCode}`,
      roomId: room.id,
      inviteCode: room.inviteCode,
    });
    setInviteFriendUid('');
    addToast(language === 'pt' ? 'Convite enviado!' : 'Invite sent!', 'success');
  };

  const activeBattle = liveBattle || battles.find((b) => b.status === 'active') || null;
  const totalBattleVotes = activeBattle
    ? activeBattle.votesA.length + activeBattle.votesB.length
    : 0;
  const pctA =
    activeBattle && totalBattleVotes > 0
      ? Math.round((activeBattle.votesA.length / totalBattleVotes) * 100)
      : 50;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Mobile Section Tabs */}
      <div className="lg:hidden grid grid-cols-3 border-b border-white/10 bg-[#09090B] shrink-0">
        {(
          [
            { id: 'playlist', label: t(language, 'playlist') },
            { id: 'player', label: language === 'pt' ? 'Leitor' : 'Player' },
            { id: 'chat', label: t(language, 'chat') },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileTab(tab.id)}
            className={`py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              mobileTab === tab.id
                ? 'border-[#8B5CF6] text-white'
                : 'border-transparent text-zinc-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3-Column Desktop Layout */}
      <div className="flex-1 grid lg:grid-cols-12 min-h-0 overflow-hidden">
        {/* LEFT COLUMN: Room Info, Playlist, Requests, History */}
        <section
          className={`lg:col-span-3 border-r border-white/10 bg-[#09090B] flex flex-col min-h-0 ${
            mobileTab === 'playlist' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Room Header Info */}
          <div className="p-4 border-b border-white/10 space-y-3 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <CoverImage
                  src={room.coverUrl}
                  alt={room.name}
                  className="w-11 h-11 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0">
                  <h2 className="font-display font-bold text-sm text-white truncate">
                    {room.name}
                  </h2>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {room.category} · {room.visibility} ·{' '}
                    <span className="font-mono-tabular">{room.inviteCode}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleFavoriteRoom(publicProfile.uid, roomId, isFavorite)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isFavorite ? 'text-[#EC4899]' : 'text-zinc-500 hover:text-zinc-200'
                }`}
                aria-label="Favorite room"
              >
                <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
              </button>
            </div>

            {room.description && (
              <p className="text-xs text-zinc-400 line-clamp-2">{room.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyInvite}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#18181B] border border-white/10 text-[11px] font-medium text-zinc-200 hover:text-white"
              >
                <Copy className="w-3 h-3" />
                <span>{t(language, 'copyInvite')}</span>
              </button>
              <button
                type="button"
                onClick={() => setReportTarget({ type: 'room', id: room.id, label: room.name })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18181B] border border-white/10 text-[11px] text-zinc-400 hover:text-white"
              >
                <Flag className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleLeave}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-zinc-300"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>{t(language, 'leaveRoom')}</span>
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleCloseRoom}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-[11px] font-medium text-rose-300"
                >
                  {t(language, 'closeRoom')}
                </button>
              )}
            </div>
          </div>

          {/* Left Tabs */}
          <div className="grid grid-cols-3 border-b border-white/10 text-xs font-medium shrink-0">
            {(
              [
                { id: 'playlist', label: `${t(language, 'playlist')} (${tracks.length})` },
                {
                  id: 'requests',
                  label: `${t(language, 'requests')} (${
                    requests.filter((r) => r.status === 'pending').length
                  })`,
                },
                { id: 'history', label: t(language, 'history') },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLeftTab(tab.id)}
                className={`py-2.5 px-2 border-b-2 truncate transition-colors ${
                  leftTab === tab.id
                    ? 'border-[#8B5CF6] text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Left Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {leftTab === 'playlist' && (
              <>
                <button
                  type="button"
                  onClick={() => setTrackModalMode(isStaff ? 'add' : 'request')}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#8B5CF6]/15 hover:bg-[#8B5CF6]/25 border border-[#8B5CF6]/30 text-xs font-semibold text-violet-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isStaff ? t(language, 'addTrack') : t(language, 'requestTrack')}</span>
                </button>

                {sortedTracks.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-8">{t(language, 'noTracksYet')}</p>
                ) : (
                  sortedTracks.map((trk) => {
                    const isCurrent = playback.currentTrack?.id === trk.id;
                    const voted = trk.voterUids?.includes(publicProfile.uid);
                    return (
                      <div
                        key={trk.id}
                        className={`p-2.5 rounded-xl border transition-colors flex items-center gap-2.5 ${
                          isCurrent
                            ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/50'
                            : 'bg-[#18181B] border-white/10'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={!isStaff}
                          onClick={() =>
                            realtimeClient.send({ type: 'player:select_track', trackId: trk.id })
                          }
                          className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 group"
                        >
                          <CoverImage
                            src={trk.coverUrl}
                            alt={trk.title}
                            className="w-full h-full object-cover"
                          />
                          {isStaff && (
                            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Play className="w-3.5 h-3.5 text-white" />
                            </span>
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">{trk.title}</p>
                          <p className="text-[11px] text-zinc-400 truncate">
                            {trk.artist} · {trk.sourceType}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleTrackVote(roomId, trk, publicProfile.uid)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono-tabular transition-colors ${
                              voted
                                ? 'bg-[#3B82F6]/20 text-[#3B82F6]'
                                : 'bg-white/5 text-zinc-400 hover:text-white'
                            }`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                            <span>{trk.votesCount || 0}</span>
                          </button>

                          {(isStaff || trk.addedByUid === publicProfile.uid) && (
                            <button
                              type="button"
                              onClick={() => removeTrackFromRoom(roomId, trk.id)}
                              className="p-1 text-zinc-500 hover:text-rose-400"
                              aria-label="Remove track"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {leftTab === 'requests' && (
              <>
                <button
                  type="button"
                  onClick={() => setTrackModalMode('request')}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 border border-[#3B82F6]/30 text-xs font-semibold text-blue-200"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t(language, 'requestTrack')}</span>
                </button>

                {requests.filter((r) => r.status === 'pending').length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-8">
                    {language === 'pt' ? 'Sem pedidos pendentes.' : 'No pending requests.'}
                  </p>
                ) : (
                  requests
                    .filter((r) => r.status === 'pending')
                    .map((req) => (
                      <div
                        key={req.id}
                        className="p-3 rounded-xl bg-[#18181B] border border-white/10 space-y-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{req.title}</p>
                          <p className="text-[11px] text-zinc-400 truncate">
                            {req.artist} · {req.requestedByName}
                          </p>
                        </div>
                        {isStaff && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                respondTrackRequest(roomId, req, true, publicProfile, tracks.length)
                              }
                              className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center justify-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>{t(language, 'accept')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                respondTrackRequest(roomId, req, false, publicProfile, tracks.length)
                              }
                              className="flex-1 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-semibold flex items-center justify-center gap-1"
                            >
                              <X className="w-3 h-3" />
                              <span>{t(language, 'reject')}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                )}
              </>
            )}

            {leftTab === 'history' && (
              <div className="space-y-2">
                {history.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-8">
                    {language === 'pt' ? 'Sem histórico ainda.' : 'No history yet.'}
                  </p>
                ) : (
                  history.map((h) => (
                    <div
                      key={h.id}
                      className="p-2.5 rounded-xl bg-[#18181B] border border-white/10 flex items-center gap-2.5"
                    >
                      <CoverImage
                        src={h.coverUrl}
                        alt={h.title}
                        className="w-9 h-9 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-white truncate">{h.title}</p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {h.artist} · DJ {h.playedByName}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>

        {/* CENTER STAGE: Player, Visualizer, Reactions & Music Battle */}
        <section
          className={`lg:col-span-5 relative flex flex-col justify-between p-5 sm:p-6 overflow-y-auto bg-[#09090B] ${
            mobileTab === 'player' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Party Mode Aura */}
          {partyActive && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="animate-party-aura absolute -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-gradient-to-tr from-[#8B5CF6]/25 via-[#3B82F6]/20 to-[#EC4899]/25 blur-3xl" />
            </div>
          )}

          {/* Floating Animated Reactions Layer */}
          <div className="pointer-events-none absolute inset-x-0 bottom-28 top-12 overflow-hidden z-20">
            {floatingReactions.map((r) => (
              <div
                key={r.id}
                style={{ left: `${r.x}%` }}
                className="animate-float-reaction absolute bottom-0 flex flex-col items-center"
              >
                <span className="text-3xl drop-shadow-lg">{r.emoji}</span>
                <span className="text-[10px] text-zinc-300 bg-black/50 px-1.5 rounded mt-0.5">
                  {r.senderName}
                </span>
              </div>
            ))}
          </div>

          <div className="relative z-10 space-y-5">
            {/* Top Status & Party Mode + Battle Trigger */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <span
                  className={`w-2 h-2 rounded-full ${
                    wsConnected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span>
                  {wsConnected
                    ? t(language, 'syncActive')
                    : language === 'pt'
                    ? 'A reconectar...'
                    : 'Reconnecting...'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  {roomParticipants.length || members.length} online
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isStaff && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        realtimeClient.send({
                          type: 'room:toggle_party_mode',
                          partyMode: !partyActive,
                        })
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        partyActive
                          ? 'bg-[#EC4899]/20 border-[#EC4899]/50 text-pink-200'
                          : 'bg-[#18181B] border-white/10 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{t(language, 'partyMode')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBattleModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181B] border border-white/10 text-zinc-300 hover:text-white transition-colors"
                    >
                      <Swords className="w-3.5 h-3.5 text-[#EC4899]" />
                      <span>{t(language, 'musicBattle')}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Audio Unlock Banner if browser paused autoplay */}
            {needsAudioUnlock && (
              <div className="bg-[#8B5CF6]/20 border border-[#8B5CF6]/50 rounded-xl p-3 flex items-center justify-between gap-3">
                <p className="text-xs text-violet-100">{t(language, 'unlockAudioDesc')}</p>
                <button
                  type="button"
                  onClick={() => engineRef.current?.unlock()}
                  className="px-3.5 py-1.5 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-semibold text-white shrink-0"
                >
                  {t(language, 'unlockAudio')}
                </button>
              </div>
            )}

            {/* Main Artwork / YouTube Stage */}
            <div className="relative mx-auto w-full max-w-[340px] aspect-square rounded-2xl overflow-hidden border border-white/10 bg-[#18181B] shadow-2xl">
              <div
                className={
                  playback.currentTrack?.sourceType === 'youtube'
                    ? 'w-full h-full'
                    : 'hidden'
                }
              >
                <div id="yt-room-player" className="w-full h-full" />
              </div>
              {playback.currentTrack?.sourceType !== 'youtube' && (
                <CoverImage
                  src={playback.currentTrack?.coverUrl || room.coverUrl}
                  alt={playback.currentTrack?.title || room.name}
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {/* Track Info */}
            <div className="text-center space-y-1">
              <h3 className="font-display text-xl sm:text-2xl font-bold text-white truncate">
                {playback.currentTrack?.title ||
                  (language === 'pt' ? 'Nenhuma música selecionada' : 'No track selected')}
              </h3>
              <p className="text-sm text-zinc-400 truncate">
                {playback.currentTrack
                  ? `${playback.currentTrack.artist} · ${
                      language === 'pt' ? 'Por' : 'By'
                    } ${playback.currentTrack.addedByName}`
                  : language === 'pt'
                  ? 'Adiciona uma faixa na playlist para começar.'
                  : 'Add a track to the playlist to begin.'}
              </p>
            </div>

            {/* Real-time Audio Spectrum */}
            <AudioVisualizer
              engine={engineRef.current}
              isPlaying={playback.isPlaying}
              partyMode={partyActive}
              height={46}
            />

            {/* Progress Bar + Time */}
            <div className="space-y-1.5">
              <input
                type="range"
                min={0}
                max={playback.currentTrack?.durationMs || 100}
                value={Math.min(displayPositionMs, playback.currentTrack?.durationMs || 100)}
                disabled={!isStaff || !playback.currentTrack}
                onChange={(e) => {
                  const pos = Number(e.target.value);
                  setDisplayPositionMs(pos);
                  realtimeClient.send({ type: 'player:seek', positionMs: pos });
                }}
                className="w-full accent-[#8B5CF6] cursor-pointer disabled:cursor-default h-1.5 bg-zinc-800 rounded-lg"
              />
              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono-tabular">
                <span>{formatDurationMs(displayPositionMs)}</span>
                <span>
                  {playback.currentTrack
                    ? formatDurationMs(playback.currentTrack.durationMs)
                    : '0:00'}
                </span>
              </div>
            </div>

            {/* Playback Controls + Individual Volume */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  disabled={!isStaff}
                  onClick={() => realtimeClient.send({ type: 'player:toggle_shuffle' })}
                  className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                    playback.shuffle ? 'text-[#8B5CF6]' : 'text-zinc-400 hover:text-white'
                  }`}
                  aria-label="Shuffle"
                >
                  <Shuffle className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={!isStaff}
                  onClick={() => realtimeClient.send({ type: 'player:prev' })}
                  className="p-2.5 rounded-xl bg-[#18181B] border border-white/10 text-zinc-200 hover:text-white disabled:opacity-40"
                  aria-label="Previous"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={!isStaff}
                  onClick={() =>
                    realtimeClient.send({
                      type: playback.isPlaying ? 'player:pause' : 'player:play',
                    })
                  }
                  className="w-12 h-12 rounded-full bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-50 text-white flex items-center justify-center shadow-lg transition-colors"
                  aria-label={playback.isPlaying ? 'Pause' : 'Play'}
                >
                  {playback.isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={!isStaff}
                  onClick={() => realtimeClient.send({ type: 'player:next' })}
                  className="p-2.5 rounded-xl bg-[#18181B] border border-white/10 text-zinc-200 hover:text-white disabled:opacity-40"
                  aria-label="Next"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={!isStaff}
                  onClick={() => {
                    const nextRepeat =
                      playback.repeat === 'all'
                        ? 'one'
                        : playback.repeat === 'one'
                        ? 'off'
                        : 'all';
                    realtimeClient.send({ type: 'player:set_repeat', repeat: nextRepeat });
                  }}
                  className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                    playback.repeat !== 'off' ? 'text-[#3B82F6]' : 'text-zinc-400 hover:text-white'
                  }`}
                  aria-label="Repeat"
                >
                  {playback.repeat === 'one' ? (
                    <Repeat1 className="w-4 h-4" />
                  ) : (
                    <Repeat className="w-4 h-4" />
                  )}
                </button>
              </div>

              {!isStaff && (
                <p className="text-[11px] text-center text-zinc-500">
                  {t(language, 'djControlsOnly')}
                </p>
              )}

              {/* Individual Volume + Live Reactions */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-[#18181B] border border-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2.5 min-w-[140px]">
                  <button
                    type="button"
                    onClick={() => setVolume(volume > 0 ? 0 : 0.75)}
                    className="text-zinc-400 hover:text-white"
                    aria-label="Mute"
                  >
                    {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-24 accent-[#3B82F6] h-1 bg-zinc-700 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => realtimeClient.send({ type: 'reaction:send', emoji })}
                      className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-base transition-transform active:scale-125"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Active Music Battle Card */}
            {activeBattle && (
              <div className="bg-[#18181B] border border-[#EC4899]/40 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#EC4899]">
                    <Swords className="w-4 h-4" />
                    <span>
                      {t(language, 'musicBattle')}: {activeBattle.theme}
                    </span>
                  </div>
                  {isStaff && activeBattle.status === 'active' && (
                    <button
                      type="button"
                      onClick={handleFinishBattle}
                      className="px-2.5 py-1 rounded-lg bg-[#EC4899]/20 hover:bg-[#EC4899]/30 text-[11px] font-semibold text-pink-200"
                    >
                      {t(language, 'finishBattle')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={activeBattle.status !== 'active'}
                    onClick={() => realtimeClient.send({ type: 'battle:vote', choice: 'A' })}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      activeBattle.votesA.includes(publicProfile.uid)
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]'
                        : 'bg-[#09090B] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <p className="text-[11px] font-semibold text-[#8B5CF6]">A</p>
                    <p className="text-xs font-semibold text-white truncate">
                      {activeBattle.trackATitle}
                    </p>
                    <p className="text-[11px] text-zinc-400 font-mono-tabular mt-1">
                      {activeBattle.votesA.length} votos
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={activeBattle.status !== 'active'}
                    onClick={() => realtimeClient.send({ type: 'battle:vote', choice: 'B' })}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      activeBattle.votesB.includes(publicProfile.uid)
                        ? 'bg-[#3B82F6]/20 border-[#3B82F6]'
                        : 'bg-[#09090B] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <p className="text-[11px] font-semibold text-[#3B82F6]">B</p>
                    <p className="text-xs font-semibold text-white truncate">
                      {activeBattle.trackBTitle}
                    </p>
                    <p className="text-[11px] text-zinc-400 font-mono-tabular mt-1">
                      {activeBattle.votesB.length} votos
                    </p>
                  </button>
                </div>

                <div className="h-2 rounded-full bg-[#09090B] overflow-hidden flex">
                  <div
                    style={{ width: `${pctA}%` }}
                    className="bg-[#8B5CF6] transition-all duration-300"
                  />
                  <div
                    style={{ width: `${100 - pctA}%` }}
                    className="bg-[#3B82F6] transition-all duration-300"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: Chat & Participants */}
        <section
          className={`lg:col-span-4 border-l border-white/10 bg-[#09090B] flex flex-col min-h-0 ${
            mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="grid grid-cols-2 border-b border-white/10 text-xs font-medium shrink-0">
            <button
              type="button"
              onClick={() => setRightTab('chat')}
              className={`py-3 border-b-2 transition-colors ${
                rightTab === 'chat'
                  ? 'border-[#8B5CF6] text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t(language, 'chat')}
            </button>
            <button
              type="button"
              onClick={() => setRightTab('participants')}
              className={`py-3 border-b-2 transition-colors ${
                rightTab === 'participants'
                  ? 'border-[#8B5CF6] text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t(language, 'participants')} ({roomParticipants.length || members.length})
            </button>
          </div>

          {rightTab === 'chat' ? (
            <>
              {pinnedMessage && (
                <div className="px-3.5 py-2 bg-[#8B5CF6]/15 border-b border-[#8B5CF6]/30 flex items-center justify-between gap-2 text-xs shrink-0">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-[#8B5CF6] block">
                      {t(language, 'pinnedMessage')}
                    </span>
                    <p className="text-zinc-200 truncate">
                      {pinnedMessage.senderName}: {pinnedMessage.text}
                    </p>
                  </div>
                  {isStaff && (
                    <button
                      type="button"
                      onClick={() => togglePinMessage(roomId, pinnedMessage)}
                      className="text-zinc-400 hover:text-white shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                {visibleMessages.map((msg) => (
                  <div key={msg.id} className="group space-y-1">
                    {msg.replyPreview && (
                      <div className="pl-2.5 border-l-2 border-[#8B5CF6]/60 text-[11px] text-zinc-400 truncate">
                        {msg.replyPreview}
                      </div>
                    )}
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() => openUserProfile(msg.senderUid)}
                        className="shrink-0"
                      >
                        <CoverImage
                          src={msg.senderAvatar}
                          alt={msg.senderName}
                          className="w-7 h-7 rounded-full object-cover"
                        />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <button
                            type="button"
                            onClick={() => openUserProfile(msg.senderUid)}
                            className="text-xs font-semibold text-white hover:underline"
                          >
                            {msg.senderName}
                          </button>
                          {msg.senderRole !== 'listener' && (
                            <span className="text-[10px] text-[#8B5CF6] font-medium uppercase">
                              {msg.senderRole}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-zinc-200 break-words leading-snug">
                          {msg.text}
                        </p>

                        {msg.imageUrl && (
                          <CoverImage
                            src={msg.imageUrl}
                            alt="Chat attachment"
                            className="mt-1.5 max-h-44 rounded-xl border border-white/10 object-cover"
                          />
                        )}

                        {/* Message Reactions */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(msg.reactions).map(([em, uids]) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() =>
                                  toggleMessageReaction(roomId, msg, em, publicProfile.uid)
                                }
                                className={`px-1.5 py-0.5 rounded-md text-[11px] border ${
                                  uids.includes(publicProfile.uid)
                                    ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/50 text-white'
                                    : 'bg-[#18181B] border-white/10 text-zinc-300'
                                }`}
                              >
                                {em} {uids.length}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Quick Message Actions */}
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            toggleMessageReaction(roomId, msg, '❤️', publicProfile.uid)
                          }
                          className="p-1 text-zinc-500 hover:text-pink-400 text-xs"
                          title="React"
                        >
                          ❤️
                        </button>
                        <button
                          type="button"
                          onClick={() => setReplyTo(msg)}
                          className="p-1 text-zinc-500 hover:text-white text-[11px]"
                        >
                          ↩
                        </button>
                        {isStaff && (
                          <button
                            type="button"
                            onClick={() => togglePinMessage(roomId, msg)}
                            className="p-1 text-zinc-500 hover:text-[#8B5CF6]"
                            title="Pin"
                          >
                            <Pin className="w-3 h-3" />
                          </button>
                        )}
                        {(isStaff || msg.senderUid === publicProfile.uid) && (
                          <button
                            type="button"
                            onClick={() => deleteRoomMessage(roomId, msg.id)}
                            className="p-1 text-zinc-500 hover:text-rose-400"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {typingNames.length > 0 && (
                <div className="px-4 py-1 text-[11px] text-zinc-400 shrink-0">
                  {typingNames.join(', ')}{' '}
                  {typingNames.length === 1
                    ? t(language, 'typingOne')
                    : t(language, 'typingMany')}
                </div>
              )}

              <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10 space-y-2 shrink-0">
                {replyTo && (
                  <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[#18181B] text-[11px] text-zinc-300">
                    <span className="truncate">
                      {t(language, 'replyingTo')} {replyTo.senderName}
                    </span>
                    <button type="button" onClick={() => setReplyTo(null)}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {chatImageUrl && (
                  <div className="relative inline-block">
                    <CoverImage
                      src={chatImageUrl}
                      alt="Preview"
                      className="h-16 rounded-lg border border-white/10 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setChatImageUrl('')}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black text-white flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {isMuted ? (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 text-center">
                    {language === 'pt'
                      ? 'Foste silenciado neste chat pelo administrador.'
                      : 'You are muted in this room chat.'}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <label className="p-2 rounded-xl bg-[#18181B] border border-white/10 text-zinc-400 hover:text-white cursor-pointer shrink-0">
                      <ImageIcon className="w-4 h-4" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleChatImageUpload}
                        className="hidden"
                      />
                    </label>
                    <input
                      type="text"
                      value={chatText}
                      onChange={(e) => handleChatTyping(e.target.value)}
                      placeholder={
                        uploadingChatImg ? '...' : t(language, 'sendMessagePlaceholder')
                      }
                      className="flex-1 px-3 py-2 rounded-xl bg-[#18181B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                    />
                    <button
                      type="submit"
                      className="p-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white shrink-0"
                      aria-label="Send"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </form>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {/* Invite User to Room */}
              <div className="bg-[#18181B] border border-white/10 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-white">
                  {language === 'pt' ? 'Convidar para a sala' : 'Invite to room'}
                </p>
                <div className="flex gap-2">
                  <select
                    value={inviteFriendUid}
                    onChange={(e) => setInviteFriendUid(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#09090B] border border-white/10 text-xs text-white"
                  >
                    <option value="">
                      {language === 'pt' ? 'Escolher utilizador...' : 'Select user...'}
                    </option>
                    {allUsers
                      .filter((u) => u.uid !== publicProfile.uid)
                      .map((u) => (
                        <option key={u.uid} value={u.uid}>
                          {u.displayName} (@{u.username})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleInviteFriend}
                    disabled={!inviteFriendUid}
                    className="px-3 py-1.5 rounded-lg bg-[#8B5CF6] disabled:opacity-50 text-xs font-semibold text-white"
                  >
                    {language === 'pt' ? 'Convidar' : 'Invite'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {members.map((m) => {
                  const isSelf = m.uid === publicProfile.uid;
                  const isUserBlocked = blockedSet.has(m.uid);
                  return (
                    <div
                      key={m.uid}
                      className="p-2.5 rounded-xl bg-[#18181B] border border-white/10 flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => openUserProfile(m.uid)}
                        className="flex items-center gap-2.5 min-w-0 text-left"
                      >
                        <CoverImage
                          src={m.avatarUrl}
                          alt={m.displayName}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                            <span>{m.displayName}</span>
                            {m.role === 'admin' && <Crown className="w-3 h-3 text-amber-400" />}
                            {m.role === 'dj' && <Disc3 className="w-3 h-3 text-[#8B5CF6]" />}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate">
                            @{m.username} · {m.role}
                            {m.isMuted ? ' · muted' : ''}
                          </p>
                        </div>
                      </button>

                      {!isSelf && (
                        <div className="flex items-center gap-1 shrink-0">
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  const nextRole: RoomRole = m.role === 'dj' ? 'listener' : 'dj';
                                  await updateMemberModeration(roomId, m.uid, { role: nextRole });
                                  realtimeClient.send({
                                    type: 'room:role_updated',
                                    targetUid: m.uid,
                                    role: nextRole,
                                  });
                                }}
                                title={
                                  m.role === 'dj'
                                    ? t(language, 'demoteListener')
                                    : t(language, 'promoteDj')
                                }
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-[#8B5CF6]"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await updateMemberModeration(roomId, m.uid, {
                                    isMuted: !m.isMuted,
                                  });
                                  realtimeClient.send({
                                    type: 'room:role_updated',
                                    targetUid: m.uid,
                                    isMuted: !m.isMuted,
                                  });
                                }}
                                title={
                                  m.isMuted
                                    ? t(language, 'unmuteUser')
                                    : t(language, 'muteUser')
                                }
                                className={`p-1.5 rounded-lg bg-white/5 hover:bg-white/10 ${
                                  m.isMuted ? 'text-rose-400' : 'text-zinc-300'
                                }`}
                              >
                                <ShieldAlert className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await removeRoomMember(roomId, m.uid);
                                  realtimeClient.send({
                                    type: 'room:kick_user',
                                    targetUid: m.uid,
                                  });
                                }}
                                title={t(language, 'kickUser')}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-300 hover:text-rose-400"
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              toggleBlockUser(publicProfile.uid, m.uid, isUserBlocked)
                            }
                            className={`px-2 py-1 rounded-lg text-[10px] ${
                              isUserBlocked
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-white/5 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {isUserBlocked ? 'Blocked' : t(language, 'blockUser')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setReportTarget({ type: 'user', id: m.uid, label: m.displayName })
                            }
                            className="p-1 text-zinc-500 hover:text-amber-400"
                            title={t(language, 'reportUser')}
                          >
                            <Flag className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Add / Request Track Modal */}
      {trackModalMode && (
        <AddTrackModal
          mode={trackModalMode}
          onClose={() => setTrackModalMode(null)}
          onSubmit={handleTrackModalSubmit}
        />
      )}

      {/* Start Music Battle Modal */}
      {battleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleStartBattle}
            className="w-full max-w-md bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                {t(language, 'startBattle')}
              </h3>
              <button type="button" onClick={() => setBattleModalOpen(false)}>
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <input
              type="text"
              required
              value={battleTheme}
              onChange={(e) => setBattleTheme(e.target.value)}
              placeholder={language === 'pt' ? 'Temática (ex: Melhor Beat da Noite)' : 'Battle theme'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
            />
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Faixa A</label>
              <select
                value={battleTrackAId || tracks[0]?.id || ''}
                onChange={(e) => setBattleTrackAId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
              >
                {tracks.map((trk) => (
                  <option key={trk.id} value={trk.id}>
                    {trk.title} — {trk.artist}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Faixa B</label>
              <select
                value={battleTrackBId || tracks[1]?.id || tracks[0]?.id || ''}
                onChange={(e) => setBattleTrackBId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
              >
                {tracks.map((trk) => (
                  <option key={trk.id} value={trk.id}>
                    {trk.title} — {trk.artist}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#EC4899] hover:bg-pink-500 text-sm font-semibold text-white"
            >
              {t(language, 'startBattle')}
            </button>
          </form>
        </div>
      )}

      {/* Report Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await submitReport(
                publicProfile.uid,
                reportTarget.type,
                reportTarget.id,
                reportReason,
                reportDetails
              );
              setReportTarget(null);
              setReportDetails('');
              addToast(
                language === 'pt' ? 'Denúncia registada. Obrigado.' : 'Report submitted.',
                'success'
              );
            }}
            className="w-full max-w-md bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-white">
                {language === 'pt' ? `Denunciar ${reportTarget.label}` : `Report ${reportTarget.label}`}
              </h3>
              <button type="button" onClick={() => setReportTarget(null)}>
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
            >
              <option value="Spam ou publicidade">Spam</option>
              <option value="Comportamento impróprio">Comportamento impróprio</option>
              <option value="Conteúdo ofensivo">Conteúdo ofensivo</option>
            </select>
            <textarea
              rows={3}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder={language === 'pt' ? 'Detalhes adicionais...' : 'Additional details...'}
              className="w-full px-3 py-2 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
            />
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm font-semibold text-white"
            >
              {language === 'pt' ? 'Enviar Denúncia' : 'Submit Report'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
