const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// CORS for Socket.io (Frontend Vercel ya Localhost se connect karne ke liye)
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// ==========================================
// 🗄️ IN-MEMORY DATABASE (Testing ke liye)
// ==========================================
let users = [
    { username: 'admin', dp: 'https://ui-avatars.com/api/?name=Admin&background=e1306c&color=fff', coins: 5000 },
    { username: 'priya_99', dp: 'https://ui-avatars.com/api/?name=Priya&background=00a8ff&color=fff', coins: 150 },
    { username: 'rahul_bhai', dp: 'https://ui-avatars.com/api/?name=Rahul&background=2ed573&color=fff', coins: 300 }
];
let messagesDB = [];
let feedbacksDB = [];
let onlineUsers = new Set();

// ==========================================
// 🌐 REST API ROUTES (Frontend Calls)
// ==========================================

// 1. Get All Users (DMs ke liye)
app.get('/api/users', (req, res) => {
    res.json({ users });
});

// 2. Get Specific User & Update Global List
app.get('/api/users/:username', (req, res) => {
    // Agar koi naya user login kar raha hai jo list mein nahi hai, toh use add kar lo
    const { username } = req.params;
    if (!users.find(u => u.username === username)) {
        users.push({ 
            username, 
            dp: `https://ui-avatars.com/api/?name=${username}&background=random&color=fff`, 
            coins: 0 
        });
        io.emit('new_user_joined'); // Sabko batao naya banda aaya hai
    }
    res.json(users);
});

// 3. Get Chat History Between 2 Users
app.get('/api/chats/:room', (req, res) => {
    const { room } = req.params;
    const chatHistory = messagesDB.filter(m => m.room === room);
    res.json(chatHistory);
});

app.get('/api/messages/:user1/:user2', (req, res) => {
    const room = [req.params.user1, req.params.user2].sort().join('_');
    const chatHistory = messagesDB.filter(m => m.room === room);
    res.json({ messages: chatHistory });
});

// 4. Save New Message (REST fallback)
app.post('/api/messages', (req, res) => {
    const msg = req.body;
    if (!msg.room) msg.room = [msg.sender, msg.receiver].sort().join('_');
    if (!msg.timestamp) msg.timestamp = Date.now();
    messagesDB.push(msg);
    res.json({ success: true, message: msg });
});

// 5. User Data & Coins (Top Nav ke liye)
app.get('/api/user-data/:username', (req, res) => {
    const user = users.find(u => u.username === req.params.username);
    res.json({ coins: user ? user.coins : 0 });
});

// 6. Reward Coins (Ads dekhne par)
app.post('/api/reward-ad', (req, res) => {
    const { username } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        user.coins += 10; // Har ad ka 10 coin
    }
    res.json({ success: true });
});

// 7. Feedbacks (Live Board ke liye)
app.get('/api/feedbacks', (req, res) => {
    res.json({ feedbacks: feedbacksDB });
});

app.post('/api/feedbacks', (req, res) => {
    const fb = req.body;
    feedbacksDB.push(fb);
    res.json({ success: true });
});

// 8. Dummy Videos (Home/Shorts/Search crash na ho isliye)
app.get('/api/videos', (req, res) => {
    res.json({
        results: [
            { videoId: 'dQw4w9WgXcQ', title: 'Top 10 Coding Tips', author: 'Tech Bro', thumbnail: 'https://via.placeholder.com/300x200' },
            { videoId: 'jNQXAC9IVRw', title: 'Funny Meme Compilation', author: 'Meme King', thumbnail: 'https://via.placeholder.com/300x200' }
        ]
    });
});


// ==========================================
// ⚡ SOCKET.IO (Real-time Jadoo)
// ==========================================

io.on('connection', (socket) => {
    console.log('⚡ User Connected:', socket.id);

    // 🟢 User Online Hua
    socket.on('go_online', (username) => {
        socket.username = username;
        onlineUsers.add(username);
        io.emit('online_users_update', Array.from(onlineUsers));
    });

    // 🚪 Chat Room Join
    socket.on('join_room', (room) => {
        socket.join(room);
    });

    // 📩 Message Bhejna
    socket.on('send_message', (data) => {
        messagesDB.push(data); // Save in backend RAM
        socket.to(data.room).emit('receive_message', data); // Dusre user ko bhejo
        io.emit('global_inbox_update'); // DMs list update karne ke liye
    });

    // 👀 Message Seen
    socket.on('mark_seen', ({ room, viewer }) => {
        messagesDB = messagesDB.map(m => {
            if (m.room === room && m.sender !== viewer) {
                return { ...m, status: 'seen' };
            }
            return m;
        });
        io.to(room).emit('messages_seen', room);
    });

    // ✍️ Typing Status (Room)
    socket.on('typing', ({ room, sender }) => {
        socket.to(room).emit('user_typing', sender);
    });
    socket.on('stop_typing', ({ room }) => {
        socket.to(room).emit('user_stopped_typing');
    });

    // ✍️ Global Typing Status (List ke upar dikhane ke liye)
    socket.on('typing_global', (data) => {
        io.emit('global_typing_status', { ...data, isTyping: true });
    });
    socket.on('stop_typing_global', (data) => {
        io.emit('global_typing_status', { ...data, isTyping: false });
    });

    // 📢 Real-Time Feedback (Sabko instantly dikhane ke liye)
    socket.on('send_feedback', (data) => {
        // Broadcast to everyone EXCEPT sender (sender ne already optimistic UI se add kar liya hai)
        socket.broadcast.emit('receive_feedback', data); 
    });

    // 🔴 User Offline Hua
    socket.on('disconnect', () => {
        console.log('❌ User Disconnected:', socket.id);
        if (socket.username) {
            onlineUsers.delete(socket.username);
            io.emit('online_users_update', Array.from(onlineUsers));
        }
    });
});

// ==========================================
// 🚀 SERVER START
// ==========================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🔥 Backend Engine is running like a Ferrari on http://localhost:${PORT}`);
});