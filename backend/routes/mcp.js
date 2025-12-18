const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const User = require('../models/User');

// Initialize OpenAI client
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  try {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('✅ OpenAI LLM client initialized for MCP query parsing');
  } catch (err) {
    console.error('❌ OpenAI SDK initialization failed:', err.message);
    openaiClient = null;
  }
}

/**
 * Use OpenAI LLM to parse natural language meeting request into structured event data.
 * Returns an object matching the MCP schema: { title, date, startHour, startMinute, startAmPm, endHour, endMinute, endAmPm, timeZone, addMeet, guests }
 */
async function parseWithLLM(prompt) {
  if (!openaiClient) {
    throw new Error('LLM not configured. Please set OPENAI_API_KEY in .env');
  }

  // Build a date-aware system prompt so the model reliably resolves relative dates like "tomorrow".
  const today = new Date();
  const currentDateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()];
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Calculate next occurrence of each weekday
  const getNextWeekday = (targetDay) => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetIndex = days.indexOf(targetDay.toLowerCase());
    const todayIndex = today.getDay();

    let daysToAdd;
    if (targetIndex > todayIndex) {
      // Target day is later this week
      daysToAdd = targetIndex - todayIndex;
    } else if (targetIndex === todayIndex) {
      // Target day is today, go to next week
      daysToAdd = 7;
    } else {
      // Target day has passed this week, go to next week
      daysToAdd = 7 - todayIndex + targetIndex;
    }

    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysToAdd);
    return nextDate.toISOString().split('T')[0];
  };

  // Calculate "this week" occurrence - upcoming day in current week
  const getThisWeekday = (targetDay) => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetIndex = days.indexOf(targetDay.toLowerCase());
    const todayIndex = today.getDay();

    let daysToAdd;

    // Special case: if today is Saturday (6) and target is Sunday (0)
    if (todayIndex === 6 && targetIndex === 0) {
      daysToAdd = 1; // Tomorrow is Sunday
    }
    // If target day is in the future this week
    else if (targetIndex > todayIndex) {
      daysToAdd = targetIndex - todayIndex;
    }
    // If target day has passed or is today, get next week's occurrence
    else {
      daysToAdd = 7 - todayIndex + targetIndex;
    }

    const thisWeekDate = new Date(today);
    thisWeekDate.setDate(today.getDate() + daysToAdd);
    return thisWeekDate.toISOString().split('T')[0];
  };

  const nextMonday = getNextWeekday('monday');
  const nextTuesday = getNextWeekday('tuesday');
  const nextWednesday = getNextWeekday('wednesday');
  const nextThursday = getNextWeekday('thursday');
  const nextFriday = getNextWeekday('friday');
  const nextSaturday = getNextWeekday('saturday');
  const nextSunday = getNextWeekday('sunday');
  const thisSunday = getThisWeekday('sunday');

  console.log(`📅 Date calculations for ${currentDateStr} (${dayOfWeek}):`);
  console.log(`   Tomorrow: ${tomorrowStr}`);
  console.log(`   This Sunday: ${thisSunday}`);
  console.log(`   Next Sunday: ${nextSunday}`);
  console.log(`   Next Monday: ${nextMonday}`);

  const systemPrompt = `You are an expert at parsing natural language meeting/event requests into structured JSON.\nExtract meeting details from the user's request. Return ONLY valid JSON (no extra text).\n\nCRITICAL: Today's date is ${currentDateStr} (${dayOfWeek}). Use EXACTLY these dates for relative date calculations:\n- "tomorrow" = ${tomorrowStr}\n- "today" = ${currentDateStr}\n- "this Sunday" = ${thisSunday}\n- "coming Sunday" = ${nextSunday}\n- "next Sunday" = ${nextSunday}\n- "next Monday" = ${nextMonday}\n- "next Tuesday" = ${nextTuesday}\n- "next Wednesday" = ${nextWednesday}\n- "next Thursday" = ${nextThursday}\n- "next Friday" = ${nextFriday}\n- "next Saturday" = ${nextSaturday}\n\nIMPORTANT: \n- When user says "this Sunday", use EXACTLY ${thisSunday}\n- When user says "coming Sunday" or "next Sunday", use EXACTLY ${nextSunday}\n\nThe output MUST be a single JSON object. That object MUST contain either a single "event" object or an "events" array. Each event object must have these exact fields (set to null if not mentioned):\n- title: string (meeting name/subject) - infer from context if missing\n- date: string in YYYY-MM-DD format, or null\n- startHour: string "01" to "12" (12-hour format), or null\n- startMinute: string ("00", "15", "30", "45"), or null\n- startAmPm: string ("AM" or "PM"), or null\n- endHour: string "01" to "12" (12-hour format), or null\n- endMinute: string ("00", "15", "30", "45"), or null\n- endAmPm: string ("AM" or "PM"), or null\n- timeZone: string (IANA timezone like "Asia/Kolkata", "America/New_York", "Europe/London", etc.), default "Asia/Kolkata"\n- addMeet: boolean (true if user mentions video/meet/zoom/conference, else false)\n- guests: array of email strings (extract ALL mentioned emails), or empty array\n\nAdditionally, to express multi-meeting schedules (for example: one meeting per guest back-to-back with a buffer), an event object MAY include these optional fields to describe patterns you detect from the user's prompt:\n- pattern: string (one of: "single", "back-to-back", "sequential", "parallel")\n- bufferMinutes: integer (minutes of gap between consecutive meetings, e.g., 15, 30, 45)\n- occurrences: integer (number of repeated meetings)\n- perGuest: boolean (if true and guests array contains multiple emails, schedule separate meetings per guest)\n\nRules for multi-meeting generation:\n- If the prompt requests "one-on-one" or "back-to-back" meetings with multiple guests, ALWAYS return an events array with one event per guest, each with only that guest in the guests array, and set pattern: "back-to-back" and perGuest: true.\n- If pattern is "back-to-back" and perGuest is true: create one meeting per guest, scheduled sequentially starting at the stated start time. For each successive meeting, add bufferMinutes between meetings. If bufferMinutes is missing but user asked for a gap, infer a reasonable default of 15 minutes.\n- If occurrences is provided, generate that many repeated events starting at the start time, each separated by bufferMinutes (or default 15) + duration.\n- If only one event object is returned (no events array), treat it as a single meeting.\n\nCAP: If the prompt implies many meetings, you may return up to 200 generated events. For safety, the server will cap to 200 events per request.\n\nReturn STRICTLY a JSON object. Example valid output for back-to-back per-guest case:\n{"events": [{"title":"Demo","date":"${currentDateStr}","startHour":"01","startMinute":"00","startAmPm":"PM","endHour":"02","endMinute":"00","endAmPm":"PM","timeZone":"Asia/Kolkata","addMeet":true,"guests":["a@example.com"],"pattern":"back-to-back","bufferMinutes":15,"perGuest":true}]}\n\nNote: Use ONLY the exact dates provided above. Do not calculate dates yourself.`;

  const userMessage = `Parse this event request: "${prompt}"`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0
    });

    const rawText = response.choices?.[0]?.message?.content || '';
    console.log('📝 LLM Response:', rawText);

    // Extract JSON from response (handle text before/after JSON)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM did not return valid JSON');
    }

    let parsed = JSON.parse(jsonMatch[0]);

    // Normalize and validate fields. Support either a single event or an events array.
    // Accept outputs like { event: {...} } or { events: [...] } or a single flat object.
    if (parsed.event && !parsed.events) {
      parsed.events = [parsed.event];
      delete parsed.event;
    }

    if (!parsed.events && (parsed.title || parsed.date || parsed.startHour)) {
      // legacy single-object output without wrapper
      parsed.events = [parsed];
    }

    parsed.events = Array.isArray(parsed.events) ? parsed.events : [];

    // Normalize each event entry
    parsed.events = parsed.events.map(e => {
      const ev = Object.assign({}, e);
      ev.title = (ev.title || '').trim() || 'Untitled Meeting';
      ev.date = ev.date || null;
      ev.startHour = ev.startHour || null;
      ev.startMinute = ev.startMinute || null;
      ev.startAmPm = ev.startAmPm || null;
      ev.endHour = ev.endHour || null;
      ev.endMinute = ev.endMinute || null;
      ev.endAmPm = ev.endAmPm || null;
      ev.timeZone = ev.timeZone || 'Asia/Kolkata';
      ev.addMeet = !!ev.addMeet;
      ev.guests = Array.isArray(ev.guests) ? ev.guests.filter(g => g && typeof g === 'string') : [];
      ev.pattern = ev.pattern || 'single';
      ev.bufferMinutes = typeof ev.bufferMinutes === 'number' ? ev.bufferMinutes : (ev.bufferMinutes ? parseInt(ev.bufferMinutes, 10) : null);
      ev.perGuest = !!ev.perGuest;
      ev.occurrences = ev.occurrences ? parseInt(ev.occurrences, 10) : null;
      return ev;
    });

    // Backend post-processing: if prompt contains 'one-on-one' or 'back-to-back' and any event has multiple guests, split into per-guest events
    const lowerPrompt = (prompt || '').toLowerCase();
    if ((lowerPrompt.includes('one-on-one') || lowerPrompt.includes('back-to-back')) && parsed.events.length > 0) {
      let needsSplit = false;
      for (const ev of parsed.events) {
        if (Array.isArray(ev.guests) && ev.guests.length > 1) {
          needsSplit = true;
          break;
        }
      }
      if (needsSplit) {
        const splitEvents = [];
        for (const ev of parsed.events) {
          if (Array.isArray(ev.guests) && ev.guests.length > 1) {
            for (const guest of ev.guests) {
              splitEvents.push({ ...ev, guests: [guest], perGuest: true, pattern: 'back-to-back' });
            }
          } else {
            splitEvents.push(ev);
          }
        }
        parsed.events = splitEvents;
      }
    }

    console.log('✅ Parsed Event Data:', JSON.stringify(parsed, null, 2));
    return parsed;
  } catch (err) {
    console.error('❌ LLM parsing error:', err.message);
    throw new Error(`Failed to parse event request: ${err.message}`);
  }
}

