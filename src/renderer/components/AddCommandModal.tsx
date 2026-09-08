import { useEffect, useMemo, useRef, useState } from 'react';
import { BotCommand, TTS_VOICES } from '@shared/types';
import { EXAMPLE_TRIGGERS, parseChat } from '@shared/parseCommand';
import { getApi } from '../api';

interface Props {
  onSaved: () => void;
  commands: BotCommand[];
}

function Icon({ name }: { name: 'upload' | 'play' | 'spark' | 'trash' | 'cancel' | 'save' | 'voice' }) {
  const paths = {
    upload: 'M12 16V4m0 0L7 9m5-5 5 5M5 15v4h14v-4',
    play: 'M8 5v14l11-7z',
    spark: 'M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z',
    trash: 'M5 7h14M10 11v6m4-6v6M8 7l1-3h6l1 3m-9 0 1 14h10l1-14',
    cancel: 'M6 6l12 12M18 6 6 18',
    save: 'M5 4h11l3 3v13H5zM8 4v6h8V4M8 20v-6h8v6',
    voice: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3m-4 0h8',
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}

const BUILTIN_SLUGS: Record<string, string> = {
  'show me': 'show-me', 'run away': 'run-away', sleep: 'sleep', 'find village': 'find-village',
  'find dog': 'find-dog', 'find cat': 'find-cat', 'find horse': 'find-horse', 'find camel': 'find-camel',
  'save house': 'save-house', 'save me': 'save-me', 'how do I craft a sword': 'how-craft-sword',
  'follow me': 'follow-me', 'follow me and help me': 'follow-me-help', 'stop here': 'stop-here', stop: 'stop',
  'come here': 'come-here', 'give me everything': 'give-everything', 'give me a sword': 'give-sword',
  'give me armor': 'give-armor', 'give me food': 'give-food', 'give me a boat': 'give-boat',
  'bring me 10 wood': 'bring-wood', 'bring me 16 stone': 'bring-stone', 'search for diamond': 'search-diamond',
  'search for gold': 'search-gold', 'create a furnace': 'create-furnace', 'craft a crafting table': 'craft-table',
  'go fishing': 'go-fishing', 'find treasure': 'find-treasure', 'find chest': 'find-chest', 'ride with me': 'ride-with-me',
  'kill this': 'kill-this', 'tame dog': 'tame-dog', 'tame cat': 'tame-cat', 'farm crops': 'farm-crops',
  'plant seeds': 'plant-seeds', 'harvest crops': 'harvest-crops', 'bring me sand': 'bring-sand',
  'bring me cobblestone': 'bring-cobblestone', 'bring me dirt': 'bring-dirt', 'bring me gravel': 'bring-gravel',
  'search for iron': 'search-iron', 'search for coal': 'search-coal', 'craft a sword': 'craft-sword',
  'craft a pickaxe': 'craft-pickaxe', 'craft an axe': 'craft-axe', 'craft a shovel': 'craft-shovel',
  'craft a shield': 'craft-shield', 'craft torches': 'craft-torches', 'find a bed': 'find-bed',
  'eat food': 'eat-food', 'equip sword': 'equip-sword',
};

export default function AddCommandModal({ onSaved, commands }: Props) {
  const [activeTab, setActiveTab] = useState<'saved' | 'add' | 'system'>('add');
  const [systemSearch, setSystemSearch] = useState('');
  const [trigger, setTrigger] = useState('');
  const [startText, setStartText] = useState('');
  const [doneText, setDoneText] = useState('');
  const [voiceStart, setVoiceStart] = useState<string | undefined>();
  const [voiceDone, setVoiceDone] = useState<string | undefined>();
  const [startPreview, setStartPreview] = useState<string | undefined>();
  const [donePreview, setDonePreview] = useState<string | undefined>();
  const [status, setStatus] = useState('');
  const [generating, setGenerating] = useState<'start' | 'done' | null>(null);
  const [openList, setOpenList] = useState(false);
  const [voice, setVoice] = useState('F1');
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [playingBuiltin, setPlayingBuiltin] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mapped = useMemo(() => parseChat(`${trigger} ${startText}`), [trigger, startText]);

  useEffect(() => {
    if (!mapped) return;
    if (!startText) setStartText(mapped.startText);
    if (!doneText) setDoneText(mapped.doneText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapped?.label]);

  const applyExample = (phrase: string) => {
    const parsed = parseChat(phrase);
    setTrigger(phrase);
    setStartText(parsed?.startText ?? '');
    setDoneText(parsed?.doneText ?? '');
    setVoiceStart(undefined);
    setVoiceDone(undefined);
    setStartPreview(undefined);
    setDonePreview(undefined);
    setStatus('');
    setOpenList(false);
  };

  const play = (src?: string) => {
    if (!src) return;
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(src);
    audioRef.current = audio;
    void audio.play().catch(() => setStatus('Could not play audio.'));
  };

  const playBuiltin = async (phrase: string, language: 'en' | 'ar', voice: 'F1' | 'M2') => {
    const slug = BUILTIN_SLUGS[phrase];
    if (!slug) return;
    const key = `${phrase}:${language}:${voice}`;
    if (playingBuiltin === key) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingBuiltin(null);
      return;
    }
    audioRef.current?.pause();
    const data = await getApi().tts.readBuiltinAudio({ slug, language, voice });
    if (!data) return;
    const audio = new Audio(data);
    audioRef.current = audio;
    setPlayingBuiltin(key);
    audio.onended = () => setPlayingBuiltin(null);
    void audio.play().catch(() => {
      setPlayingBuiltin(null);
      setStatus('Could not play audio.');
    });
  };

  const genVoice = async (which: 'start' | 'done') => {
    const text = which === 'start' ? startText : doneText;
    if (!text.trim()) {
      setStatus('Write the line first.');
      return;
    }
    setGenerating(which);
    setStatus('');
    const filename = `${Date.now()}-${which}.wav`;
    try {
      const result = await getApi().tts.generate({
        text: text.trim(),
        filename,
        voice,
        speed,
        pitch,
      });
      if (result.success && result.outputPath) {
        if (which === 'start') {
          setVoiceStart(result.outputPath);
          setStartPreview(result.dataUrl);
        } else {
          setVoiceDone(result.outputPath);
          setDonePreview(result.dataUrl);
        }
        setStatus(`Saved ${which} voice.`);
        if (result.dataUrl) play(result.dataUrl);
      } else {
        setStatus(result.error ?? 'TTS failed');
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'TTS failed');
    } finally {
      setGenerating(null);
    }
  };

  const cancelVoice = async () => {
    await getApi().tts.cancel();
    setGenerating(null);
    setStatus('TTS generation cancelled.');
  };

  const importFile = async (which: 'start' | 'done') => {
    const file = await getApi().tts.importFile();
    if (!file) return;
    if (which === 'start') {
      setVoiceStart(file.path);
      setStartPreview(file.dataUrl);
    } else {
      setVoiceDone(file.path);
      setDonePreview(file.dataUrl);
    }
    setStatus('Imported audio file.');
  };

  const save = async () => {
    if (!trigger.trim() || !startText.trim()) return;
    const parsed = parseChat(trigger) ?? mapped;
    const command: BotCommand = {
      id: `cmd-${Date.now()}`,
      triggerPhrases: trigger.split(',').map((p) => p.trim()).filter(Boolean),
      actionType: parsed?.actionType ?? 'custom',
      actionParams: parsed?.actionParams ?? {},
      responseStart: startText.trim(),
      responseDone: doneText.trim(),
      voiceStartPath: voiceStart,
      voiceDonePath: voiceDone,
    };
    await getApi().commands.add(command);
    onSaved();
    setTrigger('');
    setStartText('');
    setDoneText('');
    setVoiceStart(undefined);
    setVoiceDone(undefined);
    setStartPreview(undefined);
    setDonePreview(undefined);
    setStatus('Command saved. In-game menu updated — type menu in chat.');
  };

  return (
    <div className="panel-view command-panel">
      <nav className="panel-nav" aria-label="Command views">
        <button className={activeTab === 'saved' ? 'active' : ''} onClick={() => setActiveTab('saved')}>Saved command</button>
        <button className={activeTab === 'add' ? 'active' : ''} onClick={() => setActiveTab('add')}>Add command</button>
        <button className={activeTab === 'system' ? 'active' : ''} onClick={() => setActiveTab('system')}>All command system</button>
      </nav>

      {activeTab === 'saved' && (
        <section className="library-view">
          <div className="section-label">Saved commands</div>
          {commands.length === 0 ? <p className="hint">No saved commands yet.</p> : commands.map((cmd) => (
            <div className="cmd-item" key={cmd.id}>
              <div><strong>{cmd.triggerPhrases.join(', ')}</strong><div className="hint">{cmd.responseStart}</div></div>
              <button className="btn danger icon-btn" title="Delete command" aria-label="Delete command" onClick={async () => { await getApi().commands.remove(cmd.id); onSaved(); }}><Icon name="trash" /></button>
            </div>
          ))}
        </section>
      )}

      {activeTab === 'system' && (
        <section className="library-view">
          <div className="section-label">Built-in command system</div>
          <input
            className="system-search"
            type="search"
            value={systemSearch}
            onChange={(event) => setSystemSearch(event.target.value)}
            placeholder="Search built-in commands..."
            aria-label="Search built-in commands"
          />
          <div className="system-command-grid">
            {EXAMPLE_TRIGGERS.filter((phrase) => phrase.toLowerCase().includes(systemSearch.trim().toLowerCase())).map((phrase) => {
              const parsed = parseChat(phrase);
              const hasAudio = Boolean(BUILTIN_SLUGS[phrase]);
              return (
                <div className="system-command" key={phrase}>
                  <strong>{phrase}</strong><span>{parsed?.label ?? 'Chat response'}</span>
                  <div className="system-command-audio">
                    <button className="btn audio-btn" disabled={!hasAudio} onClick={() => void playBuiltin(phrase, 'en', 'F1')}>{playingBuiltin === `${phrase}:en:F1` ? 'Stop EN Female' : 'EN Female'}</button>
                    <button className="btn audio-btn" disabled={!hasAudio} onClick={() => void playBuiltin(phrase, 'en', 'M2')}>{playingBuiltin === `${phrase}:en:M2` ? 'Stop EN Male' : 'EN Male'}</button>
                    <button className="btn audio-btn" disabled={!hasAudio} onClick={() => void playBuiltin(phrase, 'ar', 'F1')}>{playingBuiltin === `${phrase}:ar:F1` ? 'Stop AR Female' : 'AR Female'}</button>
                    <button className="btn audio-btn" disabled={!hasAudio} onClick={() => void playBuiltin(phrase, 'ar', 'M2')}>{playingBuiltin === `${phrase}:ar:M2` ? 'Stop AR Male' : 'AR Male'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === 'add' && <>

      <section className="command-section command-card">
      <div className="section-label">Command setup</div>
      <div className="dropdown">
        <button type="button" className="dropdown-toggle" onClick={() => setOpenList((v) => !v)}>
          Phrase templates
          <span>{openList ? '▴' : '▾'}</span>
        </button>
        {openList && (
          <div className="dropdown-list">
            {EXAMPLE_TRIGGERS.map((t) => (
              <button key={t} type="button" onClick={() => applyExample(t)}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="field card-field">
        <label>Chat trigger</label>
        <input
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          placeholder="create a furnace"
        />
      </div>

      <div className="mapped">
        <span>Detected action</span>
        <strong>{mapped ? mapped.label : 'No match — chat only'}</strong>
      </div>
      </section>

      <section className="command-section voice-section">
      <div className="section-label"><Icon name="voice" /> Voice controls</div>
      <div className="row">
        <div className="field">
          <label>Voice</label>
          <select value={voice} onChange={(e) => setVoice(e.target.value)}>
            {TTS_VOICES.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Speed {speed.toFixed(2)}</label>
          <input type="range" min={0.5} max={2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Pitch {pitch.toFixed(0)}</label>
          <input type="range" min={-6} max={6} step={1} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} />
        </div>
      </div>
      </section>

      <div className="response-grid">
      <div className="field response-card">
        <label>Start line</label>
        <textarea
          value={startText}
          onChange={(e) => setStartText(e.target.value)}
          placeholder="Okay, I will craft a furnace."
        />
        <div className="btn-row">
          <button className="btn generate-btn" title="Generate start voice" aria-label="Generate start voice" disabled={generating !== null} onClick={() => void genVoice('start')}>
            {generating === 'start' ? 'Generating...' : 'Generate'}
          </button>
          <button className="btn icon-btn" title="Listen to start voice" aria-label="Listen to start voice" disabled={!startPreview} onClick={() => play(startPreview)}><Icon name="play" /></button>
          <button className="btn icon-btn" title="Upload start voice" aria-label="Upload start voice" onClick={() => void importFile('start')}><Icon name="upload" /></button>
        </div>
        {generating === 'start' && (
          <div className="voice-loading" role="status">
            <span />Generating voice...
            <button className="btn icon-btn loading-cancel" title="Cancel generation" aria-label="Cancel generation" onClick={() => void cancelVoice()}><Icon name="cancel" /></button>
          </div>
        )}
      </div>

      <div className="field response-card">
        <label>Done line</label>
        <textarea
          value={doneText}
          onChange={(e) => setDoneText(e.target.value)}
          placeholder="Furnace is ready."
        />
        <div className="btn-row">
          <button className="btn generate-btn" title="Generate done voice" aria-label="Generate done voice" disabled={generating !== null} onClick={() => void genVoice('done')}>
            {generating === 'done' ? 'Generating...' : 'Generate'}
          </button>
          <button className="btn icon-btn" title="Listen to done voice" aria-label="Listen to done voice" disabled={!donePreview} onClick={() => play(donePreview)}><Icon name="play" /></button>
          <button className="btn icon-btn" title="Upload done voice" aria-label="Upload done voice" onClick={() => void importFile('done')}><Icon name="upload" /></button>
        </div>
        {generating === 'done' && (
          <div className="voice-loading" role="status">
            <span />Generating voice...
            <button className="btn icon-btn loading-cancel" title="Cancel generation" aria-label="Cancel generation" onClick={() => void cancelVoice()}><Icon name="cancel" /></button>
          </div>
        )}
      </div>
      </div>

      {status && <div className={status.toLowerCase().includes('fail') ? 'voice-bad' : 'voice-ok'}>{status}</div>}

      <div className="actions">
        <button className="btn primary icon-btn" title="Save command" aria-label="Save command" onClick={() => void save()} disabled={!trigger.trim() || !startText.trim()}>
          <Icon name="save" />
        </button>
      </div>

      </>}
    </div>
  );
}
