let invoke;
let selectedIndex = -1;

function initTauri() {
  if (window.__TAURI__ && window.__TAURI__.core) {
    invoke = window.__TAURI__.core.invoke;
    return true;
  }
  return false;
}

async function loadHistory() {
  if (!invoke) {
    console.error('❌ Tauri API가 초기화되지 않았습니다');
    document.getElementById('history-list').innerHTML = `
            <div class="empty-state">
                <h3>❌ Tauri API 오류</h3>
                <p>Tauri 환경에서 실행해주세요</p>
            </div>
        `;
    return;
  }

  try {
    const history = await invoke('get_clipboard_history');
    console.log('📋 히스토리:', history);
    displayHistory(history);
    selectedIndex = -1;
  } catch (error) {
    console.error('❌ 히스토리 로드 실패:', error);
  }
}

function displayHistory(items) {
  const listDiv = document.getElementById('history-list');
  const countDiv = document.getElementById('count');

  countDiv.textContent = `총 ${items.length}개의 항목`;

  if (items.length === 0) {
    listDiv.innerHTML = `
            <div class="empty-state">
                <h3>📭 히스토리가 비어있습니다</h3>
                <p>텍스트를 복사하면 자동으로 저장됩니다</p>
            </div>
        `;
    return;
  }

  listDiv.innerHTML = items.map((content, index) => `
    <div class="history-item" onclick="selectItem(${index})">
      <div class="item-content">${escapeHtml(content)}</div>
      <div class="item-meta">
        <span class="item-index">#${items.length - index}</span>
        <span>클릭하여 복사</span>
      </div>
    </div>
  `).join('');
}

function selectItem(index) {
  selectedIndex = index;
  updateSelection();
}

function updateSelection() {
  const items = document.querySelectorAll('.history-item');

  items.forEach(item => item.classList.remove('selected'))

  if (selectedIndex >= 0 && selectedIndex < items.length) {
    items[selectedIndex].classList.add('selected');
    items[selectedIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest'});
  }
}

async function copyToClipboard(text, index) {
  try {
    await navigator.clipboard.writeText(text);
    console.log('✅ 복사됨:', text.substring(0, 50));

    const items = document.querySelectorAll('.history-item');
    if (items[index]) {
      items[index].style.background = '#d4edda';
      setTimeout(() => {
        items[index].style.background = '';
      }, 300);
    }
  } catch (error) {
    console.error('❌ 복사 실패:', error);
    alert('복사에 실패했습니다');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function clearAll() {
  if (confirm('정말 모든 히스토리를 삭제하시겠습니까?')) {
    alert('삭제 기능은 아직 구현되지 않았습니다');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 PasteSheet 시작!');

  if (!initTauri()) {
    console.error('❌ Tauri API를 찾을 수 없습니다');
    document.getElementById('count').textContent = 'Tauri 환경 필요';
    return;
  }

  loadHistory();
  setInterval(loadHistory, 3000);
});

window.addEventListener('keydown', (event) => {
  if (document.hasFocus()) {
    const items = document.querySelectorAll('.history-item');
    const totalItems = items.length;

    switch (event.key) {
      case 'ArrowUp':
        console.log('ArrowUp');
        event.preventDefault();
        if (totalItems > 0) {
          selectedIndex = selectedIndex <= 0 ? totalItems - 1 : selectedIndex - 1;
          updateSelection();
        }
        break;

      case 'ArrowDown':
        console.log('ArrowDown pressed');
        break;
      case 'ArrowLeft':
        console.log('ArrowLeft pressed');
        break;
      case 'ArrowRight':
        console.log('ArrowRight pressed');
        break;
      case 'Enter':
        console.log('Enter pressed');
        break;
      default:
        break;
    }
  }
});
