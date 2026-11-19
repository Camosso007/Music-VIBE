import { useState } from 'react';
import { CheckCircle2, Disc3, Link2, Search, Upload, X } from 'lucide-react';
import { auth } from '../lib/firebase.ts';
import { STUDIO_IMAGES, STUDIO_SYNTH_CATALOG, formatDurationMs } from '../lib/catalog.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { TrackSourceType } from '../types/index.ts';
import { CoverImage } from './CoverImage.tsx';

export interface NewTrackPayload {
  title: string;
  artist: string;
  coverUrl: string;
  sourceType: TrackSourceType;
  sourceRef: string;
  durationMs: number;
}

interface AddTrackModalProps {
  mode: 'add' | 'request';
  onClose: () => void;
  onSubmit: (track: NewTrackPayload) => Promise<void>;
}

interface YouTubeResultItem {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  durationMs: number;
}

function parseFriendlyError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    // not JSON
  }
  return err.message || fallback;
}

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(
      res.status === 413
        ? 'O ficheiro é demasiado grande (máximo 25MB).'
        : `Erro do servidor (${res.status}).`
    );
  }
}

function looksLikeYoutubeUrlOrId(value: string): boolean {
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return true;
  return /(?:youtube\.com|youtu\.be)/i.test(trimmed);
}

