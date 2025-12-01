import Foundation
import RaycastSwiftMacros
import SQLite3

// SQLITE_TRANSIENT tells SQLite to make a copy of the string
private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

// MARK: - Data Types

struct Transcript: Codable {
    let id: String
    let text: String
    let rawText: String
    let timestamp: Double
    let sourceType: String
    let sourceIdentifier: String
    let duration: Double
    let audioPath: String?
    let dictateContext: String?
    let syncedAt: Double?

    // Status is complex, simplified for our needs
    var isCompleted: Bool = true
}

struct TranscriptHistory: Codable {
    let history: [TranscriptJSON]
}

struct TranscriptJSON: Codable {
    let id: String
    let text: String?
    let rawText: String?
    let timestamp: Double
    let sourceType: String
    let sourceIdentifier: String
    let duration: Double
    let audioPath: String?
    let dictateContext: String?
    let syncedAt: Double?
    let status: TranscriptStatus

    // Valid if has text and status is completed (rawText is optional, use text as fallback)
    var isValid: Bool {
        text != nil && status.isCompleted
    }

    // Get rawText or fall back to text
    var effectiveRawText: String {
        rawText ?? text ?? ""
    }
}

struct TranscriptStatus: Codable {
    let completed: EmptyObject?
    let failedTranscription: EmptyObject?

    var isCompleted: Bool {
        completed != nil
    }
}

struct EmptyObject: Codable {}

// MARK: - Search Result Type for TypeScript

struct TranscriptResult: Codable {
    let id: String
    let text: String
    let rawText: String
    let timestamp: Double
    let sourceType: String
    let sourceIdentifier: String
    let duration: Double
    let audioPath: String?
}

struct SyncResult: Codable {
    let success: Bool
    let transcriptCount: Int
    let message: String
}

// MARK: - Database Paths

private let jsonPath = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Containers/com.zeitalabs.JottleAI/Data/Documents/transcription_history.json")

private let dbDirectory = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/com.raycast.macos/extensions/monologue")

private let dbPath = dbDirectory.appendingPathComponent("transcripts.sqlite")

// MARK: - Database Manager

class DatabaseManager {
    private var db: OpaquePointer?

    init() throws {
        // Ensure directory exists
        try FileManager.default.createDirectory(at: dbDirectory, withIntermediateDirectories: true)

        // Open database
        if sqlite3_open(dbPath.path, &db) != SQLITE_OK {
            throw DatabaseError.cannotOpen(String(cString: sqlite3_errmsg(db)))
        }

        // Enable WAL mode for better concurrency (allows reads during writes)
        _ = sqlite3_exec(db, "PRAGMA journal_mode=WAL", nil, nil, nil)
        // Set busy timeout to wait if database is locked (5 seconds)
        _ = sqlite3_exec(db, "PRAGMA busy_timeout=5000", nil, nil, nil)

        try createTables()
    }

    deinit {
        sqlite3_close(db)
    }

    private func createTables() throws {
        // Main transcripts table
        let createTable = """
            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                raw_text TEXT NOT NULL,
                timestamp REAL NOT NULL,
                source_type TEXT NOT NULL,
                source_identifier TEXT NOT NULL,
                duration REAL NOT NULL,
                audio_path TEXT,
                synced_at REAL
            );
            """

        try execute(createTable)

        // Create index for text search (FTS5 not available in Raycast's SQLite)
        let createIndex = "CREATE INDEX IF NOT EXISTS idx_transcripts_text ON transcripts(text)"
        try execute(createIndex)

        // Metadata table for tracking sync state
        let createMeta = """
            CREATE TABLE IF NOT EXISTS sync_metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            """

        try execute(createMeta)
    }

    private func execute(_ sql: String) throws {
        var errMsg: UnsafeMutablePointer<CChar>?
        if sqlite3_exec(db, sql, nil, nil, &errMsg) != SQLITE_OK {
            let error = errMsg.map { String(cString: $0) } ?? "Unknown error"
            sqlite3_free(errMsg)
            throw DatabaseError.executionFailed(error)
        }
    }

    func getLastSyncMtime() -> Double? {
        let sql = "SELECT value FROM sync_metadata WHERE key = 'json_mtime'"
        var stmt: OpaquePointer?

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return nil }
        defer { sqlite3_finalize(stmt) }

