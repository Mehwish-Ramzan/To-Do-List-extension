/* popup.js - Advanced Todo List (full updated)
   - add/edit/delete -> move-to-trash
   - restore / permanently delete from trash modal
   - task modal view (full text + actions)
   - reminder icons (image fallback to emoji)
   - search, filters, drag-drop, alarms, theme
   - fixed: clicking a task reliably shows modal (delegated listener)
*/

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

const taskListEl = $('#taskList');
const inputEl = $('#taskInput');
const colorEl = $('#taskColor');
const priorityEl = $('#taskPriority');
const reminderEl = $('#taskReminder');
const addBtn = $('#addTask');
const themeToggle = $('#themeToggle');
const filters = $$('.filter');
const searchInput = $('#searchTask');
const openTrashBtn = $('#openTrashBtn');

let tasks = []; // {id,text,color,priority,completed,reminderISO,createdAt}
let trash = []; // trashed tasks { id, ... , deletedAt }

// --- init load ---
chrome.storage.local.get(['tasks','theme','trash'], data=>{
  tasks = data.tasks || [];
  trash = data.trash || [];
  if (data.theme === 'dark') document.body.classList.add('dark');
  renderTasks();
});

// helpers
function saveTasks(){ chrome.storage.local.set({tasks}); }
function saveTrash(){ chrome.storage.local.set({trash}); }

function cap(s){ return s && s[0].toUpperCase()+s.slice(1); }

function formatMeta(task){
  let meta = [];
  if (task.priority) meta.push(cap(task.priority));
  if (task.reminderISO) {
    try {
      const d = new Date(task.reminderISO);
      if (!isNaN(d)) meta.push(d.toLocaleString());
    } catch(e){}
  }
  return meta.join(' • ');
}

// alarms
function scheduleReminderFor(task){
  const alarmName = `reminder-${task.id}`;
  chrome.alarms.clear(alarmName, () => {
    if (task.reminderISO){
      const when = Date.parse(task.reminderISO);
      if (!isNaN(when) && when > Date.now()){
        chrome.alarms.create(alarmName, {when});
      }
    }
  });
}
function clearReminderForId(id){
  chrome.alarms.clear(`reminder-${id}`);
}

// small toast
let toastTimer;
function showToast(msg){
  let t = document.getElementById('ext-toast');
  if (!t){
    t = document.createElement('div'); t.id = 'ext-toast';
    t.style.position = 'fixed'; t.style.bottom='18px'; t.style.left='50%';
    t.style.transform='translateX(-50%)'; t.style.background='rgba(0,0,0,0.8)';
    t.style.color='white'; t.style.padding='8px 12px'; t.style.borderRadius='8px';
    t.style.zIndex = 9999; t.style.fontSize='13px';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.style.opacity = '0', 1600);
}

// Image fallback helper: if icon not found, replace with emoji text
function setImgWithFallback(imgEl, src, fallbackEmoji){
  imgEl.src = src;
  imgEl.onerror = () => {
    const s = document.createElement('span');
    s.textContent = fallbackEmoji;
    s.style.fontSize = '18px';
    imgEl.replaceWith(s);
  };
}

