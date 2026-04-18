const ytSearch = require('yt-search');

class SecretAPI {
    async search(query) {
        try {
            const r = await ytSearch(query);
            const videos = r.videos || []; 
            return {
                results: videos.map(v => ({
                    type: 'stream',
                    videoId: v.videoId, 
                    url: v.url,
                    title: v.title,
                    thumbnail: v.image,
                    uploaderName: v.author.name,
                    duration: v.duration.seconds
                }))
            };
        } catch (error) {
            return { results: [] };
        }
    }
}
module.exports = new SecretAPI();