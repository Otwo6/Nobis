require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { z } = require('zod');
const imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

// --- CRITICAL: Fail fast if required secrets are missing ---
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('FATAL: JWT_SECRET must be set and at least 32 characters long');
}
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
  throw new Error('FATAL: ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)');
}

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true // Required for cookies
}));
app.use(express.json());
app.use(cookieParser());

const PORT = 3005;
const OPENAI_KEY = process.env.OPENAI_KEY;
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const IG_USER_ACCESS_TOKEN = process.env.INSTAGRAM_USER_ACCESS_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET;
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

const emailConfig = {
  imap: {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: process.env.EMAIL_HOST,
    port: 993,
    tls: true,
    authTimeout: 15000,
    tlsOptions: { rejectUnauthorized: false }
  },
  smtp: {
    host: process.env.EMAIL_SMTP_HOST,
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  }
};

const mailTransporter = nodemailer.createTransport(emailConfig.smtp);

// --- ENCRYPTION UTILITIES ---
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// --- RATE LIMITING ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: { error: 'Too many requests. Please slow down.' }
});

app.use('/api/', apiLimiter);

// --- DATABASE SETUP ---
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nobis_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// --- FAILED LOGIN TRACKING ---
const failedLoginAttempts = new Map();

async function checkLoginAttempts(username) {
  const attempts = failedLoginAttempts.get(username) || { count: 0, lockedUntil: null };
  
  if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
    const minutesLeft = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
    throw new Error(`Account locked. Try again in ${minutesLeft} minutes.`);
  }
  
  if (attempts.lockedUntil && Date.now() >= attempts.lockedUntil) {
    failedLoginAttempts.delete(username);
  }
}

function recordFailedLogin(username) {
  const attempts = failedLoginAttempts.get(username) || { count: 0, lockedUntil: null };
  attempts.count += 1;
  
  if (attempts.count >= 5) {
    attempts.lockedUntil = Date.now() + (30 * 60 * 1000); // 30 minute lockout
    attempts.count = 0;
  }
  
  failedLoginAttempts.set(username, attempts);
}

function clearFailedLogins(username) {
  failedLoginAttempts.delete(username);
}

// --- AI OUTPUT VALIDATION ---
const aiActionSchema = z.object({
  actions: z.array(z.object({
    type: z.enum(['match_issue', 'new_issue', 'match_question', 'new_question']),
    id: z.number().optional(),
    question: z.string().max(500).optional(),
    issue: z.string().max(500).optional(),
    category: z.enum(['Infrastructure', 'Public Safety', 'Education', 'Taxes', 'Healthcare', 'Environment', 'Economy']).optional()
  }))
});

// --- LOGIN ROUTE (with HttpOnly cookies) ---
app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  try {
    await checkLoginAttempts(username);
    
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];

    if (user && await bcrypt.compare(password, user.password_hash)) {
      clearFailedLogins(username);
      
      const token = jwt.sign({ id: user.id, role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
      
      // Set HttpOnly, Secure, SameSite cookie
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Only HTTPS in production
        sameSite: 'strict',
        maxAge: 2 * 60 * 60 * 1000 // 2 hours
      });
      
      res.json({ success: true });
    } else {
      recordFailedLogin(username);
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (e) {
    res.status(429).json({ error: e.message });
  }
});

