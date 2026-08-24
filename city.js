// Shared logic for all city pages.
// Each page sets:  var CITY_NAME = 'Bologna';  before loading this script.

var CITIES     = ['Bologna', 'Milan', 'Interlaken', 'Zurich'];
var CITY_PAGES = { Bologna: 'bologna.html', Milan: 'milan.html', Interlaken: 'interlaken.html', Zurich: 'zurich.html' };

// Timeline grid: 7 AM – 11 PM, one row per hour. Events are positioned by
// their actual start time and duration rather than snapped to a slot, so a
// 90-minute activity visibly spans an hour and a half instead of looking
// identical to a 15-minute one.
var SLOT_LABELS = ['7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM',
                   '1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM',
                   '7:00 PM','8:00 PM','9:00 PM','10:00 PM'];
var DAY_START_MIN  = 7 * 60;   // 7:00 AM
var DAY_END_MIN    = 23 * 60;  // 11:00 PM — bottom of the last (10 PM) row
var ROW_HEIGHT      = 56;       // px per hour
var PX_PER_MIN       = ROW_HEIGHT / 60;
var DEFAULT_DURATION = 60;      // minutes, used when an event has no duration set

function timeToMinutes(t) {
  var parts = t.split(':');
  return (+parts[0]) * 60 + (+parts[1]);
}
function fmtTime(mins) {
  var h = Math.floor(mins / 60), m = mins % 60;
  var ap = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + (m ? ':' + (m < 10 ? '0' : '') + m : '') + ' ' + ap;
}

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

// One event block, absolutely positioned over the hour grid to span its
// actual start time through start+duration. `attendees` is 'all', a count,
// or a list of names -- when it's a subset of the group, that's called out
// explicitly so it reads as optional/split rather than a plan for everyone.
function renderEvent(ev) {
  var start = timeToMinutes(ev.time);
  var dur   = ev.duration || DEFAULT_DURATION;
  var end   = start + dur;
  var top    = (Math.max(start, DAY_START_MIN) - DAY_START_MIN) * PX_PER_MIN;
  var height = Math.max((Math.min(end, DAY_END_MIN) - Math.max(start, DAY_START_MIN)) * PX_PER_MIN, 22);
  // Narrow columns (several things overlapping) or short durations leave
  // little room to work with, so trim what's shown in tiers rather than
  // letting text spill out of the block.
  var sizeClass = height < 40 ? ' micro' : height < 70 ? ' compact' : '';

  var colPct = 100 / ev._cols;
  var left  = 'calc(' + (ev._col * colPct) + '% + 2px)';
  var width = 'calc(' + colPct + '% - 4px)';

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

  return '<div class="t-event' + (ev.type ? ' ' + ev.type : '') + (ev.status ? ' ' + ev.status : '') + sizeClass + '"' +
    ' style="top:' + top + 'px;height:' + height + 'px;left:' + left + ';width:' + width + '">' +
    '<div class="t-event-top">' +
      '<div class="t-event-label">' + titleHtml + '</div>' +
      (ev.status === 'booked' ? '<span class="t-event-badge booked">✓ Booked</span>' : '') +
      (ev.status === 'idea' ? '<span class="t-event-badge idea">Idea</span>' : '') +
      (ev.status === 'no-booking' ? '<span class="t-event-badge no-booking">No booking needed</span>' : '') +
      (ev.status === 'pending' ? '<span class="t-event-badge pending">Pending</span>' : '') +
    '</div>' +
    '<div class="t-event-time">' + fmtTime(start) + ' – ' + fmtTime(end) + '</div>' +
    (who ? '<div class="t-event-who">👥 ' + escapeHtml(who) + '</div>' : '') +
  '</div>';
}

// Greedy column packing so overlapping events sit side by side instead of
// stacking on top of each other. Events are annotated in place with _col
// (their column index) and _cols (how many columns *their own cluster* of
// mutually-overlapping events needs) — scoped per cluster, not per day, so
// one crowded overlap earlier in the day doesn't squeeze an unrelated
// standalone event later on into needlessly narrow columns.
function packColumns(events) {
  var sorted = events.slice().sort(function(a, b) { return timeToMinutes(a.time) - timeToMinutes(b.time); });
  var i = 0;
  while (i < sorted.length) {
    var cluster    = [sorted[i]];
    var clusterEnd = timeToMinutes(sorted[i].time) + (sorted[i].duration || DEFAULT_DURATION);
    var j = i + 1;
    while (j < sorted.length && timeToMinutes(sorted[j].time) < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, timeToMinutes(sorted[j].time) + (sorted[j].duration || DEFAULT_DURATION));
      cluster.push(sorted[j]);
      j++;
    }

    var colEnds = []; // end time (minutes) currently occupying each column, within this cluster
    cluster.forEach(function(ev) {
      var start = timeToMinutes(ev.time);
      var end   = start + (ev.duration || DEFAULT_DURATION);
      var col = colEnds.findIndex(function(e) { return e <= start; });
      if (col === -1) { col = colEnds.length; colEnds.push(end); } else { colEnds[col] = end; }
      ev._col = col;
    });
    var cols = colEnds.length;
    cluster.forEach(function(ev) { ev._cols = cols; });

    i = j;
  }
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
    renderCity(stop, data.hotels || []);
  })
  .catch(function() {
    document.getElementById('cityPage').innerHTML =
      '<p style="color:var(--muted);padding:40px 0">Failed to load trip data.</p>';
  });

