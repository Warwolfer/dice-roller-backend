// Migration 006: Add avatarUrl column to rolls table

const migration = {
  version: 6,
  description: 'Add avatarUrl column to rolls table',
  
  up(db) {
    console.log('Running migration 006: Adding avatarUrl column to rolls table');
    
    // Check if the avatarUrl column already exists
    const columns = db.prepare("PRAGMA table_info(rolls)").all();
    const avatarUrlExists = columns.some(col => col.name === 'avatarUrl');
    
    if (!avatarUrlExists) {
      db.exec(`ALTER TABLE rolls ADD COLUMN avatarUrl TEXT`);
      console.log('Added avatarUrl column to rolls table');
    } else {
      console.log('avatarUrl column already exists in rolls table');
    }
  },
  
  down(db) {
    console.log('Rolling back migration 006: Removing avatarUrl column from rolls table');
    // SQLite doesn't support DROP COLUMN, so we'd need to recreate the table
    // For now, just log that rollback is not implemented
    console.log('Rollback not implemented for this migration (SQLite limitation)');
  }
};

module.exports = migration;