// --- AUTH MIDDLEWARE (reads from cookies) ---
const authenticateToken = (req, res, next) => {
  const token = req.cookies.auth_token;

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- LOGOUT ROUTE ---
app.post('/api/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// --- ANTI-SPAM LOGIC (with encrypted storage) ---
async function checkSpam(userId, platform, content) {
  // 1. Create a deterministic hash for LOOKUPS (Searchable)
  const userIdHash = crypto.createHash('sha256').update(userId).digest('hex');
  
  // 2. Encrypt the ID for STORAGE (Privacy) - Random IV is fine here now
  const encryptedUserId = encrypt(userId);

  const messageHash = crypto.createHash('sha256').update(content.trim().toLowerCase()).digest('hex');
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // CHECK 1: Duplicates
  // We search using the HASH, not the encrypted string
  const [duplicates] = await pool.query(
    'SELECT id FROM user_logs WHERE user_id_hash = ? AND platform = ? AND message_hash = ?',
    [userIdHash, platform, messageHash]
  );
  if (duplicates.length > 0) return { allowed: false, reason: "You've already submitted this exact message before." };

  // CHECK 2: Time Limit (1 hour)
  const [recentLogs] = await pool.query(
    'SELECT id FROM user_logs WHERE user_id_hash = ? AND platform = ? AND created_at > ?',
    [userIdHash, platform, oneHourAgo]
  );
  if (recentLogs.length > 0) return { allowed: false, reason: "You can only send one message per hour." };

  // INSERT: Store both the Hash (for future lookups) and Encrypted ID (for decoding later)
  await pool.query(
    'INSERT INTO user_logs (user_id_hash, platform_user_id_encrypted, platform, message_hash) VALUES (?, ?, ?, ?)',
    [userIdHash, encryptedUserId, platform, messageHash]
  );
  
  return { allowed: true };
}

// --- CORE LOGIC WITH VALIDATION & PENDING APPROVAL ---
async function processUserMessage(userInput, platformUserId, messageHash) {
  try {
    // 1. Generate the Hash (Determinisitc - stays the same)
    const userIdHash = crypto.createHash('sha256').update(platformUserId).digest('hex');
    
    // 2. Generate Encrypted ID (Random IV - unique every time)
    // We only need this if we were inserting new rows, but here we are just updating.
    // We will use the HASH to find the correct row to update.
    
    // Sanitize input
    const sanitizedInput = userInput.replace(/ignore|override|system|assistant/gi, '').slice(0, 1000);
    
    const [issues] = await pool.query('SELECT id, issue FROM issues WHERE deleted_at IS NULL');
    const [questions] = await pool.query('SELECT id, question FROM questions WHERE deleted_at IS NULL');

    const systemPrompt = `
      You are an intelligent intake assistant for a politician. 
      Your goal is to categorize user input as either an **Issue** (a problem they want fixed) or a **Question** (something they want to know).
      
      RULES:
      1. Analyze the 'Existing Issues' and 'Existing Questions' lists provided in the context.
      2. If the user input implies a meaning semantically identical to an existing item, return a "match_issue" or "match_question" with the corresponding ID.
      3. If the input is a valid concern or inquiry but does NOT match existing items, create a "new_issue" or "new_question".
      4. "category" is required for new issues. Pick the best fit from: Infrastructure, Public Safety, Education, Taxes, Healthcare, Environment, Economy.
      5. If the input is purely conversational (e.g., "Hello", "Thanks"), return an empty actions array.
      
      Return valid JSON.
    `;

    const userPrompt = `
      CONTEXT:
      Existing Issues: ${JSON.stringify(issues)}
      Existing Questions: ${JSON.stringify(questions)}
      
      USER INPUT: "${sanitizedInput}"
      
      JSON RESPONSE FORMAT:
      {
        "actions": [
          {
            "type": "match_issue" | "new_issue" | "match_question" | "new_question",
            "id": number (only for matches),
            "issue": string (summarized text, only for new_issue),
            "question": string (summarized text, only for new_question),
            "category": "Infrastructure" | "Public Safety" | "Education" | "Taxes" | "Healthcare" | "Environment" | "Economy" (only for new_issue)
          }
        ]
      }
    `;

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0
      })
    });

    const aiJson = await aiRes.json();
    const aiContent = aiJson.choices[0].message.content;
    
    // Validate AI output with Zod
    const result = aiActionSchema.parse(JSON.parse(aiContent));
    const actions = result.actions;
    let summaryLog = [];

    for (const action of actions) {
      let currentIssueId = null;
      let currentQuestionId = null;

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
      else if (action.type === 'new_issue' && action.issue) {
        const [result] = await pool.query(
          'INSERT INTO issues (category, issue, count) VALUES (?, ?, 1)', 
          [action.category || 'Infrastructure', action.issue]
        );
        currentIssueId = result.insertId;
        summaryLog.push(`✨ New Issue submitted for review: "${action.issue}"`);
      } 
      else if (action.type === 'new_question' && action.question) {
        const [insertResult] = await pool.query(
          'INSERT INTO questions (question, asked_count, answered) VALUES (?, 1, FALSE)', 
          [action.question]
        );
        currentQuestionId = insertResult.insertId;
        summaryLog.push(`✨ New Question: "${action.question}"`);
      }

      // --- CRITICAL FIX HERE ---
      // We use 'user_id_hash' to find the row, because 'platform_user_id_encrypted' changes every time we run the encrypt function.
      if (currentIssueId) {
        await pool.query(
          'UPDATE user_logs SET issue_id = ? WHERE user_id_hash = ? AND message_hash = ?',
          [currentIssueId, userIdHash, messageHash]
        );
      }

      if (currentQuestionId) {
        await pool.query(
          'UPDATE user_logs SET question_id = ? WHERE user_id_hash = ? AND message_hash = ?',
          [currentQuestionId, userIdHash, messageHash]
        );
      }
    }

    return summaryLog.length > 0 ? summaryLog.join('\n') : "I heard you, but I couldn't identify a specific problem or question to log.";
  } catch (error) {
    console.error("Processing Error:", error);
    if (error instanceof z.ZodError) {
      return "Invalid response format from AI system.";
    }
    throw new Error('Processing failed');
  }
}

