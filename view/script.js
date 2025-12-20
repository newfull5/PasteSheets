console.log('script.js loading...');

let invoke = null;
let currentDirId = null;
let targetDirName = null; // 컨텍스트 메뉴 대상 폴더명
let currentActionIndex = 0; // 현재 선택된 액션 버튼 인덱스 (0: Paste, 1: Edit, 2: Delete)

let allDirectories = []; // 검색을 위한 전체 디렉토리 저장
let allItemsGlobal = []; // 전체 검색을 위한 모든 아이템 저장
let currentDirectoryItems = []; // 현재 디렉토리 내 검색을 위한 아이템 저장

// 글로벌 노출 (스크립트 로드 시 즉시)
window.showContextMenu = function (e, dirName) {
  console.log('showContextMenu called for:', dirName);
  e.preventDefault();
  if (dirName === 'All Items') return;

  targetDirName = dirName;
  const menu = document.getElementById('context-menu');
  if (!menu) {
    console.error('Context menu element not found!');
    return;
  }
  menu.style.top = `${e.clientY}px`;
  menu.style.left = `${e.clientX}px`;
  menu.classList.remove('hidden');

  const delBtn = document.getElementById('menu-delete');
  const renameBtn = document.getElementById('menu-rename');

  if (dirName === 'Clipboard') {
    if (delBtn) delBtn.style.display = 'none';
    if (renameBtn) renameBtn.style.display = 'none';
  } else {
    if (delBtn) delBtn.style.display = 'block';
    if (renameBtn) renameBtn.style.display = 'block';
  }
};

// [커스텀 모달 유틸리티]
function showModal({ title, text, inputPlaceholder, inputValue, confirmText, isDanger }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const textEl = document.getElementById('modal-text');
    const inputEl = document.getElementById('modal-input');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = title || 'Check';
    textEl.textContent = text || '';

    if (inputPlaceholder !== undefined) {
      inputEl.classList.remove('hidden');
      inputEl.placeholder = inputPlaceholder;
      inputEl.value = inputValue || '';
    } else {
      inputEl.classList.add('hidden');
    }

    confirmBtn.textContent = confirmText || 'OK';
    if (isDanger) confirmBtn.classList.add('btn-danger');
    else confirmBtn.classList.remove('btn-danger');

    const cleanup = () => {
      overlay.classList.add('hidden');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      window.removeEventListener('keydown', onKeyDown);
    };

    const onConfirm = () => {
      const val = inputEl.value;
      cleanup();
      resolve(inputPlaceholder !== undefined ? val : true);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    window.addEventListener('keydown', onKeyDown);

    overlay.classList.remove('hidden');

    if (inputPlaceholder !== undefined) {
      inputEl.focus();
      inputEl.select();
    }
  });
}

window.doRename = async function (e) {
  if (e) e.stopPropagation();

  // 컨텍스트 메뉴를 닫음
  const menu = document.getElementById('context-menu');
  if (menu) menu.classList.add('hidden');

  const dirName = (targetDirName || "").trim();
  console.log(`[DEBUG] doRename called. targetDirName: "${dirName}"`);

  if (!dirName) {
    alert("대상 폴더를 찾을 수 없습니다. 다시 시도해 주세요.");
    return;
  }

  try {
    const newName = await showModal({
      title: 'Folder Rename',
      text: `'${dirName}' 폴더의 새 이름을 입력하세요:`,
      inputPlaceholder: 'New folder name...',
      inputValue: dirName,
      confirmText: 'Rename'
    });

    if (newName && newName.trim() && newName.trim() !== dirName) {
      const renamed = newName.trim();
      console.log(`[DEBUG] Invoking rename: "${dirName}" -> "${renamed}"`);

      await invoke('rename_directory', { oldName: dirName, newName: renamed });

      if (currentDirId === dirName) {
        currentDirId = renamed;
        const titleEl = document.getElementById('current-folder-title');
        if (titleEl) titleEl.textContent = renamed;
      }

      await loadDirectories();
      if (!document.getElementById('view-items').classList.contains('hidden')) {
        await loadHistory(currentDirId);
      }
      alert(`폴더 이름이 "${renamed}"(으)로 변경되었습니다.`);
    }
  } catch (err) {
    console.error('[Rename Error]', err);
    alert('이름 변경 중 오류가 발생했습니다: ' + err);
  }
};

