import React, { useState } from 'react';
import axios from 'axios';

const Chatbot = () => {
  const [messages, setMessages] = useState([
    { id: 1, text: "Welcome to Royal Enfield Service Assistant. How can I help you today?", sender: 'bot' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [scheduledMeeting, setScheduledMeeting] = useState(null); // Track the ONE allowed meeting




  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const userMessage = {
      id: Date.now(),
      text: text,
      sender: 'user'
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    try {
      const conversationHistory = messages.slice(-15); // Send last 15 messages

      const response = await axios.post('http://localhost:5000/api/llm/process', {
        userMessage: text,
        conversationHistory,
        scheduledMeeting // Context for "One Meeting Rule"
      }, { withCredentials: true });

      const { response_text, tool_call } = response.data.response;

      // 1. Display the text response from LLM
      if (response_text) {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          text: response_text,
          sender: 'bot'
        }]);
      }

      // 2. Execute Tool Call if present
      if (tool_call) {
        if (tool_call.name === 'calendar.schedule_meeting') {
          await executeSchedule(tool_call.arguments);
        } else if (tool_call.name === 'calendar.reschedule_meeting') {
          await executeReschedule(tool_call.arguments);
        }
      }

    } catch (error) {
      console.error('Error processing message:', error);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: "I'm having trouble connecting. Please try again.",
        sender: 'bot'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const executeSchedule = async (args) => {
    setMessages(prev => [...prev, { id: Date.now(), text: "Scheduling your meeting...", sender: 'bot' }]);

    try {
      // Construct prompt for MCP from args
      const prompt = `Create a meeting with ${args.email} on ${args.meeting_date} at ${args.start_time} for ${args.duration_minutes} minutes.`;

      const res = await axios.post('http://localhost:5000/api/mcp/create', { prompt }, { withCredentials: true });

      if (res.data.success) {
        const newMeeting = res.data.created[0];
        setScheduledMeeting({
          id: newMeeting.id,
          summary: newMeeting.summary,
          start: newMeeting.start,
          end: newMeeting.end
        });
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `🎉 Meeting successfully scheduled for ${args.meeting_date} at ${args.start_time}!`,
          sender: 'bot'
        }]);
      } else if (res.data.hasConflicts) {
        // Handle Conflict
        const conflictMsg = `⚠️ Conflict detected! There is already a meeting at that time.`;
        // In a real app, we would extract free slots from res.data and show them.
        // For now, let's ask the user to pick another time.
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: conflictMsg + " Please suggest a different time.",
          sender: 'bot'
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now(), text: "❌ Failed to schedule meeting. " + err.message, sender: 'bot' }]);
    }
  };

  const executeReschedule = async (args) => {
    if (!scheduledMeeting) {
      // Fallback to schedule if no meeting exists (shouldn't happen with LLM logic)
      return executeSchedule(args);
    }

    setMessages(prev => [...prev, { id: Date.now(), text: "Rescheduling your meeting...", sender: 'bot' }]);

    try {
      // Call new reschedule endpoint (need to create this in mcp.js or use logic here)
      // For simplicity, we will use the resolve-conflict logic or just delete+create
      // Let's assume we implement a specific route, OR just use the create route with logic
      // Actually, the plan said "POST /reschedule". I need to implement that backend route. 
      // For now, let's execute DELETE then CREATE via standard routes if possible, or new route.
      // Let's call the new '/reschedule' route we planned.

      const res = await axios.post('http://localhost:5000/api/mcp/reschedule', {
        oldEventId: scheduledMeeting.id,
        email: args.email,
        meeting_date: args.meeting_date,
        start_time: args.start_time,
        duration_minutes: args.duration_minutes
      }, { withCredentials: true });

      if (res.data.success) {
        const newMeeting = res.data.created[0];
        setScheduledMeeting({
          id: newMeeting.id,
          summary: newMeeting.summary,
          start: newMeeting.start,
          end: newMeeting.end
        });
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `✅ Meeting successfully rescheduled to ${args.meeting_date} at ${args.start_time}!`,
          sender: 'bot'
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now(), text: "❌ Failed to reschedule. " + err.message, sender: 'bot' }]);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const sampleQuestion = "What are the service intervals?";

  return (
    <div className="chatbot-section">
      <h2>Royal Enfield Assistant</h2>



      <div className="chatbot-container">
        <div className="chat-messages">
          {messages.map(message => (
            <div key={message.id} className={`message ${message.sender}`}>
              <div className="message-bubble">
                {message.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="message bot">
              <div className="message-bubble typing">
                <span>...</span>
              </div>
            </div>
          )}
        </div>

        {messages.length === 1 && (
          <div style={{ padding: '10px', textAlign: 'center' }}>
            <button
              onClick={() => handleSendMessage(sampleQuestion)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: '1px solid #ccc',
                background: '#f0f0f0',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Ask: "{sampleQuestion}"
            </button>
          </div>
        )}

        <div className="chat-input">
          <input
            type="text"
            placeholder="Type your question..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isTyping}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={isTyping || !inputText.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;
