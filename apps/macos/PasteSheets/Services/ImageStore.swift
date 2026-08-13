import AppKit
import CryptoKit

/// PS-72: image clips are kept as PNG files beside the DB; the row only stores the
/// file name. The name is the SHA-256 of the bytes, so copying the same image twice
/// resolves to the same file and `findByContent` dedups it without extra work.
final class ImageStore {
    static let shared = ImageStore()

    private let cache = NSCache<NSString, NSImage>()

    private init() {
        cache.countLimit = 60
    }

    private var directory: URL {
        let url = URL(fileURLWithPath: DatabaseManager.shared.databasePath)
            .deletingLastPathComponent()
            .appendingPathComponent("images")
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    func url(for fileName: String) -> URL {
        directory.appendingPathComponent(fileName)
    }

    /// Writes the PNG unless those exact bytes are already stored. Returns the file
    /// name to persist in `paste_sheets.content`.
    func save(_ png: Data) throws -> String {
        let name = SHA256.hash(data: png).map { String(format: "%02x", $0) }.joined() + ".png"
        let destination = url(for: name)
        if !FileManager.default.fileExists(atPath: destination.path) {
            try png.write(to: destination, options: .atomic)
        }
        return name
    }

    func data(for fileName: String) -> Data? {
        try? Data(contentsOf: url(for: fileName))
    }

    /// Downscaled once and cached. The list re-renders on every keystroke, and
    /// decoding a full-resolution screenshot per frame stalls the scroll.
    func thumbnail(for fileName: String) -> NSImage? {
        if let cached = cache.object(forKey: fileName as NSString) { return cached }
        guard let image = NSImage(contentsOf: url(for: fileName)) else { return nil }
        let thumb = Self.downscaled(image, maxDimension: Constants.imageThumbnailMaxDimension)
        cache.setObject(thumb, forKey: fileName as NSString)
        return thumb
    }

    /// Deletes stored images no row references any more. Rows also disappear through
    /// the per-directory cap (a bulk SQL DELETE), so per-delete refcounting would miss
    /// those — a sweep against the full reference set is both simpler and complete.
    func pruneOrphans(referenced: Set<String>) {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(atPath: directory.path) else { return }
        for file in files where !referenced.contains(file) {
            try? fm.removeItem(at: url(for: file))
        }
    }

    private static func downscaled(_ image: NSImage, maxDimension: CGFloat) -> NSImage {
        let size = image.size
        let scale = min(1, maxDimension / max(size.width, size.height))
        guard scale < 1, size.width > 0, size.height > 0 else { return image }
        let target = NSSize(width: size.width * scale, height: size.height * scale)
        let output = NSImage(size: target)
        output.lockFocus()
        image.draw(in: NSRect(origin: .zero, size: target))
        output.unlockFocus()
        return output
    }
}
