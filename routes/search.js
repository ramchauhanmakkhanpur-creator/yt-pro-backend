const express = require('express');
const router = express.Router();
const secretAPI = require('../utils/pipedAPI');

router.get('/', async (req, res) => {
    try {
        const query = req.query.q;
        const page = parseInt(req.query.page) || 1;
        
        if (!query) return res.status(400).json({ error: 'Search query empty' });
        
        // 🚨 MAGIC: Agar page 1 se zyada hai, to hum query badal denge taaki naya data aaye
        const smartQuery = page > 1 ? `${query} part ${page} new videos` : query;
        
        const data = await secretAPI.search(smartQuery);
        res.json(data); 
        
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;