window.doDelete = async function (e, name) {
  if (e) e.stopPropagation();
  const dirName = name || targetDirName;
  document.getElementById('context-menu').classList.add('hidden');

  if (!dirName || dirName === 'All Items' || dirName === 'Clipboard') return;

  const result = await showModal({
    title: 'Folder Delete',
    text: `'${dirName}' 폴더와 그 안의 모든 항목을 삭제하시겠습니까?`,
    confirmText: 'Delete',
    isDanger: true
  });

  if (result) {
    try {
      console.log(`Invoking delete_directory: ${dirName}`);
      await invoke('delete_directory', { name: dirName });
      await loadDirectories();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('삭제 실패: ' + err);
    }
  }
};


// 1. 초기화 함수
async function startApp() {
  if (initTauri()) {
    console.log('Tauri initialized, loading directories...');
    await loadDirectories();

    const container = document.querySelector('.container');
    if (window.__TAURI__) {
      const { listen } = window.__TAURI__.event;
      listen('tauri://focus', () => setTimeout(() => container.classList.add('visible'), 20));
      listen('window-visible', (event) => {
        if (event.payload) setTimeout(() => container.classList.add('visible'), 20);
        else container.classList.remove('visible');
      });

      window.__TAURI__.event.listen('clipboard-updated', async () => {
        console.log('Clipboard updated event received');
        await loadDirectories();
        if (currentDirId) await loadHistory(currentDirId);
      });
    }

    // 검색창 이벤트 바인딩
    const dirSearch = document.getElementById('dir-search');
    const itemSearch = document.getElementById('item-search');
    const mainTitle = document.getElementById('main-brand-title');
    const folderTitle = document.getElementById('current-folder-title');

    const updateSearchUI = (input, title) => {
      // 값이 있거나 포커스가 되어 있는 경우 타이틀을 완전히 숨겨서
      // '깨끗한 입력창'이 나타나도록 합니다.
      if (input.value || document.activeElement === input) {
        title.style.opacity = '0';
        input.classList.add('active');
      } else {
        title.style.opacity = '1';
        input.classList.remove('active');
      }
    };

    dirSearch.oninput = () => {
      filterDirectories();
      updateSearchUI(dirSearch, mainTitle);
    };
    dirSearch.onfocus = () => updateSearchUI(dirSearch, mainTitle);
    dirSearch.onblur = () => updateSearchUI(dirSearch, mainTitle);

    itemSearch.oninput = () => {
      filterHistoryItems();
      updateSearchUI(itemSearch, folderTitle);
    };
    itemSearch.onfocus = () => updateSearchUI(itemSearch, folderTitle);
    itemSearch.onblur = () => updateSearchUI(itemSearch, folderTitle);

    // ESC 누르면 검색창 비우기 (글로벌에서 통합 관리하기 위해 제거)

  } else {
    console.warn('Tauri not found, rendering empty list');
    renderDirectories([]);
  }
}

// 스크립트 로드 시 즉시 또는 DOMContentLoaded에 실행
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

function initTauri() {
  if (window.__TAURI__ && window.__TAURI__.core) {
    invoke = window.__TAURI__.core.invoke;
    return true;
  }
  return false;
}

// ---------------------------------------------------------
// 화면 전환 로직 (핵심)
// ---------------------------------------------------------

window.showDirectoryView = function () {
  document.getElementById('view-items').classList.add('hidden');
  document.getElementById('view-directories').classList.remove('hidden');

  // 검색어 초기화
  const dirSearch = document.getElementById('dir-search');
  const mainTitle = document.getElementById('main-brand-title');
  if (dirSearch) {
    dirSearch.value = '';
    filterDirectories();
    if (mainTitle) mainTitle.style.opacity = '1';
  }

  const dirs = document.querySelectorAll('.dir-item');
  const selected = document.querySelector('.dir-item.selected');
  if (dirs.length > 0 && !selected) {
    selectDirItem(0);
  }
};

