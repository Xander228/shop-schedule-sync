import 'dotenv/config';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { config } from './common.mjs';
import { authenticatePage } from './auth.mjs';

const c = config();
const browser = await chromium.launch({headless:true});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await authenticatePage(page,c);
  await page.waitForTimeout(2500);
  fs.mkdirSync('.local', {recursive:true});
  await page.screenshot({path:'.local/scheduler.png', fullPage:true});
  fs.writeFileSync('.local/scheduler-text.txt', (await page.locator('body').innerText()).slice(0,30000));
  fs.writeFileSync('.local/scheduler.html', await page.content());
  console.log('Saved private schedule inspection files under .local/. Redact personal data before sharing any extracts.');
} finally { await browser.close(); }