// Modal (task details)
function openTaskModal(task){
  if (document.getElementById('task-modal-overlay')) return;
  const overlay = document.createElement('div'); overlay.id = 'task-modal-overlay';
  const modal = document.createElement('div'); modal.id = 'task-modal';

  const title = document.createElement('div'); title.className = 'modal-title'; title.textContent = 'Task details';
  const text = document.createElement('div'); text.className = 'modal-text'; text.textContent = task.text || '';
  const meta = document.createElement('div'); meta.className = 'modal-meta'; meta.textContent = formatMeta(task);

  const actions = document.createElement('div'); actions.className = 'modal-actions';

  // Reminder icon
  const remBtn = document.createElement('button'); remBtn.className = 'action-btn';
  const remImg = document.createElement('img'); remImg.alt = 'reminder';
  setImgWithFallback(remImg, task.reminderISO ? 'icons/reminder.png' : 'icons/reminder-off.png', task.reminderISO ? '🔔' : '🔕');
  remBtn.appendChild(remImg);
  remBtn.title = task.reminderISO ? 'Clear reminder' : 'Set reminder';
  remBtn.addEventListener('click', ()=>{
    if (task.reminderISO){
      if (!confirm('Clear reminder for this task?')) return;
      task.reminderISO = null;
      clearReminderForId(task.id);
      saveTasks(); scheduleReminderFor(task); renderTasks();
      remImg.src = 'icons/reminder-off.png';
      remBtn.title = 'Set reminder';
      showToast('Reminder cleared');
    } else {
      const newReminder = prompt('Set reminder (format: YYYY-MM-DDTHH:MM)', '');
      if (!newReminder) return;
      const iso = new Date(newReminder).toISOString();
      if (isNaN(Date.parse(iso))){ showToast('Invalid date'); return; }
      task.reminderISO = iso;
      saveTasks(); scheduleReminderFor(task); renderTasks();
      remImg.src = 'icons/reminder.png';
      remBtn.title = 'Clear reminder';
      showToast('Reminder set');
    }
  });

  // Edit
  const editBtn = document.createElement('button'); editBtn.className = 'action-btn';
  const editImg = document.createElement('img'); editImg.alt='edit';
  setImgWithFallback(editImg,'icons/edit.png','✏️');
  editBtn.appendChild(editImg);
  editBtn.title = 'Edit task';
  editBtn.addEventListener('click', ()=>{
    const newText = prompt('Edit task text', task.text);
    if (newText === null) return;
    task.text = newText.trim() || task.text;

    const newColor = prompt('Hex color for task (e.g. #5A9 or #ff5722)', task.color || '#5A9');
    if (newColor) task.color = newColor;

    const newPriority = prompt('Priority (low / medium / high)', task.priority || 'medium');
    if (newPriority && ['low','medium','high'].includes(newPriority.toLowerCase())) task.priority = newPriority.toLowerCase();

    const newReminder = prompt('Reminder datetime (leave blank to clear). Format: YYYY-MM-DDTHH:MM', task.reminderISO ? task.reminderISO.slice(0,16) : '');
    task.reminderISO = newReminder ? new Date(newReminder).toISOString() : null;

    saveTasks(); scheduleReminderFor(task); renderTasks();
    text.textContent = task.text;
    meta.textContent = formatMeta(task);
    showToast('Task updated');
  });

  // Copy
  const copyBtn = document.createElement('button'); copyBtn.className='action-btn';
  const copyImg = document.createElement('img'); setImgWithFallback(copyImg,'icons/copy.png','📋'); copyImg.alt='copy';
  copyBtn.appendChild(copyImg);
  copyBtn.title='Copy text';
  copyBtn.addEventListener('click', async ()=> {
    try { await navigator.clipboard.writeText(task.text); showToast('Copied'); } catch(e){ showToast('Copy failed'); }
  });

  // Move to Recycle Bin
  const delBtn = document.createElement('button'); delBtn.className='action-btn';
  const delImg = document.createElement('img'); setImgWithFallback(delImg,'icons/delete.png','🗑️'); delImg.alt='delete';
  delBtn.appendChild(delImg);
  delBtn.title = 'Delete (move to Recycle Bin)';
  delBtn.addEventListener('click', ()=>{
    if (!confirm('Move this task to Recycle Bin?')) return;
    moveToTrash(task.id);
    closeTaskModal();
    showToast('Moved to Recycle Bin');
  });

  const closeBtn = document.createElement('button'); closeBtn.className='action-btn'; closeBtn.textContent='Close';
  closeBtn.addEventListener('click', closeTaskModal);

  actions.appendChild(remBtn);
  actions.appendChild(editBtn);
  actions.appendChild(copyBtn);
  actions.appendChild(delBtn);
  actions.appendChild(closeBtn);

  modal.appendChild(title);
  modal.appendChild(text);
  modal.appendChild(meta);
  modal.appendChild(actions);
  overlay.appendChild(modal);

  overlay.addEventListener('click', (e)=> { if (e.target === overlay) closeTaskModal(); });

  document.body.appendChild(overlay);

  // focus first button for keyboard users
  setTimeout(()=> {
    const btn = modal.querySelector('.action-btn');
    if (btn) btn.focus();
  },50);
}
function closeTaskModal(){ const o = document.getElementById('task-modal-overlay'); if (o) o.remove(); }

// Trash functions
function moveToTrash(taskId){
  const idx = tasks.findIndex(t=>t.id === taskId);
  if (idx === -1) return;
  const [removed] = tasks.splice(idx,1);
  removed.deletedAt = new Date().toISOString();
  trash.unshift(removed);
  // clear alarms for trashed item
  clearReminderForId(removed.id);
  saveTasks(); saveTrash(); renderTasks();
}

