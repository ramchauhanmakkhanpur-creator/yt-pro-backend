const express = require('express');
const cors = require('cors');
const ytSearch = require('yt-search');

const app = express();
app.use(cors());

// Single API for everything (Home, Search, Shorts)
app.get('/api/videos', async (req, res) => {
    const { type, q, page = 1 } = req.query;
    
    try {
        let query = '';
        
        // 1. HOME PAGE LOGIC (Mix trending content)
        if (type === 'home') query = `trending viral videos india part ${page}`;
        
        // 2. SEARCH PAGE LOGIC (Keyword matching)
        else if (type === 'search') query = `${q} part ${page}`;
        
        // 3. SHORTS PAGE LOGIC (Category based short videos)
        else if (type === 'shorts') query = `${q === 'Mix' ? 'viral trending' : q} shorts part ${page}`;

        // Fetch from YouTube
        const r = await ytSearch(query);
        let videos = r.videos;

        // If it's shorts, strictly filter videos under 2 minutes (120 seconds)
        if (type === 'shorts') {
            videos = videos.filter(v => v.seconds < 120);
        }

        // Send Clean Data
        res.json({ 
            results: videos.map(v => ({
                videoId: v.videoId,
                title: v.title,
                thumbnail: v.image,
                duration: v.timestamp,
                author: v.author.name
            }))
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Clean YouTube Backend running on port ${PORT}`));