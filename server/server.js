require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { google } = require('googleapis');
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');

// --- SETUP ---
const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const OPENAI_KEY = process.env.OPENAI_KEY;
const SPREADSHEET_ID = '1eKT8w50eN9hkuRq_Whg2gW7bHk0q3onRORC7Cmxd3tY';
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;

// UPDATED: Use Instagram User Access Token instead of Page token
const IG_USER_ACCESS_TOKEN = process.env.INSTAGRAM_USER_ACCESS_TOKEN;
const IG_VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN;

// Verify token is loaded
if (IG_USER_ACCESS_TOKEN) {
  console.log('✅ Instagram User token loaded, length:', IG_USER_ACCESS_TOKEN.length);
  console.log('   First 20 chars:', IG_USER_ACCESS_TOKEN.substring(0, 20));
} else {
  console.warn('⚠️ INSTAGRAM_USER_ACCESS_TOKEN not found in .env');
}

// --- GOOGLE SHEETS AUTH ---
const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- DISCORD CLIENT SETUP ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel] 
});

// --- CORE LOGIC (REUSABLE) ---
async function processUserMessage(userInput) {
  try {
    // 1. Fetch current data
    const issuesRes = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Issues!A2:E' });
    const questionsRes = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Questions!A2:E' });

    const issues = (issuesRes.data.values || []).map(row => ({
      id: parseInt(row[0]), category: row[1], issue: row[2], count: parseInt(row[3])
    }));

    const questions = (questionsRes.data.values || []).map(row => ({
      id: parseInt(row[0]), question: row[1], askedCount: parseInt(row[2])
    }));

    // 2. AI Prompt
    const prompt = `
      CONTEXT:
      Existing Issues: ${JSON.stringify(issues.map(i => ({id: i.id, issue: i.issue})))}
      Existing Questions: ${JSON.stringify(questions.map(q => ({id: q.id, question: q.question})))}
      
      INPUT: "${userInput}"
      
      TASK: Return a JSON object with an "actions" array.
      
      RULES:
      1. ATOMIC SPLITTING: Split complex inputs into multiple distinct actions.
      2. MATCHING: Check strictly against Existing lists. Return { type: "match_issue", id: <id> } or { type: "match_question", id: <id> }.
      3. NEW ISSUE: If the user states a problem/complaint. 
         Return { type: "new_issue", category: <Select from Categories>, issue: <Title> }.
      4. NEW QUESTION: If the user asks for a plan/strategy (Who/What/Where/Why/How). 
         Return { type: "new_question", question: <Summarized Question> }.
         ***IMPORTANT: Do NOT assign a Category to Questions.***

      CATEGORIES (For Issues Only): Infrastructure, Public Safety, Education, Taxes, Healthcare, Environment.
    `;

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1
      })
    });

    const aiJson = await aiRes.json();

    if (!aiRes.ok || !aiJson.choices) {
      console.error("❌ OpenAI API Error:", JSON.stringify(aiJson, null, 2));
      throw new Error(`OpenAI Error: ${aiJson.error?.message || 'Unknown error'}`);
    }

    const responseText = aiJson.choices[0].message.content;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) throw new Error("AI did not return JSON");
    const result = JSON.parse(jsonMatch[0]);
    const actions = result.actions || [];
    
    let summaryLog = [];

    // 3. Process Actions
    for (const action of actions) {
      if (action.type === 'match_issue') {
        const index = issues.findIndex(i => i.id === action.id);
        if (index !== -1) {
          const newCount = issues[index].count + 1;
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Issues!D${index + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [[newCount]] }
          });
          summaryLog.push(`Upvoted existing issue: ID #${action.id}`);
        }
      } 
      else if (action.type === 'new_issue') {
        const isDuplicate = issues.some(i => i.issue.toLowerCase() === action.issue.toLowerCase());
        if (!isDuplicate) {
          const newId = issues.length > 0 ? Math.max(...issues.map(i => i.id)) + 1 : 1;
          issues.push({ id: newId });
          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Issues!A:E',
            valueInputOption: 'RAW',
            resource: { values: [[newId, action.category, action.issue, 1, 'New']] }
          });
          summaryLog.push(`Created new issue: "${action.issue}"`);
        }
      }
      else if (action.type === 'match_question') {
        const index = questions.findIndex(q => q.id === action.id);
        if (index !== -1) {
          const newCount = questions[index].askedCount + 1;
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Questions!C${index + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [[newCount]] }
          });
          summaryLog.push(`Upvoted existing question: ID #${action.id}`);
        }
      }
      else if (action.type === 'new_question') {
        const newId = questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1;
        questions.push({ id: newId });
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Questions!A:E',
          valueInputOption: 'RAW',
          resource: { values: [[newId, action.question, 1, 'FALSE', '']] }
        });
        summaryLog.push(`Submitted new question: "${action.question}"`);
      }
    }

    return summaryLog.length > 0 ? summaryLog.join('\n') : "I heard you, but didn't detect a specific issue or question to log.";

  } catch (error) {
    console.error("Processing Error:", error);
    throw new Error('Processing failed');
  }
}

