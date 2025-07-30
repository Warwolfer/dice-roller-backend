module.exports = {
  version: 3,
  up: (db) => {
    // Check if columns already exist to make this migration idempotent
    const stmtCheckColumn = db.prepare(`PRAGMA table_info(rolls)`);
    const columns = stmtCheckColumn.all();
    const hasActionNameColumn = columns.some(col => col.name === 'actionName');
    const hasWeaponRankColumn = columns.some(col => col.name === 'weaponRank');
    const hasMasteryRankColumn = columns.some(col => col.name === 'masteryRank');
    const hasRollFormulaColumn = columns.some(col => col.name === 'rollFormula');

    // Add columns for action rolls if they don't exist
    if (!hasActionNameColumn) {
      db.exec(`ALTER TABLE rolls ADD COLUMN actionName TEXT`);
      console.log("Added 'actionName' column to 'rolls' table.");
    } else {
      console.log("'actionName' column already exists in 'rolls' table.");
    }

    if (!hasWeaponRankColumn) {
      db.exec(`ALTER TABLE rolls ADD COLUMN weaponRank TEXT`);
      console.log("Added 'weaponRank' column to 'rolls' table.");
    } else {
      console.log("'weaponRank' column already exists in 'rolls' table.");
    }

    if (!hasMasteryRankColumn) {
      db.exec(`ALTER TABLE rolls ADD COLUMN masteryRank TEXT`);
      console.log("Added 'masteryRank' column to 'rolls' table.");
    } else {
      console.log("'masteryRank' column already exists in 'rolls' table.");
    }

    if (!hasRollFormulaColumn) {
      db.exec(`ALTER TABLE rolls ADD COLUMN rollFormula TEXT`);
      console.log("Added 'rollFormula' column to 'rolls' table.");
    } else {
      console.log("'rollFormula' column already exists in 'rolls' table.");
    }

    console.log("Migration 003: Action rolls support added successfully.");
  }
};