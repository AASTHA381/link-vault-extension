/* options.js */

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await refreshStats();
  wireListeners();
});

/* ─── LOAD SETTINGS ───────────────────────────────────────────── */
async function loadSettings() {
  const { apiKey, aiProvider, aiModel } = await chrome.storage.local.get(['apiKey', 'aiProvider', 'aiModel']);
  if (apiKey)    document.getElementById('apiKey').value    = apiKey;
  if (aiProvider) document.getElementById('aiProvider').value = aiProvider;
  if (aiModel)   document.getElementById('aiModel').value   = aiModel;
  setProviderUI(aiProvider || 'openai');
}

/* ─── STATS ───────────────────────────────────────────────────── */
async function refreshStats() {
  const { items } = await chrome.storage.local.get('items');
  const all = items || [];

  const byType = all.reduce((acc, i) => { acc[i.type] = (acc[i.type] || 0) + 1; return acc; }, {});
  const byCat  = all.reduce((acc, i) => { acc[i.category] = (acc[i.category] || 0) + 1; return acc; }, {});
  const withAI = all.filter(i => i.summary).length;

  const typeStr = Object.entries(byType).map(([t, c]) => `${t.toUpperCase()}: ${c}`).join('  ·  ');
  const catStr  = Object.entries(byCat).map(([c, n]) => `${c}: ${n}`).join('  ·  ');

  document.getElementById('statsBox').innerHTML =
    `<strong>${all.length}</strong> total resources<br>` +
    (typeStr ? `Types — ${typeStr}<br>` : '') +
    (catStr  ? `Categories — ${catStr}<br>` : '') +
    `${withAI} have an AI summary`;
}

/* ─── WIRE LISTENERS ──────────────────────────────────────────── */
function wireListeners() {
  document.getElementById('aiProvider').addEventListener('change', e => {
    setProviderUI(e.target.value);
  });

  document.getElementById('eyeBtn').addEventListener('click', () => {
    const inp = document.getElementById('apiKey');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('testBtn').addEventListener('click', testConnection);
  document.getElementById('saveBtn').addEventListener('click', saveSettings);

  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importData);
  document.getElementById('clearBtn').addEventListener('click', clearAll);
}

/* ─── PROVIDER UI ─────────────────────────────────────────────── */
function setProviderUI(provider) {
  document.getElementById('modelField').classList.toggle('hidden', provider !== 'openai');
}

/* ─── TEST CONNECTION ─────────────────────────────────────────── */
async function testConnection() {
  const apiKey   = document.getElementById('apiKey').value.trim();
  const provider = document.getElementById('aiProvider').value;
  const res = document.getElementById('testResult');

  if (!apiKey) {
    showTestResult('❌ Please enter an API key first', false);
    return;
  }

  showTestResult('⏳ Testing…', null);

  try {
    const r = await chrome.runtime.sendMessage({
      action:       'generateSummary',
      content:      'Hello! This is a test message. Please respond with "Connection successful".',
      title:        'Test',
      type:         'link',
      testApiKey:   apiKey,
      testProvider: provider,
    });

    if (r.success) showTestResult('✅ Connection successful! AI is ready.', true);
    else           showTestResult('❌ ' + (r.error || 'Unknown error'), false);
  } catch (e) {
    showTestResult('❌ ' + e.message, false);
  }
}

function showTestResult(msg, ok) {
  const el = document.getElementById('testResult');
  el.textContent = msg;
  el.className = 'test-result' + (ok === true ? ' ok' : ok === false ? ' fail' : '');
  el.classList.remove('hidden');
}

/* ─── SAVE SETTINGS ───────────────────────────────────────────── */
async function saveSettings() {
  const apiKey   = document.getElementById('apiKey').value.trim();
  const aiProvider = document.getElementById('aiProvider').value;
  const aiModel  = document.getElementById('aiModel').value;

  await chrome.storage.local.set({ apiKey, aiProvider, aiModel });

  const msg = document.getElementById('saveMsg');
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 3000);
}

/* ─── EXPORT DATA ─────────────────────────────────────────────── */
async function exportData() {
  const { items } = await chrome.storage.local.get('items');
  const json = JSON.stringify(items || [], null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `linkvault-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── IMPORT DATA ─────────────────────────────────────────────── */
async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text     = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error('File is not a valid LinkVault export.');

    const { items } = await chrome.storage.local.get('items');
    const existing  = items || [];
    const existIds  = new Set(existing.map(i => i.id));
    const newOnes   = imported.filter(i => i.id && !existIds.has(i.id));

    await chrome.storage.local.set({ items: [...existing, ...newOnes] });
    await refreshStats();
    alert(`✅ Imported ${newOnes.length} new resource(s). Duplicates skipped.`);
  } catch (err) {
    alert('❌ Import failed: ' + err.message);
  }

  e.target.value = '';
}

/* ─── CLEAR ALL ───────────────────────────────────────────────── */
async function clearAll() {
  const confirmed = confirm(
    'This will permanently delete ALL saved resources.\n\nAre you sure? This cannot be undone.'
  );
  if (!confirmed) return;
  await chrome.storage.local.set({ items: [] });
  await refreshStats();
  alert('✅ All resources cleared.');
}