function openTrashModal(){
  if (document.getElementById('trash-modal-overlay')) return;
  const overlay = document.createElement('div'); overlay.id='trash-modal-overlay';
  const modal = document.createElement('div'); modal.id='trash-modal';
  const title = document.createElement('h3'); title.textContent = 'Recycle Bin';
  modal.appendChild(title);

  const list = document.createElement('div'); list.id='trash-list';
  if (!trash.length){
    const empty = document.createElement('div'); empty.className='empty-state'; empty.textContent = 'Recycle bin is empty.';
    list.appendChild(empty);
  } else {
    trash.forEach(item => {
      const it = document.createElement('div'); it.className='trash-item';
      const left = document.createElement('div'); left.className='left';
      const ttitle = document.createElement('div'); ttitle.className='title'; ttitle.textContent = item.text;
      const meta = document.createElement('div'); meta.className='meta'; meta.textContent = 'Deleted: ' + new Date(item.deletedAt).toLocaleString();
      left.appendChild(ttitle); left.appendChild(meta);

      const actions = document.createElement('div'); actions.className='trash-actions';
      const res = document.createElement('button'); res.className='restore-btn'; res.title='Restore'; res.textContent='Restore';
      res.addEventListener('click', (ev)=>{ ev.stopPropagation(); restoreFromTrash(item.id); });

      const perm = document.createElement('button'); perm.className='delete-btn'; perm.title='Delete permanently'; perm.textContent='Delete permanently';
      perm.addEventListener('click', (ev)=>{ ev.stopPropagation(); if (!confirm('Permanently delete this task?')) return; permanentlyDeleteFromTrash(item.id); });

      actions.appendChild(res); actions.appendChild(perm);
      it.appendChild(left); it.appendChild(actions);
      list.appendChild(it);
    });
  }

  modal.appendChild(list);

  const controls = document.createElement('div'); controls.className='trash-controls';
  const emptyBtn = document.createElement('button'); emptyBtn.className='trash-clear'; emptyBtn.textContent='Empty Trash';
  emptyBtn.addEventListener('click', ()=>{
    if (!trash.length) return showToast('Trash already empty');
    if (!confirm('Permanently delete all items in Recycle Bin?')) return;
    trash.forEach(t => clearReminderForId(t.id));
    trash = [];
    saveTrash();
    closeTrashModal();
    renderTasks();
    showToast('Trash emptied');
  });
  const closeBtn = document.createElement('button'); closeBtn.className='trash-close'; closeBtn.textContent='Close';
  closeBtn.addEventListener('click', closeTrashModal);
  controls.appendChild(emptyBtn); controls.appendChild(closeBtn);
  modal.appendChild(controls);

  overlay.appendChild(modal);
  overlay.addEventListener('click', (e)=> { if (e.target === overlay) closeTrashModal(); });
  document.body.appendChild(overlay);
}
function closeTrashModal(){ const e = document.getElementById('trash-modal-overlay'); if (e) e.remove(); }

function restoreFromTrash(id){
  const idx = trash.findIndex(t => t.id === id);
  if (idx === -1) return;
  const [restored] = trash.splice(idx,1);
  delete restored.deletedAt;
  tasks.unshift(restored);
  saveTrash(); saveTasks();
  if (restored.reminderISO) scheduleReminderFor(restored);
  // refresh modal UI
  closeTrashModal(); openTrashModal();
  renderTasks();
  showToast('Restored');
}

function permanentlyDeleteFromTrash(id){
  const idx = trash.findIndex(t => t.id === id);
  if (idx === -1) return;
  clearReminderForId(id);
  trash.splice(idx,1);
  saveTrash();
  closeTrashModal(); openTrashModal();
  showToast('Permanently deleted');
}

// Render tasks with current filter + search
function getActiveFilter(){ return document.querySelector('.filter.active')?.dataset?.filter || 'all'; }

