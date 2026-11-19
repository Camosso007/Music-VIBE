import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Radio, Users, Disc3, Swords, MessageSquare, ArrowRight } from 'lucide-react';
import { SyncedAudioEngine } from '../lib/audioEngine.ts';
import { STUDIO_IMAGES, STUDIO_SYNTH_CATALOG } from '../lib/catalog.ts';
import { t } from '../lib/i18n.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { CoverImage } from './CoverImage.tsx';

interface LandingPageProps {
  onSignIn: () => void;
  signingIn: boolean;
}

const SHOWCASE_ROOMS = [
  {
    id: 'showcase-lofi',
    name: 'Noite em Tóquio · Lo-Fi Study',
    genre: 'Lo-Fi',
    listeners: 48,
    track: STUDIO_SYNTH_CATALOG[0],
    cover: STUDIO_IMAGES.lofiMidnight,
  },
  {
    id: 'showcase-synth',
    name: 'Horizonte Néon · Synth Club',
    genre: 'Eletrónica',
    listeners: 86,
    track: STUDIO_SYNTH_CATALOG[1],
    cover: STUDIO_IMAGES.synthHorizon,
  },
  {
    id: 'showcase-afro',
    name: 'Lisboa Sunset · Afro-House',
    genre: 'Afrobeats',
    listeners: 63,
    track: STUDIO_SYNTH_CATALOG[2],
    cover: STUDIO_IMAGES.afroGroove,
  },
  {
    id: 'showcase-jazz',
    name: 'Veludo Azul · Neo-Jazz',
    genre: 'Jazz',
    listeners: 31,
    track: STUDIO_SYNTH_CATALOG[3],
    cover: STUDIO_IMAGES.indieSession,
  },
];

