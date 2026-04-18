const express = require('express');
const cors = require('cors');
const ytSearch = require('yt-search');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());

// --- HELPER FUNCTIONS (The Scrapers) ---

// 1. YouTube Scraper (Official Fast Library)
async function fetchYouTube(query) {
    const r = await ytSearch(query);
    return r.videos.slice(0, 10).map(v => ({
        videoId: v.videoId,
        title: v.title,
        thumbnail: v.image,
        source: 'youtube', // Source tag added
        url: v.url
    }));
}

// 2. Facebook/Web Scraper (Puppeteer Headless Browser)
async function fetchWebVideos(query) {
    try {
        const browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Server par chalne ke liye zaroori
        });
        const page = await browser.newPage();
        
        // Dummy search strategy for Web/FB (Dailymotion used as safe example for videos)
        await page.goto(`https://www.dailymotion.com/search/${encodeURIComponent(query)}/videos`, { waitUntil: 'domcontentloaded' });
        
        // Extracting data from page
        const videos = await page.evaluate(() => {
            let results = [];
            let items = document.querySelectorAll('a[data-testid="video-card"]'); // Adjust selector based on site
            for(let i=0; i<Math.min(items.length, 10); i++) {
                results.push({
                    videoId: items[i].href.split('/video/')[1],
                    title: items[i].innerText || 'Web Video',
                    thumbnail: 'https://via.placeholder.com/400x220.png?text=Web+Video', // Placeholder for now
                    source: 'web',
                    url: items[i].href
                });
            }
            return results;
        });

        await browser.close();
        return videos;
    } catch (err) {
        console.error("Web Scraper Error:", err);
        return [];
    }
}

// --- MAIN API ENDPOINT ---

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    const page = req.query.page || 1;
    
    if (!query) return res.status(400).json({ error: "Query missing" });

    try {
        // PARALLEL FETCHING: Teeno/Dono scraper ek sath daudenge (Super Fast)
        const [ytResults, webResults] = await Promise.allSettled([
            fetchYouTube(`${query} part ${page}`),
            fetchWebVideos(query) // Puppeteer scraper
        ]);

        // Jo data successful aaya usko combine karo
        let combinedResults = [];
        if (ytResults.status === 'fulfilled') combinedResults.push(...ytResults.value);
        if (webResults.status === 'fulfilled') combinedResults.push(...webResults.value);

        // Results ko mix (shuffle) kar do taaki feed natural lage
        combinedResults = combinedResults.sort(() => Math.random() - 0.5);

        res.json({ results: combinedResults });
    } catch (error) {
        console.error("Aggregation Error:", error);
        res.status(500).json({ error: "Failed to fetch videos" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Universal Backend running on port ${PORT}`);
});