/**
 * Convert 12-hour time format to 24-hour HH:MM format
 */
function convertTo24Hour(hour, minute, amPm) {
  let h = parseInt(hour, 10);
  const m = minute || '00';

  if (amPm === 'PM' && h !== 12) h += 12;
  if (amPm === 'AM' && h === 12) h = 0;

  return `${h.toString().padStart(2, '0')}:${m}`;
}

// Helpers for multi-event scheduling
function timeToMinutes(hourStr, minuteStr, amPm) {
  let h = parseInt(hourStr, 10) || 0;
  const m = parseInt(minuteStr, 10) || 0;
  if ((amPm || '').toUpperCase() === 'PM' && h !== 12) h += 12;
  if ((amPm || '').toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

function minutesTo12HourParts(totalMinutes) {
  const dayMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  let h = Math.floor(dayMinutes / 60);
  const m = dayMinutes % 60;
  const amPm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  if (h > 12) h = h - 12;
  return {
    hour: h.toString().padStart(2, '0'),
    minute: m.toString().padStart(2, '0'),
    amPm
  };
}

function addDaysToDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function addMinutesToDateTime(dateStr, hourStr, minuteStr, amPm, minutesToAdd) {
  const base = timeToMinutes(hourStr, minuteStr, amPm);
  const newTotal = base + minutesToAdd;
  const dayOffset = Math.floor(newTotal / 1440);
  const parts = minutesTo12HourParts(newTotal);
  const newDate = addDaysToDate(dateStr, dayOffset);
  return {
    date: newDate,
    hour: parts.hour,
    minute: parts.minute,
    amPm: parts.amPm
  };
}

// Helper: check for time overlaps between two events (based on date and 12-hour parts)
function eventsOverlap(ev1, ev2) {
  const toMinutesSinceEpoch = (date, hour, minute, amPm) => {
    // build a Date at UTC midnight then add minutes
    const base = new Date(date + 'T00:00:00Z').getTime();
    const mins = timeToMinutes(hour, minute, amPm);
    return base + mins * 60 * 1000;
  };

  const ev1Start = toMinutesSinceEpoch(ev1.date, ev1.startHour, ev1.startMinute, ev1.startAmPm);
  const ev1EndDate = ev1.endDate || ev1.date;
  const ev1End = toMinutesSinceEpoch(ev1EndDate, ev1.endHour || ev1.startHour, ev1.endMinute || ev1.startMinute, ev1.endAmPm || ev1.startAmPm);
  const ev2Start = toMinutesSinceEpoch(ev2.date, ev2.startHour, ev2.startMinute, ev2.startAmPm);
  const ev2EndDate = ev2.endDate || ev2.date;
  const ev2End = toMinutesSinceEpoch(ev2EndDate, ev2.endHour || ev2.startHour, ev2.endMinute || ev2.startMinute, ev2.endAmPm || ev2.startAmPm);

  return !(ev1End <= ev2Start || ev2End <= ev1Start);
}

// Check for conflicts between proposed instances and existing events in the calendar
async function checkForConflicts(calendar, instances) {
  const conflicts = [];

  for (let idx = 0; idx < instances.length; idx++) {
    const inst = instances[idx];
    try {
      // Ensure end time is set for conflict checking
      let endHour = inst.endHour;
      let endMinute = inst.endMinute;
      let endAmPm = inst.endAmPm;
      let endDate = inst.endDate || inst.date;

      if (!endHour || !endMinute || !endAmPm) {
        // Default to 1 hour duration
        const endTime = addMinutesToDateTime(inst.date, inst.startHour, inst.startMinute, inst.startAmPm, 60);
        endHour = endTime.hour;
        endMinute = endTime.minute;
        endAmPm = endTime.amPm;
        endDate = endTime.date;
      }

      // Build a wider time window to catch potential conflicts (check the whole day)
      const dayStart = `${inst.date}T00:00:00Z`;
      const dayEnd = `${inst.date}T23:59:59Z`;

      console.log(`🔍 Checking conflicts for: ${inst.title} on ${inst.date} ${inst.startHour}:${inst.startMinute} ${inst.startAmPm}`);

      const resp = await calendar.events.list({
        calendarId: 'primary',
        timeMin: dayStart,
        timeMax: dayEnd,
        singleEvents: true,
        maxResults: 100
      });

      const existing = resp.data.items || [];
      console.log(`📋 Found ${existing.length} existing events on ${inst.date}`);

      for (const ex of existing) {
        if (!ex.start?.dateTime && !ex.start?.date) continue;

        const exStart = ex.start?.dateTime || ex.start?.date;
        const exEnd = ex.end?.dateTime || ex.end?.date;

        // Skip all-day events for now
        if (!exStart.includes('T') || !exEnd.includes('T')) continue;

        // Convert existing event to our format for comparison
        const exStartDate = new Date(exStart);
        const exEndDate = new Date(exEnd);

        const existingEvent = {
          date: exStart.split('T')[0],
          startHour: exStartDate.getHours() > 12 ? (exStartDate.getHours() - 12).toString().padStart(2, '0') :
            exStartDate.getHours() === 0 ? '12' : exStartDate.getHours().toString().padStart(2, '0'),
          startMinute: exStartDate.getMinutes().toString().padStart(2, '0'),
          startAmPm: exStartDate.getHours() >= 12 ? 'PM' : 'AM',
          endHour: exEndDate.getHours() > 12 ? (exEndDate.getHours() - 12).toString().padStart(2, '0') :
            exEndDate.getHours() === 0 ? '12' : exEndDate.getHours().toString().padStart(2, '0'),
          endMinute: exEndDate.getMinutes().toString().padStart(2, '0'),
          endAmPm: exEndDate.getHours() >= 12 ? 'PM' : 'AM',
          endDate: exEnd.split('T')[0]
        };

        const proposedEvent = {
          date: inst.date,
          startHour: inst.startHour,
          startMinute: inst.startMinute,
          startAmPm: inst.startAmPm,
          endHour: endHour,
          endMinute: endMinute,
          endAmPm: endAmPm,
          endDate: endDate
        };

        console.log(`⏰ Comparing:`);
        console.log(`   Proposed: ${proposedEvent.date} ${proposedEvent.startHour}:${proposedEvent.startMinute} ${proposedEvent.startAmPm} - ${proposedEvent.endHour}:${proposedEvent.endMinute} ${proposedEvent.endAmPm}`);
        console.log(`   Existing: ${existingEvent.date} ${existingEvent.startHour}:${existingEvent.startMinute} ${existingEvent.startAmPm} - ${existingEvent.endHour}:${existingEvent.endMinute} ${existingEvent.endAmPm} (${ex.summary})`);

        if (eventsOverlap(proposedEvent, existingEvent)) {
          console.log(`⚠️ CONFLICT DETECTED with event: ${ex.summary}`);
          conflicts.push({ instanceIdx: idx, instance: inst, conflictingEvent: ex });
          break; // Only report first conflict per instance
        }
      }
    } catch (err) {
      console.error('Error while checking conflicts for instance', idx, err?.message || err);
    }
  }

  return conflicts;
}

/**
 * POST /api/mcp/create
 * Accepts: { prompt: string }
 * Creates a Google Calendar event based on the natural language prompt using LLM parsing.
 */
router.post('/create', async (req, res) => {
  try {
    // Check authentication
    if (!req.user) {
      console.warn('⚠️ MCP create attempt without authenticated user');
      return res.status(401).json({ success: false, error: 'Not authenticated. Please login first.' });
    }

    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    console.log(`\n👤 Logged-in user: ${req.user.email}`);
    console.log(`🎤 User Query: "${prompt}"\n`);

    // Step 1: Parse the natural language prompt using LLM
    let parsed;
    try {
      parsed = await parseWithLLM(prompt);
    } catch (err) {
      console.error('LLM Parse Error:', err.message);
      return res.status(400).json({ success: false, error: err.message });
    }

    // Step 2: Build event instances from parsed.events (support multi-meeting patterns)
    const SERVER_CAP = 200;
    const defaultBuffer = 15;
    let instances = [];

    if (!parsed.events || parsed.events.length === 0) {
      return res.status(400).json({ success: false, error: 'No event data parsed from prompt', parsed });
    }

    for (const ev of parsed.events) {
      // Minimal validation for each event
      if (!ev.date || !ev.startHour || !ev.startMinute || !ev.startAmPm) {
        return res.status(400).json({ success: false, error: 'Parsed event missing date or start time', ev, parsed });
      }

      // compute duration
      let durationMinutes = 60; // default 1 hour
      if (ev.endHour && ev.endMinute && ev.endAmPm) {
        const startMin = timeToMinutes(ev.startHour, ev.startMinute, ev.startAmPm);
        const endMin = timeToMinutes(ev.endHour, ev.endMinute, ev.endAmPm);
        durationMinutes = endMin - startMin;
        if (!durationMinutes || durationMinutes <= 0) durationMinutes = 60;
      }

      const buffer = typeof ev.bufferMinutes === 'number' && !isNaN(ev.bufferMinutes) ? ev.bufferMinutes : defaultBuffer;

      // pattern: back-to-back per guest
      if ((ev.pattern === 'back-to-back' || ev.pattern === 'sequential') && ev.perGuest && ev.guests && ev.guests.length > 0) {
        for (let i = 0; i < ev.guests.length; i++) {
          if (instances.length >= SERVER_CAP) break;
          const offset = i * (durationMinutes + buffer);
          const startParts = addMinutesToDateTime(ev.date, ev.startHour, ev.startMinute, ev.startAmPm, offset);
          const endParts = addMinutesToDateTime(ev.date, ev.startHour, ev.startMinute, ev.startAmPm, offset + durationMinutes);
          instances.push({
            title: ev.title,
            date: startParts.date,
            startHour: startParts.hour,
            startMinute: startParts.minute,
            startAmPm: startParts.amPm,
            endHour: endParts.hour,
            endMinute: endParts.minute,
            endAmPm: endParts.amPm,
            endDate: endParts.date,
            timeZone: ev.timeZone,
            addMeet: ev.addMeet,
            guests: [ev.guests[i]]
          });
        }
        continue;
      }

      // occurrences: repeat same meeting multiple times
      if (ev.occurrences && ev.occurrences > 1) {
        const occ = Math.min(ev.occurrences, SERVER_CAP - instances.length);
        for (let i = 0; i < occ; i++) {
          if (instances.length >= SERVER_CAP) break;
          const offset = i * (durationMinutes + buffer);
          const startParts = addMinutesToDateTime(ev.date, ev.startHour, ev.startMinute, ev.startAmPm, offset);
          const endParts = addMinutesToDateTime(ev.date, ev.startHour, ev.startMinute, ev.startAmPm, offset + durationMinutes);
          instances.push({
            title: ev.title,
            date: startParts.date,
            startHour: startParts.hour,
            startMinute: startParts.minute,
            startAmPm: startParts.amPm,
            endHour: endParts.hour,
            endMinute: endParts.minute,
            endAmPm: endParts.amPm,
            endDate: endParts.date,
            timeZone: ev.timeZone,
            addMeet: ev.addMeet,
            guests: ev.guests
          });
        }
        continue;
      }

      // default: single event (may include multiple guests)
      instances.push({
        title: ev.title,
        date: ev.date,
        startHour: ev.startHour,
        startMinute: ev.startMinute,
        startAmPm: ev.startAmPm,
        endHour: ev.endHour || null,
        endMinute: ev.endMinute || null,
        endAmPm: ev.endAmPm || null,
        timeZone: ev.timeZone,
        addMeet: ev.addMeet,
        guests: ev.guests || []
      });
    }

    if (instances.length === 0) {
      return res.status(400).json({ success: false, error: 'No event instances generated from prompt', parsed });
    }

    // Step 3: Check Google Calendar permissions
    if (!req.user.accessToken || !req.user.refreshToken) {
      return res.status(403).json({
        success: false,
        error: 'Calendar permissions required. Please re-authenticate.',
        reauth: true
      });
    }

    // Step 4: Set up Google OAuth client
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:5000/auth/google/callback'
    );

    oAuth2Client.setCredentials({
      access_token: req.user.accessToken,
      refresh_token: req.user.refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    // Step 4.5: Check for conflicts with existing calendar events
    console.log('🔍 Checking for calendar conflicts...');
    const conflicts = await checkForConflicts(calendar, instances);
    if (conflicts.length > 0) {
      console.log(`⚠️ Found ${conflicts.length} scheduling conflict(s) - BLOCKING event creation`);
      return res.json({
        success: false,
        hasConflicts: true,
        conflicts: conflicts.map(c => ({
          instanceIdx: c.instanceIdx,
          proposedEvent: {
            title: c.instance.title,
            date: c.instance.date,
            start: `${c.instance.startHour}:${c.instance.startMinute} ${c.instance.startAmPm}`,
            end: `${c.instance.endHour}:${c.instance.endMinute} ${c.instance.endAmPm}`,
            guests: c.instance.guests
          },
          conflictingEvent: {
            id: c.conflictingEvent.id,
            title: c.conflictingEvent.summary,
            start: c.conflictingEvent.start,
            end: c.conflictingEvent.end,
            attendees: c.conflictingEvent.attendees
          }
        })),
        message: 'Scheduling conflict detected! Choose an option:',
        options: [
          { value: 'overwrite', label: 'Overwrite existing meeting with new one' },
          { value: 'postpone_existing', label: 'Postpone existing meeting and create new one' },
          { value: 'reschedule_new', label: 'Change new meeting time' }
        ],
        instances,
        prompt
      });
    }

    // Step 5: Create all instances sequentially and collect responses
    const created = [];
    console.log(`📅 Creating ${instances.length} event(s) on Google Calendar...`);

    for (let idx = 0; idx < instances.length; idx++) {
      const inst = instances[idx];
      // ensure end time and track if duration was auto-set
      let durationAutoSet = false;
      if (!inst.endHour || !inst.endMinute || !inst.endAmPm) {
        // if end missing, use 1 hour duration
        const end = addMinutesToDateTime(inst.date, inst.startHour, inst.startMinute, inst.startAmPm, 60);
        inst.endHour = end.hour;
        inst.endMinute = end.minute;
        inst.endAmPm = end.amPm;
        inst.endDate = end.date;
        durationAutoSet = true;
      } else {
        // ensure endDate is set - fix date calculation
        if (!inst.endDate) {
          // Check if end time is on the same day or next day
          const startMin = timeToMinutes(inst.startHour, inst.startMinute, inst.startAmPm);
          const endMin = timeToMinutes(inst.endHour, inst.endMinute, inst.endAmPm);
          if (endMin <= startMin) {
            // End time is next day
            inst.endDate = addDaysToDate(inst.date, 1);
          } else {
            // Same day
            inst.endDate = inst.date;
          }
        }
      }

      const startTime24 = convertTo24Hour(inst.startHour, inst.startMinute, inst.startAmPm);
      const endTime24 = convertTo24Hour(inst.endHour, inst.endMinute, inst.endAmPm);

      const endDateForIso = inst.endDate || inst.date;
      const startDateTime = `${inst.date}T${startTime24}:00`;
      const endDateTime = `${endDateForIso}T${endTime24}:00`;

      // Validate that end time is after start time
      const startMs = new Date(startDateTime).getTime();
      const endMs = new Date(endDateTime).getTime();
      if (endMs <= startMs) {
        console.error('❌ Invalid time range:', { startDateTime, endDateTime, inst });
        created.push({ success: false, error: 'Invalid time range: end time must be after start time', instance: inst });
        continue;
      }

      const eventData = {
        summary: inst.title,
        description: prompt,
        start: { dateTime: startDateTime, timeZone: inst.timeZone },
        end: { dateTime: endDateTime, timeZone: inst.timeZone }
      };

      if (inst.addMeet) {
        eventData.conferenceData = {
          createRequest: { requestId: Math.random().toString(36).substring(2, 15), conferenceSolutionKey: { type: 'hangoutsMeet' } }
        };
      }

      if (inst.guests && inst.guests.length > 0) {
        eventData.attendees = inst.guests.map(email => ({ email, responseStatus: 'needsAction' }));
      }

      try {
        const evResp = await calendar.events.insert({ calendarId: 'primary', resource: eventData, conferenceDataVersion: inst.addMeet ? 1 : 0 });
        const eventOrganizer = evResp.data.organizer?.email || 'unknown';
        console.log(`✅ Created event ${created.length}/${instances.length}:`, evResp.data.id, `| Organizer: ${eventOrganizer}`);
        // Verify account match
        if (req.user.email && eventOrganizer !== req.user.email) {
          console.warn(`⚠️ Account mismatch! Logged-in user: ${req.user.email}, Event organizer: ${eventOrganizer}`);
        }
        created.push({
          id: evResp.data.id,
          summary: evResp.data.summary,
          start: evResp.data.start,
          end: evResp.data.end,
          timeZone: evResp.data.start.timeZone,
          meetLink: evResp.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || null,
          attendees: evResp.data.attendees || [],
          htmlLink: evResp.data.htmlLink || null,
          organizer: evResp.data.organizer || null,
          durationAutoSet
        });
      } catch (err) {
        console.error('❌ Failed to create event for instance:', inst, err?.message || err);
        // continue creating remaining events but record failure
        created.push({ success: false, error: err?.message || String(err), instance: inst });
      }
    }

    // Check if any events had auto-set duration
    const autoSetCount = created.filter(e => e.durationAutoSet).length;
    let message = '';
    if (autoSetCount > 0) {
      message = `Note: ${autoSetCount} event(s) had no duration specified, so they were set to 1 hour by default.`;
    }

    return res.json({ success: true, created, requested: instances.length, message });
  } catch (err) {
    console.error('❌ MCP Error:', err.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create event'
    });
  }
});

/**
 * POST /api/mcp/resolve-conflict
 * Handles user's decision on conflicting meetings.
 * Accepts: { action: 'overwrite' | 'postpone_existing' | 'reschedule_new', conflictIndices: [...], instances: [...], conflicts: [...], rescheduleTime?: {...} }
 * - overwrite: delete existing event and create new one
 * - postpone_existing: move existing event to user-specified time and create new one
 * - reschedule_new: move new event to user-specified time
 */
router.post('/resolve-conflict', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated. Please login first.' });
    }

    const { action, conflictIndices, instances, conflicts, rescheduleTime, prompt } = req.body;

    if (!action || !conflictIndices || !Array.isArray(conflictIndices) || !instances || !Array.isArray(instances)) {
      return res.status(400).json({ success: false, error: 'Invalid conflict resolution request' });
    }

    // Set up Google OAuth client
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:5000/auth/google/callback'
    );

    oAuth2Client.setCredentials({
      access_token: req.user.accessToken,
      refresh_token: req.user.refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
    const created = [];
    let instancesToProcess = [...instances];

    // Action 1: Overwrite - delete conflicting events and create new ones
    if (action === 'overwrite') {
      console.log(`⚡ Overwriting ${conflictIndices.length} conflicting event(s)`);

      // Delete existing conflicting events first
      if (conflicts && Array.isArray(conflicts)) {
        for (const conflict of conflicts) {
          try {
            await calendar.events.delete({
              calendarId: 'primary',
              eventId: conflict.conflictingEvent.id
            });
            console.log(`🗑️ Deleted existing event: ${conflict.conflictingEvent.id}`);
          } catch (err) {
            console.error(`❌ Failed to delete event ${conflict.conflictingEvent.id}:`, err.message);
          }
        }
      }
      for (let idx = 0; idx < instancesToProcess.length; idx++) {
        const inst = instancesToProcess[idx];
        const startTime24 = convertTo24Hour(inst.startHour, inst.startMinute, inst.startAmPm);
        const endTime24 = convertTo24Hour(inst.endHour || inst.startHour, inst.endMinute || inst.startMinute, inst.endAmPm || inst.startAmPm);
        const endDateForIso = inst.endDate || inst.date;
        const startDateTime = `${inst.date}T${startTime24}:00`;
        const endDateTime = `${endDateForIso}T${endTime24}:00`;

        const eventData = {
          summary: inst.title,
          description: prompt || 'Event created via MCP',
          start: { dateTime: startDateTime, timeZone: inst.timeZone },
          end: { dateTime: endDateTime, timeZone: inst.timeZone }
        };

        if (inst.addMeet) {
          eventData.conferenceData = {
            createRequest: { requestId: Math.random().toString(36).substring(2, 15), conferenceSolutionKey: { type: 'hangoutsMeet' } }
          };
        }

        if (inst.guests && inst.guests.length > 0) {
          eventData.attendees = inst.guests.map(email => ({ email, responseStatus: 'needsAction' }));
        }

        try {
          const evResp = await calendar.events.insert({ calendarId: 'primary', resource: eventData, conferenceDataVersion: inst.addMeet ? 1 : 0 });
          const eventOrganizer = evResp.data.organizer?.email || 'unknown';
          console.log(`✅ Created event ${created.length}/${instancesToProcess.length}:`, evResp.data.id, `| Organizer: ${eventOrganizer}`);
          if (req.user.email && eventOrganizer !== req.user.email) {
            console.warn(`⚠️ Account mismatch! Logged-in user: ${req.user.email}, Event organizer: ${eventOrganizer}`);
          }
          created.push({
            id: evResp.data.id,
            summary: evResp.data.summary,
            start: evResp.data.start,
            end: evResp.data.end,
            timeZone: evResp.data.start.timeZone,
            meetLink: evResp.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || null,
            attendees: evResp.data.attendees || [],
            htmlLink: evResp.data.htmlLink || null,
            organizer: evResp.data.organizer || null
          });
        } catch (err) {
          console.error('❌ Failed to create event:', inst, err?.message);
          created.push({ success: false, error: err?.message || String(err), instance: inst });
        }
      }
    }
    // Action 2: Postpone existing - move existing events and create new ones
    else if (action === 'postpone_existing') {
      console.log(`📅 Postponing ${conflictIndices.length} existing event(s)`);

      if (!rescheduleTime || !rescheduleTime.date || !rescheduleTime.startHour) {
        return res.status(400).json({ success: false, error: 'Reschedule time required for postponing existing events' });
      }

      // Update existing conflicting events to new time
      if (conflicts && Array.isArray(conflicts)) {
        for (const conflict of conflicts) {
          try {
            const startTime24 = convertTo24Hour(rescheduleTime.startHour, rescheduleTime.startMinute || '00', rescheduleTime.startAmPm);
            const endTime24 = convertTo24Hour(rescheduleTime.endHour || rescheduleTime.startHour, rescheduleTime.endMinute || '00', rescheduleTime.endAmPm || rescheduleTime.startAmPm);
            const startDateTime = `${rescheduleTime.date}T${startTime24}:00`;
            const endDateTime = `${rescheduleTime.date}T${endTime24}:00`;

            await calendar.events.patch({
              calendarId: 'primary',
              eventId: conflict.conflictingEvent.id,
              resource: {
                start: { dateTime: startDateTime, timeZone: rescheduleTime.timeZone || 'Asia/Kolkata' },
                end: { dateTime: endDateTime, timeZone: rescheduleTime.timeZone || 'Asia/Kolkata' }
              }
            });
            console.log(`📅 Postponed existing event: ${conflict.conflictingEvent.id}`);
          } catch (err) {
            console.error(`❌ Failed to postpone event ${conflict.conflictingEvent.id}:`, err.message);
          }
        }
      }
      for (let idx = 0; idx < instancesToProcess.length; idx++) {
        const inst = instancesToProcess[idx];
        const startTime24 = convertTo24Hour(inst.startHour, inst.startMinute, inst.startAmPm);
        const endTime24 = convertTo24Hour(inst.endHour || inst.startHour, inst.endMinute || inst.startMinute, inst.endAmPm || inst.startAmPm);
        const endDateForIso = inst.endDate || inst.date;
        const startDateTime = `${inst.date}T${startTime24}:00`;
        const endDateTime = `${endDateForIso}T${endTime24}:00`;

        const eventData = {
          summary: inst.title,
          description: prompt || 'Event created via MCP',
          start: { dateTime: startDateTime, timeZone: inst.timeZone },
          end: { dateTime: endDateTime, timeZone: inst.timeZone }
        };

        if (inst.addMeet) {
          eventData.conferenceData = {
            createRequest: { requestId: Math.random().toString(36).substring(2, 15), conferenceSolutionKey: { type: 'hangoutsMeet' } }
          };
        }

        if (inst.guests && inst.guests.length > 0) {
          eventData.attendees = inst.guests.map(email => ({ email, responseStatus: 'needsAction' }));
        }

        try {
          const evResp = await calendar.events.insert({ calendarId: 'primary', resource: eventData, conferenceDataVersion: inst.addMeet ? 1 : 0 });
          created.push({
            id: evResp.data.id,
            summary: evResp.data.summary,
            start: evResp.data.start,
            end: evResp.data.end,
            timeZone: evResp.data.start.timeZone,
            meetLink: evResp.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || null,
            attendees: evResp.data.attendees || [],
            htmlLink: evResp.data.htmlLink || null,
            organizer: evResp.data.organizer || null
          });
          console.log(`✅ Created event ${created.length}/${instancesToProcess.length}:`, evResp.data.id);
        } catch (err) {
          console.error('❌ Failed to create event:', inst, err?.message);
          created.push({ success: false, error: err?.message || String(err), instance: inst });
        }
      }
    }
    // Action 3: Reschedule new - move new events to a different time
    else if (action === 'reschedule_new') {
      console.log(`📅 Rescheduling ${conflictIndices.length} new event(s)`);

      if (!rescheduleTime || !rescheduleTime.date || !rescheduleTime.startHour) {
        return res.status(400).json({ success: false, error: 'Reschedule time required for rescheduling new events' });
      }

      // Update conflicting instances to new time
      for (const idx of conflictIndices) {
        const inst = instancesToProcess[idx];
        inst.date = rescheduleTime.date;
        inst.startHour = rescheduleTime.startHour;
        inst.startMinute = rescheduleTime.startMinute || '00';
        inst.startAmPm = rescheduleTime.startAmPm;
        inst.endHour = rescheduleTime.endHour || rescheduleTime.startHour;
        inst.endMinute = rescheduleTime.endMinute || '00';
        inst.endAmPm = rescheduleTime.endAmPm || rescheduleTime.startAmPm;
        inst.timeZone = rescheduleTime.timeZone || 'Asia/Kolkata';
      }
      // Create all instances (some with rescheduled times)
      for (let idx = 0; idx < instancesToProcess.length; idx++) {
        const inst = instancesToProcess[idx];
        const startTime24 = convertTo24Hour(inst.startHour, inst.startMinute, inst.startAmPm);
        const endTime24 = convertTo24Hour(inst.endHour || inst.startHour, inst.endMinute || inst.startMinute, inst.endAmPm || inst.startAmPm);
        const endDateForIso = inst.endDate || inst.date;
        const startDateTime = `${inst.date}T${startTime24}:00`;
        const endDateTime = `${endDateForIso}T${endTime24}:00`;

        const eventData = {
          summary: inst.title,
          description: prompt || 'Event created via MCP',
          start: { dateTime: startDateTime, timeZone: inst.timeZone },
          end: { dateTime: endDateTime, timeZone: inst.timeZone }
        };

        if (inst.addMeet) {
          eventData.conferenceData = {
            createRequest: { requestId: Math.random().toString(36).substring(2, 15), conferenceSolutionKey: { type: 'hangoutsMeet' } }
          };
        }

        if (inst.guests && inst.guests.length > 0) {
          eventData.attendees = inst.guests.map(email => ({ email, responseStatus: 'needsAction' }));
        }

        try {
          const evResp = await calendar.events.insert({ calendarId: 'primary', resource: eventData, conferenceDataVersion: inst.addMeet ? 1 : 0 });
          created.push({
            id: evResp.data.id,
            summary: evResp.data.summary,
            start: evResp.data.start,
            end: evResp.data.end,
            timeZone: evResp.data.start.timeZone,
            meetLink: evResp.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || null,
            attendees: evResp.data.attendees || [],
            htmlLink: evResp.data.htmlLink || null,
            organizer: evResp.data.organizer || null
          });
          console.log(`✅ Created event ${created.length}/${instancesToProcess.length}:`, evResp.data.id);
        } catch (err) {
          console.error('❌ Failed to create event:', inst, err?.message);
          created.push({ success: false, error: err?.message || String(err), instance: inst });
        }
      }
    }

    return res.json({ success: true, created, resolved: instancesToProcess.length });
  } catch (err) {
    console.error('❌ Conflict resolution error:', err.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to resolve conflicts'
    });
  }
});

