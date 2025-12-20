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
}

// 모든 디렉토리와 각각의 아이템 개수 조회 (빈 디렉토리 포함)
pub fn get_directories() -> Result<Vec<DirectoryInfo>> {
    let conn = Connection::open(get_path())?;
    let mut stmt = conn.prepare(
        "SELECT d.name, COUNT(p.id) as count
         FROM directories d
         LEFT JOIN paste_sheets p ON d.name = p.directory
         GROUP BY d.name
         ORDER BY d.name",
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (directory) REFERENCES directories(name)
        )",
        [],
    )?;

    // 마이그레이션: 기존 paste_sheets에 있는 디렉토리들을 directories 테이블로 복사
    conn.execute(
        "INSERT OR IGNORE INTO directories (name)
         SELECT DISTINCT directory FROM paste_sheets",
        [],
    )?;

    Ok(conn)
}

pub fn create_directory(name: &str) -> Result<i64> {
    let conn = Connection::open(get_path())?;
    conn.execute("INSERT INTO directories (name) VALUES (?1)", [name])?;
    Ok(conn.last_insert_rowid())
}

pub fn rename_directory(old_name: &str, new_name: &str) -> Result<()> {
    if old_name == "Clipboard" {
        return Err(rusqlite::Error::InvalidQuery);
    }
    let conn = Connection::open(get_path())?;
    conn.execute(
        "UPDATE directories SET name = ?1 WHERE name = ?2",
        [new_name, old_name],
    )?;
    conn.execute(
        "UPDATE paste_sheets SET directory = ?1 WHERE directory = ?2",
        [new_name, old_name],
    )?;
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

pub fn post_content(content: &str, directory: &str) -> Result<i64> {
    let conn = Connection::open(get_path())?;

    conn.execute(
        "INSERT INTO paste_sheets (content, directory) VALUES (?1, ?2)",
        [content, directory],
    )?;

    Ok(conn.last_insert_rowid())
}

pub fn get_all_contents() -> Result<Vec<PasteItem>> {
    let conn = Connection::open(get_path())?;
    let mut stmt = conn.prepare(
        "SELECT id, content, directory, created_at FROM paste_sheets ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PasteItem {
            id: row.get(0)?,
            content: row.get(1)?,
            directory: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn update_content(id: i64, content: &str, directory: &str) -> Result<i64> {
    let conn = Connection::open(get_path())?;
    conn.execute(
        "UPDATE paste_sheets SET content = ?1, directory = ?2, created_at = CURRENT_TIMESTAMP WHERE id = ?3",
        rusqlite::params![content, directory, id],
    )?;
    Ok(id)
}

pub fn find_by_content(content: &str, directory: &str) -> Result<Option<PasteItem>> {
    let conn = Connection::open(get_path())?;
    let mut stmt = conn.prepare(
        "SELECT id, content, directory, created_at FROM paste_sheets WHERE content = ?1 AND directory = ?2 LIMIT 1",
    )?;
    let result = stmt.query_row([content, directory], |row| {
        Ok(PasteItem {
            id: row.get(0)?,
            content: row.get(1)?,
            directory: row.get(2)?,
            created_at: row.get(3)?,
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
