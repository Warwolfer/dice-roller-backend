
module.exports = {
  version: 9,
  up: (db) => {
    db.exec(`ALTER TABLE rooms ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
    db.exec(`ALTER TABLE rooms ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
    db.exec(`ALTER TABLE rooms ADD COLUMN creator_name TEXT`);
    db.exec(`ALTER TABLE rooms ADD COLUMN creator_terrarp_id INTEGER`);
    db.exec(`ALTER TABLE rooms ADD COLUMN room_code TEXT`);
  },
};