window.showItemView = async function (dirName) {
  document.getElementById('view-directories').classList.add('hidden');
  document.getElementById('view-items').classList.remove('hidden');

  // 검색어 초기화
  const itemSearch = document.getElementById('item-search');
  const folderTitle = document.getElementById('current-folder-title');
  if (itemSearch) {
    itemSearch.value = '';
    if (folderTitle) folderTitle.style.opacity = '1';
  }

  const titleEl = document.getElementById('current-folder-title');
  titleEl.textContent = dirName;

  currentDirId = dirName;
  await loadHistory(dirName);
};

// ---------------------------------------------------------
// 렌더링 로직
// ---------------------------------------------------------

async function loadDirectories() {
  try {
    const directories = await invoke('get_directories');
    const allItems = await invoke('get_clipboard_history');

    directories.sort((a, b) => {
      if (a.name === 'Clipboard') return -1;
      if (b.name === 'Clipboard') return 1;
      return a.name.localeCompare(b.name);
    });

    allItemsGlobal = allItems;
    allDirectories = directories.map(dir => ({
      ...dir,
      count: allItems.filter(item => item.directory.toLowerCase() === dir.name.toLowerCase()).length
    }));

    filterDirectories();
  } catch (error) {
    console.error('Failed to load directories:', error);
    renderDirectories([]);
  }
}

function filterDirectories() {
  const searchTerm = document.getElementById('dir-search').value.toLowerCase();

  const filteredDirs = allDirectories.filter(dir =>
    dir.name.toLowerCase().includes(searchTerm)
  );

  const filteredItems = searchTerm.trim() !== ''
    ? allItemsGlobal.filter(item =>
      (item.content && item.content.toLowerCase().includes(searchTerm)) ||
      (item.memo && item.memo.toLowerCase().includes(searchTerm))
    )
    : [];

  renderDirectories(filteredDirs, filteredItems, searchTerm);

  if (filteredDirs.length > 0 || filteredItems.length > 0) {
    selectDirItem(0);
  }
}

