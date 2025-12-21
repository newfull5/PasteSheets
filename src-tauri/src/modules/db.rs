use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DirectoryInfo {
    pub name: String,
    pub count: i64,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct PasteItem {
    pub id: i64,
    pub content: String,
    pub directory: String,
    pub created_at: String,
    pub memo: Option<String>,
}

// 모든 디렉토리와 각각의 아이템 개수 조회 (빈 디렉토리 포함)
pub fn get_directories() -> Result<Vec<DirectoryInfo>> {
    let conn = Connection::open(get_path())?;
    let mut stmt = conn.prepare(
        "SELECT d.name, COUNT(p.id) as count
         FROM directories d
         LEFT JOIN paste_sheets p ON d.name = p.directory
         GROUP BY d.name
         ORDER BY CASE WHEN d.name = 'Clipboard' THEN 0 ELSE 1 END, d.created_at",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DirectoryInfo {
            name: row.get(0)?,
            count: row.get(1)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn get_path() -> String {
    let mut path = dirs::data_dir().unwrap();
    path.push("paste_sheets.db");
    path.to_str().unwrap().to_string()
}

pub fn init_db() -> Result<Connection> {
    let conn = Connection::open(get_path())?;

    // 디렉토리 테이블 생성
    conn.execute(
        "CREATE TABLE IF NOT EXISTS directories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // 기본 디렉토리 삽입
    conn.execute(
        "INSERT OR IGNORE INTO directories (name) VALUES ('Clipboard')",
        [],
    )?;

    // 붙여넣기 항목 테이블 생성
    conn.execute(
        "CREATE TABLE IF NOT EXISTS paste_sheets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            directory TEXT NOT NULL,
            memo TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (directory) REFERENCES directories(name)
        )",
        [],
    )?;

    // 마이그레이션: memo 컬럼이 없는 경우 추가
    let has_memo = {
        let mut stmt = conn.prepare("PRAGMA table_info(paste_sheets)")?;
        let rows = stmt.query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(name)
        })?;

        let mut found = false;
        for row in rows {
            if let Ok(name) = row {
                if name == "memo" {
                    found = true;
                    break;
                }
            }
        }
        found
    };

    if !has_memo {
        conn.execute("ALTER TABLE paste_sheets ADD COLUMN memo TEXT", [])?;
    }

    // 마이그레이션: 기존 paste_sheets에 있는 디렉토리들을 directories 테이블로 복사
    conn.execute(
        "INSERT OR IGNORE INTO directories (name)
         SELECT DISTINCT directory FROM paste_sheets",
        [],
    )?;

    Ok(conn)
}

pub fn create_directory(name: &str) -> Result<i64> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err(rusqlite::Error::InvalidQuery);
    }
    let conn = Connection::open(get_path())?;
    conn.execute("INSERT INTO directories (name) VALUES (?1)", [trimmed_name])?;
    Ok(conn.last_insert_rowid())
}

pub fn rename_directory(old_name: &str, new_name: &str) -> Result<()> {
    let old_trimmed = old_name.trim();
    let new_trimmed = new_name.trim();

    if old_trimmed == "Clipboard" || new_trimmed == "Clipboard" || new_trimmed.is_empty() {
        return Err(rusqlite::Error::InvalidQuery);
    }

    log::info!("[DB] Rename start: '{}' -> '{}'", old_trimmed, new_trimmed);

    let mut conn = Connection::open(get_path())?;

    // 외래 키 제약 조건이 있으면 아이템이 들어있는 폴더의 이름 변경이 차단될 수 있습니다.
    // 이를 일시적으로 끄고 두 테이블을 모두 업데이트한 뒤 다시 켭니다.
    conn.execute("PRAGMA foreign_keys = OFF", [])?;

    let tx = conn.transaction()?;

    // 1. directories 테이블 업데이트
    let affected_dirs = tx.execute(
        "UPDATE directories SET name = ?1 WHERE name = ?2",
        [new_trimmed, old_trimmed],
    )?;
    log::info!("[DB] Affected directories: {}", affected_dirs);

    if affected_dirs == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }

    // 2. paste_sheets 테이블 업데이트
    let affected_items = tx.execute(
        "UPDATE paste_sheets SET directory = ?1 WHERE directory = ?2",
        [new_trimmed, old_trimmed],
    )?;
    log::info!("[DB] Affected paste items: {}", affected_items);

    tx.commit()?;

    // 외래 키 체크 다시 활성화
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    log::info!("[DB] Rename committed successfully");

    Ok(())
}

pub fn delete_directory(name: &str) -> Result<()> {
    if name == "Clipboard" {
        return Err(rusqlite::Error::InvalidQuery);
    }
    let conn = Connection::open(get_path())?;
    conn.execute("DELETE FROM paste_sheets WHERE directory = ?1", [name])?;
    conn.execute("DELETE FROM directories WHERE name = ?1", [name])?;
    Ok(())
}

pub fn post_content(content: &str, directory: &str, memo: Option<&str>) -> Result<i64> {
    let conn = Connection::open(get_path())?;

    conn.execute(
        "INSERT INTO paste_sheets (content, directory, memo) VALUES (?1, ?2, ?3)",
        rusqlite::params![content, directory, memo],
    )?;

    Ok(conn.last_insert_rowid())
}

pub fn get_all_contents() -> Result<Vec<PasteItem>> {
    let conn = Connection::open(get_path())?;
    let mut stmt = conn.prepare(
        "SELECT id, content, directory, created_at, memo FROM paste_sheets ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PasteItem {
            id: row.get(0)?,
            content: row.get(1)?,
            directory: row.get(2)?,
            created_at: row.get(3)?,
            memo: row.get(4)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn update_content(id: i64, content: &str, directory: &str, memo: Option<&str>) -> Result<i64> {
    let conn = Connection::open(get_path())?;
    conn.execute(
        "UPDATE paste_sheets SET content = ?1, directory = ?2, memo = ?3, created_at = CURRENT_TIMESTAMP WHERE id = ?4",
        rusqlite::params![content, directory, memo, id],
    )?;
    Ok(id)
}

pub fn find_by_content(content: &str, directory: &str) -> Result<Option<PasteItem>> {
    let conn = Connection::open(get_path())?;
    let mut stmt = conn.prepare(
        "SELECT id, content, directory, created_at, memo FROM paste_sheets WHERE content = ?1 AND directory = ?2 LIMIT 1",
    )?;
    let result = stmt.query_row([content, directory], |row| {
        Ok(PasteItem {
            id: row.get(0)?,
            content: row.get(1)?,
            directory: row.get(2)?,
            created_at: row.get(3)?,
            memo: row.get(4)?,
        })
    });

    match result {
        Ok(item) => Ok(Some(item)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn delete_history_item(id: i64) -> Result<()> {
    let conn = Connection::open(get_path())?;
    conn.execute("DELETE FROM paste_sheets WHERE id = ?1", [id])?;
    Ok(())
}
