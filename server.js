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

let memoryUsers = [];
let memoryChats = [];

try { memoryUsers = JSON.parse(fs.readFileSync(USERS_FILE)); } catch(e) { memoryUsers = []; }
try { memoryChats = JSON.parse(fs.readFileSync(CHATS_FILE)); } catch(e) { memoryChats = []; }

const getUsers = () => memoryUsers;
const getChats = () => memoryChats;

const saveUsers = (data) => { memoryUsers = data; fs.writeFile(USERS_FILE, JSON.stringify(data), () => {}); };
const saveChats = (data) => { memoryChats = data; fs.writeFile(CHATS_FILE, JSON.stringify(data), () => {}); };

const BAD_WORDS = ['porn', 'sex', 'xxx', 'xnxx', 'nude', 'naked', 'gandi', 'bf', 'bluefilm', 'mia', 'khalifa', 'brazzers'];

app.get('/api/videos', async (req, res) => {
    const { type, q, page = 1 } = req.query;
    if (q && BAD_WORDS.some(word => q.toLowerCase().includes(word))) return res.json({ results: [] }); 

    try {
        // 🔥 COMEDY LONG VIDEOS ONLY ON HOME FEED
        let query = type === 'home' ? `top hindi comedy standup videos long -shorts part ${page}` : type === 'shorts' ? `viral shorts ${page}` : `${q} part ${page}`;
        const r = await ytSearch(query);
        
        let videos = r.videos.filter(v => !BAD_WORDS.some(word => v.title.toLowerCase().includes(word)));
        if (type === 'home') videos = videos.filter(v => v.seconds > 180); // Minimum 3 minutes for long videos
        if (type === 'shorts') videos = videos.filter(v => v.seconds < 120);
        
        res.json({ results: videos.map(v => ({ videoId: v.videoId, title: v.title, thumbnail: v.image, duration: v.timestamp, author: v.author.name })) });
    } catch (err) { res.status(500).json({ error: 'Server Error' }); }
});

app.post('/api/signup', (req, res) => {
    const { username, password, dp, friend, fruit } = req.body; let users = getUsers();
    if (users.find(u => u.username === username)) return res.status(400).json({ error: "Username taken!" });
    
    const newUser = { username, password, dp: dp || 'https://via.placeholder.com/150', friend: friend.toLowerCase(), fruit: fruit.toLowerCase() };
    users.push(newUser); saveUsers(users); 
    io.emit('new_user_joined', { username: newUser.username, dp: newUser.dp });
    res.json({ success: true, username, dp });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body; let user = getUsers().find(u => u.username === username && u.password === password);
    if (user) res.json({ success: true, username: user.username, dp: user.dp }); else res.status(400).json({ error: "Wrong details!" });
});

app.post('/api/reset-password', (req, res) => {
    const { username, friend, fruit, newPassword } = req.body; let users = getUsers();
    let userIndex = users.findIndex(u => u.username === username);
    if (userIndex === -1) return res.status(400).json({ error: "User not found!" });
    
    if (users[userIndex].friend === friend.toLowerCase() && users[userIndex].fruit === fruit.toLowerCase()) {
        users[userIndex].password = newPassword; saveUsers(users); res.json({ success: true });
    } else res.status(400).json({ error: "Security answers are incorrect!" });
});

// 🔥 STRICT ACCOUNT DELETE (Sirf usika account udayega)
app.post('/api/delete-account', (req, res) => {
    const { username, password } = req.body; let users = getUsers();
    let userIndex = users.findIndex(u => u.username === username && u.password === password);
    
    if (userIndex !== -1) {
        users.splice(userIndex, 1); 
        saveUsers(users);
        let chats = getChats();
        chats = chats.filter(c => !c.room.includes(username)); // Uske rooms hata do
        saveChats(chats);
        
        io.emit('user_deleted', username); 
        res.json({ success: true });
    } else res.status(400).json({ error: "Incorrect Password!" });
});

app.post('/api/update-dp', (req, res) => {
    const { username, dp } = req.body; let users = getUsers(); let index = users.findIndex(u => u.username === username);
    if(index !== -1) { 
        users[index].dp = dp; saveUsers(users); 
        io.emit('user_dp_updated', { username, dp });
        res.json({ success: true, dp }); 
    } else res.status(400).json({ error: "User not found" });
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

const onlineUsers = new Set();
const socketMap = {}; 

io.on('connection', (socket) => {
    socket.on('go_online', (username) => {
        socketMap[socket.id] = username; socket.join(username); onlineUsers.add(username); io.emit('online_users_update', Array.from(onlineUsers));
    });
    socket.on('disconnect', () => {
        const user = socketMap[socket.id];
        if (user) { onlineUsers.delete(user); io.emit('online_users_update', Array.from(onlineUsers)); delete socketMap[socket.id]; }
    });
    socket.on('join_room', (room) => socket.join(room));
    socket.on('send_message', (data) => {
        data.status = 'sent'; let chats = getChats(); chats.push(data); saveChats(chats); io.to(data.room).emit('receive_message', data); 
        const usersArr = data.room.split('_'); const receiver = usersArr[0] === data.sender ? usersArr[1] : usersArr[0];
        io.to(receiver).emit('global_inbox_update'); 
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