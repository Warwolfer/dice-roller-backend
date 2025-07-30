module.exports = {
  version: 5,
  up: (db) => {
    // Check if column already exists to make this migration idempotent
    const stmtCheckColumn = db.prepare(`PRAGMA table_info(rolls)`);
    const columns = stmtCheckColumn.all();
    const hasRawDiceResultColumn = columns.some(col => col.name === 'rawDiceResult');

    // Add column for storing the raw dice total before bonuses/modifiers
    if (!hasRawDiceResultColumn) {
      db.exec(`ALTER TABLE rolls ADD COLUMN rawDiceResult INTEGER`);
      console.log("Added 'rawDiceResult' column to 'rolls' table.");
    } else {
      console.log("'rawDiceResult' column already exists in 'rolls' table.");
    }

    console.log("Migration 005: Raw dice result storage added successfully.");
  }
};