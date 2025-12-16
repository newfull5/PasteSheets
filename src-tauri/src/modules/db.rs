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

// 모든 디렉토리와 각각의 아이템 개수 조회
pub fn get_directories() -> Result<Vec<DirectoryInfo>> {
    let conn = Connection::open(get_path())?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT directory, COUNT(*) as count FROM paste_sheets GROUP BY directory ORDER BY directory"
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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS paste_sheets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            directory TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    Ok(conn)
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

pub fn save_content(content: &str, directory: &str) -> Result<i64> {
    let conn = Connection::open(get_path())?;
    conn.execute(
        "INSERT INTO paste_sheets (content, directory) VALUES (?1, ?2)",
        [content, directory],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_contents_by_directory(directory: &str) -> Result<Vec<PasteItem>> {
    let conn = Connection::open(get_path())?;
    let mut stmt = conn.prepare(
        "SELECT id, content, directory, created_at FROM paste_sheets WHERE directory = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([directory], |row| {
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
