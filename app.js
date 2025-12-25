// ======================
// CONFIG: EDIT THIS PART
// ======================

const SUPABASE_URL = "https://tecbuwpdhhlbzgjadego.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DDNV8FDFpgYoEelsTk0zbQ_AL7oePju";

// Daily limit (same for all days)
const DAILY_LIMIT = 6000000;

// Allowed calendar range (inclusive)
const START_YEAR = 2025;
const START_MONTH = 11; // 0-based: 11 = December 2025
const END_YEAR = 2026;
const END_MONTH = 11; // 0-based: 11 = December 2026

// ======================
// SUPABASE INIT
// ======================

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ======================
// STATE
// ======================

let currentUser = null;
let currentMonth = START_MONTH;
let currentYear = START_YEAR;
let selectedDate = new Date(START_YEAR, START_MONTH, 1);

// Cache of all events keyed by ISO date string "YYYY-MM-DD"
const eventsByDate = new Map();

// Name → color map (lowercase name as key)
const nameColorMap = new Map();

// ======================
// DOM ELEMENTS
// ======================

const authContainer = document.getElementById("auth-container");
const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authMessage = document.getElementById("auth-message");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");

const calendarContainer = document.getElementById("calendar-container");
const monthLabel = document.getElementById("month-label");
const prevMonthBtn = document.getElementById("prev-month-btn");
const nextMonthBtn = document.getElementById("next-month-btn");
const calendarDays = document.getElementById("calendar-days");

const logoutBtn = document.getElementById("logout-btn");
const addEventBtn = document.getElementById("add-event-btn");

const summaryDate = document.getElementById("summary-date");
const summaryLimit = document.getElementById("summary-limit");
const summaryUsed = document.getElementById("summary-used");
const summaryRemaining = document.getElementById("summary-remaining");

const dayEventsList = document.getElementById("day-events-list");

// Modal elements
const eventModal = document.getElementById("event-modal");
const modalClose = document.getElementById("modal-close");
const modalTitle = document.getElementById("modal-title");

const eventForm = document.getElementById("event-form");
const eventDateDisplay = document.getElementById("event-date-display");
const eventNameInput = document.getElementById("event-name");
const eventValueInput = document.getElementById("event-value");
const eventColorInput = document.getElementById("event-color");
const eventDoneInput = document.getElementById("event-done");
const eventIdInput = document.getElementById("event-id");
const deleteEventBtn = document.getElementById("delete-event-btn");

// ======================
// UTILITIES
// ======================

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function withinRange(year, month) {
  const start = new Date(START_YEAR, START_MONTH, 1);
  const end = new Date(END_YEAR, END_MONTH + 1, 0); // inclusive
  const cur = new Date(year, month, 1);
  return (
    cur >= new Date(start.getFullYear(), start.getMonth(), 1) &&
    cur <= new Date(end.getFullYear(), end.getMonth(), 1)
  );
}

function clampMonthYear(year, month) {
  const startIndex = START_YEAR * 12 + START_MONTH;
  const endIndex = END_YEAR * 12 + END_MONTH;
  let idx = year * 12 + month;
  if (idx < startIndex) idx = startIndex;
  if (idx > endIndex) idx = endIndex;
  return [Math.floor(idx / 12), idx % 12];
}

// ======================
// MODAL
// ======================

function openModal(isEdit = false) {
  modalTitle.textContent = isEdit ? "Edit Event" : "Add Event";
  deleteEventBtn.classList.toggle("hidden", !isEdit);
  eventModal.classList.remove("hidden");
}

function closeModal() {
  eventModal.classList.add("hidden");
  clearEventForm();
}

modalClose.addEventListener("click", closeModal);

eventModal.addEventListener("click", (e) => {
  if (e.target === eventModal) {
    closeModal();
  }
});

// ======================
// AUTH HANDLERS
// ======================

async function checkAuthOnLoad() {
  const { data } = await supabaseClient.auth.getSession();
  if (data && data.session) {
    currentUser = data.session.user;
    showCalendar();
  } else {
    showAuth();
  }
}

function showAuth() {
  authContainer.classList.remove("hidden");
  calendarContainer.classList.add("hidden");
}

function showCalendar() {
  authContainer.classList.add("hidden");
  calendarContainer.classList.remove("hidden");
  initCalendar();
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authMessage.textContent = "";
  const email = authEmail.value.trim();
  const password = authPassword.value;

  try {
    loginBtn.disabled = true;
    signupBtn.disabled = true;
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      authMessage.textContent = error.message;
      return;
    }
    currentUser = data.user;
    showCalendar();
  } finally {
    loginBtn.disabled = false;
    signupBtn.disabled = false;
  }
});

