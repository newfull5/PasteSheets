use rusqlite::{Connection, Result};

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

pub fn get_all_contents() -> Result<Vec<String>> {
    let conn = Connection::open(get_path())?;
    let mut stmt = conn.prepare("SELECT content, directory FROM paste_sheets")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}
