import 'dotenv/config';
import { chromium } from 'playwright';
import { config } from './common.mjs';
import { authenticatePage } from './auth.mjs';
import { extractShifts } from './extract.mjs';

const c = config();
const browser = await chromium.launch({headless:true});
let shifts;
try {
    const context = await browser.newContext({
        timezoneId: c.timezone
    });
  const page = await context.newPage();
  await authenticatePage(page,c);
  await page.waitForTimeout(1500);
  shifts = await extractShifts(page,c);
} finally { await browser.close(); }
console.log(`Verified ${shifts.length} extracted shift(s).`);
if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify(shifts,null,2));
  process.exit(0);
}
const url = process.env.GOOGLE_SCRIPT_WEBAPP_URL, token = process.env.GOOGLE_SCRIPT_SHARED_SECRET;
if (!url || !token) throw new Error('Missing Google Apps Script URL or shared secret; see README.');
if (!/^https:\/\/script\.google\.com\/macros\/s\//.test(url)) throw new Error('Unexpected Google Apps Script web app URL; refusing to send data to an unverified destination.');
const result = await fetch(url,{
  method:'POST',
  headers:{'Content-Type':'text/plain;charset=utf-8'},
  body:JSON.stringify({token,shifts}),
  redirect:'follow',
  signal:AbortSignal.timeout(30000)
});
const reply = await result.text();
let data;
try { data = JSON.parse(reply); } catch { throw new Error(`Apps Script returned non-JSON (HTTP ${result.status}). Check deployment permissions.`); }
if (!result.ok || !data.ok) throw new Error(`Google sync failed: ${data.error || result.status}`);
console.log(`Google sync completed: ${data.added} created, ${data.updated} updated, ${data.unchanged} unchanged. Email sent: ${data.emailSent}.`);
