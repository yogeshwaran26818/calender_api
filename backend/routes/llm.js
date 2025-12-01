const express = require('express');
const router = express.Router();

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
 * Process chatbot conversation using LLM
 */
router.post('/process', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    if (!openaiClient) {
      return res.status(500).json({ success: false, error: 'LLM not configured' });
    }

    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const result = response.choices?.[0]?.message?.content || '';
    
    return res.json({ success: true, response: result });
  } catch (error) {
    console.error('❌ LLM processing error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to process with LLM' 
    });
  }
});

module.exports = router;