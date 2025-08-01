
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto'); // For generating IDs, similar to client-side
const http = require('http');
const WebSocket = require('ws');
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
  const { name, creatorName, creatorTerraRpId, roomCode } = req.body;
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Room name is required and must be a non-empty string.' });
  }
  const id = crypto.randomUUID();
  try {
    const newRoom = db.addRoom(id, name.trim(), creatorName, creatorTerraRpId, roomCode);
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
  const { userName, diceType, comment, actionName, weaponRank, masteryRank, rollFormula, avatarUrl, bonus } = req.body;

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
    const actionBonus = parseInt(bonus) || 0;
    const rollResult = formulaCalculator.calculateActionRoll(action, weaponRank, masteryRank, actionBonus);
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
    
    // Broadcast new roll to all clients in the room
    broadcastToRoom(roomId, {
      type: 'new_roll',
      roomId: roomId,
      payload: response
    });
    
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
    
    // Broadcast new participant to all clients in the room
    broadcastToRoom(roomId, {
      type: 'participant_joined',
      roomId: roomId,
      payload: newParticipant
    });
    
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
    if (!process.env.TERRARP_API_KEY) {
      console.error('TERRARP_API_KEY environment variable is not set');
      return res.status(500).json({ error: 'TerraRP API key not configured' });
    }

    console.log(`Making TerraRP API call for user ID: ${userId}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(`https://terrarp.com/api/terrasphere-charactermanager/?id=${userId}`, {
      headers: {
        'Xf-Api-Key': process.env.TERRARP_API_KEY
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

// Create HTTP server
const server = http.createServer(app);

// WebSocket connection management
const roomConnections = new Map(); // roomId -> Set<websocket>
const connectionRooms = new Map(); // websocket -> roomId

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error('Invalid WebSocket message:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    // Clean up room subscriptions
    const roomId = connectionRooms.get(ws);
    if (roomId) {
      leaveRoom(ws, roomId);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleWebSocketMessage(ws, data) {
  const { type, roomId, payload } = data;
  
  switch (type) {
    case 'join_room':
      if (roomId) {
        joinRoom(ws, roomId, payload);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Room ID required' }));
      }
      break;
      
    case 'leave_room':
      if (roomId) {
        leaveRoom(ws, roomId);
      }
      break;
      
    case 'ping':
      // Respond to heartbeat ping with pong
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
      
    default:
      console.log('Unknown WebSocket message type:', type, data);
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

function joinRoom(ws, roomId, payload = {}) {
  // Verify room exists
  try {
    const room = db.getRoomById(roomId);
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      return;
    }
  } catch (error) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid room ID' }));
    return;
  }
  
  // Leave previous room if connected to one
  const currentRoomId = connectionRooms.get(ws);
  if (currentRoomId) {
    leaveRoom(ws, currentRoomId);
  }
  
  // Join new room
  if (!roomConnections.has(roomId)) {
    roomConnections.set(roomId, new Set());
  }
  
  roomConnections.get(roomId).add(ws);
  connectionRooms.set(ws, roomId);
  
  console.log(`Client joined room: ${roomId}`);
  ws.send(JSON.stringify({ type: 'joined_room', roomId, payload }));
  
  // Notify other clients in the room (optional)
  if (payload.userName) {
    broadcastToRoom(roomId, {
      type: 'user_joined',
      roomId,
      payload: { userName: payload.userName }
    }, ws); // Exclude the sender
  }
}

function leaveRoom(ws, roomId) {
  const roomConnections_set = roomConnections.get(roomId);
  if (roomConnections_set) {
    roomConnections_set.delete(ws);
    if (roomConnections_set.size === 0) {
      roomConnections.delete(roomId);
    }
  }
  
  connectionRooms.delete(ws);
  console.log(`Client left room: ${roomId}`);
  
  ws.send(JSON.stringify({ type: 'left_room', roomId }));
}

function broadcastToRoom(roomId, message, excludeWs = null) {
  const connections = roomConnections.get(roomId);
  if (!connections) return;
  
  const messageStr = JSON.stringify(message);
  connections.forEach(clientWs => {
    if (clientWs !== excludeWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(messageStr);
    }
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`Backend server with WebSocket support listening on http://localhost:${PORT}`);
});