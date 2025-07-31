# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

**Development:**
- `pnpm start` - Start the server (production mode)
- `pnpm run dev` - Start the server with nodemon (development mode)

**Environment:**
- Set `TERRARP_API_KEY` environment variable for TerraRP API integration
- Server runs on port 3001 by default (configurable via `PORT` env var)

## Architecture Overview

This is a Node.js/Express backend for a collaborative dice roller application with SQLite database storage.

**Core Components:**

- **server.js** - Main Express application with API endpoints
- **database.js** - SQLite database operations using better-sqlite3 (synchronous, no Promise wrapping needed)
- **formula-calculator.js** - Complex dice calculation engine for action rolls
- **actions.js** - Game action definitions and rank systems (server-side authority)
- **migrations/** - Database schema evolution scripts

**Key Architecture Patterns:**

1. **Synchronous Database Operations** - Uses better-sqlite3 synchronously, not wrapped in Promises
2. **Shared Calculator Instance** - Single FormulaCalculator instance reused across requests for memory efficiency
3. **Migration System** - Auto-runs on startup, tracks version in `user_version` pragma
4. **Action Roll System** - Complex dice mechanics with explosions, multipliers, rank bonuses

## Database Schema

**Tables:**
- `rooms` - Chat rooms for dice rolling sessions
- `rolls` - Individual dice rolls with full audit trail

**Key Fields:**
- `rolls.rollDetails` - JSON blob containing calculation breakdowns for action rolls
- `rolls.rawDiceResult` - Pure dice total before bonuses/modifiers
- `rolls.actionName` - Links to action definitions in actions.js

## Action Roll System

The FormulaCalculator handles complex RPG dice mechanics:
- **Rank Bonuses** - E/D/C/B/A/S ranks with defined bonus values
- **Explosion Dice** - Dice that trigger additional rolls on high values
- **Conditional Modifiers** - Multipliers and bonuses based on thresholds
- **Keep Highest/Lowest** - Advantage/disadvantage mechanics

Action definitions in actions.js use `calculableFormula` objects that the calculator can process automatically.

## API Integration

**TerraRP API Proxy** (`/api/terrarp-user/:userId`):
- Proxies character data from external TerraRP service
- Includes timeout handling and proper error responses
- Uses API key from environment variable

## Rate Limiting & Security

- Simple in-memory rate limiting (100 requests/minute per IP)
- Request size limits (1MB JSON payload max)
- API keys via environment variables, not hardcoded

## Migration System

Migrations are JavaScript modules in `/migrations/` with:
- Numerical prefix for ordering (001_, 002_, etc.)
- `version` number and `up(db)` function
- Auto-executed on server startup if database version is behind