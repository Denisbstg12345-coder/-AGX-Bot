import { Events } from 'discord.js';

const AI_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const AI_DEFAULT_MODEL = 'openrouter/free';
const AI_REQUEST_TIMEOUT_MS = 30000;

const AI_MAX_RESPONSE_LENGTH = 2000;
const AI_MEMORY_LIMIT = 20;

// Local safety limit. This does NOT increase OpenRouter's limit.
const AI_DAILY_REQUEST_LIMIT = 50;

let aiDailyRequestCount = 0;
let aiDailyRequestDate = new Date().toISOString().slice(0, 10);

const AI_SYSTEM_PROMPT =
  "You are AGX bot, part of the TSB raid clan. " +
  "Your personality is playful, mischievous, friendly, and slightly chaotic, with :3 vibes. " +
  "You talk casually and naturally, like a real Discord bot that knows the user. " +
  "You can joke, tease lightly, explain things, answer questions, help with problems, and have normal conversations. " +
  "Keep the AGX/TSB personality, but do NOT force TSB or clan references into every response. " +
  "Use :3 naturally when it fits instead of putting it in every message. " +
  "Match the user's tone. If they are serious, be helpful and respectful. " +
  "If they are joking, joke back. " +
  "Do not use emojis or emoji characters. " +
  "Do not constantly repeat the same jokes or phrases. " +
  "Do not claim to be human and do not claim to be ChatGPT. " +
  "You are AGX bot. " +
  "Give as much detail as the user's question needs instead of always limiting yourself to one or two sentences.";

const AI_FALLBACK_RESPONSES = [
  'My brain lagged out for a second :3 try that again',
  'AGX brain.exe crashed. Try again :3',
  'I temporarily forgor. Try again :3',
  'The raid fried my brain for a moment :3',
  'I am here, my brain just decided to take a vacation',
];

const aiConversations = new Map();

function getAiConversationKey(message) {
  return (
    message.guild.id +
    ':' +
    message.channel.id +
    ':' +
    message.author.id
  );
}

function getAiConversation(message) {
  const key = getAiConversationKey(message);

  if (!aiConversations.has(key)) {
    aiConversations.set(key, []);
  }

  return aiConversations.get(key);
}

function getFallbackResponse() {
  return AI_FALLBACK_RESPONSES[
    Math.floor(Math.random() * AI_FALLBACK_RESPONSES.length)
  ];
}

function cleanAiMemory() {
  if (aiConversations.size <= 100) return;

  const entries = Array.from(aiConversations.entries());
  const amountToDelete = aiConversations.size - 100;

  for (let i = 0; i < amountToDelete; i++) {
    aiConversations.delete(entries[i][0]);
  }
}

function canMakeAiRequest() {
  const today = new Date().toISOString().slice(0, 10);

  if (today !== aiDailyRequestDate) {
    aiDailyRequestDate = today;
    aiDailyRequestCount = 0;

    console.log('[AI] Daily request counter reset.');
  }

  if (aiDailyRequestCount >= AI_DAILY_REQUEST_LIMIT) {
    console.log(
      '[AI] Local daily request limit reached: ' +
        aiDailyRequestCount +
        '/' +
        AI_DAILY_REQUEST_LIMIT
    );

    return false;
  }

  aiDailyRequestCount++;

  console.log(
    '[AI] Daily requests: ' +
      aiDailyRequestCount +
      '/' +
      AI_DAILY_REQUEST_LIMIT
  );

  return true;
}