        if sqlite3_step(stmt) == SQLITE_ROW {
            let value = String(cString: sqlite3_column_text(stmt, 0))
            return Double(value)
        }
        return nil
    }

    func setLastSyncMtime(_ mtime: Double) throws {
        let sql = "INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('json_mtime', ?)"
        var stmt: OpaquePointer?

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw DatabaseError.prepareFailed(String(cString: sqlite3_errmsg(db)))
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, String(mtime), -1, SQLITE_TRANSIENT)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw DatabaseError.executionFailed("Failed to update sync metadata")
        }
    }

    func clearAndInsert(transcripts: [TranscriptJSON]) throws {
        // Use a single transaction for all operations
        _ = sqlite3_exec(db, "BEGIN EXCLUSIVE TRANSACTION", nil, nil, nil)

        // Delete existing records
        _ = sqlite3_exec(db, "DELETE FROM transcripts", nil, nil, nil)

        // Prepare insert statement
        let sql = """
            INSERT OR REPLACE INTO transcripts (id, text, raw_text, timestamp, source_type, source_identifier, duration, audio_path, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            let errorMsg = String(cString: sqlite3_errmsg(db))
            _ = sqlite3_exec(db, "ROLLBACK", nil, nil, nil)
            throw DatabaseError.prepareFailed(errorMsg)
        }

        var insertCount = 0
        for t in transcripts where t.isValid {
            guard let text = t.text else { continue }

            sqlite3_reset(stmt)
            sqlite3_bind_text(stmt, 1, t.id, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 2, text, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 3, t.effectiveRawText, -1, SQLITE_TRANSIENT)
            sqlite3_bind_double(stmt, 4, t.timestamp)
            sqlite3_bind_text(stmt, 5, t.sourceType, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(stmt, 6, t.sourceIdentifier, -1, SQLITE_TRANSIENT)
            sqlite3_bind_double(stmt, 7, t.duration)

            if let audioPath = t.audioPath {
                sqlite3_bind_text(stmt, 8, audioPath, -1, SQLITE_TRANSIENT)
            } else {
                sqlite3_bind_null(stmt, 8)
            }

            if let syncedAt = t.syncedAt {
                sqlite3_bind_double(stmt, 9, syncedAt)
            } else {
                sqlite3_bind_null(stmt, 9)
            }

            if sqlite3_step(stmt) != SQLITE_DONE {
                let errorMsg = String(cString: sqlite3_errmsg(db))
                sqlite3_finalize(stmt)
                _ = sqlite3_exec(db, "ROLLBACK", nil, nil, nil)
                throw DatabaseError.executionFailed("Insert failed: \(errorMsg)")
            }

            insertCount += 1
        }

        sqlite3_finalize(stmt)
        _ = sqlite3_exec(db, "COMMIT", nil, nil, nil)
    }

    func getTranscriptCount() -> Int {
        let sql = "SELECT COUNT(*) FROM transcripts"
        var stmt: OpaquePointer?

        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return 0 }
        defer { sqlite3_finalize(stmt) }

        if sqlite3_step(stmt) == SQLITE_ROW {
            return Int(sqlite3_column_int(stmt, 0))
        }
        return 0
    }
}

enum DatabaseError: Error {
    case cannotOpen(String)
    case prepareFailed(String)
    case executionFailed(String)
}

// MARK: - Raycast Exported Functions

@raycast func syncTranscripts() async throws -> SyncResult {
    // Check if JSON file exists
    guard FileManager.default.fileExists(atPath: jsonPath.path) else {
        return SyncResult(success: false, transcriptCount: 0, message: "JSON file not found")
    }

    // Get JSON file modification time
    let attrs = try FileManager.default.attributesOfItem(atPath: jsonPath.path)
    let mtime = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0

    // Initialize database
    let dbManager = try DatabaseManager()

    // Check if sync is needed
    if let lastMtime = dbManager.getLastSyncMtime(), lastMtime == mtime {
        let count = dbManager.getTranscriptCount()
        return SyncResult(success: true, transcriptCount: count, message: "Already in sync")
    }

    // Read and parse JSON
    let data = try Data(contentsOf: jsonPath)
    let history = try JSONDecoder().decode(TranscriptHistory.self, from: data)

    // Sync to database
    try dbManager.clearAndInsert(transcripts: history.history)
    try dbManager.setLastSyncMtime(mtime)

    let count = dbManager.getTranscriptCount()
    return SyncResult(success: true, transcriptCount: count, message: "Synced \(count) transcripts")
}

@raycast func getDatabasePath() -> String {
    return dbPath.path
}

@raycast func forceSync() async throws -> SyncResult {
    // Check if JSON file exists
    guard FileManager.default.fileExists(atPath: jsonPath.path) else {
        return SyncResult(success: false, transcriptCount: 0, message: "JSON file not found")
    }

    // Delete existing database to force fresh rebuild
    try? FileManager.default.removeItem(at: dbPath)

    // Get JSON file modification time
    let attrs = try FileManager.default.attributesOfItem(atPath: jsonPath.path)
    let mtime = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0

    // Initialize database (creates fresh)
    let dbManager = try DatabaseManager()

    // Read and parse JSON
    let data = try Data(contentsOf: jsonPath)
    let history = try JSONDecoder().decode(TranscriptHistory.self, from: data)

    // Sync to database
    try dbManager.clearAndInsert(transcripts: history.history)
    try dbManager.setLastSyncMtime(mtime)

    let count = dbManager.getTranscriptCount()
    return SyncResult(success: true, transcriptCount: count, message: "Force synced \(count) transcripts")
}

@raycast func needsSync() async throws -> Bool {
    guard FileManager.default.fileExists(atPath: jsonPath.path) else {
        return false
    }

    let attrs = try FileManager.default.attributesOfItem(atPath: jsonPath.path)
    let mtime = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0

    let dbManager = try DatabaseManager()

    if let lastMtime = dbManager.getLastSyncMtime() {
        return lastMtime != mtime
    }

    return true
}
