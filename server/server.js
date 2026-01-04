require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const mysql = require('mysql2/promise');
const crypto = require('crypto'); // Added for message hashing
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
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// 1. LOGIN ROUTE
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];

    if (user && await bcrypt.compare(password, user.password_hash)) {
      // Create a token that expires in 2 hours
      const token = jwt.sign({ id: user.id, role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 2. AUTH MIDDLEWARE (To protect routes)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nobis_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// --- ANTI-SPAM LOGIC ---
async function checkSpam(userId, platform, content) {
  const hash = crypto.createHash('sha256').update(content.trim().toLowerCase()).digest('hex');
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // 1. Check for EXACT duplicate message (ever)
  const [duplicates] = await pool.query(
    'SELECT id FROM user_logs WHERE platform_user_id = ? AND platform = ? AND message_hash = ?',
    [userId, platform, hash]
  );
  if (duplicates.length > 0) return { allowed: false, reason: "You've already submitted this exact message before." };

  // 2. Check for rate limit (once per hour)
  const [recentLogs] = await pool.query(
    'SELECT id FROM user_logs WHERE platform_user_id = ? AND platform = ? AND created_at > ?',
    [userId, platform, oneHourAgo]
  );
  if (recentLogs.length > 0) return { allowed: false, reason: "You can only send one message per hour." };

  // 3. Log the interaction if clean
  await pool.query(
    'INSERT INTO user_logs (platform_user_id, platform, message_hash) VALUES (?, ?, ?)',
    [userId, platform, hash]
  );
  return { allowed: true };
}

// --- CORE LOGIC (REUSABLE) ---
async function processUserMessage(userInput, platformUserId, messageHash) {
  try {
    const [issues] = await pool.query('SELECT id, issue FROM issues');
    const [questions] = await pool.query('SELECT id, question FROM questions');

    const prompt = `
      CONTEXT:
      Existing Issues: ${JSON.stringify(issues)}
      Existing Questions: ${JSON.stringify(questions)}
      
      INPUT: "${userInput}"
      
      TASK: Return a JSON object with an "actions" array.
      
      STRICT RULES:
      1. NO ASSUMPTIONS: Do not "invent" issues or questions. Only log what is EXPLICITLY stated. 
         - Example: "How do we fix potholes?" is ONE Question. Do NOT create a separate "Road Issue" unless they also say "The roads are bad."
      2. ATOMIC SPLITTING: Only split if the user mentions multiple physically different topics (e.g., "Trash in the park AND when is the meeting?").
      3. SEMANTIC MATCHING: If the explicit point matches an existing ID's meaning, return "match_issue" or "match_question".
      4. NEW ENTRIES: If no match exists, create a "new_question" or "new_issue". Keep the text close to the user's original intent but formatted cleanly.

      CATEGORIES: Infrastructure, Public Safety, Education, Taxes, Healthcare, Environment.
      
      FORMAT:
      {
        "actions": [
          { "type": "match_issue|new_issue|match_question|new_question", "id": 123, "question": "...", "issue": "...", "category": "..." }
        ]
      }
    `;

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: "You are a literal data extractor. Do not infer hidden meanings. If the user asks a question, log a question. If they state a problem, log an issue. Do not create both unless they explicitly provide both." 
          },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0 // Drop back to 0 for maximum literalism
      })
    });

    const aiJson = await aiRes.json();
    try {
      const aiContent = aiJson.choices[0].message.content;
      const result = JSON.parse(aiContent);
      const actions = result.actions || [];
      let summaryLog = [];

      for (const action of actions) {
        let currentIssueId = null;
        let currentQuestionId = null;
        // --- MATCHES ---
        if (action.type === 'match_issue' && action.id) {
          await pool.query('UPDATE issues SET count = count + 1 WHERE id = ?', [action.id]);
          currentIssueId = action.id;
          summaryLog.push(`✅ Upvoted issue #${action.id}`);
        } 
        else if (action.type === 'match_question' && action.id) {
          await pool.query('UPDATE questions SET asked_count = asked_count + 1 WHERE id = ?', [action.id]);
          currentQuestionId = action.id;
          summaryLog.push(`✅ Upvoted question #${action.id}`);
        }
        // --- NEW ISSUE ---
        else if (action.type === 'new_issue' && action.issue) {
          // Fallback check: if the AI missed a match but the string is identical
          const [exact] = await pool.query('SELECT id FROM issues WHERE issue = ?', [action.issue]);
          if (exact.length > 0) {
            await pool.query('UPDATE issues SET count = count + 1 WHERE id = ?', [exact[0].id]);
            currentIssueId = exact[0].id;
            summaryLog.push(`✅ Upvoted issue #${exact[0].id}`);
          } else {
            const [result] = await pool.query('INSERT INTO issues (category, issue, count, trend) VALUES (?, ?, 1, "New")', 
              [action.category || 'Infrastructure', action.issue]);
            currentIssueId = result.insertId;
            summaryLog.push(`✨ New Issue: "${action.issue}"`);
          }
        } 
        // --- NEW QUESTION ---
        else if (action.type === 'new_question' && action.question) {
          const [exact] = await pool.query('SELECT id FROM questions WHERE question = ?', [action.question]);
          if (exact.length > 0) {
            await pool.query('UPDATE questions SET asked_count = asked_count + 1 WHERE id = ?', [exact[0].id]);
            currentQuestionId = exact[0].id;
            summaryLog.push(`✅ Upvoted question #${exact[0].id}`);
          } else {
            const [insertResult] =await pool.query('INSERT INTO questions (question, asked_count, answered) VALUES (?, 1, FALSE)', [action.question]);
            currentQuestionId = insertResult.insertId;
            summaryLog.push(`✨ New Question: "${action.question}"`);
          }
        }

        if (currentIssueId) {
          await pool.query(
              'UPDATE user_logs SET issue_id = ? WHERE platform_user_id = ? AND message_hash = ?',
              [currentIssueId, platformUserId, messageHash] 
          );
        }

        if (currentQuestionId) {
            await pool.query(
                'UPDATE user_logs SET question_id = ? WHERE platform_user_id = ? AND message_hash = ?',
                [currentQuestionId, platformUserId, messageHash] 
            );
        }
      }

      return summaryLog.length > 0 ? summaryLog.join('\n') : "I heard you, but I couldn't identify a specific problem or question to log. Could you be more specific?";
    } catch (e) {
      console.error("AI returned invalid JSON:", aiJson);
      return "I'm having trouble processing that right now. Please try again later.";
    }
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

