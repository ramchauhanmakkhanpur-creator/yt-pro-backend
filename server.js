const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const ytSearch = require('yt-search');
const TelegramBot = require('node-telegram-bot-api'); // 🔥 TELEGRAM BOT API

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const USERS_FILE = './data/users.json';
const CHATS_FILE = './data/chats.json';
const WITHDRAW_FILE = './data/withdrawals.json'; // New File for tracking payments

if (!fs.existsSync('./data')) fs.mkdirSync('./data');
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, '[]');
if (!fs.existsSync(WITHDRAW_FILE)) fs.writeFileSync(WITHDRAW_FILE, '[]');

let memoryUsers = [];
let memoryChats = [];
let memoryWithdrawals = [];

try { memoryUsers = JSON.parse(fs.readFileSync(USERS_FILE)); } catch(e) { memoryUsers = []; }
try { memoryChats = JSON.parse(fs.readFileSync(CHATS_FILE)); } catch(e) { memoryChats = []; }
try { memoryWithdrawals = JSON.parse(fs.readFileSync(WITHDRAW_FILE)); } catch(e) { memoryWithdrawals = []; }

const saveUsers = (data) => { memoryUsers = data; fs.writeFile(USERS_FILE, JSON.stringify(data), () => {}); };
const saveChats = (data) => { memoryChats = data; fs.writeFile(CHATS_FILE, JSON.stringify(data), () => {}); };
const saveWithdrawals = (data) => { memoryWithdrawals = data; fs.writeFile(WITHDRAW_FILE, JSON.stringify(data), () => {}); };

// ==========================================
// 🤖 TELEGRAM BOT LOGIC
// ==========================================
const token = '8599806886:AAGEe3CNv_r5qoCHQZwSNjeVqgcAwDrGyOA';
const bot = new TelegramBot(token, { polling: true });

let adminChatId = null; // Telegram will save your ID once you enter password

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🔒 Welcome Admin! Please enter the password to access the panel:");
});

bot.on('message', (msg) => {
    if (msg.text === 'thakur@789A') {
        adminChatId = msg.chat.id;
        bot.sendMessage(adminChatId, "✅ **Access Granted!**\n\nYou are now the active Admin. You will receive withdrawal requests here.\n\nTo approve a payment, use command:\n`/success username`", { parse_mode: "Markdown" });
    } else if (!msg.text.startsWith('/') && msg.text !== 'thakur@789A' && !adminChatId) {
        bot.sendMessage(msg.chat.id, "❌ Incorrect Password.");
    }
});

// Admin Command to approve payment
bot.onText(/\/success (.+)/, (msg, match) => {
    if (msg.chat.id !== adminChatId) return bot.sendMessage(msg.chat.id, "❌ Unauthorized.");
    
    const targetUser = match[1];
    let pendingReq = memoryWithdrawals.find(w => w.username === targetUser && w.status === 'pending');
    
    if (pendingReq) {
        pendingReq.status = 'success';
        saveWithdrawals(memoryWithdrawals);
        bot.sendMessage(adminChatId, `✅ Superb! Marked @${targetUser}'s ₹${pendingReq.amountRs} payment as SUCCESS!`);
        
        // Alert user on app in real-time!
        io.to(targetUser).emit('payment_approved', { amount: pendingReq.amountRs, coins: pendingReq.coinsDeducted });
    } else {
        bot.sendMessage(adminChatId, `⚠️ No pending withdrawal found for @${targetUser}.`);
    }
});


// ==========================================
// 💸 WITHDRAWAL API
// ==========================================
app.post('/api/withdraw', (req, res) => {
    const { username, upiId } = req.body;
    let userIndex = memoryUsers.findIndex(u => u.username === username);
    
    if (userIndex === -1) return res.status(400).json({ error: "User not found" });
    
    let userCoins = memoryUsers[userIndex].coins || 0;
    
    if (userCoins < 1000) return res.status(400).json({ error: "Minimum 1000 Coins required!" });
    
    // Check if already pending
    let hasPending = memoryWithdrawals.some(w => w.username === username && w.status === 'pending');
    if (hasPending) return res.status(400).json({ error: "You already have a pending withdrawal!" });

    // Calculate money: 1000 Coins = 10 Rs. (1 Coin = 0.01 Rs)
    let amountRs = Math.floor(userCoins / 100); 
    let remainingCoins = userCoins % 100; // Leave the change in wallet

    memoryUsers[userIndex].coins = remainingCoins;
    saveUsers(memoryUsers);

    // Save Request
    const newRequest = { id: Date.now(), username, upiId, coinsDeducted: userCoins - remainingCoins, amountRs, status: 'pending', date: new Date().toLocaleString() };
    memoryWithdrawals.push(newRequest);
    saveWithdrawals(memoryWithdrawals);

    // Send Alert to Telegram Admin
    if (adminChatId) {
        let msg = `🚨 **NEW WITHDRAWAL REQUEST** 🚨\n\n👤 **User:** @${username}\n🪙 **Coins:** ${newRequest.coinsDeducted}\n💸 **Amount to Pay:** ₹${amountRs}\n🏦 **UPI ID:** \`${upiId}\`\n\n_Pay on UPI, then copy-paste this command to approve:_\n\n\`/success ${username}\``;
        bot.sendMessage(adminChatId, msg, { parse_mode: "Markdown" });
    }

    res.json({ success: true, remainingCoins, amountRs });
});

app.get('/api/withdrawals/:username', (req, res) => {
    res.json(memoryWithdrawals.filter(w => w.username === req.params.username));
});


