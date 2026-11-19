import { useState } from 'react';
import { Calendar, Search, KeyRound } from 'lucide-react';
import { MUSIC_GENRES } from '../lib/catalog.ts';
import { joinRoom, joinRoomByInviteCode } from '../lib/firestoreService.ts';
import { t } from '../lib/i18n.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { MusicEventDoc, RoomDoc } from '../types/index.ts';
import { RoomCard } from './DashboardView.tsx';

interface ExploreViewProps {
  rooms: RoomDoc[];
  events: MusicEventDoc[];
}

export function ExploreView({ rooms, events }: ExploreViewProps) {
  const language = useAppStore((s) => s.language);
  const publicProfile = useAppStore((s) => s.publicProfile);
  const openRoom = useAppStore((s) => s.openRoom);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const addToast = useAppStore((s) => s.addToast);

  const [queryText, setQueryText] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('ALL');
  const [sortMode, setSortMode] = useState<'popular' | 'recent' | 'active'>('popular');
  const [minParticipants, setMinParticipants] = useState<number>(0);

  const [inviteCode, setInviteCode] = useState('');
  const [invitePassword, setInvitePassword] = useState('');

  if (!publicProfile) return null;

  const filtered = rooms
    .filter((room) => {
      if (selectedGenre !== 'ALL' && room.category !== selectedGenre) return false;
      if ((room.participantCount || 0) < minParticipants) return false;
      if (!queryText.trim()) return true;
      const q = queryText.toLowerCase();
      return (
        room.name.toLowerCase().includes(q) ||
        room.category.toLowerCase().includes(q) ||
        room.creatorName.toLowerCase().includes(q) ||
        (room.currentTrackTitle || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortMode === 'popular' || sortMode === 'active') {
        return (b.participantCount || 0) - (a.participantCount || 0);
      }
      return b.id.localeCompare(a.id);
    });

  const handleJoin = async (room: RoomDoc) => {
    try {
      await joinRoom(room.id, publicProfile, room.inviteCode);
      openRoom(room.id);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao entrar.', 'error');
    }
  };

  const handleCodeJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    try {
      const room = await joinRoomByInviteCode(inviteCode, invitePassword, publicProfile);
      setInviteCode('');
      setInvitePassword('');
      openRoom(room.id);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Código inválido.', 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Search & Filter Bar */}
      <div className="bg-[#18181B] border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="grid md:grid-cols-12 gap-3">
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={t(language, 'searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            >
              <option value="popular">
                {language === 'pt' ? 'Mais populares' : 'Most popular'}
              </option>
              <option value="active">
                {language === 'pt' ? 'Mais movimentadas' : 'Most active'}
              </option>
              <option value="recent">
                {language === 'pt' ? 'Recentemente criadas' : 'Recently created'}
              </option>
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={minParticipants}
              onChange={(e) => setMinParticipants(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            >
              <option value={0}>
                {language === 'pt' ? 'Qualquer lotação' : 'Any occupancy'}
              </option>
              <option value={2}>2+ {language === 'pt' ? 'participantes' : 'listeners'}</option>
              <option value={5}>5+ {language === 'pt' ? 'participantes' : 'listeners'}</option>
              <option value={10}>10+ {language === 'pt' ? 'participantes' : 'listeners'}</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedGenre('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedGenre === 'ALL'
                ? 'bg-[#8B5CF6] text-white'
                : 'bg-[#09090B] text-zinc-400 hover:text-white border border-white/10'
            }`}
          >
            {t(language, 'allGenres')}
          </button>
          {MUSIC_GENRES.map((genre) => (
            <button
              key={genre}
              type="button"
              onClick={() => setSelectedGenre(genre)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedGenre === genre
                  ? 'bg-[#8B5CF6] text-white'
                  : 'bg-[#09090B] text-zinc-400 hover:text-white border border-white/10'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* Private Invite Code Bar */}
      <form
        onSubmit={handleCodeJoin}
        className="bg-[#18181B] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 shrink-0">
          <KeyRound className="w-4 h-4 text-[#3B82F6]" />
          <span>{t(language, 'joinByCode')}</span>
        </div>
        <input
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder={t(language, 'inviteCodePlaceholder')}
          className="flex-1 px-3 py-2 rounded-xl bg-[#09090B] border border-white/10 text-xs text-white uppercase font-mono-tabular focus:outline-none focus:border-[#3B82F6]"
        />
        <input
          type="password"
          value={invitePassword}
          onChange={(e) => setInvitePassword(e.target.value)}
          placeholder={t(language, 'passwordPlaceholder')}
          className="flex-1 px-3 py-2 rounded-xl bg-[#09090B] border border-white/10 text-xs text-white focus:outline-none focus:border-[#3B82F6]"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-[#3B82F6] hover:bg-blue-500 text-xs font-semibold text-white shrink-0"
        >
          {t(language, 'joinRoom')}
        </button>
      </form>

      {/* Live Events Strip */}
      {events.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#EC4899]" />
              <span>{language === 'pt' ? 'Eventos Musicais ao Vivo' : 'Live Music Events'}</span>
            </h3>
            <button
              type="button"
              onClick={() => setActiveView('events')}
              className="text-xs font-medium text-[#8B5CF6] hover:text-violet-300"
            >
              {language === 'pt' ? 'Ver agenda' : 'View schedule'}
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.slice(0, 3).map((ev) => (
              <div
                key={ev.id}
                className="bg-[#18181B] border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs text-[#EC4899] font-mono-tabular">
                    {new Date(ev.startsAt).toLocaleString()}
                  </p>
                  <p className="text-sm font-semibold text-white truncate mt-0.5">{ev.title}</p>
                  <p className="text-xs text-zinc-400 truncate">{ev.roomName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView('events')}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-200 shrink-0"
                >
                  {language === 'pt' ? 'Abrir' : 'Open'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Room Results */}
      {filtered.length === 0 ? (
        <div className="bg-[#18181B] border border-white/10 rounded-2xl p-10 text-center text-sm text-zinc-400">
          {t(language, 'noRoomsFound')}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((room) => (
            <RoomCard key={room.id} room={room} onJoin={() => handleJoin(room)} language={language} />
          ))}
        </div>
      )}
    </div>
  );
}
