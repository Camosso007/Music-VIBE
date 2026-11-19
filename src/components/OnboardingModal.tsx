import { useState } from 'react';
import { User } from 'firebase/auth';
import { Disc3 } from 'lucide-react';
import { MUSIC_GENRES, PROFILE_ACCENTS } from '../lib/catalog.ts';
import { completeUserOnboarding } from '../lib/firestoreService.ts';
import { useAppStore } from '../store/useAppStore.ts';

interface OnboardingModalProps {
  firebaseUser: User;
}

export function OnboardingModal({ firebaseUser }: OnboardingModalProps) {
  const language = useAppStore((s) => s.language);
  const setProfiles = useAppStore((s) => s.setProfiles);
  const addToast = useAppStore((s) => s.addToast);

  const defaultUsername = (firebaseUser.email?.split('@')[0] || 'viber')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20);

  const [username, setUsername] = useState(defaultUsername);
  const [displayName, setDisplayName] = useState(firebaseUser.displayName || 'Listener');
  const [country, setCountry] = useState('Portugal');
  const [bio, setBio] = useState('');
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>(['Lo-Fi', 'Eletrónica']);
  const [themeColor, setThemeColor] = useState('#8B5CF6');
  const [saving, setSaving] = useState(false);

  const toggleGenre = (genre: string) => {
    setFavoriteGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre].slice(0, 6)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !displayName.trim()) return;
    setSaving(true);
    try {
      const { pub, priv } = await completeUserOnboarding(firebaseUser, {
        username,
        displayName,
        country,
        bio,
        favoriteGenres: favoriteGenres.length > 0 ? favoriteGenres : ['Lo-Fi'],
        themeColor,
        languagePref: language,
      });
      setProfiles(pub, priv, false);
      addToast(
        language === 'pt' ? 'Perfil configurado! Bem-vindo ao VIBE ROOM.' : 'Profile ready! Welcome to VIBE ROOM.',
        'success'
      );
    } catch {
      addToast(
        language === 'pt' ? 'Erro ao guardar perfil. Tenta novamente.' : 'Failed to save profile.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-[#18181B] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6 my-8"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center">
            <Disc3 className="w-5 h-5 text-[#8B5CF6]" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              {language === 'pt' ? 'Configura o teu perfil musical' : 'Set up your music profile'}
            </h2>
            <p className="text-xs text-zinc-400">
              {language === 'pt'
                ? 'Personaliza a tua identidade e escolhe os teus géneros favoritos.'
                : 'Customize your handle and pick your favorite genres.'}
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              {language === 'pt' ? 'Nome de utilizador (@)' : 'Username (@)'}
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={30}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              placeholder="teu_username"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              {language === 'pt' ? 'Nome de apresentação' : 'Display name'}
            </label>
            <input
              type="text"
              required
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              {language === 'pt' ? 'País' : 'Country'}
            </label>
            <input
              type="text"
              maxLength={60}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              {language === 'pt' ? 'Cor de destaque' : 'Theme accent'}
            </label>
            <div className="flex items-center gap-2.5 h-10">
              {PROFILE_ACCENTS.map((acc) => (
                <button
                  key={acc.value}
                  type="button"
                  onClick={() => setThemeColor(acc.value)}
                  style={{ backgroundColor: acc.value }}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    themeColor === acc.value ? 'ring-2 ring-white scale-110' : 'opacity-65 hover:opacity-100'
                  }`}
                  aria-label={acc.name}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">
            {language === 'pt' ? 'Biografia curta' : 'Short bio'}
          </label>
          <input
            type="text"
            maxLength={200}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={
              language === 'pt'
                ? 'DJ de quarto, apaixonado por vinil e sessões nocturnas...'
                : 'Bedroom DJ, vinyl lover and late-night listener...'
            }
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-300">
            {language === 'pt' ? 'Géneros musicais favoritos (até 6)' : 'Favorite genres (up to 6)'}
          </label>
          <div className="flex flex-wrap gap-2">
            {MUSIC_GENRES.map((genre) => {
              const active = favoriteGenres.includes(genre);
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggleGenre(genre)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    active
                      ? 'bg-[#8B5CF6] border-[#8B5CF6] text-white'
                      : 'bg-[#09090B] border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-60 text-white font-semibold text-sm transition-colors"
        >
          {saving
            ? '...'
            : language === 'pt'
            ? 'Entrar no VIBE ROOM'
            : 'Enter VIBE ROOM'}
        </button>
      </form>
    </div>
  );
}