// ==========================================
// REST OF THE APIS (Videos, Auth, Chats)
// ==========================================
const BAD_WORDS = ['porn', 'sex', 'xxx', 'gandi', 'nude'];

app.get('/api/videos', async (req, res) => {
    const { type, q, page = 1 } = req.query;
    if (q && BAD_WORDS.some(word => q.toLowerCase().includes(word))) return res.json({ results: [] }); 
    try {
        let query = type === 'home' ? `trending viral videos india part ${page}` : type === 'shorts' ? `viral shorts ${page}` : `${q} part ${page}`;
        const r = await ytSearch(query);
        let videos = r.videos.filter(v => !BAD_WORDS.some(word => v.title.toLowerCase().includes(word)));
        res.json({ results: videos.map(v => ({ videoId: v.videoId, title: v.title, thumbnail: v.image, duration: v.timestamp, author: v.author.name })) });
    } catch (err) { res.status(500).json({ error: 'Server Error' }); }
});

app.post('/api/signup', (req, res) => {
    const { username, password, dp, friend, fruit } = req.body;
    if (memoryUsers.find(u => u.username === username)) return res.status(400).json({ error: "Username taken!" });
    const newUser = { username, password, dp: dp || 'https://via.placeholder.com/150', friend: friend?.toLowerCase() || '', fruit: fruit?.toLowerCase() || '', coins: 0 };
    memoryUsers.push(newUser); saveUsers(memoryUsers); 
    io.emit('new_user_joined');
    res.json({ success: true, username, dp: newUser.dp });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    let user = memoryUsers.find(u => u.username === username && u.password === password);
    if (user) res.json({ success: true, username: user.username, dp: user.dp }); 
    else res.status(400).json({ error: "Wrong details!" });
});

app.post('/api/reset-password', (req, res) => {
    const { username, friend, fruit, newPassword } = req.body;
    let userIndex = memoryUsers.findIndex(u => u.username === username);
    if (userIndex === -1) return res.status(400).json({ error: "User not found!" });
    if (memoryUsers[userIndex].friend === friend.toLowerCase() && memoryUsers[userIndex].fruit === fruit.toLowerCase()) {
        memoryUsers[userIndex].password = newPassword; saveUsers(memoryUsers); res.json({ success: true });
    } else res.status(400).json({ error: "Security answers are incorrect!" });
});

app.post('/api/delete-account', (req, res) => {
    const { username, password } = req.body;
    let userIndex = memoryUsers.findIndex(u => u.username === username && u.password === password);
    if (userIndex !== -1) {
        memoryUsers.splice(userIndex, 1); saveUsers(memoryUsers);
        memoryChats = memoryChats.filter(c => !c.room.includes(username)); saveChats(memoryChats);
        io.emit('user_deleted', username); res.json({ success: true });
    } else res.status(400).json({ error: "Incorrect Password!" });
});

app.post('/api/update-dp', (req, res) => {
    const { username, dp } = req.body; let index = memoryUsers.findIndex(u => u.username === username);
    if(index !== -1) { memoryUsers[index].dp = dp; saveUsers(memoryUsers); io.emit('user_dp_updated', { username, dp }); res.json({ success: true, dp }); } 
    else res.status(400).json({ error: "User not found" });
});

app.get('/api/user-data/:username', (req, res) => {
    const user = memoryUsers.find(u => u.username === req.params.username);
    if (user) res.json({ coins: user.coins || 0 });
    else res.status(404).send();
});

app.post('/api/reward-ad', (req, res) => {
    const { username } = req.body;
    let userIndex = memoryUsers.findIndex(u => u.username === username);
    if (userIndex !== -1) {
        memoryUsers[userIndex].coins = (memoryUsers[userIndex].coins || 0) + 50;
        saveUsers(memoryUsers);
        res.json({ success: true, coins: memoryUsers[userIndex].coins });
    } else res.status(400).json({ error: "User not found" });
});

app.get('/api/users/:me', (req, res) => {
    const me = req.params.me; 
    let usersWithChats = memoryUsers.filter(u => u.username !== me).map(u => {
        let room = [me, u.username].sort().join('_'); let roomChats = memoryChats.filter(c => c.room === room);
        return { username: u.username, dp: u.dp, lastMessage: roomChats[roomChats.length - 1] || null, unread: roomChats.filter(c => c.sender === u.username && c.status !== 'seen').length };
    }); res.json(usersWithChats);
});

app.get('/api/chats/:room', (req, res) => res.json(memoryChats.filter(c => c.room === req.params.room)));

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
        data.status = 'sent'; memoryChats.push(data); saveChats(memoryChats); io.to(data.room).emit('receive_message', data); 
        const usersArr = data.room.split('_'); const receiver = usersArr[0] === data.sender ? usersArr[1] : usersArr[0];
        io.to(receiver).emit('global_inbox_update'); 
    });
    socket.on('typing', ({ room, sender }) => socket.to(room).emit('user_typing', sender));
    socket.on('stop_typing', ({ room }) => socket.to(room).emit('user_stopped_typing'));
    socket.on('mark_seen', ({ room, viewer }) => {
        let changed = false; memoryChats.forEach(c => { if (c.room === room && c.sender !== viewer && c.status !== 'seen') { c.status = 'seen'; changed = true; } });
        if (changed) { saveChats(memoryChats); io.to(room).emit('messages_seen', room); }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 FAST VIP BACKEND WITH TELEGRAM BOT LIVE ON PORT ${PORT}`));