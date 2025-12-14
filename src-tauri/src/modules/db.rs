use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct PasteItem {
    pub id: i64,
    pub content: String,
    pub directory: String,
    pub created_at: String,
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
