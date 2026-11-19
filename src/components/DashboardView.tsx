import { useState } from 'react';
import { Disc3, KeyRound, Play, Plus, Users } from 'lucide-react';
import { joinRoom, joinRoomByInviteCode } from '../lib/firestoreService.ts';
import { t } from '../lib/i18n.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { FriendshipDoc, RoomDoc, UserPublic } from '../types/index.ts';
import { CoverImage } from './CoverImage.tsx';

interface DashboardViewProps {
  rooms: RoomDoc[];
  users: UserPublic[];
  friendships: FriendshipDoc[];
  onOpenCreateRoom: () => void;
}

export function DashboardView({
  rooms,
  users,
  friendships,
  onOpenCreateRoom,
}: DashboardViewProps) {
  const language = useAppStore((s) => s.language);
  const publicProfile = useAppStore((s) => s.publicProfile);
  const openRoom = useAppStore((s) => s.openRoom);
  const openUserProfile = useAppStore((s) => s.openUserProfile);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const addToast = useAppStore((s) => s.addToast);

  const [inviteCode, setInviteCode] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);

  if (!publicProfile) return null;

  const friendUids = new Set(
    friendships
      .filter((f) => f.status === 'accepted')
      .map((f) => f.participants.find((id) => id !== publicProfile.uid) || '')
      .filter(Boolean)
  );

  const onlineFriends = users.filter((u) => friendUids.has(u.uid) && u.isOnline);
  const recommendedRooms = rooms.filter((r) =>
    publicProfile.favoriteGenres?.includes(r.category)
  );
  const popularRooms = [...rooms]
    .sort((a, b) => (b.participantCount || 0) - (a.participantCount || 0))
    .slice(0, 6);

  const handleJoin = async (room: RoomDoc) => {
    try {
      await joinRoom(room.id, publicProfile, room.inviteCode);
      openRoom(room.id);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao entrar na sala.', 'error');
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setJoiningCode(true);
    try {
      const room = await joinRoomByInviteCode(inviteCode, invitePassword, publicProfile);
      setInviteCode('');
      setInvitePassword('');
      openRoom(room.id);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Código inválido.', 'error');
    } finally {
      setJoiningCode(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      {/* Top Action & Quick Invite Strip */}
      <div className="grid lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-[#18181B] border border-white/10 rounded-2xl p-6 flex flex-col justify-between gap-5">
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#8B5CF6]">
              VIBE ROOM · {t(language, 'slogan')}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              {language === 'pt'
                ? `Olá, ${publicProfile.displayName}`
                : `Welcome back, ${publicProfile.displayName}`}
            </h2>
            <p className="text-sm text-zinc-400">
              {language === 'pt'
                ? 'Abre uma sala pública ou privada em segundos e ouve em sincronização perfeita com a tua comunidade.'
                : 'Spin up a public or private room in seconds and listen in tight sync with your community.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenCreateRoom}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{t(language, 'createRoom')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('explore')}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 text-sm font-medium transition-colors"
            >
              {t(language, 'explore')}
            </button>
          </div>
        </div>

        <form
          onSubmit={handleCodeSubmit}
          className="lg:col-span-5 bg-[#18181B] border border-white/10 rounded-2xl p-6 flex flex-col justify-between gap-4"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <KeyRound className="w-4 h-4 text-[#3B82F6]" />
            <span>{t(language, 'joinByCode')}</span>
          </div>
          <div className="space-y-2.5">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder={t(language, 'inviteCodePlaceholder')}
              className="w-full px-3.5 py-2 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white uppercase font-mono-tabular focus:outline-none focus:border-[#3B82F6]"
            />
            <input
              type="password"
              value={invitePassword}
              onChange={(e) => setInvitePassword(e.target.value)}
              placeholder={t(language, 'passwordPlaceholder')}
              className="w-full px-3.5 py-2 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#3B82F6]"
            />
          </div>
          <button
            type="submit"
            disabled={joiningCode || !inviteCode.trim()}
            className="w-full py-2.5 rounded-xl bg-[#3B82F6] hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {joiningCode ? '...' : t(language, 'joinRoom')}
          </button>
        </form>
      </div>

      {/* Online Friends */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-white">
            {t(language, 'onlineFriends')}
          </h3>
          <span className="text-xs text-zinc-400 font-mono-tabular">
            {onlineFriends.length}
          </span>
        </div>
        {onlineFriends.length === 0 ? (
          <div className="bg-[#18181B] border border-white/10 rounded-2xl p-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <Users className="w-4 h-4 text-zinc-500" />
              <span>
                {language === 'pt'
                  ? 'Nenhum amigo online agora. Explora perfis no Ranking ou entra numa sala pública.'
                  : 'No friends online right now. Explore users on the Leaderboard or join a public room.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('ranking')}
              className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-200 whitespace-nowrap"
            >
              {t(language, 'ranking')}
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {onlineFriends.map((friend) => (
              <div
                key={friend.uid}
                className="bg-[#18181B] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => openUserProfile(friend.uid)}
                  className="flex items-center gap-3 min-w-0 text-left"
                >
                  <CoverImage
                    src={friend.avatarUrl}
                    alt={friend.displayName}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {friend.displayName}
                    </p>
                    <p className="text-xs text-zinc-400 truncate">
                      {friend.currentRoomName || `@${friend.username}`}
                    </p>
                  </div>
                </button>
                {friend.currentRoomId && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await joinRoom(friend.currentRoomId, publicProfile);
                        openRoom(friend.currentRoomId);
                      } catch (err) {
                        addToast(err instanceof Error ? err.message : 'Sala privada.', 'error');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-medium text-white shrink-0"
                  >
                    {t(language, 'joinRoom')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recommended Rooms */}
      {recommendedRooms.length > 0 && (
        <section className="space-y-4">
          <h3 className="font-display text-lg font-semibold text-white">
            {t(language, 'recommendedRooms')}
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recommendedRooms.slice(0, 3).map((room) => (
              <RoomCard key={room.id} room={room} onJoin={() => handleJoin(room)} language={language} />
            ))}
          </div>
        </section>
      )}

      {/* Popular Rooms */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-white">
            {t(language, 'popularRooms')}
          </h3>
          <button
            type="button"
            onClick={() => setActiveView('explore')}
            className="text-xs font-medium text-[#8B5CF6] hover:text-violet-300"
          >
            {language === 'pt' ? 'Ver todas' : 'View all'}
          </button>
        </div>

        {popularRooms.length === 0 ? (
          <div className="bg-[#18181B] border border-white/10 rounded-2xl p-10 text-center space-y-3">
            <Disc3 className="w-8 h-8 text-[#8B5CF6] mx-auto" />
            <p className="text-sm text-zinc-300 font-medium">
              {language === 'pt'
                ? 'Ainda não há salas ativas. Sê o primeiro a abrir uma sala!'
                : 'No active rooms yet. Be the first to launch a listening room!'}
            </p>
            <button
              type="button"
              onClick={onOpenCreateRoom}
              className="px-4 py-2 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-semibold text-white"
            >
              {t(language, 'createRoom')}
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {popularRooms.map((room) => (
              <RoomCard key={room.id} room={room} onJoin={() => handleJoin(room)} language={language} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function RoomCard({
  room,
  onJoin,
  language,
}: {
  room: RoomDoc;
  onJoin: () => void;
  language: 'pt' | 'en';
}) {
  return (
    <div className="bg-[#18181B] border border-white/10 hover:border-[#8B5CF6]/50 rounded-2xl overflow-hidden transition-colors flex flex-col">
      <div className="relative h-40 overflow-hidden">
        <CoverImage src={room.coverUrl} alt={room.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#18181B] via-black/30 to-transparent" />
        <button
          type="button"
          onClick={onJoin}
          className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white flex items-center justify-center shadow-lg transition-colors"
          aria-label={t(language, 'joinRoom')}
        >
          <Play className="w-4 h-4 ml-0.5" />
        </button>
      </div>
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-400">
            {room.category} <span aria-hidden="true">·</span>{' '}
            <span className="font-mono-tabular">
              {room.participantCount || 0}/{room.maxParticipants}
            </span>{' '}
            <span aria-hidden="true">·</span> {room.visibility}
          </p>
          <h4 className="font-display font-semibold text-white mt-1 truncate">{room.name}</h4>
          <p className="text-xs text-zinc-400 mt-1 truncate">
            {room.currentTrackTitle
              ? `${room.currentTrackTitle} — ${room.currentTrackArtist}`
              : room.description || `${language === 'pt' ? 'Por' : 'By'} ${room.creatorName}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onJoin}
          className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-100 transition-colors"
        >
          {t(language, 'joinRoom')}
        </button>
      </div>
    </div>
  );
}
