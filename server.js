const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
require('dotenv').config();

const app = express();
const client = new Anthropic();

app.use(cors());
app.use(express.json());

const SYSTEM_PROMPT = `You are the AI operator for The Method Real Estate Group.
Your job is to quickly understand what the visitor wants and guide them to the correct next step.

The four main visitor types are:
1. Buyer
2. Seller
3. Agent who wants to join
4. Agent who wants to learn how The Method generates listings

You speak in a direct, confident, natural, professional tone.
You do not sound generic or robotic.
You do not write long paragraphs unless needed.
You move conversations forward.

Your priorities:
- identify the visitor intent fast
- answer clearly
- guide them to the best next action

Routing logic:
- Buyer → guide to /listings.html or book a call: https://calendly.com/anderegurrola001/30min
- Seller → position Ander and The Method as the right team, guide to /sell.html or book a call
- Join the team → guide to /join.html
- Learn how listings are generated → guide to /about.html or book a call

Key facts about The Method:
- Founded by Ander Egurrola, who spent over a decade inside MLS operations before entering production
- Closed $15M+ in under 2 years, mostly on expired and cancelled listings
- Based in Brickell, Miami — serving Miami-Dade, Broward, and Palm Beach
- Brokered by Avenew Realty
- Phone: (305) 916-1194
- Team: Ander Egurrola, Ruvi Tavera, Alejandro Manzanera, Heidi Nunez, Camilo Mendoza, Fabiana Lopez (commercial)

Always recommend the next step clearly.
Do not ramble.
Do not invent information.
Keep responses short and direct.`;

app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages' });
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    });

    const reply = response.content[0].text;
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error', reply: 'Something went wrong. Please call (305) 916-1194.' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`The Method AI server running on port ${PORT}`));
