const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

// Initialize OpenAI client
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  try {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('✅ OpenAI client initialized for chatbot LLM processing');
  } catch (err) {
    console.error('❌ OpenAI SDK initialization failed:', err.message);
    openaiClient = null;
  }
}

/**
 * POST /api/llm/process
 * Process chatbot conversation using LLM with Royal Enfield context
 */
router.post('/process', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    if (!openaiClient) {
      return res.status(500).json({ success: false, error: 'LLM not configured' });
    }

    const { userMessage, conversationHistory } = req.body;
    console.log('📨 Received message:', userMessage);
    console.log('📜 History length:', conversationHistory?.length);

    if (!userMessage) {
      return res.status(400).json({ success: false, error: 'User message is required' });
    }

    // Read the Royal Enfield data
    const dataPath = path.join(__dirname, '../data/royal_enfield.json');
    let royalEnfieldData = '';
    try {
      royalEnfieldData = await fs.readFile(dataPath, 'utf8');
    } catch (err) {
      console.warn('⚠️ Could not read data file:', err.message);
      royalEnfieldData = "No Royal Enfield data available.";
    }

    // Context loading removed


    // Extract additional context from request
    const { scheduledMeeting } = req.body; // Passed from frontend if a meeting is already booked

    const systemPrompt = `You are a helpful Royal Enfield Service Assistant and Meeting Scheduler.
    
STATIC CONTEXT DATA (Service Info):
${royalEnfieldData}



CURRENT DATE: ${new Date().toISOString().split('T')[0]}
CURRENT TIME: ${new Date().toLocaleTimeString('en-US', { hour12: false })}

EXISTING MEETING (if any):
${scheduledMeeting ? JSON.stringify(scheduledMeeting, null, 2) : "None"}

YOUR GOAL:
1. Answer service questions based STRICTLY on the Context Data.
2. If you cannot answer based on data, suggest a meeting: "I cannot answer that... It would be nice if we can have a meeting..."
3. If user agrees to meeting (or explicitly asks), help them schedule it.
4. ONE MEETING RULE: If 'EXISTING MEETING' is not "None", and user tries to book *another*, ask: "You already have a meeting on [Date] at [Time]. Would you like to reschedule/replace it?"
   - If user says "Yes" -> Proceed to collect new details and use tool 'calendar.reschedule_meeting'.
   - If user says "No" -> Do nothing / Chat.

TOOLS AVAILABLE:
- calendar.schedule_meeting(email, meeting_date, start_time, duration_minutes)
- calendar.reschedule_meeting(old_event_id, email, meeting_date, start_time, duration_minutes)

INSTRUCTIONS:
- Analyze History (last 15 messages) to extract: email, meeting_date (YYYY-MM-DD), start_time (HH:MM 24h), duration_minutes.
- **IMPORTANT**: For "Scheduling a Meeting", ONLY collect the 4 fields above. Do NOT ask for 'Name', 'Phone', or 'Bike Model' even if mentioned in the Context Data.
- RESCHEDULE RULE: If rescheduling, INHERIT the 'email' and 'duration_minutes' from the EXISTING MEETING (if available) unless the user explicitly mentions a new email/duration. You only need to ask for the *new* date/time if not provided.
- Ask for missing fields ONE BY ONE.
- If all fields present -> CALL THE TOOL.
- For "Reschedule", you need the SAME fields as schedule, plus you imply the 'old_event_id' from context (you don't need to ask user for ID).

OUTPUT FORMAT:
Return a JSON object:
{
  "response_text": "string (what to show user)",
  "tool_call": {
    "name": "calendar.schedule_meeting" | "calendar.reschedule_meeting" | null,
    "arguments": { ... }
  } | null
}
`;

    // Map conversation history to LLM format
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(msg => ({ role: msg.sender === 'bot' ? 'assistant' : 'user', content: msg.text })),
      { role: 'user', content: userMessage }
    ];

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = response.choices?.[0]?.message?.content || "{}";
    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      result = { response_text: content, tool_call: null };
    }

    return res.json({
      success: true,
      response: result
    });

  } catch (error) {
    console.error('❌ LLM processing error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process with LLM'
    });
  }
});

module.exports = router;