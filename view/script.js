console.log('script.js loading...');

let invoke = null;
let currentDirId = null;
let targetDirName = null; // 컨텍스트 메뉴 대상 폴더명
let currentActionIndex = 0; // 현재 선택된 액션 버튼 인덱스 (0: Paste, 1: Edit, 2: Delete)

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
  const dirName = targetDirName;
  document.getElementById('context-menu').classList.add('hidden');

  if (!dirName) return;

  const newName = await showModal({
    title: 'Folder Rename',
    text: `'${dirName}' 폴더의 새 이름을 입력하세요:`,
    inputPlaceholder: 'New folder name...',
    inputValue: dirName,
    confirmText: 'Rename'
  });

  if (newName && newName.trim() && newName !== dirName) {
    try {
      console.log(`Invoking rename_directory: ${dirName} -> ${newName.trim()}`);
      await invoke('rename_directory', { oldName: dirName, newName: newName.trim() });
      await loadDirectories();
    } catch (err) {
      console.error('Rename failed:', err);
      alert('이름 변경 실패: ' + err);
    }
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


// 1. 초기화
window.addEventListener('DOMContentLoaded', async () => {
  if (initTauri()) {
    await loadDirectories(); // 실제 DB에서 로드

    // 애니메이션 트리거: 윈도우가 보여질 때 동작
    const container = document.querySelector('.container');

    if (window.__TAURI__) {
      const { listen } = window.__TAURI__.event;

      listen('tauri://focus', () => {
        setTimeout(() => container.classList.add('visible'), 20);
      });

      listen('tauri://blur', () => {
      });

      listen('window-visible', (event) => {
        if (event.payload) {
          setTimeout(() => container.classList.add('visible'), 20);
        } else {
          container.classList.remove('visible');
        }
      });
    }

    if (window.__TAURI__ && window.__TAURI__.event) {
      window.__TAURI__.event.listen('clipboard-updated', async () => {
        console.log('Clipboard updated event received');
        await loadDirectories();
        if (currentDirId) {
          await loadHistory(currentDirId);
        }
      });
    }
  } else {
    renderDirectories([]);
  }
});

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

  const dirs = document.querySelectorAll('.dir-item');
  const selected = document.querySelector('.dir-item.selected');
  if (dirs.length > 0 && !selected) {
    selectDirItem(0);
  }
};

window.showItemView = async function (dirName) {
  document.getElementById('view-directories').classList.add('hidden');
  document.getElementById('view-items').classList.remove('hidden');

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

    const dirs = [
      { name: 'All Items', count: allItems.length },
      ...directories
    ];

    const filteredDirs = dirs.filter(dir => dir.name !== 'All Items');
    renderDirectories(filteredDirs);

    if (filteredDirs.length > 0) {
      selectDirItem(0);
    }
  } catch (error) {
    console.error('Failed to load directories:', error);
    renderDirectories([]);
  }
}

function renderDirectories(dirs) {
  const listDiv = document.getElementById('directory-list');

  let directoryHtml = '';
  if (dirs.length === 0) {
    directoryHtml = '<div class="empty-state">디렉토리가 없습니다</div>';
  } else {
    directoryHtml = dirs.map(dir => {
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

  const newFolderHtml = `
    <div class="dir-item btn-new-folder" onclick="createDirectoryPrompt(); event.stopPropagation();" tabindex="0" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); color: var(--text-sub);">
      <span class="dir-name" style="font-size: 14px;"> New Folder </span>
    </div>
  `;

  listDiv.innerHTML = directoryHtml + newFolderHtml;
}

async function loadHistory(dirName) {
  const listDiv = document.getElementById('history-list');
  listDiv.innerHTML = '<div style="padding:20px; color:#666; text-align:center;">Loading...</div>';

  try {
    const allItems = await invoke('get_clipboard_history');

    const items = dirName === 'All Items'
      ? allItems
      : allItems.filter(item => item.directory === dirName);

    if (items.length === 0) {
      listDiv.innerHTML = `<div class="empty-state">비어있음</div>`;
      return;
    }

    listDiv.innerHTML = items.map((item, index) => `
      <div class="history-item" onclick="if(!this.classList.contains('editing')) selectItem(${index})" data-id="${item.id}" data-memo="${escapeHtml(item.memo || '')}">
        <div class="item-body">
          ${item.memo ? `<div class="item-memo">${escapeHtml(item.memo)}</div>` : ''}
          <div class="item-content">${escapeHtml(item.content)}</div>
          <div class="item-meta">
            <span>#${item.id} · ${formatDate(item.created_at)}</span>
          </div>
          <div class="item-actions">
            <button class="btn-mini primary" onclick="pasteItemByIndex(${index}); event.stopPropagation();">Paste</button>
            <button class="btn-mini" onclick="editHistoryItem(${index}); event.stopPropagation();">Edit</button>
            <button class="btn-mini danger" onclick="deleteHistoryItem(${item.id}); event.stopPropagation();">Delete</button>
          </div>
        </div>
      </div>
    `).join('');

    if (items.length > 0) {
      window.selectItem(0);
    }
  } catch (error) {
    console.error('Failed to load history:', error);
    listDiv.innerHTML = `<div class="empty-state">로드 실패</div>`;
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
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const container = document.getElementById('dir-input-container');
  const input = document.getElementById('new-dir-name');
  const btnNewFolder = document.querySelector('.btn-new-folder');

  container.classList.remove('hidden');
  if (btnNewFolder) btnNewFolder.classList.add('hidden');
  input.focus();

  input.onkeydown = async (e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      const name = input.value.trim();
      if (name) {
        try {
          await invoke('create_directory', { name });
          input.value = '';
          container.classList.add('hidden');
          await loadDirectories();
        } catch (error) {
          console.error('Failed to create directory:', error);
          alert('폴더 생성 실패: ' + error);
        }
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      input.value = '';
      container.classList.add('hidden');
      if (btnNewFolder) btnNewFolder.classList.remove('hidden');
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

  if (event.key === 'Escape') {
    event.preventDefault();

    const editingItem = document.querySelector('.history-item.editing');
    if (editingItem) {
      const allItems = document.querySelectorAll('.history-item');
      const index = Array.from(allItems).indexOf(editingItem);
      if (index >= 0) {
        cancelEditByIndex(index);
        return;
      }
    }

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
        const buttons = selectedItem.querySelectorAll('.item-actions .btn-mini');
        if (buttons[currentActionIndex]) {
          buttons[currentActionIndex].click();
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
    dirs[index].focus?.()
  }
}
