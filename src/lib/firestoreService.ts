import { User } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ACHIEVEMENTS, STUDIO_IMAGES, STUDIO_SYNTH_CATALOG, sha256Hex } from './catalog.ts';
import { OperationType, db, handleFirestoreError } from './firebase.ts';
import {
  DmMessageDoc,
  DmThreadDoc,
  FriendshipDoc,
  MusicBattleDoc,
  MusicEventDoc,
  NotificationDoc,
  RoomDoc,
  RoomHistoryDoc,
  RoomMemberDoc,
  RoomMessageDoc,
  RoomRole,
  RoomTrackDoc,
  RoomVisibility,
  TrackRequestDoc,
  TrackSourceType,
  UserPrivate,
  UserPublic,
} from '../types/index.ts';

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function makeInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'VIBE-';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// --- USER PROFILE & SETTINGS ---
export async function ensureUserProfiles(user: User): Promise<{
  pub: UserPublic | null;
  priv: UserPrivate | null;
  needsOnboarding: boolean;
}> {
  const pubRef = doc(db, 'users_public', user.uid);
  const privRef = doc(db, 'users_private', user.uid);

  let pubSnap;
  let privSnap;
  try {
    [pubSnap, privSnap] = await Promise.all([getDoc(pubRef), getDoc(privRef)]);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users_public/${user.uid}`);
  }

  if (!pubSnap.exists() || !privSnap.exists()) {
    return {
      pub: pubSnap.exists() ? (pubSnap.data() as UserPublic) : null,
      priv: privSnap.exists() ? (privSnap.data() as UserPrivate) : null,
      needsOnboarding: true,
    };
  }

  // Mark online silently
  try {
    await updateDoc(pubRef, {
      isOnline: true,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // non-fatal
  }

  return {
    pub: pubSnap.data() as UserPublic,
    priv: privSnap.data() as UserPrivate,
    needsOnboarding: false,
  };
}

export async function completeUserOnboarding(
  user: User,
  payload: {
    username: string;
    displayName: string;
    country: string;
    bio: string;
    favoriteGenres: string[];
    themeColor: string;
    languagePref: 'pt' | 'en';
  }
): Promise<{ pub: UserPublic; priv: UserPrivate }> {
  const cleanUsername = payload.username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 30);

  const pubDoc: UserPublic = {
    uid: user.uid,
    username: cleanUsername || `viber_${user.uid.slice(0, 6)}`,
    displayName: payload.displayName.trim().slice(0, 60) || 'Music Lover',
    avatarUrl: user.photoURL || STUDIO_IMAGES.lofiMidnight,
    bio: payload.bio.trim().slice(0, 280),
    country: payload.country.trim().slice(0, 60) || 'Portugal',
    favoriteGenres: payload.favoriteGenres.slice(0, 8),
    themeColor: payload.themeColor || '#8B5CF6',
    isOnline: true,
    currentRoomId: '',
    currentRoomName: '',
    currentTrackTitle: '',
    points: 0,
    weeklyPoints: 0,
    monthlyPoints: 0,
    tracksSharedCount: 0,
    listeningMinutes: 0,
    badges: [],
    followersCount: 0,
    followingCount: 0,
  };

  const privDoc: UserPrivate = {
    uid: user.uid,
    email: user.email || '',
    languagePref: payload.languagePref,
    privacyShowRoom: true,
    privacyAllowDm: true,
    notifyFriendRooms: true,
    notifyEvents: true,
    defaultVolume: 0.75,
    autoPartyMode: false,
    favoriteRoomIds: [],
    blockedUids: [],
  };

  try {
    await setDoc(doc(db, 'users_public', user.uid), {
      ...pubDoc,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'users_private', user.uid), {
      ...privDoc,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users_public/${user.uid}`);
  }

  return { pub: pubDoc, priv: privDoc };
}

export async function updatePublicProfile(
  uid: string,
  patch: Partial<
    Pick<
      UserPublic,
      | 'username'
      | 'displayName'
      | 'avatarUrl'
      | 'bio'
      | 'country'
      | 'favoriteGenres'
      | 'themeColor'
      | 'isOnline'
      | 'currentRoomId'
      | 'currentRoomName'
      | 'currentTrackTitle'
    >
  >
) {
  try {
    await updateDoc(doc(db, 'users_public', uid), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_public/${uid}`);
  }
}

export async function updatePrivateSettings(
  uid: string,
  patch: Partial<Omit<UserPrivate, 'uid' | 'email' | 'createdAt' | 'updatedAt'>>
) {
  try {
    await updateDoc(doc(db, 'users_private', uid), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_private/${uid}`);
  }
}

