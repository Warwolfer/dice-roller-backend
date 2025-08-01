# Dice Roller Backend

A Node.js/Express backend for a collaborative dice rolling application with advanced RPG mechanics, supporting real-time dice rolls, action calculations.

## Features

- **Advanced Dice Mechanics**: Complex RPG dice calculations with explosions, rank bonuses, and conditional modifiers
- **Action Roll System**: Server-side authority for game actions with E/D/C/B/A/S rank systems
- **Real-time Collaboration**: Multi-user dice rolling sessions with persistent chat rooms
- **SQLite Database**: Efficient local storage with automatic migrations
- **Rate Limiting**: Built-in request limiting and security measures

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd dice-roller-backend

# Install dependencies
pnpm install
```

### Running the Application

```bash
# Development mode with auto-reload
pnpm run dev

# Production mode
pnpm start
```

The server will start on `http://localhost:3001` (or your configured PORT).

## API Endpoints

### Rooms
- `GET /rooms` - List all available rooms
- `POST /rooms` - Create a new room
- `GET /rooms/:id/rolls` - Get roll history for a room

### Dice Rolling
- `POST /rooms/:id/roll` - Perform a dice roll in a room
- Action rolls automatically calculate bonuses and modifiers

## Database Schema

The application uses SQLite with an automatic migration system:

- **rooms**: Chat rooms for dice rolling sessions
- **rolls**: Individual dice rolls with full audit trail and calculation details
- **participants**: User participation tracking with armor types and bonuses

## Action Roll System

The dice roller supports complex RPG mechanics:

### Rank System
- **E/D/C/B/A/S** ranks with predefined bonus values
- Automatic rank bonus application to action rolls

### Advanced Dice Features
- **Explosion Dice**: Trigger additional rolls on high values
- **Keep Highest/Lowest**: Advantage/disadvantage mechanics
- **Conditional Modifiers**: Multipliers and bonuses based on roll thresholds
- **Detailed Breakdowns**: Full calculation audit trail stored in database

### Example Action Roll
```javascript
{
  "actionName": "combat_attack",
  "calculableFormula": {
    "base": "2d10",
    "explosions": [10],
    "rankBonus": "A",
    "multiplier": 1.5,
    "threshold": 15
  }
}
```

## Architecture

### Core Components

- **server.js**: Main Express application with REST API endpoints
- **database.js**: SQLite operations using better-sqlite3 (synchronous)
- **formula-calculator.js**: Complex dice calculation engine
- **actions.js**: Game action definitions and server-side authority
- **migrations/**: Database schema evolution scripts

### Key Design Patterns

1. **Synchronous Database**: Uses better-sqlite3 without Promise wrapping for performance
2. **Shared Calculator**: Single FormulaCalculator instance for memory efficiency
3. **Auto-migrations**: Database schema updates on server startup
4. **Rate Limiting**: In-memory request limiting (100 req/min per IP)

## Configuration

### Security Features

- Request size limits (1MB JSON payload max)
- API key authentication for external services
- Rate limiting protection
- Input validation and sanitization

## Development

### Adding New Actions

1. Define action in `actions.js` with `calculableFormula`
2. The FormulaCalculator will automatically handle the mechanics
3. Test with various rank combinations and modifiers

### Database Migrations

Create new migration files in `/migrations/` with:
```javascript
module.exports = {
  version: 11, // Next sequential number
  up: (db) => {
    // Your SQL changes here
  }
};
```

### Testing Action Rolls

Use the `/rooms/:id/roll` endpoint with:
```json
{
  "formula": "action:combat_attack",
  "rank": "A",
  "userName": "TestUser"
}
```

## Contributing

1. Follow existing code patterns and architecture
2. Add appropriate database migrations for schema changes
3. Test action roll mechanics thoroughly
4. Update this README for significant feature additions

## License

[Add your license information here]