signupBtn.addEventListener("click", async () => {
  authMessage.textContent = "";
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    authMessage.textContent = "Email and password are required.";
    return;
  }

  try {
    loginBtn.disabled = true;
    signupBtn.disabled = true;
    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
    });
    if (error) {
      authMessage.textContent = error.message;
      return;
    }
    authMessage.textContent =
      "Sign up successful. Check your email (if confirmation required), then log in.";
  } finally {
    loginBtn.disabled = false;
    signupBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  currentUser = null;
  eventsByDate.clear();
  nameColorMap.clear();
  showAuth();
});

// "Add Event" button near summary
addEventBtn.addEventListener("click", () => {
  clearEventForm();
  updateEventFormDate();
  openModal(false);
});

// ======================
// CALENDAR RENDERING
// ======================

async function initCalendar() {
  [currentYear, currentMonth] = clampMonthYear(currentYear, currentMonth);
  selectedDate = new Date(currentYear, currentMonth, 1);

  await loadAllEvents();

  renderCalendar();
  selectDate(new Date(currentYear, currentMonth, 1));
}

function renderCalendar() {
  monthLabel.textContent = new Date(currentYear, currentMonth, 1).toLocaleDateString(
    undefined,
    { year: "numeric", month: "long" }
  );

  calendarDays.innerHTML = "";
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const startWeekday = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  let gridStartDate = new Date(currentYear, currentMonth, 1 - startWeekday);

  for (let i = 0; i < 42; i++) {
    const dayDate = new Date(
      gridStartDate.getFullYear(),
      gridStartDate.getMonth(),
      gridStartDate.getDate() + i
    );

    const dayDiv = document.createElement("div");
    dayDiv.classList.add("calendar-day");

    if (dayDate.getMonth() !== currentMonth) {
      dayDiv.classList.add("outside-month");
    }

    if (!withinRange(dayDate.getFullYear(), dayDate.getMonth())) {
      dayDiv.classList.add("outside-range");
    }

    const dayNumber = document.createElement("div");
    dayNumber.classList.add("day-number");
    dayNumber.textContent = dayDate.getDate();
    dayDiv.appendChild(dayNumber);

    const iso = toISODate(dayDate);
    const dayEvents = eventsByDate.get(iso) || [];

    for (const ev of dayEvents) {
      const pill = document.createElement("div");
      pill.classList.add("event-pill");
      if (ev.done) pill.classList.add("done");
      pill.style.backgroundColor = ev.color;
      pill.innerHTML = `<span class="event-pill-check">${ev.done ? "✔" : "•"}</span><span>${ev.name}</span>`;

      // Click on event pill: edit that event in modal
      pill.addEventListener("click", (e) => {
        e.stopPropagation(); // prevent day cell click
        fillFormForEvent(ev);
        openModal(true);
      });

      dayDiv.appendChild(pill);
    }

    dayDiv.addEventListener("click", () => {
      selectDate(
        new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate())
      );
      clearEventForm();
      openModal(false);
    });

    if (toISODate(dayDate) === toISODate(selectedDate)) {
      dayDiv.classList.add("selected");
    }

    calendarDays.appendChild(dayDiv);
  }

  updateNavButtons();
}

function updateNavButtons() {
  const [minYear, minMonth] = [START_YEAR, START_MONTH];
  const [maxYear, maxMonth] = [END_YEAR, END_MONTH];

  const curIndex = currentYear * 12 + currentMonth;
  const minIndex = minYear * 12 + minMonth;
  const maxIndex = maxYear * 12 + maxMonth;

  prevMonthBtn.disabled = curIndex <= minIndex;
  nextMonthBtn.disabled = curIndex >= maxIndex;
}

prevMonthBtn.addEventListener("click", () => {
  let year = currentYear;
  let month = currentMonth - 1;
  if (month < 0) {
    month = 11;
    year--;
  }
  [currentYear, currentMonth] = clampMonthYear(year, month);
  renderCalendar();
  selectDate(new Date(currentYear, currentMonth, 1));
});

nextMonthBtn.addEventListener("click", () => {
  let year = currentYear;
  let month = currentMonth + 1;
  if (month > 11) {
    month = 0;
    year++;
  }
  [currentYear, currentMonth] = clampMonthYear(year, month);
  renderCalendar();
  selectDate(new Date(currentYear, currentMonth, 1));
});

// ======================
// DATE SELECTION & SUMMARY
// ======================

