<script>
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";
  import Button from "./ui/Button.svelte";

  export let show = false;
  export let content = "";
  export let title = "Detail View";

  const dispatch = createEventDispatcher();

  function handleClose() {
    dispatch("close");
  }

  function handleCopy() {
    // navigator.clipboard.writeText(content); // Browser API might not work in Tauri context without permission or correct focus
    // Instead emit copy event to parent which uses backend specific logic if needed,
    // but for simple text copy standard API often works.
    // Let's rely on parent to handle 'copy' or just try standard API.
    // For now, let's just emit 'copy' and let parent handle it via backend invoke if needed, or just do it here.
    // Actually, `invoke("paste_text")` is what we use for "Paste to formatting", but for "Copy to Clipboard",
    // we might need a backend command or just try navigator.clipboard.

    // Attempt standard copy first
    navigator.clipboard
      .writeText(content)
      .then(() => {
        dispatch("copy");
      })
      .catch((err) => {
        console.error("Failed to copy", err);
        dispatch("copy"); // Still dispatch so parent can try fallback if we implement it
      });
  }

  function handleKeydown(event) {
    if (!show) return;
    if (event.key === "Escape") {
      handleClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
    on:click={handleClose}
    on:keydown={(e) => e.key === "Escape" && handleClose()}
    role="button"
    tabindex="-1"
    aria-modal="true"
  >
    <div
      class="bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl w-[90%] max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
      transition:scale={{ duration: 200, start: 0.95 }}
      on:click|stopPropagation={() => {}}
      on:keydown|stopPropagation={() => {}}
      role="document"
      tabindex="-1"
    >
      <div
        class="flex items-center justify-between p-4 border-b border-white/10 bg-white/5"
      >
        <h2 class="text-lg font-bold text-text-main truncate">{title}</h2>
        <div class="flex gap-2">
          <Button size="sm" variant="primary" on:click={handleCopy}>Copy</Button
          >
          <Button size="sm" variant="secondary" on:click={handleClose}
            >Close</Button
          >
        </div>
      </div>

      <div class="flex-1 p-6 overflow-y-auto bg-[#1a1a1a]">
        <pre
          class="text-text-sub text-sm font-mono whitespace-pre-wrap break-words leading-relaxed">{content}</pre>
      </div>
    </div>
  </div>
{/if}
