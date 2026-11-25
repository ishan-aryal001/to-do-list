'use strict'; // Helps catch common mistakes

/* ==========================================================
   1. SETTINGS
   ========================================================== */
const STORAGE_KEY = 'todo-tasks-v1';   // where tasks are saved in localStorage
const THEME_KEY = 'todo-theme';        // where the theme choice is saved
const REMOVE_ANIMATION_MS = 200;       // must match slide-out time in style.css

// Small SVG icons (these are our own fixed strings, never user text)
const ICONS = {
  edit:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
  delete: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
  save:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>',
  cancel: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
};

/* ==========================================================
   2. STATE (the data the app remembers while running)
   ========================================================== */
let tasks = [];            // list of task objects: {id, text, done, due, priority}
let currentFilter = 'all'; // 'all' | 'active' | 'completed'
let editingId = null;      // id of the task being edited (or null)
let justAddedId = null;    // id of the newest task, so only it gets the slide-in animation

/* ==========================================================
   3. GRAB ELEMENTS FROM THE PAGE
   ========================================================== */
const form = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const dueInput = document.getElementById('due-input');
const priorityInput = document.getElementById('priority-input');
const formError = document.getElementById('form-error');
const storageWarning = document.getElementById('storage-warning');
const taskList = document.getElementById('task-list');
const emptyState = document.getElementById('empty-state');
const emptyMessage = document.getElementById('empty-message');
const counter = document.getElementById('counter');
const clearBtn = document.getElementById('clear-completed');
const filterButtons = document.querySelectorAll('.filter-btn');
const themeToggle = document.getElementById('theme-toggle');

/* ==========================================================
   4. SAVING AND LOADING (wrapped in try/catch so errors never crash the app)
   ========================================================== */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];

    // Keep only valid items and fill in any missing fields
    return data
      .filter(t => t && typeof t.id === 'string' && typeof t.text === 'string')
      .map(t => ({
        id: t.id,
        text: t.text,
        done: Boolean(t.done),
        due: typeof t.due === 'string' ? t.due : '',
        priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium'
      }));
  } catch (err) {
    console.warn('Could not load tasks:', err);
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    storageWarning.hidden = true;
  } catch (err) {
    console.warn('Could not save tasks:', err);
    storageWarning.hidden = false; // tell the user
  }
}

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch (err) {
    return 'dark';
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    console.warn('Could not save theme:', err);
  }
}

/* ==========================================================
   5. HELPER FUNCTIONS
   ========================================================== */
// Makes a unique id like "lq3x9a1b2c"
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Creates an element. Using textContent keeps user text safe (no HTML injection).
function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function createIconButton(className, label, iconSvg, onClick) {
  const btn = createEl('button', 'icon-btn ' + className);
  btn.type = 'button';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = iconSvg;
  btn.addEventListener('click', onClick);
  return btn;
}

// Turns "2026-11-25" into a Date at local midnight (avoids time zone surprises)
function parseDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDue(str) {
  const date = parseDate(str);
  if (!date) return '';
  const options = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString(undefined, options);
}

