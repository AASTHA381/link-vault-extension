/* ─── STATE ───────────────────────────────────────────────────── */
let items        = [];
let activeTab    = null;   // current browser tab
let currentCat   = 'all';
let searchQuery  = '';
let addType      = 'link'; // 'link' | 'file'
let pickedFile   = null;
let pickedFileText = '';
let viewingId    = null;
let deleteConfirm = false;

const CAT_LABELS = {
  studies:   '📚 Studies',
  personal:  '👤 Personal',
  shopping:  '🛍️ Shopping',
  college:   '🎓 College',
  pm:        '📋 PM Tasks',
  important: '📄 Imp. Docs',
};

const TYPE_ICONS = { link:'🔗', pdf:'📄', doc:'📝', txt:'📃', md:'📋' };

/* ─── BOOT ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadItems();
  await initCurrentTab();
  render();
  wireListeners();
});

/* ─── STORAGE ─────────────────────────────────────────────────── */
async function loadItems() {
  try {
    const r = await chrome.storage.local.get('items');
    items = Array.isArray(r.items) ? r.items : [];
  } catch (e) {
    console.error('Failed to load items:', e);
    items = [];
  }
}

async function saveItems() {
  try {
    await chrome.storage.local.set({ items });
  } catch (e) {
    console.error('Failed to save items:', e);
    toast('Save failed: ' + e.message, 'error');
  }
}

/* ─── CURRENT TAB ─────────────────────────────────────────────── */
async function initCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
      activeTab = tab;
      const bar = document.getElementById('quickBar');
      document.getElementById('quickBarTitle').textContent = tab.title || tab.url;
      bar.classList.remove('hidden');
    }
  } catch (_) {}
}

/* ─── RENDER ──────────────────────────────────────────────────── */
function render() {
  // Reset any pending delete confirmation on every re-render
  _pendingDeleteId = null;
  clearTimeout(_pendingDeleteTimer);
  updateCounts();
  renderItems(filteredItems());
}

function filteredItems() {
  let list = [...items];
  if (currentCat !== 'all') list = list.filter(i => i.category === currentCat);
  if (searchQuery) {
    const q = searchQuery;
    list = list.filter(i =>
      i.title.toLowerCase().includes(q) ||
      (i.url && i.url.toLowerCase().includes(q)) ||
      (i.summary && i.summary.toLowerCase().includes(q)) ||
      (i.notes && i.notes.toLowerCase().includes(q))
    );
  }
  return list.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
}

function updateCounts() {
  const cats = ['studies','personal','shopping','college','pm','important'];
  document.getElementById('cnt-all').textContent = items.length;
  cats.forEach(c => {
    const el = document.getElementById(`cnt-${c}`);
    if (el) el.textContent = items.filter(i => i.category === c).length;
  });
}

function renderItems(list) {
  // emptyState and itemsScroll are now SIBLINGS inside items-area.
  // itemsScroll.innerHTML = '' never touches emptyState, so
  // document.getElementById('emptyState') always returns a live element.
  const scroll = document.getElementById('itemsScroll');
  const empty  = document.getElementById('emptyState');

  // Always clear previous cards first
  scroll.innerHTML = '';

  if (list.length === 0) {
    // Hide the card list, show the empty/message panel
    scroll.classList.add('hidden');
    empty.classList.remove('hidden');

    if (items.length === 0) {
      empty.innerHTML = `
        <div class="empty-emoji">🗂️</div>
        <p class="empty-heading">Nothing saved yet</p>
        <p class="empty-sub">Hit <strong>+</strong> to save your first link or file</p>
      `;
    } else if (searchQuery) {
      empty.innerHTML = `
        <div class="empty-emoji">🔍</div>
        <p class="empty-heading">No results for "${esc(searchQuery)}"</p>
        <p class="empty-sub">Try a different search term</p>
      `;
    } else {
      const catName = CAT_LABELS[currentCat] || currentCat;
      empty.innerHTML = `
        <div class="empty-emoji">📂</div>
        <p class="empty-heading">No resources in ${catName} yet</p>
        <p class="empty-sub">Click <strong>+</strong> to add one here</p>
      `;
    }
    return;
  }

  // Show the card list, hide the empty panel
  empty.classList.add('hidden');
  scroll.classList.remove('hidden');

  list.forEach(item => {
    try {
      scroll.appendChild(buildCard(item));
    } catch (e) {
      console.error('Card render error — item id:', item?.id, e);
    }
  });
}

