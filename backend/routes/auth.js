const express = require('express');
const passport = require('passport');
const router = express.Router();

// Google OAuth login
router.get('/google', passport.authenticate('google', {
  scope: [
    'profile',
    'email',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ],
  accessType: 'offline',
  prompt: 'consent'
}));

// Google OAuth callback
router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed` }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }
);

// Get current user
router.get('/user', (req, res) => {
  if (req.user) {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        picture: req.user.picture
      }
    });
  } else {
    res.status(401).json({ success: false, message: 'Not authenticated' });
  }
});

const { google } = require('googleapis');

// Create calendar event
router.post('/calendar/create-event', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!req.user.accessToken || !req.user.refreshToken) {
      return res.status(403).json({ 
        error: "Calendar permissions required", 
        reauth: true 
      });
    }

    const { title, description, date, startTime, endTime, timeZone, addMeet } = req.body;

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "http://localhost:5000/auth/google/callback"
    );

    oAuth2Client.setCredentials({
      access_token: req.user.accessToken,
      refresh_token: req.user.refreshToken
    });

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = `${date}T${endTime}:00`;

    const eventData = {
      summary: title,
      description: description,
      start: {
        dateTime: startDateTime,
        timeZone: timeZone
      },
      end: {
        dateTime: endDateTime,
        timeZone: timeZone
      }
    };

    if (addMeet) {
      eventData.conferenceData = {
        createRequest: {
          requestId: Math.random().toString(36).substring(2, 15),
          conferenceSolutionKey: { type: "hangoutsMeet" }
        }
      };
    }

    const event = await calendar.events.insert({
      calendarId: "primary",
      resource: eventData,
      conferenceDataVersion: 1
    });

    return res.json({
      success: true,
      event: {
        id: event.data.id,
        title: event.data.summary,
        description: event.data.description,
        start: event.data.start.dateTime,
        end: event.data.end.dateTime,
        meetLink: event.data.conferenceData?.entryPoints?.[0]?.uri || null
      }
    });

  } catch (err) {
    console.error("Create Event Error:", err);
    if (err.code === 403 || err.message?.includes('insufficient')) {
      return res.status(403).json({
        success: false,
        error: "Calendar permissions required. Please re-authenticate.",
        reauth: true
      });
    }
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to create event"
    });
  }
});

// Get calendar events
router.get('/calendar', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!req.user.accessToken || !req.user.refreshToken) {
      return res.status(403).json({ 
        error: "Calendar permissions required", 
        reauth: true 
      });
    }

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "http://localhost:5000/auth/google/callback"
    );

    oAuth2Client.setCredentials({
      access_token: req.user.accessToken,
      refresh_token: req.user.refreshToken
    });

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: "startTime"
    });

    return res.json({ success: true, events: events.data.items });

  } catch (err) {
    console.error("Calendar API Error:", err);
    if (err.code === 403 || err.message?.includes('insufficient')) {
      return res.status(403).json({
        success: false,
        error: "Calendar permissions required. Please re-authenticate.",
        reauth: true
      });
    }
    return res.status(500).json({
      success: false,
      error: err.message || "Calendar API failed"
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

module.exports = router;