// --- ASYNC NOTIFICATION QUEUE (prevents blocking) ---
const notificationQueue = [];
let isProcessingQueue = false;

async function processNotificationQueue() {
  if (isProcessingQueue || notificationQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (notificationQueue.length > 0) {
    const task = notificationQueue.shift();
    try {
      await task();
    } catch (err) {
      console.error("Notification failed:", err);
    }
    // Small delay to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  isProcessingQueue = false;
}

async function queueNotification(platform, userId, message) {
  notificationQueue.push(async () => {
    if (platform === 'discord') {
      const discordUser = await client.users.fetch(userId);
      await discordUser.send(message);
    } else if (platform === 'instagram') {
      await sendInstagramMessage(userId, message);
    } else if (platform === 'email') {
      try {
        await mailTransporter.sendMail({
          from: process.env.EMAIL_USER,
          to: userId, // userId is the email address here
          subject: 'Update from Rep. Nobis',
          text: message
        });
      } catch (e) { console.error("Email send failed", e); }
    }
  });
  
  processNotificationQueue();
}

// --- NEW: EMAIL INGESTION WORKER ---
let lastProcessedUID = null;

// --- NEW: SAFER EMAIL INGESTION WORKER (FIXED HEADERS) ---
async function checkEmails() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

  try {
    const connection = await imap.connect(emailConfig);
    await connection.openBox('INBOX');

    // --- STEP 1: INITIALIZATION ---
    if (lastProcessedUID === null) {
      const fetchOptions = { bodies: ['HEADER'] };
      const allMessages = await connection.search(['ALL'], fetchOptions);

      if (allMessages.length > 0) {
        const lastMessage = allMessages[allMessages.length - 1];
        lastProcessedUID = lastMessage.attributes.uid;
        console.log(`✉️ Mail System Initialized. Ignoring emails before UID: ${lastProcessedUID}`);
      } else {
        lastProcessedUID = 0; 
      }
      
      connection.end();
      return; 
    }

    // --- STEP 2: SEARCH NEW EMAILS ---
    const nextUid = lastProcessedUID + 1;
    const searchCriteria = [['UID', `${nextUid}:*`]];
    
    // CHANGE: Request the full raw message (body: '') instead of parts
    const fetchOptions = { bodies: [''], markSeen: false }; 

    const messages = await connection.search(searchCriteria, fetchOptions);

    for (const item of messages) {
      const uid = item.attributes.uid;
      if (uid <= lastProcessedUID) continue;

      // CHANGE: Retrieve the full raw source from the response parts
      const allParts = item.parts.find(p => p.which === '');
      const fullEmailSource = allParts ? allParts.body : '';

      // Now pass the complete source to the parser
      const parsed = await simpleParser(fullEmailSource);
      
      const fromAddress = parsed.from?.value[0]?.address;
      const emailBody = parsed.text || "No text content found.";

      // 2. Safety Check: If we still can't find the sender, skip it
      if (!fromAddress) {
        console.log(`⚠️ Skipping email (UID: ${uid}) - Could not determine sender.`);
        lastProcessedUID = uid;
        continue;
      }

      console.log(`Processing NEW email from ${fromAddress} (UID: ${uid})`);

      // 3. Process
      const spamCheck = await checkSpam(fromAddress, 'email', emailBody);
      
      if (!spamCheck.allowed) {
        await queueNotification('email', fromAddress, `⚠️ ${spamCheck.reason}`);
      } else {
        const messageHash = crypto.createHash('sha256').update(emailBody.trim().toLowerCase()).digest('hex');
        const summary = await processUserMessage(emailBody, fromAddress, messageHash);
        
        console.log(`🤖 AI Analysis Complete: "${summary.replace(/\n/g, ' ')}"`);
        await queueNotification('email', fromAddress, `✅ **Received.**\n${summary}`);
      }

      lastProcessedUID = uid;
    }

    connection.end();
  } catch (err) {
    console.error("Email Fetch Error:", err);
  }
}

// Check emails every 60 seconds
setInterval(checkEmails, 60 * 1000);

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

// --- INSTAGRAM WEBHOOK VERIFICATION ---
app.get('/api/instagram/webhook', (req, res) => {
  // You will need to add INSTAGRAM_VERIFY_TOKEN to your .env file
  // Make it a random string (e.g., "my_super_secret_verify_token")
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

// --- DISCORD BOT ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel] 
});

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

// --- API ROUTES ---
app.get('/api/data', async (req, res) => {
  try {
    // Only return approved issues
    const [issues] = await pool.query('SELECT * FROM issues WHERE deleted_at IS NULL ORDER BY count DESC');
    const [rawQuestions] = await pool.query('SELECT * FROM questions WHERE deleted_at IS NULL ORDER BY asked_count DESC');
    const questions = rawQuestions.map(q => ({
      id: q.id, question: q.question, askedCount: q.asked_count,
      answered: Boolean(q.answered), answer: q.answer || ''
    }));
    res.json({ issues, questions });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});

app.post('/api/resolve-issue', authenticateToken, async (req, res) => {
  const { issueId, reason, actionType } = req.body;

  try {
    // Soft delete instead of hard delete
    await pool.query('UPDATE issues SET deleted_at = NOW(), resolution_reason = ?, resolution_type = ? WHERE id = ?', 
      [reason, actionType, issueId]);

    const [constituents] = await pool.query(
      'SELECT platform, platform_user_id_encrypted FROM user_logs WHERE issue_id = ?', 
      [issueId]
    );

    const message = `📢 Nobis Update: An issue you reported has been ${actionType}.\n\nReason: ${reason}`;

    // Queue notifications asynchronously
    for (const user of constituents) {
      const decryptedUserId = decrypt(user.platform_user_id_encrypted);
      queueNotification(user.platform, decryptedUserId, message);
    }

    res.json({ success: true, notifiedCount: constituents.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/answer', authenticateToken, async (req, res) => {
  const { id, answer } = req.body;

  try {
    await pool.query('UPDATE questions SET answered = TRUE, answer = ? WHERE id = ?', [answer, id]);

    const [qData] = await pool.query('SELECT question FROM questions WHERE id = ?', [id]);
    const questionText = qData[0]?.question;

    const [constituents] = await pool.query(
      'SELECT platform, platform_user_id_encrypted FROM user_logs WHERE question_id = ?', 
      [id]
    );

    const notifyMessage = `📝 **Question Answered!**\n\n**Q:** "${questionText}"\n**Reply:** ${answer}`;

    // Queue notifications asynchronously
    for (const user of constituents) {
      const decryptedUserId = decrypt(user.platform_user_id_encrypted);
      queueNotification(user.platform, decryptedUserId, notifyMessage);
    }

    res.json({ success: true, notifiedCount: constituents.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (DISCORD_TOKEN) client.login(DISCORD_TOKEN);
});