export async function awardPoints(
  uid: string,
  pointsDelta: number,
  options?: { trackShared?: boolean; badgeId?: string; minutes?: number }
) {
  try {
    const pubRef = doc(db, 'users_public', uid);
    const snap = await getDoc(pubRef);
    if (!snap.exists()) return;
    const data = snap.data() as UserPublic;
    const newPoints = (data.points || 0) + pointsDelta;
    const badges = new Set<string>(data.badges || []);

    if (options?.badgeId) badges.add(options.badgeId);
    if (newPoints >= 250) badges.add('rei_das_vibes');
    if ((data.tracksSharedCount || 0) + (options?.trackShared ? 1 : 0) >= 5) {
      badges.add('mestre_playlist');
    }

    const updatePayload: Record<string, unknown> = {
      points: increment(pointsDelta),
      weeklyPoints: increment(pointsDelta),
      monthlyPoints: increment(pointsDelta),
      badges: Array.from(badges).slice(0, 20),
      updatedAt: serverTimestamp(),
    };
    if (options?.trackShared) updatePayload.tracksSharedCount = increment(1);
    if (options?.minutes) updatePayload.listeningMinutes = increment(options.minutes);

    await updateDoc(pubRef, updatePayload);
  } catch {
    // Gamification award errors shouldn't break main flow
  }
}

// --- ROOMS & DISCOVERY ---
export async function createRoom(
  profile: UserPublic,
  input: {
    name: string;
    description: string;
    coverUrl: string;
    category: string;
    visibility: RoomVisibility;
    password?: string;
    maxParticipants: number;
    partyMode: boolean;
    seedStarterTrack?: boolean;
  }
): Promise<RoomDoc> {
  const roomId = makeId('room');
  const inviteCode = makeInviteCode();
  const hasPassword = Boolean(input.password && input.password.trim().length > 0);
  const passwordHash = hasPassword ? await sha256Hex(input.password!.trim()) : '';

  const matchingPreset =
    STUDIO_SYNTH_CATALOG.find((t) => t.genre.toLowerCase() === input.category.toLowerCase()) ||
    STUDIO_SYNTH_CATALOG[0];

  const roomData: RoomDoc = {
    id: roomId,
    name: input.name.trim().slice(0, 80),
    description: input.description.trim().slice(0, 400),
    coverUrl: input.coverUrl || matchingPreset.coverUrl,
    category: input.category,
    visibility: input.visibility,
    creatorId: profile.uid,
    creatorName: profile.displayName,
    inviteCode,
    hasPassword,
    passwordHash,
    maxParticipants: Math.max(2, Math.min(500, input.maxParticipants || 50)),
    partyMode: input.partyMode,
    participantCount: 1,
    currentTrackTitle: input.seedStarterTrack !== false ? matchingPreset.title : '',
    currentTrackArtist: input.seedStarterTrack !== false ? matchingPreset.artist : '',
    isPlaying: input.seedStarterTrack !== false,
    isClosed: false,
  };

  try {
    await setDoc(doc(db, 'rooms', roomId), {
      ...roomData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'room_invites', inviteCode), {
      inviteCode,
      roomId,
      creatorId: profile.uid,
      hasPassword,
      passwordHash,
      createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'rooms', roomId, 'members', profile.uid), {
      uid: profile.uid,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      role: 'admin',
      isMuted: false,
      inviteCode,
      joinedAt: serverTimestamp(),
    });

    if (input.seedStarterTrack !== false) {
      const trackId = makeId('trk');
      await setDoc(doc(db, 'rooms', roomId, 'tracks', trackId), {
        id: trackId,
        title: matchingPreset.title,
        artist: matchingPreset.artist,
        coverUrl: matchingPreset.coverUrl,
        sourceType: matchingPreset.sourceType,
        sourceRef: matchingPreset.sourceRef,
        durationMs: matchingPreset.durationMs,
        addedByUid: profile.uid,
        addedByName: profile.displayName,
        status: 'playing',
        orderIndex: 0,
        votesCount: 0,
        voterUids: [],
        createdAt: serverTimestamp(),
      });
    }

    await awardPoints(profile.uid, 25, { badgeId: 'dj_iniciante' });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}`);
  }

  return roomData;
}

export async function joinRoom(
  roomId: string,
  profile: UserPublic,
  inviteCode = ''
): Promise<{ room: RoomDoc; member: RoomMemberDoc }> {
  const roomRef = doc(db, 'rooms', roomId);
  const memberRef = doc(db, 'rooms', roomId, 'members', profile.uid);

  let roomSnap;
  try {
    roomSnap = await getDoc(roomRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
  }

  if (!roomSnap.exists()) {
    throw new Error('Sala não encontrada.');
  }
  const room = roomSnap.data() as RoomDoc;
  if (room.isClosed) {
    throw new Error('Esta sala já foi encerrada.');
  }

  let existingMemberSnap;
  try {
    existingMemberSnap = await getDoc(memberRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `rooms/${roomId}/members/${profile.uid}`);
  }

  let member: RoomMemberDoc;
  if (existingMemberSnap.exists()) {
    member = existingMemberSnap.data() as RoomMemberDoc;
  } else {
    const role: RoomRole = room.creatorId === profile.uid ? 'admin' : 'listener';
    member = {
      uid: profile.uid,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      role,
      isMuted: false,
      inviteCode: inviteCode || room.inviteCode,
    };
    try {
      await setDoc(memberRef, {
        ...member,
        joinedAt: serverTimestamp(),
      });
      await updateDoc(roomRef, {
        participantCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}/members/${profile.uid}`);
    }
  }

  try {
    await updateDoc(doc(db, 'users_public', profile.uid), {
      currentRoomId: room.id,
      currentRoomName: room.name,
      currentTrackTitle: room.currentTrackTitle || '',
      updatedAt: serverTimestamp(),
    });
    await awardPoints(profile.uid, 5, { badgeId: 'descobridor_musical' });
  } catch {
    // non-fatal
  }

  return { room, member };
}

