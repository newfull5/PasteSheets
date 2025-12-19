
let invoke = null;
let currentDirId = null;

// 1. 초기화
window.addEventListener('DOMContentLoaded', async () => {
  if (initTauri()) {
    await loadDirectories(); // 실제 DB에서 로드

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

  if (dirs.length === 0) {
    listDiv.innerHTML = '<div class="empty-state">디렉토리가 없습니다</div>';
    return;
  }

  // 기존 디자인(.history-item)과 통일감을 주는 .dir-item 구조
  listDiv.innerHTML = dirs.map(dir => `
    <div class="dir-item" onclick="showItemView('${dir.name}')">
      <span class="dir-name">${dir.name}</span>
      <span class="dir-count">${dir.count}</span>
    </div>
  `).join('');
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



// 기존 script.js 코드 하단에 아래 키보드 이벤트 리스너 수정 및 추가

window.addEventListener('keydown', async (event) => {
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
        const dirName = dirs[selectedIndex].querySelector('.dir-name').textContent;
        // 디렉토리 화면에서 엔터나 오른쪽 방향키를 누르면 안으로 들어가기만 함
        await window.showItemView(dirName);
      }
    }
  } else if (itemView) {
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
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      window.showDirectoryView();
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
