import fs from 'node:fs';

const commands = JSON.parse(fs.readFileSync('data/commands.json', 'utf8'));
const arabicActions = {
  followPlayer: 'اتبع اللاعب', followGuard: 'اتبع واحم اللاعب', goToPlayer: 'اذهب إلى اللاعب', stop: 'توقف', stay: 'ابق هنا',
  collectBlocks: 'اجمع الكتل', searchBlock: 'ابحث عن كتلة', giveItem: 'أعط العنصر', giveAll: 'أعط كل شيء', craft: 'اصنع عنصرًا',
  placeBlock: 'ضع كتلة', buildHouse: 'ابن منزلًا', rideVehicle: 'اركب المركبة', exitVehicle: 'اخرج من المركبة', attack: 'هاجم',
  goToBed: 'اذهب إلى السرير', eat: 'كل الطعام', jump: 'اقفز', jumpRepeated: 'اقفز بشكل متكرر', equip: 'جهز عنصرًا',
  showInventory: 'اعرض المخزون', runAway: 'اهرب', findEntity: 'ابحث عن كائن', saveLocation: 'احفظ الموقع', showLocation: 'اعرض الموقع',
  here: 'اعمل هنا', sit: 'اجلس', crouch: 'انحن', prone: 'استلق', dropHeld: 'ارم العنصر الذي تمسكه', helpGuide: 'مساعدة',
  fish: 'اذهب للصيد', tame: 'دجن الحيوان', farm: 'اعمل في المحاصيل', showMenu: 'اعرض القائمة', custom: 'مخصص'
};
const escape = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const rows = commands.map((command, index) => {
  const phrase = command.triggerPhrases?.[0] ?? command.actionType;
  const aliases = (command.triggerPhrases ?? []).slice(1).join(', ') || '-';
  const params = Object.entries(command.actionParams ?? {}).map(([key, value]) => `${key}=${value}`).join(', ') || '-';
  return `| ${index + 1} | <code>${escape(phrase)}</code> | ${escape(aliases)} | <code>${command.actionType}</code> | ${escape(params)} |`;
}).join('\n');
const arabicRows = commands.map((command, index) => {
  const phrase = command.triggerPhrases?.[0] ?? command.actionType;
  const aliases = (command.triggerPhrases ?? []).slice(1).join(', ') || '-';
  const action = arabicActions[command.actionType] ?? command.actionType;
  return `| ${index + 1} | \`${escape(phrase)}\` | ${escape(aliases)} | ${action} |`;
}).join('\n');

fs.writeFileSync('README_COMMANDS_EN.md', `# Frinedo Commands - v0.1.8\n\nComplete command inventory from data/commands.json. The in-game menu shows the first 90 commands in pages of 10; all ${commands.length} commands remain available through chat aliases and the command system.\n\n| # | Main phrase | Aliases | Action | Parameters |\n|---:|---|---|---|---|\n${rows}\n`, 'utf8');
fs.writeFileSync('README_COMMANDS_AR.md', `# أوامر Frinedo - الإصدار 0.1.8\n\nهذه قائمة كاملة بكل الأوامر الموجودة في data/commands.json. تعرض قائمة اللعبة أول 90 أمرًا على صفحات، بينما تبقى كل الأوامر وعددها ${commands.length} متاحة عبر الدردشة ونظام الأوامر.\n\n| الرقم | العبارة الأساسية | العبارات البديلة | التنفيذ |\n|---:|---|---|---|\n${arabicRows}\n`, 'utf8');
