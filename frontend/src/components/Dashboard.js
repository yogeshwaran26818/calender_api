import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import CreateEventModal from './CreateEventModal';
import Chatbot from './Chatbot';

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [mcpPrompt, setMcpPrompt] = useState('');
  const [mcpLoading, setMcpLoading] = useState(false);
  const [conflicts, setConflicts] = useState(null);
  const [conflictAction, setConflictAction] = useState('overwrite');
  const [rescheduleTime, setRescheduleTime] = useState({});

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await axios.get('http://localhost:5000/auth/user', { withCredentials: true });
      if (response.data.success) {
        setUser(response.data.user);
        fetchCalendarEvents();
      } else {
        navigate('/login');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarEvents = async () => {
    setCalendarLoading(true);
    try {
      const res = await axios.get("http://localhost:5000/api/calendar", {
        withCredentials: true
      });
      const fetchedEvents = res.data.events || [];
      // For initial load, just set events directly
      setEvents(fetchedEvents);
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
      if (err.response?.data?.reauth) {
        setError('Calendar permissions required. Please re-authenticate.');
      } else {
        setError('Failed to load calendar events');
      }
    } finally {
      setCalendarLoading(false);
    }
  };

  const formatEventTime = (event) => {
    const start = event.start?.dateTime || event.start?.date;
    const end = event.end?.dateTime || event.end?.date;
    
    if (!start) return 'No time specified';
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (event.start?.date) {
      return startDate.toLocaleDateString();
    }
    
    const options = { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    };
    
    return `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], options)} - ${endDate.toLocaleTimeString([], options)}`;
  };


  // Enhanced: handle single or batch event creation from MCP
  const handleEventCreated = (result) => {
    if (!result) return;
    // If batch (MCP), result may be { created: [...], requested: N }
    if (result.created && Array.isArray(result.created)) {
      setEvents(prev => [...result.created, ...prev]);
      setSuccessMessage(`Created ${result.created.length} meeting${result.created.length > 1 ? 's' : ''} via AI!`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } else {
      // Single event (manual or legacy MCP)
      setEvents(prev => [result, ...prev]);
      setSuccessMessage('Event Created Successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
    // Refresh calendar: merge new events from API without overwriting created ones
    refreshCalendarEvents();
  };

  const refreshCalendarEvents = async () => {
    setCalendarLoading(true);
    try {
      const res = await axios.get("http://localhost:5000/api/calendar", {
        withCredentials: true
      });
      const fetchedEvents = res.data.events || [];
      // Merge: keep any already-displayed events, add new ones from API
      setEvents(prev => {
        const existingIds = new Set(prev.map(e => e.id));
        const newEvents = fetchedEvents.filter(e => !existingIds.has(e.id));
        return [...prev, ...newEvents];
      });
    } catch (err) {
      console.error("Failed to refresh calendar events:", err);
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleReauth = () => {
    window.location.href = 'http://localhost:5000/auth/google';
  };

  const handleLogout = async () => {
    try {
      await axios.post('http://localhost:5000/auth/logout', {}, { withCredentials: true });
      navigate('/login');
    } catch (error) {
      setError('Logout failed. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <h2>Loading...</h2>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div className="dashboard-container">
      <div className="user-card">
        <h1>Welcome to Dashboard</h1>
        
        <img 
          src={user.picture} 
          alt="Profile" 
          className="user-avatar"
        />
        
        <h2>{user.name}</h2>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>User ID:</strong> {user.id}</p>
        
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
        
        {error && (
          <div className="error-message">
            {error}
            {error.includes('re-authenticate') && (
              <button className="reauth-btn" onClick={handleReauth}>
                Re-authenticate
              </button>
            )}
          </div>
        )}
      </div>
      
      <div className="mcp-section">
        <h2>AI Event Creation</h2>
        <div className="mcp-sample">
          <p><strong>Sample:</strong> "Create a team meeting tomorrow at 2 PM for 1 hour with john@example.com and add Google Meet"</p>
        </div>
        <div className="mcp-input-container">
          <input
            type="text"
            placeholder="Describe your event in natural language..."
            className="mcp-input"
            value={mcpPrompt}
            onChange={(e) => setMcpPrompt(e.target.value)}
            disabled={mcpLoading}
          />
          <button 
            className="mcp-create-btn"
            onClick={async () => {
              if (!mcpPrompt.trim()) return;
              setMcpLoading(true);
              try {
                const res = await axios.post('http://localhost:5000/api/mcp/create', { prompt: mcpPrompt }, { withCredentials: true });
                if (res.data.success) {
                  // Support both batch and single event responses
                  if (res.data.created && Array.isArray(res.data.created)) {
                    handleEventCreated({ created: res.data.created });
                  } else if (res.data.event) {
                    handleEventCreated(res.data.event);
                  }
                  // Show duration message if provided
                  if (res.data.message) {
                    setSuccessMessage(res.data.message);
                    setTimeout(() => setSuccessMessage(''), 5000);
                  }
                  setMcpPrompt('');
                } else if (res.data.hasConflicts) {
                  // Handle conflicts
                  setConflicts({
                    data: res.data,
                    prompt: mcpPrompt
                  });
                  setError('');
                  setMcpLoading(false);
                  return;
                } else {
                  setError(res.data.error || 'Failed to create event');
                }
              } catch (err) {
                console.error('MCP create failed:', err);
                if (err.response?.status === 401) {
                  setError('Session expired. Please login again.');
                  setTimeout(() => handleReauth(), 1000);
                } else if (err.response?.data?.reauth) {
                  setError('Calendar permissions required. Re-authenticating...');
                  setTimeout(() => handleReauth(), 1000);
                } else {
                  setError(err.response?.data?.error || err.message || 'Failed to create event');
                }
              } finally {
                setMcpLoading(false);
              }
            }}
            disabled={mcpLoading || !mcpPrompt.trim()}
          >
            {mcpLoading ? 'Creating...' : 'Create with AI'}
          </button>
        </div>
      </div>
      
      {conflicts && (
        <div className="conflict-modal" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="conflict-card" style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '10px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ color: '#ff6b35', marginBottom: '20px' }}>⚠️ Scheduling Conflict Detected!</h3>
            <p style={{ marginBottom: '20px', fontSize: '16px' }}>
              Your new meeting conflicts with {conflicts.data.conflicts?.length || 0} existing event(s).
            </p>
            
            <div className="conflicts-list" style={{ marginBottom: '25px' }}>
              {conflicts.data.conflicts?.map((c, idx) => (
                <div key={idx} className="conflict-item" style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  padding: '15px',
                  marginBottom: '15px',
                  backgroundColor: '#f9f9f9'
                }}>
                  <div style={{ marginBottom: '10px' }}>
                    <strong style={{ color: '#2196F3' }}>📅 New Meeting:</strong>
                    <div style={{ marginLeft: '20px', marginTop: '5px' }}>
                      <strong>{c.proposedEvent.title}</strong><br/>
                      📅 {c.proposedEvent.date}<br/>
                      ⏰ {c.proposedEvent.start} - {c.proposedEvent.end}<br/>
                      {c.proposedEvent.guests?.length > 0 && (
                        <span>👥 Guests: {c.proposedEvent.guests.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <strong style={{ color: '#ff6b35' }}>⚠️ Conflicts with:</strong>
                    <div style={{ marginLeft: '20px', marginTop: '5px' }}>
                      <strong>{c.conflictingEvent.title}</strong><br/>
                      📅 {new Date(c.conflictingEvent.start.dateTime || c.conflictingEvent.start.date).toLocaleDateString()}<br/>
                      ⏰ {new Date(c.conflictingEvent.start.dateTime || c.conflictingEvent.start.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true})} - {new Date(c.conflictingEvent.end.dateTime || c.conflictingEvent.end.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true})}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="conflict-options" style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px', color: '#333' }}>How would you like to resolve this conflict?</h4>
              <div className="radio-group" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {conflicts.data.options?.map(option => (
                  <label key={option.value} style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px',
                    border: '2px solid',
                    borderColor: conflictAction === option.value ? '#2196F3' : '#e0e0e0',
                    borderRadius: '8px',
                    backgroundColor: conflictAction === option.value ? '#f0f8ff' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}>
                    <input 
                      type="radio" 
                      value={option.value}
                      checked={conflictAction === option.value}
                      onChange={(e) => setConflictAction(e.target.value)}
                      style={{ marginRight: '10px' }}
                    />
                    <span style={{ fontSize: '15px', fontWeight: conflictAction === option.value ? 'bold' : 'normal' }}>
                      {option.value === 'overwrite' && '🔄 '}
                      {option.value === 'postpone_existing' && '📅 '}
                      {option.value === 'reschedule_new' && '⏰ '}
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
              
              {(conflictAction === 'postpone_existing' || conflictAction === 'reschedule_new') && (
                <div className="reschedule-time" style={{
                  marginTop: '20px',
                  padding: '20px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #dee2e6'
                }}>
                  <h4 style={{ marginBottom: '15px', color: '#495057' }}>
                    ⏰ Select new time for {conflictAction === 'postpone_existing' ? 'existing meeting' : 'new meeting'}:
                  </h4>
                  <div className="time-inputs" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap'
                  }}>
                    <input 
                      type="date" 
                      value={rescheduleTime?.date || ''}
                      onChange={(e) => setRescheduleTime(prev => ({ ...prev, date: e.target.value }))}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '14px'
                      }}
                    />
                    <select 
                      value={rescheduleTime?.startHour || '09'}
                      onChange={(e) => setRescheduleTime(prev => ({ ...prev, startHour: e.target.value }))}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '14px'
                      }}
                    >
                      {Array.from({length: 12}, (_, i) => {
                        const hour = (i + 1).toString().padStart(2, '0');
                        return <option key={hour} value={hour}>{hour}</option>;
                      })}
                    </select>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>:</span>
                    <select 
                      value={rescheduleTime?.startMinute || '00'}
                      onChange={(e) => setRescheduleTime(prev => ({ ...prev, startMinute: e.target.value }))}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '14px'
                      }}
                    >
                      {['00', '15', '30', '45'].map(min => 
                        <option key={min} value={min}>{min}</option>
                      )}
                    </select>
                    <select 
                      value={rescheduleTime?.startAmPm || 'AM'}
                      onChange={(e) => setRescheduleTime(prev => ({ ...prev, startAmPm: e.target.value }))}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '14px'
                      }}
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="conflict-actions" style={{
              display: 'flex',
              gap: '15px',
              justifyContent: 'flex-end'
            }}>
              <button 
                className="cancel-btn"
                onClick={() => {
                  setConflicts(null);
                  setRescheduleTime({});
                }}
                disabled={mcpLoading}
                style={{
                  padding: '12px 24px',
                  border: '2px solid #6c757d',
                  backgroundColor: 'white',
                  color: '#6c757d',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                Cancel
              </button>
              <button 
                className="confirm-btn"
                onClick={async () => {
                  if ((conflictAction === 'postpone_existing' || conflictAction === 'reschedule_new') && 
                      (!rescheduleTime?.date || !rescheduleTime?.startHour)) {
                    setError('Please select a new time');
                    return;
                  }
                  
                  setMcpLoading(true);
                  try {
                    const conflictIndices = conflicts.data.conflicts?.map(c => c.instanceIdx) || [];
                    const res = await axios.post('http://localhost:5000/api/mcp/resolve-conflict', {
                      action: conflictAction,
                      conflictIndices,
                      instances: conflicts.data.instances,
                      conflicts: conflicts.data.conflicts,
                      prompt: conflicts.data.prompt,
                      rescheduleTime: (conflictAction === 'postpone_existing' || conflictAction === 'reschedule_new') ? rescheduleTime : undefined
                    }, { withCredentials: true });

                    if (res.data.success) {
                      handleEventCreated({ created: res.data.created });
                      setConflicts(null);
                      setRescheduleTime({});
                      setMcpPrompt('');
                    } else {
                      setError('Failed to resolve conflicts');
                    }
                  } catch (err) {
                    console.error('Conflict resolution failed:', err);
                    setError(err.response?.data?.error || 'Failed to resolve conflicts');
                  } finally {
                    setMcpLoading(false);
                  }
                }}
                disabled={mcpLoading}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  backgroundColor: mcpLoading ? '#ccc' : '#28a745',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: mcpLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                {mcpLoading ? '⏳ Processing...' : '✅ Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="calendar-section">
        <div className="calendar-header">
          <h2>Upcoming Calendar Events</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="cleanup-btn" 
              onClick={async () => {
                if (!confirm('This will remove duplicate events from your calendar. Continue?')) return;
                setCalendarLoading(true);
                try {
                  const res = await axios.post('http://localhost:5000/api/mcp/cleanup-duplicates', {}, { withCredentials: true });
                  if (res.data.success) {
                    setSuccessMessage(`Cleaned up ${res.data.deleted} duplicate events!`);
                    setTimeout(() => setSuccessMessage(''), 4000);
                    fetchCalendarEvents(); // Refresh the list
                  } else {
                    setError('Failed to cleanup duplicates');
                  }
                } catch (err) {
                  console.error('Cleanup failed:', err);
                  setError(err.response?.data?.error || 'Failed to cleanup duplicates');
                } finally {
                  setCalendarLoading(false);
                }
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ff6b35',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              🧹 Cleanup Duplicates
            </button>
            <button className="create-event-btn" onClick={() => setShowModal(true)}>
              + Create Event
            </button>
          </div>
        </div>
        
        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}
        
        {calendarLoading ? (
          <p>Loading calendar events...</p>
        ) : error && error.includes('re-authenticate') ? (
          <div className="reauth-message">
            <p>Calendar permissions required to view events.</p>
            <button className="reauth-btn" onClick={handleReauth}>
              Re-authenticate with Google
            </button>
          </div>
        ) : events.length > 0 ? (
          <div className="events-list">
            {events.map((event, index) => {
              // Try to get Google Meet link and attendees from both Google and MCP event shapes
              let meetLink = null;
              if (event.conferenceData?.entryPoints?.length) {
                meetLink = event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video')?.uri;
              } else if (event.meetLink) {
                meetLink = event.meetLink;
              }
              let attendees = event.attendees || event.guests || [];
              return (
                <div key={event.id || index} className="event-card">
                  <h3>{event.summary || event.title || 'No Title'}</h3>
                  <p className="event-time">{formatEventTime(event)}</p>
                  {event.description && (
                    <p className="event-description">{event.description}</p>
                  )}
                  {event.location && (
                    <p className="event-location">📍 {event.location}</p>
                  )}
                  {meetLink && <p className="event-meet">
                    <a href={meetLink} target="_blank" rel="noopener noreferrer">
                      🎥 Join Google Meet
                    </a>
                  </p>}
                  {event.htmlLink && <p className="event-html-link">
                    <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
                      📅 Open in Google Calendar
                    </a>
                  </p>}
                  {event.organizer && event.organizer.email && <p className="event-organizer">
                    <strong>Organizer:</strong> {event.organizer.email}
                  </p>}
                  {attendees.length > 0 && <p className="event-attendees">
                    <strong>Guests:</strong> {attendees.map(a => (a.email ? a.email : a)).join(', ')}
                  </p>}
                  {event.id && (
                    <button 
                      className="delete-event-btn"
                      onClick={async () => {
                        if (!confirm(`Delete "${event.summary || event.title}"?`)) return;
                        try {
                          const res = await axios.delete(`http://localhost:5000/api/mcp/event/${event.id}`, { withCredentials: true });
                          if (res.data.success) {
                            setEvents(prev => prev.filter(e => e.id !== event.id));
                            setSuccessMessage('Event deleted successfully!');
                            setTimeout(() => setSuccessMessage(''), 3000);
                          } else {
                            setError('Failed to delete event');
                          }
                        } catch (err) {
                          console.error('Delete failed:', err);
                          setError(err.response?.data?.error || 'Failed to delete event');
                        }
                      }}
                      style={{
                        marginTop: '10px',
                        padding: '6px 12px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      🗑️ Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p>No upcoming events found.</p>
        )}
      </div>
      
      <Chatbot />
      
      <CreateEventModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onEventCreated={handleEventCreated}
        onReauth={handleReauth}
        user={user}
      />
    </div>
  );
};

export default Dashboard;