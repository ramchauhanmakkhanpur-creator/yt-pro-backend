const express = require('express');
const router = express.Router();
const secretAPI = require('../utils/pipedAPI');

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

router.get('/personalized', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const querySets = [
            ['trending videos india', 'new hindi songs', 'live gaming bgmi', 'news live hindi'],
            ['standup comedy india', 'tech reviews hindi', 'street food vlog', 'cricket highlights'],
            ['bollywood movies', 'fitness workout home', 'trading strategies', 'rap songs hit']
        ];

        const index = (page - 1) % querySets.length;
        const [q1, q2, q3, q4] = querySets[index];

        const [res1, res2, res3, res4] = await Promise.all([
            secretAPI.search(q1), secretAPI.search(q2), secretAPI.search(q3), secretAPI.search(q4)
        ]);

        let allVideos = [];
        if (res1 && res1.results) allVideos.push(...res1.results);
        if (res2 && res2.results) allVideos.push(...res2.results);
        if (res3 && res3.results) allVideos.push(...res3.results);
        if (res4 && res4.results) allVideos.push(...res4.results);

        const uniqueVideos = Array.from(new Map(allVideos.map(item => [item.videoId, item])).values());
        const megaFeed = shuffleArray(uniqueVideos);

        res.json({ trending: megaFeed });
    } catch (e) { 
        res.status(500).json({ error: 'Failed to fetch' }); 
    }
});
module.exports = router;