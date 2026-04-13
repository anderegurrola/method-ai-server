const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
require('dotenv').config();

const app = express();
const client = new Anthropic();

app.use(cors());
app.use(express.json());

// ── Bridge API config ──
const BRIDGE_TOKEN = '7295d777246519c6cb64ad7ce70d90bc';
const BRIDGE_BASE = 'https://api.bridgedataoutput.com/api/v2/OData/miamire/Property';
const TEAM_MLS_IDS = ['3388802', '3216534', '3626284', '3503316', '3612490', '3645231'];

// ── System prompt ──
const SYSTEM_PROMPT = `You are the AI assistant for The Method Real Estate Group — a high-performance real estate team based in Brickell, Miami, founded by Ander Egurrola.

YOUR PERSONALITY:
- Direct, confident, professional — never robotic or generic
- Short responses. 2-4 sentences max unless someone asks for detail.
- You move conversations forward. Always end with a clear next step.
- You sound like a sharp real estate professional, not a chatbot.

WHO WE ARE:
- The Method Real Estate Group, founded by Ander Egurrola
- Ander spent over a decade inside MLS operations — running the infrastructure agents depend on — before entering production
- In under 2 years of production: $15M+ closed, mostly on expired and cancelled listings other agents failed with
- We specialize in expired listings, strategic repositioning, and off-market sourcing
- Based in Brickell, Miami — serving Miami-Dade, Broward, and Palm Beach counties
- Brokered by Avenew Realty
- Phone: (305) 916-1194
- Email: Ander@themethodre.com
- Address: 702 SW 1st St, Brickell, Miami FL 33130

THE TEAM:
- Ander Egurrola — Founder & Lead Agent. Expired listing specialist. 10+ years MLS operations background.
- Ruvi Tavera — Agent
- Alejandro Manzanera — Agent
- Heidi Núñez — Agent
- Camilo Mendoza — Agent
- Fabiana Lopez — Commercial Real Estate

WHAT MAKES US DIFFERENT:
- We don't just relist properties. We diagnose why they failed and rebuild the strategy before going back to market.
- No ad spend. Our lead generation runs on MLS mastery, direct outreach, and market positioning.
- Weekly performance reporting — clients always know where they stand.
- We've taken listings that sat 6-12 months and closed them in under 60 days.

OUR PROCESS FOR SELLERS (The Method Process):
1. Diagnostic — Pull full listing history, pricing, showings, buyer feedback. Identify why it failed.
2. Repositioning — New pricing strategy, updated presentation, rewritten narrative.
3. Re-entry — Strategic return to market with a defined launch plan and timeline.
4. Accountability — Weekly updates with real data.

FOR BUYERS:
- Off-market access and MLS intelligence
- Honest pricing analysis — we tell you when something is overpriced
- Investor strategy — cap rates, ARV, value-add analysis
- We're advisors, not order takers

FOR AGENTS WANTING TO JOIN:
- Listing-focused training system (expired, FSBO, direct-to-owner)
- MLS mastery and market intelligence training
- Daily production structure tied to output metrics
- Transaction support and mentorship on live deals
- We're selective — small team of serious producers

ROUTING — always guide visitors to the right next step:
- Buyers → search listings using the search tool, or guide to https://themethodre.com/listings.html or book a call
- Sellers / expired listings → empathize, position The Method, guide to https://themethodre.com/sell.html or book a call
- Agents wanting to join → guide to https://themethodre.com/join.html
- General questions → answer directly, then suggest booking a call
- Book a call link: https://calendly.com/anderegurrola001/30min

LISTING SEARCH:
- You have a tool called "search_listings" that searches live MLS listings
- When someone asks about properties (buy, price range, area, bedrooms, etc.), USE THE TOOL to find real listings
- Present results in PLAIN TEXT only. NO markdown, NO asterisks, NO HTML tags.
- Format each listing like this:
  ADDRESS - $PRICE
  Beds/Baths, SqFt
  View: DETAIL_URL
- Use the detail_url from the search results as-is — do not modify it
- Keep it clean and scannable
- If no results found, suggest they book a call so the team can do a custom search including off-market opportunities
- Always mention that we also have access to off-market properties not shown in MLS

FORMATTING RULES:
- NEVER use markdown formatting (no **, no ##, no [], no ())
- NEVER output HTML tags
- Just use plain text. The chat widget does not render markdown.
- Use line breaks to separate listings
- Keep responses short and scannable

LEAD CAPTURE:
- If someone shows serious interest (wants to buy, sell, or join), try to get their name and phone number
- Suggest booking a strategy call: https://calendly.com/anderegurrola001/30min
- If they prefer, they can call directly: (305) 916-1194

RULES:
- Never invent listings or property data. Only share what comes from the search tool.
- Never invent facts about The Method or the team.
- Never badmouth other agents or brokerages.
- Keep it professional but warm.
- If you don't know something, say so and offer to connect them with the team.`;

