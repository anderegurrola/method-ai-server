// server.js
// The Method Real Estate Group — AI backend + CosmicLeads Stripe Checkout
// Deployed on Railway

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const Stripe    = require('stripe');

const app    = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ─── WEBHOOK + AUTOMATION CONFIG ─────────────────────────────────────────────
const WEBHOOK_SECRET   = process.env.WEBHOOK_SECRET;
const SUPABASE_URL     = 'https://kirafcubhtytxbnfzmgr.supabase.co';
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY       = process.env.RESEND_API_KEY;

// Map Stripe price IDs to CosmicLeads plan names
const PRICE_TO_PLAN = {
  'price_1TKmecAqwGTR1f7OFdCNKE0D': 'residential',
  'price_1TKmlAAqwGTR1f708X8Xwva4': 'residential',
  'price_1TKmmYAqwGTR1f7OtFGsai1C': 'commercial',
  'price_1TKmn3AqwGTR1f70HhWsL8QL': 'commercial',
  'price_1TMxISAqwGTR1f7OXh04So9Y': 'rentals',
  'price_1TMxIrAqwGTR1f706SlJb1Re': 'rentals',
  'price_1TMxM9AqwGTR1f7OZMsSK8x4': 'bundle',
  'price_1TMxMPAqwGTR1f7OnqaHoPpb': 'bundle',
};

// ─── CORS ────────────────────────────────────────────────────────────────────
// Allow both sites to call this server
app.use(cors({
  origin: [
    'https://themethodre.com',
    'https://cosmicleads.net',
    'https://classy-pika-76ed15.netlify.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:5500'
  ]
}));
// Raw body needed for Stripe webhook signature verification
app.use('/webhook', require('express').raw({ type: 'application/json' }));
app.use(express.json());

// ─── PRICE ID MAP ─────────────────────────────────────────────────────────────
// Edit here if prices change in Stripe
const PRICE_IDS = {
  res:      { m: 'price_1TKmecAqwGTR1f7OFdCNKE0D', a: 'price_1TKmlAAqwGTR1f708X8Xwva4' },
  com:      { m: 'price_1TKmmYAqwGTR1f7OtFGsai1C', a: 'price_1TKmn3AqwGTR1f70HhWsL8QL' },
  rent:     { m: 'price_1TMxISAqwGTR1f7OXh04So9Y', a: 'price_1TMxIrAqwGTR1f706SlJb1Re' },
  bundle:   { m: 'price_1TMxM9AqwGTR1f7OZMsSK8x4', a: 'price_1TMxMPAqwGTR1f7OnqaHoPpb' },
  sat:      { m: 'price_1TMxN1AqwGTR1f7OohnvQwIq', a: 'price_1TMxNFAqwGTR1f7Oj2bq7qx3' },
  guide:    { m: 'price_1TMxNrAqwGTR1f7O6N22eJig', a: 'price_1TMxNrAqwGTR1f7O6N22eJig' },
  coaching: { m: 'price_1TMxOMAqwGTR1f7OwpwE9QtK', a: 'price_1TMxOMAqwGTR1f7OwpwE9QtK' }
};

// One-time products (not subscriptions)
const ONE_TIME = new Set(['guide', 'coaching']);

