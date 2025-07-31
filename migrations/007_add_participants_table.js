module.exports = {
  version: 7,
  up: (db) => {
    const createParticipantsTable = `
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        roomId TEXT NOT NULL,
        name TEXT NOT NULL,
        terraRPUserId INTEGER,
        terraRPUsername TEXT,
        terraRPRace TEXT,
        terraRPAvatarUrl TEXT,
        terraRPWeaponRank TEXT,
        terraRPArmorRank TEXT,
        terraRPMasteries TEXT, -- JSON string of masteries array
        terraRPCustomTitle TEXT,
        joinedAt TEXT NOT NULL,
        lastActivity TEXT NOT NULL,
        FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE,
        UNIQUE(roomId, name) -- Prevent duplicate participants with same name in a room
      );
    `;
    
    // Create index for faster lookups
    const createParticipantsIndex = `
      CREATE INDEX IF NOT EXISTS idx_participants_room_activity 
      ON participants(roomId, lastActivity DESC);
    `;
    
    db.exec(createParticipantsTable);
    console.log("Table 'participants' created or already exists.");
    
    db.exec(createParticipantsIndex);
    console.log("Index 'idx_participants_room_activity' created or already exists.");
  }
};