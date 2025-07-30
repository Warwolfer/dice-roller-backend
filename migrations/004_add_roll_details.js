module.exports = {
  version: 4,
  up: (db) => {
    // Check if column already exists to make this migration idempotent
    const stmtCheckColumn = db.prepare(`PRAGMA table_info(rolls)`);
    const columns = stmtCheckColumn.all();
    const hasRollDetailsColumn = columns.some(col => col.name === 'rollDetails');

    // Add column for storing detailed roll breakdown as JSON
    if (!hasRollDetailsColumn) {
      db.exec(`ALTER TABLE rolls ADD COLUMN rollDetails TEXT`);
      console.log("Added 'rollDetails' column to 'rolls' table.");
    } else {
      console.log("'rollDetails' column already exists in 'rolls' table.");
    }

    console.log("Migration 004: Roll details storage added successfully.");
  }
};