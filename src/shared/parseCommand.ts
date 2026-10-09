import { ActionType, ParsedIntent } from './types';
import { extractCount, extractItem, prettyName } from './items';

interface Rule {
  test: (text: string) => boolean;
  build: (text: string) => ParsedIntent;
}

function has(text: string, ...needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

const RULES: Rule[] = [
  {
    test: (t) => /^(str|srt|stf|sct|stbe)$/.test(t.trim()),
    build: (t) => {
      const mode = t.trim() === 'stf' ? 'off' : t.trim() === 'stbe' ? 'begin' : 'continue';
      const text = mode === 'off' ? 'I will stop automatic survival tasks.' : mode === 'begin' ? 'I will restart survival from the beginning.' : 'I will continue my survival tasks.';
      return { actionType: 'survivalControl', actionParams: { mode }, label: 'Survival automation', startText: text, doneText: 'Survival mode updated.' };
    },
  },
  {
    test: (t) => /^(this|take this|take it|خذ هذا|خد هذا|هذا|التقط هذا)$/.test(t.trim()),
    build: () => ({
      actionType: 'takeFrontItem', actionParams: {}, label: 'Take the item in front',
      startText: 'I will take what is in front of me.', doneText: 'I picked it up.',
    }),
  },
  {
    test: (t) => has(t, 'up', 'wake up', 'stay awake', 'لا تنم', 'لا تنام', 'استيقظ'),
    build: () => ({
      actionType: 'wakeUp', actionParams: {}, label: 'Stay awake',
      startText: 'I will stay awake.', doneText: 'I am awake.',
    }),
  },
  {
    test: (t) => /^(go|go attack|attack|هاجم|اذهب هاجم|اهجم)$/.test(t.trim()),
    build: () => ({
      actionType: 'attack', actionParams: { entityType: 'hostile' }, label: 'Attack nearby monster',
      startText: 'I am attacking the nearby monster.', doneText: 'The attack is over.',
    }),
  },
  {
    test: (t) => has(t, 'ip', 'where are you', 'location', 'coordinates', 'اين انت', 'أين أنت', 'موقعك'),
    build: () => ({ actionType: 'showLocation', actionParams: {}, label: 'Show location', startText: 'I will tell you my location.', doneText: 'Location reported.' }),
  },
  {
    test: (t) => has(t, 'crouch', 'sneak', 'انحن', 'انبطح'),
    build: () => ({ actionType: 'crouch', actionParams: {}, label: 'Crouch', startText: 'I will crouch here.', doneText: 'I am crouching.' }),
  },
  {
    test: (t) => has(t, 'prone', 'lie down', 'استلق', 'نوم هنا'),
    build: () => ({ actionType: 'prone', actionParams: {}, label: 'Prone', startText: 'I will lie low here.', doneText: 'I am lying low here.' }),
  },
  {
    test: (t) => has(t, 'sit', 'اجلس', 'اقعد'),
    build: () => ({ actionType: 'sit', actionParams: {}, label: 'Sit', startText: 'I will sit here.', doneText: 'I am sitting here.' }),
  },
  {
    test: (t) => has(t, 'repeated jump', 'jump repeatedly', 'قفز متكرر', 'اقفز'),
    build: () => ({ actionType: 'jumpRepeated', actionParams: { count: 5 }, label: 'Repeated jump', startText: 'I will jump repeatedly.', doneText: 'Jumping finished.' }),
  },
  {
    test: (t) => has(t, 'gfs', 'drop held', 'drop what you hold', 'ارم ما بيدك', 'ارمي ما بيدك'),
    build: () => ({ actionType: 'dropHeld', actionParams: {}, label: 'Drop held item', startText: 'I will drop what I am holding.', doneText: 'Held item dropped.' }),
  },
  {
    test: (t) => has(t, 'here', 'stay and plant here', 'sleep here', 'work here', 'ازرع هنا', 'نم هنا', 'اعمل هنا', 'قف هنا'),
    build: () => ({ actionType: 'here', actionParams: {}, label: 'Work here', startText: 'I will work right here.', doneText: 'I am staying here.' }),
  },
  {
    test: (t) => has(t, 'fish', 'go fishing', 'catch fish', 'fishing'),
    build: () => ({
      actionType: 'fish', actionParams: {}, label: 'Go fishing',
      startText: 'I will go fishing nearby.', doneText: 'Fishing finished.',
    }),
  },
  {
    test: (t) => has(t, 'tame dog', 'tame wolf', 'tame cat', 'feed dog', 'feed cat'),
    build: (t) => ({
      actionType: 'tame', actionParams: { animal: t.includes('cat') ? 'cat' : 'wolf' }, label: 'Tame animal',
      startText: 'I will try to tame that animal.', doneText: 'Taming attempt finished.',
    }),
  },
  {
    test: (t) => has(t, 'farm', 'plant seeds', 'plant wheat', 'harvest crops', 'collect crops'),
    build: () => ({
      actionType: 'farm', actionParams: {}, label: 'Farm crops',
      startText: 'I will work on the nearby crops.', doneText: 'Crop work finished.',
    }),
  },
  {
    test: (t) => has(t, 'show me', 'show inventory', 'what do you have', 'what have you got', 'اعطني قائمة', 'أظهر لي', 'show me', 'قائمة', 'الأوامر', 'مساعدة'),
    build: () => ({
      actionType: 'showInventory',
      actionParams: {},
      label: 'Show inventory',
      startText: 'Here is everything I have. Use the item number if you want one.',
      doneText: '',
    }),
  },
  {
    test: (t) => {
      const hasBuildHouse = /\b(build|ابني|أنشئ|انشئ|بناء)\b/i.test(t) && /\b(house|منزل)\b/i.test(t);
      return hasBuildHouse || has(t, 'build me a house', 'build a house', 'make a house', 'ابني لي منزلا', 'ابني منزل', 'أنشئ منزلا');
    },
    build: () => ({
      actionType: 'buildHouse',
      actionParams: {},
      label: 'Build a house',
      startText: 'I will build a small house using wood.',
      doneText: 'House is ready.',
    }),
  },
  {
    test: (t) => has(t, 'run', 'run away', 'escape', 'flee', 'retreat', 'اهرب', 'هرب', 'نجا'),
    build: () => ({
      actionType: 'runAway',
      actionParams: {},
      label: 'Run away',
      startText: 'Running away from danger.',
      doneText: 'I am safe for now.',
    }),
  },
  {
    test: (t) => has(t, 'save this', 'save here', 'save house', 'save me'),
    build: (t) => ({
      actionType: 'saveLocation',
      actionParams: { name: t.includes('house') ? 'house' : t.includes('me') ? 'me' : 'saved place' },
      label: 'Save location',
      startText: 'Saving this location.',
      doneText: 'Location saved.',
    }),
  },
  {
    test: (t) => has(t, 'how', 'teach me', 'help me start', 'beginner guide'),
    build: (t) => ({
      actionType: 'helpGuide',
      actionParams: { itemName: extractItem(t) ?? 'crafting_table' },
      label: 'Beginner help',
      startText: 'I will guide you step by step.',
      doneText: '',
    }),
  },
  {
    test: (t) => has(t, 'find village', 'find dog', 'find cat', 'find horse', 'find camel', 'find flower', 'find potato', 'find crop', 'find a bed', 'find bed', 'ابحث عن القرية', 'جد القرية', 'ابحث عن الصندوق', 'جد الصندوق', 'ابحث عن الفراش', 'جد الفراش'),
    build: (t) => ({
      actionType: 'findEntity',
      actionParams: { query: t.replace(/^.*?find\s+/, '').replace(/^a\s+/, '').trim() },
      label: 'Find something',
      startText: 'I will search nearby.',
      doneText: 'Search finished.',
    }),
  },
  {
    test: (t) => has(t, 'find treasure', 'search treasure', 'find chest', 'look for treasure', 'ابحث عن الصندوق', 'جد الصندوق', 'ابحث عن الكنوز'),
    build: () => ({
      actionType: 'findEntity', actionParams: { query: 'treasure' }, label: 'Find treasure',
      startText: 'I will search for treasure chests nearby.', doneText: 'Treasure search finished.',
    }),
  },
  {
    test: (t) => {
      const s = t.trim();
      return s === 'menu' || s === 'commands' || s === 'help' || s === 'open menu' || s === 'قائمة' || s === 'الأوامر' || s === 'مساعدة';
    },
    build: () => ({
      actionType: 'showMenu',
      actionParams: {},
      label: 'Open menu',
      startText: 'Opening command menu.',
      doneText: 'Type a number or click a line.',
    }),
  },
  {
    test: (t) => has(t, 'stop here', 'stay here', 'stand here', 'wait here', 'hold position'),
    build: () => ({
      actionType: 'stay',
      actionParams: {},
      label: 'Stop here',
      startText: 'Stopping right here.',
      doneText: 'I am holding this exact spot.',
    }),
  },
  {
    test: (t) => has(t, 'dont follow me', 'do not follow me', 'stop following me', 'leave me alone', 'لا تتبعني', 'لا أريد أن تتبعني'),
    build: () => ({
      actionType: 'stop',
      actionParams: {},
      label: 'Stop following',
      startText: 'Stopping now.',
      doneText: 'All actions stopped.',
    }),
  },
  {
    test: (t) => has(t, 'stop', 'halt', 'freeze', 'cancel', 'stand still', 'توقف', 'قف', 'توقف هنا'),
    build: () => ({
      actionType: 'stop',
      actionParams: {},
      label: 'Stop',
      startText: 'Stopping now.',
      doneText: 'All actions stopped.',
    }),
  },
  {
    test: (t) =>
      has(t, 'follow') &&
      has(t, 'help', 'protect', 'guard', 'monster', 'mob', 'kill', 'fight', 'defend', 'hostile'),
    build: () => ({
      actionType: 'followGuard',
      actionParams: { distance: 3 },
      label: 'Follow and protect',
      startText: 'I will follow you and kill any monster that shows up.',
      doneText: 'Guarding you while I follow.',
    }),
  },
  {
    test: (t) => has(t, 'follow me', 'follow', 'come with me', 'tail me', 'come ride', 'fly with me', 'اتبعني', 'تبعني', 'تعال معي', 'طيري معي'),
    build: () => ({
      actionType: 'followPlayer',
      actionParams: { distance: 3 },
      label: 'Follow player',
      startText: 'Okay, following you.',
      doneText: 'I am right behind you.',
    }),
  },
  {
    test: (t) => has(t, 'ride with me', 'entr', 'enter', 'mount', 'board', 'اركب معي', 'الانضمام'),
    build: () => ({
      actionType: 'rideVehicle',
      actionParams: { distance: 3 },
      label: 'Ride vehicle',
      startText: 'I will get on the vehicle.',
      doneText: 'I am riding with you.',
    }),
  },
  {
    test: (t) => has(t, 'exit', 'get out', 'leave boat', 'leave vehicle', 'اخرج', 'خروج'),
    build: () => ({
      actionType: 'exitVehicle',
      actionParams: {},
      label: 'Exit vehicle',
      startText: 'I will get out of the vehicle.',
      doneText: 'I left the vehicle.',
    }),
  },
  {
    test: (t) => has(t, 'come get', 'come fetch', 'fetch me', 'get me', 'come collect'),
    build: (t) => {
      const item = extractItem(t.replace(/^come get\s+/i, '').replace(/^come fetch\s+/i, '').replace(/^fetch me\s+/i, '').replace(/^get me\s+/i, '')) ?? 'oak_log';
      const count = extractCount(t, 10);
      return {
        actionType: 'collectBlocks',
        actionParams: { blockType: item, count },
        label: `Collect ${count} ${prettyName(item)}`,
        startText: `Okay, I will get ${count} ${prettyName(item)}.`,
        doneText: `Finished collecting ${prettyName(item)}.`,
      };
    },
  },
  {
    test: (t) => /\d/.test(t) && !!extractItem(t),
    build: (t) => {
      const item = extractItem(t) ?? 'oak_log';
      const count = extractCount(t, 10);
      return {
        actionType: 'collectBlocks',
        actionParams: { blockType: item, count },
        label: `Collect ${count} ${prettyName(item)}`,
        startText: `Okay, I will get ${count} ${prettyName(item)}.`,
        doneText: `Finished collecting ${prettyName(item)}.`,
      };
    },
  },
  {
    test: (t) => has(t, 'come here', 'come to me', 'go to me', 'come', 'over here', 'تعال هنا', 'تعال إلي', 'أقرب إلي'),
    build: () => ({
      actionType: 'goToPlayer',
      actionParams: { distance: 2 },
      label: 'Go to player',
      startText: 'On my way to you.',
      doneText: 'I reached you.',
    }),
  },
  {
    test: (t) => has(t, 'kill this', 'destroy this', 'attack this', 'kill him', 'kill her'),
    build: () => ({
      actionType: 'attack', actionParams: { entityType: 'hostile' }, label: 'Attack target',
      startText: 'I will attack the nearest target.', doneText: 'Target attack finished.',
    }),
  },
  {
    test: (t) =>
      has(
        t,
        'give me everything',
        'give me all',
        'get me all',
        'get me everything',
        'drop everything',
        'give all',
        'all you have'
      ),
    build: () => ({
      actionType: 'giveAll',
      actionParams: {},
      label: 'Give everything',
      startText: 'Handing over everything I have.',
      doneText: 'That is all I was carrying.',
    }),
  },
  {
    test: (t) => has(t, 'mine diamond', 'mine diamonds', 'احفر الماس', 'منجم الماس', 'تعدين الماس'),
    build: () => ({
      actionType: 'searchBlock',
      actionParams: { blockType: 'diamond_ore' },
      label: 'Mine diamond',
      startText: 'I will look for diamond ore nearby.',
      doneText: 'Diamond search finished.',
    }),
  },
  {
    test: (t) => has(t, 'give me', 'give you', 'drop me', 'hand me', 'toss me', 'اعطني', 'أعطني', 'ارمِ لي'),
    build: (t) => {
      const item = extractItem(t) ?? 'sword';
      const count = extractCount(t, item === 'all' ? 64 : 1);
      if (item === 'all') {
        return {
          actionType: 'giveAll',
          actionParams: {},
          label: 'Give everything',
          startText: 'Handing over everything I have.',
          doneText: 'That is all I was carrying.',
        };
      }
      return {
        actionType: 'giveItem',
        actionParams: { itemName: item, count },
        label: `Give ${prettyName(item)}`,
        startText: `Okay, giving you ${prettyName(item)}.`,
        doneText: `Gave you ${prettyName(item)}.`,
      };
    },
  },
  {
    test: (t) => has(t, 'search for', 'look for', 'find me', 'find ', 'hunt for', 'locate'),
    build: (t) => {
      const item = extractItem(t) ?? 'diamond_ore';
      return {
        actionType: 'searchBlock',
        actionParams: { blockType: item },
        label: `Search ${prettyName(item)}`,
        startText: `Searching for ${prettyName(item)}.`,
        doneText: `Search for ${prettyName(item)} finished.`,
      };
    },
  },
  {
    test: (t) =>
      has(
        t,
        'bring me',
        'get me',
        'collect',
        'gather',
        'fetch',
        'mine me',
        'chop',
        'cut down',
        'harvest'
      ),
    build: (t) => {
      const item = extractItem(t) ?? 'oak_log';
      const count = extractCount(t, 8);
      return {
        actionType: 'collectBlocks',
        actionParams: { blockType: item, count },
        label: `Collect ${count} ${prettyName(item)}`,
        startText: `Okay, I will get ${count} ${prettyName(item)}.`,
        doneText: `Finished collecting ${prettyName(item)}.`,
      };
    },
  },
  {
    test: (t) => has(t, 'make torches', 'craft torches', 'create torches', 'اصنع المشاعل', 'اصنع شعلات'),
    build: () => ({
      actionType: 'craft',
      actionParams: { itemName: 'torch', count: 10 },
      label: 'Make torches',
      startText: 'I will craft some torches.',
      doneText: 'Torches are ready.',
    }),
  },
  {
    test: (t) => has(t, 'craft', 'make', 'create', 'build', 'smelt'),
    build: (t) => {
      const item = extractItem(t) ?? 'furnace';
      const count = extractCount(t, 1);
      return {
        actionType: 'craft',
        actionParams: { itemName: item, count },
        label: `Craft ${prettyName(item)}`,
        startText: `Okay, I will craft a ${prettyName(item)}.`,
        doneText: `${prettyName(item)} is ready.`,
      };
    },
  },
  {
    test: (t) => has(t, 'place', 'put down', 'set down'),
    build: (t) => {
      const item = extractItem(t) ?? 'furnace';
      return {
        actionType: 'placeBlock',
        actionParams: { itemName: item },
        label: `Place ${prettyName(item)}`,
        startText: `Placing a ${prettyName(item)}.`,
        doneText: `Placed the ${prettyName(item)}.`,
      };
    },
  },
  {
    test: (t) => has(t, 'attack', 'kill', 'fight', 'slay'),
    build: (t) => {
      const mobs = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman'];
      const mob = mobs.find((m) => t.includes(m)) ?? 'hostile';
      return {
        actionType: 'attack',
        actionParams: { entityType: mob },
        label: `Attack ${mob}`,
        startText: `Fighting ${mob === 'hostile' ? 'the nearest monster' : 'a ' + mob}.`,
        doneText: 'Fight finished.',
      };
    },
  },
  {
    test: (t) => has(t, 'equip sword', 'equip pickaxe', 'equip axe', 'equip shovel', 'equip shield', 'equip armor', 'put on armor', 'wear armor', 'put armor', 'wear shield', 'put on shield'),
    build: (t) => ({
      actionType: 'equip',
      actionParams: { itemName: extractItem(t) ?? 'sword' },
      label: 'Equip item',
      startText: 'I will equip that item.',
      doneText: 'Item equipped.',
    }),
  },
  {
    test: (t) => has(t, 'sleep', 'go to bed', 'bed', 'نوم', 'اذهب إلى السرير', 'السرير'),
    build: () => ({
      actionType: 'goToBed',
      actionParams: {},
      label: 'Sleep',
      startText: 'Looking for a bed.',
      doneText: 'Sleeping.',
    }),
  },
  {
    test: (t) => has(t, 'eat', 'food', 'hungry', 'كل الطعام', 'تناول الطعام', 'تغذية', 'اكل', 'طعام'),
    build: () => ({
      actionType: 'eat',
      actionParams: {},
      label: 'Eat',
      startText: 'Eating something from my inventory.',
      doneText: 'I ate.',
    }),
  },
  {
    test: (t) => has(t, 'jump'),
    build: () => ({
      actionType: 'jump',
      actionParams: {},
      label: 'Jump',
      startText: 'Jumping!',
      doneText: 'Jumped.',
    }),
  },
];

/**
 * Keyword matching only. No LLM.
 * First matching rule wins (rules are ordered from most specific to least).
 */
export function parseChat(message: string): ParsedIntent | null {
  const text = message.toLowerCase();
  for (const rule of RULES) {
    if (rule.test(text)) return rule.build(text);
  }
  return null;
}

export function describeIntent(intent: ParsedIntent): string {
  return intent.label;
}

export const EXAMPLE_TRIGGERS = [
  'go fishing',
  'build me a house',
  'mine diamond',
  'make torches',
  'find treasure',
  'find chest',
  'ride with me',
  'kill this',
  'tame dog',
  'tame cat',
  'farm crops',
  'plant seeds',
  'harvest crops',
  'bring me sand',
  'bring me cobblestone',
  'bring me dirt',
  'bring me gravel',
  'search for iron',
  'search for coal',
  'craft a sword',
  'craft a pickaxe',
  'craft an axe',
  'craft a shovel',
  'craft a shield',
  'craft torches',
  'find a bed',
  'build me a house',
  'mine diamond',
  'make torches',
  'eat food',
  'equip sword',
  'show me',
  'run away',
  'sleep',
  'find village',
  'find dog',
  'find cat',
  'find horse',
  'find camel',
  'save house',
  'save me',
  'how do I craft a sword',
  'follow me',
  'follow me and help me',
  'fly with me',
  'entr',
  'come get diamond',
  'come get gold',
  'come get stone',
  'put on armor',
  'wear armor',
  'dont follow me',
  'stop here',
  'stop',
  'come here',
  'give me everything',
  'give me a sword',
  'give me food',
  'give me all',
  'ابني لي منزلا',
  'احفر الماس',
  'اصنع المشاعل',
  'اذهب للصيد',
  'ابحث عن القرية',
  'ابحث عن الصندوق',
  'اهرب',
  'نوم',
  'كل الطعام',
  'اعطني طعام',
  'اعطني سيف',
  'اعطني كل شيء',
  'اتبعني',
  'لا تتبعني',
  'give me armor',
  'give me food',
  'give me a boat',
  'bring me 10 wood',
  'bring me 16 stone',
  'search for diamond',
  'search for gold',
  'create a furnace',
  'craft a crafting table',
];