function renderTasks(){
  const filter = getActiveFilter();
  const q = (searchInput.value || '').toLowerCase();
  taskListEl.innerHTML = '';

  const filteredTasks = tasks
    .filter(t => (filter === 'all' || (filter === 'completed' ? t.completed : !t.completed)))
    .filter(t => t.text.toLowerCase().includes(q));

  if (filteredTasks.length === 0){
    const emptyState = document.createElement('div'); emptyState.className='empty-state';
    if (!tasks.length) emptyState.textContent = 'No saved tasks. Add a new task to get started!';
    else if (q) emptyState.textContent = 'No tasks match your search. Try a different query.';
    else if (filter === 'completed') emptyState.textContent = 'No completed tasks. Complete some tasks to see them here.';
    else if (filter === 'pending') emptyState.textContent = 'No pending tasks.';
    else emptyState.textContent = 'No saved tasks.';
    taskListEl.appendChild(emptyState);
    // ensure alarms scheduled or cleared
    tasks.forEach(t => scheduleReminderFor(t));
    return;
  }

  filteredTasks.forEach(task => {
    const li = document.createElement('li'); li.className='task'; li.dataset.id = task.id;
    if (task.completed) li.classList.add('completed');

    const bgColor = task.color || '#5A9';
    li.style.background = `linear-gradient(135deg, ${bgColor}22, transparent)`;

    const left = document.createElement('div'); left.className='task-left';
    const checkbox = document.createElement('button'); checkbox.className='checkbox';
    if (task.completed) checkbox.classList.add('checked');
    checkbox.setAttribute('aria-label','toggle complete');
    checkbox.addEventListener('click', (ev) => {
      ev.stopPropagation();
      task.completed = !task.completed; saveTasks(); renderTasks();
    });

    const pill = document.createElement('span'); pill.className='color-pill';
    pill.style.background = bgColor; pill.style.borderColor = bgColor;
    pill.title = 'Task color';

    const textWrap = document.createElement('div'); textWrap.className='task-text';
    const title = document.createElement('span'); title.className='title'; title.textContent = task.text;
    const meta = document.createElement('span'); meta.className='meta'; meta.textContent = formatMeta(task);
    textWrap.appendChild(title); textWrap.appendChild(meta);
    left.appendChild(checkbox); left.appendChild(pill); left.appendChild(textWrap);

    const actions = document.createElement('div'); actions.className='actions';

    const prBadge = document.createElement('button'); prBadge.className='priority-badge';
    prBadge.title = 'Click to change priority';
    const setPriorityBadge = () => {
      prBadge.classList.remove('priority-low','priority-medium','priority-high');
      if (task.priority === 'low'){ prBadge.classList.add('priority-low'); prBadge.textContent='● Low'; }
      else if (task.priority === 'high'){ prBadge.classList.add('priority-high'); prBadge.textContent='⚠️ High'; }
      else { prBadge.classList.add('priority-medium'); prBadge.textContent='★ Medium'; }
    };
    setPriorityBadge();
    prBadge.addEventListener('click', (ev)=> { ev.stopPropagation(); task.priority = task.priority === 'low' ? 'medium' : (task.priority === 'medium' ? 'high' : 'low'); saveTasks(); renderTasks(); });

    // Edit
    const editBtn = document.createElement('button'); editBtn.className='action-btn'; editBtn.title='Edit';
    const editImg = document.createElement('img'); setImgWithFallback(editImg,'icons/edit.png','✏️'); editBtn.appendChild(editImg);
    editBtn.addEventListener('click', (ev)=> { ev.stopPropagation();
      const newText = prompt('Edit task text', task.text);
      if (newText === null) return;
      task.text = newText.trim() || task.text;
      const newColor = prompt('Hex color for task (e.g. #5A9 or #ff5722)', task.color || '#5A9');
      if (newColor) task.color = newColor;
      const newPriority = prompt('Priority (low / medium / high)', task.priority || 'medium');
      if (newPriority && ['low','medium','high'].includes(newPriority.toLowerCase())) task.priority = newPriority.toLowerCase();
      const newReminder = prompt('Reminder datetime (leave blank to clear). Format: YYYY-MM-DDTHH:MM', task.reminderISO ? task.reminderISO.slice(0,16) : '');
      task.reminderISO = newReminder ? new Date(newReminder).toISOString() : null;
      saveTasks(); scheduleReminderFor(task); renderTasks();
    });

    // Copy
    const copyBtn = document.createElement('button'); copyBtn.className='action-btn'; copyBtn.title='Copy';
    const copyImg = document.createElement('img'); setImgWithFallback(copyImg,'icons/copy.png','📋'); copyBtn.appendChild(copyImg);
    copyBtn.addEventListener('click', async (ev)=> { ev.stopPropagation(); try { await navigator.clipboard.writeText(task.text); showToast('Copied'); } catch(e){ showToast('Copy failed'); } });

    // Delete -> move to trash
    const delBtn = document.createElement('button'); delBtn.className='action-btn'; delBtn.title='Move to Recycle Bin';
    const delImg = document.createElement('img'); setImgWithFallback(delImg,'icons/delete.png','🗑️'); delBtn.appendChild(delImg);
    delBtn.addEventListener('click', (ev)=> { ev.stopPropagation(); if (!confirm('Move this task to Recycle Bin?')) return; moveToTrash(task.id); showToast('Moved to Recycle Bin'); });

    // Reminder icon (quick)
    const remBtn = document.createElement('button'); remBtn.className='action-btn reminder'; remBtn.title = task.reminderISO ? 'Clear reminder' : 'Set reminder';
    const remImg = document.createElement('img'); remImg.alt='reminder';
    setImgWithFallback(remImg, task.reminderISO ? 'icons/reminder.png' : 'icons/reminder-off.png', task.reminderISO ? '🔔' : '🔕');
    remBtn.appendChild(remImg);
    remBtn.addEventListener('click', (ev)=> { ev.stopPropagation(); if (task.reminderISO){ if (!confirm('Clear reminder?')) return; task.reminderISO = null; clearReminderForId(task.id); saveTasks(); renderTasks(); showToast('Reminder cleared'); } else { const newReminder = prompt('Set reminder (format: YYYY-MM-DDTHH:MM)', ''); if (!newReminder) return; const iso = new Date(newReminder).toISOString(); if (isNaN(Date.parse(iso))){ showToast('Invalid date'); return; } task.reminderISO = iso; saveTasks(); scheduleReminderFor(task); renderTasks(); showToast('Reminder set'); } });

    actions.appendChild(prBadge);
    actions.appendChild(remBtn);
    actions.appendChild(editBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(delBtn);

    li.appendChild(left);
    li.appendChild(actions);

    // Drag & drop
    li.draggable = true;
    li.addEventListener('dragstart', (e)=>{ e.dataTransfer.setData('text/plain', String(task.id)); li.classList.add('dragging'); });
    li.addEventListener('dragend', ()=> li.classList.remove('dragging'));
    li.addEventListener('dragover', (e)=> e.preventDefault());
    li.addEventListener('drop', (e)=> { e.preventDefault(); const draggedId = Number(e.dataTransfer.getData('text/plain')); if (!draggedId) return; const dragIdx = tasks.findIndex(t=>t.id===draggedId); const dropIdx = tasks.findIndex(t=>t.id===task.id); if (dragIdx < 0 || dropIdx < 0) return; const [moved] = tasks.splice(dragIdx,1); tasks.splice(dropIdx,0,moved); saveTasks(); renderTasks(); });

    taskListEl.appendChild(li);
    requestAnimationFrame(()=> li.classList.add('show'));
  });

  // schedule reminders
  tasks.forEach(t => scheduleReminderFor(t));
}

/* DELEGATED click for opening modal reliably:
   This avoids per-li listener conflicts and ensures clicking the task (not controls)
   opens the modal. */
taskListEl.addEventListener('click', (e) => {
  const li = e.target.closest('.task');
  if (!li) return;
  // ignore clicks on controls
  if (e.target.closest('.action-btn') || e.target.closest('.priority-badge') || e.target.closest('.checkbox')) return;
  const id = Number(li.dataset.id);
  const task = tasks.find(t => t.id === id);
  if (task) openTaskModal(task);
});

// add task
addBtn.addEventListener('click', ()=>{
  const text = inputEl.value.trim();
  if (!text) return showToast('Please enter a task.');
  const task = {
    id: Date.now(),
    text,
    color: colorEl.value || '#5A9',
    priority: priorityEl.value || 'medium',
    completed: false,
    reminderISO: reminderEl.value ? new Date(reminderEl.value).toISOString() : null,
    createdAt: new Date().toISOString()
  };
  tasks.unshift(task);
  saveTasks(); scheduleReminderFor(task);
  renderTasks();
  inputEl.value=''; reminderEl.value='';
});

// search & filters
filters.forEach(btn=>{ btn.addEventListener('click', ()=>{ filters.forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderTasks(); }); });
searchInput.addEventListener('input', ()=> renderTasks());

// theme
if (themeToggle) {
  themeToggle.addEventListener('click', ()=>{
    document.body.classList.toggle('dark');
    const theme = document.body.classList.contains('dark') ? 'dark' : 'light';
    chrome.storage.local.set({theme});
  });
}

// trash button
if (openTrashBtn){
  openTrashBtn.addEventListener('click', (e)=>{ e.preventDefault(); openTrashModal(); });
}

// ensure alarms scheduled on load
tasks.forEach(t => scheduleReminderFor(t));
