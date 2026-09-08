/** Longest aliases first. Rule-based only. */

export const ITEM_ALIASES: Array<[string, string]> = [
  ['crafting table', 'crafting_table'],
  ['craft table', 'crafting_table'],
  ['table', 'crafting_table'],
  ['workbench', 'crafting_table'],
  ['netherite sword', 'netherite_sword'],
  ['diamond sword', 'diamond_sword'],
  ['iron sword', 'iron_sword'],
  ['golden sword', 'golden_sword'],
  ['gold sword', 'golden_sword'],
  ['stone sword', 'stone_sword'],
  ['wooden sword', 'wooden_sword'],
  ['wood sword', 'wooden_sword'],
  ['diamond pickaxe', 'diamond_pickaxe'],
  ['iron pickaxe', 'iron_pickaxe'],
  ['pick axe', 'pickaxe'],
  ['pick', 'pickaxe'],
  ['diamond armor', 'diamond_chestplate'],
  ['iron armor', 'iron_chestplate'],
  ['oak log', 'oak_log'],
  ['birch log', 'birch_log'],
  ['spruce log', 'spruce_log'],
  ['jungle log', 'jungle_log'],
  ['acacia log', 'acacia_log'],
  ['dark oak log', 'dark_oak_log'],
  ['diamond ore', 'diamond_ore'],
  ['gold ore', 'gold_ore'],
  ['iron ore', 'iron_ore'],
  ['coal ore', 'coal_ore'],
  ['copper ore', 'copper_ore'],
  ['redstone ore', 'redstone_ore'],
  ['lapis ore', 'lapis_ore'],
  ['emerald ore', 'emerald_ore'],
  ['cobblestone', 'cobblestone'],
  ['deepslate', 'deepslate'],
  ['obsidian', 'obsidian'],
  ['furnace', 'furnace'],
  ['oven', 'furnace'],
  ['smelter', 'furnace'],
  ['chest', 'chest'],
  ['torch', 'torch'],
  ['torches', 'torch'],
  ['stick', 'stick'],
  ['sticks', 'stick'],
  ['plank', 'oak_planks'],
  ['planks', 'oak_planks'],
  ['wood plank', 'oak_planks'],
  ['boat', 'oak_boat'],
  ['oak boat', 'oak_boat'],
  ['bread', 'bread'],
  ['apple', 'apple'],
  ['steak', 'cooked_beef'],
  ['beef', 'cooked_beef'],
  ['pork', 'cooked_porkchop'],
  ['chicken', 'cooked_chicken'],
  ['carrot', 'carrot'],
  ['potato', 'potato'],
  ['food', 'food'],
  ['armor', 'armor'],
  ['armour', 'armor'],
  ['helmet', 'helmet'],
  ['chestplate', 'chestplate'],
  ['leggings', 'leggings'],
  ['boots', 'boots'],
  ['shield', 'shield'],
  ['sword', 'sword'],
  ['pickaxe', 'pickaxe'],
  ['axe', 'axe'],
  ['shovel', 'shovel'],
  ['diamond', 'diamond_ore'],
  ['diamonds', 'diamond_ore'],
  ['gold', 'gold_ore'],
  ['iron', 'iron_ore'],
  ['coal', 'coal_ore'],
  ['copper', 'copper_ore'],
  ['redstone', 'redstone_ore'],
  ['lapis', 'lapis_ore'],
  ['emerald', 'emerald_ore'],
  ['stone', 'stone'],
  ['dirt', 'dirt'],
  ['sand', 'sand'],
  ['gravel', 'gravel'],
  ['wood', 'oak_log'],
  ['logs', 'oak_log'],
  ['log', 'oak_log'],
  ['trees', 'oak_log'],
  ['tree', 'oak_log'],
  ['everything', 'all'],
  ['all items', 'all'],
  ['inventory', 'all'],
];

export const HOSTILE_MOBS = [
  'zombie',
  'skeleton',
  'creeper',
  'spider',
  'cave_spider',
  'enderman',
  'witch',
  'drowned',
  'pillager',
  'vindicator',
  'evoker',
  'ravager',
  'phantom',
  'blaze',
  'slime',
  'magma_cube',
  'hoglin',
  'piglin',
  'ghast',
  'warden',
  'wither_skeleton',
  'zombified_piglin',
];

export const FOOD_NAMES = [
  'bread',
  'apple',
  'golden_apple',
  'cooked_beef',
  'cooked_porkchop',
  'cooked_chicken',
  'cooked_mutton',
  'cooked_cod',
  'cooked_salmon',
  'carrot',
  'potato',
  'baked_potato',
  'melon_slice',
  'cookie',
  'pumpkin_pie',
  'beetroot',
  'dried_kelp',
  'mushroom_stew',
];

export function resolveBlockVariants(name: string): string[] {
  if (name === 'oak_log' || name === 'wood') {
    return [
      'oak_log',
      'birch_log',
      'spruce_log',
      'jungle_log',
      'acacia_log',
      'dark_oak_log',
      'mangrove_log',
      'cherry_log',
    ];
  }
  if (name === 'stone') {
    return ['stone', 'cobblestone', 'deepslate', 'andesite', 'diorite', 'granite'];
  }
  if (name.endsWith('_ore')) {
    const base = name;
    return [base, `deepslate_${base}`];
  }
  if (name === 'dirt') return ['dirt', 'grass_block', 'coarse_dirt'];
  return [name];
}

export function extractCount(text: string, fallback = 1): number {
  const match = text.match(/\b(\d+)\b/);
  if (!match) return fallback;
  return Math.min(64, Math.max(1, Number(match[1])));
}

export function extractItem(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [alias, item] of ITEM_ALIASES) {
    if (lower.includes(alias)) return item;
  }
  return null;
}

export function prettyName(id: string): string {
  if (id === 'all') return 'everything';
  if (id === 'food') return 'food';
  if (id === 'armor') return 'armor';
  if (id === 'sword') return 'a sword';
  return id.replace(/_/g, ' ');
}
