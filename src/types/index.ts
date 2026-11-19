export type Language = 'pt' | 'en';

export interface UserPublic {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  country: string;
  favoriteGenres: string[];
  themeColor: string;
  isOnline: boolean;
  currentRoomId: string;
  currentRoomName: string;
  currentTrackTitle: string;
  points: number;
  weeklyPoints: number;
  monthlyPoints: number;
  tracksSharedCount: number;
  listeningMinutes: number;
  badges: string[];
  followersCount: number;
  followingCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivate {
  uid: string;
  email: string;
  languagePref: Language;
  privacyShowRoom: boolean;
  privacyAllowDm: boolean;
  notifyFriendRooms: boolean;
  notifyEvents: boolean;
  defaultVolume: number;
  autoPartyMode: boolean;
  favoriteRoomIds: string[];
  blockedUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type RoomVisibility = 'public' | 'private' | 'exclusive';
export type RoomRole = 'admin' | 'dj' | 'listener';
export type TrackSourceType = 'upload' | 'youtube' | 'synth';

export interface RoomDoc {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  category: string;
  visibility: RoomVisibility;
  creatorId: string;
  creatorName: string;
  inviteCode: string;
  hasPassword: boolean;
  passwordHash?: string;
  maxParticipants: number;
  partyMode: boolean;
  participantCount: number;
  currentTrackTitle: string;
  currentTrackArtist: string;
  isPlaying: boolean;
  isClosed: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RoomMemberDoc {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  role: RoomRole;
  isMuted: boolean;
  inviteCode?: string;
  joinedAt?: unknown;
}

export interface RoomTrackDoc {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  sourceType: TrackSourceType;
  sourceRef: string;
  durationMs: number;
  addedByUid: string;
  addedByName: string;
  status: 'queued' | 'playing' | 'played';
  orderIndex: number;
  votesCount: number;
  voterUids: string[];
  createdAt?: unknown;
}

export interface TrackRequestDoc {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  sourceType: TrackSourceType;
  sourceRef: string;
  durationMs: number;
  requestedByUid: string;
  requestedByName: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt?: unknown;
}

export interface RoomMessageDoc {
  id: string;
  senderUid: string;
  senderName: string;
  senderUsername: string;
  senderAvatar: string;
  senderRole: RoomRole;
  text: string;
  imageUrl?: string;
  replyToId?: string;
  replyPreview?: string;
  mentions: string[];
  reactions: Record<string, string[]>;
  isPinned: boolean;
  createdAt?: unknown;
}

export interface RoomHistoryDoc {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  sourceType: TrackSourceType;
  sourceRef: string;
  playedByUid: string;
  playedByName: string;
  playedAt?: unknown;
}

export interface MusicBattleDoc {
  id: string;
  theme: string;
  trackATitle: string;
  trackAArtist: string;
  trackASourceType: TrackSourceType;
  trackASourceRef: string;
  trackBTitle: string;
  trackBArtist: string;
  trackBSourceType: TrackSourceType;
  trackBSourceRef: string;
  creatorUid: string;
  votesA: string[];
  votesB: string[];
  status: 'active' | 'finished';
  winner: 'A' | 'B' | 'tie' | '';
  createdAt?: unknown;
}

export interface FriendshipDoc {
  id: string;
  participants: string[];
  requesterUid: string;
  recipientUid: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DmThreadDoc {
  id: string;
  isGroup: boolean;
  name?: string;
  participants: string[];
  creatorUid: string;
  lastMessage?: string;
  lastMessageAt?: unknown;
  createdAt?: unknown;
}

export interface DmMessageDoc {
  id: string;
  senderUid: string;
  senderName: string;
  text: string;
  inviteRoomId?: string;
  inviteRoomName?: string;
  inviteCode?: string;
  createdAt?: unknown;
}

export interface NotificationDoc {
  id: string;
  recipientUid: string;
  senderUid: string;
  senderName: string;
  type: 'friend_request' | 'room_invite' | 'friend_room' | 'event_reminder' | 'badge';
  title: string;
  body: string;
  roomId?: string;
  inviteCode?: string;
  read: boolean;
  createdAt?: unknown;
}

export interface MusicEventDoc {
  id: string;
  title: string;
  description: string;
  roomId: string;
  roomName: string;
  coverUrl: string;
  startsAt: string;
  maxCapacity: number;
  attendeeCount: number;
  creatorUid: string;
  creatorName: string;
  createdAt?: unknown;
}

export interface LiveParticipant {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  role: RoomRole;
  isMuted: boolean;
  isTyping: boolean;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
  x: number;
}

export interface GlobalPresenceUser {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  roomId: string;
  roomName: string;
  trackTitle: string;
}

export type AppView =
  | 'dashboard'
  | 'explore'
  | 'room'
  | 'messages'
  | 'events'
  | 'ranking'
  | 'profile'
  | 'settings';