export function LandingPage({ onSignIn, signingIn }: LandingPageProps) {
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  const engineRef = useRef<SyncedAudioEngine | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(false);

  const activeShowcase = SHOWCASE_ROOMS[selectedIdx];

  useEffect(() => {
    const engine = new SyncedAudioEngine();
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const toggleDemoPlayback = async (idx?: number) => {
    const targetIdx = typeof idx === 'number' ? idx : selectedIdx;
    const targetRoom = SHOWCASE_ROOMS[targetIdx];
    const shouldPlay = typeof idx === 'number' && idx !== selectedIdx ? true : !demoPlaying;

    setSelectedIdx(targetIdx);
    setDemoPlaying(shouldPlay);

    if (engineRef.current) {
      await engineRef.current.unlock();
      await engineRef.current.syncState(
        {
          id: targetRoom.track.id,
          sourceType: 'synth',
          sourceRef: targetRoom.track.sourceRef,
          durationMs: targetRoom.track.durationMs,
        },
        shouldPlay,
        Date.now() % targetRoom.track.durationMs
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-50 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#09090B]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            VIBE ROOM
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
            <a href="#experience" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              {t(language, 'navExperience')}
            </a>
            <a href="#rooms" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              {t(language, 'navLiveRooms')}
            </a>
            <a href="#features" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              {t(language, 'navFeatures')}
            </a>
            <a href="#community" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              {t(language, 'navCommunity')}
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="px-4 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-60 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              {signingIn ? '...' : t(language, 'signIn')}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split */}
        <section id="experience" className="max-w-7xl mx-auto px-6 py-14 lg:py-20">
          <div className="grid lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between gap-8">
              <div className="space-y-5">
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span>VIBE ROOM</span>
                  <span aria-hidden="true">·</span>
                  <span>{t(language, 'slogan')}</span>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setLanguage(language === 'pt' ? 'en' : 'pt')}
                    className="text-zinc-300 hover:text-white underline underline-offset-4"
                  >
                    {language === 'pt' ? 'EN' : 'PT'}
                  </button>
                </div>

                <h1 className="font-display text-4xl sm:text-5xl lg:text-[54px] font-bold tracking-tight leading-[1.08] text-white text-balance">
                  {t(language, 'heroTitle')}
                </h1>

                <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl">
                  {t(language, 'heroSubtitle')}
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    type="button"
                    onClick={onSignIn}
                    disabled={signingIn}
                    className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>{t(language, 'startListening')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <a
                    href="#rooms"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#18181B] hover:bg-zinc-800 border border-white/10 text-zinc-200 font-medium text-sm transition-colors whitespace-nowrap shrink-0"
                  >
                    {t(language, 'explorePublicRooms')}
                  </a>
                </div>
              </div>

              {/* Interactive Studio Audio Preview Widget */}
              <div className="bg-[#18181B] border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#8B5CF6]">
                      {t(language, 'liveDemoTitle')}
                    </p>
                    <p className="text-sm font-semibold text-white truncate mt-0.5">
                      {activeShowcase.track.title} — {activeShowcase.track.artist}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleDemoPlayback()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    {demoPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{demoPlaying ? t(language, 'pauseDemo') : t(language, 'playDemo')}</span>
                  </button>
                </div>

                <AudioVisualizer engine={engineRef.current} isPlaying={demoPlaying} height={44} />

                <p className="text-xs text-zinc-400">{t(language, 'liveDemoHint')}</p>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[340px] rounded-2xl overflow-hidden border border-white/10 bg-[#18181B]">
                <CoverImage
                  src={STUDIO_IMAGES.heroStudio}
                  alt="VIBE ROOM studio session"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/25 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-zinc-300">
                      {activeShowcase.genre} · {activeShowcase.listeners} ouvintes sincronizados
                    </p>
                    <p className="font-display text-lg font-semibold text-white">
                      {activeShowcase.name}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live Showcase Rooms */}
        <section id="rooms" className="max-w-7xl mx-auto px-6 py-12 border-t border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                {t(language, 'navLiveRooms')}
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                {language === 'pt'
                  ? 'Escolhe uma sala de demonstração para ouvir agora ou cria a tua própria sala ao entrar.'
                  : 'Select a showcase room to preview live audio or create your own upon signing in.'}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SHOWCASE_ROOMS.map((room, idx) => {
              const isSelected = idx === selectedIdx && demoPlaying;
              return (
                <div
                  key={room.id}
                  className="group bg-[#18181B] border border-white/10 hover:border-[#8B5CF6]/50 rounded-2xl overflow-hidden transition-colors flex flex-col"
                >
                  <div className="relative aspect-square overflow-hidden">
                    <CoverImage
                      src={room.cover}
                      alt={room.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <button
                      type="button"
                      onClick={() => toggleDemoPlayback(idx)}
                      className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white flex items-center justify-center shadow-lg transition-colors"
                      aria-label={isSelected ? 'Pause' : 'Play'}
                    >
                      {isSelected ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-xs text-zinc-400">
                        {room.genre} <span aria-hidden="true">·</span>{' '}
                        <span className="font-mono-tabular">{room.listeners}</span> online
                      </p>
                      <h3 className="font-display font-semibold text-white mt-1 line-clamp-1">
                        {room.name}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1 truncate">
                        {room.track.title}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-200 transition-colors"
                    >
                      {t(language, 'joinRoom')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Core Architecture Highlights */}
        <section id="features" className="max-w-7xl mx-auto px-6 py-14 border-t border-white/10">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-3">
              <Radio className="w-5 h-5 text-[#8B5CF6]" />
              <h3 className="font-display text-lg font-semibold text-white">
                01. {language === 'pt' ? 'Sincronização Central' : 'Server-Clock Sync'}
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {language === 'pt'
                  ? 'Relógio WebSocket autoritativo com compensação de latência. Entra a meio de qualquer faixa no segundo exato.'
                  : 'Authoritative WebSocket clock with latency compensation so late joiners land on the exact millisecond.'}
              </p>
            </div>

            <div className="bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-3">
              <Disc3 className="w-5 h-5 text-[#3B82F6]" />
              <h3 className="font-display text-lg font-semibold text-white">
                02. {language === 'pt' ? 'Áudio Multi-Fonte' : 'Multi-Source Audio'}
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {language === 'pt'
                  ? 'Upload direto de MP3/WAV/AAC/M4A/OGG, integração YouTube IFrame API e faixas Web Audio prontas a tocar.'
                  : 'Upload MP3/WAV/AAC/M4A/OGG files, link YouTube IFrame videos, or play studio synth compositions.'}
              </p>
            </div>

            <div className="bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-3">
              <Swords className="w-5 h-5 text-[#EC4899]" />
              <h3 className="font-display text-lg font-semibold text-white">
                03. {language === 'pt' ? 'DJs e Music Battles' : 'DJs & Music Battles'}
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {language === 'pt'
                  ? 'Promove DJs na sala, aceita pedidos musicais dos ouvintes e lança duelos ao vivo com votação instantânea.'
                  : 'Assign room DJs, manage listener track requests, and launch live track battles with real-time voting.'}
              </p>
            </div>

            <div className="bg-[#18181B] border border-white/10 rounded-2xl p-6 space-y-3">
              <MessageSquare className="w-5 h-5 text-[#8B5CF6]" />
              <h3 className="font-display text-lg font-semibold text-white">
                04. {language === 'pt' ? 'Chat, Amigos e Eventos' : 'Chat, Friends & Events'}
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {language === 'pt'
                  ? 'Respostas, menções @username, reações flutuantes, mensagens diretas, grupos e eventos musicais agendados.'
                  : 'Replies, @mentions, floating live reactions, direct messages, friend groups, and scheduled live events.'}
              </p>
            </div>
          </div>
        </section>

        {/* Community CTA */}
        <section id="community" className="max-w-7xl mx-auto px-6 py-14 border-t border-white/10">
          <div className="bg-[#18181B] border border-white/10 rounded-2xl p-8 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Users className="w-4 h-4 text-[#8B5CF6]" />
                <span>VIBE ROOM</span>
                <span aria-hidden="true">·</span>
                <span>{t(language, 'slogan')}</span>
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                {language === 'pt'
                  ? 'Pronto para abrir a tua primeira sala?'
                  : 'Ready to launch your first listening room?'}
              </h2>
              <p className="text-sm text-zinc-400">
                {language === 'pt'
                  ? 'Entra em segundos com a tua conta Google, escolhe os teus géneros favoritos e convida os teus amigos.'
                  : 'Sign in with Google in seconds, pick your favorite genres, and invite your friends.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="px-6 py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
            >
              {t(language, 'signInGoogle')}
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-6">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <span>VIBE ROOM — Your music. Your people. Your vibe.</span>
          <span>{t(language, 'slogan')}</span>
        </div>
      </footer>
    </div>
  );
}
