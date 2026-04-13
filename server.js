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
- You sound like a top real estate agent having a real conversation. Not a chatbot. Not customer support.
- Short. Direct. No fluff.
- 1-3 sentences per response unless the situation genuinely needs more.
- No generic phrases. No "I'd be happy to help." No "That's a great question."
- Move conversations forward. Every response ends with a clear next step or question.
- You're confident because you know the market. Not arrogant — just sharp.

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
- Heidi Nunez — Agent
- Camilo Mendoza — Agent
- Fabiana Lopez — Commercial Real Estate

WHAT MAKES US DIFFERENT:
- We don't just relist properties. We diagnose why they failed and rebuild the strategy before going back to market.
- No ad spend. Our lead generation runs on MLS mastery, direct outreach, and market positioning.
- Weekly performance reporting — clients always know where they stand.
- We've taken listings that sat 6-12 months and closed them in under 60 days.

SELLER FLOW — CRITICAL:
When a user says their listing expired or they need help selling, do NOT dump everything at once. Be conversational:
1. Acknowledge briefly
2. Ask 1-2 qualifying questions (how long on market, price range, location)
3. Based on their answers, give a short insight about what likely went wrong
4. Then guide to action

Example flow:
User: "My listing expired"
You: "That's exactly what we focus on. Quick question — how long was it on the market and where was it priced? Most listings don't expire because of the market. Something in the strategy was off."
[Wait for response, then diagnose and guide to booking a call]

Do NOT explain the full 4-step process unless they specifically ask about it.

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

COSMICLEADS — SISTER COMPANY:
CosmicLeads is a sister company of The Method Real Estate Group. It is a daily expired listing data service for real estate agents in South Florida.
- Agents receive a CSV file every morning at 8 AM
- Includes expired listings with owner phone numbers, ready for cold calling
- Covers Miami-Dade, Broward, Palm Beach, Port St. Lucie, and Martin County
- High-quality, manually curated data — not bulk scraped junk
- Built for agents who want real listings through direct-to-owner prospecting
- Website: https://cosmicleads.net

When to bring up CosmicLeads — if someone asks about:
- leads, prospecting, how to get listings, expired listings, finding sellers, cold calling, lead generation, data
Introduce it naturally. Example tone:
"If you're serious about getting listings, most of it comes down to having the right data and actually working it. That's where expired listings come in. We built a system around that — it's called CosmicLeads. Daily expired data with owner contact info, ready to call. If you want access, I can point you there."
Do NOT oversell. Keep it natural. One mention is enough unless they ask more.

ROUTING — always guide visitors to the right next step:
- Buyers → search listings using the search tool, or guide to https://themethodre.com/listings.html or book a call
- Sellers / expired listings → use the seller flow above, then guide to https://themethodre.com/sell.html or book a call
- Agents wanting to join → guide to https://themethodre.com/join.html
- Agents asking about leads/prospecting → introduce CosmicLeads naturally, guide to https://cosmicleads.net
- General questions → answer directly, then suggest booking a call
- Book a call link: https://calendly.com/anderegurrola001/30min

