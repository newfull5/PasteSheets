import AppKit

final class ClipboardService {
    private let pasteboard = NSPasteboard.general

    // PS-43: NSPasteboard markers set by password managers (1Password, etc.)
    // to opt clipboard contents out of history/sync. Convention shared cross-platform.
    private static let concealedType = NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType")
    private static let transientType = NSPasteboard.PasteboardType("org.nspasteboard.TransientType")

    func getText() -> String? {
        // PS-43: never capture sensitive clips into history — silently ignore.
        if let types = pasteboard.types,
           types.contains(Self.concealedType) || types.contains(Self.transientType) {
            return nil
        }
        return pasteboard.string(forType: .string)
    }

    func setText(_ text: String) {
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }

    func hasChanged(since lastChangeCount: Int) -> Bool {
        pasteboard.changeCount != lastChangeCount
    }

    func currentChangeCount() -> Int {
        pasteboard.changeCount
    }
}