/**
 * DELETE /api/mcp/event/:eventId
 * Delete a specific event by ID
 */
router.delete('/event/:eventId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated. Please login first.' });
    }

    const { eventId } = req.params;
    if (!eventId) {
      return res.status(400).json({ success: false, error: 'Event ID is required' });
    }

    // Set up Google OAuth client
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:5000/auth/google/callback'
    );

    oAuth2Client.setCredentials({
      access_token: req.user.accessToken,
      refresh_token: req.user.refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId
    });

    console.log(`🗑️ Deleted event: ${eventId}`);
    return res.json({ success: true, message: 'Event deleted successfully' });
  } catch (err) {
    console.error('❌ Delete event error:', err.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete event'
    });
  }
});

/**
 * POST /api/mcp/cleanup-duplicates
 * Find and remove duplicate events (same title, time, and date)
 */
router.post('/cleanup-duplicates', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated. Please login first.' });
    }

    // Set up Google OAuth client
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:5000/auth/google/callback'
    );

    oAuth2Client.setCredentials({
      access_token: req.user.accessToken,
      refresh_token: req.user.refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    // Get all events from the past week to now + 1 month
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 7);
    const timeMax = new Date();
    timeMax.setMonth(timeMax.getMonth() + 1);

    const resp = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 500
    });

    const events = resp.data.items || [];
    const duplicates = [];
    const seen = new Map();

    for (const event of events) {
      if (!event.start?.dateTime || !event.summary) continue;

      const key = `${event.summary}_${event.start.dateTime}_${event.end.dateTime}`;

      if (seen.has(key)) {
        duplicates.push({
          id: event.id,
          summary: event.summary,
          start: event.start,
          end: event.end,
          originalId: seen.get(key).id
        });
      } else {
        seen.set(key, event);
      }
    }

    console.log(`🔍 Found ${duplicates.length} duplicate events`);

    // Delete duplicates (keep the first occurrence)
    const deleted = [];
    for (const duplicate of duplicates) {
      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: duplicate.id
        });
        deleted.push(duplicate);
        console.log(`🗑️ Deleted duplicate: ${duplicate.summary} (${duplicate.id})`);
      } catch (err) {
        console.error(`❌ Failed to delete duplicate ${duplicate.id}:`, err.message);
      }
    }

    return res.json({
      success: true,
      message: `Cleaned up ${deleted.length} duplicate events`,
      deleted: deleted.length,
      found: duplicates.length
    });
  } catch (err) {
    console.error('❌ Cleanup duplicates error:', err.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to cleanup duplicates'
    });
  }
});