// --- INSTAGRAM WEBHOOKS ---
app.post('/api/instagram/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'instagram') {
    res.status(200).send('EVENT_RECEIVED');
    for (const entry of body.entry) {
      const messagingEvent = entry.messaging?.[0];
      if (messagingEvent?.message?.text && !messagingEvent.message.is_echo) {
        const userId = messagingEvent.sender.id;
        const text = messagingEvent.message.text;

        // Anti-Spam Check
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

// --- DISCORD BOT ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel] 
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || message.channel.type !== ChannelType.DM) return;
  try {
    // Anti-Spam Check
    const spamCheck = await checkSpam(message.author.id, 'discord', message.content);
    if (!spamCheck.allowed) {
      return await message.reply(`⚠️ ${spamCheck.reason}`);
    }

    const messageHash = crypto.createHash('sha256').update(message.content.trim().toLowerCase()).digest('hex');
    const summary = await processUserMessage(message.content, message.author.id, messageHash);
    await message.reply(`✅ **Received.**\n${summary}`);
  } catch (error) { await message.reply("❌ Error processing request."); }
});

// --- REMAINING ROUTES (GET /api/data, POST /api/answer, etc.) ---
app.get('/api/data', async (req, res) => {
  try {
    const [issues] = await pool.query('SELECT * FROM issues ORDER BY count DESC');
    const [rawQuestions] = await pool.query('SELECT * FROM questions ORDER BY asked_count DESC');
    const questions = rawQuestions.map(q => ({
      id: q.id, question: q.question, askedCount: q.asked_count,
      answered: Boolean(q.answered), answer: q.answer || ''
    }));
    res.json({ issues, questions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (DISCORD_TOKEN) client.login(DISCORD_TOKEN);
});

app.post('/api/resolve-issue', authenticateToken, async (req, res) => {
  const { issueId, reason, actionType } = req.body; // actionType: 'resolved' or 'removed'

  try {
    // 1. Get all users who reported this issue
    const [constituents] = await pool.query(
      'SELECT platform, platform_user_id FROM user_logs WHERE issue_id = ?', 
      [issueId]
    );

    const message = `📢 Nobis Update: An issue you reported has been ${actionType}.\n\nReason: ${reason}`;

    // 2. Broadcast to all users
    for (const user of constituents) {
      if (user.platform === 'discord') {
        try {
          const discordUser = await client.users.fetch(user.platform_user_id);
          await discordUser.send(message);
        } catch (err) { console.error("Discord notify failed", err); }
      } 
      else if (user.platform === 'instagram') {
        try {
          await sendInstagramMessage(user.platform_user_id, message);
        } catch (err) { console.error("IG notify failed", err); }
      }
    }

    // 3. Remove the issue from the dashboard
    await pool.query('DELETE FROM issues WHERE id = ?', [issueId]);
    // Optional: Clean up logs or keep them for history
    
    res.json({ success: true, notifiedCount: constituents.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/answer', authenticateToken, async (req, res) => {
  const { id, answer } = req.body;

  try {
    // 1. Update the question in the database
    await pool.query('UPDATE questions SET answered = TRUE, answer = ? WHERE id = ?', [answer, id]);

    // 2. Fetch the question text to include in the notification
    const [qData] = await pool.query('SELECT question FROM questions WHERE id = ?', [id]);
    const questionText = qData[0]?.question;

    // 3. Find everyone who asked this question
    const [constituents] = await pool.query(
      'SELECT platform, platform_user_id FROM user_logs WHERE question_id = ?', 
      [id]
    );

    const notifyMessage = `📝 **Question Answered!**\n\n**Q:** "${questionText}"\n**Reply:** ${answer}`;

    // 4. Broadcast to all users
    for (const user of constituents) {
      if (user.platform === 'discord') {
        try {
          const discordUser = await client.users.fetch(user.platform_user_id);
          await discordUser.send(notifyMessage);
        } catch (err) { console.error("Discord notify failed", err); }
      } 
      else if (user.platform === 'instagram') {
        try {
          await sendInstagramMessage(user.platform_user_id, notifyMessage);
        } catch (err) { console.error("IG notify failed", err); }
      }
    }

    res.json({ success: true, notifiedCount: constituents.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});