function renderDirectories(dirs, items = [], searchTerm = '') {
  const listDiv = document.getElementById('directory-list');
  let html = '';

  // 1. 디렉토리 섹션
  if (dirs.length > 0) {
    if (searchTerm) html += '<div class="search-section-title">Folders</div>';
    html += dirs.map(dir => {
      const safeName = dir.name.replace(/'/g, "\\'");
      return `
        <div class="dir-item"
             onclick="showItemView('${safeName}')"
             oncontextmenu="showContextMenu(event, '${safeName}')"
             tabindex="0">
          <span class="dir-name">${dir.name}</span>
          <span class="dir-count">${dir.count}</span>
        </div>
      `;
    }).join('');
  }

  // 2. 통합 검색 항목 섹션
  if (items.length > 0) {
    html += '<div class="search-section-title" style="margin-top:15px;">Items</div>';
    html += items.map(item => {
      const displayContent = item.content.length > 50 ? item.content.substring(0, 50) + '...' : item.content;
      return `
        <div class="dir-item search-result-item"
             onclick="globalPaste('${item.content.replace(/'/g, "\\'").replace(/\n/g, "\\n")}')"
             tabindex="0">
          <div style="display:flex; flex-direction:column; width:100%;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="dir-name" style="font-size:12px; color:var(--accent);">${item.memo || 'Item'}</span>
              <span style="font-size:10px; color:rgba(255,255,255,0.3);">${item.directory}</span>
            </div>
            <div style="font-size:11px; color:rgba(255,255,255,0.6); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">
              ${escapeHtml(displayContent)}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (dirs.length === 0 && items.length === 0) {
    html = '<div class="empty-state">검색 결과가 없습니다</div>';
  }

  // 3. 'New Folder' 버튼 (검색 중이 아닐 때만 하단에 표시)
  if (!searchTerm) {
    html += `
      <div class="dir-item btn-new-folder" onclick="createDirectoryPrompt(); event.stopPropagation();" tabindex="0" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); color: var(--text-sub);">
        <span class="dir-name" style="font-size: 14px;"> New Folder </span>
      </div>
    `;
  }

  listDiv.innerHTML = html;
}

window.globalPaste = async function (content) {
  if (invoke) {
    try {
      await invoke('paste_text', { text: content });
      await invoke('toggle_main_window');
    } catch (err) {
      console.error('Global paste failed:', err);
    }
  }
};

async function loadHistory(dirName) {
  const listDiv = document.getElementById('history-list');
  listDiv.innerHTML = '<div style="padding:20px; color:#666; text-align:center;">Loading...</div>';

  try {
    const allItems = await invoke('get_clipboard_history');

    currentDirectoryItems = (dirName === 'All Items' || !dirName)
      ? allItems
      : allItems.filter(item => item.directory.toLowerCase() === dirName.toLowerCase());

    filterHistoryItems();
  } catch (error) {
    console.error('Failed to load history:', error);
    listDiv.innerHTML = '';
  }
}

function filterHistoryItems() {
  const searchTerm = document.getElementById('item-search').value.toLowerCase();
  const items = currentDirectoryItems.filter(item =>
    (item.content && item.content.toLowerCase().includes(searchTerm)) ||
    (item.memo && item.memo.toLowerCase().includes(searchTerm))
  );

  const listDiv = document.getElementById('history-list');
  const historyHtml = items.length === 0
    ? ''
    : items.map((item, index) => `
      <div class="history-item" onclick="if(!this.classList.contains('editing')) selectItem(${index})" data-id="${item.id}" data-memo="${escapeHtml(item.memo || '')}">
        <div class="item-body">
          ${item.memo ? `<div class="item-memo">${escapeHtml(item.memo)}</div>` : ''}
          <div class="item-content">${escapeHtml(item.content)}</div>
          <div class="item-meta">
            <span>${formatDate(item.created_at)}</span>
          </div>
          <div class="item-actions">
            <button class="btn-mini primary" onclick="pasteItemByIndex(${index}); event.stopPropagation();">Paste</button>
            <button class="btn-mini" onclick="editHistoryItem(${index}); event.stopPropagation();">Edit</button>
            <button class="btn-mini danger" onclick="deleteHistoryItem(${item.id}); event.stopPropagation();">Delete</button>
          </div>
        </div>
      </div>
    `).join('');

  const newItemHtml = `
      <div class="history-item btn-new-folder btn-new-item" onclick="createHistoryItemPrompt(); event.stopPropagation();" tabindex="0" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); color: var(--text-sub); min-height: 44px;">
        <div class="item-body">
          <div class="item-content" style="font-size: 14px; color: var(--accent); opacity: 0.8;"> New Item </div>
        </div>
      </div>
    `;

  listDiv.innerHTML = historyHtml + newItemHtml;

  if (items.length > 0) {
    window.selectItem(0);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} `;
}

window.selectItem = function (index) {
  const all = document.querySelectorAll('.history-item');

  const editingItem = document.querySelector('.history-item.editing');
  if (editingItem) {
    cancelEdit(editingItem);
  }

  all.forEach(el => el.classList.remove('selected'));
  if (all[index]) {
    all[index].classList.add('selected');
    all[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    currentActionIndex = 0;
    updateActionButtonsUI(all[index]);
  }
};

function updateActionButtonsUI(itemEl) {
  if (!itemEl) return;
  const buttons = itemEl.querySelectorAll('.item-actions .btn-mini');
  buttons.forEach((btn, idx) => {
    if (idx === currentActionIndex) {
      btn.classList.add('primary');
    } else {
      btn.classList.remove('primary');
    }
  });
}

window.pasteItemByIndex = async function (index) {
  const items = document.querySelectorAll('.history-item');
  if (items[index]) {
    const content = items[index].querySelector('.item-content').textContent;
    if (invoke) {
      try {
        await invoke('paste_text', { text: content });
        await invoke('toggle_main_window');
      } catch (err) {
        console.error('Failed to paste:', err);
      }
    }
  }
};

window.editHistoryItem = function (index) {
  const items = document.querySelectorAll('.history-item');
  const item = items[index];
  if (!item) return;

  item.classList.add('editing');
  const contentDiv = item.querySelector('.item-content');
  const currentText = contentDiv.textContent;
  const currentMemo = item.dataset.memo || '';

  const memoInput = document.createElement('input');
  memoInput.className = 'memo-area';
  memoInput.value = currentMemo;
  memoInput.placeholder = '메모 입력 (선택 사항)...';

  const oldMemoDiv = item.querySelector('.item-memo');
  if (oldMemoDiv) oldMemoDiv.style.display = 'none';

  contentDiv.parentNode.insertBefore(memoInput, contentDiv);

  contentDiv.style.display = 'none';
  const textarea = document.createElement('textarea');
  textarea.className = 'edit-area';
  textarea.value = currentText;
  contentDiv.parentNode.insertBefore(textarea, contentDiv);

  const autoResize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight + 2) + 'px';
  };

  textarea.addEventListener('input', autoResize);
  setTimeout(autoResize, 0);

  memoInput.focus();

  const handleShortcut = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      saveHistoryItem(index);
    }
  };

  memoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      textarea.focus();
    }
    handleShortcut(e);
  });

  textarea.addEventListener('keydown', handleShortcut);

  const actionDiv = item.querySelector('.item-actions');
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const hint = isMac ? '⌘+Enter' : 'Ctrl+Enter';

  actionDiv.innerHTML = `
    <button class="btn-mini primary" onclick="saveHistoryItem(${index}); event.stopPropagation();">Save (${hint})</button>
    <button class="btn-mini" onclick="cancelEditByIndex(${index}); event.stopPropagation();">Cancel</button>
  `;

  setTimeout(() => {
    item.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 100);
};

