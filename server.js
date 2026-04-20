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

// Saturday add-on price IDs
const SAT_PRICE_IDS = new Set([
  'price_1TMxN1AqwGTR1f7OohnvQwIq',
  'price_1TMxNFAqwGTR1f7Oj2bq7qx3',
]);

// Guide price IDs
const GUIDE_PRICE_IDS = new Set([
  'price_1TMxNrAqwGTR1f7O6N22eJig',
]);

// Coaching price IDs
const COACHING_PRICE_IDS = new Set([
  'price_1TMxOMAqwGTR1f7OwpwE9QtK',
]);

// Script download access code
const SCRIPT_ACCESS_CODE = 'SCRIPT001';

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
        success_url: 'https://cosmicleads.net/pages/thank-you.html?session_id={CHECKOUT_SESSION_ID}',
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

      // ── Subscription purchase ─────────────────────────────────────────────
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        const allPriceIds = sub.items.data.map(i => i.price.id);

        // Determine plan from first recognized subscription price
        let plan = 'residential';
        for (const pid of allPriceIds) {
          if (PRICE_TO_PLAN[pid]) { plan = PRICE_TO_PLAN[pid]; break; }
        }

        // Detect Saturday add-on
        const hasSaturday = allPriceIds.some(pid => SAT_PRICE_IDS.has(pid));

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
              saturday: hasSaturday,
              stripe_customer_id: customerId,
              stripe_subscription_id: session.subscription || null,
            })
          });
          console.log('[Webhook] Created subscriber:', email, plan, hasSaturday ? '+ saturday' : '');
        } else {
          console.error('[Webhook] Failed to create user:', JSON.stringify(inviteData));
        }
      }

      // ── One-time purchase: Guide (cold calling script) ─────────────────────
      if (session.mode === 'payment') {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        const purchasedPriceIds = lineItems.data.map(i => i.price.id);

        const boughtGuide    = purchasedPriceIds.some(pid => GUIDE_PRICE_IDS.has(pid));
        const boughtCoaching = purchasedPriceIds.some(pid => COACHING_PRICE_IDS.has(pid));

        if (boughtGuide) {
          const downloadUrl = 'https://cosmicleads.net/pages/script-download.html?code=' + SCRIPT_ACCESS_CODE;
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + RESEND_KEY,
            },
            body: JSON.stringify({
              from: 'CosmicLeads <info@cosmicleads.net>',
              to: email,
              subject: 'Your Method Script System is ready ✦',
              html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#070B16;color:#F1F5F9;padding:40px;border-radius:12px;">
  <div style="font-size:22px;font-weight:700;color:#6366F1;margin-bottom:24px;">✦ CosmicLeads</div>
  <h2 style="font-size:22px;font-weight:700;margin-bottom:12px;">The Method Script System</h2>
  <p style="color:#94A3B8;font-size:14px;line-height:1.6;margin-bottom:28px;">Your purchase is confirmed. Both the English and Spanish versions are ready to download.</p>
  <a href="${downloadUrl}" style="display:inline-block;background:#6366F1;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:28px;">Download Your Scripts →</a>
  <p style="color:#334155;font-size:12px;margin-top:8px;">If the button doesn't work, copy this link: ${downloadUrl}</p>
  <hr style="border:none;border-top:1px solid rgba(99,102,241,0.15);margin:28px 0;" />
  <p style="color:#475569;font-size:12px;">Questions? Reply to this email or text 305-916-1244.</p>
</div>`
            })
          });
          console.log('[Webhook] Sent guide download email to:', email);
        }

        if (boughtCoaching) {
          const calendlyUrl = 'https://calendly.com/anderegurrola001/1-on-1-coaching-with-the-method';
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + RESEND_KEY,
            },
            body: JSON.stringify({
              from: 'CosmicLeads <info@cosmicleads.net>',
              to: email,
              subject: 'Book your coaching session with Ander ✦',
              html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#070B16;color:#F1F5F9;padding:40px;border-radius:12px;">
  <div style="font-size:22px;font-weight:700;color:#6366F1;margin-bottom:24px;">✦ CosmicLeads</div>
  <h2 style="font-size:22px;font-weight:700;margin-bottom:12px;">1-on-1 Coaching with The Method</h2>
  <p style="color:#94A3B8;font-size:14px;line-height:1.6;margin-bottom:28px;">Your payment is confirmed. Book your session directly on Ander's calendar — pick a time that works for you.</p>
  <a href="${calendlyUrl}" style="display:inline-block;background:#6366F1;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:28px;">Book Your Session →</a>
  <p style="color:#334155;font-size:12px;margin-top:8px;">If the button doesn't work, copy this link: ${calendlyUrl}</p>
  <hr style="border:none;border-top:1px solid rgba(99,102,241,0.15);margin:28px 0;" />
  <p style="color:#475569;font-size:12px;">Questions? Reply to this email or text 305-916-1244.</p>
</div>`
            })
          });
          console.log('[Webhook] Sent coaching booking email to:', email);
        }
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


