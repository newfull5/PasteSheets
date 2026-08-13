import Foundation
import SQLite3

final class DatabaseManager {
    static let shared = DatabaseManager()

    private var db: OpaquePointer?
    private let queue = DispatchQueue(label: "com.pastesheets.db", qos: .userInitiated)

    private init() {}

    private var appSupportDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
    }

    // Canonical location: PasteSheet subfolder (matches the Windows app's %APPDATA%\PasteSheet).
    var databasePath: String {
        appSupportDirectory.appendingPathComponent("PasteSheet/paste_sheets.db").path
    }

    // Pre-migration location: directly under Application Support.
    private var legacyDatabasePath: String {
        appSupportDirectory.appendingPathComponent("paste_sheets.db").path
    }

    func initialize() throws {
        let path = try resolveDatabasePath()

        guard sqlite3_open(path, &db) == SQLITE_OK else {
            throw DatabaseError.openFailed(String(cString: sqlite3_errmsg(db)))
        }

        try execute(DatabaseSchema.createDirectories)
        try execute(DatabaseSchema.createPasteSheets)
        try execute(DatabaseSchema.createSettings)
        try execute(DatabaseSchema.insertDefaultDirectory)
        try execute(DatabaseSchema.insertDefaultMouseEdge)
        try migrateIfNeeded()
        try execute(DatabaseSchema.syncOrphanDirectories)
    }

    /// Ensures the DB directory exists and relocates a legacy root-level DB into the
    /// PasteSheet subfolder. Returns the path that should actually be opened.
    /// If any file move fails, rolls back and keeps the legacy path — preserving data is top priority.
    private func resolveDatabasePath() throws -> String {
        let fm = FileManager.default
        let newPath = databasePath
        let oldPath = legacyDatabasePath

        let newDir = (newPath as NSString).deletingLastPathComponent
        try fm.createDirectory(atPath: newDir, withIntermediateDirectories: true)

        // Only migrate when a legacy DB exists and no new DB is present yet.
        guard fm.fileExists(atPath: oldPath), !fm.fileExists(atPath: newPath) else {
            return newPath
        }

        // Move the main DB together with its SQLite sidecars (WAL/SHM, plus a
        // DELETE-mode hot journal left by a crash), as a group.
        let suffixes = ["", "-wal", "-shm", "-journal"]
        var moved: [(from: String, to: String)] = []
        do {
            for suffix in suffixes {
                let src = oldPath + suffix
                guard fm.fileExists(atPath: src) else { continue }
                let dst = newPath + suffix
                try fm.moveItem(atPath: src, toPath: dst)
                moved.append((from: dst, to: src))
            }
            return newPath
        } catch {
            // Roll back any partial move so the legacy path stays intact, then fall back to it.
            for m in moved { try? fm.moveItem(atPath: m.from, toPath: m.to) }
            return oldPath
        }
    }

    private func migrateIfNeeded() throws {
        let columns = try queryColumnNames(table: "paste_sheets")
        if !columns.contains("memo") {
            try execute(DatabaseSchema.addMemoColumn)
        }
        if !columns.contains("kind") {
            try execute(DatabaseSchema.addKindColumn)
        }
    }

    private func queryColumnNames(table: String) throws -> [String] {
        var stmt: OpaquePointer?
        let sql = "PRAGMA table_info(\(table))"
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw DatabaseError.prepareFailed(String(cString: sqlite3_errmsg(db)))
        }
        defer { sqlite3_finalize(stmt) }

        var names: [String] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            if let cStr = sqlite3_column_text(stmt, 1) {
                names.append(String(cString: cStr))
            }
        }
        return names
    }

    // MARK: - Execution Helpers

    func execute(_ sql: String, params: [Any?] = []) throws {
        try queue.sync {
            var stmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
                throw DatabaseError.prepareFailed(String(cString: sqlite3_errmsg(db)))
            }
            defer { sqlite3_finalize(stmt) }

            try bindParams(stmt: stmt, params: params)

            let result = sqlite3_step(stmt)
            guard result == SQLITE_DONE || result == SQLITE_ROW else {
                throw DatabaseError.executionFailed(String(cString: sqlite3_errmsg(db)))
            }
        }
    }

    func executeReturningId(_ sql: String, params: [Any?] = []) throws -> Int64 {
        try queue.sync {
            var stmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
                throw DatabaseError.prepareFailed(String(cString: sqlite3_errmsg(db)))
            }
            defer { sqlite3_finalize(stmt) }

            try bindParams(stmt: stmt, params: params)

            guard sqlite3_step(stmt) == SQLITE_DONE else {
                throw DatabaseError.executionFailed(String(cString: sqlite3_errmsg(db)))
            }
            return sqlite3_last_insert_rowid(db)
        }
    }

    func query<T>(_ sql: String, params: [Any?] = [], mapper: (OpaquePointer) -> T) throws -> [T] {
        try queue.sync {
            var stmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
                throw DatabaseError.prepareFailed(String(cString: sqlite3_errmsg(db)))
            }
            defer { sqlite3_finalize(stmt) }

            try bindParams(stmt: stmt, params: params)

            var results: [T] = []
            while sqlite3_step(stmt) == SQLITE_ROW {
                results.append(mapper(stmt!))
            }
            return results
        }
    }

    func queryOne<T>(_ sql: String, params: [Any?] = [], mapper: (OpaquePointer) -> T) throws -> T? {
        let results = try query(sql, params: params, mapper: mapper)
        return results.first
    }

    func executeInTransaction(_ block: () throws -> Void) throws {
        try execute("BEGIN TRANSACTION")
        do {
            try block()
            try execute("COMMIT")
        } catch {
            try execute("ROLLBACK")
            throw error
        }
    }

    // MARK: - Bind

    private func bindParams(stmt: OpaquePointer?, params: [Any?]) throws {
        for (index, param) in params.enumerated() {
            let i = Int32(index + 1)
            switch param {
            case nil:
                sqlite3_bind_null(stmt, i)
            case let val as String:
                sqlite3_bind_text(stmt, i, (val as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
            case let val as Int64:
                sqlite3_bind_int64(stmt, i, val)
            case let val as Int:
                sqlite3_bind_int64(stmt, i, Int64(val))
            case let val as Double:
                sqlite3_bind_double(stmt, i, val)
            default:
                sqlite3_bind_text(stmt, i, ("\(param!)" as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
            }
        }
    }
}

enum DatabaseError: Error, LocalizedError {
    case openFailed(String)
    case prepareFailed(String)
    case executionFailed(String)

    var errorDescription: String? {
        switch self {
        case .openFailed(let msg): return "DB open failed: \(msg)"
        case .prepareFailed(let msg): return "SQL prepare failed: \(msg)"
        case .executionFailed(let msg): return "SQL execution failed: \(msg)"
        }
    }
}
