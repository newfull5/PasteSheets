<script>
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { fly } from "svelte/transition";
  import DirectoryView from "./lib/DirectoryView.svelte";
  import ItemView from "./lib/ItemView.svelte";
  import SearchView from "./lib/SearchView.svelte";
  import Header from "./lib/Header.svelte";
  import Modal from "./lib/Modal.svelte";
  import DetailModal from "./lib/DetailModal.svelte";

  // --- 상태 관리 ---
  let isVisible = false;
  let currentView = "directories";
  let directories = [];
  let historyItems = [];
  let currentDirId = "";
  let searchQuery = "";
  let selectedIndex = 0;

  // 편집 상태
  let editingId = null;
  let editContent = "";
  let editMemo = "";

  // 모달 상태
  let modalConfig = {
    show: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    isDanger: false,
    showInput: false,
    inputValue: "",
    onConfirm: (val) => {},
  };

  function openModal(config) {
    modalConfig = {
      show: true,
      title: "Confirm",
      message: "",
      confirmText: "Confirm",
      cancelText: "Cancel",
      isDanger: false,
      showInput: false,
      inputValue: "",
      onConfirm: (val) => {},
      ...config,
    };
  }

  function closeModal() {
    modalConfig.show = false;
  }

  function handleModalConfirm(event) {
    if (modalConfig.onConfirm) {
      modalConfig.onConfirm(event.detail);
    }
    closeModal();
  }

  // 상세 보기 상태
  let detailItem = null;

  function handleView(item) {
    if (item) {
      detailItem = item;
    }
  }

  function closeDetail() {
    detailItem = null;
  }

  let isLoading = false;

  // 필터링된 리스트 (반응형)
  $: filteredDirectories = directories.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  $: filteredItems = historyItems.filter(
    (item) =>
      item.directory === currentDirId &&
      ((item.content &&
        item.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.memo &&
          item.memo.toLowerCase().includes(searchQuery.toLowerCase()))),
  );

  $: globalFilteredItems = historyItems.filter(
    (item) =>
      (item.content &&
        item.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.memo &&
        item.memo.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  // Clamping selectedIndex
  $: {
    let listCount = 0;
    if (searchQuery) {
      listCount = filteredDirectories.length + globalFilteredItems.length;
    } else if (currentView === "directories") {
      listCount = filteredDirectories.length + 1; // +1 for New Folder
    } else {
      listCount = filteredItems.length + 1; // +1 for New Item
    }

    if (selectedIndex >= listCount && listCount > 0) {
      selectedIndex = listCount - 1;
    } else if (listCount === 0) {
      selectedIndex = 0;
    }
  }

  // Focus action buttons when selectedIndex changes in items view
  $: if (
    currentView === "items" &&
    itemView &&
    !searchQuery &&
    selectedIndex !== undefined
  ) {
    // We can't directly call it here because itemView might not have rendered the new history items yet
    // but the binding will handle the visual primary state.
    // We just need to make sure itemView knows focus should be on index 0
  }

  // --- 초기화 ---
  onMount(async () => {
    await listen("window-visible", async (event) => {
      isVisible = event.payload;
      if (isVisible) {
        await loadDirectories();
        await loadHistory(); // 모든 히스토리 미리 로드
      }
    });

    // 클립보드 갱신 리스너
    await listen("clipboard-updated", async () => {
      await loadDirectories();
      await loadHistory(); // 항상 전체 히스토리 갱신
    });

    await loadDirectories();
    await loadHistory(); // 초기 로드 시에도 전체 히스토리 로드
  });

  async function loadDirectories() {
    isLoading = true;
    try {
      directories = await invoke("get_directories");
    } catch (err) {
      console.error("Failed to load directories:", err);
    } finally {
      isLoading = false;
    }
  }

  async function showItemView(dirName) {
    currentDirId = dirName;
    currentView = "items";
    searchQuery = "";
    selectedIndex = 0;
    await loadHistory();
  }

  async function loadHistory() {
    isLoading = true;
    try {
      historyItems = await invoke("get_clipboard_history");
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      isLoading = false;
    }
  }

  async function showDirectoryView() {
    const lastActiveDir = currentDirId;
    currentView = "directories";
    searchQuery = "";

    // Try to restore selection immediately
    if (lastActiveDir) {
      const idx = directories.findIndex((d) => d.name === lastActiveDir);
      if (idx !== -1) selectedIndex = idx;
      else selectedIndex = 0;
    } else {
      selectedIndex = 0;
    }

    await loadDirectories();

    // Re-verify selection after loading to ensure it's still valid
    if (lastActiveDir) {
      const idx = directories.findIndex((d) => d.name === lastActiveDir);
      if (idx !== -1) selectedIndex = idx;
    }
  }

  // --- 액션 핸들러 ---
  async function useItem(item) {
    if (!item) return;
    try {
      await invoke("toggle_main_window");
      setTimeout(async () => {
        await invoke("paste_text", { text: item.content });
      }, 50);
    } catch (err) {
      console.error("Failed to paste text:", err);
    }
  }

  async function createFolder(event) {
    const name = event.detail;
    if (!name) return;
    try {
      await invoke("create_directory", { name });
      await loadDirectories();
    } catch (err) {
      console.error("Failed to create folder:", err);
    }
  }

  function deleteDirectory(name) {
    openModal({
      title: "Delete Folder",
      message: `Are you sure you want to delete folder "${name}"? All items inside will be lost.`,
      isDanger: true,
      confirmText: "Delete",
      onConfirm: async () => {
        try {
          await invoke("delete_directory", { name });
          await loadDirectories();
        } catch (err) {
          console.error("Failed to delete folder:", err);
        }
      },
    });
  }

  function renameDirectory(oldName) {
    openModal({
      title: "Rename Folder",
      message: "Enter new name for the folder:",
      showInput: true,
      inputValue: oldName,
      confirmText: "Rename",
      onConfirm: async (newName) => {
        if (!newName || newName === oldName) return;
        try {
          await invoke("rename_directory", { oldName, newName });
          await loadDirectories();
        } catch (err) {
          console.error("Failed to rename folder:", err);
        }
      },
    });
  }

  function startEdit(item) {
    if (!item) return;
    editingId = item.id;
    editContent = item.content;
    editMemo = item.memo || "";
    if (item.directory) currentDirId = item.directory;
  }

  async function saveEdit() {
    try {
      await invoke("update_history_item", {
        id: editingId,
        content: editContent,
        directory: currentDirId,
        memo: editMemo || null,
      });
      editingId = null;
      await loadHistory();
      await loadDirectories();
    } catch (err) {
      console.error("Failed to update item:", err);
    }
  }

  async function createItem(event) {
    const { content, memo } = event.detail;
    if (!content) return;
    try {
      await invoke("create_history_item", {
        content,
        directory: currentDirId,
        memo,
      });
      await loadHistory();
      await loadDirectories();
    } catch (err) {
      console.error("Failed to create item:", err);
    }
  }

  function deleteItem(id) {
    openModal({
      title: "Delete Item",
      message: "Are you sure you want to delete this item?",
      isDanger: true,
      confirmText: "Delete",
      onConfirm: async () => {
        try {
          await invoke("delete_history_item", { id });
          await loadHistory();
          await loadDirectories();
        } catch (err) {
          console.error("Failed to delete item:", err);
        }
      },
    });
  }

  let directoryView;
  let itemView;
  let searchView;
  let header;

  // --- 키보드 핸들링 ---
  function handleKeyDown(event) {
    const isInput =
      event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA";
    const isSearchInput = event.target.classList.contains("header-search");

    // 1. 글로벌 Escape 핸들링
    if (event.key === "Escape") {
      if (modalConfig.show) {
        closeModal();
        return;
      }
      if (detailItem !== null) {
        detailItem = null;
        return;
      }
      if (editingId !== null) {
        editingId = null;
        return;
      }
      // 검색창에 포커스가 있거나 검색어가 있으면 먼저 처리
      if (isSearchInput || searchQuery) {
        searchQuery = "";
        if (isSearchInput) {
          event.target.blur(); // 포커스 해제
        }
        return;
      }
      // 모든 상태가 클리어되면 창 닫기
      invoke("toggle_main_window");
      return;
    }

    // 2. 모달이 열려있을 때 Enter 처리
    if (modalConfig.show) {
      // input/textarea에서는 키 입력 허용
      if (isInput) {
        if (event.key === "Enter") {
          event.preventDefault();
          // Modal component handles Enter for input
          return;
        }
        // input/textarea에서는 다른 키 입력 허용
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        // Modal component already listens for Enter and dispatches 'confirm'
        // But App.svelte's global listener might run first or interfere.
        // We'll let Modal.svelte handle it, but we MUST prevent other global actions.
        return;
      }
      // 블락: 모달이 떠있을 때는 모든 키 입력을 차단 (Tab, 방향키 포함)
      // 단, input/textarea는 위에서 이미 처리됨
      event.preventDefault();
      return;
    }

    // 3. 디테일 뷰가 열려있을 때 방향키/엔터 등 차단
    if (detailItem !== null && event.key !== "Escape") {
      return;
    }

    // 2. 인라인 편집 중 특수 키 (Cmd+Enter 저장 등)
    if (editingId !== null && isInput) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        saveEdit();
        return;
      }
    }

    // 3. 입력창 포커스가 아닐 때 검색창 자동 포커스
    if (!isInput && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (event.key.length === 1 || event.key === "Backspace") {
        if (header) header.focusSearch();
      }
    }

    // 4. 리스트 네비게이션 (검색창에서도 위/아래는 작동)
    let listCount = 0;
    if (searchQuery) {
      listCount = filteredDirectories.length + globalFilteredItems.length;
    } else if (currentView === "directories") {
      listCount = filteredDirectories.length + 1;
    } else {
      listCount = filteredItems.length + 1;
    }
    const isSpecialKey = event.metaKey || event.ctrlKey;

    if (!isInput || isSearchInput) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (listCount > 0) {
          selectedIndex = (selectedIndex + 1) % listCount;
        }
        return;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (listCount > 0) {
          selectedIndex = (selectedIndex - 1 + listCount) % listCount;
        }
        return;
      } else if (
        searchQuery &&
        !isSearchInput && // 검색창에 포커스가 없을 때만 버튼 네비게이션
        (event.key === "ArrowRight" || event.key === "ArrowLeft")
      ) {
        event.preventDefault();
        if (searchView) searchView.handleArrowKey(event.key);
        return;
      } else if (
        !searchQuery &&
        (event.key === "ArrowRight" || event.key === "ArrowLeft")
      ) {
        // 검색어가 없을 때 방향키로 디렉토리 진입/나가기
        if (event.key === "ArrowRight") {
          if (currentView === "directories") {
            const dir = filteredDirectories[selectedIndex];
            if (dir) {
              event.preventDefault();
              showItemView(dir.name);
              if (isSearchInput) event.target.blur();
            }
          }
        } else if (event.key === "ArrowLeft") {
          if (currentView === "items") {
            event.preventDefault();
            showDirectoryView();
            if (isSearchInput) event.target.blur();
          }
        }
        return;
      }
    }

    // 5. 검색창에서 Enter 누르면 선택된 아이템 실행
    if (isSearchInput && event.key === "Enter") {
      event.preventDefault();
      if (searchQuery) {
        if (searchView) searchView.executeSelectedAction();
      } else if (currentView === "directories") {
        const filtered = filteredDirectories;
        if (selectedIndex < filtered.length) {
          showItemView(filtered[selectedIndex].name);
        }
      } else if (currentView === "items" && itemView) {
        itemView.executeSelectedAction();
      }
      return;
    }

    if (isInput) return;

    // 6. 액션 (Non-Input 상태)
    const activeFiltered = searchQuery
      ? [...filteredDirectories, ...globalFilteredItems]
      : currentView === "directories"
        ? filteredDirectories
        : filteredItems;

    if (event.key === "Backspace" && isSpecialKey) {
      event.preventDefault();
      // 삭제 (Cmd+Backspace)
      if (activeFiltered[selectedIndex]) {
        if (searchQuery) {
          if (selectedIndex < filteredDirectories.length) {
            deleteDirectory(activeFiltered[selectedIndex].name);
          } else {
            deleteItem(activeFiltered[selectedIndex].id);
          }
        } else if (currentView === "directories") {
          deleteDirectory(activeFiltered[selectedIndex].name);
        } else {
          deleteItem(activeFiltered[selectedIndex].id);
        }
      }
    } else if (event.key === " " && currentView === "items" && !searchQuery) {
      event.preventDefault();
      if (activeFiltered[selectedIndex])
        handleView(activeFiltered[selectedIndex]);
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div
  class="w-full h-full max-h-screen bg-bg-container rounded-l-[16px] border-l border-t border-b border-white/10 flex flex-col overflow-hidden relative shadow-[-4px_0_15px_rgba(0,0,0,0.5)] transition-[var(--transition-app-container)] {isVisible
    ? 'opacity-100 translate-x-0'
    : 'opacity-0 translate-x-[60px] pointer-events-none'} {modalConfig.show ||
  detailItem !== null
    ? 'pointer-events-none'
    : 'pointer-events-auto'}"