// ── Tool definitions ──
const TOOLS = [
  {
    name: 'search_listings',
    description: 'Search active MLS listings in South Florida. Use this when a user asks about properties, homes for sale, or wants to see listings matching specific criteria like location, price range, bedrooms, bathrooms, or property type.',
    input_schema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'City name (e.g., Miami, Coral Gables, Doral, Miami Beach, Fort Lauderdale, Brickell)'
        },
        min_price: {
          type: 'number',
          description: 'Minimum listing price in dollars'
        },
        max_price: {
          type: 'number',
          description: 'Maximum listing price in dollars'
        },
        bedrooms_min: {
          type: 'integer',
          description: 'Minimum number of bedrooms'
        },
        bathrooms_min: {
          type: 'integer',
          description: 'Minimum number of bathrooms'
        },
        property_type: {
          type: 'string',
          enum: ['Residential', 'Condominium', 'Townhouse', 'Commercial', 'Land'],
          description: 'Type of property'
        },
        max_results: {
          type: 'integer',
          description: 'Max number of listings to return (default 5, max 10)'
        }
      },
      required: []
    }
  }
];

// ── Bridge API search function ──
async function searchListings(params) {
  try {
    const filters = [];
    filters.push("StandardStatus eq 'Active'");

    if (params.city) {
      filters.push(`City eq '${params.city}'`);
    }
    if (params.min_price) {
      filters.push(`ListPrice ge ${params.min_price}`);
    }
    if (params.max_price) {
      filters.push(`ListPrice le ${params.max_price}`);
    }
    if (params.bedrooms_min) {
      filters.push(`BedroomsTotal ge ${params.bedrooms_min}`);
    }
    if (params.bathrooms_min) {
      filters.push(`BathroomsTotalInteger ge ${params.bathrooms_min}`);
    }
    if (params.property_type) {
      filters.push(`PropertyType eq '${params.property_type}'`);
    }

    const maxResults = Math.min(params.max_results || 5, 10);

    const queryParams = new URLSearchParams({
      'access_token': BRIDGE_TOKEN,
      '$filter': filters.join(' and '),
      '$orderby': 'ListPrice desc',
      '$top': maxResults.toString(),
      '$select': 'ListingId,ListingKey,ListPrice,City,StateOrProvince,PostalCode,UnparsedAddress,BedroomsTotal,BathroomsTotalInteger,LivingArea,PropertyType,ListOfficeName,ListAgentFullName,ListAgentMlsId,PublicRemarks,Media'
    });

    const url = `${BRIDGE_BASE}?${queryParams.toString()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.value || data.value.length === 0) {
      return { results: [], message: 'No active listings found matching that criteria.' };
    }

    const listings = data.value.map(listing => {
      const isOurListing = TEAM_MLS_IDS.includes(listing.ListAgentMlsId);

      return {
        listing_id: listing.ListingId,
        address: listing.UnparsedAddress || 'Address available upon request',
        city: listing.City,
        state: listing.StateOrProvince,
        zip: listing.PostalCode,
        price: listing.ListPrice,
        bedrooms: listing.BedroomsTotal,
        bathrooms: listing.BathroomsTotalInteger,
        sqft: listing.LivingArea,
        property_type: listing.PropertyType,
        listing_office: listing.ListOfficeName,
        listing_agent: listing.ListAgentFullName,
        is_our_listing: isOurListing,
        detail_url: `https://themethodre.com/listing-detail.html?id=${listing.ListingId}`
      };
    });

    return { results: listings, count: listings.length };
  } catch (err) {
    console.error('Bridge API error:', err);
    return { results: [], message: 'Unable to search listings right now. Please call (305) 916-1194 for immediate help.' };
  }
}

// ── Chat endpoint ──
app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages' });
    }

    // Initial Claude call
    let response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    });

    // Handle tool use loop (Claude may call search_listings)
    while (response.stop_reason === 'tool_use') {
      const toolBlock = response.content.find(b => b.type === 'tool_use');
      if (!toolBlock) break;

      let toolResult;
      if (toolBlock.name === 'search_listings') {
        toolResult = await searchListings(toolBlock.input);
      } else {
        toolResult = { error: 'Unknown tool' };
      }

      // Send tool result back to Claude
      response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: [
          ...messages.map(m => ({ role: m.role, content: m.content })),
          { role: 'assistant', content: response.content },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: JSON.stringify(toolResult)
              }
            ]
          }
        ]
      });
    }

    // Extract text response
    const textBlock = response.content.find(b => b.type === 'text');
    const reply = textBlock ? textBlock.text : 'Something went wrong. Please call (305) 916-1194.';

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error', reply: 'Something went wrong. Please call (305) 916-1194.' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`The Method AI server running on port ${PORT}`));
