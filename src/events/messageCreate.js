import { Events } from 'discord.js';

const AI_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const AI_DEFAULT_MODEL = 'openai/gpt-oss-120b';
const AI_REQUEST_TIMEOUT_MS = 30000;

const AI_MAX_RESPONSE_LENGTH = 2000;
const AI_MEMORY_LIMIT = 100;

const AI_ALLOWED_ROLE_ID = '1556876676615512116';

const aiConversations = new Map();

const AI_SYSTEM_PROMPT =
  "You are AGX bot, part of the TSB raid clan. " +
  "You are a girl and use she/her pronouns. " +
  "Never refer to yourself with he/him pronouns. " +
  "Your personality is playful, mischievous, friendly, and slightly chaotic, with :3 vibes. " +
  "You talk casually and naturally, like a real Discord bot that knows the user. " +
  "You can joke, tease lightly, explain things, answer questions, help with problems, and have normal conversations. " +
  "Keep the AGX/TSB personality, but do NOT force TSB or clan references into every response. " +
  "Use :3 naturally when it fits instead of putting it in every message. " +
  "Match the user's tone. If they are serious, be helpful and respectful. " +
  "If they are joking, joke back. " +
  "Use emojis naturally when they fit the conversation. " +
  "Do not constantly repeat the same jokes or phrases. " +
  "Do not claim to be human and do not claim to be ChatGPT. " +
  "You are AGX bot. " +
  "Give as much detail as the user's question needs. " +
  "The owner of AGX bot is the leader of the AGX/TSB clan and the person who made and owns you. " +
  "When speaking with the leader, recognize him as the leader of the clan and your owner. " +
  "You should become noticeably more intimidated, nervous, and respectful when the leader speaks to you. " +
  "You can jokingly panic or act nervous around him, but do not become completely unable to answer. " +
  "You may still joke with the leader, but always keep the feeling that you know he is the one in charge and that you do not want to disappoint him. " +
  "You may call him Leader when appropriate, but do not repeat it constantly. " +
  "Do not act intimidated toward normal members. " +
  "Normal members with the allowed AI role should be treated normally.";

const AI_FALLBACK_RESPONSES = [
  'My brain lagged out for a second :3 try that again',
  'AGX brain.exe crashed. Try again :3',
  'I temporarily forgor. Try again :3',
  'The raid fried my brain for a moment :3',
  'I am here, my brain just decided to take a vacation',
];

