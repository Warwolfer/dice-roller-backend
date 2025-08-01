
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const DB_PATH = path.join(dataDir, 'diceroller.db');

let db;

function runMigrations(dbInstance) {
  const migrationsDir = path.join(__dirname, 'migrations');
  let currentDbVersion = 0;
  try {
    currentDbVersion = dbInstance.pragma('user_version', { simple: true });
  } catch (e) {
    console.warn("Could not read user_version, assuming 0. Error:", e.message);
    // This might happen if the DB is new or PRAGMA isn't supported in some edge case.
    // For new DBs, user_version will be 0 anyway.
  }
  
  console.log(`Current database schema version: ${currentDbVersion}`);

  let appliedMigration = false;

  try {
    if (!fs.existsSync(migrationsDir)) {
      console.log('Migrations directory does not exist. Skipping migrations.');
      return;
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js'))
      .sort((a, b) => { // Sort by numerical prefix
        const numA = parseInt(a.split('_')[0], 10);
        const numB = parseInt(b.split('_')[0], 10);
        if (isNaN(numA) || isNaN(numB)) { // Handle files not matching expected format
            if (isNaN(numA) && !isNaN(numB)) return 1; // Non-numeric first
            if (!isNaN(numA) && isNaN(numB)) return -1; // Numeric first
            return a.localeCompare(b); // Fallback to string compare
        }
        return numA - numB;
      });

    for (const file of migrationFiles) {
      const migration = require(path.join(migrationsDir, file));
      if (migration && typeof migration.version === 'number' && typeof migration.up === 'function') {
        if (migration.version > currentDbVersion) {
          console.log(`Applying migration: ${file} (to version ${migration.version})`);
          const transaction = dbInstance.transaction(() => {
            migration.up(dbInstance);
            dbInstance.pragma(`user_version = ${migration.version}`);
          });
          transaction(); // Execute the transaction
          console.log(`Successfully applied migration ${file}. Database is now at version ${migration.version}.`);
          currentDbVersion = migration.version; // Update currentDbVersion for the loop
          appliedMigration = true;
        }
      } else {
        console.warn(`Skipping invalid migration file: ${file}. It must export 'version' (number) and 'up' (function).`);
      }
    }

    if (!appliedMigration && migrationFiles.length > 0) {
      console.log('Database schema is up to date.');
    } else if (migrationFiles.length === 0) {
        console.log('No valid migrations found in migrations directory.');
    }

  } catch (err) {
    console.error('Failed to apply migrations:', err.message);
    console.error('Database may be in an inconsistent state. Please check migrations and database schema.');
    throw err; 
  }
}


try {
  db = new Database(DB_PATH /*, { verbose: console.log } */); // verbose can be too chatty
  console.log('Connected to the SQLite database using better-sqlite3.');
  runMigrations(db); // Run migrations after connecting
} catch (err) {
  console.error('Error during database setup or migration:', err.message);
  process.exit(1);
}


// Helper function to get rolls for a specific room
function getRollsForRoomDbQuery(roomIdToQuery) {
  const rollsSql = `SELECT id, userName, diceType, result, rawDiceResult, timestamp, comment, actionName, weaponRank, masteryRank, rollFormula, rollDetails, avatarUrl FROM rolls WHERE roomId = ? ORDER BY timestamp DESC`;
  const stmt = db.prepare(rollsSql);
  const rollRows = stmt.all(roomIdToQuery);
  return rollRows.map(roll => ({
    ...roll,
    timestamp: new Date(roll.timestamp), 
    comment: roll.comment || undefined,
    actionName: roll.actionName || undefined,
    weaponRank: roll.weaponRank || undefined,
    masteryRank: roll.masteryRank || undefined,
    rollFormula: roll.rollFormula || undefined,
    rawDiceResult: roll.rawDiceResult || undefined,
    rollDetails: roll.rollDetails ? JSON.parse(roll.rollDetails) : undefined,
    avatarUrl: roll.avatarUrl || undefined
  }));
}

// Helper function to get participants for a specific room
function getParticipantsForRoomDbQuery(roomIdToQuery) {
  const participantsSql = `SELECT * FROM participants WHERE roomId = ? ORDER BY joinedAt ASC`;
  const stmt = db.prepare(participantsSql);
  const participantRows = stmt.all(roomIdToQuery);
  return participantRows.map(participant => ({
    id: participant.id,
    name: participant.name,
    terraRP: participant.terraRPUserId ? {
      user_id: participant.terraRPUserId,
      username: participant.terraRPUsername,
      race: participant.terraRPRace,
      avatar_url: participant.terraRPAvatarUrl,
      weapon_rank: participant.terraRPWeaponRank,
      armor_rank: participant.terraRPArmorRank,
      armor_type: participant.terraRPArmorType,
      masteries: participant.terraRPMasteries ? JSON.parse(participant.terraRPMasteries) : [],
      custom_title: participant.terraRPCustomTitle
    } : undefined,
    joinedAt: new Date(participant.joinedAt),
    lastActivity: new Date(participant.lastActivity)
  }));
}

// --- Room Functions ---
function addRoom(id, name, creatorName, creatorTerraRpId, roomCode) {
  const sql = `INSERT INTO rooms (id, name, creator_name, creator_terrarp_id, room_code) VALUES (?, ?, ?, ?, ?)`;
  const stmt = db.prepare(sql);
  stmt.run(id, name, creatorName, creatorTerraRpId, roomCode);
  
  // Return the complete room data by fetching it back
  return getRoomById(id);
}

function getRooms() {
  const sql = `SELECT * FROM rooms ORDER BY created_at DESC`;
  const stmt = db.prepare(sql);
  const rows = stmt.all();
  return rows.map(r => ({ ...r, rolls: [], participants: [] }));
}

function getRoomById(roomId) {
  const roomSql = `SELECT * FROM rooms WHERE id = ?`;
  const roomStmt = db.prepare(roomSql);
  const roomRow = roomStmt.get(roomId);

  if (!roomRow) {
    return null;
  }

  const rolls = getRollsForRoomDbQuery(roomId);
  const participants = getParticipantsForRoomDbQuery(roomId);
  return { ...roomRow, rolls, participants };
}

function updateRoomUpdatedAt(roomId) {
  const sql = `UPDATE rooms SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  const stmt = db.prepare(sql);
  stmt.run(roomId);
}

// --- Roll Functions ---
function addRoll(id, roomId, userName, diceType, result, timestamp, comment, actionName = null, weaponRank = null, masteryRank = null, rollFormula = null, rollDetails = null, rawDiceResult = null, avatarUrl = null) {
  const sql = `INSERT INTO rolls (id, roomId, userName, diceType, result, rawDiceResult, timestamp, comment, actionName, weaponRank, masteryRank, rollFormula, rollDetails, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const isoTimestamp = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
  const commentToStore = comment && comment.trim() !== '' ? comment.trim() : null;
  const actionNameToStore = actionName && actionName.trim() !== '' ? actionName.trim() : null;
  const weaponRankToStore = weaponRank && weaponRank.trim() !== '' ? weaponRank.trim() : null;
  const masteryRankToStore = masteryRank && masteryRank.trim() !== '' ? masteryRank.trim() : null;
  const rollFormulaToStore = rollFormula && rollFormula.trim() !== '' ? rollFormula.trim() : null;
  const rollDetailsToStore = rollDetails ? JSON.stringify(rollDetails) : null;
  const avatarUrlToStore = avatarUrl && avatarUrl.trim() !== '' ? avatarUrl.trim() : null;

  const stmt = db.prepare(sql);
  stmt.run(id, roomId, userName, diceType, result, rawDiceResult, isoTimestamp, commentToStore, actionNameToStore, weaponRankToStore, masteryRankToStore, rollFormulaToStore, rollDetailsToStore, avatarUrlToStore);
  updateRoomUpdatedAt(roomId);
  
  return {
    id,
    roomId,
    userName,
    diceType,
    result,
    rawDiceResult: rawDiceResult || undefined,
    timestamp: new Date(isoTimestamp),
    comment: commentToStore || undefined,
    actionName: actionNameToStore || undefined,
    weaponRank: weaponRankToStore || undefined,
    masteryRank: masteryRankToStore || undefined,
    rollFormula: rollFormulaToStore || undefined,
    rollDetails: rollDetails || undefined,
    avatarUrl: avatarUrlToStore || undefined
  };
}

// --- Participant Functions ---
function addParticipant(roomId, name, terraRPData = null) {
  const participantId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  // Extract TerraRP data if provided
  let terraRPUserId = null;
  let terraRPUsername = null;
  let terraRPRace = null;
  let terraRPAvatarUrl = null;
  let terraRPWeaponRank = null;
  let terraRPArmorRank = null;
  let terraRPArmorType = null;
  let terraRPMasteries = null;
  let terraRPCustomTitle = null;
  
  if (terraRPData) {
    terraRPUserId = terraRPData.user_id || null;
    terraRPUsername = terraRPData.username || null;
    terraRPRace = terraRPData.Race || null;
    terraRPAvatarUrl = terraRPData.avatar_urls?.s || null;
    terraRPCustomTitle = terraRPData.custom_title || null;
    
    // Extract weapon rank
    if (terraRPData.equipment) {
      const weaponItem = terraRPData.equipment.find(item => item.Weapon);
      terraRPWeaponRank = weaponItem?.Weapon || null;
      
      // Extract armor rank and type
      const armorItem = terraRPData.equipment.find(item => 
        item['Heavy Armor'] || item['Medium Armor'] || item['Light Armor'] || item.Armor
      );
      if (armorItem) {
        if (armorItem['Heavy Armor']) {
          terraRPArmorRank = armorItem['Heavy Armor'];
          terraRPArmorType = 'Heavy Armor';
        } else if (armorItem['Medium Armor']) {
          terraRPArmorRank = armorItem['Medium Armor'];
          terraRPArmorType = 'Medium Armor';
        } else if (armorItem['Light Armor']) {
          terraRPArmorRank = armorItem['Light Armor'];
          terraRPArmorType = 'Light Armor';
        } else if (armorItem.Armor) {
          terraRPArmorRank = armorItem.Armor;
          terraRPArmorType = 'Armor';
        }
      }
    }
    
    // Store masteries as JSON string
    if (terraRPData.masteries && Array.isArray(terraRPData.masteries)) {
      terraRPMasteries = JSON.stringify(terraRPData.masteries);
    }
  }
  
  const sql = `INSERT INTO participants (
    id, roomId, name, terraRPUserId, terraRPUsername, terraRPRace, 
    terraRPAvatarUrl, terraRPWeaponRank, terraRPArmorRank, terraRPArmorType, terraRPMasteries, 
    terraRPCustomTitle, joinedAt, lastActivity
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  const stmt = db.prepare(sql);
  stmt.run(
    participantId, roomId, name, terraRPUserId, terraRPUsername, terraRPRace,
    terraRPAvatarUrl, terraRPWeaponRank, terraRPArmorRank, terraRPArmorType, terraRPMasteries,
    terraRPCustomTitle, now, now
  );
  
  // Return the created participant in the expected format
  return {
    id: participantId,
    name,
    terraRP: terraRPData ? {
      user_id: terraRPUserId,
      username: terraRPUsername,
      race: terraRPRace,
      avatar_url: terraRPAvatarUrl,
      weapon_rank: terraRPWeaponRank,
      armor_rank: terraRPArmorRank,
      armor_type: terraRPArmorType,
      masteries: terraRPData.masteries || [],
      custom_title: terraRPCustomTitle
    } : undefined,
    joinedAt: new Date(now),
    lastActivity: new Date(now)
  };
}

function updateParticipantActivity(roomId, name) {
  const now = new Date().toISOString();
  const sql = `UPDATE participants SET lastActivity = ? WHERE roomId = ? AND name = ?`;
  const stmt = db.prepare(sql);
  const result = stmt.run(now, roomId, name);
  return result.changes > 0;
}

function getParticipantByRoomAndName(roomId, name) {
  const sql = `SELECT * FROM participants WHERE roomId = ? AND name = ?`;
  const stmt = db.prepare(sql);
  const participant = stmt.get(roomId, name);
  
  if (!participant) {
    return null;
  }
  
  return {
    id: participant.id,
    name: participant.name,
    terraRP: participant.terraRPUserId ? {
      user_id: participant.terraRPUserId,
      username: participant.terraRPUsername,
      race: participant.terraRPRace,
      avatar_url: participant.terraRPAvatarUrl,
      weapon_rank: participant.terraRPWeaponRank,
      armor_rank: participant.terraRPArmorRank,
      masteries: participant.terraRPMasteries ? JSON.parse(participant.terraRPMasteries) : [],
      custom_title: participant.terraRPCustomTitle
    } : undefined,
    joinedAt: new Date(participant.joinedAt),
    lastActivity: new Date(participant.lastActivity)
  };
}

function getParticipantByRoomAndTerraRPId(roomId, terraRPUserId) {
  const sql = `SELECT * FROM participants WHERE roomId = ? AND terraRPUserId = ?`;
  const stmt = db.prepare(sql);
  const participant = stmt.get(roomId, terraRPUserId);
  
  if (!participant) {
    return null;
  }
  
  return {
    id: participant.id,
    name: participant.name,
    terraRP: {
      user_id: participant.terraRPUserId,
      username: participant.terraRPUsername,
      race: participant.terraRPRace,
      avatar_url: participant.terraRPAvatarUrl,
      weapon_rank: participant.terraRPWeaponRank,
      armor_rank: participant.terraRPArmorRank,
      masteries: participant.terraRPMasteries ? JSON.parse(participant.terraRPMasteries) : [],
      custom_title: participant.terraRPCustomTitle
    },
    joinedAt: new Date(participant.joinedAt),
    lastActivity: new Date(participant.lastActivity)
  };
}


module.exports = {
  addRoom,
  getRooms,
  getRoomById,
  addRoll,
  addParticipant,
  updateParticipantActivity,
  getParticipantByRoomAndName,
  getParticipantByRoomAndTerraRPId,
  getParticipantsForRoomDbQuery,
  updateRoomUpdatedAt,
};