function selectDate(dateObj) {
  const iso = toISODate(dateObj);
  selectedDate = dateObj;

  const dayNodes = Array.from(calendarDays.children);
  dayNodes.forEach((node) => node.classList.remove("selected"));

  dayNodes.forEach((node) => {
    const numNode = node.querySelector(".day-number");
    if (!numNode) return;
    const day = parseInt(numNode.textContent, 10);
    const isOutsideMonth = node.classList.contains("outside-month");

    let cellMonth = currentMonth;
    let cellYear = currentYear;

    if (isOutsideMonth) {
      if (day > 15) {
        cellMonth = currentMonth - 1;
        if (cellMonth < 0) {
          cellMonth = 11;
          cellYear--;
        }
      } else {
        cellMonth = currentMonth + 1;
        if (cellMonth > 11) {
          cellMonth = 0;
          cellYear++;
        }
      }
    }

    const cellDate = new Date(cellYear, cellMonth, day);
    if (toISODate(cellDate) === iso) {
      node.classList.add("selected");
    }
  });

  updateSummaryForDate(iso);
  updateEventFormDate();
  renderDayEvents(iso);
}

function updateSummaryForDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);

  const events = eventsByDate.get(iso) || [];
  const used = events.reduce((sum, ev) => sum + Number(ev.value || 0), 0);
  const remaining = DAILY_LIMIT - used;

  summaryDate.textContent = formatDisplayDate(dateObj);
  summaryLimit.textContent = DAILY_LIMIT.toLocaleString();
  summaryUsed.textContent = used.toLocaleString();
  summaryRemaining.textContent = remaining.toLocaleString();
}

function updateEventFormDate() {
  eventDateDisplay.value = formatDisplayDate(selectedDate);
}

// ======================
// LOAD/SAVE EVENTS
// ======================

async function loadAllEvents() {
  const startDate = new Date(START_YEAR, START_MONTH, 1);
  const endDate = new Date(END_YEAR, END_MONTH + 1, 0);
  const startISO = toISODate(startDate);
  const endISO = toISODate(endDate);

  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .gte("event_date", startISO)
    .lte("event_date", endISO)
    .order("event_date", { ascending: true })
    .order("inserted_at", { ascending: true });

  if (error) {
    console.error("Error loading events:", error);
    return;
  }

  eventsByDate.clear();
  nameColorMap.clear();

  for (const ev of data) {
    const dateKey = ev.event_date;
    if (!eventsByDate.has(dateKey)) {
      eventsByDate.set(dateKey, []);
    }
    eventsByDate.get(dateKey).push(ev);

    const keyName = ev.name.trim().toLowerCase();
    if (keyName && !nameColorMap.has(keyName)) {
      nameColorMap.set(keyName, ev.color);
    }
  }
}

async function saveEvent(evData) {
  const isEdit = !!evData.id;

  const normalizedName = evData.name.trim();
  const nameKey = normalizedName.toLowerCase();

  if (nameColorMap.has(nameKey)) {
    evData.color = nameColorMap.get(nameKey);
  } else {
    nameColorMap.set(nameKey, evData.color);
  }

  if (isEdit) {
    const { error } = await supabaseClient
      .from("events")
      .update({
        event_date: evData.event_date,
        name: normalizedName,
        value: evData.value,
        color: evData.color,
        done: evData.done,
      })
      .eq("id", evData.id);

    if (error) {
      console.error("Update error:", error);
      return;
    }

    propagateNameColorAndUpdate(
      evData.id,
      normalizedName,
      evData.color,
      evData.done,
      evData.value,
      evData.event_date
    );
  } else {
    const { data, error } = await supabaseClient
      .from("events")
      .insert([
        {
          event_date: evData.event_date,
          name: normalizedName,
          value: evData.value,
          color: evData.color,
          done: evData.done,
        },
      ])
      .select();

    if (error) {
      console.error("Insert error:", error);
      return;
    }

    const inserted = data[0];
    const dateKey = inserted.event_date;
    if (!eventsByDate.has(dateKey)) {
      eventsByDate.set(dateKey, []);
    }
    eventsByDate.get(dateKey).push(inserted);
  }

  const isoSelected = toISODate(selectedDate);
  renderCalendar();
  renderDayEvents(isoSelected);
  updateSummaryForDate(isoSelected);
}

