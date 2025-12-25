// ======================
// CONFIG: EDIT THIS PART
// ======================

const SUPABASE_URL = "https://tecbuwpdhhlbzgjadego.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DDNV8FDFpgYoEelsTk0zbQ_AL7oePju";

// Daily limit (easy to change)
const DAILY_LIMIT = 6000000;

// Calendar range: December 2025 to December 2026 (inclusive)
const START_YEAR = 2025;
const START_MONTH = 11; // 0-based: 11 = December
const END_YEAR = 2026;
const END_MONTH = 11;   // 0-based: 11 = December

// =======================
// Supabase client
// =======================

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =======================
// DOM elements
// =======================

const authContainer = document.getElementById('auth-container');
const mainContainer = document.getElementById('main-container');
const authEmailLabel = document.getElementById('auth-email');
const logoutBtn = document.getElementById('logout-btn');

const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const authEmailInput = document.getElementById('auth-email-input');
const authPasswordInput = document.getElementById('auth-password-input');
const authMessage = document.getElementById('auth-message');

const monthLabel = document.getElementById('month-label');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const calendarDaysContainer = document.getElementById('calendar-days');

const selectedDateLabel = document.getElementById('selected-date-label');
const dailyLimitLabel = document.getElementById('daily-limit');
const totalAmountLabel = document.getElementById('total-amount');
const usedAmountLabel = document.getElementById('used-amount');
const remainingAmountLabel = document.getElementById('remaining-amount');

const dayEventsList = document.getElementById('day-events-list');
const eventFormTitle = document.getElementById('event-form-title');
const eventNameInput = document.getElementById('event-name-input');
const eventValueInput = document.getElementById('event-value-input');
const eventColorInput = document.getElementById('event-color-input');
const saveEventBtn = document.getElementById('save-event-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const eventFormMessage = document.getElementById('event-form-message');

// =======================
// State
// =======================

let currentYear = START_YEAR;
let currentMonth = START_MONTH; // 0-based
let selectedDate = null; // string 'YYYY-MM-DD'

// Cache all events loaded (for the whole range)
let allEvents = [];

// Editing state
let editingEventId = null;

// =======================
// Helpers
// =======================

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function monthInRange(year, monthIndex) {
  if (year < START_YEAR || year > END_YEAR) return false;
  if (year === START_YEAR && monthIndex < START_MONTH) return false;
  if (year === END_YEAR && monthIndex > END_MONTH) return false;
  return true;
}

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function formatCurrency(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// =======================
// Auth logic
// =======================

async function handleLogin() {
  authMessage.textContent = '';
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (!email || !password) {
    authMessage.textContent = 'Please fill in email and password.';
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    authMessage.textContent = `Login error: ${error.message}`;
    return;
  }

  authMessage.textContent = 'Logged in successfully.';
}

async function handleSignup() {
  authMessage.textContent = '';
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (!email || !password) {
    authMessage.textContent = 'Please fill in email and password.';
    return;
  }

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    authMessage.textContent = `Sign up error: ${error.message}`;
    return;
  }

  authMessage.textContent = 'Sign up successful. Check your email if confirmation is required, then log in.';
}

async function handleLogout() {
  await supabase.auth.signOut();
}

async function refreshSessionUI() {
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;

  if (user) {
    authEmailLabel.textContent = user.email || '';
    logoutBtn.classList.remove('hidden');
    authContainer.classList.add('hidden');
    mainContainer.classList.remove('hidden');
    await loadAllEvents();
    renderCalendar();
    if (!selectedDate) {
      // default to the first day of the start month
      const defaultDate = new Date(START_YEAR, START_MONTH, 1);
      selectedDate = formatDateKey(defaultDate);
    }
    updateSelectedDateUI();
  } else {
    authEmailLabel.textContent = '';
    logoutBtn.classList.add('hidden');
    authContainer.classList.remove('hidden');
    mainContainer.classList.add('hidden');
  }
}

// =======================
// Events data
// =======================

// Load all events within the configured calendar range
async function loadAllEvents() {
  const from = `${START_YEAR}-${String(START_MONTH + 1).padStart(2, '0')}-01`;
  const to = `${END_YEAR}-${String(END_MONTH + 1).padStart(2, '0')}-31`;

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading events', error);
    return;
  }

  allEvents = data || [];
}