window.cancelEditByIndex = function (index) {
  const items = document.querySelectorAll('.history-item');
  cancelEdit(items[index]);
  if (currentDirId) loadHistory(currentDirId);
};

function cancelEdit(itemEl) {
  if (!itemEl) return;
  itemEl.classList.remove('editing');
  const textarea = itemEl.querySelector('.edit-area');
  const memoInput = itemEl.querySelector('.memo-area');
  if (textarea) textarea.remove();
  if (memoInput) memoInput.remove();

  const contentDiv = itemEl.querySelector('.item-content');
  if (contentDiv) contentDiv.style.display = 'block';

  const memoDiv = itemEl.querySelector('.item-memo');
  if (memoDiv) memoDiv.style.display = 'block';
}

window.saveHistoryItem = async function (index) {
  const items = document.querySelectorAll('.history-item');
  const item = items[index];
  const id = item.dataset.id;
  const newContent = item.querySelector('.edit-area').value;
  const newMemo = item.querySelector('.memo-area').value;

  try {
    await invoke('update_history_item', {
      id: parseInt(id),
      content: newContent,
      directory: currentDirId === 'All Items' ? 'Clipboard' : currentDirId,
      memo: newMemo || null
    });
    await loadHistory(currentDirId);
  } catch (err) {
    console.error('Failed to save:', err);
    alert('저장 실패: ' + err);
  }
};

window.deleteHistoryItem = async function (id) {
  const result = await showModal({
    title: 'Item Delete',
    text: '이 항목을 삭제하시겠습니까?',
    confirmText: 'Delete',
    isDanger: true
  });

  if (result) {
    try {
      await invoke('delete_history_item', { id: parseInt(id) });
      await loadHistory(currentDirId);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }
};

window.clearAll = function () {
  alert('삭제 기능');
};

window.createDirectoryPrompt = function () {
  const btnNewFolder = document.querySelector('.btn-new-folder');
  if (!btnNewFolder || btnNewFolder.classList.contains('active')) return;

  const originalHtml = btnNewFolder.innerHTML;
  btnNewFolder.classList.add('active');
  btnNewFolder.innerHTML = `
    <input type="text" class="inline-input" placeholder="Folder Name..." spellcheck="false">
  `;

  const input = btnNewFolder.querySelector('input');
  input.focus();

  const closeInline = () => {
    btnNewFolder.classList.remove('active');
    btnNewFolder.innerHTML = originalHtml;
  };

  input.onblur = closeInline;

  input.onkeydown = async (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const name = input.value.trim();
      if (name) {
        try {
          await invoke('create_directory', { name });
          await loadDirectories();
        } catch (error) {
          console.error('Failed to create directory:', error);
          alert('폴더 생성 실패: ' + error);
          closeInline();
        }
      } else {
        closeInline();
      }
    } else if (e.key === 'Escape') {
      closeInline();
    }
  };
};

