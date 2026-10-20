/* Shop Schedule Sync receiver. Copy into https://script.google.com/ */
/* Script Properties needed: SHARED_SECRET, EMAIL_TO, optional CALENDAR_ID */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('No request data');
    var payload = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('SHARED_SECRET');
    if (!secret || secret.length < 32 || payload.token !== secret) throw new Error('Unauthorized');
    if (!Array.isArray(payload.shifts) || !payload.shifts.length || payload.shifts.length > 500) {
      throw new Error('Invalid or empty shift list');
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      var result = sync_(payload.shifts,props);
      return respond_(result);
    } finally { lock.releaseLock(); }
  } catch (err) {
    return respond_({ok:false,error:String(err.message || err)});
  }
}

function sync_(shifts, props) {
  var calendarId = props.getProperty('CALENDAR_ID');
  var calendar = calendarId ? CalendarApp.getCalendarById(calendarId) : CalendarApp.getDefaultCalendar();
  if (!calendar) throw new Error('Google Calendar not found');
  var address = props.getProperty('EMAIL_TO');
  if (!address || !address.includes('@')) throw new Error('EMAIL_TO not configured');
  var seen = {}, normalized = [];
  var now = Date.now();
  for (var i=0;i<shifts.length;i++) {
    var s = shifts[i];
    if (!s || typeof s.id !== 'string' || !s.id || typeof s.start !== 'string' || typeof s.end !== 'string') throw new Error('Bad shift data');
    var start = new Date(s.start), end = new Date(s.end);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) throw new Error('Bad shift dates');
    if (start.getTime() < now - 45*86400000 || start.getTime() > now + 370*86400000) throw new Error('Shift date outside allowed window');
    if ((end-start)/3600000 > 18) throw new Error('Shift longer than 18 hours');
    var key = 'ss_' + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s.id)
      .slice(0,20).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');
    if (seen[key]) throw new Error('Duplicate shift ID');
    seen[key] = true;
    normalized.push({key:key,start:start,end:end,title:String(s.title || 'Work Shift'),location:String(s.location || '')});
  }

  var added = [], updated = [], unchanged = 0;
  for (var j=0;j<normalized.length;j++) {
    var x = normalized[j];
    var existingId = props.getProperty(x.key);
    var event = existingId ? calendar.getEventById(existingId) : null;
    if (!event) {
      event = calendar.createEvent(x.title,x.start,x.end,{
        location:x.location,
        description:'Automatically imported from the workplace scheduling website.'
      });
      props.setProperty(x.key,event.getId());
      added.push(x);
    } else {
      var changed = false;
      if (event.getStartTime().getTime() !== x.start.getTime() || event.getEndTime().getTime() !== x.end.getTime()) {
        event.setTime(x.start,x.end);
        changed = true;
      }
      if (event.getTitle() !== x.title) {event.setTitle(x.title);changed = true;}
      if (event.getLocation() !== x.location) {event.setLocation(x.location);changed = true;}
      if (changed) updated.push(x); else unchanged++;
    }
  }
  var changes = added.concat(updated).sort(function(a,b){return a.start-b.start;});
  if (changes.length) {
    var tz = props.getProperty('TIMEZONE') || Session.getScriptTimeZone();
    var fmt = function(s){ return Utilities.formatDate(s.start,tz,'EEE, MMM d, yyyy h:mm a') + ' to ' + Utilities.formatDate(s.end,tz,'h:mm a') + ' | ' + (s.location || s.title); };
    var full = normalized.sort(function(a,b){return a.start-b.start;});
    var message = 'Your work schedule has ' + changes.length + ' new or revised shift(s).\n\n' +
      'New (' + added.length + '):\n' + (added.map(fmt).join('\n') || 'None') + '\n\n' +
      'Updated (' + updated.length + '):\n' + (updated.map(fmt).join('\n') || 'None') + '\n\n' +
      'Currently visible shifts:\n' + full.map(fmt).join('\n') + '\n\n' +
      'These shifts have been synchronized to Google Calendar. Check the scheduling website for official changes.';
    MailApp.sendEmail(address,'Work schedule update: ' + changes.length + ' shift(s)',message);
  }
  return {ok:true, added:added.length,updated:updated.length,unchanged:unchanged,emailSent:changes.length>0};
}

function respond_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// Run this function ONCE in the Apps Script editor to authorize calendar/mail access.
function authorizeGoogleAccess() {
  CalendarApp.getDefaultCalendar().getName();
  MailApp.getRemainingDailyQuota();
}