export async function joinRoomByInviteCode(
  rawCode: string,
  password: string,
  profile: UserPublic
): Promise<RoomDoc> {
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new Error('Insere um código de convite válido.');

  let inviteSnap;
  try {
    inviteSnap = await getDoc(doc(db, 'room_invites', code));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `room_invites/${code}`);
  }

  if (!inviteSnap.exists()) {
    throw new Error('Código de convite inválido ou expirado.');
  }

  const invite = inviteSnap.data() as {
    roomId: string;
    inviteCode: string;
    hasPassword: boolean;
    passwordHash?: string;
  };

  if (invite.hasPassword) {
    const hashed = await sha256Hex(password.trim());
    if (hashed !== invite.passwordHash) {
      throw new Error('Palavra-passe incorreta para esta sala privada.');
    }
  }

  const { room } = await joinRoom(invite.roomId, profile, code);
  return room;
}

export async function leaveRoomFirestore(roomId: string, uid: string) {
  try {
    await updateDoc(doc(db, 'users_public', uid), {
      currentRoomId: '',
      currentRoomName: '',
      currentTrackTitle: '',
      updatedAt: serverTimestamp(),
    });
    const roomSnap = await getDoc(doc(db, 'rooms', roomId));
    if (roomSnap.exists()) {
      const count = (roomSnap.data() as RoomDoc).participantCount || 1;
      await updateDoc(doc(db, 'rooms', roomId), {
        participantCount: Math.max(0, count - 1),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // ignore cleanup failures
  }
}

export async function closeRoomFirestore(roomId: string) {
  try {
    await updateDoc(doc(db, 'rooms', roomId), {
      isClosed: true,
      isPlaying: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
  }
}

export async function updateMemberModeration(
  roomId: string,
  targetUid: string,
  patch: { role?: RoomRole; isMuted?: boolean }
) {
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'members', targetUid), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}/members/${targetUid}`);
  }
}

export async function removeRoomMember(roomId: string, targetUid: string) {
  try {
    await deleteDoc(doc(db, 'rooms', roomId, 'members', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `rooms/${roomId}/members/${targetUid}`);
  }
}

// --- TRACKS, REQUESTS, VOTES & HISTORY ---
export async function addTrackToRoom(
  roomId: string,
  profile: UserPublic,
  track: {
    title: string;
    artist: string;
    coverUrl: string;
    sourceType: TrackSourceType;
    sourceRef: string;
    durationMs: number;
    orderIndex: number;
  }
): Promise<RoomTrackDoc> {
  const id = makeId('trk');
  const cleanTitle = track.title.trim().slice(0, 140) || 'Faixa Sem Título';
  const cleanArtist = track.artist.trim().slice(0, 100) || 'Artista';
  const cleanCover = (track.coverUrl || STUDIO_IMAGES.synthHorizon).slice(0, 500);
  const cleanRef = track.sourceRef.trim().slice(0, 500);
  const cleanDuration = Math.min(7200000, Math.max(1000, Math.round(track.durationMs || 180000)));
  const cleanAddedByName = (profile.displayName || profile.username || 'Listener').slice(0, 64);

  const docData: RoomTrackDoc = {
    id,
    title: cleanTitle,
    artist: cleanArtist,
    coverUrl: cleanCover,
    sourceType: track.sourceType,
    sourceRef: cleanRef,
    durationMs: cleanDuration,
    addedByUid: profile.uid,
    addedByName: cleanAddedByName,
    status: 'queued',
    orderIndex: track.orderIndex,
    votesCount: 0,
    voterUids: [],
  };

  try {
    await setDoc(doc(db, 'rooms', roomId, 'tracks', id), {
      ...docData,
      createdAt: serverTimestamp(),
    });
    await awardPoints(profile.uid, 10, { trackShared: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}/tracks/${id}`);
  }
  return docData;
}

export async function removeTrackFromRoom(roomId: string, trackId: string) {
  try {
    await deleteDoc(doc(db, 'rooms', roomId, 'tracks', trackId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `rooms/${roomId}/tracks/${trackId}`);
  }
}

export async function toggleTrackVote(roomId: string, track: RoomTrackDoc, uid: string) {
  const hasVoted = track.voterUids?.includes(uid);
  const nextVoters = hasVoted
    ? track.voterUids.filter((v) => v !== uid)
    : [...(track.voterUids || []), uid].slice(0, 200);

  try {
    await updateDoc(doc(db, 'rooms', roomId, 'tracks', track.id), {
      voterUids: nextVoters,
      votesCount: nextVoters.length,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}/tracks/${track.id}`);
  }
}

export async function submitTrackRequest(
  roomId: string,
  profile: UserPublic,
  track: {
    title: string;
    artist: string;
    coverUrl: string;
    sourceType: TrackSourceType;
    sourceRef: string;
    durationMs: number;
  }
) {
  const id = makeId('req');
  const cleanTitle = track.title.trim().slice(0, 140) || 'Faixa Sem Título';
  const cleanArtist = track.artist.trim().slice(0, 100) || 'Artista';
  const cleanCover = (track.coverUrl || STUDIO_IMAGES.indieSession).slice(0, 500);
  const cleanRef = track.sourceRef.trim().slice(0, 500);
  const cleanDuration = Math.min(7200000, Math.max(1000, Math.round(track.durationMs || 180000)));
  const cleanReqName = (profile.displayName || profile.username || 'Listener').slice(0, 64);

  try {
    await setDoc(doc(db, 'rooms', roomId, 'requests', id), {
      id,
      title: cleanTitle,
      artist: cleanArtist,
      coverUrl: cleanCover,
      sourceType: track.sourceType,
      sourceRef: cleanRef,
      durationMs: cleanDuration,
      requestedByUid: profile.uid,
      requestedByName: cleanReqName,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}/requests/${id}`);
  }
}

export async function respondTrackRequest(
  roomId: string,
  request: TrackRequestDoc,
  accept: boolean,
  staffProfile: UserPublic,
  orderIndex: number
) {
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'requests', request.id), {
      status: accept ? 'accepted' : 'rejected',
    });
    if (accept) {
      await addTrackToRoom(roomId, staffProfile, {
        title: request.title,
        artist: request.artist,
        coverUrl: request.coverUrl,
        sourceType: request.sourceType,
        sourceRef: request.sourceRef,
        durationMs: request.durationMs,
        orderIndex,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}/requests/${request.id}`);
  }
}

export async function recordRoomHistory(
  roomId: string,
  profile: UserPublic,
  track: {
    title: string;
    artist: string;
    coverUrl?: string;
    sourceType: TrackSourceType;
    sourceRef: string;
  }
) {
  const id = makeId('hist');
  try {
    await setDoc(doc(db, 'rooms', roomId, 'history', id), {
      id,
      title: track.title.slice(0, 140),
      artist: track.artist.slice(0, 100),
      coverUrl: track.coverUrl || '',
      sourceType: track.sourceType,
      sourceRef: track.sourceRef,
      playedByUid: profile.uid,
      playedByName: profile.displayName,
      playedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'rooms', roomId), {
      currentTrackTitle: track.title.slice(0, 140),
      currentTrackArtist: track.artist.slice(0, 100),
      isPlaying: true,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if non-staff
  }
}

// --- ROOM CHAT ---
export async function sendRoomMessage(
  roomId: string,
  profile: UserPublic,
  role: RoomRole,
  payload: {
    text: string;
    imageUrl?: string;
    replyToId?: string;
    replyPreview?: string;
  }
) {
  const id = makeId('msg');
  const mentionMatches = payload.text.match(/@([a-zA-Z0-9_.]+)/g) || [];
  const mentions = mentionMatches.map((m) => m.slice(1)).slice(0, 10);

  const msgData: Record<string, unknown> = {
    id,
    senderUid: profile.uid,
    senderName: profile.displayName,
    senderUsername: profile.username,
    senderAvatar: profile.avatarUrl,
    senderRole: role,
    text: payload.text.slice(0, 1000),
    mentions,
    reactions: {},
    isPinned: false,
    createdAt: serverTimestamp(),
  };
  if (payload.imageUrl) msgData.imageUrl = payload.imageUrl;
  if (payload.replyToId) msgData.replyToId = payload.replyToId;
  if (payload.replyPreview) msgData.replyPreview = payload.replyPreview.slice(0, 140);

  try {
    await setDoc(doc(db, 'rooms', roomId, 'messages', id), msgData);
    await awardPoints(profile.uid, 2);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}/messages/${id}`);
  }
}

