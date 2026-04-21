const { google } = require('googleapis');

function getCalendarClient(user) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });
  return google.calendar({ version: 'v3', auth });
}

async function getGoogleCalendarEvents(user, startDate, endDate) {
  const calendar = getCalendarClient(user);
  const { data } = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });

  return (data.items || []).map(event => ({
    id: `google-${event.id}`,
    title: event.summary || 'No title',
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    type: 'google',
    color: '#8b5cf6',
    allDay: !!event.start.date,
    data: event,
  }));
}

async function pushEventToGoogleCalendar(user, { title, start, end, description }) {
  const calendar = getCalendarClient(user);
  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: title,
      description: description || 'Created by Acadex AI Scheduler',
      start: { dateTime: new Date(start).toISOString() },
      end: { dateTime: new Date(end).toISOString() },
      colorId: '9',
    },
  });
  return data;
}

module.exports = { getGoogleCalendarEvents, pushEventToGoogleCalendar };
