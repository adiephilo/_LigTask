const STORAGE_KEY = "studyspace-data-v1";

const TECHNIQUES = {
  pomodoro: { name: "Pomodoro", focus: 25, shortBreak: 5, longBreak: 15, longEvery: 4 },
  short: { name: "Short Sprint", focus: 15, shortBreak: 3, longBreak: 10, longEvery: 4 },
  deep: { name: "Deep Focus", focus: 50, shortBreak: 10, longBreak: 20, longEvery: 3 },
  "52-17": { name: "52 / 17 Method", focus: 52, shortBreak: 17, longBreak: 25, longEvery: 3 },
  flow: { name: "Flowtime", focus: 30, shortBreak: 5, longBreak: 15, longEvery: 4 }
};

const $ = (selector) => document.querySelector(selector);
const taskForm = $("#taskForm");
const taskInput = $("#taskInput");
const taskList = $("#taskList");
const formMessage = $("#formMessage");

let appData = loadData();
let timerInterval = null;

function defaultData() {
  return {
    tasks: [],
    nextTaskId: 1,
    selectedTechnique: "pomodoro",
    flowMinutes: 30,
    completedSessions: 0,
    timer: {
      phase: "focus",
      remainingSeconds: 25 * 60,
      running: false,
      endAt: null
    }
  };
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return defaultData();
    const defaults = defaultData();
    const merged = {
      ...defaults,
      ...saved,
      tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
      timer: { ...defaults.timer, ...(saved.timer || {}) }
    };
    if (!TECHNIQUES[merged.selectedTechnique]) merged.selectedTechnique = "pomodoro";
    if (!Number.isFinite(merged.flowMinutes)) merged.flowMinutes = 30;

    // Restore an active timer accurately after a page refresh.
    if (merged.timer.running && merged.timer.endAt) {
      merged.timer.remainingSeconds = Math.max(
        0, Math.ceil((merged.timer.endAt - Date.now()) / 1000)
      );
      if (merged.timer.remainingSeconds === 0) finishPhase(false);
    }
    return merged;
  } catch {
    return defaultData();
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  } catch {
    formMessage.textContent = "Browser storage is unavailable. Your latest changes may not be saved.";
  }
}

function showPage(pageName) {
  const isReview = pageName === "review";
  $("#dashboardPage").classList.toggle("active", !isReview);
  $("#reviewPage").classList.toggle("active", isReview);
  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageName);
  });
  $("#pageEyebrow").textContent = isReview ? "BUILD A BETTER STUDY ROUTINE" : "YOUR PRODUCTIVITY OVERVIEW";
  $("#pageTitle").textContent = isReview ? "Your review room" : "Welcome to your dashboard";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});
document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.go));
});

$("#todayLabel").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric"
}).format(new Date());

function updateCounters() {
  const completed = appData.tasks.filter(task => task.completed).length;
  $("#totalCount").textContent = appData.tasks.length;
  $("#completedCount").textContent = completed;
  $("#remainingCount").textContent = appData.tasks.length - completed;
}

function renderTasks() {
  taskList.replaceChildren();
  if (!appData.tasks.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No tasks yet. Add your first task above!";
    taskList.append(empty);
  } else {
    appData.tasks.forEach(task => {
      const item = document.createElement("li");
      item.className = `task-item${task.completed ? " completed" : ""}`;
      item.dataset.id = task.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-check";
      checkbox.checked = task.completed;
      checkbox.setAttribute("aria-label", `Mark ${task.text} complete`);
      checkbox.dataset.action = "toggle";

      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = task.text;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-button";
      remove.textContent = "Remove";
      remove.dataset.action = "remove";
      remove.setAttribute("aria-label", `Remove ${task.text}`);

      item.append(checkbox, text, remove);
      taskList.append(item);
    });
  }
  updateCounters();
}

taskForm.addEventListener("submit", event => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    formMessage.textContent = "Please enter a task first.";
    taskInput.focus();
    return;
  }
  appData.tasks.push({
    id: appData.nextTaskId++,
    text,
    completed: false,
    createdAt: Date.now()
  });
  taskInput.value = "";
  formMessage.textContent = "Task added and saved.";
  saveData();
  renderTasks();
  taskInput.focus();
});

taskList.addEventListener("change", event => {
  if (!event.target.matches('[data-action="toggle"]')) return;
  const item = event.target.closest("[data-id]");
  const task = appData.tasks.find(entry => entry.id === Number(item.dataset.id));
  if (task) {
    task.completed = event.target.checked;
    saveData();
    renderTasks();
  }
});

taskList.addEventListener("click", event => {
  const button = event.target.closest('[data-action="remove"]');
  if (!button) return;
  const item = button.closest("[data-id]");
  appData.tasks = appData.tasks.filter(task => task.id !== Number(item.dataset.id));
  saveData();
  renderTasks();
  formMessage.textContent = "Task removed.";
});

$("#clearCompleted").addEventListener("click", () => {
  const before = appData.tasks.length;
  appData.tasks = appData.tasks.filter(task => !task.completed);
  saveData();
  renderTasks();
  formMessage.textContent = before === appData.tasks.length
    ? "There are no completed tasks to clear."
    : "Completed tasks cleared.";
});

