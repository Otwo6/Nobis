require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const mysql = require('mysql2/promise');
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');

// --- SETUP ---
const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const OPENAI_KEY = process.env.OPENAI_KEY;
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const IG_USER_ACCESS_TOKEN = process.env.INSTAGRAM_USER_ACCESS_TOKEN;
const IG_VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN;

// --- MYSQL CONNECTION POOL ---
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nobis_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// --- CORE LOGIC (REUSABLE) ---
async function processUserMessage(userInput) {
  try {
    // 1. Fetch current data from MySQL for AI context
    const [issues] = await pool.query('SELECT id, issue FROM issues');
    const [questions] = await pool.query('SELECT id, question FROM questions');

    // 2. AI Prompt
    const prompt = `
      CONTEXT:
      Existing Issues: ${JSON.stringify(issues)}
      Existing Questions: ${JSON.stringify(questions)}
      
      INPUT: "${userInput}"
      
      TASK: Return a JSON object with an "actions" array.
      
      CLASSIFICATION HIERARCHY:
      1. QUESTION PRIORITY: If the input starts with or contains interrogative words (Who, What, Where, Why, How, "Plans to", "Will you"), it MUST be classified as a question.
      2. MATCHING: Check strictly against Existing lists. Return { type: "match_issue", id: <id> } or { type: "match_question", id: <id> }.
      3. NEW QUESTION: If it's a request for information or a strategy, return { type: "new_question", question: <Summarized Question> }.
      4. NEW ISSUE: If the input is purely a complaint or statement of fact about a problem without asking "how" or "why", return { type: "new_issue", category: <Select from Categories>, issue: <Title> }.
      
      FORMAT: Return ONLY valid JSON.
      
      RULES:
      1. ATOMIC SPLITTING: Split complex inputs into multiple distinct actions.
      2. MATCHING: Check strictly against Existing lists. Return { type: "match_issue", id: <id> } or { type: "match_question", id: <id> }.
      3. NEW ISSUE: If the user states a problem/complaint. 
         Return { type: "new_issue", category: <Select from Categories>, issue: <Title> }.
      4. NEW QUESTION: If the user asks for a plan/strategy (Who/What/Where/Why/How). 
         Return { type: "new_question", question: <Summarized Question> }.

      CATEGORIES (Issues Only): Infrastructure, Public Safety, Education, Taxes, Healthcare, Environment.
    `;

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Upgraded model
        messages: [
          { role: "system", content: "You are a data classifier that only outputs JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }, // Forces valid JSON output
        temperature: 0 // Absolute minimum randomness
      })
    });

    const aiJson = await aiRes.json();
    if (!aiRes.ok) throw new Error(`OpenAI Error: ${aiJson.error?.message}`);

    const result = JSON.parse(aiJson.choices[0].message.content);
    const actions = result.actions || [];
    let summaryLog = [];

    // 3. Process Actions in MySQL
    for (const action of actions) {
      if (action.type === 'match_issue') {
        await pool.query('UPDATE issues SET count = count + 1 WHERE id = ?', [action.id]);
        summaryLog.push(`Upvoted existing issue: ID #${action.id}`);
      } 
      else if (action.type === 'new_issue') {
        await pool.query('INSERT INTO issues (category, issue, count, trend) VALUES (?, ?, 1, "New")', 
          [action.category, action.issue]);
        summaryLog.push(`Created new issue: "${action.issue}"`);
      }
      else if (action.type === 'match_question') {
        await pool.query('UPDATE questions SET asked_count = asked_count + 1 WHERE id = ?', [action.id]);
        summaryLog.push(`Upvoted existing question: ID #${action.id}`);
      }
      else if (action.type === 'new_question') {
        await pool.query('INSERT INTO questions (question, asked_count, answered) VALUES (?, 1, FALSE)', 
          [action.question]);
        summaryLog.push(`Submitted new question: "${action.question}"`);
      }
    }

    return summaryLog.length > 0 ? summaryLog.join('\n') : "I heard you, but didn't detect a specific issue or question.";
  } catch (error) {
    console.error("Processing Error:", error);
    throw new Error('Processing failed');
  }
}

// --- INSTAGRAM HELPER ---
async function sendInstagramMessage(recipientId, text) {
  if (!IG_USER_ACCESS_TOKEN) return;
  const url = `https://graph.instagram.com/v21.0/me/messages`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${IG_USER_ACCESS_TOKEN}` },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text: text } }),
  });
}

// --- EXPRESS ROUTES ---

// GET: All Dashboard Data
app.get('/api/data', async (req, res) => {
  try {
    const [issues] = await pool.query('SELECT * FROM issues ORDER BY count DESC');
    const [rawQuestions] = await pool.query('SELECT * FROM questions ORDER BY asked_count DESC');

    // Map MySQL snake_case to Frontend camelCase
    const questions = rawQuestions.map(q => ({
      id: q.id,
      question: q.question,
      askedCount: q.asked_count,
      answered: Boolean(q.answered),
      answer: q.answer || ''
    }));

    res.json({ issues, questions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST: Analyze input from Website
app.post('/api/analyze', async (req, res) => {
  try {
    const summary = await processUserMessage(req.body.voiceInput);
    res.json({ success: true, message: summary });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// POST: Official Answer from Admin
app.post('/api/answer', async (req, res) => {
    const { id, answer } = req.body;
    try {
      await pool.query('UPDATE questions SET answered = TRUE, answer = ? WHERE id = ?', [answer, id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- INSTAGRAM WEBHOOKS ---
app.get('/api/instagram/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === IG_VERIFY_TOKEN) res.send(req.query['hub.challenge']);
  else res.sendStatus(403);
});

app.post('/api/instagram/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'instagram') {
    res.status(200).send('EVENT_RECEIVED');
    for (const entry of body.entry) {
      const messagingEvent = entry.messaging?.[0];
      if (messagingEvent?.message?.text && !messagingEvent.message.is_echo) {
        const summary = await processUserMessage(messagingEvent.message.text);
        await sendInstagramMessage(messagingEvent.sender.id, `✅ Nobis Update\n${summary}`);
      }
    }
  }
});

// --- DISCORD BOT ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel] 
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || message.channel.type !== ChannelType.DM) return;
  try {
    const summary = await processUserMessage(message.content);
    await message.reply(`✅ **Received.**\n${summary}`);
  } catch (error) { await message.reply("❌ Error processing request."); }
});

// --- STARTUP ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} with MySQL`);
  if (DISCORD_TOKEN) client.login(DISCORD_TOKEN);
});