// ── Where you're staying: the decided (booked, or picked-but-unbooked) pick
// for this city, with a brief description and a small location map ─────────
function renderStay(stop, hotels) {
  var pick = hotels.find(function(h) { return h.city === stop.city && h.status === 'booked'; }) ||
             hotels.find(function(h) { return h.city === stop.city && h.status === 'picked'; });

  if (!pick) {
    return '<div class="panel">' +
      '<div class="panel-title">Where You\'re Staying</div>' +
      '<p class="panel-empty">Not decided yet — see the <a href="housing.html" style="color:var(--accent);text-decoration:underline;font-style:normal">Housing page</a> for options.</p>' +
      '</div>';
  }

  var nameHtml = pick.url
    ? '<a href="' + pick.url + '" target="_blank" rel="noopener">' + escapeHtml(pick.name) + '</a>'
    : escapeHtml(pick.name);
  var checkParts = [];
  if (pick.checkInTime)  checkParts.push('Check-in ' + pick.checkInTime);
  if (pick.checkOutTime) checkParts.push('Checkout ' + pick.checkOutTime);

  var mapHtml = '';
  if (pick.coords && pick.coords.length === 2) {
    mapHtml = '<div class="housing-map" id="stayMap"></div>' +
      '<div class="housing-map-caption">📍 Approximate location — based on the listed neighborhood, not the exact address</div>';
  }

  return '<div class="panel">' +
    '<div class="panel-title">Where You\'re Staying</div>' +
    '<div class="housing-body" style="padding:0">' +
      '<div class="housing-name">' + nameHtml + ' ' +
        '<span class="housing-badge ' + pick.status + '">' + (pick.status === 'booked' ? 'Booked' : 'Picked') + '</span>' +
      '</div>' +
      (pick.address ? '<div class="housing-location">📍 ' + escapeHtml(pick.address) + '</div>' : '') +
      (checkParts.length ? '<span class="city-nights-badge" style="align-self:flex-start">' + checkParts.join(' · ') + '</span>' : '') +
      (pick.notes ? '<p class="housing-notes">' + escapeHtml(pick.notes) + '</p>' : '') +
      mapHtml +
      (pick.url ? '<a class="housing-link" href="' + pick.url + '" target="_blank" rel="noopener">View on Airbnb →</a>' : '') +
    '</div>' +
    '</div>';
}

function initStayMap(pick) {
  var el = document.getElementById('stayMap');
  if (!el || typeof L === 'undefined' || !pick.coords) return;
  var map = L.map('stayMap', { zoomControl: false, attributionControl: false, scrollWheelZoom: false })
    .setView(pick.coords, 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18, subdomains: 'abcd' }).addTo(map);
  var icon = L.divIcon({
    className: 'c-marker',
    html: '<div class="c-pin" style="width:26px;height:26px;background:#DD8452"><span style="font-size:0.7rem">🏠</span></div>',
    iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -28]
  });
  L.marker(pick.coords, { icon: icon }).addTo(map);
}

function renderCity(stop, hotels) {
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

  // ── Schedule ── A calendar cell links here as e.g. bologna.html#2026-09-14,
  // so the tab for that specific date opens active instead of always Day 1.
  var targetDate = window.location.hash ? window.location.hash.slice(1) : null;
  var initialIndex = targetDate ? days.findIndex(function(d) { return d.date === targetDate; }) : -1;
  if (initialIndex === -1) initialIndex = 0;

  var tabsHtml = '';
  var daysHtml = '';
  days.forEach(function(day, di) {
    var isActive = di === initialIndex;
    if (days.length > 1) {
      tabsHtml += '<button class="day-tab-btn' + (isActive ? ' active' : '') +
        '" data-di="' + di + '">' + day.label + ' · ' + fmtShort(day.date) + '</button>';
    }

    // Events overlapping in time get packed into side-by-side columns instead
    // of stacking, so two things happening at once are both visible at once.
    var events = day.events || [];
    packColumns(events);

    var rowsHtml = SLOT_LABELS.map(function(label) {
      return '<div class="t-hour-row"><span class="t-time">' + label + '</span></div>';
    }).join('');

    daysHtml += '<div class="sched-day' + (isActive ? ' active' : '') + '" data-di="' + di + '">';
    daysHtml += '<div class="sched-day-label">' + fmtLong(day.date) + '</div>';
    daysHtml += '<div class="sched-day-grid" style="height:' + ((DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN) + 'px">' +
      '<div class="t-rows">' + rowsHtml + '</div>' +
      '<div class="t-events-layer">' + events.map(renderEvent).join('') + '</div>' +
      '</div>';
    daysHtml += '</div>';
  });

  var sched = '<div class="panel">' +
    '<div class="panel-title">Schedule</div>' +
    (days.length > 1 ? '<div class="day-tabs">' + tabsHtml + '</div>' : '') +
    daysHtml +
    '</div>';

  // ── Render ── Schedule is the main focus, centered and wide, with
  // Activities and the Airbnb info as slim sidebars flanking it.
  var stayHtml = renderStay(stop, hotels);
  document.getElementById('cityPage').innerHTML =
    hero + '<div class="city-cols">' +
      '<div class="city-col-activities">' + acts + '</div>' +
      '<div class="city-col-schedule">' + sched + '</div>' +
      '<div class="city-col-stay">' + stayHtml + '</div>' +
    '</div>';

  var stayPick = hotels.find(function(h) { return h.city === stop.city && h.status === 'booked'; }) ||
                 hotels.find(function(h) { return h.city === stop.city && h.status === 'picked'; });
  if (stayPick) initStayMap(stayPick);

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
