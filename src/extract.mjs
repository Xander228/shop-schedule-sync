import { parseDisplayRange } from './parse.mjs';

// Reads the visible text of the specific "My Shifts > Upcoming Shifts" UI.
// Using text rather than brittle CSS classes allows the extraction to work with
// React/Tailwind-generated markup that changes between releases.
const DATE = String.raw`(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?`;
const TIME = String.raw`\d{1,2}(?::\d{2})?\s*[AP]M`;
const DATE_TIME_JOIN = String.raw`\s*(?:at\s+|,\s*)`;
const RANGE = new RegExp(String.raw`(${DATE})${DATE_TIME_JOIN}(${TIME})\s*(?:→|->|–|—|to)\s*(${DATE})${DATE_TIME_JOIN}(${TIME})`,'gi');
const OUTSIDE_SECTION = /\n(?:Past Shifts|Available Shifts|Open Shifts|My Requests|Shift History|Time Off Requests|No Upcoming Shifts)\s*\n/i;

function cleaned(str) {
  return String(str).replace(/\u00a0/g,' ').replace(/\r/g,'').replace(/[ \t]+/g,' ').trim();
}
function slug(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48) || 'unknown';
}

export function parseUpcomingShiftText(bodyText, timezone='America/Los_Angeles', now=new Date()) {
  const text=cleaned(bodyText);
  const heading = /(?:^|\n)Upcoming Shifts\s*(?:\n|$)/i.exec(text);
  if (!heading) throw new Error('Could not find Upcoming Shifts on My Shifts page. Nothing was synchronized.');
  let region = text.slice(heading.index+heading[0].length);
  const nextSection = OUTSIDE_SECTION.exec(region);
  if (nextSection) region = region.slice(0,nextSection.index);
  const chunks=region.split(/\bRequest Pickup\b/i);
  const shifts=[], counts=new Map();
  for (const chunk of chunks) {
    const body=chunk.trim();
    if (!body) continue;
    const matches=[...body.matchAll(RANGE)];
    if (!matches.length) {
      if (/\bAssigned\b/i.test(body) && !/^No (upcoming )?shifts/i.test(body)) {
        throw new Error('Found an assigned shift without a recognized date range. Extraction stopped.');
      }
      continue;
    }
    if (matches.length!==1) throw new Error('Shift cards could not be separated reliably. Extraction stopped to avoid incorrect calendar events.');
    if (!/\bAssigned\b/i.test(body)) continue;
    const match=matches[0];
    const before=body.slice(0,match.index);
    const titleLines=before.split('\n').map(s=>s.trim()).filter(s=>s && !/^(Assigned|Pending|Unassigned|Requested|Upcoming Shifts)$/i.test(s));
    if (!titleLines.length) throw new Error('Could not identify the shift location/title. Extraction stopped.');
    const title=titleLines[titleLines.length-1];
    const pinLine=body.slice(match.index+match[0].length).split('\n').map(s=>s.trim()).find(s=>s.startsWith('📍'));
    const location=pinLine ? pinLine.replace(/^📍\s*/,'').trim() : title;
    const times=parseDisplayRange(match[1],match[2],match[3],match[4],timezone,now);
    const base=`${times.date}:${slug(location)}`;
    const number=(counts.get(base)||0)+1;
    counts.set(base,number);
    shifts.push({id:`shoptech:${base}:${number}`,title:`Shop Tech: ${title}`,location,start:times.start,end:times.end});
  }
  if (!shifts.length) throw new Error('No assigned upcoming shifts found. Refusing to sync an empty schedule.');
  if (shifts.length > 100) throw new Error('More than 100 upcoming shifts found. Check parsing before synchronizing.');
  if (new Set(shifts.map(x=>x.id)).size!==shifts.length) throw new Error('Duplicate shift IDs detected.');
  shifts.sort((a,b)=>a.start.localeCompare(b.start));
  return shifts;
}

export async function extractShifts(page, config, now=new Date()) {
  // A login may land on another tab if the site remembers navigation state.
  const tab=page.getByText('My Shifts',{exact:true}).first();
  if (await tab.isVisible().catch(()=>false)) await tab.click();
  await page.getByText('Upcoming Shifts',{exact:true}).first().waitFor({state:'visible',timeout:20000});
  const body=await page.locator('body').innerText();
  return parseUpcomingShiftText(body,config.timezone,now);
}
