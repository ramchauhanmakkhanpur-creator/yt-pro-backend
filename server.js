const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const ytSearch = require('yt-search');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

if (!fs.existsSync('./data')) fs.mkdirSync('./data');
const USERS_FILE = './data/users.json';
const CHATS_FILE = './data/chats.json';

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, '[]');

// 🔥 RAM CACHE ENGINE (1000x Faster)
let memoryUsers = [];
let memoryChats = [];

try { memoryUsers = JSON.parse(fs.readFileSync(USERS_FILE)); } catch(e) { memoryUsers = []; }
try { memoryChats = JSON.parse(fs.readFileSync(CHATS_FILE)); } catch(e) { memoryChats = []; }

const getUsers = () => memoryUsers;
const getChats = () => memoryChats;

const saveUsers = (data) => { 
    memoryUsers = data; 
    fs.writeFile(USERS_FILE, JSON.stringify(data), (err) => { if(err) console.log("User save err"); }); 
};
const saveChats = (data) => { 
    memoryChats = data; 
    fs.writeFile(CHATS_FILE, JSON.stringify(data), (err) => { if(err) console.log("Chat save err"); }); 
};

// 📺 YOUTUBE API
app.get('/api/videos', async (req, res) => {
    const { type, q, page = 1 } = req.query;
    try {
        let query = type === 'home' ? `trending viral videos india part ${page}` : type === 'shorts' ? `viral shorts ${page}` : `${q} part ${page}`;
        const r = await ytSearch(query);
        let videos = r.videos;
        if (type === 'shorts') videos = videos.filter(v => v.seconds < 120);
        res.json({ results: videos.map(v => ({ videoId: v.videoId, title: v.title, thumbnail: v.image, duration: v.timestamp, author: v.author.name })) });
    } catch (err) { res.status(500).json({ error: 'Server Error' }); }
});

// 🔐 AUTH & USERS
app.post('/api/signup', (req, res) => {
    const { username, password, dp } = req.body; let users = getUsers();
    if (users.find(u => u.username === username)) return res.status(400).json({ error: "Username taken!" });
    users.push({ username, password, dp: dp || 'https://via.placeholder.com/150' }); saveUsers(users); res.json({ success: true, username, dp });
});
app.post('/api/login', (req, res) => {
    const { username, password } = req.body; let user = getUsers().find(u => u.username === username && u.password === password);
    if (user) res.json({ success: true, username: user.username, dp: user.dp }); else res.status(400).json({ error: "Wrong details!" });
});
app.post('/api/update-dp', (req, res) => {
    const { username, dp } = req.body; let users = getUsers(); let index = users.findIndex(u => u.username === username);
    if(index !== -1) { users[index].dp = dp; saveUsers(users); res.json({ success: true, dp }); } else res.status(400).json({ error: "User not found" });
});
app.get('/api/users/:me', (req, res) => {
    const me = req.params.me; let users = getUsers().filter(u => u.username !== me); let allChats = getChats();
    let usersWithChats = users.map(u => {
        let room = [me, u.username].sort().join('_'); let roomChats = allChats.filter(c => c.room === room);
        let lastMsg = roomChats.length > 0 ? roomChats[roomChats.length - 1] : null;
        let unread = roomChats.filter(c => c.sender === u.username && c.status !== 'seen').length;
        return { username: u.username, dp: u.dp, lastMessage: lastMsg, unread };
    }); res.json(usersWithChats);
});
app.get('/api/chats/:room', (req, res) => res.json(getChats().filter(c => c.room === req.params.room)));

// 🔥 PRESENCE ENGINE
const onlineUsers = new Set();
const socketMap = {}; 

io.on('connection', (socket) => {
    socket.on('go_online', (username) => {
        socketMap[socket.id] = username; onlineUsers.add(username); io.emit('online_users_update', Array.from(onlineUsers));
    });
    socket.on('disconnect', () => {
        const user = socketMap[socket.id];
        if (user) { onlineUsers.delete(user); io.emit('online_users_update', Array.from(onlineUsers)); delete socketMap[socket.id]; }
    });
    socket.on('join_room', (room) => socket.join(room));
    socket.on('send_message', (data) => {
        data.status = 'sent'; let chats = getChats(); chats.push(data); saveChats(chats); io.to(data.room).emit('receive_message', data);
    });
    socket.on('typing', ({ room, sender }) => socket.to(room).emit('user_typing', sender));
    socket.on('stop_typing', ({ room }) => socket.to(room).emit('user_stopped_typing'));
    socket.on('typing_global', ({ sender, receiver }) => io.emit('global_typing_status', { sender, receiver, isTyping: true }));
    socket.on('stop_typing_global', ({ sender, receiver }) => io.emit('global_typing_status', { sender, receiver, isTyping: false }));
    socket.on('mark_seen', ({ room, viewer }) => {
        let chats = getChats(); let changed = false;
        chats.forEach(c => { if (c.room === room && c.sender !== viewer && c.status !== 'seen') { c.status = 'seen'; changed = true; } });
        if (changed) { saveChats(chats); io.to(room).emit('messages_seen', room); }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 VIP BACKEND LIVE ON PORT ${PORT}`));