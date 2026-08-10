// Shared logic for all city pages.
// Each page sets:  var CITY_NAME = 'Bologna';  before loading this script.

var CITIES     = ['Bologna', 'Milan', 'Interlaken', 'Zurich'];
var CITY_PAGES = { Bologna: 'bologna.html', Milan: 'milan.html', Interlaken: 'interlaken.html', Zurich: 'zurich.html' };

// Time slots: 7 AM – 10 PM, hourly
var SLOT_LABELS = ['7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM',
                   '1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM',
                   '7:00 PM','8:00 PM','9:00 PM','10:00 PM'];
var SLOT_KEYS   = ['07:00','08:00','09:00','10:00','11:00','12:00',
                   '13:00','14:00','15:00','16:00','17:00','18:00',
                   '19:00','20:00','21:00','22:00'];

// ── Render prev/next nav ───────────────────────────────────────────────
(function() {
  var idx = CITIES.indexOf(CITY_NAME);
  var html = '';
  if (idx > 0) {
    var prev = CITIES[idx - 1];
    html += '<a class="nav-btn" href="' + CITY_PAGES[prev] + '">← ' + prev + '</a>';
  }
  if (idx < CITIES.length - 1) {
    var next = CITIES[idx + 1];
    html += '<a class="nav-btn" href="' + CITY_PAGES[next] + '">' + next + ' →</a>';
  }
  var nav = document.getElementById('navCities');
  if (nav) nav.innerHTML = html;
})();

// ── Utility ────────────────────────────────────────────────────────────
function fmtShort(s) {
  return s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}
function fmtLong(s) {
  return s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' }) : '';
}
function addDays(s, n) {
  var d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

// One event within a time slot. `attendees` is 'all', a count, or a list of
// names -- when it's a subset of the group, that's called out explicitly so
// it reads as optional/split rather than a plan for everyone.
function renderEvent(ev) {
  var who = '';
  if (Array.isArray(ev.attendees)) {
    who = ev.attendees.join(', ');
  } else if (typeof ev.attendees === 'number') {
    who = ev.attendees + ' people';
  } else if (ev.attendees && ev.attendees !== 'all') {
    who = ev.attendees;
  }

  var titleHtml = ev.link
    ? '<a href="' + ev.link + '" target="_blank" rel="noopener">' + escapeHtml(ev.label) + ' ↗</a>'
    : escapeHtml(ev.label);

  return '<div class="t-event' + (ev.type ? ' ' + ev.type : '') + (ev.status ? ' ' + ev.status : '') + '">' +
    '<div class="t-event-top">' +
      '<div class="t-event-label">' + titleHtml + '</div>' +
      (ev.status === 'booked' ? '<span class="t-event-badge booked">✓ Booked</span>' : '') +
      (ev.status === 'idea' ? '<span class="t-event-badge idea">Idea</span>' : '') +
    '</div>' +
    (who ? '<div class="t-event-who">👥 ' + escapeHtml(who) + '</div>' : '') +
  '</div>';
}

// ── Fetch data and render ────────────────────────────────────────────────────────────
fetch('data.json')
  .then(function(r) { return r.json(); })
  .then(function(data) {
    var stop = (data.itinerary || []).find(function(s) { return s.city === CITY_NAME; });
    if (!stop) {
      document.getElementById('cityPage').innerHTML =
        '<p style="color:var(--muted);padding:40px 0">City not found in itinerary.</p>';
      return;
    }
    renderCity(stop);
  })
  .catch(function() {
    document.getElementById('cityPage').innerHTML =
      '<p style="color:var(--muted);padding:40px 0">Failed to load trip data.</p>';
  });

function renderCity(stop) {
  // Build days from data.json `days` field, or auto-generate from nights count
  var days = (stop.days && stop.days.length) ? stop.days : [];
  if (!days.length && stop.nights > 0) {
    for (var i = 0; i < stop.nights; i++) {
      days.push({ label: 'Day ' + (i + 1), date: addDays(stop.date, i), events: [] });
    }
  }

  // ── Hero ──
  var checkOut = fmtShort(addDays(stop.date, stop.nights || 0));
  var hero = '<div class="city-hero">' +
    '<div class="city-hero-row">' +
      '<div class="city-hero-emoji">' + (stop.emoji || '🌍') + '</div>' +
      '<div>' +
        '<h1 class="city-hero-name">' + (stop.flag || '') + ' ' + stop.city + '</h1>' +
        '<div class="city-hero-sub">' +
          '<span class="city-hero-dates">' + fmtShort(stop.date) +
            (stop.nights > 0 ? ' – ' + checkOut + ', 2026' : '') +
          '</span>' +
          (stop.nights > 0
            ? '<span class="city-nights-badge">' + stop.nights + ' night' + (stop.nights !== 1 ? 's' : '') + '</span>'
            : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    (stop.notes ? '<p class="city-notes">' + stop.notes + '</p>' : '') +
    '</div>';

  // ── Activities ──
  var actList = stop.activities || [];
  var acts = '<div class="panel">' +
    '<div class="panel-title">What To Do</div>' +
    (actList.length
      ? actList.map(function(a) {
          return '<div class="act-item"><div class="act-dot"></div><span>' + a + '</span></div>';
        }).join('')
      : '<p class="panel-empty">Nothing planned yet — add ideas as we go.</p>') +
    '</div>';

  // ── Schedule ──
  var tabsHtml = '';
  var daysHtml = '';
  days.forEach(function(day, di) {
    var isActive = di === 0;
    if (days.length > 1) {
      tabsHtml += '<button class="day-tab-btn' + (isActive ? ' active' : '') +
        '" data-di="' + di + '">' + day.label + ' · ' + fmtShort(day.date) + '</button>';
    }

    // Multiple events can share a time slot -- e.g. an optional activity
    // that's only a subset of the group, running alongside something else.
    var evMap = {};
    (day.events || []).forEach(function(e) {
      if (!evMap[e.time]) evMap[e.time] = [];
      evMap[e.time].push(e);
    });

    daysHtml += '<div class="sched-day' + (isActive ? ' active' : '') + '" data-di="' + di + '">';
    daysHtml += '<div class="sched-day-label">' + fmtLong(day.date) + '</div>';
    SLOT_KEYS.forEach(function(key, ki) {
      var evs = evMap[key] || [];
      daysHtml += '<div class="t-slot">' +
        '<span class="t-time">' + SLOT_LABELS[ki] + '</span>' +
        '<div class="t-content">' +
          evs.map(renderEvent).join('') +
        '</div>' +
        '</div>';
    });
    daysHtml += '</div>';
  });

  var sched = '<div class="panel">' +
    '<div class="panel-title">Schedule</div>' +
    (days.length > 1 ? '<div class="day-tabs">' + tabsHtml + '</div>' : '') +
    daysHtml +
    '</div>';

  // ── Render ──
  document.getElementById('cityPage').innerHTML =
    hero + '<div class="city-cols">' + acts + sched + '</div>';

  // Day tab switching
  document.querySelectorAll('.day-tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var di = this.dataset.di;
      document.querySelectorAll('.day-tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.sched-day').forEach(function(d) { d.classList.remove('active'); });
      this.classList.add('active');
      var target = document.querySelector('.sched-day[data-di="' + di + '"]');
      if (target) target.classList.add('active');
    });
  });
}
