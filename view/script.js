
let invoke = null;
let currentDirId = null;

// 1. 초기화
window.addEventListener('DOMContentLoaded', async () => {
  if (initTauri()) {
    await loadDirectories(); // 실제 DB에서 로드
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

    // "All Items" 추가 (모든 아이템)
    const allItems = await invoke('get_clipboard_history');
    const dirs = [
      { name: 'All Items', count: allItems.length },
      ...directories
    ];

    renderDirectories(dirs);
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
