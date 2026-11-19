import { useState } from 'react';
import { X, Upload, Lock, Globe, Sparkles } from 'lucide-react';
import { auth } from '../lib/firebase.ts';
import { MUSIC_GENRES, ROOM_COVERS } from '../lib/catalog.ts';
import { createRoom } from '../lib/firestoreService.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { RoomVisibility } from '../types/index.ts';
import { CoverImage } from './CoverImage.tsx';

interface CreateRoomModalProps {
  onClose: () => void;
}

export function CreateRoomModal({ onClose }: CreateRoomModalProps) {
  const language = useAppStore((s) => s.language);
  const publicProfile = useAppStore((s) => s.publicProfile);
  const openRoom = useAppStore((s) => s.openRoom);
  const addToast = useAppStore((s) => s.addToast);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(MUSIC_GENRES[0]);
  const [visibility, setVisibility] = useState<RoomVisibility>('public');
  const [password, setPassword] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(50);
  const [coverUrl, setCoverUrl] = useState(ROOM_COVERS[0].url);
  const [partyMode, setPartyMode] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    setUploadingCover(true);
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
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setCoverUrl(data.url);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro no upload da capa.', 'error');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicProfile || !name.trim()) return;
    setSubmitting(true);
    try {
      const room = await createRoom(publicProfile, {
        name,
        description,
        coverUrl,
        category,
        visibility,
        password: visibility === 'private' ? password : '',
        maxParticipants,
        partyMode,
        seedStarterTrack: true,
      });
      addToast(
        language === 'pt'
          ? `Sala "${room.name}" criada! Código: ${room.inviteCode}`
          : `Room "${room.name}" created! Invite code: ${room.inviteCode}`,
        'success'
      );
      onClose();
      openRoom(room.id);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao criar sala.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={handleCreate}
        className="w-full max-w-xl bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-5 my-8"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">
            {language === 'pt' ? 'Criar Nova Sala Musical' : 'Create New Music Room'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              {language === 'pt' ? 'Nome da sala' : 'Room name'}
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={language === 'pt' ? 'Ex: Sessão Midnight Lo-Fi' : 'e.g. Midnight Lo-Fi Session'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              {language === 'pt' ? 'Categoria musical' : 'Music genre'}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            >
              {MUSIC_GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">
            {language === 'pt' ? 'Descrição' : 'Description'}
          </label>
          <textarea
            rows={2}
            maxLength={350}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              language === 'pt'
                ? 'Que vibe vamos ouvir hoje?'
                : 'What kind of sound are we spinning tonight?'
            }
            className="w-full px-3.5 py-2 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
          />
        </div>

        {/* Visibility Type */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-300">
            {language === 'pt' ? 'Tipo e privacidade' : 'Room type & privacy'}
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {(
              [
                {
                  id: 'public',
                  icon: Globe,
                  label: language === 'pt' ? 'Pública' : 'Public',
                  sub: language === 'pt' ? 'Na descoberta' : 'In discovery',
                },
                {
                  id: 'private',
                  icon: Lock,
                  label: language === 'pt' ? 'Privada' : 'Private',
                  sub: language === 'pt' ? 'Convite / senha' : 'Invite / pass',
                },
                {
                  id: 'exclusive',
                  icon: Sparkles,
                  label: language === 'pt' ? 'Exclusiva' : 'Exclusive',
                  sub: language === 'pt' ? 'Eventos / VIP' : 'Events / VIP',
                },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = visibility === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setVisibility(opt.id)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    active
                      ? 'bg-[#8B5CF6]/15 border-[#8B5CF6] text-white'
                      : 'bg-[#09090B] border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 mb-1.5 ${active ? 'text-[#8B5CF6]' : ''}`} />
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div className="text-[11px] text-zinc-400">{opt.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {visibility === 'private' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                {language === 'pt' ? 'Palavra-passe opcional' : 'Optional password'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={language === 'pt' ? 'Deixar vazio = só código' : 'Leave blank = code only'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              {language === 'pt' ? 'Limite de participantes' : 'Max participants'}
            </label>
            <input
              type="number"
              min={2}
              max={500}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(Number(e.target.value) || 50)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white font-mono-tabular focus:outline-none focus:border-[#8B5CF6]"
            />
          </div>
        </div>

        {/* Cover Image Picker + Upload */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-300">
              {language === 'pt' ? 'Imagem de capa' : 'Cover artwork'}
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-[#8B5CF6] hover:text-violet-300 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{uploadingCover ? '...' : language === 'pt' ? 'Enviar imagem' : 'Upload image'}</span>
              <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
            </label>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            {ROOM_COVERS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCoverUrl(c.url)}
                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                  coverUrl === c.url ? 'border-[#8B5CF6] scale-[1.02]' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <CoverImage src={c.url} alt={c.label} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={partyMode}
            onChange={(e) => setPartyMode(e.target.checked)}
            className="rounded border-white/20 bg-[#09090B] text-[#8B5CF6]"
          />
          <span>
            {language === 'pt'
              ? 'Ativar Modo Festa (efeitos visuais reativos para grandes salas)'
              : 'Enable Party Mode (reactive visuals for big rooms)'}
          </span>
        </label>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium text-zinc-300 transition-colors"
          >
            {language === 'pt' ? 'Cancelar' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-5 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-60 text-sm font-semibold text-white transition-colors"
          >
            {submitting
              ? '...'
              : language === 'pt'
              ? 'Abrir Sala'
              : 'Launch Room'}
          </button>
        </div>
      </form>
    </div>
  );
}
