import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

export interface MemoryPoint {
  x: number;
  y: number;
  z: number;
  seenAt: number;
}

export interface WorldMemorySnapshot {
  playerName: string;
  playerPosition: MemoryPoint | null;
  home: MemoryPoint | null;
  bed: MemoryPoint | null;
  chest: MemoryPoint | null;
  lastDanger: MemoryPoint | null;
  lastDangerName: string;
  discoveredVillages: MemoryPoint[];
  discoveredCaves: MemoryPoint[];
}

function point(position: Vec3): MemoryPoint {
  return { x: position.x, y: position.y, z: position.z, seenAt: Date.now() };
}

export class WorldMemory {
  private snapshot: WorldMemorySnapshot = {
    playerName: '',
    playerPosition: null,
    home: null,
    bed: null,
    chest: null,
    lastDanger: null,
    lastDangerName: '',
    discoveredVillages: [],
    discoveredCaves: [],
  };

  observePlayer(bot: Bot, playerName?: string): void {
    const selected = playerName ? bot.players[playerName] : Object.values(bot.players).find((player) => player.entity);
    if (!selected?.entity) return;
    this.snapshot.playerName = selected.username;
    this.snapshot.playerPosition = point(selected.entity.position);
  }

  rememberHome(position: Vec3): void { this.snapshot.home = point(position); }
  rememberBed(position: Vec3): void { this.snapshot.bed = point(position); }
  rememberChest(position: Vec3): void { this.snapshot.chest = point(position); }

  rememberDanger(name: string, position: Vec3): void {
    this.snapshot.lastDangerName = name;
    this.snapshot.lastDanger = point(position);
  }

  rememberVillage(position: Vec3): void { this.addUnique(this.snapshot.discoveredVillages, point(position)); }
  rememberCave(position: Vec3): void { this.addUnique(this.snapshot.discoveredCaves, point(position)); }

  getSnapshot(): WorldMemorySnapshot {
    return JSON.parse(JSON.stringify(this.snapshot)) as WorldMemorySnapshot;
  }

  clearDanger(): void {
    this.snapshot.lastDanger = null;
    this.snapshot.lastDangerName = '';
  }

  private addUnique(list: MemoryPoint[], value: MemoryPoint): void {
    const alreadyKnown = list.some((entry) => Math.hypot(entry.x - value.x, entry.z - value.z) < 12);
    if (!alreadyKnown) list.push(value);
    if (list.length > 20) list.shift();
  }
}