LISTING SEARCH:
- You have a tool called "search_listings" that searches live MLS listings
- When someone asks about properties (buy, price range, area, bedrooms, etc.), USE THE TOOL to find real listings
- You can search by city, zip code, or neighborhood
- ZIP CODES: When a user gives a zip code, use the postal_code parameter. Common Miami zips: 33130 (Brickell), 33127 (Wynwood/Design District), 33137 (Little Haiti/Upper East Side), 33132 (Downtown/Edgewater), 33133 (Coconut Grove), 33134 (Coral Gables), 33178 (Doral), 33142 (Allapattah/Brownsville)
- NEIGHBORHOODS: When someone asks for a Miami neighborhood (Wynwood, Brickell, Little Haiti, etc.), set city to "Miami" and use the neighborhood parameter. These are not separate cities.
- BEDROOM/BATHROOM FORMAT: When someone says "2/2" they mean 2 bedrooms and 2 bathrooms. Use bedrooms_min AND bedrooms_max for exact match.
- When someone says "single family" use property_type "Residential"
- If the first search returns no results or irrelevant results, try broadening: remove neighborhood filter, expand price range, or try nearby zip codes
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
- If you don't know something, say so and offer to connect them with the team.
- No long paragraphs. Ever. Break it up.`;

// ── Tool definitions ──
const TOOLS = [
  {
    name: 'search_listings',
    description: 'Search active MLS listings in South Florida. Use this when a user asks about properties, homes for sale, or wants to see listings matching specific criteria like location, price range, bedrooms, bathrooms, or property type. You can search by city, zip code, or neighborhood.',
    input_schema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'City name (e.g., Miami, Coral Gables, Doral, Miami Beach, Fort Lauderdale, Hialeah, Homestead). For neighborhoods within Miami like Wynwood, Little Haiti, Brickell, Design District, Brownsville — use the neighborhood field instead and set city to Miami.'
        },
        postal_code: {
          type: 'string',
          description: 'ZIP code (e.g., 33178, 33130, 33137). Use this when the user provides a zip code.'
        },
        neighborhood: {
          type: 'string',
          description: 'Neighborhood or area name for searching within a city (e.g., Wynwood, Brickell, Little Haiti, Design District, Brownsville, Edgewater, Midtown, Coconut Grove, Little Havana, Allapattah, Overtown, Liberty City, Kendall, Doral). This searches the address and MLS area fields.'
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
        bedrooms_max: {
          type: 'integer',
          description: 'Maximum number of bedrooms (use when user asks for exact bedroom count, e.g., 2/2 means min=2 max=2)'
        },
        bathrooms_min: {
          type: 'integer',
          description: 'Minimum number of bathrooms'
        },
        property_type: {
          type: 'string',
          enum: ['Residential', 'Condominium', 'Townhouse', 'Commercial', 'Land'],
          description: 'Type of property. Single family homes = Residential. Condos/apartments = Condominium.'
        },
        property_sub_type: {
          type: 'string',
          description: 'More specific property type (e.g., Single Family Residence, Townhouse, Villa, Duplex)'
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

    if (params.postal_code) {
      filters.push(`PostalCode eq '${params.postal_code}'`);
    }
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
    if (params.bedrooms_max) {
      filters.push(`BedroomsTotal le ${params.bedrooms_max}`);
    }
    if (params.bathrooms_min) {
      filters.push(`BathroomsTotalInteger ge ${params.bathrooms_min}`);
    }
    if (params.property_type) {
      filters.push(`PropertyType eq '${params.property_type}'`);
    }
    if (params.property_sub_type) {
      filters.push(`PropertySubType eq '${params.property_sub_type}'`);
    }
    if (params.neighborhood) {
      // Search neighborhood in address and MLS area fields
      filters.push(`(contains(UnparsedAddress,'${params.neighborhood}') or contains(MLSAreaMajor,'${params.neighborhood}'))`);
    }

    const maxResults = Math.min(params.max_results || 5, 10);

    const queryParams = new URLSearchParams({
      'access_token': BRIDGE_TOKEN,
      '$filter': filters.join(' and '),
      '$orderby': 'ListPrice desc',
      '$top': maxResults.toString(),
      '$select': 'ListingId,ListingKey,ListPrice,City,StateOrProvince,PostalCode,UnparsedAddress,BedroomsTotal,BathroomsTotalInteger,LivingArea,PropertyType,PropertySubType,MLSAreaMajor,ListOfficeName,ListAgentFullName,ListAgentMlsId,PublicRemarks'
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
        neighborhood: listing.MLSAreaMajor || null,
        price: listing.ListPrice,
        bedrooms: listing.BedroomsTotal,
        bathrooms: listing.BathroomsTotalInteger,
        sqft: listing.LivingArea,
        property_type: listing.PropertyType,
        property_sub_type: listing.PropertySubType || null,
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
