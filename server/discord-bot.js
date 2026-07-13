// discord-bot.js
// Handles all Discord functionality: connecting the bot, listening for DMs,
// running them through spam checks + AI processing, and replying.
//
// This module doesn't know about the database, encryption, or OpenAI directly —
// server.js injects the shared checkSpam / processUserMessage functions via init().

require('dotenv').config();
const crypto = require('crypto');
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

let checkSpam = null;
let processUserMessage = null;

/**
 * Wire up the shared functions this module needs. Call before login().
 */
function init({ checkSpamFn, processUserMessageFn }) {
  checkSpam = checkSpamFn;
  processUserMessage = processUserMessageFn;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || message.channel.type !== ChannelType.DM) return;
  try {
    const spamCheck = await checkSpam(message.author.id, 'discord', message.content);
    if (!spamCheck.allowed) {
      return await message.reply(`⚠️ ${spamCheck.reason}`);
    }

    const messageHash = crypto.createHash('sha256').update(message.content.trim().toLowerCase()).digest('hex');
    const summary = await processUserMessage(message.content, message.author.id, messageHash);
    await message.reply(`✅ **Received.**\n${summary}`);
  } catch (error) {
    await message.reply("❌ Error processing request.");
  }
});

// Prevents the bot from crashing the entire app if it temporarily loses internet
client.on('error', (error) => {
  console.error('Discord Client Error:', error.message);
});

client.on('shardError', (error) => {
  console.error('Discord WebSocket connection error:', error.message);
});

/**
 * Logs the bot in. No-ops (with a warning) if no token is configured.
 */
function login(token) {
  if (token) {
    client.login(token);
  } else {
    console.log('⚠️  DISCORD_BOT_TOKEN not set — Discord bot will not start.');
  }
}

module.exports = { client, init, login };