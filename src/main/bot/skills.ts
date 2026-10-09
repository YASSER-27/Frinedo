import { Bot } from 'mineflayer';
import { goals, Movements } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { plugin as collectBlockPlugin } from 'mineflayer-collectblock';
import { FOOD_NAMES, HOSTILE_MOBS, resolveBlockVariants } from '../../shared/items';

let collectLoaded = false;

export function ensurePlugins(bot: Bot): void {
  if (!collectLoaded) {
    bot.loadPlugin(collectBlockPlugin);
    collectLoaded = true;
  }
}

export function hardStop(bot: Bot): string {
  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
  return 'Stopped.';
}

export function inventoryReport(bot: Bot): string {
  const items = bot.inventory.items();
  if (items.length === 0) return 'My inventory is empty.';
  return items.map((item, index) => `${index + 1}. ${item.name.replace(/_/g, ' ')} x${item.count}`).join('\n');
}

export function isFoodItem(name: string): boolean {
  return FOOD_NAMES.includes(name) || ['bread', 'apple', 'golden_apple', 'pumpkin_pie', 'cookie', 'beetroot', 'melon_slice', 'sweet_berries'].includes(name);
}

export function nearestFoodAnimal(bot: Bot): { name: string; position: Vec3 } | null {
  const candidates = Object.values(bot.entities)
    .filter((entity) => entity && (entity as any).type === 'mob' && entity.isValid)
    .map((entity) => ({
      name: String((entity as any).name ?? '').toLowerCase(),
      position: (entity as any).position as Vec3,
    }))
    .filter(({ name }) => ['cow', 'sheep', 'pig', 'chicken', 'rabbit', 'mooshroom'].includes(name));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const da = a.position.distanceTo(bot.entity.position);
    const db = b.position.distanceTo(bot.entity.position);
    return da - db;
  });

  return candidates[0];
}

export async function collectNearbyFood(bot: Bot): Promise<string> {
  const targets = ['wheat', 'carrots', 'potatoes', 'beetroots', 'sweet_berries', 'melon_slice', 'pumpkin'];
  const results: string[] = [];

  for (const target of targets) {
    const ids = findBlockNames(bot, [target]);
    if (ids.length === 0) continue;

    const found = bot.findBlock({ matching: ids, maxDistance: 64 });
    if (!found) continue;

    const result = await collectByName(bot, target, 4);
    results.push(result);
  }

  return results.join(' ');
}

export async function depositFoodToChest(bot: Bot): Promise<string> {
  const chestIds = findBlockNames(bot, ['chest', 'trapped_chest', 'barrel']);
  if (chestIds.length === 0) {
    return 'No chest nearby.';
  }

  const chestBlock = bot.findBlock({ matching: chestIds, maxDistance: 24 });
  if (!chestBlock) {
    return 'No chest nearby.';
  }

  const chest = await (bot as any).openChest(chestBlock).catch(() => null);
  if (!chest || typeof chest.deposit !== 'function') {
    return 'Chest unavailable.';
  }

  let stored = 0;
  const items = bot.inventory.items().filter((item) => isFoodItem(item.name));
  for (const item of items) {
    try {
      await chest.deposit(item.type, null, item.count);
      stored += item.count;
    } catch {
      // ignore item-level failures and continue
    }
  }

  if (typeof chest.close === 'function') {
    try {
      await chest.close();
    } catch {
      // ignore close failures
    }
  }

  return stored > 0 ? `Stored ${stored} food items in a chest.` : 'No food to store.';
}

export async function tossInventoryIndex(bot: Bot, username: string, index: number): Promise<string> {
  const item = bot.inventory.items()[index - 1];
  if (!item) return `There is no inventory item numbered ${index}.`;
  return tossToPlayer(bot, username, item.name, item.count);
}

export function runAway(bot: Bot): string {
  const hostile = nearestHostile(bot);
  if (!hostile) return 'There is no monster close to me.';
  const origin = bot.entity.position;
  const dx = origin.x - hostile.position.x;
  const dz = origin.z - hostile.position.z;
  const length = Math.max(1, Math.sqrt(dx * dx + dz * dz));
  const target = origin.offset((dx / length) * 16, 0, (dz / length) * 16);
  bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, 2));
  return 'I am moving away from the monster.';
}

