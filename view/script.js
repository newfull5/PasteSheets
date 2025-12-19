console.log('script.js loading...');

let invoke = null;
let currentDirId = null;
let targetDirName = null; // 컨텍스트 메뉴 대상 폴더명

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
  if (dirName === 'CLIPBOARD') {
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
      overlay.removeEventListener('keydown', onKeyDown);
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
    overlay.addEventListener('keydown', onKeyDown);

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
      // Tauri 2에서는 인자 이름을 camelCase로 맞춰야 할 수 있음.
      // Rust에서 old_name, new_name이므로 JS에서는 oldName, newName 사용 권장.
      await invoke('rename_directory', { oldName: dirName, newName: newName.trim() });
      await loadDirectories();
    } catch (err) {
      console.error('Rename failed:', err);
      alert('이름 변경 실패: ' + err);
    }
  }
};

window.doDelete = async function (e) {
  if (e) e.stopPropagation();
  const dirName = targetDirName;
  document.getElementById('context-menu').classList.add('hidden');

  if (!dirName) return;

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

    // [추가] Tauri 창이 포커스를 받거나 명시적으로 보여질 때 애니메이션 시작
    if (window.__TAURI__) {
      const { listen } = window.__TAURI__.event;

      // 창이 포커스될 때 (show() 호출 시 보통 발생)
      listen('tauri://focus', () => {
        setTimeout(() => container.classList.add('visible'), 20);
      });

      // 창이 블러될 때 (선택사항: 닫힐 때 애니메이션을 미리 빼두고 싶다면)
      listen('tauri://blur', () => {
        // container.classList.remove('visible'); // 아예 사라지게 하려면 주석 해제
      });

      // 백엔드에서 명시적으로 보내는 이벤트 (커스텀)
      listen('window-visible', (event) => {
        if (event.payload) {
          setTimeout(() => container.classList.add('visible'), 20);
        } else {
          container.classList.remove('visible');
        }
      });
    }

    // 백엔드에서 클립보드 변경 이벤트 감지
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
    // Tauri 없을 때 (테스트)
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

// [폴더 목록 화면 보여주기]
window.showDirectoryView = function () {
  document.getElementById('view-items').classList.add('hidden');
  document.getElementById('view-directories').classList.remove('hidden');

  // 화면 전환 시 첫 번째 디렉토리 자동 선택 (이미 선택된 게 없다면)
  const dirs = document.querySelectorAll('.dir-item');
  const selected = document.querySelector('.dir-item.selected');
  if (dirs.length > 0 && !selected) {
    selectDirItem(0);
  }
};

// [히스토리 상세 화면 보여주기]
window.showItemView = async function (dirName) {
  document.getElementById('view-directories').classList.add('hidden');
  document.getElementById('view-items').classList.remove('hidden');

  // 제목 업데이트
  const titleEl = document.getElementById('current-folder-title');
  titleEl.textContent = dirName;

  // 데이터 로드
  currentDirId = dirName;
  await loadHistory(dirName);
};

// ---------------------------------------------------------
// 렌더링 로직
// ---------------------------------------------------------

async function loadDirectories() {
  try {
    // DB에서 실제 디렉토리 목록과 개수 로드
    const directories = await invoke('get_directories');
    const allItems = await invoke('get_clipboard_history');
    const dirs = [
      { name: 'All Items', count: allItems.length },
      ...directories
    ];

    const filteredDirs = dirs.filter(dir => dir.name !== 'All Items');
    renderDirectories(filteredDirs);

    // 첫 번째 디렉토리 자동 선택
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
    // 기존 디자인(.history-item)과 통일감을 주는 .dir-item 구조
    directoryHtml = dirs.map(dir => {
      const safeName = dir.name.replace(/'/g, "\\'");
      return `
        <div class="dir-item"
             onclick="showItemView('${safeName}')"
             onkeydown="if(event.key==='Enter') showItemView('${safeName}')"
             oncontextmenu="showContextMenu(event, '${safeName}')"
             tabindex="0">
          <span class="dir-name">${dir.name}</span>
          <span class="dir-count">${dir.count}</span>
        </div>
      `;
    }).join('');
  }

  const newFolderHtml = `
    <div class="dir-item btn-new-folder" onclick="createDirectoryPrompt(); event.stopPropagation();" onkeydown="if(event.key==='Enter') { createDirectoryPrompt(); event.stopPropagation(); }" tabindex="0" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); color: var(--text-sub);">
      <span class="dir-name" style="font-size: 14px;"> New Folder </span>
    </div>
  `;

  listDiv.innerHTML = directoryHtml + newFolderHtml;
}

async function loadHistory(dirName) {
  const listDiv = document.getElementById('history-list');
  listDiv.innerHTML = '<div style="padding:20px; color:#666; text-align:center;">Loading...</div>';

  try {
    // Rust 백엔드에서 실제 데이터 가져오기
    const allItems = await invoke('get_clipboard_history');

    // dirName이 'All Items'이면 모든 항목 표시, 아니면 필터링
    const items = dirName === 'All Items'
      ? allItems
      : allItems.filter(item => item.directory === dirName);

    // 비어있을 때
    if (items.length === 0) {
      listDiv.innerHTML = `<div class="empty-state">비어있음</div>`;
      return;
    }

    // 리스트 렌더링
    listDiv.innerHTML = items.map((item, index) => `
      <div class="history-item" onclick="selectItem(${index})" data-id="${item.id}">
        <div class="item-content">${escapeHtml(item.content.substring(0, 100))}</div>
        <div class="item-meta">#${item.id} · ${new Date(item.created_at).toLocaleDateString()}</div>
      </div>
    `).join('');

    // 첫 번째 아이템 자동 선택
    if (items.length > 0) {
      window.selectItem(0);
    }
  } catch (error) {
    console.error('Failed to load history:', error);
    listDiv.innerHTML = `<div class="empty-state">로드 실패</div>`;
  }
}

// 유틸리티 (기존 유지)
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.selectItem = function (index) {
  const all = document.querySelectorAll('.history-item');
  all.forEach(el => el.classList.remove('selected'));
  if (all[index]) all[index].classList.add('selected');

  // 선택한 항목의 내용을 클립보드에 복사하고 싶다면:
  // const selectedItem = all[index];
  // const content = selectedItem.querySelector('.item-content').textContent;
  // invoke('paste_text', { text: content });
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
      e.stopPropagation(); // 전역 키 이벤트 전파 방지
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
      e.stopPropagation(); // 전역 키 이벤트 전파 방지
      input.value = '';
      container.classList.add('hidden');
      if (btnNewFolder) btnNewFolder.classList.remove('hidden');
    }
  };
};