// Save new or existing event
async function saveEvent() {
  eventFormMessage.textContent = '';
  if (!selectedDate) {
    eventFormMessage.textContent = 'Select a day first.';
    return;
  }

  const rawName = eventNameInput.value;
  const name = rawName.trim();
  const value = Number(eventValueInput.value);
  const color = eventColorInput.value || '#4caf50';

  if (!name) {
    eventFormMessage.textContent = 'Name is required.';
    return;
  }
  if (Number.isNaN(value)) {
    eventFormMessage.textContent = 'Value must be a number.';
    return;
  }

  const payload = {
    event_date: selectedDate,
    name,
    value,
    color,
  };

  if (!editingEventId) {
    // insert new
    const { data, error } = await supabase
      .from('events')
      .insert(payload)
      .select('*');

    if (error) {
      eventFormMessage.textContent = `Error adding event: ${error.message}`;
      return;
    }

    // sync color for this name across events: update existing rows with same name (case-insensitive)
    const normName = normalizeName(name);
    await supabase
      .from('events')
      .update({ color })
      .ilike('name', normName);

    // reload all
    await loadAllEvents();
    renderCalendar();
    updateSelectedDateUI();
    resetEventForm();
  } else {
    // update existing
    const { error } = await supabase
      .from('events')
      .update(payload)
      .eq('id', editingEventId);

    if (error) {
      eventFormMessage.textContent = `Error updating event: ${error.message}`;
      return;
    }

    // sync color across same-name events
    const normName = normalizeName(name);
    await supabase
      .from('events')
      .update({ color })
      .ilike('name', normName);

    await loadAllEvents();
    renderCalendar();
    updateSelectedDateUI();
    resetEventForm();
  }
}

function resetEventForm() {
  editingEventId = null;
  eventFormTitle.textContent = 'Add event';
  eventNameInput.value = '';
  eventValueInput.value = '';
  eventColorInput.value = '#4caf50';
  cancelEditBtn.classList.add('hidden');
  eventFormMessage.textContent = '';
}

// Delete event
async function deleteEvent(eventId) {
  if (!confirm('Delete this event?')) return;
  await supabase.from('events').delete().eq('id', eventId);
  await loadAllEvents();
  renderCalendar();
  updateSelectedDateUI();
}

// Toggle done/paid status
async function toggleDone(eventObj) {
  const { id, done } = eventObj;
  const { error } = await supabase
    .from('events')
    .update({ done: !done })
    .eq('id', id);

  if (error) {
    console.error('Error toggling done status', error);
    return;
  }

  await loadAllEvents();
  renderCalendar();
  updateSelectedDateUI();
}

// Set editing state from an event
function startEditingEvent(eventObj) {
  editingEventId = eventObj.id;
  eventFormTitle.textContent = 'Edit event';
  eventNameInput.value = eventObj.name;
  eventValueInput.value = eventObj.value;
  eventColorInput.value = eventObj.color;
  cancelEditBtn.classList.remove('hidden');
  eventFormMessage.textContent = '';
}

// =======================
// Calendar rendering
// =======================

function renderCalendar() {
  calendarDaysContainer.innerHTML = '';

  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const monthName = firstDay.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  monthLabel.textContent = monthName;

  dailyLimitLabel.textContent = formatCurrency(DAILY_LIMIT);

  // Days of previous blanks
  const leadingBlanks = firstDay.getDay();

  for (let i = 0; i < leadingBlanks; i++) {
    const blank = document.createElement('div');
    blank.className = 'day-cell empty';
    calendarDaysContainer.appendChild(blank);
  }

  const totalDays = lastDay.getDate();

  // Build events by date
  const eventsByDate = {};
  allEvents.forEach(ev => {
    const key = ev.event_date;
    if (!eventsByDate[key]) {
      eventsByDate[key] = [];
    }
    eventsByDate[key].push(ev);
  });

  for (let day = 1; day <= totalDays; day++) {
    const dateObj = new Date(currentYear, currentMonth, day);
    const dateKey = formatDateKey(dateObj);
    const dayEvents = eventsByDate[dateKey] || [];
    const dayCell = document.createElement('div');
    dayCell.className = 'day-cell';
    dayCell.dataset.date = dateKey;

    const header = document.createElement('div');
    header.className = 'day-cell-header';

    const num = document.createElement('div');
    num.className = 'day-number';
    num.textContent = day;

    const totalDiv = document.createElement('div');
    totalDiv.className = 'day-total';

    const totalValue = dayEvents.reduce((sum, e) => sum + Number(e.value || 0), 0);
    totalDiv.textContent = totalValue > 0 ? formatCurrency(totalValue) : '';

    if (totalValue > DAILY_LIMIT) {
      dayCell.classList.add('over-limit');
    }

    header.appendChild(num);
    header.appendChild(totalDiv);
    dayCell.appendChild(header);

    const pillContainer = document.createElement('div');
    pillContainer.className = 'day-pills';

    // group color by normalized name to ensure consistent color
    const colorByName = {};
    dayEvents.forEach(ev => {
      const key = normalizeName(ev.name);
      if (!colorByName[key]) {
        colorByName[key] = ev.color || '#4caf50';
      }
    });

    dayEvents.forEach(ev => {
      const pill = document.createElement('div');
      pill.className = 'pill';
      const colorKey = normalizeName(ev.name);
      const pillColor = colorByName[colorKey] || ev.color || '#4caf50';
      pill.style.backgroundColor = pillColor;
      pill.textContent = ev.name;

      if (ev.done) {
        pill.classList.add('done');
      }

      pillContainer.appendChild(pill);
    });

    dayCell.appendChild(pillContainer);

    if (selectedDate === dateKey) {
      dayCell.classList.add('selected');
    }

    dayCell.addEventListener('click', () => {
      selectedDate = dateKey;
      updateSelectedDateUI();
      renderCalendar(); // rerender to highlight selected cell
    });

    calendarDaysContainer.appendChild(dayCell);
  }

  // disable prev/next if out of range
  prevMonthBtn.disabled = !monthInRange(
    currentYear,
    currentMonth - 1
  );
  nextMonthBtn.disabled = !monthInRange(
    currentYear,
    currentMonth + 1
  );
}