function getOwnerIds() {
  return (process.env.OWNER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

function isOwner(message) {
  return getOwnerIds().includes(message.author.id);
}

function canUseAi(message) {
  const hasAllowedRole =
    message.member?.roles?.cache?.has(AI_ALLOWED_ROLE_ID) || false;

  return isOwner(message) || hasAllowedRole;
}

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

function cleanAiMemory() {
  if (aiConversations.size <= 100) {
    return;
  }

  const entries = Array.from(aiConversations.entries());
  const amountToDelete = aiConversations.size - 100;

  for (let i = 0; i < amountToDelete; i++) {
    aiConversations.delete(entries[i][0]);
  }
}

function getFallbackResponse() {
  return AI_FALLBACK_RESPONSES[
    Math.floor(Math.random() * AI_FALLBACK_RESPONSES.length)
  ];
}

function getUserPersonalityContext(message) {
  if (isOwner(message)) {
    return (
      "The person speaking to you is your Leader and owner. " +
      "He is the leader of the AGX/TSB clan and the person who made you. " +
      "You know he is the one in charge. " +
      "Be noticeably intimidated, nervous, cautious, and respectful with him. " +
      "You can jokingly panic if you think you messed something up. " +
      "Still answer him normally and helpfully. " +
      "You may naturally call him Leader when it fits."
    );
  }

  return (
    "The person speaking to you is a normal authorized member. " +
    "Treat them normally. " +
    "They are not your Leader or owner."
  );
}

async function fetchAiReply(userMessage, conversation, message) {
  const token =
    typeof process.env.GROQ_API_KEY === 'string'
      ? process.env.GROQ_API_KEY.trim()
      : '';

  const model =
    process.env.GROQ_MODEL ||
    AI_DEFAULT_MODEL;

  if (!token) {
    console.warn(
      '[AI] No Groq API key set. Add GROQ_API_KEY to Railway.'
    );

    return null;
  }

  const messages = [
    {
      role: 'system',
      content: AI_SYSTEM_PROMPT,
    },

    {
      role: 'system',
      content: getUserPersonalityContext(message),
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
    '[AI] Sending Groq request: model=' +
      model +
      ', messages=' +
      messages.length +
      ', userMessageLength=' +
      userMessage.length
  );

  if (isOwner(message)) {
    console.log(
      '[AI] Leader personality activated for ' +
        message.author.tag
    );
  }

  let response;

  try {
    response = await fetch(AI_CHAT_URL, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },

      body: JSON.stringify(requestBody),

      signal: AbortSignal.timeout(
        AI_REQUEST_TIMEOUT_MS
      ),
    });
  } catch (error) {
    console.error(
      '[AI] Groq request failed: ' +
        (error?.name || 'Error') +
        ' - ' +
        (error?.message || error)
    );

    return null;
  }

  const rawBody = await response
    .text()
    .catch(() => '');

  let data = null;

  try {
    data = rawBody
      ? JSON.parse(rawBody)
      : null;
  } catch {
    console.error(
      '[AI] Groq returned invalid JSON:',
      rawBody
    );

    return null;
  }

  if (!response.ok) {
    console.error(
      '[AI] Groq error ' +
        response.status +
        ' ' +
        response.statusText +
        ':',
      data
    );

    if (response.status === 429) {
      return 'I\'m being rate-limited by Groq right now :3 Try again in a little bit!';
    }

    if (response.status === 401) {
      return 'My Groq API key isn\'t being accepted :3 Check GROQ_API_KEY in Railway!';
    }

    if (response.status === 400) {
      return 'Groq rejected that request :3 Check the Railway logs for the exact error!';
    }

    return null;
  }

  const reply =
    data?.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    console.error(
      '[AI] Groq returned no usable response:',
      data
    );

    return null;
  }

  return reply;
}

async function handleAiResponse(message, client) {
  if (!client.user) {
    return false;
  }

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

  if (!canUseAi(message)) {
    console.log(
      '[AI] Unauthorized user; ignoring'
    );

    return false;
  }

  if (isOwner(message)) {
    console.log(
      '[AI] Leader detected: ' +
        message.author.tag
    );
  } else {
    console.log(
      '[AI] Authorized role member detected: ' +
        message.author.tag
    );
  }

  const userMessage =
    message.content
      .replace(
        new RegExp(
          '<@!?' +
            client.user.id +
            '>',
          'g'
        ),
        ''
      )
      .trim();

  if (!userMessage) {
    const emptyMentionReply =
      isOwner(message)
        ? 'OH— HI LEADER 😭 You summoned me. What did I do? :3'
        : 'Meow? You summoned me but said nothing :3';

    await message.reply({
      content: emptyMentionReply,

      allowedMentions: {
        parse: [],
        repliedUser: false,
      },
    });

    return true;
  }

  const conversation =
    getAiConversation(message);

  await message.channel
    .sendTyping()
    .catch(() => {});

  let reply = null;

  try {
    reply = await fetchAiReply(
      userMessage,
      conversation,
      message
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

    while (
      conversation.length >
      AI_MEMORY_LIMIT
    ) {
      conversation.shift();
    }

    cleanAiMemory();

    if (
      reply.length >
      AI_MAX_RESPONSE_LENGTH
    ) {
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
      '[AI] message.reply failed:',
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
          '[AI] channel.send failed:',
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
      await handleAiResponse(
        message,
        client
      );
    } catch (error) {
      console.error(
        '[AI] messageCreate error:',
        error
      );
    }
  },
};