export async function toggleMessageReaction(
  roomId: string,
  message: RoomMessageDoc,
  emoji: string,
  uid: string
) {
  const reactions = { ...(message.reactions || {}) };
  const current = reactions[emoji] || [];
  const next = current.includes(uid)
    ? current.filter((u) => u !== uid)
    : [...current, uid].slice(0, 100);
  if (next.length === 0) {
    delete reactions[emoji];
  } else {
    reactions[emoji] = next;
  }
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'messages', message.id), { reactions });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}/messages/${message.id}`);
  }
}

export async function togglePinMessage(roomId: string, message: RoomMessageDoc) {
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'messages', message.id), {
      isPinned: !message.isPinned,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}/messages/${message.id}`);
  }
}

export async function deleteRoomMessage(roomId: string, messageId: string) {
  try {
    await deleteDoc(doc(db, 'rooms', roomId, 'messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `rooms/${roomId}/messages/${messageId}`);
  }
}

// --- MUSIC BATTLE ---
export async function createMusicBattle(
  roomId: string,
  profile: UserPublic,
  input: {
    theme: string;
    trackATitle: string;
    trackAArtist: string;
    trackASourceType: TrackSourceType;
    trackASourceRef: string;
    trackBTitle: string;
    trackBArtist: string;
    trackBSourceType: TrackSourceType;
    trackBSourceRef: string;
  }
): Promise<MusicBattleDoc> {
  const id = makeId('battle');
  const battle: MusicBattleDoc = {
    id,
    theme: input.theme.slice(0, 100),
    trackATitle: input.trackATitle.slice(0, 140),
    trackAArtist: input.trackAArtist.slice(0, 100),
    trackASourceType: input.trackASourceType,
    trackASourceRef: input.trackASourceRef,
    trackBTitle: input.trackBTitle.slice(0, 140),
    trackBArtist: input.trackBArtist.slice(0, 100),
    trackBSourceType: input.trackBSourceType,
    trackBSourceRef: input.trackBSourceRef,
    creatorUid: profile.uid,
    votesA: [],
    votesB: [],
    status: 'active',
    winner: '',
  };

  try {
    await setDoc(doc(db, 'rooms', roomId, 'battles', id), {
      ...battle,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}/battles/${id}`);
  }
  return battle;
}

export async function finishMusicBattle(roomId: string, battle: MusicBattleDoc) {
  const countA = battle.votesA.length;
  const countB = battle.votesB.length;
  const winner: 'A' | 'B' | 'tie' = countA > countB ? 'A' : countB > countA ? 'B' : 'tie';
  try {
    await updateDoc(doc(db, 'rooms', roomId, 'battles', battle.id), {
      status: 'finished',
      winner,
    });
    await awardPoints(battle.creatorUid, 20);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}/battles/${battle.id}`);
  }
  return { ...battle, status: 'finished' as const, winner };
}

// --- SOCIAL: FRIENDS, FOLLOWS, DMs, INVITES, NOTIFICATIONS ---
export async function sendFriendRequest(from: UserPublic, toUid: string) {
  const pair = [from.uid, toUid].sort();
  const id = `fr_${pair[0].slice(0, 12)}_${pair[1].slice(0, 12)}`;
  try {
    await setDoc(doc(db, 'friendships', id), {
      id,
      participants: pair,
      requesterUid: from.uid,
      recipientUid: toUid,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await createNotification({
      recipientUid: toUid,
      senderUid: from.uid,
      senderName: from.displayName,
      type: 'friend_request',
      title: `${from.displayName} enviou um pedido de amizade`,
      body: `@${from.username} quer ligar-se a ti no VIBE ROOM.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `friendships/${id}`);
  }
}

export async function respondFriendRequest(friendshipId: string, status: 'accepted' | 'declined') {
  try {
    await updateDoc(doc(db, 'friendships', friendshipId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `friendships/${friendshipId}`);
  }
}

export async function toggleFollowUser(myUid: string, targetUid: string, currentlyFollowing: boolean) {
  const id = `flw_${myUid.slice(0, 16)}_${targetUid.slice(0, 16)}`;
  try {
    if (currentlyFollowing) {
      await deleteDoc(doc(db, 'follows', id));
      await updateDoc(doc(db, 'users_public', myUid), {
        followingCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users_public', targetUid), {
        followersCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'follows', id), {
        followerUid: myUid,
        targetUid,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users_public', myUid), {
        followingCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users_public', targetUid), {
        followersCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `follows/${id}`);
  }
}

export async function createOrGetDmThread(myUid: string, targetUid: string): Promise<string> {
  const pair = [myUid, targetUid].sort();
  const threadId = `dm_${pair[0].slice(0, 16)}_${pair[1].slice(0, 16)}`;
  const ref = doc(db, 'dm_threads', threadId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: threadId,
        isGroup: false,
        participants: pair,
        creatorUid: myUid,
        lastMessage: '',
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `dm_threads/${threadId}`);
  }
  return threadId;
}

export async function createFriendGroup(
  myUid: string,
  name: string,
  memberUids: string[]
): Promise<string> {
  const threadId = makeId('grp');
  const participants = Array.from(new Set([myUid, ...memberUids])).slice(0, 25);
  try {
    await setDoc(doc(db, 'dm_threads', threadId), {
      id: threadId,
      isGroup: true,
      name: name.trim().slice(0, 80) || 'Grupo Musical',
      participants,
      creatorUid: myUid,
      lastMessage: '',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `dm_threads/${threadId}`);
  }
  return threadId;
}

export async function sendDmMessage(
  threadId: string,
  sender: UserPublic,
  text: string,
  roomInvite?: { roomId: string; roomName: string; inviteCode: string }
) {
  const msgId = makeId('dmsg');
  const msgPayload: Record<string, unknown> = {
    id: msgId,
    senderUid: sender.uid,
    senderName: sender.displayName,
    text: text.slice(0, 1000),
    createdAt: serverTimestamp(),
  };
  if (roomInvite) {
    msgPayload.inviteRoomId = roomInvite.roomId;
    msgPayload.inviteRoomName = roomInvite.roomName.slice(0, 80);
    msgPayload.inviteCode = roomInvite.inviteCode;
  }

  try {
    await setDoc(doc(db, 'dm_threads', threadId, 'messages', msgId), msgPayload);
    await updateDoc(doc(db, 'dm_threads', threadId), {
      lastMessage: (roomInvite ? `Convite: ${roomInvite.roomName}` : text).slice(0, 200),
      lastMessageAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `dm_threads/${threadId}/messages/${msgId}`);
  }
}

export async function createNotification(input: {
  recipientUid: string;
  senderUid: string;
  senderName: string;
  type: NotificationDoc['type'];
  title: string;
  body: string;
  roomId?: string;
  inviteCode?: string;
}) {
  const id = makeId('notif');
  const payload: Record<string, unknown> = {
    id,
    recipientUid: input.recipientUid,
    senderUid: input.senderUid,
    senderName: input.senderName.slice(0, 64),
    type: input.type,
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 280),
    read: false,
    createdAt: serverTimestamp(),
  };
  if (input.roomId) payload.roomId = input.roomId;
  if (input.inviteCode) payload.inviteCode = input.inviteCode;

  try {
    await setDoc(doc(db, 'notifications', id), payload);
  } catch {
    // Non-fatal
  }
}

export async function markNotificationRead(notificationId: string) {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch {
    // ignore
  }
}

// --- EVENTS ---
export async function createMusicEvent(
  profile: UserPublic,
  input: {
    title: string;
    description: string;
    roomId: string;
    roomName: string;
    coverUrl: string;
    startsAt: string;
    maxCapacity: number;
  }
) {
  const id = makeId('evt');
  try {
    await setDoc(doc(db, 'events', id), {
      id,
      title: input.title.trim().slice(0, 100),
      description: input.description.trim().slice(0, 400),
      roomId: input.roomId,
      roomName: input.roomName.slice(0, 80),
      coverUrl: input.coverUrl || STUDIO_IMAGES.heroStudio,
      startsAt: input.startsAt,
      maxCapacity: Math.max(2, Math.min(1000, input.maxCapacity || 100)),
      attendeeCount: 1,
      creatorUid: profile.uid,
      creatorName: profile.displayName,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'events', id, 'registrations', profile.uid), {
      uid: profile.uid,
      displayName: profile.displayName,
      registeredAt: serverTimestamp(),
    });
    await awardPoints(profile.uid, 30, { badgeId: 'organizador_eventos' });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `events/${id}`);
  }
}

export async function toggleEventRegistration(
  eventId: string,
  profile: UserPublic,
  isRegistered: boolean
) {
  const regRef = doc(db, 'events', eventId, 'registrations', profile.uid);
  const evtRef = doc(db, 'events', eventId);
  try {
    if (isRegistered) {
      await deleteDoc(regRef);
      await updateDoc(evtRef, { attendeeCount: increment(-1) });
    } else {
      await setDoc(regRef, {
        uid: profile.uid,
        displayName: profile.displayName,
        registeredAt: serverTimestamp(),
      });
      await updateDoc(evtRef, { attendeeCount: increment(1) });
      await awardPoints(profile.uid, 10, { badgeId: 'organizador_eventos' });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `events/${eventId}/registrations/${profile.uid}`);
  }
}

// --- MODERATION & FAVORITES ---
export async function toggleFavoriteRoom(uid: string, roomId: string, isFavorite: boolean) {
  try {
    await updateDoc(doc(db, 'users_private', uid), {
      favoriteRoomIds: isFavorite ? arrayRemove(roomId) : arrayUnion(roomId),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_private/${uid}`);
  }
}

export async function toggleBlockUser(myUid: string, targetUid: string, isBlocked: boolean) {
  try {
    await updateDoc(doc(db, 'users_private', myUid), {
      blockedUids: isBlocked ? arrayRemove(targetUid) : arrayUnion(targetUid),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_private/${myUid}`);
  }
}

export async function submitReport(
  reporterUid: string,
  targetType: 'user' | 'room' | 'message',
  targetId: string,
  reason: string,
  details: string
) {
  const id = makeId('rep');
  try {
    await setDoc(doc(db, 'reports', id), {
      reporterUid,
      targetType,
      targetId,
      reason: reason.slice(0, 120),
      details: details.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${id}`);
  }
}

// --- REAL-TIME LISTENERS ---
export function subscribeDiscoverableRooms(
  uid: string,
  cb: (rooms: RoomDoc[]) => void
): () => void {
  const publicQ = query(
    collection(db, 'rooms'),
    where('visibility', 'in', ['public', 'exclusive']),
    limit(60)
  );
  const myRoomsQ = query(collection(db, 'rooms'), where('creatorId', '==', uid), limit(30));

  let publicList: RoomDoc[] = [];
  let myList: RoomDoc[] = [];

  const emit = () => {
    const merged = new Map<string, RoomDoc>();
    [...publicList, ...myList].forEach((r) => {
      if (!r.isClosed) merged.set(r.id, r);
    });
    const sorted = Array.from(merged.values()).sort(
      (a, b) => (b.participantCount || 0) - (a.participantCount || 0)
    );
    cb(sorted);
  };

  const unsub1 = onSnapshot(
    publicQ,
    (snap) => {
      publicList = snap.docs.map((d) => d.data() as RoomDoc);
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'rooms')
  );

  const unsub2 = onSnapshot(
    myRoomsQ,
    (snap) => {
      myList = snap.docs.map((d) => d.data() as RoomDoc);
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'rooms')
  );

  return () => {
    unsub1();
    unsub2();
  };
}

export function subscribePublicUsers(cb: (users: UserPublic[]) => void): () => void {
  const q = query(
    collection(db, 'users_public'),
    where('points', '>=', 0),
    orderBy('points', 'desc'),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as UserPublic)),
    (err) => handleFirestoreError(err, OperationType.LIST, 'users_public')
  );
}

export function subscribeNotifications(
  uid: string,
  cb: (notifs: NotificationDoc[]) => void
): () => void {
  const q = query(
    collection(db, 'notifications'),
    where('recipientUid', '==', uid),
    limit(30)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as NotificationDoc);
      cb(list.reverse());
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
  );
}

export function subscribeFriendships(
  uid: string,
  cb: (items: FriendshipDoc[]) => void
): () => void {
  const q = query(
    collection(db, 'friendships'),
    where('participants', 'array-contains', uid),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as FriendshipDoc)),
    (err) => handleFirestoreError(err, OperationType.LIST, 'friendships')
  );
}

export function subscribeDmThreads(
  uid: string,
  cb: (threads: DmThreadDoc[]) => void
): () => void {
  const q = query(
    collection(db, 'dm_threads'),
    where('participants', 'array-contains', uid),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as DmThreadDoc)),
    (err) => handleFirestoreError(err, OperationType.LIST, 'dm_threads')
  );
}