function updateSelectedDateUI() {
  if (!selectedDate) {
    selectedDateLabel.textContent = 'Select a date';
    totalAmountLabel.textContent = '0.00';
    usedAmountLabel.textContent = '0.00';
    remainingAmountLabel.textContent = '0.00';
    dayEventsList.innerHTML = '';
    return;
  }

  const dateObj = parseDateKey(selectedDate);
  const label = dateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  selectedDateLabel.textContent = label;

  // Filter events for selected date
  const events = allEvents.filter(ev => ev.event_date === selectedDate);

  // Stats
  const total = events.reduce((sum, e) => sum + Number(e.value || 0), 0);
  const used = total; // you could define done vs not-done differently, but spec says show total/used/remaining
  const remaining = DAILY_LIMIT - used;

  totalAmountLabel.textContent = formatCurrency(total);
  usedAmountLabel.textContent = formatCurrency(used);
  remainingAmountLabel.textContent = formatCurrency(remaining);

  renderDaySummary(events);
}

function renderDaySummary(events) {
  dayEventsList.innerHTML = '';

  if (!events || events.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No events for this day.';
    empty.style.color = '#6f7b87';
    empty.style.fontSize = '0.8rem';
    dayEventsList.appendChild(empty);
    return;
  }

  events.forEach(ev => {
    const li = document.createElement('li');
    li.className = 'day-event-item';
    if (ev.done) {
      li.classList.add('done');
    }

    // main clickable area for edit
    const mainDiv = document.createElement('div');
    mainDiv.className = 'day-event-main';

    const colorDot = document.createElement('div');
    colorDot.style.width = '10px';
    colorDot.style.height = '10px';
    colorDot.style.borderRadius = '50%';
    colorDot.style.backgroundColor = ev.color || '#4caf50';
    colorDot.style.border = '1px solid rgba(0,0,0,0.4)';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'day-event-name';
    nameSpan.textContent = ev.name;

    const valSpan = document.createElement('span');
    valSpan.className = 'day-event-value';
    valSpan.textContent = formatCurrency(ev.value);

    mainDiv.appendChild(colorDot);
    mainDiv.appendChild(nameSpan);
    mainDiv.appendChild(valSpan);

    mainDiv.addEventListener('click', () => startEditingEvent(ev));

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'day-event-actions';

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'toggle-done-btn';
    doneBtn.textContent = ev.done ? 'Undo' : 'Done';
    doneBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDone(ev);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'delete-btn';
    delBtn.textContent = 'Del';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteEvent(ev.id);
    });

    actionsDiv.appendChild(doneBtn);
    actionsDiv.appendChild(delBtn);

    li.appendChild(mainDiv);
    li.appendChild(actionsDiv);

    dayEventsList.appendChild(li);
  });
}

// =======================
// Month navigation
// =======================

function goToPrevMonth() {
  const newMonth = currentMonth - 1;
  const newYear = newMonth < 0 ? currentYear - 1 : currentYear;
  const adjustedMonth = (newMonth + 12) % 12;

  if (!monthInRange(newYear, adjustedMonth)) return;

  currentYear = newYear;
  currentMonth = adjustedMonth;
  renderCalendar();
  updateSelectedDateUI();
}

function goToNextMonth() {
  const newMonth = currentMonth + 1;
  const newYear = newMonth > 11 ? currentYear + 1 : currentYear;
  const adjustedMonth = newMonth % 12;

  if (!monthInRange(newYear, adjustedMonth)) return;

  currentYear = newYear;
  currentMonth = adjustedMonth;
  renderCalendar();
  updateSelectedDateUI();
}

// =======================
// Event listeners
// =======================

loginBtn.addEventListener('click', handleLogin);
signupBtn.addEventListener('click', handleSignup);
logoutBtn.addEventListener('click', handleLogout);

saveEventBtn.addEventListener('click', saveEvent);
cancelEditBtn.addEventListener('click', resetEventForm);

prevMonthBtn.addEventListener('click', goToPrevMonth);
nextMonthBtn.addEventListener('click', goToNextMonth);

// Auth state listener
supabase.auth.onAuthStateChange((_event, _session) => {
  refreshSessionUI();
});

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  dailyLimitLabel.textContent = formatCurrency(DAILY_LIMIT);
  refreshSessionUI();
});
