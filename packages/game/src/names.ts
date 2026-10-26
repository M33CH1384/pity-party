/** Bot seat names for every mode (shell-level; personas and talk come back per mode later). */
export const BOT_NAMES = ['Lil Mama', 'Big Ray', 'Cuz', 'Auntie Pearl', 'Unc', 'Smoke', 'Peaches', 'Tiny', 'Boo', 'Slim', 'Red', 'June Bug', 'Pop', 'Nana', 'Dre', 'Kee-Kee'] as const;

/** A bot name not already in `used`; falls back to "Bot N". */
export function pickBotName(used: ReadonlySet<string>, rng: () => number): string {
  const free = BOT_NAMES.filter((n) => !used.has(n));
  if (free.length) return free[Math.floor(rng() * free.length)]!;
  for (let i = 1; ; i++) if (!used.has(`Bot ${i}`)) return `Bot ${i}`;
}
