const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/:id', async (req, res) => {
    try {
        const videoId = req.params.id;
        // Piped API se direct video ka data mangwana
        const response = await axios.get(`https://pipedapi.kavin.rocks/streams/${videoId}`);
        res.json(response.data);
    } catch (error) {
        console.error('Video error:', error);
        res.status(500).json({ error: 'Failed to fetch video details' });
    }
});

module.exports = router;