import fs from 'node:fs';

export function config() {
  const c = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  for (const k of ['siteUrl', 'scheduleUrl', 'timezone']) if (!c[k]) throw new Error(`Missing config.${k}`);
  return c;
}