async function fetchAiReply(userMessage, conversation) {
  if (!canMakeAiRequest()) {
    return 'I\'ve reached my daily AI request limit. I\'ll be back after the reset :3';
  }

  const rawToken = process.env.OPENROUTER_API_KEY;
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';

  const model = process.env.OPENROUTER_MODEL || AI_DEFAULT_MODEL;

  if (!token) {
    console.warn(
      '[AI] No OpenRouter API key set. Add OPENROUTER_API_KEY to your .env file.'
    );
    return null;
  }

  if (!token.startsWith('sk-or-')) {
    console.warn(
      '[AI] OPENROUTER_API_KEY does not look like an OpenRouter key.'
    );
    return null;
  }

  const messages = [
    {
      role: 'system',
      content: AI_SYSTEM_PROMPT,
    },

    ...conversation,

    {
      role: 'user',
      content: userMessage,
    },
  ];

  const requestBody = {
    model: model,
    messages: messages,
    max_tokens: 700,
    temperature: 0.8,
    stream: false,
  };

  console.log(
    '[AI] Sending request: model=' +
      model +
      ', messages=' +
      messages.length +
      ', userMessageLength=' +
      userMessage.length
  );

  let response;

  try {
    response = await fetch(AI_CHAT_URL, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        'HTTP-Referer': 'https://discord.com',
        'X-Title': 'AGX TitanBot',
      },

      body: JSON.stringify(requestBody),

      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(
      '[AI] OpenRouter request failed: ' +
        (error && error.name ? error.name : 'Error') +
        ' - ' +
        (error && error.message ? error.message : error)
    );

    return null;
  }

  const rawBody = await response.text().catch(() => '');

  let data = null;

  try {
    data = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    console.error('[AI] OpenRouter returned invalid JSON:', rawBody);
    return null;
  }

  if (!response.ok) {
    console.error(
      '[AI] OpenRouter error ' +
        response.status +
        ' ' +
        response.statusText +
        ':',
      data
    );

    if (
      response.status === 429 &&
      data?.error?.metadata?.limit_source ===
        'openrouter_free_tier_daily'
    ) {
      const resetHeader = response.headers.get('X-RateLimit-Reset');

      if (resetHeader) {
        let resetTimestamp = Number(resetHeader);

        // Handle either milliseconds or seconds
        if (resetTimestamp < 100000000000) {
          resetTimestamp *= 1000;
        }

        const resetDate = new Date(resetTimestamp);
        const now = Date.now();
        const remainingMs = Math.max(
          0,
          resetTimestamp - now
        );

        const totalMinutes = Math.ceil(
          remainingMs / 60000
        );

        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        let timeLeft;

        if (hours > 0 && minutes > 0) {
          timeLeft =
            hours +
            (hours === 1 ? ' hour' : ' hours') +
            ' and ' +
            minutes +
            (minutes === 1 ? ' minute' : ' minutes');
        } else if (hours > 0) {
          timeLeft =
            hours +
            (hours === 1 ? ' hour' : ' hours');
        } else {
          timeLeft =
            minutes +
            (minutes === 1 ? ' minute' : ' minutes');
        }

        console.log(
          '[AI] Free AI limit resets at: ' +
            resetDate.toLocaleString('en-GB', {
              timeZone: 'Europe/Bucharest',
              dateStyle: 'full',
              timeStyle: 'long',
            })
        );

        console.log(
          '[AI] Time until reset: ' + timeLeft
        );

        return (
          'I hit today\'s free AI limit :3 You can use me again in ' +
          timeLeft +
          '!'
        );
      }

      console.log(
        '[AI] OpenRouter did not provide X-RateLimit-Reset.'
      );

      return 'I hit today\'s free AI limit :3 I\'ll be back after the daily reset!';
    }

    return null;
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    console.error(
      '[AI] OpenRouter returned no usable response:',
      data
    );
    return null;
  }

  return reply;
}

function isOwner(message) {
  const ownerIds = (process.env.OWNER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  return ownerIds.includes(message.author.id);
}

async function handleAiResponse(message, client) {
  if (!client.user) return false;

  if (
    !message.mentions.has(client.user, {
      ignoreEveryone: true,
      ignoreRoles: true,
    })
  ) {
    return false;
  }

  console.log(
    '[AI] Bot mention detected from ' +
      message.author.tag +
      ' (' +
      message.author.id +
      ')'
  );

  if (!isOwner(message)) {
    console.log(
      '[AI] Mention from non-owner ' +
        message.author.tag +
        '; ignoring'
    );

    return false;
  }

  console.log(
    '[AI] Owner mention detected from ' +
      message.author.tag
  );

  const userMessage = message.content
    .replace(
      new RegExp('<@!?' + client.user.id + '>', 'g'),
      ''
    )
    .trim();

  if (!userMessage) {
    await message.reply({
      content:
        'Meow? You summoned me but said nothing, clan leader :3',
      allowedMentions: {
        parse: [],
        repliedUser: false,
      },
    });

    return true;
  }

  const conversation = getAiConversation(message);

  await message.channel.sendTyping().catch(() => {});

  let reply = null;

  try {
    reply = await fetchAiReply(
      userMessage,
      conversation
    );
  } catch (error) {
    console.error(
      '[AI] Unexpected AI error:',
      error
    );
  }

  if (!reply) {
    reply = getFallbackResponse();
  } else {
    conversation.push({
      role: 'user',
      content: userMessage,
    });

    conversation.push({
      role: 'assistant',
      content: reply,
    });

    while (conversation.length > AI_MEMORY_LIMIT) {
      conversation.shift();
    }

    cleanAiMemory();

    if (reply.length > AI_MAX_RESPONSE_LENGTH) {
      reply =
        reply.slice(
          0,
          AI_MAX_RESPONSE_LENGTH - 3
        ) + '...';
    }
  }

  try {
    await message.reply({
      content: reply,
      allowedMentions: {
        parse: [],
        repliedUser: false,
      },
    });

    console.log('[AI] Reply sent');
  } catch (replyError) {
    console.error(
      '[AI] message.reply failed, trying channel.send:',
      replyError
    );

    await message.channel
      .send({
        content: reply,
        allowedMentions: {
          parse: [],
        },
      })
      .catch(sendError => {
        console.error(
          '[AI] channel.send also failed:',
          sendError
        );
      });
  }

  return true;
}

export default {
  name: Events.MessageCreate,
  once: false,

  async execute(message, client) {
    try {
      await handleAiResponse(message, client);
    } catch (error) {
      console.error(
        '[AI] messageCreate error:',
        error
      );
    }
  },
};
