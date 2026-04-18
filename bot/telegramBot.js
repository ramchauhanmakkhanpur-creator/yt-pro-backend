const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🎬 Welcome to YouTube Pro!\n\nNiche 'Open App' button par click karke videos dekhein.");
});

module.exports = bot;