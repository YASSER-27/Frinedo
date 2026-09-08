import { useCallback, useEffect, useRef, useState } from 'react';
import { BotCommand, BotConnectionStatus, ChatMessage } from '@shared/types';
import { getApi } from './api';
import AddCommandModal from './components/AddCommandModal';
import SettingsPanel from './components/SettingsModal';

type View = 'home' | 'command' | 'settings';

function isOnline(status: BotConnectionStatus): boolean {
  return status === 'connected';
}

export default function App() {
  const [status, setStatus] = useState<BotConnectionStatus>('disconnected');
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [view, setView] = useState<View>('home');
  const [imgOk, setImgOk] = useState(true);
  const [gifOk, setGifOk] = useState(true);
  const [homeConnecting, setHomeConnecting] = useState(false);
  const [homeConnectError, setHomeConnectError] = useState('');
  const [updateStatus, setUpdateStatus] = useState<{ status: string; version?: string; percent?: number }>({ status: 'idle' });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const online = isOnline(status);
  const gifSrc = online ? './online.gif' : './offline.gif';
  const botCover = `./Bot_${(messages.filter((message) => message.isBot).length % 3) + 1}.png`;
  const chatCover = messages.some((message) => message.isBot) ? botCover : './System.png';

  const loadCommands = useCallback(async () => {
    setCommands(await getApi().commands.getAll());
  }, []);

  useEffect(() => {
    const api = getApi();
    void loadCommands();
    void api.bot.getStatus().then(({ status: s, history }) => {
      setStatus(s);
      setMessages(history);
    });
    const unsubStatus = api.bot.onStatusChanged(({ status: s }) => setStatus(s));
    const unsubChat = api.chat.onMessage((msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    const unsubTts = api.tts.onPlay((audioPath) => {
      void (async () => {
        if (audioRef.current) audioRef.current.pause();
        const data = await getApi().tts.readAudio(audioPath);
        const audio = new Audio(data ?? `file://${audioPath.replace(/\\/g, '/')}`);
        audioRef.current = audio;
        void audio.play().catch(() => {});
      })();
    });
    const unsubUpdates = api.updates.onStatus((data) => setUpdateStatus(data));
    void api.updates.check();
    return () => {
      unsubStatus();
      unsubChat();
      unsubTts();
      unsubUpdates();
    };
  }, [loadCommands]);

  const toggle = (next: View) => {
    setView((current) => (current === next ? 'home' : next));
  };

  const clearChat = async () => {
    await getApi().chat.clear();
    setMessages([]);
  };

  const connectFromHome = async () => {
    setHomeConnecting(true);
    setHomeConnectError('');
    try {
      const settings = await getApi().settings.get();
      if (!settings.port || settings.port < 1 || settings.port > 65535) {
        throw new Error('Enter the Minecraft LAN port in Settings first.');
      }
      await getApi().bot.connect(settings);
    } catch (error) {
      setHomeConnectError(error instanceof Error ? error.message : 'Could not connect. Enter the LAN port in Settings.');
      setView('settings');
    } finally {
      setHomeConnecting(false);
    }
  };

  const updateAvailable = updateStatus.status === 'available' || updateStatus.status === 'downloaded' || updateStatus.status === 'downloading';
  const updateAction = async () => {
    if (updateStatus.status === 'downloaded') return getApi().updates.install();
    await getApi().updates.download();
  };

  return (
    <div className="app">
      <header className="titlebar">
        <span className="titlebar-drag">Frinedo</span>
        <button type="button" className="win-minimize" aria-label="Minimize" onClick={() => void getApi().window.minimize()}>
          −
        </button>
        <button type="button" className="win-close" onClick={() => void getApi().window.close()}>
          ×
        </button>
      </header>

      <section className="stage">
        <aside className="chat-panel">
          <div className="chat-brand">
            <img src={chatCover} alt="" draggable={false} />
          </div>
          <h3>Chat</h3>
          {messages.length === 0 && <p>No messages yet. In game type menu for the command list.</p>}
          {messages.slice(-40).map((m, index) => {
            const isSystem = m.sender === 'System';
            const senderLower = m.sender.toLowerCase();
            const avatar = isSystem
              ? './System.png'
              : m.isBot
                ? senderLower.includes('bot4') || senderLower.includes('4')
                  ? './Bot_4.png'
                  : `./Bot_${(index % 4) + 1}.png`
                : null;
            return (
              <p key={m.id} className={`chat-message ${m.isBot ? 'bot' : 'me'} ${isSystem ? 'system' : ''}`}>
                {avatar && <img className="chat-message-avatar" src={avatar} alt="" draggable={false} />}
                <span><strong>{m.sender}</strong> {m.text}</span>
              </p>
            );
          })}
        </aside>
        <div className="hero">
          {view === 'home' && (
            <div className="home-hero">
              {imgOk ? (
                <img className="steve" src="./stive.png" alt="Steve" draggable={false} onError={() => setImgOk(false)} />
              ) : (
                <div className="hint">Put stive.png in src/public</div>
              )}
              <button className="home-connect" type="button" onClick={() => void connectFromHome()} disabled={homeConnecting || online}>
                {homeConnecting ? 'Connecting...' : online ? 'Connected' : 'Connect'}
              </button>
              {updateAvailable && <button className="home-update" type="button" onClick={() => void updateAction()} disabled={updateStatus.status === 'downloading'}>
                {updateStatus.status === 'downloading' ? `Updating ${Math.round(updateStatus.percent ?? 0)}%` : updateStatus.status === 'downloaded' ? 'Restart to update' : `Update ${updateStatus.version ?? ''}`}
              </button>}
              {homeConnectError && <div className="home-connect-error">{homeConnectError}</div>}
            </div>
          )}
          {view === 'settings' && (
            <SettingsPanel status={status} onStatusChange={setStatus} />
          )}
          {view === 'command' && (
            <AddCommandModal commands={commands} onSaved={loadCommands} />
          )}
        </div>
      </section>

      <nav className="dock">
        <div className={`status-btn ${online ? 'online' : 'offline'}`}>
          {gifOk && (
            <img src={gifSrc} alt="" draggable={false} onError={() => setGifOk(false)} />
          )}
          <span>{online ? 'Online' : 'Offline'}</span>
        </div>
        <button type="button" onClick={() => void clearChat()}>
          Clear bot chat
        </button>
        <button
          type="button"
          className={view === 'command' ? 'active' : ''}
          onClick={() => toggle('command')}
        >
          Add command
        </button>
        <button
          type="button"
          className={view === 'settings' ? 'active' : ''}
          onClick={() => toggle('settings')}
        >
          Settings
        </button>
      </nav>
    </div>
  );
}
