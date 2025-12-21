<script>
  import { createEventDispatcher } from "svelte";
  import { flip } from "svelte/animate";
  import { fly } from "svelte/transition";
  import HistoryItem from "./HistoryItem.svelte";
  import Button from "./ui/Button.svelte";
  import Input from "./ui/Input.svelte";

  export let historyItems = [];
  export let selectedIndex = 0;
  export let editingId = null;
  export let editContent = "";
  export let editMemo = "";

  const dispatch = createEventDispatcher();

  let itemRefs = [];
  let buttonFocusIndex = 0; // Default to first action (Paste)

  $: filteredItems = historyItems;

  let isCreating = false;
  let newItemMemo = "";
  let newItemContent = "";

  let lastSelectedIndex = -1;
  $: if (selectedIndex !== undefined && selectedIndex !== lastSelectedIndex) {
    // Only reset button focus when moving to a DIFFERENT item
    buttonFocusIndex = 0;
    lastSelectedIndex = selectedIndex;
  }

  function handleBack() {
    dispatch("back");
  }

  function handleSelect(index) {
    if (selectedIndex === index) return; // Ignore if already selected
    selectedIndex = index;
    dispatch("select", index);
  }

  function handlePaste(event) {
    dispatch("paste", event.detail);
  }

  function handleEdit(event) {
    dispatch("edit", event.detail);
  }

  function handleDelete(event) {
    dispatch("delete", event.detail);
  }

  function handleSave() {
    dispatch("save");
  }

  function handleCancel() {
    dispatch("cancel");
  }

  function handleCreate() {
    isCreating = true;
  }

  function handleSaveCreate() {
    const content = newItemContent.trim();
    if (content) {
      dispatch("create", { content, memo: newItemMemo.trim() || null });
    }
    cancelCreate();
  }

  function cancelCreate() {
    isCreating = false;
    newItemMemo = "";
    newItemContent = "";
  }

  function autofocus(node) {
    node.focus();
  }

  function scrollSelected(node, selected) {
    if (selected) {
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    return {
      update(newSelected) {
        if (newSelected) {
          node.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      },
    };
  }

  export function executeSelectedAction() {
    if (selectedIndex === filteredItems.length) {
      handleCreate();
    } else if (filteredItems[selectedIndex]) {
      const item = filteredItems[selectedIndex];
      if (buttonFocusIndex === 0) {
        dispatch("paste", item);
      } else if (buttonFocusIndex === 1) {
        dispatch("edit", item);
      } else if (buttonFocusIndex === 2) {
        dispatch("delete", item.id);
      }
    }
  }

  function handleKeyDown(e) {
    if (editingId !== null || isCreating) return;

    const isInput =
      e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";
    const isSearchInput = e.target.classList.contains("header-search");

    if (e.key === "ArrowRight") {
      // Only allow ArrowRight if not in an input, OR if in search input (we handle navigation there)
      if (isInput && !isSearchInput) return;
      e.preventDefault();
      if (buttonFocusIndex < 2) {
        buttonFocusIndex++;
        if (itemRefs[selectedIndex]) {
          itemRefs[selectedIndex].focusButton(buttonFocusIndex);
        }
      }
    } else if (e.key === "ArrowLeft") {
      if (isInput && !isSearchInput) return;
      e.preventDefault();
      if (buttonFocusIndex > 0) {
        buttonFocusIndex--;
        if (itemRefs[selectedIndex])
          itemRefs[selectedIndex].focusButton(buttonFocusIndex);
      } else {
        dispatch("back");
      }
    } else if (e.key === "Enter") {
      // If we are in search input, App.svelte handles Enter
      if (isSearchInput) return;
      e.preventDefault();
      executeSelectedAction();
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div id="view-items" class="view-page">
  <div class="content-list">
    {#each filteredItems as item, i (item.id)}
      <div
        animate:flip={{ duration: 300 }}
        transition:fly={{ y: 20, duration: 200 }}
        use:scrollSelected={selectedIndex === i}
      >
        <HistoryItem
          bind:this={itemRefs[i]}
          {item}
          isSelected={selectedIndex === i}
          activeButtonIndex={selectedIndex === i ? buttonFocusIndex : -1}
          isEditing={editingId === item.id}
          bind:editContent
          bind:editMemo
          on:select={() => handleSelect(i)}
          on:paste={handlePaste}
          on:edit={handleEdit}
          on:delete={handleDelete}
          on:save={handleSave}
          on:cancel={handleCancel}
          on:view={() => dispatch("view", item)}
        />
      </div>
    {/each}

    <div
      role="button"
      tabindex="0"
      class="btn-new accent-text {selectedIndex === filteredItems.length
        ? 'selected'
        : ''} {isCreating ? 'active' : ''}"
      use:scrollSelected={selectedIndex === filteredItems.length}
      on:click={handleCreate}
    >
      {#if isCreating}
        <div class="item-body" style="width: 100%;">
          <input
            type="text"
            class="inline-memo"
            placeholder="Memo (Optional)..."
            bind:value={newItemMemo}
            use:autofocus
            on:keydown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                const contentArea = e.target.nextElementSibling;
                if (contentArea) contentArea.focus();
              } else if (e.key === "Escape") {
                cancelCreate();
              }
            }}
          />
          <textarea
            class="inline-content"
            placeholder="Content (⌘+Enter to save)..."
            bind:value={newItemContent}
            on:keydown={(e) => {
              e.stopPropagation();
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSaveCreate();
              } else if (e.key === "Escape") {
                cancelCreate();
              }
            }}
          ></textarea>
          <div class="inline-actions">
            <Button
              variant="primary"
              size="sm"
              on:click={(e) => {
                e.stopPropagation();
                handleSaveCreate();
              }}>Save</Button
            >
            <Button
              variant="secondary"
              size="sm"
              on:click={(e) => {
                e.stopPropagation();
                cancelCreate();
              }}>Cancel</Button
            >
          </div>
        </div>
      {:else}
        <span>New Item</span>
      {/if}
    </div>

    {#if filteredItems.length === 0}
      <div class="empty-state">No items found in this folder</div>
    {/if}
  </div>
</div>

<style>
  .view-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(5px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .app-header {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: 20px;
    min-height: 40px;
    flex-shrink: 0;
  }

  .header-row {
    width: 100%;
  }

  .header-left {
    display: flex;
    align-items: center;
    flex: 1;
    overflow: hidden;
  }

  .header-title-container {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
  }

  h1 {
    color: var(--color-accent);
    font-size: 22px;
    font-weight: 500;
    letter-spacing: 0.03em;
    margin: 0;
    padding-left: 8px;
    pointer-events: none;
    transition: opacity 0.2s ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  h1.view-folder {
    font-size: 18px;
    opacity: 0.9;
  }

  h1::after {
    content: "|";
    color: var(--color-accent);
    animation: blink 1s step-end infinite;
    margin-left: 2px;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  :global(.header-search) {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    background: transparent !important;
    border: none !important;
    color: var(--color-accent) !important;
    font-size: 22px !important;
    font-weight: 500 !important;
    letter-spacing: 0.03em !important;
    outline: none !important;
    padding: 0 0 0 8px !important;
    margin: 0 !important;
    opacity: 0 !important;
    transition: opacity 0.2s ease !important;
  }

  :global(.header-search.active),
  :global(.header-search:focus) {
    opacity: 1 !important;
  }

  #view-items :global(.header-search) {
    font-size: 18px !important;
  }

  .btn-back {
    background: transparent;
    border: none;
    font-size: 16px;
    color: var(--color-accent);
    padding: 4px 8px;
    margin-right: 4px;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .btn-back:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .content-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    padding-right: 2px;
    flex: 1;
  }

  .content-list::-webkit-scrollbar {
    width: 6px;
  }

  .content-list::-webkit-scrollbar-thumb {
    background: rgba(220, 220, 87, 0.2);
    border-radius: 10px;
  }

  .content-list::-webkit-scrollbar-thumb:hover {
    background: rgba(220, 220, 87, 0.4);
  }

  .empty-state {
    color: var(--color-text-sub);
    text-align: center;
    padding: 40px 0;
    font-size: 14px;
  }
</style>
