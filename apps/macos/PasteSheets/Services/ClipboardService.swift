import AppKit

final class ClipboardService {
    private let pasteboard = NSPasteboard.general

    // PS-43: NSPasteboard markers set by password managers (1Password, etc.)
    // to opt clipboard contents out of history/sync. Convention shared cross-platform.
    private static let concealedType = NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType")
    private static let transientType = NSPasteboard.PasteboardType("org.nspasteboard.TransientType")

    /// PS-43: sensitive clips must never reach history, whatever their format.
    private var isSensitive: Bool {
        guard let types = pasteboard.types else { return false }
        return types.contains(Self.concealedType) || types.contains(Self.transientType)
    }

    func getText() -> String? {
        if isSensitive { return nil }
        return pasteboard.string(forType: .string)
    }

    func setText(_ text: String) {
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }

    /// PS-72: PNG bytes for an image sitting on the clipboard (screenshots, copied
    /// images). TIFF is re-encoded so everything downstream handles one format.
    func getImagePNG() -> Data? {
        if isSensitive { return nil }
        if let png = pasteboard.data(forType: .png) { return png }
        guard let tiff = pasteboard.data(forType: .tiff),
              let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.representation(using: .png, properties: [:])
    }

    /// Writes both PNG and TIFF: some apps only accept one of the two on paste.
    func setImagePNG(_ png: Data) {
        pasteboard.clearContents()
        pasteboard.setData(png, forType: .png)
        if let tiff = NSBitmapImageRep(data: png)?.tiffRepresentation {
            pasteboard.setData(tiff, forType: .tiff)
        }
    }

    func hasChanged(since lastChangeCount: Int) -> Bool {
        pasteboard.changeCount != lastChangeCount
    }

    func currentChangeCount() -> Int {
        pasteboard.changeCount
    }
}
