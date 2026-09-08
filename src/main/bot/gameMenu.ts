import { Bot } from 'mineflayer';
import { BotCommand } from '../../shared/types';
import { EXAMPLE_TRIGGERS, parseChat } from '../../shared/parseCommand';

export interface MenuEntry {
  index: number;
  label: string;
  phrase: string;
  command?: BotCommand;
}

export const MENU_PAGE_SIZE = 10;
const MENU_COLORS = ['aqua', 'green', 'light_purple', 'yellow'];

export function buildMenuEntries(saved: BotCommand[]): MenuEntry[] {
  const entries: MenuEntry[] = [];
  let index = 1;

  for (const phrase of EXAMPLE_TRIGGERS) {
    entries.push({ index, label: phrase, phrase });
    index += 1;
  }

  for (const command of saved) {
    const phrase = command.triggerPhrases[0] ?? command.actionType;
    entries.push({
      index,
      label: phrase,
      phrase,
      command,
    });
    index += 1;
  }

  return entries;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function sendInGameMenu(bot: Bot, username: string, entries: MenuEntry[], page = 1): Promise<void> {
  const target = username || '@a';
  const pageCount = Math.max(1, Math.ceil(entries.length / MENU_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pageEntries = entries.slice((currentPage - 1) * MENU_PAGE_SIZE, currentPage * MENU_PAGE_SIZE);
  const pageColor = MENU_COLORS[(currentPage - 1) % MENU_COLORS.length];
  const header = JSON.stringify({
    text: `=== Bot Menu ${currentPage}/${pageCount} === type menu ${currentPage} or a number`,
    color: pageColor,
  });
  bot.chat(`/tellraw ${target} ${header}`);
  await delay(40);

  for (const [index, entry] of pageEntries.entries()) {
    const localIndex = index + 1;
    const line = JSON.stringify({
      text: `[${localIndex}] ${entry.label.slice(0, 48)}`,
      color: pageColor,
      clickEvent: {
        action: 'run_command',
        value: `/msg ${bot.username} #${localIndex}`,
      },
      hoverEvent: {
        action: 'show_text',
        value: entry.phrase,
      },
    });
    bot.chat(`/tellraw ${target} ${line}`);
    await delay(40);
  }
}

export function pickMenuEntry(entries: MenuEntry[], message: string, page = 1): MenuEntry | null {
  const trimmed = message.trim();
  const hash = trimmed.match(/^#(\d+)$/);
  const num = hash ? Number(hash[1]) : /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  if (!Number.isFinite(num)) return null;
  const pageEntries = entries.slice((page - 1) * MENU_PAGE_SIZE, page * MENU_PAGE_SIZE);
  return pageEntries[num - 1] ?? null;
}

export function menuPageFromMessage(message: string): number | null {
  const match = message.trim().toLowerCase().match(/^(?:menu|commands|help|open menu)(?:\s+(\d+))?$/);
  if (!match) return null;
  return Math.max(1, Number(match[1] ?? 1));
}

export function isMenuOpenPhrase(message: string): boolean {
  return menuPageFromMessage(message) !== null;
}
