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

// 📂 Ensure Data Folders & Files Exist
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
const USERS_FILE = './data/users.json';
const CHATS_FILE = './data/chats.json';
const FEEDBACKS_FILE = './data/feedbacks.json'; // 🔥 Naya Feature

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, '[]');
if (!fs.existsSync(FEEDBACKS_FILE)) fs.writeFileSync(FEEDBACKS_FILE, '[]');

// 🔥 RAM CACHE ENGINE (1000x Faster)
let memoryUsers = [];
let memoryChats = [];
let memoryFeedbacks = [];

try { memoryUsers = JSON.parse(fs.readFileSync(USERS_FILE)); } catch(e) { memoryUsers = []; }
try { memoryChats = JSON.parse(fs.readFileSync(CHATS_FILE)); } catch(e) { memoryChats = []; }
try { memoryFeedbacks = JSON.parse(fs.readFileSync(FEEDBACKS_FILE)); } catch(e) { memoryFeedbacks = []; }

const getUsers = () => memoryUsers;
const getChats = () => memoryChats;
const getFeedbacks = () => memoryFeedbacks;

const saveUsers = (data) => { 
    memoryUsers = data; 
    fs.writeFile(USERS_FILE, JSON.stringify(data), (err) => { if(err) console.log("User save err"); }); 
};
const saveChats = (data) => { 
    memoryChats = data; 
    fs.writeFile(CHATS_FILE, JSON.stringify(data), (err) => { if(err) console.log("Chat save err"); }); 
};
const saveFeedbacks = (data) => { 
    memoryFeedbacks = data; 
    fs.writeFile(FEEDBACKS_FILE, JSON.stringify(data), (err) => { if(err) console.log("Feedback save err"); }); 
};

// 📺 YOUTUBE API (FIXED: thumbnail issue resolved)
app.get('/api/videos', async (req, res) => {
    const { type, q, page = 1 } = req.query;
    try {
        // Alag-alag keywords use karenge taaki har page pe fresh content mile
        const searchKeywords = ["vlog india", "podcast hindi", "full movie hindi", "technical guruji", "comedy nights", "web series"];
        const randomKeyword = searchKeywords[Math.floor(Math.random() * searchKeywords.length)];

        let query = type === 'home' ? `${randomKeyword} part ${page}` : type === 'shorts' ? `trending shorts india ${page}` : `${q} part ${page}`;
        
        const r = await ytSearch(query);
        let videos = r.videos;
        
        if (type === 'home') {
            // 🔥 HOME: Sirf 4 minute (240 sec) se upar wali videos
            videos = videos.filter(v => v.seconds > 240);
        } else if (type === 'shorts') {
            // 🔥 SHORTS: Sirf 60 sec se niche
            videos = videos.filter(v => v.seconds < 60);
        }
        
        // Frontend ko bhejte waqt result limit kar do
        const finalResults = videos.slice(0, 20).map(v => ({ 
            videoId: v.videoId, 
            title: v.title, 
            thumbnail: v.thumbnail || v.image,
            duration: v.timestamp, 
            author: v.author.name 
        }));

        res.json({ results: finalResults });
    } catch (err) { 
        res.status(500).json({ error: 'Server Error' }); 
    }
});
// 🔐 AUTH & USERS (FIXED: Missing API endpoints added)
app.post('/api/signup', (req, res) => {
    const { username, password, dp, friend, fruit } = req.body; 
    let users = getUsers();
    if (users.find(u => u.username === username)) return res.status(400).json({ error: "Username taken!" });
    
    // 🔥 Added friend, fruit and coins for password reset & wallet
    users.push({ username, password, dp: dp || 'https://via.placeholder.com/150', friend, fruit, coins: 0 }); 
    saveUsers(users); 
    io.emit('new_user_joined'); // Real-time notification
    res.json({ success: true, username, dp });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body; 
    let user = getUsers().find(u => u.username === username && u.password === password);
    if (user) res.json({ success: true, username: user.username, dp: user.dp }); 
    else res.status(400).json({ error: "Wrong details!" });
});

