import { useState } from 'react';
import { Award, Trophy } from 'lucide-react';
import { ACHIEVEMENTS } from '../lib/catalog.ts';
import { t } from '../lib/i18n.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { UserPublic } from '../types/index.ts';
import { CoverImage } from './CoverImage.tsx';

interface RankingViewProps {
  users: UserPublic[];
}

export function RankingView({ users }: RankingViewProps) {
  const language = useAppStore((s) => s.language);
  const publicProfile = useAppStore((s) => s.publicProfile);
  const openUserProfile = useAppStore((s) => s.openUserProfile);

  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');

  const ranked = [...users].sort((a, b) => {
    const scoreA = period === 'weekly' ? a.weeklyPoints || a.points : a.monthlyPoints || a.points;
    const scoreB = period === 'weekly' ? b.weeklyPoints || b.points : b.monthlyPoints || b.points;
    return scoreB - scoreA;
  });

  const myBadges = new Set(publicProfile?.badges || []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      {/* Leaderboard */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
              <Trophy className="w-6 h-6 text-[#8B5CF6]" />
              <span>{t(language, 'ranking')}</span>
            </h2>
            <p className="text-sm text-zinc-400">
              {language === 'pt'
                ? 'Ganha pontos ao criar salas, partilhar músicas e organizar eventos.'
                : 'Earn points by hosting rooms, sharing tracks, and organizing events.'}
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#18181B] border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => setPeriod('weekly')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                period === 'weekly' ? 'bg-[#8B5CF6] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t(language, 'weekly')}
            </button>
            <button
              type="button"
              onClick={() => setPeriod('monthly')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                period === 'monthly' ? 'bg-[#8B5CF6] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t(language, 'monthly')}
            </button>
          </div>
        </div>

        <div className="bg-[#18181B] border border-white/10 rounded-2xl overflow-hidden">
          <div className="divide-y divide-white/10">
            {ranked.map((u, idx) => {
              const pts =
                period === 'weekly' ? u.weeklyPoints || u.points : u.monthlyPoints || u.points;
              return (
                <button
                  key={u.uid}
                  type="button"
                  onClick={() => openUserProfile(u.uid)}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-white/5 text-left transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="w-6 text-sm font-mono-tabular font-bold text-zinc-400">
                      #{idx + 1}
                    </span>
                    <CoverImage
                      src={u.avatarUrl}
                      alt={u.displayName}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{u.displayName}</p>
                      <p className="text-xs text-zinc-400 truncate">
                        @{u.username} · {u.tracksSharedCount || 0}{' '}
                        {language === 'pt' ? 'faixas partilhadas' : 'tracks shared'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-mono-tabular font-bold text-[#8B5CF6]">
                      {pts} pts
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Achievements */}
      <section className="space-y-4">
        <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
          <Award className="w-5 h-5 text-[#EC4899]" />
          <span>{t(language, 'achievements')}</span>
        </h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ACHIEVEMENTS.map((ach) => {
            const unlocked = myBadges.has(ach.id);
            return (
              <div
                key={ach.id}
                className={`p-5 rounded-2xl border transition-colors ${
                  unlocked
                    ? 'bg-[#8B5CF6]/10 border-[#8B5CF6]/40'
                    : 'bg-[#18181B] border-white/10 opacity-65'
                }`}
              >
                <p className="text-xs font-semibold text-[#8B5CF6]">
                  {unlocked
                    ? language === 'pt'
                      ? 'Desbloqueada'
                      : 'Unlocked'
                    : language === 'pt'
                    ? 'Por desbloquear'
                    : 'Locked'}
                </p>
                <h4 className="font-display font-bold text-white mt-1">
                  {language === 'pt' ? ach.titlePt : ach.titleEn}
                </h4>
                <p className="text-xs text-zinc-400 mt-1">
                  {language === 'pt' ? ach.descPt : ach.descEn}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
