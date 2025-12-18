comcom# MCP Chatbot Implementation

## Overview
The chatbot now follows the Model Context Protocol (MCP) schema for intelligent meeting scheduling with conversation history tracking.

## Key Changes

### 1. Backend - LLM Processing (`backend/routes/llm.js`)

**New Features:**
- Accepts `userMessage`, `conversationHistory`, and `collectedData`
- Maintains last 10 messages for context
- Uses structured JSON response format
- Intelligently extracts meeting data from conversation

**MCP Schema Fields:**
```javascript
{
  email: string,              // Guest email
  meeting_date: string,       // YYYY-MM-DD format
  start_time: string,         // HH:MM (24-hour format)
  duration_minutes: number    // Duration in minutes
}
```

**Response Format:**
```json
{
  "action": "ask" | "schedule",
  "message": "Response to user",
  "extractedData": {
    "email": "user@example.com",
    "meeting_date": "2024-12-12",
    "start_time": "12:00",
    "duration_minutes": 60
  }
}
```

### 2. Frontend - Chatbot Component (`frontend/src/components/Chatbot.js`)

**New Features:**
- Maintains conversation history (last 10 messages)
- Tracks collected data across conversation
- Never asks for already-provided information
- Asks ONE question at a time
- Automatically schedules when all data is collected

**State Management:**
```javascript
collectedData: {
  email: null,
  meeting_date: null,
  start_time: null,
  duration_minutes: null
}
```

## How It Works

### Flow:
1. **User sends message** → Added to conversation history
2. **LLM analyzes** → Extracts data + checks what's missing
3. **If data missing** → Ask for ONE missing field
4. **If all data present** → Schedule meeting automatically
5. **After scheduling** → Reset collected data

### Example Conversation:

```
Bot: "Hi, I am reaching out from Royal Enfield..."
User: "can we have a meet on dec 12th"
Bot: "Great! What time would you prefer for the meeting?"
User: "12:00 pm maybe"
Bot: "Got it. How long will the meeting last?"
User: "1 hour"
Bot: "Perfect! Here's your meeting summary..."
     [Automatically schedules meeting]
```

## LLM Intelligence

The LLM:
- ✅ Understands natural language dates ("dec 12th" → "2024-12-12")
- ✅ Converts 12-hour to 24-hour time ("12:00 pm" → "12:00")
- ✅ Extracts duration ("1 hour" → 60 minutes)
- ✅ Remembers conversation context
- ✅ Never repeats questions
- ✅ Extracts emails automatically

## API Endpoints

### POST `/api/llm/process`
**Request:**
```json
{
  "userMessage": "dec 12th",
  "conversationHistory": [...last 10 messages],
  "collectedData": {...current data}
}
```

**Response:**
```json
{
  "success": true,
  "response": {
    "action": "ask",
    "message": "What time would you prefer?",
    "extractedData": {
      "meeting_date": "2024-12-12",
      ...
    }
  }
}
```

### POST `/api/mcp/create`
Called automatically when all data is collected to create the calendar event.

## Testing

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm start`
3. Test conversation flow:
   - Provide date
   - Provide time
   - Provide duration
   - Optionally provide email
   - Meeting auto-schedules

## Benefits

✅ **No repetitive questions** - Remembers what user already said
✅ **Context-aware** - Uses last 10 messages for understanding
✅ **Intelligent extraction** - LLM parses natural language
✅ **One question at a time** - Better UX
✅ **Auto-scheduling** - No manual confirmation needed
✅ **MCP compliant** - Follows standard protocol

## Configuration

Requires `OPENAI_API_KEY` in `.env` file:
```env
OPENAI_API_KEY=your_openai_api_key_here
```

Uses `gpt-4o-mini` model for cost-effective processing.
