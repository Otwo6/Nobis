// instagram-bot.js
// Handles all Instagram functionality: webhook verification, receiving DMs,
// running them through spam checks + AI processing, and replying.
//
// server.js injects the shared checkSpam / processUserMessage functions via init(),
// and calls registerRoutes(app) to mount the webhook endpoints.

require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

let IG_USER_ACCESS_TOKEN = null;
let checkSpam = null;
let processUserMessage = null;

/**
 * Wire up the access token and shared functions this module needs.
 * Call before registerRoutes().
 */
function init({ igAccessToken, checkSpamFn, processUserMessageFn }) {
  IG_USER_ACCESS_TOKEN = igAccessToken;
  checkSpam = checkSpamFn;
  processUserMessage = processUserMessageFn;
}

async function sendInstagramMessage(recipientId, text) {
  if (!IG_USER_ACCESS_TOKEN) return;
  const url = `https://graph.instagram.com/v21.0/me/messages`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${IG_USER_ACCESS_TOKEN}` },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text: text } }),
  });
}

/**
 * Registers the Instagram webhook routes (receive + verification) on the given Express app.
 */
function registerRoutes(app) {
  // Receives incoming DMs
  app.post('/api/instagram/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'instagram') {
      res.status(200).send('EVENT_RECEIVED');
      for (const entry of body.entry) {
        const messagingEvent = entry.messaging?.[0];
        if (messagingEvent?.message?.text && !messagingEvent.message.is_echo) {
          const userId = messagingEvent.sender.id;
          const text = messagingEvent.message.text;

          const spamCheck = await checkSpam(userId, 'instagram', text);
          if (!spamCheck.allowed) {
            return await sendInstagramMessage(userId, `⚠️ ${spamCheck.reason}`);
          }

          const messageHash = crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
          const summary = await processUserMessage(text, userId, messageHash);
          await sendInstagramMessage(userId, `✅ Nobis Update\n${summary}`);
        }
      }
    }
  });

  // Webhook verification handshake (uses INSTAGRAM_VERIFY_TOKEN from .env)
  app.get('/api/instagram/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN;

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Instagram Webhook Verified!');
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    }
  });
}

module.exports = { init, registerRoutes, sendInstagramMessage };