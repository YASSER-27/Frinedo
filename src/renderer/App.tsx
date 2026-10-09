import { useCallback, useEffect, useRef, useState } from 'react';
import { BotCommand, BotConnectionStatus, ChatMessage } from '@shared/types';
import { getApi } from './api';
import packageJson from '../../package.json';
import AddCommandModal from './components/AddCommandModal';
import SettingsPanel from './components/SettingsModal';
import SkinViewer from './components/SkinViewer';
import skin001Character from '../store/skin001/skin001-character.png';
import skin001Texture from '../store/skin001/skin001-skin.png';
import skin002Character from '../store/skin002/skin002-character.png';
import skin002Texture from '../store/skin002/skin002-skin.png';
import skin003Character from '../store/skin003/skin003-character.png';
import skin003Texture from '../store/skin003/skin003-skin.png';
import skin004Character from '../store/skin004/skin004-character.png';
import skin004Texture from '../store/skin004/skin004-skin.png';
import skin005Character from '../store/skin005/skin005-character.png';
import skin005Texture from '../store/skin005/skin005-skin.png';
import skin006Character from '../store/skin006/skin006-character.png';
import skin006Texture from '../store/skin006/skin006-skin.png';
import skin007Character from '../store/skin007/skin007-character.png';
import skin007Texture from '../store/skin007/skin007-skin.png';
import skin008Character from '../store/skin008/skin008-character.png';
import skin008Texture from '../store/skin008/skin008-skin.png';
import skin009Character from '../store/skin009/skin009-character.png';
import skin009Texture from '../store/skin009/skin009-skin.png';
import skin0010Character from '../store/skin0010/skin0010-character.png';
import skin0010Texture from '../store/skin0010/skin0010-skin.png';

type View = 'home' | 'command' | 'settings' | 'store';
type SkinTarget = 'user' | 'bot1' | 'bot2' | 'bot3' | 'bot4';

const STORE_SKINS = [
  { id: 'skin001', label: 'Skin 001', cover: skin001Character, texture: skin001Texture },
  { id: 'skin002', label: 'Skin 002', cover: skin002Character, texture: skin002Texture },
  { id: 'skin003', label: 'Skin 003', cover: skin003Character, texture: skin003Texture },
  { id: 'skin004', label: 'Skin 004', cover: skin004Character, texture: skin004Texture },
  { id: 'skin005', label: 'Skin 005', cover: skin005Character, texture: skin005Texture },
  { id: 'skin006', label: 'Skin 006', cover: skin006Character, texture: skin006Texture },
  { id: 'skin007', label: 'Skin 007', cover: skin007Character, texture: skin007Texture },
  { id: 'skin008', label: 'Skin 008', cover: skin008Character, texture: skin008Texture },
  { id: 'skin009', label: 'Skin 009', cover: skin009Character, texture: skin009Texture },
  { id: 'skin0010', label: 'Skin 010', cover: skin0010Character, texture: skin0010Texture },
] as const;

const DEFAULT_SKIN_ASSIGNMENTS: Record<SkinTarget, string> = {
  user: 'skin001',
  bot1: 'skin001',
  bot2: 'skin001',
  bot3: 'skin001',
  bot4: 'skin001',
};