// --- INSTAGRAM HELPER FUNCTION (UPDATED FOR INSTAGRAM LOGIN API) ---
async function sendInstagramMessage(recipientId, text) {
  if (!IG_USER_ACCESS_TOKEN) {
    throw new Error('INSTAGRAM_USER_ACCESS_TOKEN is not set in .env');
  }

  // UPDATED: Changed host from graph.facebook.com to graph.instagram.com
  const url = `https://graph.instagram.com/v21.0/me/messages`;
  
  const payload = {
    recipient: { id: recipientId },
    message: { text: text },
  };

  console.log('🔍 Sending to Instagram API (graph.instagram.com)...');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${IG_USER_ACCESS_TOKEN}`
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  
  if (!response.ok) {
    console.error('❌ Instagram API Error:', JSON.stringify(result, null, 2));
    throw new Error(`Failed to send message: ${result.error?.message || 'Unknown error'}`);
  }
  
  console.log('✅ Instagram message sent successfully');
  return result;
}

// --- EXPRESS ROUTES (WEBSITE) ---

app.get('/api/data', async (req, res) => {
  try {
    const issuesRes = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Issues!A2:E' });
    const questionsRes = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Questions!A2:E' });

    const issues = (issuesRes.data.values || []).map(row => ({
      id: parseInt(row[0]), category: row[1], issue: row[2], count: parseInt(row[3]), trend: row[4]
    }));

    const questions = (questionsRes.data.values || []).map(row => ({
      id: parseInt(row[0]), question: row[1], askedCount: parseInt(row[2]), answered: row[3] === 'TRUE', answer: row[4] || ''
    }));

    res.json({ issues, questions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const summary = await processUserMessage(req.body.voiceInput);
    res.json({ success: true, message: summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/answer', async (req, res) => {
    const { id, answer } = req.body;
    const questionsRes = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Questions!A2:E' });
    const questions = (questionsRes.data.values || []).map(row => ({ id: parseInt(row[0]) }));
    
    const index = questions.findIndex(q => q.id === id);
    if (index !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Questions!D${index + 2}:E${index + 2}`,
        valueInputOption: 'RAW',
        resource: { values: [['TRUE', answer]] }
      });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Question not found' });
    }
});

// --- INSTAGRAM WEBHOOK ROUTES ---

// 1. Verification (GET)
app.get('/api/instagram/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === IG_VERIFY_TOKEN) {
    console.log('✅ Instagram Webhook Verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 2. Receiving Messages (POST)
app.post('/api/instagram/webhook', async (req, res) => {
  const body = req.body;

  console.log('📩 Incoming Webhook Payload:', JSON.stringify(body, null, 2));

  if (body.object === 'instagram') {
    res.status(200).send('EVENT_RECEIVED');

    body.entry?.forEach(async (entry) => {
      try {
        const messagingEvent = entry.messaging?.[0];

        if (messagingEvent.message && messagingEvent.message.is_echo) {
            console.log("🦋 Skipping echo message");
            return;
        }

        if (!messagingEvent.message || !messagingEvent.message.text) {
            console.log("ℹ️ Skipping non-text event (like a read receipt)");
            return;
        }
        
        if (messagingEvent?.message?.text) {
          const senderId = messagingEvent.sender.id;
          const userInput = messagingEvent.message.text;

          console.log(`💬 Processing message from ${senderId}: ${userInput}`);

          const summary = await processUserMessage(userInput);
          
          console.log(`📤 Attempting to send reply to ${senderId}`);
          await sendInstagramMessage(senderId, `✅ Nobis Update\n${summary}`);
          console.log(`✅ Reply sent successfully`);
        }
      } catch (err) {
        console.error("❌ Error processing entry:", err);
        console.error("❌ Full error:", err.stack);
      }
    });
  } else {
    res.sendStatus(404);
  }
});

// --- DISCORD EVENT LISTENERS ---

client.once('ready', () => {
  console.log(`🤖 Discord Bot Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.channel.type === ChannelType.DM) {
    await message.channel.sendTyping();

    try {
      const summary = await processUserMessage(message.content);
      await message.reply(`✅ **Received.**\n${summary}\n\nYou can view the dashboard here: http://localhost:3000`);
    } catch (error) {
      await message.reply("❌ Sorry, I had trouble processing that request. Please try again later.");
    }
  }
});

// --- TOKEN DEBUG ENDPOINT ---
app.get('/api/debug-token', async (req, res) => {
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${IG_USER_ACCESS_TOKEN}`);
    const data = await response.json();
    
    console.log('🔍 Token Debug Info:', JSON.stringify(data, null, 2));
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- START SERVERS ---
app.listen(PORT, () => {
  console.log(`🚀 Express API running on port ${PORT}`);
  
  if (DISCORD_TOKEN) {
    client.login(DISCORD_TOKEN);
  } else {
    console.warn("⚠️ No DISCORD_BOT_TOKEN found in .env. Bot will not start.");
  }
});