<script>
  import { onMount, tick } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";

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

  // --- 반응형 필터링 ---
  $: filteredDirectories = directories.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  $: filteredItems = historyItems.filter(
    (item) =>
      (item.content &&
        item.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.memo &&
        item.memo.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  $: if (searchQuery !== undefined) {
    selectedIndex = 0;
  }

  // --- 초기화 ---
  onMount(async () => {
    await listen("window-visible", (event) => {
      isVisible = event.payload;
      if (isVisible) {
        loadDirectories();
        if (currentView === "items") loadHistory();
      }
    });

    // 클립보드 갱신 리스너
    await listen("clipboard-updated", () => {
      loadDirectories();
      if (currentView === "items") loadHistory();
    });

    loadDirectories();
  });

  async function loadDirectories() {
    try {
      directories = await invoke("get_directories");
    } catch (err) {
      console.error("Failed to load directories:", err);
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
    try {
      historyItems = await invoke("get_clipboard_history");
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }

  function showDirectoryView() {
    currentView = "directories";
    searchQuery = "";
    selectedIndex = 0;
    loadDirectories();
  }

  // --- 액션 핸들러 ---
  async function useItem(item) {
    try {
      await invoke("toggle_main_window");
      setTimeout(async () => {
        await invoke("paste_text", { text: item.content });
      }, 50);
    } catch (err) {
      console.error("Failed to paste text:", err);
    }
  }

  async function createFolder() {
    const name = prompt("New folder name:");
    if (!name) return;
    try {
      await invoke("create_directory", { name });
      await loadDirectories();
    } catch (err) {
      alert("Failed to create folder: " + err);
    }
  }

  async function deleteDirectory(name) {
    if (!confirm(`Delete folder "${name}"? All items inside will be lost.`))
      return;
    try {
      await invoke("delete_directory", { name });
      await loadDirectories();
    } catch (err) {
      alert("Failed to delete folder: " + err);
    }
  }

  async function renameDirectory(oldName) {
    const newName = prompt("Enter new folder name:", oldName);
    if (!newName || newName === oldName) return;
    try {
      await invoke("rename_directory", { oldName, newName });
      await loadDirectories();
    } catch (err) {
      alert("Failed to rename folder: " + err);
    }
  }

  function startEdit(item) {
    editingId = item.id;
    editContent = item.content;
    editMemo = item.memo || "";
  }

  async function saveEdit(item) {
    try {
      await invoke("update_history_item", {
        id: item.id,
        content: editContent,
        directory: currentDirId,
        memo: editMemo || null,
      });
      editingId = null;
      await loadHistory();
    } catch (err) {
      console.error("Failed to update item:", err);
    }
  }

  async function deleteItem(id) {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await invoke("delete_history_item", { id });
      await loadHistory();
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  }

  // --- 키보드 핸들링 ---
  function handleKeyDown(event) {
    if (editingId !== null) return; // 편집 중일 때는 글로벌 키 바인딩 무시

    const listCount =
      currentView === "directories"
        ? filteredDirectories.length
        : filteredItems.length;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex = (selectedIndex + 1) % listCount;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex = (selectedIndex - 1 + listCount) % listCount;
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (currentView === "directories" && filteredDirectories[selectedIndex]) {
        showItemView(filteredDirectories[selectedIndex].name);
      } else if (currentView === "items" && filteredItems[selectedIndex]) {
        useItem(filteredItems[selectedIndex]);
      }
    } else if (event.key === "Escape") {
      if (searchQuery) {
        searchQuery = "";
      } else if (currentView === "items") {
        showDirectoryView();
      } else {
        invoke("toggle_main_window");
      }
    } else if (event.key === "ArrowLeft" && currentView === "items") {
      showDirectoryView();
    } else if (event.key === "ArrowRight" && currentView === "directories") {
      if (filteredDirectories[selectedIndex]) {
        showItemView(filteredDirectories[selectedIndex].name);
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="container" class:visible={isVisible}>
  {#if currentView === "directories"}
    <div id="view-directories" class="view-page">
      <header class="app-header">
        <div class="header-title-container">
          <h1 style="opacity: {searchQuery ? 0 : 1}">PasteSheet</h1>
          <input
            type="text"
            class="header-search"
            class:active={searchQuery}
            placeholder="Search Anything..."
            bind:value={searchQuery}
            spellcheck="false"
          />
        </div>
      </header>

      <div class="content-list">
        {#each filteredDirectories as dir, i}
          <div
            class="dir-item"
            class:selected={selectedIndex === i}
            on:click={() => (selectedIndex = i)}
            on:dblclick={() => showItemView(dir.name)}
          >
            <div class="item-body">
              <div
                style="display: flex; justify-content: space-between; align-items: center; width: 100%;"
              >
                <span class="dir-name">{dir.name}</span>
                <span class="dir-count">{dir.count}</span>
              </div>

              {#if selectedIndex === i}
                <div class="item-actions">
                  <button
                    class="btn-mini primary"
                    on:click={() => showItemView(dir.name)}>Open</button
                  >
                  <button
                    class="btn-mini"
                    on:click={() => renameDirectory(dir.name)}>Rename</button
                  >
                  <button
                    class="btn-mini danger"
                    on:click={() => deleteDirectory(dir.name)}>Delete</button
                  >
                </div>
              {/if}
            </div>
          </div>
        {/each}

        <div class="dir-item btn-new-folder" on:click={createFolder}>
          <span class="dir-name">Create New Folder</span>
        </div>

        {#if filteredDirectories.length === 0 && searchQuery}
          <div class="empty-state">No matching folders found</div>
        {/if}
      </div>
    </div>
  {:else}
    <div id="view-items" class="view-page">
      <header class="app-header header-row">
        <div class="header-left">
          <button class="btn-back" on:click={showDirectoryView}>◀</button>
          <div class="header-title-container" style="margin-left: 5px;">
            <h1 class="view-folder" style="opacity: {searchQuery ? 0 : 1}">
              {currentDirId}
            </h1>
            <input
              type="text"
              class="header-search"
              class:active={searchQuery}
              placeholder="Search Items..."
              bind:value={searchQuery}
              spellcheck="false"
            />
          </div>
        </div>
      </header>

      <div class="content-list">
        {#each filteredItems as item, i}
          <div
            class="history-item"
            class:selected={selectedIndex === i}
            class:editing={editingId === item.id}
          >
            <div class="item-body" on:click={() => (selectedIndex = i)}>
              {#if editingId === item.id}
                <input
                  class="memo-area"
                  bind:value={editMemo}
                  placeholder="Memo (Optional)"
                />
                <textarea class="edit-area" bind:value={editContent}></textarea>
                <div class="item-actions">
                  <button
                    class="btn-mini primary"
                    on:click={() => saveEdit(item)}>Save</button
                  >
                  <button class="btn-mini" on:click={() => (editingId = null)}
                    >Cancel</button
                  >
                </div>
              {:else}
                {#if item.memo}
                  <div class="item-memo">{item.memo}</div>
                {/if}
                <div class="item-content">{item.content}</div>

                {#if selectedIndex === i}
                  <div class="item-actions">
                    <button
                      class="btn-mini primary"
                      on:click={() => useItem(item)}>Paste</button
                    >
                    <button class="btn-mini" on:click={() => startEdit(item)}
                      >Edit</button
                    >
                    <button
                      class="btn-mini danger"
                      on:click={() => deleteItem(item.id)}>Delete</button
                    >
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {/each}
        {#if filteredItems.length === 0}
          <div class="empty-state">No items found in this folder</div>
        {/if}
      </div>
    </div>
  {/if}
</div>
