require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ytSearch = require('yt-search');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// APNA TELEGRAM BOT TOKEN
const token = process.env.TELEGRAM_BOT_TOKEN || '8599806886:AAGEe3CNv_r5qoCHQZwSNjeVqgcAwDrGyOA'; 
const bot = new TelegramBot(token, { polling: true });

// 🚨 YAHAN APNA VERCEL WALA LINK DALNA (Host karne ke baad)
const webAppUrl = process.env.FRONTEND_URL || 'https://your-vercel-link.vercel.app'; 

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🎬 **YouTube Pro VIP**\n\nAds-free videos aur premium experience ke liye niche click karein! 👇", {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "🚀 Open YouTube Pro", web_app: { url: webAppUrl } }]] }
    });
});

// Universal Search API
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q || 'trending videos india';
        const r = await ytSearch(query);
        const results = r.videos.map(v => ({
            videoId: v.videoId, title: v.title, thumbnail: v.image,
            uploaderName: v.author.name, duration: v.duration.seconds
        }));
        res.json({ results });
    } catch (error) { res.status(500).json({ error: 'Search Fail' }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));