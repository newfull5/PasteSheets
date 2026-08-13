import Foundation

final class ClipboardMonitorUseCase {
    private let itemRepo: PasteItemRepository
    private let clipboardService: ClipboardService
    private var timer: Timer?
    private var lastChangeCount: Int = 0

    init(itemRepo: PasteItemRepository, clipboardService: ClipboardService) {
        self.itemRepo = itemRepo
        self.clipboardService = clipboardService
    }

    func startMonitoring(onChange: @escaping () -> Void) {
        lastChangeCount = clipboardService.currentChangeCount()
        timer = Timer.scheduledTimer(withTimeInterval: Constants.clipboardPollingInterval, repeats: true) { [weak self] _ in
            self?.poll(onChange: onChange)
        }
    }

    func stopMonitoring() {
        timer?.invalidate()
        timer = nil
    }

    private func poll(onChange: @escaping () -> Void) {
        guard clipboardService.hasChanged(since: lastChangeCount) else { return }
        lastChangeCount = clipboardService.currentChangeCount()

        do {
            // PS-72: text wins when both are present — copying from a browser or Finder
            // puts an image alongside the text, and the text is what the user meant.
            if let text = capturedText() {
                try store(content: text, kind: .text)
            } else if let fileName = try capturedImageFileName() {
                try store(content: fileName, kind: .image)
            } else {
                return
            }
            DispatchQueue.main.async { onChange() }
        } catch {
            NSLog("ClipboardMonitor error: \(error)")
        }
    }

    private func capturedText() -> String? {
        guard let raw = clipboardService.getText(),
              !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        // PS-15: cap oversized clipboard payloads so a huge copy doesn't bloat the DB.
        return raw.count > Constants.maxClipboardTextLength
            ? String(raw.prefix(Constants.maxClipboardTextLength))
            : raw
    }

    /// Stores the clipboard image on disk and returns the file name to persist.
    /// Oversized images are dropped rather than truncated — a partial PNG is useless.
    private func capturedImageFileName() throws -> String? {
        guard let png = clipboardService.getImagePNG(),
              png.count <= Constants.maxClipboardImageBytes else { return nil }
        return try ImageStore.shared.save(png)
    }

    private func store(content: String, kind: ItemKind) throws {
        if let existing = try itemRepo.findByContent(content, directory: Constants.defaultDirectory) {
            try itemRepo.updateItem(
                id: existing.id,
                content: content,
                directory: Constants.defaultDirectory,
                memo: existing.memo,
                kind: kind
            )
        } else {
            _ = try itemRepo.createItem(
                content: content,
                directory: Constants.defaultDirectory,
                memo: nil,
                kind: kind
            )
            try itemRepo.cleanupOldItems(
                directory: Constants.defaultDirectory,
                maxCount: Constants.maxItemsPerDirectory
            )
        }
    }
}
