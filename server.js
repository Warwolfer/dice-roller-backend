
const express = require('express');
const cors = require('cors');
const crypto = require('crypto'); // For generating IDs, similar to client-side
const db = require('./database');
const { ACTIONS, ACTION_CATEGORIES, RANK_BONUSES } = require('./actions');
const FormulaCalculator = require('./formula-calculator');

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

const app = express();
const PORT = process.env.PORT || 3001;

// Reusable FormulaCalculator instance
const formulaCalculator = new FormulaCalculator();

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ limit: '1mb' })); // Parse JSON request bodies with size limit

// Simple rate limiting middleware
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

function rateLimit(req, res, next) {
  const clientId = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestCounts.has(clientId)) {
    requestCounts.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const clientData = requestCounts.get(clientId);
  
  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
  }
  
  clientData.count++;
  next();
}

app.use(rateLimit);

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
app.get('/api/rooms', (req, res) => {
  try {
    const rooms = db.getRooms();
    res.json(rooms);
  } catch (error) {
    console.error('Failed to get rooms:', error);
    res.status(500).json({ error: 'Failed to retrieve rooms' });
  }
});

app.post('/api/rooms', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Room name is required and must be a non-empty string.' });
  }
  const id = crypto.randomUUID();
  try {
    const newRoom = db.addRoom(id, name.trim());
    res.status(201).json(newRoom);
  } catch (error) {
    console.error('Failed to create room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  try {
    const room = db.getRoomById(roomId);
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
  const { userName, diceType, comment, actionName, weaponRank, masteryRank, rollFormula, avatarUrl } = req.body;

  if (!userName || typeof userName !== 'string' || userName.trim() === '') {
    return res.status(400).json({ error: 'User name is required.' });
  }

  // Check if this is an action roll or dice roll
  const isActionRoll = actionName && weaponRank && masteryRank;
  
  let result;
  let rawDiceResult = null;
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

    // Use shared formula calculator for action rolls
    const rollResult = formulaCalculator.calculateActionRoll(action, weaponRank, masteryRank, 0);
    result = rollResult.result;
    rawDiceResult = rollResult.rawDiceResult;
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
    rawDiceResult = result; // For regular dice rolls, raw result equals final result
  }

  const newRollId = crypto.randomUUID();
  const timestamp = new Date();

  try {
    const room = db.getRoomById(roomId); // Check if room exists
    if (!room) {
      return res.status(404).json({ error: 'Room not found. Cannot add roll.' });
    }

    const newRoll = db.addRoll(
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
      rollFormula,
      rollDetails,
      rawDiceResult,
      avatarUrl
    );
    
    // Update participant activity when they make a roll
    db.updateParticipantActivity(roomId, userName.trim());
    
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

// Join a room as a participant
app.post('/api/rooms/:roomId/join', (req, res) => {
  const { roomId } = req.params;
  const { userName, terraRPData } = req.body;

  if (!userName || typeof userName !== 'string' || userName.trim() === '') {
    return res.status(400).json({ error: 'User name is required.' });
  }

  try {
    // Check if room exists
    const room = db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if participant already exists by name
    let existingParticipant = db.getParticipantByRoomAndName(roomId, userName.trim());
    
    // If no participant by name, check by TerraRP ID if provided
    if (!existingParticipant && terraRPData && terraRPData.user_id) {
      existingParticipant = db.getParticipantByRoomAndTerraRPId(roomId, terraRPData.user_id);
    }

    if (existingParticipant) {
      // Update last activity for existing participant
      db.updateParticipantActivity(roomId, existingParticipant.name);
      return res.json(existingParticipant);
    }

    // Create new participant
    const newParticipant = db.addParticipant(roomId, userName.trim(), terraRPData);
    res.status(201).json(newParticipant);
  } catch (error) {
    console.error('Error joining room as participant:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Get room participants
app.get('/api/rooms/:roomId/participants', (req, res) => {
  const { roomId } = req.params;
  
  try {
    const room = db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const participants = db.getParticipantsForRoomDbQuery(roomId);
    res.json(participants);
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

// Proxy endpoint for TerraRP API
app.get('/api/terrarp-user/:userId', async (req, res) => {
  const { userId } = req.params;
  
  if (!userId || isNaN(userId)) {
    return res.status(400).json({ error: 'Valid user ID is required' });
  }
  
  try {
    console.log(`Making TerraRP API call for user ID: ${userId}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(`https://terrarp.com/api/terrasphere-charactermanager/?id=${userId}`, {
      headers: {
        'Xf-Api-Key': process.env.TERRARP_API_KEY || 'nY3YHH7VMoIIVj8WgvmFfBG2tLeWyzUj'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('TerraRP API response received');
    res.json(data);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('TerraRP API call timed out');
      res.status(504).json({ error: 'TerraRP API request timed out' });
    } else if (error.message.includes('fetch')) {
      console.error('Network error calling TerraRP API:', error.message);
      res.status(503).json({ error: 'Unable to connect to TerraRP API' });
    } else {
      console.error('TerraRP API call failed:', error.message);
      res.status(500).json({ error: `TerraRP API call failed: ${error.message}` });
    }
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