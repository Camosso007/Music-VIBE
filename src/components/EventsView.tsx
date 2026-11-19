import { useEffect, useState } from 'react';
import { Calendar, Plus, Users, X } from 'lucide-react';
import { STUDIO_IMAGES } from '../lib/catalog.ts';
import {
  createMusicEvent,
  getEventRegistrations,
  joinRoom,
  toggleEventRegistration,
} from '../lib/firestoreService.ts';
import { t } from '../lib/i18n.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { MusicEventDoc, RoomDoc } from '../types/index.ts';
import { CoverImage } from './CoverImage.tsx';

interface EventsViewProps {
  events: MusicEventDoc[];
  rooms: RoomDoc[];
}

export function EventsView({ events, rooms }: EventsViewProps) {
  const language = useAppStore((s) => s.language);
  const publicProfile = useAppStore((s) => s.publicProfile);
  const openRoom = useAppStore((s) => s.openRoom);
  const addToast = useAppStore((s) => s.addToast);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [roomId, setRoomId] = useState(rooms[0]?.id || '');
  const [startsAt, setStartsAt] = useState('');
  const [maxCapacity, setMaxCapacity] = useState(100);
  const [rsvpMap, setRsvpMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    events.forEach(async (ev) => {
      const uids = await getEventRegistrations(ev.id);
      setRsvpMap((prev) => ({ ...prev, [ev.id]: uids }));
    });
  }, [events]);

  if (!publicProfile) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetRoom = rooms.find((r) => r.id === roomId) || rooms[0];
    if (!targetRoom) {
      addToast(
        language === 'pt'
          ? 'Cria uma sala antes de agendar um evento.'
          : 'Create a room first before scheduling an event.',
        'error'
      );
      return;
    }
    await createMusicEvent(publicProfile, {
      title,
      description,
      roomId: targetRoom.id,
      roomName: targetRoom.name,
      coverUrl: targetRoom.coverUrl || STUDIO_IMAGES.heroStudio,
      startsAt: startsAt || new Date(Date.now() + 3600_000).toISOString(),
      maxCapacity,
    });
    setCreateOpen(false);
    setTitle('');
    setDescription('');
    addToast(language === 'pt' ? 'Evento criado!' : 'Event created!', 'success');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">{t(language, 'events')}</h2>
          <p className="text-sm text-zinc-400">
            {language === 'pt'
              ? 'Sessões de audição ao vivo, festas temáticas e sets de DJ agendados.'
              : 'Live listening sessions, themed parties, and scheduled DJ sets.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-sm font-semibold text-white"
        >
          <Plus className="w-4 h-4" />
          <span>{t(language, 'createEvent')}</span>
        </button>
      </div>

      {events.length === 0 ? (
        <div className="bg-[#18181B] border border-white/10 rounded-2xl p-10 text-center space-y-3">
          <Calendar className="w-8 h-8 text-[#EC4899] mx-auto" />
          <p className="text-sm text-zinc-400">
            {language === 'pt'
              ? 'Ainda não existem eventos agendados.'
              : 'No events scheduled yet.'}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {events.map((ev) => {
            const registered = (rsvpMap[ev.id] || []).includes(publicProfile.uid);
            const full = (ev.attendeeCount || 0) >= ev.maxCapacity && !registered;
            return (
              <div
                key={ev.id}
                className="bg-[#18181B] border border-white/10 rounded-2xl overflow-hidden flex flex-col"
              >
                <div className="h-36 relative">
                  <CoverImage
                    src={ev.coverUrl}
                    alt={ev.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#18181B] via-black/30 to-transparent" />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-mono-tabular text-[#EC4899]">
                      {new Date(ev.startsAt).toLocaleString()}
                    </p>
                    <h3 className="font-display font-bold text-white text-lg">{ev.title}</h3>
                    <p className="text-xs text-zinc-400 line-clamp-2">{ev.description}</p>
                    <p className="text-xs text-zinc-300 pt-1 flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="font-mono-tabular">
                        {ev.attendeeCount || 0} / {ev.maxCapacity}
                      </span>
                      <span>· {ev.roomName}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={full}
                      onClick={async () => {
                        await toggleEventRegistration(ev.id, publicProfile, registered);
                        setRsvpMap((prev) => {
                          const curr = prev[ev.id] || [];
                          return {
                            ...prev,
                            [ev.id]: registered
                              ? curr.filter((u) => u !== publicProfile.uid)
                              : [...curr, publicProfile.uid],
                          };
                        });
                      }}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                        registered
                          ? 'bg-white/10 text-zinc-200 hover:bg-white/15'
                          : 'bg-[#8B5CF6] hover:bg-[#7C3AED] text-white disabled:opacity-40'
                      }`}
                    >
                      {registered ? t(language, 'rsvpLeave') : t(language, 'rsvpJoin')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await joinRoom(ev.roomId, publicProfile);
                          openRoom(ev.roomId);
                        } catch (err) {
                          addToast(
                            err instanceof Error ? err.message : 'Sala indisponível.',
                            'error'
                          );
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-200"
                    >
                      {t(language, 'joinRoom')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                {t(language, 'createEvent')}
              </h3>
              <button type="button" onClick={() => setCreateOpen(false)}>
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={language === 'pt' ? 'Nome do evento' : 'Event title'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
            />
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={language === 'pt' ? 'Descrição' : 'Description'}
              className="w-full px-3.5 py-2 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
            />
            <select
              value={roomId || rooms[0]?.id || ''}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#09090B] border border-white/10 text-xs text-white"
              />
              <input
                type="number"
                min={2}
                max={1000}
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(Number(e.target.value) || 50)}
                className="px-3 py-2 rounded-xl bg-[#09090B] border border-white/10 text-xs text-white font-mono-tabular"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-sm font-semibold text-white"
            >
              {t(language, 'createEvent')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