function isOverdue(task) {
  const date = parseDate(task.due);
  if (!date || task.done) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/* ==========================================================
   6. TASK ACTIONS (change the data, save, redraw)
   ========================================================== */
function addTask(text, due, priority) {
  const task = { id: makeId(), text: text, done: false, due: due, priority: priority };
  tasks.unshift(task);   // newest first
  justAddedId = task.id;
  saveTasks();
  render();
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  saveTasks();
  render();
}

// Plays the slide-out animation, then removes the task
function deleteTask(id) {
  const li = taskList.querySelector('[data-id="' + id + '"]');
  if (li) li.classList.add('removing');
  setTimeout(() => {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    render();
  }, li ? REMOVE_ANIMATION_MS : 0);
}

function startEdit(id) {
  editingId = id;
  render();
}

function cancelEdit() {
  editingId = null;
  render();
}

function saveEdit(id, newText, inputEl) {
  const text = newText.trim();
  if (!text) {                       // no empty tasks, even when editing
    inputEl.classList.add('invalid');
    inputEl.focus();
    return;
  }
  const task = tasks.find(t => t.id === id);
  if (task) task.text = text;
  editingId = null;
  saveTasks();
  render();
}

function clearCompleted() {
  const doneItems = taskList.querySelectorAll('.task-item.done');
  doneItems.forEach(li => li.classList.add('removing'));
  setTimeout(() => {
    tasks = tasks.filter(t => !t.done);
    saveTasks();
    render();
  }, doneItems.length ? REMOVE_ANIMATION_MS : 0);
}

/* ==========================================================
   7. DRAWING THE PAGE
   ========================================================== */
// Builds the HTML for one task
function buildTaskItem(task) {
  const li = createEl('li', 'task-item');
  li.dataset.id = task.id;
  if (task.done) li.classList.add('done');
  if (task.id === justAddedId) li.classList.add('enter');

  // Checkbox (inside a label so the tap area is 44px)
  const checkLabel = createEl('label', 'check');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.done;
  checkbox.setAttribute('aria-label', 'Mark "' + task.text + '" as done');
  checkbox.addEventListener('change', () => toggleTask(task.id));
  checkLabel.appendChild(checkbox);

  const body = createEl('div', 'task-body');
  const actions = createEl('div', 'task-actions');

  if (task.id === editingId) {
    // ----- Edit mode: text box + save/cancel -----
    const editInput = createEl('input', 'edit-input');
    editInput.type = 'text';
    editInput.value = task.text;
    editInput.maxLength = 100;
    editInput.setAttribute('aria-label', 'Edit task text');
    editInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveEdit(task.id, editInput.value, editInput);
      if (e.key === 'Escape') cancelEdit();
    });
    editInput.addEventListener('input', () => editInput.classList.remove('invalid'));
    body.appendChild(editInput);

    actions.appendChild(createIconButton('save', 'Save changes', ICONS.save,
      () => saveEdit(task.id, editInput.value, editInput)));
    actions.appendChild(createIconButton('cancel', 'Cancel editing', ICONS.cancel, cancelEdit));
  } else {
    // ----- Normal mode: text, priority label, due date -----
    body.appendChild(createEl('span', 'task-text', task.text));

    const meta = createEl('div', 'task-meta');
    meta.appendChild(createEl('span', 'badge ' + task.priority, task.priority));
    if (task.due) {
      const overdue = isOverdue(task);
      const dueText = (overdue ? 'Overdue · ' : 'Due ') + formatDue(task.due);
      meta.appendChild(createEl('span', 'due' + (overdue ? ' overdue' : ''), dueText));
    }
    body.appendChild(meta);

    actions.appendChild(createIconButton('edit', 'Edit task', ICONS.edit, () => startEdit(task.id)));
    actions.appendChild(createIconButton('delete', 'Delete task', ICONS.delete, () => deleteTask(task.id)));
  }

  li.appendChild(checkLabel);
  li.appendChild(body);
  li.appendChild(actions);
  return li;
}

// Redraws everything. Called after every change.
function render() {
  // 1. Pick which tasks to show
  const visible = tasks.filter(t => {
    if (currentFilter === 'active') return !t.done;
    if (currentFilter === 'completed') return t.done;
    return true;
  });

  // 2. Rebuild the list
  taskList.innerHTML = '';
  visible.forEach(task => taskList.appendChild(buildTaskItem(task)));
  justAddedId = null; // animation only plays once

  // 3. Empty state message
  emptyState.hidden = visible.length > 0;
  if (tasks.length === 0) emptyMessage.textContent = 'You have no tasks';
  else if (currentFilter === 'active') emptyMessage.textContent = 'No active tasks';
  else emptyMessage.textContent = 'No completed tasks yet';

  // 4. Counter ("3 tasks left")
  const left = tasks.filter(t => !t.done).length;
  counter.textContent = left + (left === 1 ? ' task left' : ' tasks left');

  // 5. Clear button only works if something is completed
  clearBtn.disabled = !tasks.some(t => t.done);

  // 6. Highlight the active filter
  filterButtons.forEach(btn => {
    const isActive = btn.dataset.filter === currentFilter;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  // 7. If editing, put the cursor in the edit box
  const editBox = taskList.querySelector('.edit-input');
  if (editBox) {
    editBox.focus();
    editBox.setSelectionRange(editBox.value.length, editBox.value.length);
  }
}

/* ==========================================================
   8. DARK MODE
   ========================================================== */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
}

/* ==========================================================
   9. EVENT LISTENERS (what happens when the user does something)
   ========================================================== */
// Add task: runs on button click AND on Enter (both submit the form)
form.addEventListener('submit', event => {
  event.preventDefault(); // stop the page from reloading

  const text = taskInput.value.trim();
  if (!text) {                                   // block empty tasks
    formError.hidden = false;
    taskInput.parentElement.classList.add('invalid');
    taskInput.focus();
    return;
  }

  addTask(text, dueInput.value, priorityInput.value);

  // Reset the form
  taskInput.value = '';
  dueInput.value = '';
  priorityInput.value = 'medium';
  taskInput.focus();
});

// Hide the error as soon as the user types
taskInput.addEventListener('input', () => {
  formError.hidden = true;
  taskInput.parentElement.classList.remove('invalid');
});

// Filter buttons
filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    editingId = null;
    render();
  });
});

clearBtn.addEventListener('click', clearCompleted);

themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
  saveTheme(next);
});

/* ==========================================================
   10. START THE APP
   ========================================================== */
tasks = loadTasks();
applyTheme(loadTheme());
render();