window.createHistoryItemPrompt = function () {
  const btnNewItem = document.querySelector('.btn-new-item');
  if (!btnNewItem || btnNewItem.classList.contains('active')) return;

  const originalHtml = btnNewItem.innerHTML;
  btnNewItem.classList.add('active');

  btnNewItem.innerHTML = `
    <div class="item-body">
      <input type="text" class="inline-memo" placeholder="Memo (Optional)..." spellcheck="false">
      <textarea class="inline-content" placeholder="Content (⌘+Enter to save)..." spellcheck="false"></textarea>
      <div class="inline-actions">
        <button class="btn-mini primary btn-save-inline">Save</button>
        <button class="btn-mini btn-cancel-inline">Cancel</button>
      </div>
    </div>
  `;

  const memoInput = btnNewItem.querySelector('.inline-memo');
  const contentArea = btnNewItem.querySelector('.inline-content');
  const saveBtn = btnNewItem.querySelector('.btn-save-inline');
  const cancelBtn = btnNewItem.querySelector('.btn-cancel-inline');

  memoInput.focus();

  const closeInline = () => {
    btnNewItem.classList.remove('active');
    btnNewItem.innerHTML = originalHtml;
  };

  const onSave = async () => {
    const content = contentArea.value.trim();
    const memo = memoInput.value.trim();
    if (content) {
      try {
        const dir = (currentDirId === 'All Items' || !currentDirId) ? 'Clipboard' : currentDirId;
        await invoke('create_history_item', { content, directory: dir, memo: memo || null });
        await loadHistory(currentDirId);
        await loadDirectories();
      } catch (error) {
        console.error('Failed to create item:', error);
        alert('아이템 추가 실패: ' + error);
        closeInline();
      }
    } else {
      closeInline();
    }
  };

  saveBtn.onclick = (e) => {
    e.stopPropagation();
    onSave();
  };
  cancelBtn.onclick = (e) => {
    e.stopPropagation();
    closeInline();
  };

  memoInput.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      contentArea.focus();
    } else if (e.key === 'Escape') {
      closeInline();
    }
  };

  contentArea.onkeydown = (e) => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSave();
    } else if (e.key === 'Escape') {
      closeInline();
    }
  };
};

window.addEventListener('click', () => {
  const menu = document.getElementById('context-menu');
  menu.classList.add('hidden');
});

window.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.dir-item')) {
    document.getElementById('context-menu').classList.add('hidden');
  }
});

