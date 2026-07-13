// email-bot.js
// Handles all email functionality: polling an IMAP inbox for new messages,
// running them through spam checks + AI processing, and sending outbound
// notification emails via SMTP.
//
// server.js injects the shared checkSpam / processUserMessage / queueNotification
// functions via init().

require('dotenv').config();
const crypto = require('crypto');
const imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

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

let checkSpam = null;
let processUserMessage = null;
let queueNotification = null;
let lastProcessedUID = null;

/**
 * Wire up the shared functions this module needs. Call before startEmailWorker().
 */
function init({ checkSpamFn, processUserMessageFn, queueNotificationFn }) {
  checkSpam = checkSpamFn;
  processUserMessage = processUserMessageFn;
  queueNotification = queueNotificationFn;
}

async function checkEmails() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

  let connection; // defined outside try so it's reachable in finally

  try {
    connection = await imap.connect(emailConfig);
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

      return;
    }

    // --- STEP 2: SEARCH NEW EMAILS ---
    const nextUid = lastProcessedUID + 1;
    const searchCriteria = [['UID', `${nextUid}:*`]];
    const fetchOptions = { bodies: [''], markSeen: false };

    const messages = await connection.search(searchCriteria, fetchOptions);

    for (const item of messages) {
      const uid = item.attributes.uid;
      if (uid <= lastProcessedUID) continue;

      const allParts = item.parts.find(p => p.which === '');
      const fullEmailSource = allParts ? allParts.body : '';

      const parsed = await simpleParser(fullEmailSource);

      const fromAddress = parsed.from?.value[0]?.address;
      const emailBody = parsed.text || "No text content found.";

      if (!fromAddress) {
        console.log(`⚠️ Skipping email (UID: ${uid}) - Could not determine sender.`);
        lastProcessedUID = uid;
        continue;
      }

      console.log(`Processing NEW email from ${fromAddress} (UID: ${uid})`);

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

  } catch (err) {
    console.error("Email Fetch Error:", err);
  } finally {
    if (connection) {
      connection.end();
    }
  }
}

/**
 * Starts polling the inbox on a timer (defaults to every 60s, matching the original).
 */
function startEmailWorker(intervalMs = 60 * 1000) {
  setInterval(checkEmails, intervalMs);
}

/**
 * Sends an outbound notification email. Used by server.js's notification queue.
 */
async function sendEmail(to, subject, text) {
  try {
    await mailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text
    });
  } catch (e) {
    console.error("Email send failed", e);
  }
}

module.exports = { init, startEmailWorker, checkEmails, sendEmail };