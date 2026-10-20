import crypto from 'node:crypto';

const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const WEEKDAYS = {sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
const pad = n => String(n).padStart(2,'0');

export function dateInZone(now, zone) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value = name => Number(parts.find(x=>x.type===name)?.value);
  return {year:value('year'),month:value('month'),day:value('day')};
}

function parseDate(raw) {
  const text = String(raw).replace(/\s+/g,' ').trim().replace(/\./g,'');
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return {year:+m[1],month:+m[2],day:+m[3]};
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return {month:+m[1],day:+m[2],year:+m[3] < 100 ? 2000 + +m[3] : +m[3]};
  m = text.match(/^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+)?([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i);
  if (!m) throw new Error(`Cannot parse shift date: ${raw}`);
  const month = MONTHS[m[2].slice(0,3).toLowerCase()];
  if (!month) throw new Error(`Unknown shift month: ${m[2]}`);
  return {year:m[4]?+m[4]:null,month,day:+m[3],weekday:m[1]?WEEKDAYS[m[1].slice(0,3).toLowerCase()]:null};
}

function validateDate(d) {
  const t = new Date(Date.UTC(d.year,d.month-1,d.day));
  return t.getUTCFullYear() === d.year && t.getUTCMonth()+1 === d.month && t.getUTCDate() === d.day && (d.weekday === null || d.weekday === undefined || t.getUTCDay() === d.weekday);
}

function parseTime(raw) {
  const t = String(raw).trim().replace(/\./g,'').replace(/\s+/g,' ');
  let m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (m) {
    let hour=+m[1],minute=+(m[2]||0);
    if (hour<1||hour>12||minute>59) throw new Error(`Invalid shift time: ${raw}`);
    hour=hour%12+(m[3].toUpperCase()==='PM'?12:0);
    return {hour,minute};
  }
  m=t.match(/^(\d{1,2}):(\d{2})$/);
  if (m && +m[1] <= 23 && +m[2] <= 59) return {hour:+m[1],minute:+m[2]};
  throw new Error(`Cannot parse shift time: ${raw}`);
}

function offsetAt(instant, zone) {
  const name = new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'shortOffset'}).formatToParts(new Date(instant)).find(x=>x.type==='timeZoneName')?.value;
  if (name === 'GMT' || name === 'UTC') return 0;
  const m = name?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`Unsupported time zone offset: ${name}`);
  return (m[1]==='-'?-1:1)*(+m[2]*60 + +(m[3]||0));
}

function zoneParts(instant, zone) {
  const vals = new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
  const get = type => Number(vals.find(x=>x.type===type)?.value);
  return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute')};
}

function toZonedISO(day, clock, zone) {
  const wall = Date.UTC(day.year,day.month-1,day.day,clock.hour,clock.minute);
  let time=wall;
  for (let i=0;i<4;i++) {
    const next = wall - offsetAt(time,zone)*60000;
    if (next===time) break;
    time=next;
  }
  const actual=zoneParts(time,zone);
  if (Object.keys(actual).some(k=>actual[k] !== (k==='hour'||k==='minute'?clock[k]:day[k]))) throw new Error('Nonexistent local shift time near daylight-saving transition. Check the schedule.');
  const offset=offsetAt(time,zone),sign=offset<0?'-':'+';
  const abs=Math.abs(offset);
  return {ms:time,iso:`${day.year}-${pad(day.month)}-${pad(day.day)}T${pad(clock.hour)}:${pad(clock.minute)}:00.000${sign}${pad(Math.floor(abs/60))}:${pad(abs%60)}`};
}

function dateCandidates(date, now, zone) {
  const cur=dateInZone(now,zone);
  const years = date.year ? [date.year] : [cur.year-1,cur.year,cur.year+1,cur.year+2];
  return years.map(year=>({...date,year})).filter(validateDate);
}

function startDate(date, clock, zone, now) {
  const candidates=dateCandidates(date,now,zone).map(d=>({date:d,value:toZonedISO(d,clock,zone)}));
  const eligible=candidates.filter(x=>x.value.ms>=now.getTime()-45*86400000 && x.value.ms<=now.getTime()+370*86400000);
  if (!eligible.length) throw new Error(`Shift date is outside the allowed window or weekday doesn't match: ${date.month}/${date.day}`);
  eligible.sort((a,b)=>Math.abs(a.value.ms-now.getTime())-Math.abs(b.value.ms-now.getTime()));
  return eligible[0];
}

export function parseDisplayRange(startDateText, startTimeText, endDateText, endTimeText, zone, now = new Date()) {
  const startDateInfo=parseDate(startDateText), endDateInfo=parseDate(endDateText);
  const startClock=parseTime(startTimeText), endClock=parseTime(endTimeText);
  const start=startDate(startDateInfo,startClock,zone,now);
  const possibleYears=endDateInfo.year?[endDateInfo.year]:[start.date.year-1,start.date.year,start.date.year+1];
  const ends=[];
  for (const year of possibleYears) {
    const d={...endDateInfo,year};
    if (!validateDate(d)) continue;
    const end=toZonedISO(d,endClock,zone);
    const duration=(end.ms-start.value.ms)/3600000;
    if (duration>0 && duration<=18) ends.push({end,duration});
  }
  if (!ends.length) throw new Error(`End time does not follow start within 18 hours: ${endDateText} ${endTimeText}`);
  ends.sort((a,b)=>a.duration-b.duration);
  return {start:start.value.iso,end:ends[0].end.iso,date:start.value.iso.slice(0,10)};
}

export function parseShift(dateText,startTimeText,endTimeText,zone) {
  const date=parseDate(dateText),clock=parseTime(startTimeText);
  // When the original date is explicit, use it directly. For an overnight shift
  // on that date, the displayed end date is implied to be the following day.
  if (date.year) {
    const start=toZonedISO(date,clock,zone);
    const endClock=parseTime(endTimeText);
    let ending=toZonedISO(date,endClock,zone);
    if (ending.ms<=start.ms) {
      const tomorrow=new Date(Date.UTC(date.year,date.month-1,date.day)+86400000);
      ending=toZonedISO({year:tomorrow.getUTCFullYear(),month:tomorrow.getUTCMonth()+1,day:tomorrow.getUTCDate()},endClock,zone);
    }
    const hours=(ending.ms-start.ms)/3600000;
    if (hours<=0 || hours>18) throw new Error('Shift is not between 0 and 18 hours.');
    return {start:start.iso,end:ending.iso,date:start.iso.slice(0,10)};
  }
  throw new Error('parseShift requires a year. Use parseDisplayRange for website labels that omit the year.');
}

export function stableShiftId(raw, date, sequence) {
  return String(raw || `day:${date}:shift:${sequence}`);
}

export function fingerprint(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0,24);
}
