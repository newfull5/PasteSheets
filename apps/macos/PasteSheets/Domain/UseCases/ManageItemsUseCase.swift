import Foundation

final class ManageItemsUseCase {
    private let repo: PasteItemRepository

    init(repo: PasteItemRepository) {
        self.repo = repo
    }

    func getAllItems() throws -> [PasteItem] {
        try repo.getAllItems()
    }

    func createItem(content: String, directory: String, memo: String?, kind: ItemKind = .text) throws -> Int64 {
        try repo.createItem(content: content, directory: directory, memo: memo, kind: kind)
    }

    func updateItem(id: Int64, content: String, directory: String, memo: String?, kind: ItemKind = .text) throws {
        try repo.updateItem(id: id, content: content, directory: directory, memo: memo, kind: kind)
    }

    func deleteItem(id: Int64) throws {
        try repo.deleteItem(id: id)
    }
}