export function subscribeEvents(cb: (events: MusicEventDoc[]) => void): () => void {
  const q = query(collection(db, 'events'), where('maxCapacity', '>=', 2), limit(40));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => d.data() as MusicEventDoc)),
    (err) => handleFirestoreError(err, OperationType.LIST, 'events')
  );
}

export async function getEventRegistrations(eventId: string): Promise<string[]> {
  try {
    const snap = await getDocs(collection(db, 'events', eventId, 'registrations'));
    return snap.docs.map((d) => d.id);
  } catch {
    return [];
  }
}

export function subscribeRoomSubcollections(
  roomId: string,
  handlers: {
    onRoom: (room: RoomDoc | null) => void;
    onMembers: (members: RoomMemberDoc[]) => void;
    onTracks: (tracks: RoomTrackDoc[]) => void;
    onRequests: (requests: TrackRequestDoc[]) => void;
    onMessages: (messages: RoomMessageDoc[]) => void;
    onHistory: (history: RoomHistoryDoc[]) => void;
    onBattles: (battles: MusicBattleDoc[]) => void;
  }
): () => void {
  const u1 = onSnapshot(
    doc(db, 'rooms', roomId),
    (snap) => handlers.onRoom(snap.exists() ? (snap.data() as RoomDoc) : null),
    (err) => handleFirestoreError(err, OperationType.GET, `rooms/${roomId}`)
  );
  const u2 = onSnapshot(
    collection(db, 'rooms', roomId, 'members'),
    (snap) => handlers.onMembers(snap.docs.map((d) => d.data() as RoomMemberDoc)),
    (err) => handleFirestoreError(err, OperationType.LIST, `rooms/${roomId}/members`)
  );
  const u3 = onSnapshot(
    query(collection(db, 'rooms', roomId, 'tracks'), orderBy('orderIndex', 'asc')),
    (snap) => handlers.onTracks(snap.docs.map((d) => d.data() as RoomTrackDoc)),
    (err) => handleFirestoreError(err, OperationType.LIST, `rooms/${roomId}/tracks`)
  );
  const u4 = onSnapshot(
    query(collection(db, 'rooms', roomId, 'requests'), orderBy('createdAt', 'desc'), limit(40)),
    (snap) => handlers.onRequests(snap.docs.map((d) => d.data() as TrackRequestDoc)),
    (err) => handleFirestoreError(err, OperationType.LIST, `rooms/${roomId}/requests`)
  );
  const u5 = onSnapshot(
    query(collection(db, 'rooms', roomId, 'messages'), orderBy('createdAt', 'asc'), limit(120)),
    (snap) => handlers.onMessages(snap.docs.map((d) => d.data() as RoomMessageDoc)),
    (err) => handleFirestoreError(err, OperationType.LIST, `rooms/${roomId}/messages`)
  );
  const u6 = onSnapshot(
    query(collection(db, 'rooms', roomId, 'history'), orderBy('playedAt', 'desc'), limit(30)),
    (snap) => handlers.onHistory(snap.docs.map((d) => d.data() as RoomHistoryDoc)),
    (err) => handleFirestoreError(err, OperationType.LIST, `rooms/${roomId}/history`)
  );
  const u7 = onSnapshot(
    query(collection(db, 'rooms', roomId, 'battles'), orderBy('createdAt', 'desc'), limit(10)),
    (snap) => handlers.onBattles(snap.docs.map((d) => d.data() as MusicBattleDoc)),
    (err) => handleFirestoreError(err, OperationType.LIST, `rooms/${roomId}/battles`)
  );

  return () => {
    u1();
    u2();
    u3();
    u4();
    u5();
    u6();
    u7();
  };
}

export { ACHIEVEMENTS };
