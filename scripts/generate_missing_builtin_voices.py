from supertonic import TTS
import os

root = os.path.join(os.getcwd(), 'tts')

voice_map = {
    'en': {
        'F1': {
            'come-get-diamond': 'come get diamond',
            'come-get-gold': 'come get gold',
            'come-get-stone': 'come get stone',
            'stop-following': "don't follow me",
            'wear-armor': 'wear armor',
        },
        'M2': {
            'come-get-diamond': 'come get diamond',
            'come-get-gold': 'come get gold',
            'come-get-stone': 'come get stone',
            'stop-following': "don't follow me",
            'wear-armor': 'wear armor',
        },
    },
    'ar': {
        'F1': {
            'come-get-diamond': 'تعال واحضر الماس',
            'come-get-gold': 'تعال واحضر الذهب',
            'come-get-stone': 'تعال واحضر الحجر',
            'stop-following': 'لا تتبعني',
            'wear-armor': 'ارتدي الدروع',
        },
        'M2': {
            'come-get-diamond': 'تعال واحضر الماس',
            'come-get-gold': 'تعال واحضر الذهب',
            'come-get-stone': 'تعال واحضر الحجر',
            'stop-following': 'لا تتبعني',
            'wear-armor': 'ارتدي الدروع',
        },
    },
}

tts = TTS(model_dir=root, auto_download=False)

for lang, voices in voice_map.items():
    for voice, slugs in voices.items():
        for slug, text in slugs.items():
            output_dir = os.path.join(os.getcwd(), 'data', 'voices', 'builtin', lang, voice)
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f'{slug}-start.wav')
            if os.path.exists(output_path):
                continue
            style = tts.get_voice_style(voice_name=voice)
            if isinstance(style, dict):
                style = dict(style)
                style['voice'] = voice
            synth_result = tts.synthesize(text, voice_style=style, lang=lang)
            wav = synth_result[0] if isinstance(synth_result, tuple) else synth_result
            tts.save_audio(wav, output_path)
            print(f'generated {output_path}')

print('done')
