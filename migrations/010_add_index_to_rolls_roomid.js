module.exports = {
  version: 10,
  up: (db) => {
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_rolls_roomid ON rolls(roomId);
    `;
    db.exec(createIndexSql);
    console.log("Index 'idx_rolls_roomid' on 'rolls' table created or already exists.");
  },
};