function buildCard(item) {
  const card = document.createElement('div');
  card.className = 'item-card' + (item.completed ? ' completed' : '');
  card.dataset.id = item.id;
  card.style.setProperty('--cat-color', getCatColor(item.category));

  const icon = TYPE_ICONS[item.type] || '📎';
  const catLabel = CAT_LABELS[item.category] || item.category;
  const snippetHtml = item.summary
    ? `<div class="item-snippet">${esc(item.summary.slice(0, 140))}…</div>`
    : (item.notes ? `<div class="item-snippet">${esc(item.notes.slice(0, 120))}</div>` : '');

  const typeLabel = (item.type || 'file').toUpperCase();
  const isDone    = Boolean(item.completed);

  card.innerHTML = `
    <div class="item-top">
      <span class="item-type-icon">${icon}</span>
      <div class="item-main">
        <div class="item-title">${esc(item.title)}</div>
        ${item.url ? `<div class="item-url">${esc(item.url)}</div>` : ''}
      </div>
      <div class="card-actions">
        <button class="card-act-btn complete-btn${isDone ? ' done' : ''}"
                title="${isDone ? 'Mark incomplete' : 'Mark complete'}">
          ${isDone ? '✅' : '⬜'}
        </button>
        <button class="card-act-btn delete-btn" title="Delete">🗑️</button>
      </div>
    </div>
    <div class="item-tags">
      <span class="tag tag-${item.category || 'important'}">${esc(catLabel || '')}</span>
      <span class="tag tag-type">${typeLabel}</span>
      ${item.summary ? '<span class="tag tag-ai">✨ AI</span>' : ''}
      ${isDone ? '<span class="tag tag-done">✓ Done</span>' : ''}
    </div>
    ${snippetHtml}
    <div class="item-date">${formatDate(item.dateAdded)}</div>
  `;

  // Click card body → open detail view (but not action buttons)
  card.addEventListener('click', e => {
    if (e.target.closest('.card-act-btn')) return;
    openViewModal(item.id);
  });

  // Mark complete / incomplete
  card.querySelector('.complete-btn').addEventListener('click', async e => {
    e.stopPropagation();
    await toggleComplete(item.id);
  });

  // Delete (two-step)
  card.querySelector('.delete-btn').addEventListener('click', async e => {
    e.stopPropagation();
    await quickDelete(item.id, card);
  });

  return card;
}

/* ─── CARD ACTIONS ────────────────────────────────────────────── */
function toggleComplete(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  item.completed = !item.completed;
  render();                              // instant UI update
  saveItems();                           // background save — no await
  toast(item.completed ? 'Marked complete ✓' : 'Marked incomplete', 'success');
}

let _pendingDeleteId  = null;
let _pendingDeleteTimer = null;

function quickDelete(id, cardEl) {
  if (_pendingDeleteId === id) {
    // Second click — confirmed delete
    clearTimeout(_pendingDeleteTimer);
    _pendingDeleteId = null;
    items = items.filter(i => i.id !== id);
    render();                            // instant UI update
    saveItems();                         // background save — no await
    toast('Deleted ✓', 'success');
  } else {
    // First click — show confirmation state directly on button
    if (_pendingDeleteId) clearTimeout(_pendingDeleteTimer);
    _pendingDeleteId = id;

    // Update the button appearance without re-rendering the whole list
    const btn = cardEl.querySelector('.delete-btn');
    if (btn) {
      btn.textContent = '⚠️';
      btn.classList.add('confirm');
      btn.title = 'Click again to confirm';
    }

    _pendingDeleteTimer = setTimeout(() => {
      _pendingDeleteId = null;
      if (btn && btn.isConnected) {
        btn.textContent = '🗑️';
        btn.classList.remove('confirm');
        btn.title = 'Delete';
      }
    }, 3000);
  }
}

