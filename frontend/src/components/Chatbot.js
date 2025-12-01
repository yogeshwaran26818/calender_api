import React, { useState } from 'react';
import axios from 'axios';

const Chatbot = () => {
  const [messages, setMessages] = useState([
    { id: 1, text: "Hi, I am reaching out from Royal Enfield. We are excited to introduce a new product and would like to schedule a meeting with you to share the details and explore how it could be valuable for you. Please let us know a convenient time for the discussion.", sender: 'bot' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [meetingData, setMeetingData] = useState({ title: 'Royal Enfield Product Discussion', attendees: [] });

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage = {
      id: Date.now(),
      text: inputText,
      sender: 'user'
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputText;
    setInputText('');
    setIsTyping(true);

    setTimeout(async () => {
      const botResponse = await processWithLLM(currentInput);
      
      if (botResponse) {
        const response = {
          id: Date.now() + 1,
          text: botResponse,
          sender: 'bot'
        };
        setMessages(prev => [...prev, response]);
      }
      setIsTyping(false);
    }, 1000);
  };

  const processWithLLM = async (userMessage) => {
    try {
      // First, extract and update meeting data from user message
      const updatedMeetingData = extractMeetingInfo(userMessage);
      
      const prompt = `You are a calendar scheduling assistant for a chatbot.

Your role:
- Understand the user's latest message.
- Check what meeting details are already known.
- Determine which details are still missing.
- Either ask the user for one missing detail OR output a complete meeting creation JSON.

---------------------------------------
MANDATORY RULES
---------------------------------------

1. Ask ONLY ONE QUESTION AT A TIME.
2. NEVER ask for information that is already provided.
3. If ANY detail is missing → return **ask_user**.
4. If ALL required details are present → return **schedule_meeting** with JSON.
5. Extract ALL information from the user's current message and combine with known data.

---------------------------------------
REQUIRED FIELDS TO SCHEDULE A MEETING
---------------------------------------
A meeting can only be scheduled when you have:

- **title**
- **date**
- **time**
- **duration**
- **attendees** (can be empty, but must exist as an array)

---------------------------------------
OUTPUT FORMAT
---------------------------------------

### If more information is needed:
Use:
ask_user: "<your question>"

Examples:
ask_user: "Sure! What date works best for you?"
ask_user: "Got it. And what time would you prefer?"

### If meeting can be scheduled:
Use:
schedule_meeting: {
  "title": "<title>",
  "date": "<date>",
  "time": "<time>",
  "duration": "<duration>",
  "attendees": ["email1@example.com", "email2@example.com"]
}

---------------------------------------
CURRENT KNOWN DATA
---------------------------------------
Title: ${updatedMeetingData.title || 'null'}
Date: ${updatedMeetingData.date || 'null'}
Time: ${updatedMeetingData.time || 'null'}
Duration: ${updatedMeetingData.duration || 'null'}
Attendees: ${JSON.stringify(updatedMeetingData.attendees)}

User said: "${userMessage}"

---------------------------------------
YOUR TASK
---------------------------------------
1. Extract ALL meeting details from the user's message.
2. Combine with existing known data.
3. Check which fields are still missing.
4. If anything is missing → ask an appropriate question.
5. If everything is present → output the schedule_meeting JSON.

Respond ONLY in one of these two forms:
- ask_user: "<question>"
- schedule_meeting: { ... JSON ... }`;

      const response = await axios.post('http://localhost:5000/api/llm/process', {
        prompt: prompt
      }, { withCredentials: true });

      const result = response.data.response;
      
      if (result.startsWith('ask_user:')) {
        const question = result.replace('ask_user:', '').trim().replace(/^"|"$/g, '');
        // Update meeting data with extracted info BEFORE asking next question
        setMeetingData(updatedMeetingData);
        console.log('Updated meeting data:', updatedMeetingData);
        return question;
      } else if (result.startsWith('schedule_meeting:')) {
        const jsonStr = result.replace('schedule_meeting:', '').trim();
        const meetingDetails = JSON.parse(jsonStr);
        
        // Update meeting data
        setMeetingData(meetingDetails);
        
        // Schedule the meeting
        setTimeout(async () => {
          const scheduleResult = await scheduleMeeting(meetingDetails);
          const response = {
            id: Date.now() + 2,
            text: scheduleResult,
            sender: 'bot'
          };
          setMessages(prev => [...prev, response]);
          setMeetingData({ title: 'Royal Enfield Product Discussion', attendees: [] });
        }, 500);
        
        return `Perfect! Here's your meeting summary:
📅 Title: ${meetingDetails.title}
📆 Date: ${meetingDetails.date}
⏰ Time: ${meetingDetails.time}
⏱️ Duration: ${meetingDetails.duration}
👥 Attendees: ${meetingDetails.attendees.length > 0 ? meetingDetails.attendees.join(', ') : 'Just you'}

Creating your meeting now...`;
      }
      
      return result;
    } catch (error) {
      console.error('LLM processing error:', error);
      return "I'm having trouble processing your request. Could you please try again?";
    }
  };

  const extractMeetingInfo = (userMessage) => {
    const lower = userMessage.toLowerCase();
    const newData = { ...meetingData };
    
    // Extract date information - only update if not already set
    if (!newData.date) {
      if (lower.includes('tomorrow')) newData.date = 'tomorrow';
      else if (lower.includes('coming sunday') || lower.includes('this sunday')) newData.date = 'next Sunday';
      else if (lower.includes('this week sunday')) newData.date = 'this Sunday';
      else if (lower.includes('next monday')) newData.date = 'next Monday';
      else if (lower.includes('next tuesday')) newData.date = 'next Tuesday';
      else if (lower.includes('next wednesday')) newData.date = 'next Wednesday';
      else if (lower.includes('next thursday')) newData.date = 'next Thursday';
      else if (lower.includes('next friday')) newData.date = 'next Friday';
      else if (lower.includes('next saturday')) newData.date = 'next Saturday';
      else if (lower.includes('next sunday')) newData.date = 'next Sunday';
      else if (lower.includes('monday')) newData.date = 'Monday';
      else if (lower.includes('tuesday')) newData.date = 'Tuesday';
      else if (lower.includes('wednesday')) newData.date = 'Wednesday';
      else if (lower.includes('thursday')) newData.date = 'Thursday';
      else if (lower.includes('friday')) newData.date = 'Friday';
      else if (lower.includes('saturday')) newData.date = 'Saturday';
      else if (lower.includes('sunday')) newData.date = 'Sunday';
    }
    
    // Extract specific dates (November 19th, 23rd November, etc.)
    const dateMatch = userMessage.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(st|nd|rd|th)?/i) || 
                     userMessage.match(/\d{1,2}(st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i);
    if (dateMatch && !newData.date) {
      newData.date = dateMatch[0];
    }
    
    // Extract time information - only update if not already set
    if (!newData.time) {
      const timeMatch = userMessage.match(/\d{1,2}(:\d{2})?\s*(am|pm)/i) || 
                       userMessage.match(/(morning|evening|afternoon)\s+\d{1,2}\s*(am|pm)/i);
      if (timeMatch) {
        newData.time = timeMatch[0];
      }
    }
    
    // Extract duration - only update if not already set
    if (!newData.duration) {
      const durationMatch = userMessage.match(/(\d+)\s*(and\s+half\s+)?(hour|hours|minute|minutes)/i) ||
                           userMessage.match(/(\d+\.\d+)\s*(hour|hours)/i);
      if (durationMatch) {
        if (lower.includes('and half')) {
          newData.duration = durationMatch[1] + '.5 hours';
        } else {
          newData.duration = durationMatch[0];
        }
      }
    }
    
    // Extract emails - only add new ones
    const emails = userMessage.match(/[\w.-]+@[\w.-]+\.[\w]+/g);
    if (emails && emails.length > 0) {
      const existingEmails = newData.attendees || [];
      const newEmails = emails.filter(email => !existingEmails.includes(email));
      newData.attendees = [...existingEmails, ...newEmails];
    }
    
    // If user says "no" or "just me" for attendees and attendees not set
    if ((lower.includes('just me') || lower.includes('no one') || lower === 'no') && !newData.hasOwnProperty('attendees')) {
      newData.attendees = [];
    }
    
    return newData;
  };

  const scheduleMeeting = async (details) => {
    try {
      const prompt = `Create a meeting titled "${details.title}" on ${details.date} at ${details.time} for ${details.duration}${details.attendees && details.attendees.length > 0 ? ` with attendees: ${details.attendees.join(', ')}` : ''}`;
      
      const response = await axios.post('http://localhost:5000/api/mcp/create', {
        prompt: prompt
      }, { withCredentials: true });
      
      if (response.data.success) {
        return `🎉 Perfect! I've successfully scheduled your meeting "${details.title}". You should see it in your calendar now. Is there anything else I can help you with?`;
      } else {
        return `I encountered an issue scheduling your meeting: ${response.data.error || 'Unknown error'}. Would you like to try again with different details?`;
      }
    } catch (error) {
      console.error('Scheduling error:', error);
      return `Sorry, I couldn't schedule your meeting due to a technical issue: ${error.response?.data?.error || error.message}. Please try again later.`;
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <div className="chatbot-section">
      <h2>Calendar Assistant</h2>
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
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}
        </div>
        <div className="chat-input">
          <input
            type="text"
            placeholder="Type your message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isTyping}
          />
          <button 
            onClick={handleSendMessage}
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