>
  <div class="p-4 flex flex-col h-full">
    <Header
      bind:this={header}
      title={searchQuery
        ? "Search results"
        : currentView === "directories"
          ? "PasteSheet"
          : currentDirId}
      showBack={currentView === "items" && !searchQuery}
      bind:searchQuery
      on:back={showDirectoryView}
    />

    <div class="flex-1 overflow-hidden relative">
      {#if searchQuery}
        <div class="absolute inset-0" transition:fly={{ y: 10, duration: 150 }}>
          <SearchView
            bind:this={searchView}
            {filteredDirectories}
            filteredItems={globalFilteredItems}
            bind:selectedIndex
            bind:editingId
            bind:editContent
            bind:editMemo
            on:openFolder={(e) => showItemView(e.detail)}
            on:paste={(e) => useItem(e.detail)}
            on:edit={(e) => startEdit(e.detail)}
            on:delete={(e) => deleteItem(e.detail)}
            on:save={saveEdit}
            on:cancel={() => (editingId = null)}
            on:view={(e) => handleView(e.detail)}
          />
        </div>
      {:else if currentView === "directories"}
        <div
          class="absolute inset-0"
          transition:fly={{ x: -10, duration: 150 }}
        >
          <DirectoryView
            bind:this={directoryView}
            directories={filteredDirectories}
            bind:selectedIndex
            on:open={(e) => showItemView(e.detail)}
            on:rename={(e) => renameDirectory(e.detail)}
            on:delete={(e) => deleteDirectory(e.detail)}
            on:create={createFolder}
          />
        </div>
      {:else}
        <div class="absolute inset-0">
          <ItemView
            bind:this={itemView}
            historyItems={filteredItems}
            bind:selectedIndex
            bind:editingId
            bind:editContent
            bind:editMemo
            on:back={showDirectoryView}
            on:paste={(e) => useItem(e.detail)}
            on:edit={(e) => startEdit(e.detail)}
            on:delete={(e) => deleteItem(e.detail)}
            on:save={saveEdit}
            on:cancel={() => (editingId = null)}
            on:create={createItem}
            on:view={(e) => handleView(e.detail)}
          />
        </div>
      {/if}
    </div>
  </div>
</div>

<Modal
  show={modalConfig.show}
  title={modalConfig.title}
  message={modalConfig.message}
  confirmText={modalConfig.confirmText}
  cancelText={modalConfig.cancelText}
  isDanger={modalConfig.isDanger}
  showInput={modalConfig.showInput}
  bind:inputValue={modalConfig.inputValue}
  on:confirm={handleModalConfirm}
  on:cancel={closeModal}
/>

<DetailModal
  show={detailItem !== null}
  content={detailItem ? detailItem.content : ""}
  on:close={closeDetail}
/>