function getPhaseDuration(phase) {
  const technique = TECHNIQUES[appData.selectedTechnique];
  if (phase === "focus") {
    return appData.selectedTechnique === "flow"
      ? appData.flowMinutes * 60
      : technique.focus * 60;
  }
  return (phase === "longBreak" ? technique.longBreak : technique.shortBreak) * 60;
}

function phaseName(phase) {
  return phase === "focus" ? "Focus" : phase === "longBreak" ? "Long break" : "Short break";
}

function updateTimerUI() {
  const timer = appData.timer;
  const technique = TECHNIQUES[appData.selectedTechnique];
  const seconds = Math.max(0, timer.remainingSeconds);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const duration = getPhaseDuration(timer.phase);
  const elapsedRatio = duration ? 1 - seconds / duration : 0;

  $("#timerTechnique").textContent = technique.name;
  $("#timerDisplay").textContent = `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  $("#timerMode").textContent = phaseName(timer.phase).toUpperCase();
  $("#phaseLabel").textContent = timer.phase === "focus" ? "FOCUS TIME" : "BREAK TIME";
  $("#timerHint").textContent = timer.running ? "Stay with your session" : "Ready when you are";
  $("#startPauseButton").textContent = timer.running ? "Pause timer" : (timer.remainingSeconds < duration ? "Resume timer" : timer.phase === "focus" ? "Start focus" : "Start break");
  $("#sessionCount").textContent = appData.completedSessions;
  $("#timerRing").style.setProperty("--progress", `${Math.max(0, Math.min(1, elapsedRatio)) * 360}deg`);
  $("#flowSettings").hidden = appData.selectedTechnique !== "flow";
  $("#flowMinutes").value = appData.flowMinutes;
}

function stopInterval() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimer() {
  if (appData.timer.remainingSeconds <= 0) {
    appData.timer.remainingSeconds = getPhaseDuration(appData.timer.phase);
  }
  appData.timer.running = true;
  appData.timer.endAt = Date.now() + appData.timer.remainingSeconds * 1000;
  saveData();
  stopInterval();
  timerInterval = setInterval(tickTimer, 250);
  updateTimerUI();
}

function pauseTimer() {
  appData.timer.remainingSeconds = Math.max(0, Math.ceil((appData.timer.endAt - Date.now()) / 1000));
  appData.timer.running = false;
  appData.timer.endAt = null;
  stopInterval();
  saveData();
  updateTimerUI();
}

function tickTimer() {
  appData.timer.remainingSeconds = Math.max(0, Math.ceil((appData.timer.endAt - Date.now()) / 1000));
  if (appData.timer.remainingSeconds <= 0) {
    finishPhase(true);
  } else {
    updateTimerUI();
  }
}

function finishPhase(shouldNotify = true) {
  stopInterval();
  const finishedPhase = appData.timer.phase;
  if (finishedPhase === "focus") {
    appData.completedSessions += 1;
    const technique = TECHNIQUES[appData.selectedTechnique];
    const isLongBreak = appData.completedSessions % technique.longEvery === 0;
    appData.timer.phase = isLongBreak ? "longBreak" : "shortBreak";
  } else {
    appData.timer.phase = "focus";
  }
  appData.timer.remainingSeconds = getPhaseDuration(appData.timer.phase);
  appData.timer.running = false;
  appData.timer.endAt = null;
  saveData();
  updateTimerUI();
  if (shouldNotify) {
    const message = finishedPhase === "focus"
      ? "Focus session complete. Time for a break!"
      : "Break finished. Ready for another focus session?";
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("StudySpace", { body: message });
    } else {
      alert(message);
    }
  }
}

function resetTimer() {
  stopInterval();
  appData.timer.running = false;
  appData.timer.endAt = null;
  appData.timer.remainingSeconds = getPhaseDuration(appData.timer.phase);
  saveData();
  updateTimerUI();
}

function selectTechnique(key) {
  if (!TECHNIQUES[key]) return;
  stopInterval();
  appData.selectedTechnique = key;
  appData.timer = {
    phase: "focus",
    remainingSeconds: getPhaseDuration("focus"),
    running: false,
    endAt: null
  };
  document.querySelectorAll(".technique-card").forEach(card => {
    card.classList.toggle("selected", card.dataset.technique === key);
  });
  saveData();
  updateTimerUI();
}

document.querySelectorAll("[data-technique]").forEach(card => {
  card.addEventListener("click", () => selectTechnique(card.dataset.technique));
});

$("#startPauseButton").addEventListener("click", () => {
  if (appData.timer.running) pauseTimer();
  else startTimer();
});

$("#resetTimerButton").addEventListener("click", resetTimer);
$("#skipPhaseButton").addEventListener("click", () => finishPhase(false));

$("#applyFlow").addEventListener("click", () => {
  const minutes = Number($("#flowMinutes").value);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 180) {
    alert("Choose a focus length from 5 to 180 minutes.");
    return;
  }
  appData.flowMinutes = minutes;
  resetTimer();
  saveData();
});

function initializeTimer() {
  document.querySelectorAll(".technique-card").forEach(card => {
    card.classList.toggle("selected", card.dataset.technique === appData.selectedTechnique);
  });
  updateTimerUI();
  if (appData.timer.running) {
    timerInterval = setInterval(tickTimer, 250);
  }
}

window.addEventListener("beforeunload", () => {
  if (appData.timer.running && appData.timer.endAt) saveData();
});

renderTasks();
initializeTimer();
showPage("dashboard");