async function deleteEventById(eventId) {
  const { error } = await supabaseClient
    .from("events")
    .delete()
    .eq("id", eventId);

  if (error) {
    console.error("Delete error:", error);
    return;
  }

  for (const [dateKey, arr] of eventsByDate.entries()) {
    const idx = arr.findIndex((ev) => ev.id === eventId);
    if (idx !== -1) {
      arr.splice(idx, 1);
      if (arr.length === 0) {
        eventsByDate.delete(dateKey);
      }
      break;
    }
  }

  const isoSelected = toISODate(selectedDate);
  renderCalendar();
  renderDayEvents(isoSelected);
  updateSummaryForDate(isoSelected);
}

function propagateNameColorAndUpdate(
  id,
  newName,
  newColor,
  newDone,
  newValue,
  newDate
) {
  const newKey = newName.trim().toLowerCase();
  nameColorMap.set(newKey, newColor);

  for (const [dateKey, arr] of eventsByDate.entries()) {
    for (let i = 0; i < arr.length; i++) {
      const ev = arr[i];
      const evKey = ev.name.trim().toLowerCase();
      if (ev.id === id) {
        ev.name = newName;
        ev.color = newColor;
        ev.done = newDone;
        ev.value = newValue;
        ev.event_date = newDate;

        if (dateKey !== newDate) {
          arr.splice(i, 1);
          if (arr.length === 0) eventsByDate.delete(dateKey);
          if (!eventsByDate.has(newDate)) eventsByDate.set(newDate, []);
          eventsByDate.get(newDate).push(ev);
        }
      } else if (evKey === newKey) {
        ev.color = newColor;
      }
    }
  }
}

// ======================
// EVENT FORM HANDLING
// ======================

eventForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedDate) return;

  const isoDate = toISODate(selectedDate);
  const name = eventNameInput.value.trim();
  const value = parseFloat(eventValueInput.value);
  const color = eventColorInput.value;
  const done = eventDoneInput.checked;
  const id = eventIdInput.value || null;

  if (!name || isNaN(value)) return;

  const evData = {
    id,
    event_date: isoDate,
    name,
    value,
    color,
    done,
  };

  await saveEvent(evData);
  closeModal();
});

deleteEventBtn.addEventListener("click", async () => {
  const id = eventIdInput.value;
  if (!id) return;

  const yes = confirm("Delete this event?");
  if (!yes) return;

  await deleteEventById(id);
  closeModal();
});

function clearEventForm() {
  eventIdInput.value = "";
  eventNameInput.value = "";
  eventValueInput.value = "";
  eventColorInput.value = "#00b894";
  eventDoneInput.checked = false;
}

// Fill the form for editing a specific event
function fillFormForEvent(ev) {
  selectedDate = new Date(ev.event_date);
  eventIdInput.value = ev.id;
  eventNameInput.value = ev.name;
  eventValueInput.value = ev.value;
  eventColorInput.value = ev.color || "#00b894";
  eventDoneInput.checked = !!ev.done;

  updateEventFormDate();
  selectDate(selectedDate);
}

// ======================
// DAY EVENTS LIST
// ======================

function renderDayEvents(iso) {
  const events = eventsByDate.get(iso) || [];
  dayEventsList.innerHTML = "";

  if (events.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No events for this day.";
    empty.style.fontSize = "0.85rem";
    empty.style.color = "#7c8a96";
    dayEventsList.appendChild(empty);
    return;
  }

  for (const ev of events) {
    const row = document.createElement("div");
    row.classList.add("day-event-item");

    const left = document.createElement("div");
    left.classList.add("day-event-left");

    const colorDot = document.createElement("div");
    colorDot.classList.add("day-event-color");
    colorDot.style.backgroundColor = ev.color;

    const nameSpan = document.createElement("span");
    nameSpan.classList.add("day-event-name");
    if (ev.done) nameSpan.classList.add("done");
    nameSpan.textContent = ev.name;

    left.appendChild(colorDot);
    left.appendChild(nameSpan);

    const right = document.createElement("div");
    right.classList.add("day-event-meta");
    right.textContent = `${Number(ev.value).toLocaleString()} ${
      ev.done ? "(done)" : ""
    }`;

    row.appendChild(left);
    row.appendChild(right);

    row.addEventListener("click", async (e) => {
      e.stopPropagation(); // prevent calendar cell click
      if (e.metaKey || e.ctrlKey) {
        const yes = confirm("Delete this event?");
        if (yes) {
          await deleteEventById(ev.id);
        }
      } else {
        fillFormForEvent(ev);
        openModal(true);
      }
    });

    dayEventsList.appendChild(row);
  }
}

// ======================
// STARTUP
// ======================

checkAuthOnLoad();