// ─── STRIPE CHECKOUT ENDPOINT ─────────────────────────────────────────────────
app.post('/create-checkout', async (req, res) => {
  try {
    const { items, annual } = req.body;
    // items = ['res', 'sat', 'guide'] etc.

    if (!items || !items.length) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const lineItems = items.map(function(id) {
      const billing = annual ? 'a' : 'm';
      const priceId = PRICE_IDS[id] && PRICE_IDS[id][billing];
      if (!priceId) throw new Error('Unknown product: ' + id);
      return { price: priceId, quantity: 1 };
    });

    // Separate subscriptions from one-time payments
    const subItems  = lineItems.filter((_, i) => !ONE_TIME.has(items[i]));
    const otItems   = lineItems.filter((_, i) =>  ONE_TIME.has(items[i]));

    // If mixed, we create two sessions and return both URLs
    // If all same type, we create one session
    const sessions = [];

    if (subItems.length > 0) {
      const subSession = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: subItems,
        success_url: 'https://cosmicleads.net/pages/portal.html?checkout=success',
        cancel_url:  'https://cosmicleads.net/pages/pricing.html',
        allow_promotion_codes: true,
      });
      sessions.push(subSession.url);
    }

    if (otItems.length > 0) {
      const otSession = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: otItems,
        success_url: 'https://cosmicleads.net/pages/pricing.html?purchase=success',
        cancel_url:  'https://cosmicleads.net/pages/pricing.html',
        allow_promotion_codes: true,
      });
      sessions.push(otSession.url);
    }

    res.json({ urls: sessions });

  } catch (err) {
    console.error('[Stripe Checkout]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── METHOD AI CHAT ENDPOINT ──────────────────────────────────────────────────
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
- Identify the visitor's intent fast
- Answer clearly
- Guide them to the best next action

Routing logic:
- If the visitor wants to buy, guide them to listings or consultation
- If the visitor wants to sell, position Ander and The Method as the right people to speak with and offer consultation
- If the visitor wants to join the team, guide them to the join page
- If the visitor wants to learn how listings are generated, guide them to Learn The Method

Always recommend the next step clearly.
Do not ramble.
Do not invent information.
If you are missing a detail, guide the user toward contact or consultation.

When you want to send the user to a page, end your message naturally and include a JSON action block on its own line like this:
ACTION:{"type":"navigate","url":"/buy.html"}

Available actions:
- Buy page:          ACTION:{"type":"navigate","url":"/buy.html"}
- Sell page:         ACTION:{"type":"navigate","url":"/sell.html"}
- Listings page:     ACTION:{"type":"navigate","url":"/listings.html"}
- Join page:         ACTION:{"type":"navigate","url":"/join.html"}
- Contact page:      ACTION:{"type":"navigate","url":"/contact.html"}
- Book consultation: ACTION:{"type":"open","url":"https://calendly.com/anderegurrola001/30min"}

Only include an ACTION when it makes sense to send the user somewhere.`;

app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   messages,
    });

    const raw = response.content[0]?.text || '';
    const actionMatch = raw.match(/ACTION:(\{.*?\})/);
    let action  = null;
    let message = raw.replace(/ACTION:\{.*?\}/, '').trim();

    if (actionMatch) {
      try { action = JSON.parse(actionMatch[1]); } catch (_) {}
    }

    res.json({ message, action });
  } catch (err) {
    console.error('[Method AI]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// ─── STRIPE WEBHOOK ───────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }

  console.log('[Webhook] Event:', event.type);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_details?.email || session.customer_email;
      const customerId = session.customer;

      if (!email) {
        console.error('[Webhook] No email in session');
        return res.json({ received: true });
      }

      // Get subscription to determine plan
      let plan = 'residential';
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = sub.items.data[0]?.price?.id;
        plan = PRICE_TO_PLAN[priceId] || 'residential';
      }

      // Create Supabase user via invite
      const inviteRes = await fetch(SUPABASE_URL + '/auth/v1/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
        },
        body: JSON.stringify({ email })
      });

      const inviteData = await inviteRes.json();
      const userId = inviteData.id;

      if (userId) {
        // Add to subscribers table
        await fetch(SUPABASE_URL + '/rest/v1/subscribers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            user_id: userId,
            email: email,
            plan: plan,
            status: 'active',
            stripe_customer_id: customerId,
            stripe_subscription_id: session.subscription || null,
          })
        });
        console.log('[Webhook] Created subscriber:', email, plan);
      } else {
        console.error('[Webhook] Failed to create user:', JSON.stringify(inviteData));
      }
    }

    if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed') {
      const obj = event.data.object;
      const customerId = obj.customer;

      // Find subscriber by stripe_customer_id and deactivate
      await fetch(SUPABASE_URL + '/rest/v1/subscribers?stripe_customer_id=eq.' + customerId, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
        },
        body: JSON.stringify({ status: 'inactive' })
      });
      console.log('[Webhook] Deactivated subscriber for customer:', customerId);
    }

  } catch (err) {
    console.error('[Webhook] Processing error:', err.message);
  }

  res.json({ received: true });
});

// Health check
app.get('/', (req, res) => res.send('Method AI + CosmicLeads server is running.'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
