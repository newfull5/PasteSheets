import Foundation

/// PS-72: a `.image` item's `content` is the PNG file name held by ImageStore,
/// not the payload itself. Anything that renders, searches or pastes content has
/// to branch on this.
enum ItemKind: String {
    case text
    case image
}

struct PasteItem: Identifiable, Equatable {
    let id: Int64
    let content: String
    let directory: String
    let createdAt: String
    let memo: String?
    let kind: ItemKind

    init(dto: PasteItemDTO) {
        self.id = dto.id
        self.content = dto.content
        self.directory = dto.directory
        self.createdAt = dto.createdAt
        self.memo = dto.memo
        self.kind = ItemKind(rawValue: dto.kind) ?? .text
    }
}
