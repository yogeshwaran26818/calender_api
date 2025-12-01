import React, { useState } from 'react';
import axios from 'axios';

const CreateEventModal = ({ isOpen, onClose, onEventCreated, onReauth, user }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    startHour: '09',
    startMinute: '00',
    startAmPm: 'AM',
    endHour: '10',
    endMinute: '00',
    endAmPm: 'AM',
    timeZone: 'Asia/Kolkata',
    addMeet: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [guests, setGuests] = useState([]);
  const [guestInput, setGuestInput] = useState('');
  
  const organizer = {
    name: user?.name || 'User',
    email: user?.email || '',
    picture: user?.picture || 'https://via.placeholder.com/32'
  };

  const convertTo24Hour = (hour, minute, ampm) => {
    let h = parseInt(hour);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${minute}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const startTime = convertTo24Hour(formData.startHour, formData.startMinute, formData.startAmPm);
    const endTime = convertTo24Hour(formData.endHour, formData.endMinute, formData.endAmPm);

    const eventData = {
      title: formData.title,
      description: formData.description,
      date: formData.date,
      startTime,
      endTime,
      timeZone: formData.timeZone,
      addMeet: formData.addMeet
    };

    try {
      const response = await axios.post('/api/calendar/create-event', eventData, {
        withCredentials: true
      });

      if (response.data.success) {
        onEventCreated(response.data.event);
        onClose();
        setFormData({
          title: '',
          description: '',
          date: '',
          startHour: '09',
          startMinute: '00',
          startAmPm: 'AM',
          endHour: '10',
          endMinute: '00',
          endAmPm: 'AM',
          timeZone: 'Asia/Kolkata',
          addMeet: false
        });
        setGuests([]);
        setGuestInput('');
      }
    } catch (err) {
      if (err.response?.data?.reauth) {
        setError('Calendar permissions required. Please re-authenticate.');
      } else {
        setError(err.response?.data?.error || 'Failed to create event');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleAddGuest = (e) => {
    if (e.key === 'Enter' && guestInput.trim()) {
      e.preventDefault();
      const email = guestInput.trim();
      if (!guests.find(g => g.email === email)) {
        setGuests(prev => [...prev, { email, permissions: 'see_event' }]);
      }
      setGuestInput('');
    }
  };

  const handleRemoveGuest = (email) => {
    setGuests(prev => prev.filter(g => g.email !== email));
  };

  const handleToggleVisibility = (email) => {
    setGuests(prev => prev.map(g => 
      g.email === email 
        ? { ...g, permissions: g.permissions === 'see_event' ? 'modify_event' : 'see_event' }
        : g
    ));
  };

  const getInitials = (email) => {
    return email.charAt(0).toUpperCase();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Create Event</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
            />
          </div>

          <div className="form-group">
            <label>Date *</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Time *</label>
              <div className="time-picker">
                <select name="startHour" value={formData.startHour} onChange={handleChange}>
                  {Array.from({length: 12}, (_, i) => {
                    const hour = (i + 1).toString().padStart(2, '0');
                    return <option key={hour} value={hour}>{hour}</option>;
                  })}
                </select>
                <span>:</span>
                <select name="startMinute" value={formData.startMinute} onChange={handleChange}>
                  {['00', '15', '30', '45'].map(min => 
                    <option key={min} value={min}>{min}</option>
                  )}
                </select>
                <select name="startAmPm" value={formData.startAmPm} onChange={handleChange}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>End Time *</label>
              <div className="time-picker">
                <select name="endHour" value={formData.endHour} onChange={handleChange}>
                  {Array.from({length: 12}, (_, i) => {
                    const hour = (i + 1).toString().padStart(2, '0');
                    return <option key={hour} value={hour}>{hour}</option>;
                  })}
                </select>
                <span>:</span>
                <select name="endMinute" value={formData.endMinute} onChange={handleChange}>
                  {['00', '15', '30', '45'].map(min => 
                    <option key={min} value={min}>{min}</option>
                  )}
                </select>
                <select name="endAmPm" value={formData.endAmPm} onChange={handleChange}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Time Zone</label>
            <select
              name="timeZone"
              value={formData.timeZone}
              onChange={handleChange}
            >
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Add Guests</label>
            <div className="guests-container">
              <input
                type="email"
                placeholder="Add guests"
                value={guestInput}
                onChange={(e) => setGuestInput(e.target.value)}
                onKeyPress={handleAddGuest}
                className="guest-input"
              />
              
              <div className="guests-list">
                {/* Organizer */}
                <div className="guest-item organizer">
                  <div className="guest-avatar">
                    <img src={organizer.picture} alt={organizer.name} />
                  </div>
                  <div className="guest-info">
                    <div className="guest-name">{organizer.name}</div>
                    <div className="guest-label">Organizer</div>
                  </div>
                </div>
                
                {/* Guests */}
                {guests.map((guest) => (
                  <div key={guest.email} className="guest-item">
                    <div className="guest-avatar guest-avatar-letter">
                      {getInitials(guest.email)}
                    </div>
                    <div className="guest-info">
                      <div className="guest-email">{guest.email}</div>
                    </div>
                    <div className="guest-actions">
                      <button
                        type="button"
                        className={`permission-btn ${guest.permissions}`}
                        onClick={() => handleToggleVisibility(guest.email)}
                        title={guest.permissions === 'see_event' ? 'Can see event' : 'Can modify event'}
                      >
                        👁
                      </button>
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => handleRemoveGuest(guest.email)}
                        title="Remove guest"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                name="addMeet"
                checked={formData.addMeet}
                onChange={handleChange}
              />
              Add Google Meet Video Conferencing
            </label>
          </div>

          {error && (
            <div className="error-message">
              {error}
              {error.includes('re-authenticate') && (
                <button type="button" className="reauth-btn" onClick={onReauth}>
                  Re-authenticate
                </button>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className="create-btn">
              {loading ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEventModal;