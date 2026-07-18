// server.js
// Entry point. Owns the Express API, database, encryption, auth, anti-spam,
// the AI intake pipeline (OpenAI), and the notification queue. Wires up and
// starts the Discord bot, Instagram webhook, and Email worker.
//
// Run this file — it requires and starts the other three.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { z } = require('zod');

const discordBot = require('./discord-bot');
const instagramBot = require('./instagram-bot');
const emailBot = require('./email-bot');

// --- CRITICAL: Fail fast if required secrets are missing ---
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('FATAL: JWT_SECRET must be set and at least 32 characters long');
}
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
  throw new Error('FATAL: ENCRYPTION_KEY must be set and exactly 64 hex characters (32 bytes)');
}

const app = express();
app.set('trust proxy', 1);
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

// --- OTP STORAGE ---
// Maps email -> { code: string, expiresAt: number }
const pendingVerifications = new Map();

// Helper to generate a 6-digit code
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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
    category: z.enum(['Infrastructure', 'Public Safety', 'Education', 'Taxes', 'Healthcare', 'Environment', 'Economy'])
      .catch('Infrastructure')
      .optional()
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
    const userIdHash = crypto.createHash('sha256').update(platformUserId).digest('hex');

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

      // We use 'user_id_hash' to find the row, because 'platform_user_id_encrypted'
      // changes every time we run the encrypt function.
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
      const discordUser = await discordBot.client.users.fetch(userId);
      await discordUser.send(message);
    } else if (platform === 'instagram') {
      await instagramBot.sendInstagramMessage(userId, message);
    } else if (platform === 'email' || platform === 'web') {
      await emailBot.sendEmail(userId, 'Update from Rep. Nobis', message); // userId is the email address here
    }
  });

  processNotificationQueue();
}

// --- WIRE UP THE THREE CHANNEL MODULES ---
discordBot.init({ checkSpamFn: checkSpam, processUserMessageFn: processUserMessage });

instagramBot.init({
  igAccessToken: IG_USER_ACCESS_TOKEN,
  checkSpamFn: checkSpam,
  processUserMessageFn: processUserMessage
});
instagramBot.registerRoutes(app);

emailBot.init({
  checkSpamFn: checkSpam,
  processUserMessageFn: processUserMessage,
  queueNotificationFn: queueNotification
});
// Starts polling immediately, same as the original (doesn't wait on app.listen)
emailBot.startEmailWorker(60 * 1000);

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

    let successfulNotifications = 0;
    let failedDecryptions = 0;

    // Queue notifications asynchronously
    for (const user of constituents) {
      try {
        // Attempt to decrypt. If this fails, it jumps to the inner catch block
        const decryptedUserId = decrypt(user.platform_user_id_encrypted);
        queueNotification(user.platform, decryptedUserId, message);
        successfulNotifications++;
      } catch (decryptError) {
        // Log the error but DO NOT crash the loop
        console.error(`⚠️ Skipping constituent: Decryption failed for platform ${user.platform}.`, decryptError.message);
        failedDecryptions++;
        continue; // Move on to the next user in the queue
      }
    }

    res.json({ 
      success: true, 
      notifiedCount: successfulNotifications,
      failedCount: failedDecryptions 
    });
  } catch (e) {
    // This catches database errors or larger route failures
    console.error("Resolve Issue Error:", e);
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

    let successfulNotifications = 0;
    let failedDecryptions = 0;

    // Queue notifications asynchronously (NOW WITH TRY/CATCH)
    for (const user of constituents) {
      try {
        const decryptedUserId = decrypt(user.platform_user_id_encrypted);
        queueNotification(user.platform, decryptedUserId, notifyMessage);
        successfulNotifications++;
      } catch (decryptError) {
        console.error(`⚠️ Skipping constituent: Decryption failed for platform ${user.platform}.`, decryptError.message);
        failedDecryptions++;
        continue;
      }
    }

    res.json({ 
      success: true, 
      notifiedCount: successfulNotifications,
      failedCount: failedDecryptions
    });
  } catch (e) {
    console.error("Answer Route Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// --- 1. SEND VERIFICATION CODE ---
app.post('/api/send-otp', apiLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const code = generateOTP();
  
  // Store code for 10 minutes
  pendingVerifications.set(email.toLowerCase(), {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000 
  });

  try {
    // Re-use your emailBot to send the code
    const message = `Your verification code for Rep. Nobis is: ${code}\n\nThis code expires in 10 minutes.`;
    await emailBot.sendEmail(email, 'Your Verification Code', message);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send verification email.' });
  }
});

// --- 2. VERIFY AND PROCESS MESSAGE (Updated) ---
app.post('/api/web-message', apiLimiter, async (req, res) => {
  const { email, message, otp } = req.body;

  if (!email || !message || !otp) {
    return res.status(400).json({ error: 'Email, message, and verification code are required.' });
  }

  const normalizedEmail = email.toLowerCase();
  const record = pendingVerifications.get(normalizedEmail);

  // Validate OTP
  if (!record || record.code !== otp || Date.now() > record.expiresAt) {
    return res.status(401).json({ error: 'Invalid or expired verification code.' });
  }

  try {
    // 1. Run through your existing anti-spam check
    const spamCheck = await checkSpam(normalizedEmail, 'web', message);
    if (!spamCheck.allowed) {
      return res.status(429).json({ error: spamCheck.reason });
    }

    // 2. Hash message and process via AI pipeline
    const messageHash = crypto.createHash('sha256').update(message.trim().toLowerCase()).digest('hex');
    const summaryLog = await processUserMessage(message, normalizedEmail, messageHash);

    // 3. Clear the OTP so it can't be reused
    pendingVerifications.delete(normalizedEmail);

    res.json({ success: true, summary: summaryLog });
  } catch (error) {
    console.error("Web Message Error:", error);
    res.status(500).json({ error: 'Failed to process message. Please try again later.' });
  }
});

// --- START SERVER + DISCORD BOT ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  discordBot.login(DISCORD_TOKEN);
});