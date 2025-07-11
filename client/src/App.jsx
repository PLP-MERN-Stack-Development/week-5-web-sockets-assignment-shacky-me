import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');

function App() {
  const [username, setUsername] = useState('');
  const [inputName, setInputName] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState('');
  const [users, setUsers] = useState([]);
  const [receiver, setReceiver] = useState('');
  const [room, setRoom] = useState('');
  const [file, setFile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    socket.on('receive_message', (data) => setMessages((prev) => [...prev, data]));
    socket.on('typing', (data) => {
      setTypingUser(data);
      setTimeout(() => setTypingUser(''), 2000);
    });
    socket.on('user_list', (userList) => setUsers(userList));
    socket.on('notification', (msg) => setMessages((prev) => [...prev, { sender: 'System', text: msg, timestamp: new Date().toLocaleTimeString() }]));
    socket.on('receive_file', (data) => setMessages((prev) => [...prev, { ...data, file: true }]));
    socket.on('receive_reaction', (data) => setMessages((prev) => [...prev, { ...data, reaction: true }]));
    socket.on('new_message_notification', (data) => setNotifications((prev) => [...prev, `${data.from} sent you a message`]));
    socket.on('user_status', ({ username, status }) => setStatuses((prev) => ({ ...prev, [username]: status })));
    return () => socket.disconnect();
  }, []);

  
  const handleJoin = () => {
    setUsername(inputName);
    socket.emit('set_username', inputName);
  };

  const handleSend = () => {
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit('send_file', {
          sender: username,
          receiver,
          room,
          content: reader.result,
          fileName: file.name
        });
        setFile(null);
      };
      reader.readAsDataURL(file);
    } else if (message.trim()) {
      socket.emit('send_message', {
        sender: username,
        text: message,
        private: !!receiver,
        receiver,
        room
      });
      setMessage('');
    }
  };

  const handleTyping = () => {
    socket.emit('typing', {
      message: `${username} is typing...`,
      receiver,
      room
    });
  };

  const joinRoom = () => {
    if (room.trim()) {
      socket.emit('join_room', room);
    }
  };

  const sendReaction = (reaction) => {
    socket.emit('send_reaction', {
      sender: username,
      receiver,
      room,
      reaction
    });
  };

  if (!username) {
    return (
      <div>
        <h2>Enter your username:</h2>
        <input value={inputName} onChange={(e) => setInputName(e.target.value)} />
        <button onClick={handleJoin}>Join</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Welcome, {username}</h2>

      <div>
        <strong>Online Users:</strong>
        <ul>
          {users.map((u, i) => (
            <li key={i}>
              {u} — <span style={{ color: statuses[u] === 'online' ? 'green' : 'gray' }}>{statuses[u]}</span>
            </li>
          ))}
        </ul>
        <input placeholder="Private message to..." value={receiver} onChange={(e) => setReceiver(e.target.value)} />
        <input placeholder="Join room" value={room} onChange={(e) => setRoom(e.target.value)} />
        <button onClick={joinRoom}>Join Room</button>
      </div>

      <div style={{ height: '300px', overflowY: 'scroll' }}>
        {messages.map((msg, i) => (
          <div key={i}>
            <p><strong>{msg.sender}</strong>: {msg.text || msg.reaction} <em>{msg.timestamp}</em></p>
            {msg.file && <a href={msg.content} download={msg.fileName}>Download {msg.fileName}</a>}
          </div>
        ))}
      </div>

      <p>{typingUser}</p>
      <input
        type="text"
        placeholder="Type a message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleTyping}
        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
      />
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={handleSend}>Send</button>
      <button onClick={() => sendReaction('👍')}>👍</button>
      <button onClick={() => sendReaction('❤️')}>❤️</button>

      <div>
        <h4>🔔 Notifications:</h4>
        <ul>
          {notifications.map((note, i) => <li key={i}>{note}</li>)}
        </ul>
      </div>
    </div>
  );
}

export default App;
