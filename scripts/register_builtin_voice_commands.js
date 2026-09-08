const fs = require('fs');
const path = require('path');
const { parseChat } = require('../dist/shared/parseCommand.js');

const root = path.resolve(__dirname, '..');
const commandsPath = path.join(root, 'data', 'commands.json');
const voiceRoot = path.join(root, 'data', 'voices', 'builtin');
const entries = [
  ['show me', 'show-me'], ['run away', 'run-away'], ['sleep', 'sleep'],
  ['find village', 'find-village'], ['find dog', 'find-dog'], ['find cat', 'find-cat'],
  ['find horse', 'find-horse'], ['find camel', 'find-camel'], ['save house', 'save-house'],
  ['save me', 'save-me'], ['how do I craft a sword', 'how-craft-sword'],
  ['follow me', 'follow-me'], ['follow me and help me', 'follow-me-help'],
  ['stop here', 'stop-here'], ['stop', 'stop'], ['come here', 'come-here'],
  ['give me everything', 'give-everything'], ['give me a sword', 'give-sword'],
  ['give me armor', 'give-armor'], ['give me food', 'give-food'], ['give me a boat', 'give-boat'],
  ['bring me 10 wood', 'bring-wood'], ['bring me 16 stone', 'bring-stone'],
  ['search for diamond', 'search-diamond'], ['search for gold', 'search-gold'],
  ['create a furnace', 'create-furnace'], ['craft a crafting table', 'craft-table'],
    ['go fishing', 'go-fishing'], ['find treasure', 'find-treasure'], ['find chest', 'find-chest'],
    ['ride with me', 'ride-with-me'], ['kill this', 'kill-this'], ['tame dog', 'tame-dog'], ['tame cat', 'tame-cat'],
    ['farm crops', 'farm-crops'], ['plant seeds', 'plant-seeds'], ['harvest crops', 'harvest-crops'],
    ['bring me sand', 'bring-sand'], ['bring me cobblestone', 'bring-cobblestone'], ['bring me dirt', 'bring-dirt'],
    ['bring me gravel', 'bring-gravel'], ['search for iron', 'search-iron'], ['search for coal', 'search-coal'],
    ['craft a sword', 'craft-sword'], ['craft a pickaxe', 'craft-pickaxe'], ['craft an axe', 'craft-axe'],
    ['craft a shovel', 'craft-shovel'], ['craft a shield', 'craft-shield'], ['craft torches', 'craft-torches'],
    ['find a bed', 'find-bed'], ['eat food', 'eat-food'], ['equip sword', 'equip-sword'],
];

const commands = fs.existsSync(commandsPath) ? JSON.parse(fs.readFileSync(commandsPath, 'utf8')) : [];
for (const [phrase, slug] of entries) {
  const intent = parseChat(phrase);
  if (!intent) continue;
  const variants = {};
  for (const language of ['en', 'ar']) {
    for (const voice of ['F1', 'M2']) {
      variants[`${language}:${voice}`] = path.join(voiceRoot, language, voice, `${slug}-start.wav`);
    }
  }
  const existing = commands.find((command) => command.triggerPhrases?.some((trigger) => trigger.toLowerCase() === phrase));
  const command = {
    id: existing?.id ?? `builtin-${slug}`,
    triggerPhrases: [phrase],
    actionType: intent.actionType,
    actionParams: intent.actionParams,
    responseStart: intent.startText,
    responseDone: existing?.responseDone ?? '',
    voiceStartVariants: variants,
  };
  if (existing) Object.assign(existing, command);
  else commands.push(command);
}
fs.writeFileSync(commandsPath, JSON.stringify(commands, null, 2));
console.log(`Registered ${entries.length} voice-enabled commands.`);
