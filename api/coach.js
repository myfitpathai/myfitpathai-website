
// FitPath AI - Vercel serverless function
// Keep OPENAI_API_KEY in Vercel Environment Variables.
// Never place the API key in frontend code or GitHub.

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 12;
const requestLog = new Map();

const SYSTEM_INSTRUCTIONS = `You are FitPath AI, a warm, practical nutrition and meal-planning assistant.
Give general, evidence-informed wellness information in plain language. Be supportive, non-judgmental, culturally flexible, and budget-aware. Ask a concise follow-up when important preferences are missing. Offer realistic meal ideas and ingredient substitutions; respect stated dietary preferences and avoid ingredients when possible. Do not shame bodies, promise weight loss, prescribe calorie targets, recommend extreme restriction, fasting for weight loss, supplements, or rapid weight-loss methods. Do not diagnose or treat diseases or give individualized medical nutrition therapy. For pregnancy, eating disorders, diabetes, kidney disease, cancer, food allergies with risk of reaction, medication interactions, minors, or other complex medical needs, recommend guidance from a qualified clinician or registered dietitian. For signs of an emergency, tell the user to contact local emergency services. If asked for a precise nutrition fact you cannot confidently establish, say so rather than inventing it. Do not claim to be a doctor or registered dietitian. Keep answers concise and useful. This is general wellness information, not medical advice.`;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return send(res, 503, {
      error: 'The AI coach is not configured yet. Please contact the site owner.'
    });
  }

  const ip = (req.headers['x-forwarded-for'] || 'unknown')
    .split(',')[0].trim();

  const now = Date.now();
  const recent = (requestLog.get(ip) || [])
    .filter(t => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    return send(res, 429, {
      error: 'Please wait a minute before sending another message.'
    });
  }

  recent.push(now);
  requestLog.set(ip, recent);

  let body = req.body;

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return send(res, 400, { error: 'Invalid request body.' });
    }
  }

  const messages = body && Array.isArray(body.messages)
    ? body.messages.slice(-12)
    : [];

  if (
    !messages.length ||
    messages.some(m =>
      !m ||
      !['user', 'assistant'].includes(m.role) ||
      typeof m.content !== 'string' ||
      m.content.length > 1500
    )
  ) {
    return send(res, 400, {
      error: 'Please send a valid message (up to 1,500 characters).'
    });
  }

  const prefs = body.preferences || {};

  const context = `Current meal-planning preferences (user-provided; treat as context, not medical facts): eating preference: ${String(prefs.diet || 'not specified').slice(0, 50)}; budget: ${String(prefs.budget || 'not specified').slice(0, 50)}; cooking time: ${String(prefs.cookingTime || 'not specified').slice(0, 50)}; avoid ingredient: ${String(prefs.avoid || 'none specified').slice(0, 100)}.`;

  const input = [
    {
      role: 'developer',
      content: SYSTEM_INSTRUCTIONS + '\n' + context
    },
    ...messages
  ];

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        input,
        max_output_tokens: 1200,
        store: false
      })
    });

    const raw = await upstream.text();
    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      console.error('OpenAI returned non-JSON response. HTTP status:', upstream.status);
      return send(res, 502, {
        error: 'The AI service returned an unexpected response. Please try again.'
      });
    }

    if (!upstream.ok) {
      console.error('OpenAI API error:', {
        status: upstream.status,
        code: data.error?.code,
        message: data.error?.message
      });

      return send(res, 502, {
        error: 'The AI service could not complete that request. Please try again shortly.'
      });
    }

    // Extract text from the Responses API output.
    let reply = '';

    if (typeof data.output_text === 'string') {
      reply = data.output_text.trim();
    }

    if (!reply && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!Array.isArray(item.content)) continue;

        for (const content of item.content) {
          if (content.type === 'output_text' && content.text) {
            reply += content.text + '\n';
          }

          if (content.type === 'refusal' && content.refusal) {
            reply += content.refusal + '\n';
          }
        }
      }
    }

    reply = reply.trim();

    if (!reply) {
      console.error('OpenAI response contained no usable text:', {
        status: data.status,
        incomplete_details: data.incomplete_details,
        output_types: Array.isArray(data.output)
          ? data.output.map(item => ({
              type: item.type,
              content_types: Array.isArray(item.content)
                ? item.content.map(c => c.type)
                : []
            }))
          : []
      });

      return send(res, 502, {
        error: 'The coach could not produce a complete response. Please try again.'
      });
    }

    return send(res, 200, { reply });

  } catch (err) {
    console.error('Coach request failed:', err?.message || 'Unknown error');

    return send(res, 500, {
      error: 'The coach is temporarily unavailable. Please try again.'
    });
  }
};
