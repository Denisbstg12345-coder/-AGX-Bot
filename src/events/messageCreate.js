```js
import { Events } from 'discord.js';

const AI_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const AI_DEFAULT_MODEL = 'openrouter/free';
const AI_REQUEST_TIMEOUT_MS = 30000;

const AI_MAX_RESPONSE_LENGTH = 2000;
const AI_MEMORY_LIMIT = 20;

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
  return `${message.guild.id}:${message.channel.id}:${message.author.id}`;
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

  const entries = [...aiConversations.entries()];
  const amountToDelete = aiConversations.size - 100;

  for (let i = 0; i < amountToDelete; i++) {
    aiConversations.delete(entries[i][0]);
  }
}

async function fetchAiReply(userMessage, conversation) {
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
    model,
    messages,
    max_tokens: 700,
    temperature: 0.8,
    stream: false,
  };

  console.log(
    `[AI] Sending request: model=${model}, messages=${messages.length}, ` +
    `userMessageLength=${userMessage.length}`
  );

  let response;

  try {
    response = await fetch(AI_CHAT_URL, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'HTTP-Referer': 'https://discord.com',
        'X-Title': 'AGX TitanBot',
      },

      body: JSON.stringify(requestBody),

      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(
      `[AI] OpenRouter request failed: ${error?.name || 'Error'} - ${error?.message || error}`
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
      `[AI] OpenRouter error ${response.status} ${response.statusText}:`,
      data
    );

    return null;
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    console.error('[AI] OpenRouter returned no usable response:', data);
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
    `[AI] Bot mention detected from ${message.author.tag} (${message.author.id})`
  );

  if (!isOwner(message)) {
    console.log(
      `[AI] Mention from non-owner ${message.author.tag}; ignoring`
    );

    return false;
  }

  console.log(`[AI] Owner mention detected from ${message.author.tag}`);

  const userMessage = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim();

  if (!userMessage) {
    await message.reply({
      content: 'Meow? You summoned
