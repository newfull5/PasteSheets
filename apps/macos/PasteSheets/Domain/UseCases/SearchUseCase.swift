import Foundation

final class SearchUseCase {

    func search(
        query: String,
        allItems: [PasteItem],
        allDirectories: [DirectoryInfo]
    ) -> (directories: [DirectoryInfo], items: [PasteItem]) {
        let q = query.lowercased()

        let dirs = allDirectories.filter {
            $0.name.lowercased().contains(q)
        }

        // An image row's content is a SHA-256 file name — matching it would only ever
        // produce noise, so image rows are searchable by memo alone.
        let items = allItems.filter {
            ($0.kind == .text && $0.content.lowercased().contains(q)) ||
            ($0.memo?.lowercased().contains(q) ?? false)
        }

        return (dirs, items)
    }
}
