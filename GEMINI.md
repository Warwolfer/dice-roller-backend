# Gemini Workspace

This document provides instructions and guidelines for interacting with the Collaborative Dice Roller backend using the Gemini assistant.

## Starting the Development Server

To start the development server, use the following command:

`npm run dev`

This will start the server with `nodemon`, which automatically restarts the server on file changes.

## Project Overview

This is a Node.js application using the Express framework. It serves as the backend for a collaborative dice-rolling application.

### Key Technologies

- **Node.js:** JavaScript runtime environment.
- **Express:** Web application framework for Node.js.
- **better-sqlite3:** Library for SQLite3 database interaction.
- **nodemon:** Utility that monitors for changes in your source and automatically restarts your server.

### Main Components

- **`server.js`:** The main entry point of the application. It sets up the Express server, defines API endpoints, and handles application logic.
- **`database.js`:** Manages the SQLite database connection and provides functions for data access.
- **`actions.js`:** Contains definitions for actions, action categories, and rank bonuses.
- **`formula-calculator.js`:** A class for calculating roll results based on formulas.
- **`data/`:** This directory likely contains the SQLite database file.
- **`migrations/`:** Contains database migration scripts.

## Available API Endpoints

The following are the main API endpoints available in the application:

- **`GET /api/actions`:** Retrieves the list of available actions, categories, and rank bonuses.
- **`GET /api/rooms`:** Gets a list of all available rooms.
- **`POST /api/rooms`:** Creates a new room.
- **`GET /api/rooms/:roomId`:** Retrieves details for a specific room.
- **`POST /api/rooms/:roomId/rolls`:** Submits a new dice roll to a room.
- **`POST /api/rooms/:roomId/join`:** Adds a participant to a room.
- **`GET /api/rooms/:roomId/participants`:** Retrieves the list of participants in a room.
- **`GET /api/terrarp-user/:userId`:** A proxy endpoint to the TerraRP API.

## How to Interact with Gemini

You can use natural language to ask Gemini to perform tasks related to this project. For example:

- "Start the development server."
- "Show me the database schema."
- "Add a new endpoint to get the server status."
- "What are the available actions?"
