import Foundation

enum DatabaseSchema {

    static let createDirectories = """
        CREATE TABLE IF NOT EXISTS directories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """

    static let createPasteSheets = """
        CREATE TABLE IF NOT EXISTS paste_sheets (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            content     TEXT NOT NULL,
            directory   TEXT NOT NULL,
            memo        TEXT,
            kind        TEXT NOT NULL DEFAULT 'text',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (directory) REFERENCES directories(name)
        )
        """

    static let createSettings = """
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """

    static let insertDefaultDirectory = """
        INSERT OR IGNORE INTO directories (name) VALUES ('Clipboard')
        """

    static let insertDefaultMouseEdge = """
        INSERT OR IGNORE INTO settings (key, value) VALUES ('mouse_edge_enabled', 'true')
        """

    static let addMemoColumn = """
        ALTER TABLE paste_sheets ADD COLUMN memo TEXT
        """

    // PS-72: 'text' | 'image'. An image row's content is the PNG file name in ImageStore.
    static let addKindColumn = """
        ALTER TABLE paste_sheets ADD COLUMN kind TEXT NOT NULL DEFAULT 'text'
        """

    static let syncOrphanDirectories = """
        INSERT OR IGNORE INTO directories (name)
        SELECT DISTINCT directory FROM paste_sheets
        """
}
