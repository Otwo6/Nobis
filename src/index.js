import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono().basePath('/nobis')

app.use('*', cors())

// 1. Fetch Issues & Questions from D1
app.get('/api/data', async (c) => {
  const { results: issues } = await c.env.DB.prepare("SELECT * FROM issues WHERE deleted_at IS NULL").all();
  const { results: questions } = await c.env.DB.prepare("SELECT * FROM questions").all();
  return c.json({ issues, questions });
});

// 2. Instagram Webhook Verification
app.get('/api/instagram/webhook', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');
  
  if (mode === 'subscribe' && token === c.env.INSTAGRAM_VERIFY_TOKEN) {
    return c.text(challenge);
  }
  return c.text('Forbidden', 403);
});

// 3. Serve React Assets
app.get('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app