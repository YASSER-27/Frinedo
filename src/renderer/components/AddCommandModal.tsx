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
  'build me a house': 'build-house', 'mine diamond': 'mine-diamond', 'make torches': 'make-torches',
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
  'fly with me': 'follow-me', entr: 'follow-me', enter: 'follow-me',
  'come get diamond': 'come-get-diamond', 'come get gold': 'come-get-gold', 'come get stone': 'come-get-stone',
  'dont follow me': 'stop-following', 'do not follow me': 'stop-following',
  'wear armor': 'wear-armor', 'put on armor': 'wear-armor',
  'ابني لي منزلا': 'build-house', 'احفر الماس': 'mine-diamond', 'اصنع المشاعل': 'make-torches',
  'ابحث عن القرية': 'find-village', 'ابحث عن الصندوق': 'find-chest', 'اهرب': 'run-away',
  'كل الطعام': 'eat-food', 'نوم': 'sleep', 'اعطني طعام': 'give-food', 'اعطني سيف': 'give-sword',
  'اعطني كل شيء': 'give-everything', 'اتبعني': 'follow-me', 'لا تتبعني': 'stop-following',
  'طيري معي': 'follow-me', 'الانضمام': 'follow-me', 'ارتدي الدروع': 'wear-armor',
};

const BUILTIN_ARABIC_PHRASES: Record<string, string> = {
  'show me': 'أظهر لي', 'run away': 'اهرب', sleep: 'نوم', 'find village': 'ابحث عن القرية',
  'build me a house': 'ابني لي منزلا', 'mine diamond': 'احفر الماس', 'make torches': 'اصنع المشاعل',
  'find dog': 'ابحث عن الكلب', 'find cat': 'ابحث عن القطة', 'find horse': 'ابحث عن الحصان', 'find camel': 'ابحث عن الجمل',
  'save house': 'احفظ المنزل', 'save me': 'احفظني', 'how do I craft a sword': 'كيف أصنع سيفًا',
  'follow me': 'اتبعني', 'follow me and help me': 'اتبعني وساعدني', 'stop here': 'قف هنا', stop: 'توقف',
  'come here': 'تعال هنا', 'give me everything': 'اعطني كل شيء', 'give me a sword': 'اعطني سيف',
  'give me armor': 'اعطني درع', 'give me food': 'اعطني طعام', 'give me a boat': 'اعطني قارب',
  'bring me 10 wood': 'احضر لي 10 خشب', 'bring me 16 stone': 'احضر لي 16 حجر', 'search for diamond': 'ابحث عن الماس',
  'search for gold': 'ابحث عن الذهب', 'create a furnace': 'اصنع فرن', 'craft a crafting table': 'اصنع طاولة صناعة',
  'go fishing': 'اذهب للصيد', 'find treasure': 'ابحث عن الكنوز', 'find chest': 'ابحث عن الصندوق', 'ride with me': 'اركب معي',
  'kill this': 'اقتل هذا', 'tame dog': 'دجن الكلب', 'tame cat': 'دجن القطة', 'farm crops': 'اعمل في المحاصيل',
  'plant seeds': 'زرع البذور', 'harvest crops': 'احصد المحاصيل', 'bring me sand': 'احضر لي رمل',
  'bring me cobblestone': 'احضر لي حجر مكسر', 'bring me dirt': 'احضر لي تراب', 'bring me gravel': 'احضر لي حصى',
  'search for iron': 'ابحث عن الحديد', 'search for coal': 'ابحث عن الفحم', 'craft a sword': 'اصنع سيف',
  'craft a pickaxe': 'اصنع فأس التعدين', 'craft an axe': 'اصنع فأس', 'craft a shovel': 'اصنع مجرفة',
  'craft a shield': 'اصنع درع', 'craft torches': 'اصنع المشاعل', 'find a bed': 'ابحث عن سرير',
  'eat food': 'كل الطعام', 'equip sword': 'جهز السيف', 'fly with me': 'طيري معي',
  entr: 'الانضمام', 'come get diamond': 'تعال واحضر الماس', 'come get gold': 'تعال واحضر الذهب',
  'come get stone': 'تعال واحضر الحجر', 'dont follow me': 'لا تتبعني', 'do not follow me': 'لا تتبعني',
  'wear armor': 'ارتدي الدرع', 'put on armor': 'ارتدي الدرع', 'give me all': 'اعطني كل شيء',
};