// ─── SMS OPT-IN ENDPOINT ─────────────────────────────────────────────────────
// Called by thank-you.html after Stripe checkout completes.
// Verifies the Stripe session is real, then saves phone + consent to Supabase.
app.post('/api/sms-opt-in', async (req, res) => {
  try {
    const { session_id, phone_number, sms_opted_in } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    // Verify the session is real by retrieving it from Stripe.
    // This prevents random people from hitting this endpoint for other users.
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const email = session.customer_details?.email || session.customer_email;
    if (!email) {
      return res.status(400).json({ error: 'No email in session' });
    }

    // Capture client IP for the consent audit trail (required by Twilio/carriers)
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.connection?.remoteAddress
      || null;

    // Build the update payload
    const now = new Date().toISOString();
    const updatePayload = {
      onboarding_completed_at: now,
    };

    if (sms_opted_in === true && phone_number) {
      updatePayload.phone_number     = phone_number;
      updatePayload.sms_opted_in     = true;
      updatePayload.sms_opted_in_at  = now;
      updatePayload.sms_opt_in_ip    = clientIp;
    } else {
      // User declined SMS — mark onboarding complete, no opt-in recorded
      updatePayload.sms_opted_in = false;
    }

    // Try to update by email. Retry up to 3 times in case the Stripe webhook
    // hasn't created the subscriber row yet (race condition — usually < 2 sec).
    let attempts = 0;
    let updated  = false;

    while (attempts < 3 && !updated) {
      const updateRes = await fetch(
        SUPABASE_URL + '/rest/v1/subscribers?email=eq.' + encodeURIComponent(email),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(updatePayload),
        }
      );

      const result = await updateRes.json();
      if (Array.isArray(result) && result.length > 0) {
        updated = true;
        break;
      }

      attempts++;
      if (attempts < 3) {
        // Wait 2 seconds, then retry
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!updated) {
      console.error('[SMS Opt-in] Subscriber not found after retries:', email);
      return res.status(404).json({
        error: 'Your account is still being set up. Please wait a moment and try again.'
      });
    }

    console.log('[SMS Opt-in]', email, sms_opted_in ? '→ opted in' : '→ declined');
    res.json({ success: true });

  } catch (err) {
    console.error('[SMS Opt-in] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ─── DAILY LEADS EMAIL ENDPOINT ──────────────────────────────────────────────
app.post('/send-daily-leads', async (req, res) => {
  // Simple security check
  const authHeader = req.headers['authorization'];
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Get all active subscribers
    const subRes = await fetch(SUPABASE_URL + '/rest/v1/subscribers?status=eq.active&select=email,plan', {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      }
    });
    const subscribers = await subRes.json();

    if (!subscribers || !subscribers.length) {
      return res.json({ sent: 0, message: 'No active subscribers' });
    }

    // 2. Generate bilingual motivational message with Claude
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const aiResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Write a short, fired-up motivational message for real estate agents who prospect expired listings for a living. Today is ${today}.

Rules:
- 2-3 sentences max
- Raw, direct, no fluff
- Think locker room speech meets street hustle
- Never use cliches like "rise and grind" or "crush it"
- Make it feel urgent and real
- Different energy every day
- No hashtags, no emojis

Return ONLY this exact format:
EN: [english message]
ES: [spanish translation, same energy]`
      }]
    });

    const rawMsg = aiResponse.content[0]?.text?.trim() || 'EN: Your leads are live. Get to work.\nES: Tus leads estan listos. A trabajar.';
    const enMatch = rawMsg.match(/EN:\s*(.+)/);
    const esMatch = rawMsg.match(/ES:\s*(.+)/);
    const motivationalMsg = enMatch ? enMatch[1].trim() : 'Your leads are live. Get to work.';
    const motivationalMsgES = esMatch ? esMatch[1].trim() : 'Tus leads estan listos. A trabajar.';


    // 3. Send email to each subscriber
    let sent = 0;
    for (const sub of subscribers) {
      const planLabel = sub.plan === 'bundle' ? 'Residential, Commercial & Rental' : 
                        sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1);

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + RESEND_KEY,
        },
        body: JSON.stringify({
          from: 'CosmicLeads <info@cosmicleads.net>',
          to: sub.email,
          subject: `Your ${today} leads are live ✦`,
          html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#070B16;color:#F1F5F9;padding:40px;border-radius:12px;">
  <div style="font-size:22px;font-weight:700;color:#6366F1;margin-bottom:24px;">✦ CosmicLeads</div>
  <p style="font-size:18px;font-weight:600;line-height:1.5;margin-bottom:8px;color:#F1F5F9;">${motivationalMsg}</p>
  <p style="font-size:15px;font-style:italic;line-height:1.5;margin-bottom:24px;color:#94A3B8;">${motivationalMsgES}</p>
  <p style="color:#64748B;font-size:13px;margin-bottom:32px;font-family:monospace;">// ${planLabel} expired leads · ${today}</p>
  <a href="https://cosmicleads.net/pages/dashboard.html" style="display:inline-block;background:#6366F1;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">View Today's Leads →</a>
  <p style="color:#334155;font-size:12px;margin-top:32px;">CosmicLeads · cosmicleads.net</p>
</div>
          `
        })
      });
      sent++;
    }

    console.log('[Daily Email] Sent to', sent, 'subscribers');
    res.json({ sent, message: motivationalMsg });

  } catch (err) {
    console.error('[Daily Email] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/', (req, res) => res.send('Method AI + CosmicLeads server is running.'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
