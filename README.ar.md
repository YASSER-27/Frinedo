# Frinedo

Frinedo هو مشروع Offline لسطح المكتب من أجل الاستمتاع بلعبة Minecraft مع أصدقاء من البوتات. يستطيع البوت مرافقتك وحمايتك وجمع الموارد وصناعة الأدوات واستكشاف العالم ومساعدتك على تعلم اللعبة. المشروع مبني باستخدام Electron وReact وTypeScript وMineflayer، مع نظام نطق محلي Supertonic اختياري.

الإصدار: **0.1.4**

المطور: **YASSER-27**

GitHub: https://github.com/YASSER-27

## فكرة المشروع

تم تصميم Frinedo للعب Minecraft بشكل Offline مع أصدقاء من البوتات. يمكنك اللعب بشكل طبيعي بينما ينضم بوت أو أكثر إلى عالم LAN الخاص بك، يستجيبون لأوامرك، يساعدونك في بداية اللعبة، ويجعلون العالم أكثر حياة بدون الحاجة إلى خدمة ذكاء اصطناعي Online.

## المزايا

- ربط بوت Mineflayer بسيرفر Minecraft LAN يعمل بوضع offline.
- التحكم في أربعة بوتات كحد أقصى من Settings.
- توجيه الأوامر باستخدام `bot1` و`bot2` و`bot3` و`bot4` أو أسماء البوتات المخصصة.
- أوامر للاتباع والحراسة والجمع والصناعة والبحث والزراعة والصيد والنوم والهروب والهجوم والترويض والتعليم.
- قائمة أوامر داخل اللعبة مقسمة إلى صفحات من عشرة أوامر: `menu 1` و`menu 2` وهكذا.
- حفظ سجل الشات تلقائيًا في `data/chat-history.json`.
- أصوات محلية بالإنجليزية والعربية باستخدام Female 1 وMale 2 أثناء التطوير.
- Voice Help اختياري بالإنجليزية أو العربية أثناء التطوير.
- تشغيل معاينات أصوات الأوامر من Add Command.

## المتطلبات

- Windows 10 أو أحدث لبناء Setup بصيغة NSIS.
- Node.js إصدار 18 أو أحدث.
- يفضل Python 3.11 لتشغيل TTS المحلي أثناء التطوير فقط.
- Minecraft Java Edition مع تفعيل Open to LAN.
- ملفات Supertonic المحلية داخل `tts/onnx` وملفات الأصوات داخل `tts/voice_styles`.

## التشغيل أثناء التطوير

تثبيت مكتبات JavaScript:

```bash
npm install
```

تشغيل البرنامج في وضع التطوير:

```bash
npm run dev
```

بناء main وrenderer:

```bash
npm run build
```

تشغيل النسخة المبنية:

```bash
npm start
```

## بناء ملف Setup

لإنشاء Setup ونسخة التوزيع:

```bash
npm run dist
```

سيتم حفظ ملف التثبيت داخل مجلد `release/`.

ملفات نموذج TTS لا تدخل في Setup حتى يبقى حجمه صغيرًا. لذلك سيظهر داخل النسخة المثبتة تنبيه بأن توليد الصوت وVoice Help متاحان أثناء التطوير فقط.

## إعداد Minecraft

1. افتح عالم Single Player في Minecraft Java Edition.
2. اختر **Open to LAN**.
3. فعّل Cheats إذا أردت استخدام القائمة والأوامر القابلة للنقر.
4. سجّل رقم LAN Port الذي تعرضه Minecraft.
5. ضع نفس الرقم تمامًا داخل حقل `Port` في Settings في Frinedo. يجب أن يتطابق الرقمان.
6. ضع Host، وغالبًا يكون `127.0.0.1` على نفس الكمبيوتر.
7. ضع اسم البوت الأساسي، ويمكنك تحديد Bot 2 أو Bot 3 أو Bot 4.
8. احفظ Settings ثم اضغط Connect.

يجب أن تكون Minecraft تعمل وأن يكون العالم مفتوحًا مسبقًا باستخدام **Open to LAN**. لا يستطيع Frinedo الاتصال قبل تشغيل عالم LAN، ولن ينجح الاتصال إذا كان Port داخل Settings مختلفًا عن LAN Port الموجود في Minecraft.

اكتب `menu` لعرض الصفحة الأولى. استخدم `menu 2` أو `menu 3` أو رقم الصفحة المطلوب. بعد ظهور الصفحة اكتب رقمًا محليًا من 1 إلى 10 لتنفيذ الأمر. لتوجيه أمر إلى بوت آخر اكتب مثلًا:

```text
bot2 follow me
b3 find village
MyHelper bring me stone
```

## إضافة Command جديدة

لإضافة أمر built-in جديد عدّل الملفات التالية:

- `src/shared/parseCommand.ts`: تعريف العبارة وإنشاء intent.
- `src/shared/types.ts`: إضافة `ActionType` جديد عند الحاجة.
- `src/main/bot/commandEngine.ts`: ربط intent بالتنفيذ.
- `src/main/bot/skills.ts`: كتابة سلوك Minecraft.
- قائمة `EXAMPLE_TRIGGERS` داخل `src/shared/parseCommand.ts`: إظهار الأمر في الواجهة والقائمة.

لإضافة معاينات الصوت للأوامر built-in عدّل:

- `scripts/generate_builtin_voice_assets.py`
- `src/renderer/components/AddCommandModal.tsx` داخل `BUILTIN_SLUGS`
- `scripts/register_builtin_voice_commands.js`

ثم أنشئ وسجّل الأصوات:

```bash
py -3 scripts/generate_builtin_voice_assets.py
node scripts/register_builtin_voice_commands.js
```

يتم تشغيل صوت Start فقط للأوامر built-in. رسائل Done تبقى نصية حتى لا تختلط الأصوات.

## ملفات البيانات

- `data/commands.json`: الأوامر المحفوظة وربط الأصوات.
- `data/settings.json`: إعدادات السيرفر والبوت وVoice Help.
- `data/chat-history.json`: سجل الشات الدائم.
- `data/voices/`: الأصوات المولدة والمستوردة.
- `tts/`: عامل Supertonic وملفات النموذج والأصوات.

## الرخصة

MIT