function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const numOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numOfChannels * bytesPerSample;
  const dataLength = audioBuffer.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  function writeString(offset: number, value: string): void {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < numOfChannels; channel += 1) {
    channels.push(audioBuffer.getChannelData(channel));
  }

  for (let i = 0; i < audioBuffer.length; i += 1) {
    for (let channel = 0; channel < numOfChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function isOnline(status: BotConnectionStatus): boolean {
  return status === 'connected';
}

function readStoredSkinAssignments(): Record<SkinTarget, string> {
  if (typeof window === 'undefined') return DEFAULT_SKIN_ASSIGNMENTS;
  try {
    const raw = window.localStorage.getItem('frinedo-skin-assignments');
    if (!raw) return DEFAULT_SKIN_ASSIGNMENTS;
    const parsed = JSON.parse(raw) as Partial<Record<SkinTarget, string>>;
    return { ...DEFAULT_SKIN_ASSIGNMENTS, ...parsed };
  } catch {
    return DEFAULT_SKIN_ASSIGNMENTS;
  }
}

export default function App() {
  const [status, setStatus] = useState<BotConnectionStatus>('disconnected');
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [visibleChatCount, setVisibleChatCount] = useState(40);
  const [showChatImages, setShowChatImages] = useState(true);
  const [view, setView] = useState<View>('home');
  const [skinAssignments, setSkinAssignments] = useState<Record<SkinTarget, string>>(readStoredSkinAssignments);
  const [previewSkinId, setPreviewSkinId] = useState<string | null>(null);
  const [imgOk, setImgOk] = useState(true);
  const [gifOk, setGifOk] = useState(true);
  const [homeConnecting, setHomeConnecting] = useState(false);
  const [homeDisconnecting, setHomeDisconnecting] = useState(false);
  const [homeConnectError, setHomeConnectError] = useState('');
  const [updateStatus, setUpdateStatus] = useState<{ status: string; version?: string; percent?: number }>({ status: 'idle' });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    audio.src = '';
    audio.removeAttribute('src');
    audio.load();
    audioRef.current = null;
  }, []);

  const playAudio = useCallback((src: string) => {
    stopAudio();
    const resolved = /^data:|^blob:|^file:|^https?:\/\//i.test(src) ? src : `file://${src.replace(/\\/g, '/')}`;
    const audio = new Audio();
    audio.onended = () => {
      audio.src = '';
      audio.removeAttribute('src');
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
    };
    audio.onerror = () => {
      audio.src = '';
      audio.removeAttribute('src');
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
    };
    audio.src = resolved;
    audio.preload = 'auto';
    audio.volume = 1;
    audioRef.current = audio;
    audio.load();
    void audio.play().catch((error) => {
      setMessages((prev) => [...prev, {
        id: `audio-play-error-${Date.now()}`,
        timestamp: Date.now(),
        sender: 'System',
        text: `Audio playback failed: ${error instanceof Error ? error.message : String(error)}`,
        isBot: false,
      }].slice(-200));
    });
  }, [stopAudio]);

  const online = isOnline(status);
  const gifSrc = online ? './stive.webp' : './offline.webp';
  const botCover = `./Bot_${(messages.filter((message) => message.isBot).length % 3) + 1}.png`;
  const chatCover = messages.some((message) => message.isBot) ? botCover : './System.png';

  const resolveSkinAvatar = useCallback((target: SkinTarget): string => {
    const selected = skinAssignments[target] ?? DEFAULT_SKIN_ASSIGNMENTS[target];
    const skin = STORE_SKINS.find((entry) => entry.id === selected);
    return skin?.cover ?? './user.png';
  }, [skinAssignments]);

  useEffect(() => {
    window.localStorage.setItem('frinedo-skin-assignments', JSON.stringify(skinAssignments));
  }, [skinAssignments]);


  const loadCommands = useCallback(async () => {
    setCommands(await getApi().commands.getAll());
  }, []);

  useEffect(() => {
    const api = getApi();
    const maxChatMessages = 200;

    void loadCommands();
    void api.bot.getStatus().then(({ status: s, history }) => {
      setStatus(s);
      setMessages(history.slice(-maxChatMessages));
    });
    const unsubStatus = api.bot.onStatusChanged(({ status: s }) => setStatus(s));
    const unsubChat = api.chat.onMessage((msg) => {
      setMessages((prev) => {
        const next = prev.some((entry) => entry.id === msg.id) ? prev : [...prev, msg];
        return next.slice(-maxChatMessages);
      });
    });
    const unsubTts = api.tts.onPlay((audioPath) => {
      void (async () => {
        const data = /^data:audio\//i.test(audioPath)
          ? audioPath
          : await getApi().tts.readAudio(audioPath);
        if (!data) {
          setMessages((prev) => [...prev, {
            id: `audio-error-${Date.now()}`,
            timestamp: Date.now(),
            sender: 'System',
            text: `Audio file could not be read: ${audioPath}`,
            isBot: false,
          }].slice(-maxChatMessages));
          return;
        }
        playAudio(data);
      })();
    });
    const unsubUpdates = api.updates.onStatus((data) => setUpdateStatus(data));
    void api.updates.check();
    return () => {
      stopAudio();
      unsubStatus();
      unsubChat();
      unsubTts();
      unsubUpdates();
    };
  }, [loadCommands, playAudio, stopAudio]);

  const toggle = (next: View) => {
    setView((current) => (current === next ? 'home' : next));
  };

  const clearChat = async () => {
    await getApi().chat.clear();
    setMessages([]);
    setVisibleChatCount(40);
  };

  const disconnectFromHome = async () => {
    setHomeDisconnecting(true);
    setHomeConnectError('');
    try {
      await getApi().bot.disconnect();
    } finally {
      setHomeDisconnecting(false);
    }
  };

  const connectToServer = async (settings: Awaited<ReturnType<typeof getApi>['settings']['get']>) => {
      if (!settings.port || settings.port < 1 || settings.port > 65535) {
        throw new Error('Enter the Minecraft LAN port in Settings first.');
      }
      return getApi().bot.connect(settings);
  };

  const connectFromHome = async () => {
    if (online) {
      await disconnectFromHome();
      return;
    }

    setHomeConnecting(true);
    setHomeConnectError('');
    try {
      const settings = await getApi().settings.get();
      await connectToServer(settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not connect to the Minecraft server.';
      setHomeConnectError(message.replace(/^Error invoking remote method [^:]+:\s*Error:\s*/i, ''));
      setView('settings');
    } finally {
      setHomeConnecting(false);
    }
  };

  const updateAction = async () => {
    if (updateStatus.status === 'downloaded') return getApi().updates.install();
    if (updateStatus.status !== 'available' && updateStatus.status !== 'downloading') {
      const result = await getApi().updates.check();
      if (!result.available) {
        setUpdateStatus({ status: 'not-available' });
        return;
      }
    }
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
          <button className={`chat-brand ${showChatImages ? '' : 'images-hidden'}`} type="button" onClick={() => setShowChatImages((visible) => !visible)} aria-label="Toggle chat images">
            {showChatImages && <img src={chatCover} alt="" draggable={false} />}
            {!showChatImages && <span>Show images</span>}
          </button>
          <div className="chat-history-controls">
            {messages.length > visibleChatCount && (
              <button type="button" onClick={() => setVisibleChatCount((count) => count + 40)}>Show more</button>
            )}
          </div>
          <h3>Chat</h3>
          {messages.length === 0 && <p>No messages yet. In game type menu for the command list.</p>}
          {messages.slice(Math.max(0, messages.length - visibleChatCount)).map((m, index) => {
            const isSystem = m.sender === 'System';
            const senderLower = m.sender.toLowerCase();
            const avatar = isSystem
              ? './System.png'
              : m.isBot
                ? senderLower.includes('bot4') || senderLower.includes('4')
                  ? resolveSkinAvatar('bot4')
                  : senderLower.includes('bot3') || senderLower.includes('3')
                    ? resolveSkinAvatar('bot3')
                    : senderLower.includes('bot2') || senderLower.includes('2')
                      ? resolveSkinAvatar('bot2')
                      : senderLower.includes('bot1') || senderLower.includes('1')
                        ? resolveSkinAvatar('bot1')
                        : resolveSkinAvatar('bot1')
                : resolveSkinAvatar('user');
            return (
              <p key={m.id} className={`chat-message ${m.isBot ? 'bot' : 'me'} ${isSystem ? 'system' : ''}`}>
                {avatar && showChatImages && <img className="chat-message-avatar" src={avatar} alt="" draggable={false} />}
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
              <button className="home-connect" type="button" onClick={() => void connectFromHome()} disabled={homeConnecting || homeDisconnecting}>
                {homeConnecting ? 'Connecting...' : homeDisconnecting ? 'Disconnecting...' : online ? 'Disconnect' : 'Connect'}
              </button>
              <button className="home-update" type="button" onClick={() => void updateAction()} disabled={updateStatus.status === 'downloading'}>
                {updateStatus.status === 'downloading' ? `Updating ${Math.round(updateStatus.percent ?? 0)}%` : updateStatus.status === 'downloaded' ? 'Restart to update' : `Update ${updateStatus.version ?? ''}`}
              </button>
              <div className="home-voice-controls" />
              <div className="app-version-button">v{packageJson.version}</div>
              {homeConnectError && <div className="home-connect-error">{homeConnectError}</div>}
            </div>
          )}
          {view === 'settings' && (
            <SettingsPanel status={status} onStatusChange={setStatus} onConnect={connectToServer} />
          )}
          {view === 'command' && (
            <AddCommandModal commands={commands} onSaved={loadCommands} />
          )}
          {view === 'store' && (
            <div className="panel-view store-panel">
              <div className="store-header">
                <div className="section-label">
                  <span>Store</span>
                </div>
              </div>

              <div className="store-grid">
                {STORE_SKINS.map((skin) => (
                  <div
                    key={skin.id}
                    className="store-card"
                  >
                    <div className="skin-image-stage">
                      {previewSkinId === skin.id ? (
                        <SkinViewer skinUrl={skin.texture} />
                      ) : (
                        <img src={skin.cover} alt={skin.label} draggable={false} />
                      )}
                    </div>
                    <div className="store-card-meta">
                      <strong>{skin.label}</strong>
                      <span>Skin texture PNG</span>
                    </div>
                    <div className="skin-card-actions">
                      <button
                        type="button"
                        className="skin-view-button"
                        onClick={() => setPreviewSkinId((current) => current === skin.id ? null : skin.id)}
                        aria-label={`View ${skin.label}`}
                        title={`View ${skin.label}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                          <circle cx="12" cy="12" r="2.5" />
                        </svg>
                        View
                      </button>
                      <a className="skin-download" href={skin.texture} download={`${skin.id}-skin.png`}>
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
        <button
          type="button"
          className={view === 'store' ? 'active' : ''}
          onClick={() => toggle('store')}
        >
          Store
        </button>
      </nav>
    </div>
  );
}
