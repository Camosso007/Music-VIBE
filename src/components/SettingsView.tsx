import { useState } from 'react';
import { toggleBlockUser, updatePrivateSettings } from '../lib/firestoreService.ts';
import { t } from '../lib/i18n.ts';
import { useAppStore } from '../store/useAppStore.ts';
import { UserPublic } from '../types/index.ts';

interface SettingsViewProps {
  users: UserPublic[];
}

export function SettingsView({ users }: SettingsViewProps) {
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const privateProfile = useAppStore((s) => s.privateProfile);
  const setProfiles = useAppStore((s) => s.setProfiles);
  const publicProfile = useAppStore((s) => s.publicProfile);
  const setVolume = useAppStore((s) => s.setVolume);
  const addToast = useAppStore((s) => s.addToast);

  const [privacyShowRoom, setPrivacyShowRoom] = useState(
    privateProfile?.privacyShowRoom ?? true
  );
  const [privacyAllowDm, setPrivacyAllowDm] = useState(privateProfile?.privacyAllowDm ?? true);
  const [notifyFriendRooms, setNotifyFriendRooms] = useState(
    privateProfile?.notifyFriendRooms ?? true
  );
  const [notifyEvents, setNotifyEvents] = useState(privateProfile?.notifyEvents ?? true);
  const [defaultVolume, setDefaultVolume] = useState(privateProfile?.defaultVolume ?? 0.75);
  const [autoPartyMode, setAutoPartyMode] = useState(privateProfile?.autoPartyMode ?? false);
  const [saving, setSaving] = useState(false);

  if (!privateProfile || !publicProfile) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePrivateSettings(privateProfile.uid, {
        languagePref: language,
        privacyShowRoom,
        privacyAllowDm,
        notifyFriendRooms,
        notifyEvents,
        defaultVolume,
        autoPartyMode,
      });
      setVolume(defaultVolume);
      setProfiles(
        publicProfile,
        {
          ...privateProfile,
          languagePref: language,
          privacyShowRoom,
          privacyAllowDm,
          notifyFriendRooms,
          notifyEvents,
          defaultVolume,
          autoPartyMode,
        },
        false
      );
      addToast(
        language === 'pt' ? 'Definições guardadas!' : 'Settings saved!',
        'success'
      );
    } finally {
      setSaving(false);
    }
  };

  const blockedUsers = (privateProfile.blockedUids || []).map((uid) => ({
    uid,
    name: users.find((u) => u.uid === uid)?.displayName || uid,
  }));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">
            {t(language, 'settings')}
          </h2>
          <p className="text-sm text-zinc-400">
            {language === 'pt'
              ? 'Conta, privacidade, notificações, áudio e aparência.'
              : 'Account, privacy, notifications, audio, and appearance.'}
          </p>
        </div>

        {/* Account & Language */}
        <section className="bg-[#18181B] border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="font-display text-base font-semibold text-white">
            {language === 'pt' ? 'Conta e Idioma' : 'Account & Language'}
          </h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-zinc-400 block">Email</span>
              <span className="text-zinc-200">{privateProfile.email}</span>
            </div>
            <div>
              <span className="text-xs text-zinc-400 block mb-1">
                {language === 'pt' ? 'Idioma da interface' : 'Interface language'}
              </span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'pt' | 'en')}
                className="w-full px-3 py-2 rounded-xl bg-[#09090B] border border-white/10 text-sm text-white"
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </section>

        {/* Privacy & Notifications */}
        <section className="bg-[#18181B] border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-display text-base font-semibold text-white">
            {language === 'pt' ? 'Privacidade e Notificações' : 'Privacy & Notifications'}
          </h3>

          <label className="flex items-center justify-between py-1.5 text-sm text-zinc-300 cursor-pointer">
            <span>
              {language === 'pt'
                ? 'Mostrar aos amigos em que sala estou'
                : 'Show friends which room I am in'}
            </span>
            <input
              type="checkbox"
              checked={privacyShowRoom}
              onChange={(e) => setPrivacyShowRoom(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between py-1.5 text-sm text-zinc-300 cursor-pointer">
            <span>
              {language === 'pt'
                ? 'Permitir mensagens privadas de outros utilizadores'
                : 'Allow direct messages from other users'}
            </span>
            <input
              type="checkbox"
              checked={privacyAllowDm}
              onChange={(e) => setPrivacyAllowDm(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between py-1.5 text-sm text-zinc-300 cursor-pointer">
            <span>
              {language === 'pt'
                ? 'Notificar quando um amigo cria uma sala'
                : 'Notify when a friend creates a room'}
            </span>
            <input
              type="checkbox"
              checked={notifyFriendRooms}
              onChange={(e) => setNotifyFriendRooms(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between py-1.5 text-sm text-zinc-300 cursor-pointer">
            <span>
              {language === 'pt'
                ? 'Notificar sobre eventos musicais inscritos'
                : 'Notify about registered music events'}
            </span>
            <input
              type="checkbox"
              checked={notifyEvents}
              onChange={(e) => setNotifyEvents(e.target.checked)}
            />
          </label>
        </section>

        {/* Audio & Appearance */}
        <section className="bg-[#18181B] border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="font-display text-base font-semibold text-white">
            {language === 'pt' ? 'Áudio e Aparência' : 'Audio & Appearance'}
          </h3>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span>{language === 'pt' ? 'Volume inicial por defeito' : 'Default volume'}</span>
              <span className="font-mono-tabular">{Math.round(defaultVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={defaultVolume}
              onChange={(e) => setDefaultVolume(Number(e.target.value))}
              className="w-full accent-[#8B5CF6]"
            />
          </div>

          <label className="flex items-center justify-between py-1 text-sm text-zinc-300 cursor-pointer">
            <span>
              {language === 'pt'
                ? 'Preferir efeitos visuais no Modo Festa'
                : 'Prefer enhanced Party Mode visuals'}
            </span>
            <input
              type="checkbox"
              checked={autoPartyMode}
              onChange={(e) => setAutoPartyMode(e.target.checked)}
            />
          </label>
        </section>

        {/* Blocked Users */}
        <section className="bg-[#18181B] border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-display text-base font-semibold text-white">
            {language === 'pt' ? 'Utilizadores Bloqueados' : 'Blocked Users'}
          </h3>
          {blockedUsers.length === 0 ? (
            <p className="text-xs text-zinc-500">
              {language === 'pt' ? 'Nenhum utilizador bloqueado.' : 'No blocked users.'}
            </p>
          ) : (
            <div className="space-y-2">
              {blockedUsers.map((b) => (
                <div key={b.uid} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-200">{b.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleBlockUser(publicProfile.uid, b.uid, true)}
                    className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-zinc-200"
                  >
                    {language === 'pt' ? 'Desbloquear' : 'Unblock'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-sm font-semibold text-white transition-colors"
        >
          {saving ? '...' : t(language, 'saveChanges')}
        </button>
      </form>
    </div>
  );
}
