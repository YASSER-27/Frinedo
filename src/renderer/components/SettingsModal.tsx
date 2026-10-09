import { useEffect, useState } from 'react';
import { AppSettings, BotConnectionStatus, TTS_VOICES } from '@shared/types';
import { getApi } from '../api';

interface Props {
  status: BotConnectionStatus;
  onStatusChange: (status: BotConnectionStatus) => void;
  onConnect: (settings: AppSettings) => Promise<BotConnectionStatus>;
}

export default function SettingsPanel({ status, onStatusChange, onConnect }: Props) {
  const [activeSection, setActiveSection] = useState<'connection' | 'bots' | 'voice'>('connection');
  const [settings, setSettings] = useState<AppSettings>({
    host: '127.0.0.1',
    port: 25565,
    username: 'SteveBot',
    version: '',
    muted: false,
    voiceHelpEnabled: false,
    voiceHelpVoice: 'M2',
    voiceHelpLanguage: 'en',
    botPlayers: ['', '', '', ''],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    void getApi().settings.get().then((loaded) => {
      setSettings(loaded);
      setHasLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;

    const timeout = setTimeout(() => {
      void getApi().settings.save(settings);
    }, 150);

    return () => clearTimeout(timeout);
  }, [settings, hasLoaded]);

  const update = (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const selectedBots = settings.botPlayers ?? ['', '', '', ''];
  const isBotEnabled = (index: number) => Boolean(selectedBots[index]?.trim());
  const toggleBot = (index: number, enabled: boolean) => {
    const names = [...selectedBots];
    if (enabled) {
      const base = index === 0 ? 'Bot1' : `Bot${index + 1}`;
      names[index] = names[index]?.trim() || base;
    } else {
      names[index] = '';
    }
    update({ botPlayers: names });
  };

  const save = () => getApi().settings.save(settings);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      await save();
      onStatusChange(await onConnect(settings));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onStatusChange('error');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      onStatusChange(await getApi().bot.disconnect());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-view settings-panel">
      <nav className="settings-tabs" aria-label="Settings sections">
        <button className={activeSection === 'connection' ? 'active' : ''} onClick={() => setActiveSection('connection')}>
          Bot name / Version / Host
        </button>
        <button className={activeSection === 'bots' ? 'active' : ''} onClick={() => setActiveSection('bots')}>
          Bot player list (maximum 4)
        </button>
        <button className={activeSection === 'voice' ? 'active' : ''} onClick={() => setActiveSection('voice')}>
          Voice help
        </button>
      </nav>

      {activeSection === 'connection' && <section className="settings-nav" aria-label="Connection settings">
        <div className="settings-card">
          <label>Bot name</label>
          <input value={settings.username} onChange={(e) => update({ username: e.target.value })} />
        </div>
        <div className="settings-card">
          <label>Minecraft version</label>
          <input
            value={settings.version ?? ''}
            onChange={(e) => update({ version: e.target.value })}
            placeholder="Auto-detect"
          />
        </div>
        <div className="settings-card settings-host-card">
          <label>Host</label>
          <input value={settings.host} onChange={(e) => update({ host: e.target.value })} />
          <div className="settings-port">
            <label>Port</label>
            <input type="number" value={settings.port} onChange={(e) => update({ port: Number(e.target.value) })} />
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.muted} onChange={(e) => update({ muted: e.target.checked })} />
            Mute voice lines
          </label>
        </div>
      </section>}

      {activeSection === 'voice' && <section className="voice-help-settings">
        <div className="section-label">Voice help</div>
        <label className="check">
          <input type="checkbox" checked={settings.voiceHelpEnabled} onChange={(e) => update({ voiceHelpEnabled: e.target.checked })} />
          Enable voice help
        </label>
        <div className="voice-help-options">
          <label>Voice
            <select value={settings.voiceHelpVoice} onChange={(e) => update({ voiceHelpVoice: e.target.value })} disabled={!settings.voiceHelpEnabled}>
              {TTS_VOICES.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
            </select>
          </label>
          <label>Language
            <select value={settings.voiceHelpLanguage} onChange={(e) => update({ voiceHelpLanguage: e.target.value as 'en' | 'ar' })} disabled={!settings.voiceHelpEnabled}>
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </label>
        </div>
      </section>}

      {activeSection === 'bots' && <section className="bot-list-settings">
        <div className="section-label">Bot player list (maximum 4)</div>
        {[0, 1, 2, 3].map((index) => (
          <div className={`bot-slot ${isBotEnabled(index) ? 'selected' : ''}`} key={index}>
            <label className="bot-check"><input type="checkbox" checked={isBotEnabled(index)} onChange={(e) => toggleBot(index, e.target.checked)} /> <img src={`./Bot_${index + 1}.png`} alt="" draggable={false} /> <span>Bot {index + 1}</span></label>
            {isBotEnabled(index) && <input
              value={selectedBots[index] ?? ''}
              placeholder={`Bot${index + 1}`}
              onChange={(e) => {
                const names = [...selectedBots];
                names[index] = e.target.value;
                update({ botPlayers: names });
              }}
            />}
          </div>
        ))}
      </section>}

      {error && <div className="voice-bad">{error}</div>}

      <div className="actions settings-actions">
        {status === 'connected' ? (
          <button className="btn danger" onClick={() => void disconnect()} disabled={busy}>
            Disconnect
          </button>
        ) : (
          <button className="btn primary" onClick={() => void connect()} disabled={busy}>
            {busy || status === 'connecting' ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}