// 🔥 NAYA API: Forgot Password Fix
app.post('/api/reset-password', (req, res) => {
    const { username, friend, fruit, newPassword } = req.body;
    let users = getUsers();
    let userIndex = users.findIndex(u => u.username === username && u.friend === friend && u.fruit === fruit);
    if (userIndex !== -1) {
        users[userIndex].password = newPassword;
        saveUsers(users);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "Invalid Recovery Details!" });
    }
});

// 🔥 NAYA API: Get User Coins & Data
app.get('/api/user-data/:username', (req, res) => {
    let user = getUsers().find(u => u.username === req.params.username);
    if (user) res.json({ coins: user.coins || 0 }); 
    else res.status(404).json({ error: "Not found" });
});

app.post('/api/update-dp', (req, res) => {
    const { username, dp } = req.body; 
    let users = getUsers(); 
    let index = users.findIndex(u => u.username === username);
    if(index !== -1) { 
        users[index].dp = dp; 
        saveUsers(users); 
        io.emit('user_dp_updated'); // Real-time DP Update
        res.json({ success: true, dp }); 
    } else res.status(400).json({ error: "User not found" });
});

app.get('/api/users/:me', (req, res) => {
    const me = req.params.me; 
    let users = getUsers().filter(u => u.username !== me); 
    let allChats = getChats();
    let usersWithChats = users.map(u => {
        let room = [me, u.username].sort().join('_'); 
        let roomChats = allChats.filter(c => c.room === room);
        let lastMsg = roomChats.length > 0 ? roomChats[roomChats.length - 1] : null;
        let unread = roomChats.filter(c => c.sender === u.username && c.status !== 'seen').length;
        return { username: u.username, dp: u.dp, lastMessage: lastMsg, unread };
    }); 
    res.json(usersWithChats);
});

app.get('/api/chats/:room', (req, res) => res.json(getChats().filter(c => c.room === req.params.room)));

// 🔥 NAYA API: Feedback System Fix
app.get('/api/feedbacks', (req, res) => res.json({ feedbacks: getFeedbacks() }));
app.post('/api/feedbacks', (req, res) => {
    const fb = req.body; 
    let fbs = getFeedbacks();
    fbs.push(fb); 
    saveFeedbacks(fbs);
    res.json({ success: true });
});

// 🔥 PRESENCE & CHAT ENGINE (FIXED REAL-TIME)
const onlineUsers = new Set();
const socketMap = {}; 

io.on('connection', (socket) => {
    socket.on('go_online', (username) => {
        socketMap[socket.id] = username; 
        onlineUsers.add(username); 
        io.emit('online_users_update', Array.from(onlineUsers));
    });
    
    socket.on('disconnect', () => {
        const user = socketMap[socket.id];
        if (user) { 
            onlineUsers.delete(user); 
            io.emit('online_users_update', Array.from(onlineUsers)); 
            delete socketMap[socket.id]; 
        }
    });

    socket.on('join_room', (room) => socket.join(room));
    
    socket.on('send_message', (data) => {
        data.status = 'sent'; 
        let chats = getChats(); 
        chats.push(data); 
        saveChats(chats); 
        io.to(data.room).emit('receive_message', data);
        io.emit('global_inbox_update'); // 🔥 Force update lists for unread counts
    });

    socket.on('typing', ({ room, sender }) => socket.to(room).emit('user_typing', sender));
    socket.on('stop_typing', ({ room }) => socket.to(room).emit('user_stopped_typing'));
    socket.on('typing_global', ({ sender, receiver }) => io.emit('global_typing_status', { sender, receiver, isTyping: true }));
    socket.on('stop_typing_global', ({ sender, receiver }) => io.emit('global_typing_status', { sender, receiver, isTyping: false }));
    
    socket.on('mark_seen', ({ room, viewer }) => {
        let chats = getChats(); 
        let changed = false;
        chats.forEach(c => { 
            if (c.room === room && c.sender !== viewer && c.status !== 'seen') { 
                c.status = 'seen'; 
                changed = true; 
            } 
        });
        if (changed) { 
            saveChats(chats); 
            io.to(room).emit('messages_seen', room); 
            io.emit('global_inbox_update'); // 🔥 Force update UI for Read Ticks (✓✓)
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 VIP BACKEND LIVE ON PORT ${PORT}`));