import { useState, useEffect } from 'react';
import { AppSettings, BotConnectionStatus } from '@shared/types';

interface Props {
  status: BotConnectionStatus;
  onStatusChange: (status: BotConnectionStatus) => void;
}

export default function ServerSettings({ status, onStatusChange }: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    host: 'localhost',
    port: 25565,
    username: 'BotPlayer',
    supertonicPath: '',
    muted: false,
      voiceHelpEnabled: false,
      voiceHelpVoice: 'M2',
      voiceHelpLanguage: 'en',
      botPlayers: ['BotPlayer'],
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.electronAPI.settings.get().then(setSettings);
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const saveSettings = async () => {
    await window.electronAPI.settings.save(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      await window.electronAPI.settings.save(settings);
      const newStatus = await window.electronAPI.bot.connect(settings);
      onStatusChange(newStatus);
    } catch {
      onStatusChange('error');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const newStatus = await window.electronAPI.bot.disconnect();
      onStatusChange(newStatus);
    } finally {
      setLoading(false);
    }
  };

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <div>
      <div className="form-group">
        <label>Host</label>
        <input
          type="text"
          value={settings.host}
          onChange={(e) => update({ host: e.target.value })}
          disabled={isConnected || isConnecting}
          placeholder="localhost"
        />
      </div>

      <div className="form-group">
        <label>Port</label>
        <input
          type="number"
          value={settings.port}
          onChange={(e) => update({ port: Number(e.target.value) })}
          disabled={isConnected || isConnecting}
          placeholder="25565"
        />
      </div>

      <div className="form-group">
        <label>Username</label>
        <input
          type="text"
          value={settings.username}
          onChange={(e) => update({ username: e.target.value })}
          disabled={isConnected || isConnecting}
          placeholder="BotPlayer"
        />
      </div>

      <hr className="section-divider" />

      <div className="form-group">
        <label>Supertonic Path</label>
        <input
          type="text"
          value={settings.supertonicPath}
          onChange={(e) => update({ supertonicPath: e.target.value })}
          placeholder="Path to tts folder"
        />
      </div>

      <div className="checkbox-row">
        <input
          type="checkbox"
          id="muted"
          checked={settings.muted}
          onChange={(e) => update({ muted: e.target.checked })}
        />
        <label htmlFor="muted">Mute voice responses</label>
      </div>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={saveSettings}>
          Save Settings
        </button>
        {saved && <span style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>Saved!</span>}
      </div>

      <hr className="section-divider" />

      <div className="btn-row">
        {!isConnected ? (
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={loading || isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        ) : (
          <button
            className="btn btn-danger"
            onClick={handleDisconnect}
            disabled={loading}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
