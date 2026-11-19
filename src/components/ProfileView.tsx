import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Award, Check, MessageCircle, Upload, UserPlus } from 'lucide-react';
import { ACHIEVEMENTS, MUSIC_GENRES, PROFILE_ACCENTS } from '../lib/catalog.ts';
import { auth, db } from '../lib/firebase.ts';
import {
  createOrGetDmThread,
  joinRoom,
  respondFriendRequest,
  sendFriendRequest,
  toggleFollowUser,
  updatePublicProfile,
} from '../lib/firestoreService.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { FriendshipDoc, RoomDoc, UserPublic } from '../types/index.ts';
import { CoverImage } from './CoverImage.tsx';

interface ProfileViewProps {
  users: UserPublic[];
  rooms: RoomDoc[];
  friendships: FriendshipDoc[];
}

export function ProfileView({ users, rooms, friendships }: ProfileViewProps) {
  const language = useAppStore((s) => s.language);
  const publicProfile = useAppStore((s) => s.publicProfile);
  const privateProfile = useAppStore((s) => s.privateProfile);
  const selectedProfileUid = useAppStore((s) => s.selectedProfileUid);
  const openDmThread = useAppStore((s) => s.openDmThread);
  const openRoom = useAppStore((s) => s.openRoom);
  const addToast = useAppStore((s) => s.addToast);

  const targetUid = selectedProfileUid || publicProfile?.uid || '';
  const isOwnProfile = targetUid === publicProfile?.uid;

  const targetUser =
    (isOwnProfile ? publicProfile : users.find((u) => u.uid === targetUid)) || publicProfile;

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('');
  const [themeColor, setThemeColor] = useState('#8B5CF6');
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    if (targetUser) {
      setDisplayName(targetUser.displayName);
      setBio(targetUser.bio || '');
      setCountry(targetUser.country || '');
      setThemeColor(targetUser.themeColor || '#8B5CF6');
      setFavoriteGenres(targetUser.favoriteGenres || []);
    }
  }, [targetUser?.uid]);

  useEffect(() => {
    if (!publicProfile || !targetUid || isOwnProfile) return;
    const id = `flw_${publicProfile.uid.slice(0, 16)}_${targetUid.slice(0, 16)}`;
    getDoc(doc(db, 'follows', id))
      .then((snap) => setIsFollowing(snap.exists()))
      .catch(() => {});
  }, [publicProfile?.uid, targetUid, isOwnProfile]);

  if (!publicProfile || !targetUser) return null;

  const friendship = friendships.find(
    (f) => f.participants.includes(publicProfile.uid) && f.participants.includes(targetUser.uid)
  );

  const pendingIncoming = friendships.filter(
    (f) => f.status === 'pending' && f.recipientUid === publicProfile.uid
  );

  const myFriends = friendships
    .filter((f) => f.status === 'accepted')
    .map((f) => {
      const otherUid = f.participants.find((id) => id !== publicProfile.uid);
      return users.find((u) => u.uid === otherUid);
    })
    .filter(Boolean) as UserPublic[];

  const userRooms = rooms.filter((r) => r.creatorId === targetUser.uid);
  const favRooms = isOwnProfile
    ? rooms.filter((r) => privateProfile?.favoriteRoomIds?.includes(r.id))
    : [];

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updatePublicProfile(publicProfile.uid, {
      displayName: displayName.trim() || publicProfile.displayName,
      bio: bio.trim(),
      country: country.trim(),
      themeColor,
      favoriteGenres,
    });
    setEditing(false);
    addToast(language === 'pt' ? 'Perfil atualizado!' : 'Profile updated!', 'success');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
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
      if (!res.ok) throw new Error(data.error || 'Erro no upload.');
      await updatePublicProfile(publicProfile.uid, { avatarUrl: data.url });
      addToast(language === 'pt' ? 'Avatar atualizado!' : 'Avatar updated!', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro no upload.', 'error');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-[#18181B] border border-white/10 rounded-2xl overflow-hidden">
        <div
          style={{
            background: `linear-gradient(120deg, ${targetUser.themeColor || '#8B5CF6'}44, #09090B)`,
          }}
          className="h-28"
        />
        <div className="px-6 pb-6 -mt-12 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <div className="relative">
              <CoverImage
                src={targetUser.avatarUrl}
                alt={targetUser.displayName}
                className="w-24 h-24 rounded-2xl object-cover border-4 border-[#18181B]"
              />
              {isOwnProfile && (
                <label className="absolute -bottom-1 -right-1 p-1.5 rounded-lg bg-[#8B5CF6] text-white cursor-pointer shadow">
                  <Upload className="w-3.5 h-3.5" />
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                </label>
              )}
            </div>
            <div className="space-y-0.5 pb-1">
              <h2 className="font-display text-2xl font-bold text-white">
                {targetUser.displayName}
              </h2>
              <p className="text-xs text-zinc-400">
                @{targetUser.username} · {targetUser.country || 'Global'} ·{' '}
                {targetUser.isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOwnProfile ? (
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
              >
                {editing
                  ? language === 'pt'
                    ? 'Fechar Edição'
                    : 'Close Edit'
                  : language === 'pt'
                  ? 'Editar Perfil'
                  : 'Edit Profile'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    await toggleFollowUser(publicProfile.uid, targetUser.uid, isFollowing);
                    setIsFollowing(!isFollowing);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isFollowing
                      ? 'bg-white/10 text-zinc-200'
                      : 'bg-[#8B5CF6] hover:bg-[#7C3AED] text-white'
                  }`}
                >
                  {isFollowing
                    ? language === 'pt'
                      ? 'A Seguir'
                      : 'Following'
                    : language === 'pt'
                    ? 'Seguir'
                    : 'Follow'}
                </button>

                {!friendship && (
                  <button
                    type="button"
                    onClick={async () => {
                      await sendFriendRequest(publicProfile, targetUser.uid);
                      addToast(
                        language === 'pt' ? 'Pedido de amizade enviado!' : 'Friend request sent!',
                        'success'
                      );
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{language === 'pt' ? 'Adicionar Amigo' : 'Add Friend'}</span>
                  </button>
                )}

                {friendship?.status === 'pending' && (
                  <span className="px-3 py-2 rounded-xl bg-white/5 text-xs text-zinc-400">
                    {language === 'pt' ? 'Pedido pendente' : 'Pending'}
                  </span>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    const threadId = await createOrGetDmThread(publicProfile.uid, targetUser.uid);
                    openDmThread(threadId);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3B82F6] hover:bg-blue-500 text-xs font-semibold text-white"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{language === 'pt' ? 'Mensagem' : 'Message'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {targetUser.bio && <p className="text-sm text-zinc-300">{targetUser.bio}</p>}

          <div className="flex flex-wrap gap-6 text-xs text-zinc-400 font-mono-tabular">
            <span>
              <strong className="text-white">{targetUser.points || 0}</strong> pts
            </span>
            <span>
              <strong className="text-white">{targetUser.followersCount || 0}</strong>{' '}
              {language === 'pt' ? 'seguidores' : 'followers'}
            </span>
            <span>
              <strong className="text-white">{targetUser.followingCount || 0}</strong>{' '}
              {language === 'pt' ? 'a seguir' : 'following'}
            </span>
            <span>
              <strong className="text-white">{targetUser.tracksSharedCount || 0}</strong>{' '}
              {language === 'pt' ? 'músicas partilhadas' : 'tracks shared'}
            </span>
          </div>

          {targetUser.favoriteGenres?.length > 0 && (
            <p className="text-xs text-zinc-400">
              {targetUser.favoriteGenres.join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Edit Form */}
      {isOwnProfile && editing && (
        <form
          onSubmit={handleSaveProfile}
          className="bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-4"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nome"
              className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
            />
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="País"
              className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
            />
          </div>
          <input
            type="text"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Biografia"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
          />
          <div className="flex flex-wrap gap-2">
            {MUSIC_GENRES.map((g) => {
              const active = favoriteGenres.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() =>
                    setFavoriteGenres((prev) =>
                      active ? prev.filter((x) => x !== g) : [...prev, g].slice(0, 6)
                    )
                  }
                  className={`px-3 py-1 rounded-lg text-xs border ${
                    active
                      ? 'bg-[#8B5CF6] border-[#8B5CF6] text-white'
                      : 'bg-[#09090B] border-white/10 text-zinc-400'
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            {PROFILE_ACCENTS.map((acc) => (
              <button
                key={acc.value}
                type="button"
                onClick={() => setThemeColor(acc.value)}
                style={{ backgroundColor: acc.value }}
                className={`w-6 h-6 rounded-full ${
                  themeColor === acc.value ? 'ring-2 ring-white' : 'opacity-60'
                }`}
              />
            ))}
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-semibold text-white"
          >
            {language === 'pt' ? 'Guardar Perfil' : 'Save Profile'}
          </button>
        </form>
      )}

      {/* Pending Friend Requests (Own Profile) */}
      {isOwnProfile && pendingIncoming.length > 0 && (
        <section className="bg-[#18181B] border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-display text-sm font-bold text-white">
            {language === 'pt' ? 'Pedidos de Amizade Recebidos' : 'Incoming Friend Requests'}
          </h3>
          {pendingIncoming.map((req) => {
            const sender = users.find((u) => u.uid === req.requesterUid);
            return (
              <div key={req.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-200">
                  {sender?.displayName || req.requesterUid}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => respondFriendRequest(req.id, 'accepted')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>{language === 'pt' ? 'Aceitar' : 'Accept'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => respondFriendRequest(req.id, 'declined')}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-semibold"
                  >
                    {language === 'pt' ? 'Recusar' : 'Decline'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Badges & Rooms */}
      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-[#18181B] border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-[#8B5CF6]" />
            <span>{language === 'pt' ? 'Conquistas' : 'Badges'}</span>
          </h3>
          {targetUser.badges?.length ? (
            <div className="space-y-2">
              {targetUser.badges.map((bId) => {
                const badge = ACHIEVEMENTS.find((a) => a.id === bId);
                if (!badge) return null;
                return (
                  <div key={bId} className="p-3 rounded-xl bg-[#09090B] border border-white/10">
                    <p className="text-xs font-semibold text-white">
                      {language === 'pt' ? badge.titlePt : badge.titleEn}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {language === 'pt' ? badge.descPt : badge.descEn}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              {language === 'pt' ? 'Nenhuma conquista ainda.' : 'No badges yet.'}
            </p>
          )}
        </section>

        <section className="bg-[#18181B] border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-display text-base font-bold text-white">
            {isOwnProfile
              ? language === 'pt'
                ? 'Amigos & Salas'
                : 'Friends & Rooms'
              : language === 'pt'
              ? 'Salas Criadas'
              : 'Hosted Rooms'}
          </h3>
          {isOwnProfile && myFriends.length > 0 && (
            <div className="space-y-2 pb-3 border-b border-white/10">
              {myFriends.map((fr) => (
                <div key={fr.uid} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-200">{fr.displayName}</span>
                  <span className="text-zinc-500">@{fr.username}</span>
                </div>
              ))}
            </div>
          )}
          {userRooms.length === 0 && favRooms.length === 0 ? (
            <p className="text-xs text-zinc-500">
              {language === 'pt' ? 'Sem salas associadas.' : 'No rooms yet.'}
            </p>
          ) : (
            <div className="space-y-2">
              {[...userRooms, ...favRooms].slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={async () => {
                    try {
                      await joinRoom(r.id, publicProfile, r.inviteCode);
                      openRoom(r.id);
                    } catch (err) {
                      addToast(
                        err instanceof Error ? err.message : 'Sala indisponível.',
                        'error'
                      );
                    }
                  }}
                  className="w-full p-2.5 rounded-xl bg-[#09090B] border border-white/10 hover:border-[#8B5CF6]/50 flex items-center justify-between text-left"
                >
                  <span className="text-xs font-semibold text-white truncate">{r.name}</span>
                  <span className="text-[11px] text-zinc-400">{r.category}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