/**
 * POST /api/mcp/free-slots
 * Find available time slots on a given date
 */
router.post('/free-slots', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { date, duration } = req.body;
    if (!date || !duration) {
      return res.status(400).json({ success: false, error: 'Date and duration required' });
    }

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:5000/auth/google/callback'
    );

    oAuth2Client.setCredentials({
      access_token: req.user.accessToken,
      refresh_token: req.user.refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    const dayStart = `${date}T00:00:00Z`;
    const dayEnd = `${date}T23:59:59Z`;

    const resp = await calendar.events.list({
      calendarId: 'primary',
      timeMin: dayStart,
      timeMax: dayEnd,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = resp.data.items || [];
    const busySlots = events.map(e => ({
      start: new Date(e.start.dateTime || e.start.date).getHours() * 60 + new Date(e.start.dateTime || e.start.date).getMinutes(),
      end: new Date(e.end.dateTime || e.end.date).getHours() * 60 + new Date(e.end.dateTime || e.end.date).getMinutes()
    }));

    const workStart = 9 * 60; // 9 AM
    const workEnd = 18 * 60; // 6 PM
    const freeSlots = [];

    for (let time = workStart; time < workEnd; time += 30) {
      const slotEnd = time + parseInt(duration);
      if (slotEnd > workEnd) break;

      const hasConflict = busySlots.some(busy =>
        !(slotEnd <= busy.start || time >= busy.end)
      );

      if (!hasConflict) {
        const hours = Math.floor(time / 60);
        const mins = time % 60;
        freeSlots.push({
          start_time: `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
        });
      }

      if (freeSlots.length >= 4) break;
    }

    return res.json({ success: true, slots: freeSlots });
  } catch (error) {
    console.error('Free slots error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/mcp/reschedule
 * Deletes an old meeting and creates a new one.
 */
router.post('/reschedule', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated.' });
    }

    const { oldEventId, email, meeting_date, start_time, duration_minutes } = req.body;

    // 1. Setup Calendar Client
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:5000/auth/google/callback'
    );
    oAuth2Client.setCredentials({ access_token: req.user.accessToken, refresh_token: req.user.refreshToken });
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    // 2. Delete Old Event
    try {
      if (oldEventId) {
        await calendar.events.delete({ calendarId: 'primary', eventId: oldEventId });
        console.log(`🗑️ Deleted old event: ${oldEventId}`);
      }
    } catch (err) {
      console.warn('⚠️ Failed to delete old event (might not exist):', err.message);
    }

    // 3. Create New Event (reuse create logic logic conceptually, but implemented directly here for simplicity with known args)
    // Construct a prompt for the Parse logic to reuse it, OR just build the event directly since we have structured args.
    // Building directly is safer/faster since we have strict args from LLM.

    // Time calculations
    const startTime24 = start_time;
    // Calculate end time
    const [h, m] = start_time.split(':').map(Number);
    const startDateObj = new Date(`${meeting_date}T${start_time}:00`);
    const endDateObj = new Date(startDateObj.getTime() + duration_minutes * 60000);

    // Format for Google Calendar
    const toGoogleTime = (dateObj) => {
      // Need ISO string but preserve local time offset if possible, or just use UTC/ISO
      // Simplest: YYYY-MM-DDTHH:MM:SS
      return dateObj.toISOString().split('.')[0]; // Naive, returns UTC usually. 
      // Better: Construct string manually to match input "meeting_date" + "start_time"
    };

    // Let's use the explicit strings to ensure local time correctness relative to user perception
    const endH = endDateObj.getHours().toString().padStart(2, '0');
    const endM = endDateObj.getMinutes().toString().padStart(2, '0');
    const endTime24 = `${endH}:${endM}`;
    // Handle date rollover if needed (not active in this simple snippet, assume same day mostly or naive calc)
    const endDateStr = endDateObj.toISOString().split('T')[0];

    const eventData = {
      summary: "Royal Enfield Product Discussion",
      description: `Meeting with ${email}`,
      start: { dateTime: `${meeting_date}T${startTime24}:00`, timeZone: 'Asia/Kolkata' }, // Defaulting TZ
      end: { dateTime: `${endDateStr}T${endTime24}:00`, timeZone: 'Asia/Kolkata' },
      attendees: [{ email }]
    };

    const evResp = await calendar.events.insert({ calendarId: 'primary', resource: eventData });
    const newEvent = evResp.data;

    return res.json({
      success: true,
      created: [{
        id: newEvent.id,
        summary: newEvent.summary,
        start: newEvent.start,
        end: newEvent.end
      }]
    });

  } catch (error) {
    console.error('❌ Reschedule Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
