/* background.js - service worker for alarms/notifications */

self.addEventListener('install', ()=> self.skipWaiting());
self.addEventListener('activate', ()=> self.clients.claim());

// Listen for alarms created from popup
chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm || !alarm.name) return;
  if (!alarm.name.startsWith('reminder-')) return;
  const idStr = alarm.name.split('reminder-')[1];
  if (!idStr) return;
  try {
    const store = await chrome.storage.local.get('tasks');
    const tasks = store.tasks || [];
    const task = tasks.find(t => String(t.id) === String(idStr));
    if (!task) return;
    // show notification
    const title = 'Task reminder';
    const options = {
      type: 'basic',
      title,
      message: (task.text.length > 120) ? task.text.slice(0,117)+'...' : task.text,
      iconUrl: 'icons/logo.png',
      priority: 2
    };
    // create notification (notifications permission must be in manifest)
    chrome.notifications.create(String('rem-'+task.id+'-'+Date.now()), options, ()=>{});
  } catch(e){
    console.error('Alarm handling error', e);
  }
});

// Clear old alarms when task deleted (listen to storage changes)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.tasks){
    const newTasks = changes.tasks.newValue || [];
    // collect existing alarm ids vs task ids
    // we'll clear alarms that do not match any task reminder
    chrome.alarms.getAll(existingAlarms => {
      existingAlarms.forEach(a => {
        if (!a.name.startsWith('reminder-')) return;
        const id = a.name.split('reminder-')[1];
        const exists = newTasks.some(t => String(t.id) === String(id) && t.reminderISO);
        if (!exists){
          chrome.alarms.clear(a.name);
        }
      });
    });
  }
});