export async function fish(bot: Bot): Promise<string> {
  const fishBot = bot as Bot & { fish?: () => Promise<void> };
  if (!fishBot.fish) return 'Fishing needs a fishing plugin or a fishing rod helper.';
  try {
    await fishBot.fish();
    return 'I caught a fish.';
  } catch {
    return 'I could not fish here. I need a rod and water nearby.';
  }
}

export async function tameAnimal(bot: Bot, animal: string): Promise<string> {
  const entity = bot.nearestEntity((candidate) => String(candidate.name ?? '').toLowerCase().includes(animal));
  if (!entity) return `I cannot find a ${animal} nearby.`;
  return `I found the ${animal}. Taming requires the correct food in my hand.`;
}

export async function farmNearby(bot: Bot): Promise<string> {
  const cropNames = ['wheat', 'carrots', 'potatoes', 'beetroots'];
  const ids = findBlockNames(bot, cropNames);
  const crop = ids.length ? bot.findBlock({ matching: ids, maxDistance: 32 }) : undefined;
  if (!crop) return 'I cannot find a crop field nearby.';
  await bot.pathfinder.goto(new goals.GoalNear(crop.position.x, crop.position.y, crop.position.z, 2));
  return 'I found a crop field nearby.';
}

export async function findEntity(bot: Bot, query: string): Promise<string> {
  const aliases: Record<string, string[]> = {
    dog: ['wolf'], cat: ['cat'], horse: ['horse'], camel: ['camel'], village: ['villager'],
    flower: ['poppy', 'dandelion', 'allium', 'azure_bluet', 'cornflower', 'blue_orchid'],
    treasure: ['chest', 'barrel'],
    bed: ['bed'],
    potato: ['potatoes', 'potato'], crop: ['wheat', 'carrots', 'potatoes', 'beetroots'],
  };
  const names = aliases[query] ?? [query.replace(/ /g, '_')];
  const entity = bot.nearestEntity((candidate) => names.some((name) =>
    String(candidate.name ?? '').toLowerCase().includes(name)
  ));
  if (entity) {
    await bot.pathfinder.goto(new goals.GoalNear(entity.position.x, entity.position.y, entity.position.z, 2));
    return `I found ${query} nearby.`;
  }
  const blockNames = resolveBlockVariants(query);
  const ids = findBlockNames(bot, blockNames);
  const block = ids.length ? bot.findBlock({ matching: ids, maxDistance: 96 }) : undefined;
  if (!block) return `I could not find ${query} nearby.`;
  await bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2));
  return `I found ${query} nearby.`;
}

export function helpGuide(bot: Bot, itemName: string): string {
  const available = bot.inventory.items().map((item) => item.name).join(', ');
  const guides: Record<string, string> = {
    crafting_table: 'Beginner guide: collect 3 logs, craft planks, then use 4 planks to craft a crafting table. Your inventory has: ' + available,
    wooden_sword: 'Beginner guide: craft planks, craft sticks, then use 2 planks and 1 stick on a crafting table to make a wooden sword.',
    wooden_pickaxe: 'Beginner guide: craft planks and sticks, then use 3 planks and 2 sticks on a crafting table to make a wooden pickaxe.',
  };
  return guides[itemName] ?? 'Beginner guide: collect wood, make planks, make sticks, craft a table, then craft tools from the table.';
}

export async function followPlayer(bot: Bot, username: string, distance = 3): Promise<string> {
  const target = bot.players[username]?.entity;
  if (!target) return `I cannot see ${username}.`;
  bot.pathfinder.setGoal(new goals.GoalFollow(target, distance), true);
  return `Following ${username}.`;
}

export async function goToPlayer(bot: Bot, username: string, distance = 2): Promise<string> {
  const target = bot.players[username]?.entity;
  if (!target) return `I cannot see ${username}.`;
  const p = target.position;
  bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, distance));
  return `Going to ${username}.`;
}