const BUILTIN_ARABIC_ACTIONS: Record<string, string> = {
  'Go fishing': 'الصيد', 'Tame animal': 'تدجين الحيوان', 'Farm crops': 'زراعة المحاصيل', 'Show inventory': 'عرض المخزون',
  'Build a house': 'بناء منزل', 'Run away': 'الهروب', 'Save location': 'حفظ الموقع', 'Beginner help': 'مساعدة المبتدئين',
  'Find something': 'بحث عن شيء', 'Find treasure': 'بحث عن الكنوز', 'Open menu': 'فتح القائمة', 'Stop here': 'التوقف هنا',
  'Stop following': 'إيقاف المتابعة', 'Stop': 'توقف', 'Follow and protect': 'المتابعة والحماية', 'Follow player': 'اتبع اللاعب',
  'Collect 8 oak log': 'جمع 8 خشب البلوط', 'Go to player': 'الذهاب إلى اللاعب', 'Attack target': 'هجوم على الهدف',
  'Give everything': 'إعطاء كل شيء', 'Mine diamond': 'حفر الماس', 'Give a sword': 'إعطاء سيف', 'Give food': 'إعطاء طعام',
  'Give armor': 'إعطاء درع', 'Give boat': 'إعطاء قارب', 'Equip item': 'تجهيز العنصر', 'Sleep': 'النوم', 'Eat': 'الأكل',
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
  const [builtinLanguage, setBuiltinLanguage] = useState<'en' | 'ar'>('en');
  const [voice, setVoice] = useState('F1');
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [playingBuiltin, setPlayingBuiltin] = useState<string | null>(null);
  const audioPoolRef = useRef(new Map<string, HTMLAudioElement>());

  const stopAudio = () => {
    for (const [key, audio] of audioPoolRef.current.entries()) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      audio.src = '';
      audio.removeAttribute('src');
      audio.load();
      audioPoolRef.current.delete(key);
    }
  };

  const playAudio = (src: string) => {
    const resolved = /^data:|^blob:|^file:|^https?:\/\//i.test(src) ? src : `file://${src.replace(/\\/g, '/')}`;
    const existing = audioPoolRef.current.get(resolved);
    if (existing) {
      existing.currentTime = 0;
      void existing.play().catch(() => setStatus('Could not play audio.'));
      return;
    }

    if (audioPoolRef.current.size >= 3) {
      const oldestKey = audioPoolRef.current.keys().next().value as string | undefined;
      if (oldestKey) {
        const oldest = audioPoolRef.current.get(oldestKey);
        oldest?.pause();
        oldest?.removeAttribute('src');
        oldest?.load();
        audioPoolRef.current.delete(oldestKey);
      }
    }

    const audio = new Audio();
    audio.onended = () => {
      audioPoolRef.current.delete(resolved);
      audio.src = '';
      audio.removeAttribute('src');
      audio.load();
    };
    audio.onerror = () => {
      audioPoolRef.current.delete(resolved);
      audio.src = '';
      audio.removeAttribute('src');
      audio.load();
    };
    audio.src = resolved;
    audioPoolRef.current.set(resolved, audio);
    void audio.play().catch(() => setStatus('Could not play audio.'));
  };

  const mapped = useMemo(() => parseChat(`${trigger} ${startText}`), [trigger, startText]);

  const displayPhrase = (phrase: string) =>
    builtinLanguage === 'ar' ? BUILTIN_ARABIC_PHRASES[phrase] ?? phrase : phrase;

  const displayAction = (phrase?: string) => {
    const base = phrase ?? 'Chat response';
    return builtinLanguage === 'ar' ? BUILTIN_ARABIC_ACTIONS[base] ?? base : base;
  };

  const builtinArabicLabels: Record<string, string> = {
    flw: 'اتبعني', gud: 'تعال هنا', stp: 'توقف', hold: 'ابق هنا', here: 'اعمل هنا',
    wood: 'اجمع خشب', stn: 'اجمع حجر', sd: 'اجمع رمل', cbl: 'اجمع حجر مكسر', grv: 'اجمع حصى',
    dirt: 'اجمع تراب', diam: 'ابحث عن الماس', gold: 'ابحث عن الذهب', iron: 'ابحث عن الحديد',
    coal: 'ابحث عن الفحم', furn: 'اصنع فرن', tbl: 'اصنع طاولة صناعة', swd: 'اصنع سيف',
    pick: 'اصنع فأس تعدين', axe: 'اصنع فأس', shov: 'اصنع مجرفة', shld: 'اصنع درع', torc: 'اصنع مشاعل',
    fish: 'اذهب للصيد', inv: 'اعرض المخزون', bed: 'اذهب إلى السرير', food: 'كل الطعام', home: 'ابن منزلا',
    dog: 'ابحث عن الكلب', cat: 'ابحث عن القطة', crop: 'اعمل في المحاصيل', seed: 'ازرع البذور',
    hunt: 'هاجم', chest: 'ابحث عن صندوق', vill: 'ابحث عن قرية', saveh: 'احفظ المنزل', savem: 'احفظ موقعي',
    jump: 'اقفز', flee: 'اهرب', ride: 'اركب', out: 'اخرج', atck: 'هاجم', all: 'اعطني كل شيء',
    arm: 'اعطني درع', sword: 'اعطني سيف', boat: 'اعطني قارب', w16: 'اجمع 16 خشب', s16: 'اجمع 16 حجر',
    findv: 'ابحث عن قرية', findb: 'ابحث عن سرير', arrive: 'تعال هنا', guard: 'احمني', keep: 'ابق هنا', stopf: 'لا تتبعني',
    ip: 'أظهر موقعي', sit: 'اجلس', 'jump repeatedly': 'اقفز بشكل متكرر', crouch: 'انحن', prone: 'استلق', gfs: 'ارم ما بيدك',
  };

  const builtinAudioButtons = builtinLanguage === 'ar'
    ? [
        { id: 'F1', label: 'AR Female' },
        { id: 'M2', label: 'AR Male' },
      ]
    : [
        { id: 'F1', label: 'Female' },
        { id: 'M2', label: 'Male' },
      ];

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

  const applyCommand = (command: BotCommand) => {
    setTrigger(command.triggerPhrases.join(', '));
    setStartText(command.responseStart || command.responseText || '');
    setDoneText(command.responseDone || '');
    setVoiceStart(undefined);
    setVoiceDone(undefined);
    setStartPreview(undefined);
    setDonePreview(undefined);
    setStatus(`Editing ${command.triggerPhrases[0] ?? command.actionType}. Save it as a custom command after changing the text.`);
    setOpenList(false);
  };

  const play = (src?: string) => {
    if (!src) return;
    playAudio(src);
  };

  const playBuiltin = async (command: BotCommand, language: 'en' | 'ar', voice: 'F1' | 'M2') => {
    const phrase = command.triggerPhrases[0] ?? command.actionType;
    const slug = BUILTIN_SLUGS[phrase];
    const key = `${phrase}:${language}:${voice}`;
    if (playingBuiltin === key) {
      stopAudio();
      setPlayingBuiltin(null);
      return;
    }
    stopAudio();

    let data = slug ? await getApi().tts.readBuiltinAudio({ slug, language, voice }) : null;
    if (!data) {
      const path = command.voiceStartVariants?.[`${language}:${voice}`];
      data = path ? await getApi().tts.readAudio(path) : null;
    }
    if (!data && slug) {
      const generated = await getApi().tts.generate({
        text: phrase,
        filename: `${slug}-${language}-${voice}.wav`,
        voice,
        speed,
        pitch,
      });
      data = generated.dataUrl ?? null;
    }
    if (!data) return;

    const audio = new Audio();
    const previous = audioPoolRef.current.get(data) ?? null;
    if (previous) {
      previous.currentTime = 0;
      void previous.play().catch(() => setStatus('Could not play audio.'));
      setPlayingBuiltin(key);
      return;
    }
    audio.onended = () => {
      audioPoolRef.current.delete(data);
      setPlayingBuiltin(null);
      audio.src = '';
      audio.removeAttribute('src');
      audio.load();
    };
    audio.onerror = () => {
      audioPoolRef.current.delete(data);
      setPlayingBuiltin(null);
      audio.src = '';
      audio.removeAttribute('src');
      audio.load();
    };
    audio.src = data;
    audioPoolRef.current.set(data, audio);
    setPlayingBuiltin(key);
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
          {commands.filter((command) => !command.isBuiltIn).length === 0 ? (
            <p className="hint">No saved commands yet.</p>
          ) : (
            <div className="system-command-grid saved-command-grid">
              {commands.filter((command) => !command.isBuiltIn).map((cmd) => (
                <div className="system-command saved-command-row" key={cmd.id}>
                  <strong>{cmd.triggerPhrases[0] ?? 'Command'}</strong>
                  <span>{cmd.responseStart || 'No response text yet.'}</span>
                  <button
                    className="btn danger icon-btn"
                    title="Delete command"
                    aria-label="Delete command"
                    onClick={async () => {
                      await getApi().commands.remove(cmd.id);
                      onSaved();
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'system' && (
        <section className="library-view">
          <div className="section-label">Built-in command system</div>
          <div className="row">
            <div className="field">
              <label>Built-in language</label>
              <select value={builtinLanguage} onChange={(event) => setBuiltinLanguage(event.target.value as 'en' | 'ar')}>
                <option value="en">English</option>
                <option value="ar">Arabic</option>
              </select>
            </div>
          </div>
          <input
            className="system-search"
            type="search"
            value={systemSearch}
            onChange={(event) => setSystemSearch(event.target.value)}
            placeholder="Search built-in commands..."
            aria-label="Search built-in commands"
          />
          <div className="system-command-grid">
            {commands.filter((command) => command.isBuiltIn).filter((command) => {
              const phrase = command.triggerPhrases[0] ?? command.actionType;
              const search = systemSearch.trim().toLowerCase();
              if (!search) return true;
              const text = `${phrase} ${displayPhrase(phrase)}`.toLowerCase();
              return text.includes(search);
            }).map((command) => {
              const phrase = command.triggerPhrases[0] ?? command.actionType;
              const parsed = parseChat(phrase);
              const hasAudio = Boolean(command.voiceStartVariants?.[`${builtinLanguage}:F1`] || BUILTIN_SLUGS[phrase]);
              const label = builtinLanguage === 'ar' ? (builtinArabicLabels[phrase] ?? displayPhrase(phrase)) : phrase;
              return (
                <div className="system-command" key={phrase}>
                  <strong>{label}</strong><span>{displayAction(parsed?.label ?? command.actionType)}</span>
                  <div className="system-command-audio">
                    {builtinAudioButtons.map(({ id, label }) => (
                      <button
                        key={`${phrase}:${builtinLanguage}:${id}`}
                        className="btn audio-btn"
                        disabled={!hasAudio}
                        onClick={() => void playBuiltin(command, builtinLanguage, id as 'F1' | 'M2')}
                      >
                        {playingBuiltin === `${phrase}:${builtinLanguage}:${id}` ? `Stop ${label}` : label}
                      </button>
                    ))}
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
            {commands.map((command) => (
              <button key={command.id} type="button" onClick={() => applyCommand(command)}>
                {command.triggerPhrases[0] ?? command.actionType}
                <small>{command.actionType}</small>
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
            <div className="loader-bar" />
            <span>Generating voice...</span>
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
            <div className="loader-bar" />
            <span>Generating voice...</span>
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
