
const express = require('express');
const cors = require('cors');
const crypto = require('crypto'); // For generating IDs, similar to client-side
const db = require('./database');
const { ACTIONS, ACTION_CATEGORIES, RANK_BONUSES } = require('./actions');
const FormulaCalculator = require('./formula-calculator');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies

// --- API Endpoints ---

// Get actions and ranks
app.get('/api/actions', (req, res) => {
  try {
    res.json({
      actions: ACTIONS,
      categories: ACTION_CATEGORIES,
      rankBonuses: RANK_BONUSES
    });
  } catch (error) {
    console.error('Failed to get actions:', error);
    res.status(500).json({ error: 'Failed to retrieve actions' });
  }
});

// Rooms
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await db.getRooms();
    res.json(rooms);
  } catch (error) {
    console.error('Failed to get rooms:', error);
    res.status(500).json({ error: 'Failed to retrieve rooms' });
  }
});

app.post('/api/rooms', async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Room name is required and must be a non-empty string.' });
  }
  const id = crypto.randomUUID();
  try {
    const newRoom = await db.addRoom(id, name.trim());
    res.status(201).json(newRoom);
  } catch (error) {
    console.error('Failed to create room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.get('/api/rooms/:roomId', async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await db.getRoomById(roomId);
    if (room) {
      res.json(room);
    } else {
      res.status(404).json({ error: 'Room not found' });
    }
  } catch (error) {
    console.error(`Failed to get room ${roomId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve room' });
  }
});

// Rolls
app.post('/api/rooms/:roomId/rolls', async (req, res) => {
  const { roomId } = req.params;
  const { userName, diceType, comment, actionName, weaponRank, masteryRank, rollFormula } = req.body;

  if (!userName || typeof userName !== 'string' || userName.trim() === '') {
    return res.status(400).json({ error: 'User name is required.' });
  }

  // Check if this is an action roll or dice roll
  const isActionRoll = actionName && weaponRank && masteryRank;
  
  let result;
  let actualDiceType = null;
  let rollDetails = null;

  if (isActionRoll) {
    // Find the action definition
    const action = ACTIONS.find(a => a.name === actionName);
    if (!action) {
      return res.status(400).json({ error: `Unknown action: ${actionName}` });
    }

    // Validate ranks
    if (RANK_BONUSES[weaponRank] === undefined || RANK_BONUSES[masteryRank] === undefined) {
      return res.status(400).json({ error: 'Invalid weapon or mastery rank' });
    }

    // Use formula calculator for action rolls
    const calculator = new FormulaCalculator();
    const rollResult = calculator.calculateActionRoll(action, weaponRank, masteryRank, 0);
    result = rollResult.result;
    rollDetails = rollResult.details;
    actualDiceType = 100; // Store as d100 for action rolls (for compatibility)
  } else {
    // For regular dice rolls, validate dice type
    const validDiceValues = Object.values(Dice).filter(v => typeof v === 'number');
    if (diceType === undefined || !validDiceValues.includes(Number(diceType))) {
       return res.status(400).json({ error: `Invalid dice type. Valid types are: ${validDiceValues.join(', ')}` });
    }
    
    actualDiceType = Number(diceType);
    result = Math.floor(Math.random() * actualDiceType) + 1;
  }

  const newRollId = crypto.randomUUID();
  const timestamp = new Date();

  try {
    const room = await db.getRoomById(roomId); // Check if room exists
    if (!room) {
      return res.status(404).json({ error: 'Room not found. Cannot add roll.' });
    }

    const newRoll = await db.addRoll(
      newRollId, 
      roomId, 
      userName.trim(), 
      actualDiceType, 
      result, 
      timestamp, 
      comment,
      actionName,
      weaponRank,
      masteryRank,
      rollFormula
    );
    
    // Include roll details in response for action rolls
    const response = { ...newRoll };
    if (rollDetails) {
      response.calculationDetails = rollDetails;
    }
    
    res.status(201).json(response);
  } catch (error) {
    console.error(`Failed to add roll to room ${roomId}:`, error);
    res.status(500).json({ error: 'Failed to add roll' });
  }
});

// Simple root path
app.get('/', (req, res) => {
  res.send('Dice Roller Backend is running!');
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server listening on http://localhost:${PORT}`);
});

const Dice = {
  D4: 4,
  D6: 6,
  D8: 8,
  D10: 10,
  D12: 12,
  D20: 20,
  D100: 100,
};
Object.freeze(Dice);