function getCatColor(cat) {
  const map = {
    studies:'#3B82F6', personal:'#8B5CF6', shopping:'#10B981',
    college:'#F59E0B', pm:'#EF4444', important:'#06B6D4'
  };
  return map[cat] || '#6366F1';
}

/* ─── EVENT WIRING ────────────────────────────────────────────── */
function wireListeners() {
  // Search
  document.getElementById('searchToggleBtn').addEventListener('click', toggleSearch);
  document.getElementById('searchClearBtn').addEventListener('click', clearSearch);
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    render();
  });

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', showSettings);
  document.getElementById('settingsBackBtn').addEventListener('click', hideSettings);
  document.getElementById('s-eyeBtn').addEventListener('click', () => {
    const inp = document.getElementById('s-apiKey');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('s-aiProvider').addEventListener('change', e => {
    updateModelFields(e.target.value);
  });
  document.getElementById('s-testBtn').addEventListener('click', testConnection);
  document.getElementById('s-saveBtn').addEventListener('click', saveSettingsPanel);
  document.getElementById('s-exportBtn').addEventListener('click', exportData);
  document.getElementById('s-importBtn').addEventListener('click', () => document.getElementById('s-importFile').click());
  document.getElementById('s-importFile').addEventListener('change', importData);
  document.getElementById('s-clearBtn').addEventListener('click', clearAllData);

  // Quick save current page
  document.getElementById('addCurrentPageBtn').addEventListener('click', () => {
    if (activeTab) openAddModal('link', activeTab.url, activeTab.title);
    else openAddModal('link');
  });
  document.getElementById('quickSaveBtn').addEventListener('click', () => {
    if (activeTab) openAddModal('link', activeTab.url, activeTab.title);
  });

  // Category tabs
  document.querySelectorAll('.cat-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.cat-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      currentCat = t.dataset.cat;
      render();
    });
  });

  // FAB
  document.getElementById('fabBtn').addEventListener('click', () => openAddModal('link'));

  // ADD MODAL ─ type tabs
  document.querySelectorAll('.type-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.type-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      addType = t.dataset.type;
      document.getElementById('linkPanel').classList.toggle('hidden', addType !== 'link');
      document.getElementById('filePanel').classList.toggle('hidden', addType !== 'file');
    });
  });

  // ADD MODAL ─ fetch URL
  document.getElementById('fetchUrlBtn').addEventListener('click', doFetchUrl);
  document.getElementById('urlInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') doFetchUrl();
  });

  // ADD MODAL ─ file upload
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  dropZone.addEventListener('click', e => {
    if (e.target.id !== 'removeFileBtn') fileInput.click();
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  document.getElementById('removeFileBtn').addEventListener('click', e => {
    e.stopPropagation();
    clearFilePick();
  });

  // ADD MODAL ─ save / cancel / close
  document.getElementById('saveResourceBtn').addEventListener('click', saveResource);
  document.getElementById('cancelAddBtn').addEventListener('click', closeAddModal);
  document.getElementById('closeAddModal').addEventListener('click', closeAddModal);
  document.getElementById('addModal').addEventListener('click', e => {
    if (e.target.id === 'addModal') closeAddModal();
  });

  // VIEW MODAL ─ actions
  document.getElementById('closeViewModal').addEventListener('click', closeViewModal);
  document.getElementById('viewModal').addEventListener('click', e => {
    if (e.target.id === 'viewModal') closeViewModal();
  });
  document.getElementById('regenBtn').addEventListener('click', regenerateSummary);
  document.getElementById('deleteBtn').addEventListener('click', handleDelete);
  document.getElementById('openLinkBtn').addEventListener('click', openCurrentLink);
}

/* ─── SEARCH ──────────────────────────────────────────────────── */
function toggleSearch() {
  const bar = document.getElementById('searchBar');
  const hidden = bar.classList.toggle('hidden');
  if (!hidden) document.getElementById('searchInput').focus();
  else { searchQuery = ''; document.getElementById('searchInput').value = ''; render(); }
}

function clearSearch() {
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  render();
  document.getElementById('searchInput').focus();
}

/* ─── FETCH URL ───────────────────────────────────────────────── */
async function doFetchUrl() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  const btn = document.getElementById('fetchUrlBtn');
  btn.textContent = '…';
  btn.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ action: 'fetchURL', url });
    if (res.success && res.title) {
      document.getElementById('linkTitleInput').value = res.title;
    } else {
      // Fallback: derive a readable title from the URL path (e.g. direct PDF links)
      const fallback = titleFromUrl(url);
      if (fallback) document.getElementById('linkTitleInput').value = fallback;
      toast('Could not read a page title — used filename instead. Edit if needed.', 'info');
    }
  } catch (_) {
    const fallback = titleFromUrl(url);
    if (fallback) document.getElementById('linkTitleInput').value = fallback;
  }
  btn.textContent = 'Fetch';
  btn.disabled = false;
}

function titleFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    const last = pathname.split('/').filter(Boolean).pop() || '';
    const name = decodeURIComponent(last.replace(/\.[^/.]+$/, ''));
    return name.replace(/[-_]+/g, ' ').trim();
  } catch {
    return '';
  }
}

/* ─── FILE HANDLING ───────────────────────────────────────────── */
async function handleFile(file) {
  pickedFile = file;
  const sizeKb = (file.size / 1024).toFixed(1);
  document.getElementById('dropIdle').classList.add('hidden');
  document.getElementById('dropChosen').classList.remove('hidden');
  document.getElementById('chosenName').textContent = file.name;
  document.getElementById('chosenSize').textContent = `${sizeKb} KB`;

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  document.getElementById('fileTitleInput').value = baseName;

  pickedFileText = await extractTextFromFile(file);
}

async function extractTextFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (['txt', 'md', 'json', 'csv'].includes(ext)) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result || '');
      reader.readAsText(file);
    });
  }

  if (ext === 'pdf') {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const text = basicPdfExtract(e.target.result);
        resolve(text || `PDF file: ${file.name} (${(file.size/1024).toFixed(1)} KB)`);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // doc/docx – return filename placeholder
  return `Document: ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
}

/** Minimal PDF text extraction – covers text-based PDFs */
function basicPdfExtract(buffer) {
  const raw = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  let out = '';

  // Scan BT … ET text blocks
  const btEt = /BT\s([\s\S]*?)\sET/g;
  let m;
  while ((m = btEt.exec(raw)) !== null) {
    const block = m[1];
    // Tj / ' operators
    const tjRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|')/g;
    let tj;
    while ((tj = tjRe.exec(block)) !== null) out += decodePdfStr(tj[1]) + ' ';
    // TJ arrays
    const tjArr = /\[([^\]]*)\]\s*TJ/g;
    let ta;
    while ((ta = tjArr.exec(block)) !== null) {
      const strRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
      let s;
      while ((s = strRe.exec(ta[1])) !== null) out += decodePdfStr(s[1]);
    }
  }

  return out.replace(/\s+/g, ' ').trim().slice(0, 25000);
}

function decodePdfStr(s) {
  return s
    .replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
}

function clearFilePick() {
  pickedFile = null;
  pickedFileText = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('fileTitleInput').value = '';
  document.getElementById('dropChosen').classList.add('hidden');
  document.getElementById('dropIdle').classList.remove('hidden');
}

/* ─── ADD MODAL ───────────────────────────────────────────────── */
function openAddModal(type = 'link', url = '', title = '') {
  addType = type;
  // Reset type tabs
  document.querySelectorAll('.type-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.type === type);
  });
  document.getElementById('linkPanel').classList.toggle('hidden', type !== 'link');
  document.getElementById('filePanel').classList.toggle('hidden', type !== 'file');

  // Pre-fill if URL + title provided
  document.getElementById('urlInput').value = url;
  document.getElementById('linkTitleInput').value = title;
  document.getElementById('notesInput').value = '';
  document.getElementById('aiToggle').checked = true;
  clearFilePick();

  document.getElementById('addModal').classList.remove('hidden');
}

function closeAddModal() {
  document.getElementById('addModal').classList.add('hidden');
  document.getElementById('urlInput').value = '';
  document.getElementById('linkTitleInput').value = '';
  document.getElementById('notesInput').value = '';
  clearFilePick();
}

/* ─── SAVE RESOURCE ───────────────────────────────────────────── */
async function saveResource() {
  const isLink = addType === 'link';
  const title = isLink
    ? document.getElementById('linkTitleInput').value.trim()
    : document.getElementById('fileTitleInput').value.trim();
  const url = isLink ? document.getElementById('urlInput').value.trim() : '';
  const category = document.getElementById('categorySelect').value;
  const notes = document.getElementById('notesInput').value.trim();
  const doAI = document.getElementById('aiToggle').checked;

  if (!title) { toast('Please enter a title', 'error'); return; }
  if (isLink && !url)    { toast('Please enter a URL', 'error'); return; }
  if (!isLink && !pickedFile) { toast('Please select a file', 'error'); return; }

  const saveBtn  = document.getElementById('saveResourceBtn');
  const btnLabel = document.getElementById('saveBtnLabel');
  const spinner  = document.getElementById('saveSpinner');

  saveBtn.disabled = true;
  spinner.classList.remove('hidden');
  btnLabel.textContent = doAI ? 'Saving…' : 'Saving…';

  const newItem = {
    id: genId(),
    title,
    type: isLink ? 'link' : fileTypeFromName(pickedFile?.name || ''),
    url,
    fileName: pickedFile?.name || '',
    content: !isLink ? pickedFileText : '',
    category,
    notes,
    summary: '',
    completed: false,
    dateAdded: new Date().toISOString(),
  };

  // ── Save immediately so nothing is lost if popup closes ──
  items.unshift(newItem);
  await saveItems();
  closeAddModal();
  render();
  toast('Resource saved ✓', 'success');

  saveBtn.disabled = false;
  spinner.classList.add('hidden');
  btnLabel.textContent = 'Save Resource';

  // ── Generate AI summary in background after save ──
  if (doAI) {
    try {
      const contentForAI = isLink ? url : pickedFileText;
      const res = await chrome.runtime.sendMessage({
        action: 'generateSummary',
        content: contentForAI,
        title,
        type: newItem.type,
      });
      if (res && res.success) {
        const saved = items.find(i => i.id === newItem.id);
        if (saved) {
          saved.summary = res.summary;
          await saveItems();
          render();
        }
      }
    } catch (_) {}
  }
}

/* ─── VIEW MODAL ──────────────────────────────────────────────── */
function openViewModal(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  viewingId = id;
  deleteConfirm = false;

  const delBtn = document.getElementById('deleteBtn');
  delBtn.textContent = '🗑️ Delete';
  delBtn.classList.remove('confirm');

  document.getElementById('viewItemTitle').textContent = item.title;

  // Meta row
  const meta = document.getElementById('viewMeta');
  const catLabel = CAT_LABELS[item.category] || item.category;
  meta.innerHTML = `
    <span class="tag tag-${item.category}">${catLabel}</span>
    <span class="tag tag-type">${item.type.toUpperCase()}</span>
    <span class="tag" style="background:var(--surface2);color:var(--subtle)">${formatDate(item.dateAdded)}</span>
    ${item.url ? `<a href="${esc(item.url)}" target="_blank">🔗 ${esc(getDomain(item.url))}</a>` : ''}
  `;

  // Summary
  const summaryDisplay = document.getElementById('summaryDisplay');
  document.getElementById('generatingMsg').classList.add('hidden');
  summaryDisplay.textContent = item.summary
    ? item.summary
    : 'No summary yet — click ↻ Regenerate to create one.';

  // Notes
  const notesCard = document.getElementById('notesCard');
  if (item.notes) {
    document.getElementById('notesDisplay').textContent = item.notes;
    notesCard.classList.remove('hidden');
  } else {
    notesCard.classList.add('hidden');
  }

  // Open link button
  document.getElementById('openLinkBtn').classList.toggle('hidden', !item.url);

  document.getElementById('viewModal').classList.remove('hidden');
}

function closeViewModal() {
  document.getElementById('viewModal').classList.add('hidden');
  viewingId = null;
  deleteConfirm = false;
}

/* ─── DELETE (two-step) ───────────────────────────────────────── */
function handleDelete() {
  if (!deleteConfirm) {
    deleteConfirm = true;
    const btn = document.getElementById('deleteBtn');
    btn.textContent = '⚠️ Confirm Delete';
    btn.classList.add('confirm');
    // Auto-reset after 3s
    setTimeout(() => {
      if (deleteConfirm) {
        deleteConfirm = false;
        btn.textContent = '🗑️ Delete';
        btn.classList.remove('confirm');
      }
    }, 3000);
    return;
  }
  doDelete();
}

async function doDelete() {
  items = items.filter(i => i.id !== viewingId);
  await saveItems();
  closeViewModal();
  render();
  toast('Resource deleted', 'success');
}

/* ─── OPEN LINK ───────────────────────────────────────────────── */
function openCurrentLink() {
  const item = items.find(i => i.id === viewingId);
  if (item?.url) chrome.tabs.create({ url: item.url });
}

/* ─── REGENERATE SUMMARY ──────────────────────────────────────── */
async function regenerateSummary() {
  const item = items.find(i => i.id === viewingId);
  if (!item) return;

  const summaryDisplay = document.getElementById('summaryDisplay');
  const genMsg = document.getElementById('generatingMsg');

  summaryDisplay.textContent = '';
  genMsg.classList.remove('hidden');

  try {
    const contentForAI = item.url || item.content || item.title;
    const res = await chrome.runtime.sendMessage({
      action: 'generateSummary',
      content: contentForAI,
      title: item.title,
      type: item.type,
    });

    if (res.success) {
      item.summary = res.summary;
      await saveItems();
      summaryDisplay.textContent = item.summary;
      render();
      toast('Summary updated ✓', 'success');
    } else {
      summaryDisplay.textContent = 'Failed: ' + (res.error || 'Unknown error.');
      toast(res.error || 'Error', 'error');
    }
  } catch (e) {
    summaryDisplay.textContent = 'Error: ' + e.message;
    toast(e.message, 'error');
  }

  genMsg.classList.add('hidden');
}

/* ─── UTILS ───────────────────────────────────────────────────── */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function fileTypeFromName(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (['txt'].includes(ext)) return 'txt';
  if (ext === 'md') return 'md';
  return 'doc';
}

function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.classList.remove('show'); }, 3000);
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS PANEL
═══════════════════════════════════════════════════════════════ */

async function showSettings() {
  await loadSettingsPanel();
  document.getElementById('settingsPanel').classList.remove('hidden');
}

function hideSettings() {
  document.getElementById('settingsPanel').classList.add('hidden');
}

async function loadSettingsPanel() {
  try {
    const { apiKey, aiProvider, aiModel, geminiModel, groqModel } = await chrome.storage.local.get(['apiKey', 'aiProvider', 'aiModel', 'geminiModel', 'groqModel']);
    if (apiKey)      document.getElementById('s-apiKey').value        = apiKey;
    if (aiProvider)  document.getElementById('s-aiProvider').value    = aiProvider;
    if (aiModel)     document.getElementById('s-aiModel').value       = aiModel;
    if (geminiModel) document.getElementById('s-geminiModel').value   = geminiModel;
    if (groqModel)   document.getElementById('s-groqModel').value     = groqModel;
    updateModelFields(aiProvider || 'groq');
  } catch (_) {}
  await refreshStats();
}

function updateModelFields(prov) {
  document.getElementById('s-modelField').classList.toggle('hidden',      prov !== 'openai');
  document.getElementById('s-geminiModelField').classList.toggle('hidden', prov !== 'gemini');
  document.getElementById('s-groqModelField').classList.toggle('hidden',   prov !== 'groq');
}

async function refreshStats() {
  const box = document.getElementById('s-statsBox');
  try {
    const { items: all = [] } = await chrome.storage.local.get('items');
    const byType = all.reduce((a, i) => { a[i.type || 'file'] = (a[i.type || 'file'] || 0) + 1; return a; }, {});
    const withAI = all.filter(i => i.summary).length;
    box.innerHTML =
      `<strong>${all.length}</strong> saved resources &nbsp;·&nbsp; ` +
      Object.entries(byType).map(([t, c]) => `${t.toUpperCase()}: ${c}`).join(' · ') +
      `<br>${withAI} have AI summaries`;
  } catch (_) {
    box.textContent = 'Stats unavailable (extension context required).';
  }
}

async function testConnection() {
  const apiKey   = document.getElementById('s-apiKey').value.trim();
  const provider = document.getElementById('s-aiProvider').value;

  if (!apiKey) { showTestResult('❌ Please enter an API key first', false); return; }

  showTestResult('⏳ Testing…', null);

  try {
    const r = await chrome.runtime.sendMessage({
      action: 'generateSummary',
      content: 'Say exactly: Connection successful',
      title: 'Test',
      type: 'link',
      testApiKey: apiKey,
      testProvider: provider,
    });
    if (r && r.success) showTestResult('✅ Connected! AI is ready.', true);
    else showTestResult('❌ ' + (r?.error || 'Unknown error'), false);
  } catch (e) {
    if (e.message.includes('undefined')) {
      showTestResult('❌ Load as a Chrome extension first (chrome://extensions → Load unpacked)', false);
    } else {
      showTestResult('❌ ' + e.message, false);
    }
  }
}

function showTestResult(msg, ok) {
  const el = document.getElementById('s-testResult');
  el.textContent = msg;
  el.className = 'test-result' + (ok === true ? ' ok' : ok === false ? ' fail' : '');
  el.classList.remove('hidden');
}

async function saveSettingsPanel() {
  const apiKey      = document.getElementById('s-apiKey').value.trim();
  const aiProvider  = document.getElementById('s-aiProvider').value;
  const aiModel     = document.getElementById('s-aiModel').value;
  const geminiModel = document.getElementById('s-geminiModel').value;
  const groqModel   = document.getElementById('s-groqModel').value;

  try {
    await chrome.storage.local.set({ apiKey, aiProvider, aiModel, geminiModel, groqModel });
    const msg = document.getElementById('s-saveMsg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2500);
    toast('Settings saved ✓', 'success');
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  }
}

async function exportData() {
  try {
    const { items: all = [] } = await chrome.storage.local.get('items');
    const json = JSON.stringify(all, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linkvault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported ✓', 'success');
  } catch (e) {
    toast('Export failed: ' + e.message, 'error');
  }
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text     = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error('Not a valid LinkVault export.');
    const { items: existing = [] } = await chrome.storage.local.get('items');
    const existIds = new Set(existing.map(i => i.id));
    const newOnes  = imported.filter(i => i.id && !existIds.has(i.id));
    await chrome.storage.local.set({ items: [...existing, ...newOnes] });
    items = [...existing, ...newOnes];
    await refreshStats();
    render();
    toast(`Imported ${newOnes.length} resource(s) ✓`, 'success');
  } catch (err) {
    toast('Import failed: ' + err.message, 'error');
  }
  e.target.value = '';
}

async function clearAllData() {
  if (!confirm('Delete ALL saved resources? This cannot be undone.')) return;
  try {
    await chrome.storage.local.set({ items: [] });
    items = [];
    await refreshStats();
    render();
    toast('All data cleared', 'success');
  } catch (e) {
    toast('Clear failed: ' + e.message, 'error');
  }
}
