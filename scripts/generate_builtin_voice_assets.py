import json
import re
from pathlib import Path
from supertonic import TTS

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / 'tts'
OUTPUT = ROOT / 'data' / 'voices' / 'builtin'

PHRASES = [
    ('show-me', 'Here is everything I have. Use the item number if you want one.', 'إليك كل ما أملكه. اكتب رقم العنصر إذا أردته.'),
    ('run-away', 'Running away from danger.', 'سأهرب من الخطر.'),
    ('sleep', 'Looking for a bed.', 'أبحث عن سرير.'),
    ('find-village', 'I will search nearby.', 'سأبحث في المنطقة القريبة.'),
    ('find-dog', 'I will search nearby.', 'سأبحث عن الكلب قريبًا.'),
    ('find-cat', 'I will search nearby.', 'سأبحث عن القطة قريبًا.'),
    ('find-horse', 'I will search nearby.', 'سأبحث عن الحصان قريبًا.'),
    ('find-camel', 'I will search nearby.', 'سأبحث عن الجمل قريبًا.'),
    ('save-house', 'Saving this location.', 'أحفظ موقع المنزل.'),
    ('save-me', 'Saving this location.', 'أحفظ موقعي.'),
    ('how-craft-sword', 'I will guide you step by step.', 'سأرشدك خطوة بخطوة.'),
    ('follow-me', 'Okay, following you.', 'حسنًا، سأتبعك.'),
    ('follow-me-help', 'I will follow you and kill any monster that shows up.', 'سأتبعك وأحميك من أي وحش يظهر.'),
    ('stop-here', 'Stopping right here.', 'سأتوقف هنا.'),
    ('stop', 'Stopping now.', 'سأتوقف الآن.'),
    ('come-here', 'On my way to you.', 'أنا قادم إليك.'),
    ('give-everything', 'Handing over everything I have.', 'سأعطيك كل ما أملكه.'),
    ('give-sword', 'Okay, giving you a sword.', 'حسنًا، سأعطيك سيفًا.'),
    ('give-armor', 'Okay, giving you armor.', 'حسنًا، سأعطيك درعًا.'),
    ('give-food', 'Okay, giving you food.', 'حسنًا، سأعطيك طعامًا.'),
    ('give-boat', 'Okay, giving you an oak boat.', 'حسنًا، سأعطيك قاربًا.'),
    ('bring-wood', 'Okay, I will get ten oak logs.', 'حسنًا، سأحضر عشرة أخشاب.'),
    ('bring-stone', 'Okay, I will get sixteen stone.', 'حسنًا، سأحضر ستة عشر حجرًا.'),
    ('search-diamond', 'Searching for diamond ore.', 'أبحث عن خام الألماس.'),
    ('search-gold', 'Searching for gold ore.', 'أبحث عن خام الذهب.'),
    ('create-furnace', 'Okay, I will craft a furnace.', 'حسنًا، سأصنع فرنًا.'),
    ('craft-table', 'Okay, I will craft a crafting table.', 'حسنًا، سأصنع طاولة تصنيع.'),
    ('go-fishing', 'I will go fishing nearby.', 'سأذهب للصيد قريبًا.'),
    ('find-treasure', 'I will search for treasure chests nearby.', 'سأبحث عن صناديق الكنوز قريبًا.'),
    ('find-chest', 'I will search for treasure chests nearby.', 'سأبحث عن صناديق الكنوز قريبًا.'),
    ('ride-with-me', 'Okay, I will come with you.', 'حسنًا، سأذهب معك.'),
    ('kill-this', 'I will attack the nearest target.', 'سأهاجم أقرب هدف.'),
    ('tame-dog', 'I will try to tame that animal.', 'سأحاول ترويض هذا الحيوان.'),
    ('tame-cat', 'I will try to tame that animal.', 'سأحاول ترويض هذا الحيوان.'),
    ('farm-crops', 'I will work on the nearby crops.', 'سأعمل في المحاصيل القريبة.'),
    ('plant-seeds', 'I will work on the nearby crops.', 'سأعمل في المحاصيل القريبة.'),
    ('harvest-crops', 'I will work on the nearby crops.', 'سأعمل في المحاصيل القريبة.'),
    ('bring-sand', 'Okay, I will get eight sand.', 'حسنًا، سأحضر ثمانية من الرمل.'),
    ('bring-cobblestone', 'Okay, I will get eight cobblestone.', 'حسنًا، سأحضر ثمانية أحجار.'),
    ('bring-dirt', 'Okay, I will get eight dirt.', 'حسنًا، سأحضر ثمانية من التراب.'),
    ('bring-gravel', 'Okay, I will get eight gravel.', 'حسنًا، سأحضر ثمانية من الحصى.'),
    ('search-iron', 'Searching for iron ore.', 'أبحث عن خام الحديد.'),
    ('search-coal', 'Searching for coal ore.', 'أبحث عن خام الفحم.'),
    ('craft-sword', 'Okay, I will craft a sword.', 'حسنًا، سأصنع سيفًا.'),
    ('craft-pickaxe', 'Okay, I will craft a pickaxe.', 'حسنًا، سأصنع معولًا.'),
    ('craft-axe', 'Okay, I will craft an axe.', 'حسنًا، سأصنع فأسًا.'),
    ('craft-shovel', 'Okay, I will craft a shovel.', 'حسنًا، سأصنع مجرفة.'),
    ('craft-shield', 'Okay, I will craft a shield.', 'حسنًا، سأصنع درعًا.'),
    ('craft-torches', 'Okay, I will craft torches.', 'حسنًا، سأصنع مشاعل.'),
    ('find-bed', 'I will look for a bed nearby.', 'سأبحث عن سرير قريب.'),
    ('eat-food', 'Eating something from my inventory.', 'سآكل شيئًا من مخزوني.'),
    ('equip-sword', 'I will equip my sword.', 'سأجهز سيفي.'),
]


def safe(text):
    return re.sub(r'[^a-z0-9-]+', '-', text.lower()).strip('-')


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for voice in ('F1', 'M2'):
        tts = TTS(model_dir=str(MODEL_DIR), auto_download=False)
        style = tts.get_voice_style(voice_name=voice)
        for slug, english, arabic in PHRASES:
            for language, text in (('en', english), ('ar', arabic)):
                target = OUTPUT / language / voice / f'{safe(slug)}-start.wav'
                target.parent.mkdir(parents=True, exist_ok=True)
                wav, _duration = tts.synthesize(text, voice_style=style, lang=language)
                tts.save_audio(wav, str(target))
                print(target)


if __name__ == '__main__':
    main()
