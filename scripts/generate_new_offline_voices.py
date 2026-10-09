from pathlib import Path
from supertonic import TTS

root = Path.cwd()
tts = TTS(model_dir=str(root / 'tts'), auto_download=False)
phrases = {
    'location': ('I will tell you my location.', 'سأخبرك بموقعي.'),
    'here': ('I will work right here.', 'سأعمل هنا بالضبط.'),
    'sit': ('I will sit here.', 'سأجلس هنا.'),
    'jump': ('I will jump repeatedly.', 'سأقفز بشكل متكرر.'),
    'crouch': ('I will crouch here.', 'سأنحني هنا.'),
    'prone': ('I will lie low here.', 'سأستلقي هنا.'),
    'drop-held': ('I will drop what I am holding.', 'سألقي ما أمسكه بيدي.'),
    'build-house': ('I will build a small house using wood.', 'سأبني منزلا صغيرا من الخشب.'),
    'exit-vehicle': ('I will get out of the vehicle.', 'سأخرج من المركبة.'),
    'mob-creeper': ('I found a creeper. I am going to fight it.', 'وجدت كريبر. سأهاجمه.'),
    'mob-spider': ('I found a spider. I am going to fight it.', 'وجدت عنكبوتا. سأهاجمه.'),
    'mob-skeleton': ('I found a skeleton. I am going to fight it.', 'وجدت هيكلا عظميا. سأهاجمه.'),
    'mob-zombie': ('I found a zombie. I am going to fight it.', 'وجدت زومبي. سأهاجمه.'),
    'mob-enderman': ('I found an enderman. I am going to fight it.', 'وجدت إندرمان. سأهاجمه.'),
}
voices = {'F1': 0, 'M2': 0}
for voice in voices:
    style = tts.get_voice_style(voice_name=voice)
    for slug, texts in phrases.items():
        for lang, text in zip(('en', 'ar'), texts):
            output = root / 'data' / 'voices' / 'builtin' / lang / voice / f'{slug}-start.wav'
            output.parent.mkdir(parents=True, exist_ok=True)
            if output.exists():
                continue
            result = tts.synthesize(text, voice_style=style, lang=lang)
            wav = result[0] if isinstance(result, tuple) else result
            tts.save_audio(wav, str(output))
            print(output)
print('done')