// 컨텍스트 메뉴 로직은 상단으로 이동됨

// 메뉴 밖 클릭 시 숨기기
window.addEventListener('click', () => {
  const menu = document.getElementById('context-menu');
  menu.classList.add('hidden');
});

window.addEventListener('contextmenu', (e) => {
  // 디렉토리가 아닌 곳에서 우클릭 시 메뉴 숨기기
  if (!e.target.closest('.dir-item')) {
    document.getElementById('context-menu').classList.add('hidden');
  }
});

// 하단에 있던 중복 및 인자 오류가 있던 리스너 제거



// 기존 script.js 코드 하단에 아래 키보드 이벤트 리스너 수정 및 추가

window.addEventListener('keydown', async (event) => {
  // 모달이 열려있으면 메인 키보드 이벤트 무시
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    if (invoke) await invoke('toggle_main_window');
    return;
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
        // 새 폴더 버튼인 경우 네비게이션 방지
        if (selectedDir.classList.contains('btn-new-folder')) {
          createDirectoryPrompt();
          return;
        }
        const dirName = selectedDir.querySelector('.dir-name').textContent;
        await window.showItemView(dirName);
      }
    }
  } else if (itemView) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      window.showDirectoryView();
      return;
    }

    const items = document.querySelectorAll('.history-item');
    if (items.length === 0) return;

    let selectedIndex = -1;
    items.forEach((item, index) => {
      if (item.classList.contains('selected')) selectedIndex = index;
    });

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
      if (selectedIndex >= 0) {
        const selectedItem = items[selectedIndex];
        const content = selectedItem.querySelector('.item-content').textContent;
        if (invoke) {
          try {
            await invoke('paste_text', { text: content });
            // 붙여넣기 후 창 숨기기
            await invoke('toggle_main_window');
          } catch (err) {
            console.error('Failed to paste text:', err);
          }
        }
      }
    }
  }
});

// 디렉토리 항목 선택 함수
function selectDirItem(index) {
  const dirs = document.querySelectorAll('.dir-item');
  if (dirs.length === 0) return;
  dirs.forEach(el => el.classList.remove('selected'));
  if (dirs[index]) {
    dirs[index].classList.add('selected');
    dirs[index].focus?.()
  }
}