export function AddTrackModal({ mode, onClose, onSubmit }: AddTrackModalProps) {
  const language = useAppStore((s) => s.language);
  const addToast = useAppStore((s) => s.addToast);

  const [tab, setTab] = useState<'catalog' | 'upload' | 'youtube'>('catalog');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Upload state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadArtist, setUploadArtist] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadDurationMs, setUploadDurationMs] = useState(180000);
  const [uploadingFile, setUploadingFile] = useState(false);

  // YouTube state
  const [ytInput, setYtInput] = useState('');
  const [ytResults, setYtResults] = useState<YouTubeResultItem[]>([]);
  const [lookingUpYt, setLookingUpYt] = useState(false);

  const handleAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !auth.currentUser) return;

    setModalError(null);
    setUploadingFile(true);
    try {
      // Measure real audio duration in browser before/during upload
      const objectUrl = URL.createObjectURL(file);
      const probe = new Audio(objectUrl);
      probe.addEventListener('loadedmetadata', () => {
        if (probe.duration && Number.isFinite(probe.duration)) {
          const clamped = Math.min(7200000, Math.max(5000, Math.round(probe.duration * 1000)));
          setUploadDurationMs(clamped);
        }
        URL.revokeObjectURL(objectUrl);
      });
      probe.addEventListener('error', () => {
        URL.revokeObjectURL(objectUrl);
      });

      const token = await auth.currentUser.getIdToken();
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload/audio', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(String(data.error || 'Upload falhou.'));

      const cleanName = file.name.replace(/\.[^.]+$/, '').trim() || file.name;
      setUploadUrl(String(data.url || ''));
      setUploadFileName(file.name);
      setUploadTitle(cleanName.slice(0, 140));
      setUploadArtist((prev) => prev || 'Upload Local');

      addToast(
        language === 'pt' ? 'Áudio carregado com sucesso!' : 'Audio uploaded!',
        'success'
      );
    } catch (err) {
      const msg = parseFriendlyError(err, 'Erro no upload.');
      setModalError(msg);
      addToast(msg, 'error');
    } finally {
      setUploadingFile(false);
    }
  };

  const runYtLookupOrSearch = async (rawQuery: string) => {
    const queryStr = rawQuery.trim();
    if (!queryStr || !auth.currentUser) return;
    setModalError(null);
    setLookingUpYt(true);
    try {
      const token = await auth.currentUser.getIdToken();
      if (looksLikeYoutubeUrlOrId(queryStr)) {
        const res = await fetch(`/api/youtube/info?url=${encodeURIComponent(queryStr)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await parseJsonResponse(res);
        if (!res.ok) throw new Error(String(data.error || 'Link inválido.'));
        setYtResults([data as unknown as YouTubeResultItem]);
      } else {
        const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(queryStr)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await parseJsonResponse(res);
        if (!res.ok) throw new Error(String(data.error || 'Erro ao pesquisar no YouTube.'));
        const list = Array.isArray(data.results) ? (data.results as YouTubeResultItem[]) : [];
        setYtResults(list);
        if (list.length === 0) {
          setModalError(
            language === 'pt'
              ? 'Nenhum vídeo encontrado. Tenta outro termo ou cola o link do YouTube.'
              : 'No videos found. Try another search or paste a YouTube link.'
          );
        }
      }
    } catch (err) {
      const msg = parseFriendlyError(
        err,
        language === 'pt' ? 'Erro ao consultar o YouTube.' : 'Failed to look up YouTube.'
      );
      setModalError(msg);
      addToast(msg, 'error');
    } finally {
      setLookingUpYt(false);
    }
  };

  const handleYtFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runYtLookupOrSearch(ytInput);
  };

  const handleConfirm = async (track: NewTrackPayload) => {
    setModalError(null);
    setSubmitting(true);
    try {
      await onSubmit(track);
      onClose();
    } catch (err) {
      const msg = parseFriendlyError(
        err,
        language === 'pt' ? 'Erro ao adicionar música.' : 'Failed to add track.'
      );
      setModalError(msg);
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-5 my-8">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-white">
            {mode === 'add'
              ? language === 'pt'
                ? 'Adicionar Música à Sala'
                : 'Add Track to Room'
              : language === 'pt'
              ? 'Enviar Pedido Musical ao DJ'
              : 'Send Track Request to DJ'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Tabs */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-[#09090B] rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => {
              setTab('catalog');
              setModalError(null);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
              tab === 'catalog' ? 'bg-[#8B5CF6] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Disc3 className="w-3.5 h-3.5" />
            <span>{language === 'pt' ? 'Estúdio' : 'Studio'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('upload');
              setModalError(null);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
              tab === 'upload' ? 'bg-[#8B5CF6] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{language === 'pt' ? 'Aparelho' : 'Upload'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('youtube');
              setModalError(null);
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
              tab === 'youtube' ? 'bg-[#8B5CF6] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>YouTube</span>
          </button>
        </div>

        {modalError && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
            {modalError}
          </div>
        )}

        {tab === 'catalog' && (
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {STUDIO_SYNTH_CATALOG.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#09090B] border border-white/10 hover:border-[#8B5CF6]/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CoverImage
                    src={preset.coverUrl}
                    alt={preset.title}
                    className="w-11 h-11 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{preset.title}</p>
                    <p className="text-xs text-zinc-400 truncate">
                      {preset.artist} · {preset.genre} ·{' '}
                      <span className="font-mono-tabular">{formatDurationMs(preset.durationMs)}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    handleConfirm({
                      title: preset.title,
                      artist: preset.artist,
                      coverUrl: preset.coverUrl,
                      sourceType: 'synth',
                      sourceRef: preset.sourceRef,
                      durationMs: preset.durationMs,
                    })
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-semibold text-white shrink-0"
                >
                  {mode === 'add' ? (language === 'pt' ? 'Adicionar' : 'Add') : language === 'pt' ? 'Pedir' : 'Request'}
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'upload' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!uploadUrl || !uploadTitle.trim() || submitting) return;
              handleConfirm({
                title: uploadTitle.trim(),
                artist: uploadArtist.trim() || 'Artista Independente',
                coverUrl: STUDIO_IMAGES.afroGroove,
                sourceType: 'upload',
                sourceRef: uploadUrl,
                durationMs: uploadDurationMs,
              });
            }}
            className="space-y-4"
          >
            <label className="block border border-dashed border-white/20 hover:border-[#8B5CF6] rounded-xl p-5 text-center cursor-pointer transition-colors bg-[#09090B]">
              {uploadUrl && !uploadingFile ? (
                <div className="space-y-1.5">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                  <p className="text-xs font-semibold text-emerald-300 truncate px-2">
                    {uploadFileName || uploadTitle}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {language === 'pt'
                      ? 'Pronto para adicionar (clica aqui para trocar de ficheiro)'
                      : 'Ready to add (click here to pick another file)'}
                  </p>
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-[#8B5CF6] mx-auto mb-2" />
                  <p className="text-xs font-medium text-white">
                    {uploadingFile
                      ? language === 'pt'
                        ? 'A carregar ficheiro do aparelho...'
                        : 'Uploading audio file...'
                      : language === 'pt'
                      ? 'Clica para escolher MP3, WAV, AAC, M4A ou OGG (máx. 25MB)'
                      : 'Click to select MP3, WAV, AAC, M4A, or OGG (max 25MB)'}
                  </p>
                </>
              )}
              <input
                type="file"
                accept=".mp3,.wav,.aac,.m4a,.ogg,.opus,.flac,.webm,audio/*"
                onChange={handleAudioFile}
                className="hidden"
              />
            </label>

            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder={language === 'pt' ? 'Título da faixa' : 'Track title'}
                className="px-3.5 py-2 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              />
              <input
                type="text"
                value={uploadArtist}
                onChange={(e) => setUploadArtist(e.target.value)}
                placeholder={language === 'pt' ? 'Artista' : 'Artist'}
                className="px-3.5 py-2 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            <button
              type="submit"
              disabled={!uploadUrl || !uploadTitle.trim() || submitting || uploadingFile}
              className="w-full py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-50 text-sm font-semibold text-white"
            >
              {submitting
                ? '...'
                : mode === 'add'
                ? language === 'pt'
                  ? 'Adicionar à Fila'
                  : 'Add to Queue'
                : language === 'pt'
                ? 'Enviar Pedido'
                : 'Send Request'}
            </button>
          </form>
        )}

        {tab === 'youtube' && (
          <div className="space-y-4">
            <form onSubmit={handleYtFormSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ytInput}
                  onChange={(e) => setYtInput(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted && looksLikeYoutubeUrlOrId(pasted)) {
                      window.setTimeout(() => runYtLookupOrSearch(pasted), 60);
                    }
                  }}
                  placeholder={
                    language === 'pt'
                      ? 'Pesquisar música ou colar link do YouTube...'
                      : 'Search song or paste YouTube link...'
                  }
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
              <button
                type="submit"
                disabled={lookingUpYt || !ytInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#3B82F6] hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white shrink-0"
              >
                {lookingUpYt
                  ? '...'
                  : looksLikeYoutubeUrlOrId(ytInput)
                  ? language === 'pt'
                    ? 'Verificar'
                    : 'Verify'
                  : language === 'pt'
                  ? 'Pesquisar'
                  : 'Search'}
              </button>
            </form>

            {ytResults.length > 0 && (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {ytResults.map((item) => (
                  <div
                    key={item.videoId}
                    className="p-3 rounded-xl bg-[#09090B] border border-white/10 hover:border-[#3B82F6]/50 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CoverImage
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="w-14 h-10 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                        <p className="text-xs text-zinc-400 truncate">
                          {item.author} ·{' '}
                          <span className="font-mono-tabular">
                            {formatDurationMs(item.durationMs)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() =>
                        handleConfirm({
                          title: item.title,
                          artist: item.author || 'YouTube',
                          coverUrl: item.thumbnailUrl,
                          sourceType: 'youtube',
                          sourceRef: item.videoId,
                          durationMs: item.durationMs,
                        })
                      }
                      className="px-3.5 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-50 text-xs font-semibold text-white shrink-0"
                    >
                      {submitting
                        ? '...'
                        : mode === 'add'
                        ? language === 'pt'
                          ? 'Adicionar'
                          : 'Add'
                        : language === 'pt'
                        ? 'Pedir'
                        : 'Request'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-zinc-500">
              {language === 'pt'
                ? 'Cola qualquer link do YouTube ou pesquisa pelo nome da música. Reprodução oficial via YouTube IFrame Player API.'
                : 'Paste any YouTube link or search by song name. Policy-compliant playback via official YouTube IFrame Player API.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
