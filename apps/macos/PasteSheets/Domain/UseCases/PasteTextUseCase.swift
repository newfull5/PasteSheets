import Foundation

final class PasteTextUseCase {
    private let clipboardService: ClipboardService
    private let previousAppService: PreviousAppService
    private let keySimService: KeySimulationService

    init(clipboardService: ClipboardService,
         previousAppService: PreviousAppService,
         keySimService: KeySimulationService) {
        self.clipboardService = clipboardService
        self.previousAppService = previousAppService
        self.keySimService = keySimService
    }

    /// Returns false if Accessibility permission is missing (paste aborted and
    /// the user was prompted to grant it); true once the paste was simulated.
    @discardableResult
    func execute(text: String) -> Bool {
        execute { self.clipboardService.setText(text) }
    }

    /// PS-72: an image row carries a file name, so its payload has to be read back
    /// from disk before the clipboard is loaded.
    @discardableResult
    func execute(item: PasteItem) -> Bool {
        switch item.kind {
        case .text:
            return execute(text: item.content)
        case .image:
            // File gone (pruned, or the folder was cleared): nothing to paste, but
            // this is not a permission failure — don't send the user to Settings.
            guard let png = ImageStore.shared.data(for: item.content) else { return true }
            return execute { self.clipboardService.setImagePNG(png) }
        }
    }

    private func execute(loadClipboard: () -> Void) -> Bool {
        guard keySimService.ensureAccessibilityPermission() else { return false }

        loadClipboard()
        previousAppService.restoreAndWaitUntilFrontmost(
            timeout: Constants.pasteFocusTimeout,
            pollInterval: Constants.pasteFocusPollInterval
        )
        // The app is frontmost, but its key window may need a frame to be ready
        // for the synthetic key event. Settle briefly so Cmd+V isn't dropped.
        Thread.sleep(forTimeInterval: Constants.pasteKeyDelay)
        keySimService.simulatePaste()
        return true
    }
}