window.addEventListener('keydown', async (event) => {
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
    return;
  }

  // 1. 입력창 포커스 중일 때는 글로벌 단축키 대부분을 무시 (ESC/Enter 등 필요한 것 제외)
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    if (event.key === 'Escape') {
      // 입력창 자체의 onkeydown에서 처리하므로 여기선 통과
    } else if (event.key === 'Enter') {
      // 입력창에서 Enter 누르면 첫 결과 선택 등 추가 동작 가능
    } else {
      // 백스페이스, 화살표 등 입력창 본연의 동작을 방해하지 않도록 리턴
      return;
    }
  }

  // 2. 자동 검색 포커스: 입력 필드가 아닌 곳에서 문자를 치거나 백스페이스를 누르면 검색창으로 포커스
  if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
    const isPrintable = event.key.length === 1;
    const isBackspace = event.key === 'Backspace';

    if ((isPrintable || isBackspace) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const isDirView = !document.getElementById('view-directories').classList.contains('hidden');
      const searchInput = isDirView ? document.getElementById('dir-search') : document.getElementById('item-search');
      if (searchInput) {
        searchInput.focus();
      }
    }
  }

  if (event.key === 'Escape') {
    event.preventDefault();

    // 1. 인라인 에디팅 중이면 에디팅 취소
    const editingItem = document.querySelector('.history-item.editing');
    if (editingItem) {
      const allItems = document.querySelectorAll('.history-item');
      const index = Array.from(allItems).indexOf(editingItem);
      if (index >= 0) {
        cancelEditByIndex(index);
        return;
      }
    }

    // 2. 검색 중이면 검색어 초기화 (1단계 ESC)
    const dirSearch = document.getElementById('dir-search');
    const itemSearch = document.getElementById('item-search');
    const isDirView = !document.getElementById('view-directories').classList.contains('hidden');
    const activeSearch = isDirView ? dirSearch : itemSearch;
    const title = isDirView ? document.getElementById('main-brand-title') : document.getElementById('current-folder-title');

    if (activeSearch && (activeSearch.value || document.activeElement === activeSearch)) {
      activeSearch.value = '';
      if (isDirView) filterDirectories(); else filterHistoryItems();
      activeSearch.blur();
      if (title) title.style.opacity = '1';
      return; // 윈도우는 아직 닫지 않음
    }

    // 3. 더 이상 할 게 없으면 윈도우 토글 (2단계 ESC)
    if (invoke) await invoke('toggle_main_window');
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    const editingItem = document.querySelector('.history-item.editing');
    if (editingItem) {
      event.preventDefault();
      const allItems = document.querySelectorAll('.history-item');
      const index = Array.from(allItems).indexOf(editingItem);
      if (index >= 0) {
        saveHistoryItem(index);
        return;
      }
    }
  }

  const dirView = !document.getElementById('view-directories').classList.contains('hidden');
  const itemView = !document.getElementById('view-items').classList.contains('hidden');

  if (dirView) {
    const dirs = document.querySelectorAll('.dir-item');
    if (dirs.length === 0) return;

    let selectedIndex = -1;
    dirs.forEach((dir, idx) => {
      if (dir.classList.contains('selected')) selectedIndex = idx;
    });

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      let nextIndex = (selectedIndex + 1) % dirs.length;
      selectDirItem(nextIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      let prevIndex = (selectedIndex - 1 + dirs.length) % dirs.length;
      selectDirItem(prevIndex);
    } else if (event.key === 'Enter' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (selectedIndex >= 0) {
        const selectedDir = dirs[selectedIndex];
        if (selectedDir.classList.contains('btn-new-folder')) {
          createDirectoryPrompt();
          return;
        }
        const dirName = selectedDir.querySelector('.dir-name').textContent;
        await window.showItemView(dirName);
      }
    } else if ((event.metaKey || event.ctrlKey) && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      if (selectedIndex >= 0) {
        const selectedDir = dirs[selectedIndex];
        if (!selectedDir.classList.contains('btn-new-folder')) {
          const dirName = selectedDir.querySelector('.dir-name').textContent;
          window.doDelete(null, dirName);
        }
      }
    }
  } else if (itemView) {
    if (event.key === 'ArrowLeft') {
      const editingItem = document.querySelector('.history-item.editing');
      if (!editingItem) {
        if (currentActionIndex > 0) {
          event.preventDefault();
          currentActionIndex--;
          const selectedItem = document.querySelector('.history-item.selected');
          updateActionButtonsUI(selectedItem);
          return;
        } else {
          event.preventDefault();
          window.showDirectoryView();
          return;
        }
      }
    }

    const items = document.querySelectorAll('.history-item');
    if (items.length === 0) return;

    let selectedIndex = -1;
    items.forEach((item, index) => {
      if (item.classList.contains('selected')) selectedIndex = index;
    });

    const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;
    const isEditing = selectedItem && selectedItem.classList.contains('editing');

    if (isEditing) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditByIndex(selectedIndex);
      }
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const buttons = selectedItem.querySelectorAll('.item-actions .btn-mini');
      if (currentActionIndex < buttons.length - 1) {
        currentActionIndex++;
        updateActionButtonsUI(selectedItem);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      let nextIndex = (selectedIndex + 1) % items.length;
      window.selectItem(nextIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      let prevIndex = (selectedIndex - 1 + items.length) % items.length;
      window.selectItem(prevIndex);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedItem) {
        if (selectedItem.classList.contains('btn-new-item')) {
          selectedItem.click();
        } else {
          const buttons = selectedItem.querySelectorAll('.item-actions .btn-mini');
          if (buttons[currentActionIndex]) {
            buttons[currentActionIndex].click();
          }
        }
      }
    } else if ((event.metaKey || event.ctrlKey) && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      if (selectedItem) {
        const itemId = selectedItem.dataset.id;
        if (itemId) {
          window.deleteHistoryItem(itemId);
        }
      }
    }
  }
});

function selectDirItem(index) {
  const dirs = document.querySelectorAll('.dir-item');
  if (dirs.length === 0) return;
  dirs.forEach(el => el.classList.remove('selected'));
  if (dirs[index]) {
    dirs[index].classList.add('selected');
    // 검색창 입력 중에는 포커스를 뺏지 않음
    if (document.activeElement.tagName !== 'INPUT') {
      dirs[index].focus?.();
    }
  }
}