export function stayHere(bot: Bot): string {
  const p = bot.entity.position;
  bot.pathfinder.setGoal(new goals.GoalBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)));
  bot.clearControlStates();
  return `Holding this exact block: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}.`;
}

export function showLocation(bot: Bot): string {
  const p = bot.entity.position;
  return `I am at ${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}.`;
}

export function here(bot: Bot, action: string): string {
  bot.pathfinder.setGoal(null);
  if (action === 'crouch' || action === 'prone') {
    bot.setControlState('sneak', true);
    return 'I am crouching here.';
  }
  return 'I will stay and work right here.';
}

export function crouch(bot: Bot): string {
  bot.setControlState('sneak', true);
  return 'I am crouching.';
}

export function prone(bot: Bot): string {
  bot.setControlState('sneak', true);
  bot.setControlState('forward', false);
  return 'I am lying low here.';
}

export function sit(bot: Bot): string {
  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
  return 'I am sitting here.';
}

export async function jumpRepeated(bot: Bot, count = 5): Promise<string> {
  for (let index = 0; index < count; index += 1) {
    bot.setControlState('jump', true);
    await new Promise((resolve) => setTimeout(resolve, 220));
    bot.setControlState('jump', false);
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return `I jumped ${count} times.`;
}

export async function dropHeld(bot: Bot): Promise<string> {
  const held = bot.heldItem;
  if (!held) return 'I am not holding an item.';
  await bot.tossStack(held);
  return `I dropped the ${held.name.replace(/_/g, ' ')}.`;
}

function findBlockNames(bot: Bot, names: string[]): number[] {
  const ids: number[] = [];
  for (const name of names) {
    const b = bot.registry.blocksByName[name];
    if (b) ids.push(b.id);
  }
  return ids;
}

export async function collectByName(bot: Bot, blockType: string, count: number, maxDistance = 64, shouldStop: () => boolean = () => false): Promise<string> {
  ensurePlugins(bot);
  const names = resolveBlockVariants(blockType);
  const ids = findBlockNames(bot, names);
  if (ids.length === 0) return `I do not know the block "${blockType}".`;

  const positions = bot.findBlocks({
    matching: ids,
    maxDistance,
    count: Math.min(count, 48),
  });

  if (positions.length === 0) {
    return `I cannot find any ${blockType.replace(/_/g, ' ')} nearby.`;
  }

  let collected = 0;
  for (const pos of positions) {
    if (collected >= count || shouldStop()) {
      bot.pathfinder.setGoal(null);
      break;
    }
    const block = bot.blockAt(pos);
    if (!block) continue;
    try {
      await bot.collectBlock.collect(block);
      collected += 1;
    } catch {
      try {
        await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
        await bot.dig(block);
        collected += 1;
      } catch {
        // skip
      }
    }
  }

  return `Collected ${collected}/${count} ${blockType.replace(/_/g, ' ')}.`;
}

export async function searchBlock(bot: Bot, blockType: string): Promise<string> {
  const names = resolveBlockVariants(blockType);
  const ids = findBlockNames(bot, names);
  if (ids.length === 0) return `I do not know "${blockType}".`;

  const found = bot.findBlock({
    matching: ids,
    maxDistance: 96,
  });

  if (!found) return `No ${blockType.replace(/_/g, ' ')} within 96 blocks.`;

  try {
    await bot.pathfinder.goto(
      new goals.GoalNear(found.position.x, found.position.y, found.position.z, 2)
    );
  } catch {
    return `I found ${found.name} at ${found.position.x} ${found.position.y} ${found.position.z}, but the path is blocked.`;
  }
  return `Found ${found.name} at ${found.position.x} ${found.position.y} ${found.position.z}.`;
}

function inventoryMatches(bot: Bot, query: string) {
  const q = query.toLowerCase();
  return bot.inventory.items().filter((item) => {
    if (q === 'sword') return item.name.includes('sword');
    if (q === 'armor' || q === 'helmet' || q === 'chestplate' || q === 'leggings' || q === 'boots') {
      return (
        item.name.includes('helmet') ||
        item.name.includes('chestplate') ||
        item.name.includes('leggings') ||
        item.name.includes('boots') ||
        item.name.includes('shield')
      );
    }
    if (q === 'food') return FOOD_NAMES.includes(item.name) || item.name.includes('cooked');
    if (q === 'boat') return item.name.includes('boat');
    if (q === 'pickaxe') return item.name.includes('pickaxe');
    if (q === 'axe' && !q.includes('pick')) return item.name.includes('axe') && !item.name.includes('pickaxe');
    return item.name.includes(q) || item.name === q;
  });
}

export async function tossToPlayer(
  bot: Bot,
  username: string,
  itemQuery: string,
  count: number
): Promise<string> {
  const player = bot.players[username]?.entity;
  if (!player) return `I cannot see ${username}.`;

  await bot.pathfinder.goto(
    new goals.GoalNear(player.position.x, player.position.y, player.position.z, 3)
  );
  await bot.lookAt(player.position.offset(0, player.height, 0));

  const matches = inventoryMatches(bot, itemQuery);
  if (matches.length === 0) {
    return `I do not have any ${itemQuery.replace(/_/g, ' ')}.`;
  }

  let remaining = count;
  let tossed = 0;
  for (const item of matches) {
    if (remaining <= 0) break;
    const n = Math.min(item.count, remaining);
    await bot.toss(item.type, null, n);
    tossed += n;
    remaining -= n;
  }
  return `Dropped ${tossed} ${itemQuery.replace(/_/g, ' ')} for you.`;
}

export async function tossEverything(bot: Bot, username: string): Promise<string> {
  const player = bot.players[username]?.entity;
  if (!player) return `I cannot see ${username}.`;
  await bot.pathfinder.goto(
    new goals.GoalNear(player.position.x, player.position.y, player.position.z, 3)
  );
  await bot.lookAt(player.position.offset(0, player.height, 0));

  const items = bot.inventory.items();
  if (items.length === 0) return 'My inventory is empty.';

  let tossed = 0;
  for (const item of items) {
    await bot.toss(item.type, null, item.count);
    tossed += item.count;
  }
  return `Dropped all ${tossed} items for you.`;
}

export async function craftItem(bot: Bot, itemName: string, count = 1, shouldStop: () => boolean = () => false): Promise<string> {
  if (shouldStop()) return 'Crafting cancelled.';
  const item = bot.registry.itemsByName[itemName];
  if (!item) return `I do not know how to craft "${itemName.replace(/_/g, ' ')}".`;

  let recipes = bot.recipesFor(item.id, null, 1, false);
  let table = bot.findBlock({
    matching: bot.registry.blocksByName.crafting_table?.id ?? -1,
    maxDistance: 16,
  });

  if ((!recipes || recipes.length === 0) && table) {
    recipes = bot.recipesFor(item.id, null, 1, true);
  }

  if (!recipes || recipes.length === 0) {
    recipes = bot.recipesFor(item.id, null, 1, true);
    if (!recipes || recipes.length === 0) {
      return `I have no recipe or materials for ${itemName.replace(/_/g, ' ')}.`;
    }
    if (!table) {
      return `I need a crafting table to make ${itemName.replace(/_/g, ' ')}.`;
    }
  }

  if (table) {
    try {
      await bot.pathfinder.goto(new goals.GoalNear(table.position.x, table.position.y, table.position.z, 2));
    } catch {
      return 'Could not reach the crafting table.';
    }
  }

  try {
    if (shouldStop()) return 'Crafting cancelled.';
    await bot.craft(recipes[0], count, table ?? undefined);
    return `Crafted ${count} ${itemName.replace(/_/g, ' ')}.`;
  } catch {
    return `Failed to craft ${itemName.replace(/_/g, ' ')}. Missing materials.`;
  }
}

export async function placeNearby(bot: Bot, itemName: string): Promise<string> {
  const item = bot.inventory.items().find((i) => i.name === itemName || i.name.includes(itemName));
  if (!item) return `I do not have a ${itemName.replace(/_/g, ' ')} to place.`;

  await bot.equip(item, 'hand');
  const ref = bot.blockAt(bot.entity.position.offset(0, -1, 0));
  if (!ref) return 'No ground to place on.';

  const face = new Vec3(0, 1, 0);
  try {
    await bot.placeBlock(ref, face);
    return `Placed ${item.name}.`;
  } catch {
    const dest = bot.blockAt(bot.entity.position.offset(1, 0, 0));
    if (!dest) return 'Could not place the block.';
    try {
      await bot.placeBlock(dest, new Vec3(0, 1, 0));
      return `Placed ${item.name}.`;
    } catch {
      return `Could not place ${itemName.replace(/_/g, ' ')}.`;
    }
  }
}

async function placeBlockRelative(bot: Bot, itemName: string, offsetX: number, offsetY: number, offsetZ: number): Promise<boolean> {
  const item = bot.inventory.items().find((entry) => entry.name === itemName || entry.name.includes(itemName));
  if (!item) return false;

  try {
    await bot.equip(item, 'hand');
    const target = bot.entity.position.offset(offsetX, offsetY, offsetZ);
    const ref = bot.blockAt(target.offset(0, -1, 0));
    if (!ref) return false;
    await bot.placeBlock(ref, new Vec3(0, 1, 0));
    return true;
  } catch {
    return false;
  }
}

export async function buildHouse(bot: Bot, username: string, shouldStop: () => boolean = () => false): Promise<string> {
  const player = bot.players[username]?.entity ?? null;
  if (!player) return `I cannot see ${username}.`;

  await collectByName(bot, 'oak_log', 12, 64, shouldStop);
  await craftItem(bot, 'oak_planks', 12, shouldStop);

  const base = player.position.clone();
  const placements: Array<[string, number, number, number]> = [
    ['oak_planks', -1, 0, -1], ['oak_planks', 0, 0, -1], ['oak_planks', 1, 0, -1],
    ['oak_planks', -1, 0, 0], ['oak_planks', 1, 0, 0],
    ['oak_planks', -1, 0, 1], ['oak_planks', 0, 0, 1], ['oak_planks', 1, 0, 1],
    ['oak_planks', -1, 1, -1], ['oak_planks', 0, 1, -1], ['oak_planks', 1, 1, -1],
    ['oak_planks', -1, 1, 0], ['oak_planks', 1, 1, 0],
    ['oak_planks', -1, 1, 1], ['oak_planks', 0, 1, 1], ['oak_planks', 1, 1, 1],
    ['oak_planks', 0, 2, 0],
  ];

  try {
    await bot.pathfinder.goto(new goals.GoalNear(base.x, base.y, base.z, 2));
  } catch {
    // ignore path issues and still try to place nearby
  }

  let placed = 0;
  for (const [itemName, x, y, z] of placements) {
    if (shouldStop()) break;
    if (await placeBlockRelative(bot, itemName, x, y, z)) {
      placed += 1;
    }
  }

  return placed > 0
    ? `I built a small wooden house near ${username} with ${placed} blocks.`
    : 'I could not finish the house because I ran out of wood.';
}

export async function rideVehicle(bot: Bot, username: string): Promise<string> {
  const player = bot.players[username]?.entity;
  if (!player) return `I cannot see ${username}.`;

  const mountable = bot as Bot & {
    mount?: (entity: any) => Promise<void>;
    vehicle?: any;
  };

  if (!mountable.mount) return 'Mounting is not supported in this bot build.';

  const vehicle = bot.nearestEntity((entity) => {
    const name = (entity.name ?? '').toLowerCase();
    return ['boat', 'minecart', 'horse', 'donkey', 'pig', 'camel', 'strider'].includes(name);
  });

  if (!vehicle) return 'I cannot find a nearby vehicle to ride.';

  await bot.pathfinder.goto(new goals.GoalNear(vehicle.position.x, vehicle.position.y, vehicle.position.z, 2));
  await mountable.mount(vehicle);
  return 'I am riding the nearby vehicle.';
}

export async function exitVehicle(bot: Bot): Promise<string> {
  const mountable = bot as Bot & {
    dismount?: () => Promise<void>;
    vehicle?: any;
  };

  if (!mountable.dismount) return 'Leaving the vehicle is not supported in this bot build.';
  if (!mountable.vehicle) return 'I am not riding anything right now.';

  await mountable.dismount();
  return 'I got out of the vehicle.';
}

export function nearestHostile(bot: Bot, maxDistance = 6) {
  return bot.nearestEntity((e) => {
    const name = (e.name ?? '').toLowerCase();
    return HOSTILE_MOBS.includes(name) && e.position.distanceTo(bot.entity.position) < maxDistance && canEngageEntity(bot, e);
  });
}

function canEngageEntity(bot: Bot, entity: any): boolean {
  const canSeeEntity = (bot as Bot & { canSeeEntity?: (target: any) => boolean }).canSeeEntity;
  return typeof canSeeEntity === 'function' ? canSeeEntity.call(bot, entity) : true;
}

export async function attackTarget(bot: Bot, entityType: string, shouldStop: () => boolean = () => false): Promise<string> {
  const wanted = entityType === 'hostile' ? null : entityType;
  const entity = bot.nearestEntity((e) => {
    const name = (e.name ?? '').toLowerCase();
    if (wanted) return name === wanted || name.includes(wanted);
    return HOSTILE_MOBS.includes(name);
  });
  if (!entity) return 'No target nearby.';
  if (entity.position.distanceTo(bot.entity.position) > 5 || !canEngageEntity(bot, entity)) {
    return 'The target is too far away or blocked.';
  }

  const sword = bot.inventory.items().find((i) => i.name.includes('sword'));
  if (sword) {
    try {
      await bot.equip(sword, 'hand');
    } catch {
      // ignore
    }
  }

  const start = Date.now();
  while (entity.isValid && Date.now() - start < 6000 && !shouldStop()) {
    try {
      if (entity.position.distanceTo(bot.entity.position) > 3) break;
      await bot.attack(entity);
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  bot.pathfinder.setGoal(null);
  return entity.isValid ? 'Target ran away.' : `Killed ${entity.name}.`;
}

export async function takeFrontItem(bot: Bot): Promise<string> {
  const item = bot.nearestEntity((entity) => {
    if (entity.name !== 'item') return false;
    const delta = entity.position.minus(bot.entity.position);
    const distance = Math.sqrt(delta.x * delta.x + delta.z * delta.z);
    if (distance > 8 || distance < 0.1) return false;
    const forwardX = -Math.sin(bot.entity.yaw);
    const forwardZ = -Math.cos(bot.entity.yaw);
    return (delta.x * forwardX + delta.z * forwardZ) / distance > 0.25;
  });
  if (!item) return 'I cannot see an item in front of me.';
  try {
    await bot.pathfinder.goto(new goals.GoalNear(item.position.x, item.position.y, item.position.z, 1));
  } catch {
    bot.pathfinder.setGoal(null);
    if (item.position.distanceTo(bot.entity.position) > 2) {
      return 'I could not reach the item safely.';
    }
  }
  return item.isValid ? 'I reached the item in front of me.' : 'I picked up the item in front of me.';
}

export function wakeUp(bot: Bot): string {
  const sleeper = bot as Bot & { isSleeping?: boolean; wake?: () => void };
  if (sleeper.isSleeping && sleeper.wake) sleeper.wake();
  bot.clearControlStates();
  return 'I am awake and will not sleep.';
}

export async function goToBed(bot: Bot): Promise<string> {
  const beds = Object.values(bot.registry.blocksByName)
    .filter((b) => b.name.includes('bed'))
    .map((b) => b.id);
  const pos = bot.findBlock({ matching: beds, maxDistance: 32 });
  if (!pos) return 'No bed nearby.';
  try {
    await bot.sleep(pos);
    return 'Sleeping.';
  } catch (err) {
    return `Cannot sleep: ${err instanceof Error ? err.message : 'failed'}.`;
  }
}

export async function eatFood(bot: Bot): Promise<string> {
  const food = bot.inventory.items().find((i) => FOOD_NAMES.includes(i.name));
  if (!food) return 'I have no food.';
  await bot.equip(food, 'hand');
  try {
    await bot.consume();
    return `Ate ${food.name.replace(/_/g, ' ')}.`;
  } catch {
    return 'Could not eat right now.';
  }
}

export async function jumpOnce(bot: Bot): Promise<string> {
  bot.setControlState('jump', true);
  await new Promise((r) => setTimeout(r, 250));
  bot.setControlState('jump', false);
  return 'Jumped.';
}

export async function equipBest(bot: Bot, query: string): Promise<string> {
  const matches = inventoryMatches(bot, query);
  if (matches.length === 0) return `I do not have ${query}.`;
  const ranked = [...matches].sort((a, b) => rankItem(b.name) - rankItem(a.name));
  const item = ranked[0];
  let dest: 'hand' | 'head' | 'torso' | 'legs' | 'feet' | 'off-hand' = 'hand';
  if (item.name.includes('helmet')) dest = 'head';
  else if (item.name.includes('chestplate') || item.name.includes('elytra')) dest = 'torso';
  else if (item.name.includes('leggings')) dest = 'legs';
  else if (item.name.includes('boots')) dest = 'feet';
  else if (item.name.includes('shield')) dest = 'off-hand';
  await bot.equip(item, dest);
  return `Equipped ${item.name.replace(/_/g, ' ')}.`;
}

function rankItem(name: string): number {
  const tiers: Record<string, number> = {
    wooden_sword: 1,
    stone_sword: 2,
    iron_sword: 3,
    diamond_sword: 4,
    netherite_sword: 5,
    wooden_pickaxe: 1,
    stone_pickaxe: 2,
    iron_pickaxe: 3,
    diamond_pickaxe: 4,
    netherite_pickaxe: 5,
    wooden_axe: 1,
    stone_axe: 2,
    iron_axe: 3,
    diamond_axe: 4,
    netherite_axe: 5,
    wooden_shovel: 1,
    stone_shovel: 2,
    iron_shovel: 3,
    diamond_shovel: 4,
    netherite_shovel: 5,
    leather_helmet: 1,
    iron_helmet: 2,
    diamond_helmet: 3,
    netherite_helmet: 4,
    leather_chestplate: 1,
    iron_chestplate: 2,
    diamond_chestplate: 3,
    netherite_chestplate: 4,
    leather_leggings: 1,
    iron_leggings: 2,
    diamond_leggings: 3,
    netherite_leggings: 4,
    leather_boots: 1,
    iron_boots: 2,
    diamond_boots: 3,
    netherite_boots: 4,
    shield: 1,
  };
  return tiers[name] ?? 0;
}

export async function autoUpgrade(bot: Bot): Promise<void> {
  const known = bot.inventory.items().map((item) => item.name);
  const upgradeGroups: Array<Array<string>> = [
    ['wooden_sword', 'stone_sword', 'iron_sword', 'diamond_sword', 'netherite_sword'],
    ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'],
    ['wooden_axe', 'stone_axe', 'iron_axe', 'diamond_axe', 'netherite_axe'],
    ['wooden_shovel', 'stone_shovel', 'iron_shovel', 'diamond_shovel', 'netherite_shovel'],
    ['leather_helmet', 'iron_helmet', 'diamond_helmet', 'netherite_helmet'],
    ['leather_chestplate', 'iron_chestplate', 'diamond_chestplate', 'netherite_chestplate'],
    ['leather_leggings', 'iron_leggings', 'diamond_leggings', 'netherite_leggings'],
    ['leather_boots', 'iron_boots', 'diamond_boots', 'netherite_boots'],
  ];

  for (const group of upgradeGroups) {
    const currentIndex = group.findIndex((name) => known.includes(name));
    if (currentIndex === -1) continue;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= group.length) continue;
    await craftItem(bot, group[nextIndex], 1);
  }

  await equipBest(bot, 'sword');
  await equipBest(bot, 'pickaxe');
  await equipBest(bot, 'axe');
  await equipBest(bot, 'armor');
  await equipBest(bot, 'shield');
}

export function setDefaultMovements(bot: Bot): void {
  bot.pathfinder.setMovements(new Movements(bot));
}
