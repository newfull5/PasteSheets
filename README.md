# PasteSheets

**PasteSheets** is a premium clipboard manager designed for maximum productivity. Beyond simple history tracking, it empowers you to organize clipboard items into custom categories (folders) and instantly retrieve them using a powerful integrated search.

![PasteSheets Layout](https://img.shields.io/badge/UI-Glassmorphism-yellow) ![Tech](https://img.shields.io/badge/Tech-Tauri%20%7C%20Rust%20%7C%20JS-blue)

---

## ✨ Key Features

### 1. Intelligent Clipboard Monitoring
*   Real-time monitoring of clipboard changes in the background with automatic history recording.
*   Efficient duplicate management and reliable data storage using SQLite for large datasets.

### 2. Folder-Based Organization
*   Categorize clipboard items into thematic folders for structured management.
*   Easily rename, delete, and organize folders to build your personal knowledge base.

### 3. Advanced Integrated Search
*   **Instant Search**: Quickly find items by searching through folder names, text content, and custom memos simultaneously.
*   **Reveal in Folder**: Press `Enter` on a search result to jump directly to its original folder and see the context.

### 4. Seamless Accessibility
*   **Global Hotkey**: Call the app instantly from anywhere with a single shortcut.
*   **Mouse Edge Interaction**: Simply move your cursor to the right edge of the screen to reveal the app with a smooth slide-in animation.
*   **Full Keyboard Navigation**: Operate the entire app without a mouse using intuitive shortcuts (`⌘+Enter`, `ESC`, arrow keys, etc.).

### 5. Premium Aesthetics
*   **Neon & Dark Mode**: A high-contrast theme featuring neon yellow accents over a deep black background for eye comfort and style.
*   **Fluid Animations**: Smooth transitions and a Glassmorphism UI provide a top-tier user experience.

---

## 🛠 Tech Stack

- **Backend**: [Rust](https://www.rust-lang.org/), [Tauri](https://tauri.app/)
- **Frontend**: Vanilla HTML5, CSS3 (Custom Design System), JavaScript (ES6+)
- **Database**: SQLite (via `sqlx`)

---

## 🚀 Getting Started

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) installed
- Node.js & npm (for running Tauri CLI)

### Running Locally
```bash
# Install dependencies and start the development server
cargo tauri dev
```

### Build & Release
```bash
cargo tauri build
```

---

## ⌨️ Essential Shortcuts

- `Global Hotkey`: Toggle app visibility.
- `Arrow Up/Down`: Navigate through lists.
- `Arrow Right / Enter`: Enter a folder or execute the primary action (Paste) for a selected item.
- `Arrow Left`: Return to the previous view (Directory View).
- `⌘ + Enter` (or `Ctrl`): Save changes during editing.
- `ESC`: Clear search or hide the application window.

---

## 📄 License
This project is licensed under the [Apache-2.0 License](LICENSE).
