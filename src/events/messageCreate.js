import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling.js';
import { addXp } from '../services/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commandAliases.js';
import { getPrefixRestriction } from '../config/prefixRestrictions.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';

const HF_CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_DEFAULT_MODEL = 'meta-llama/Llama-3.2-3B-Instruct';
const AI_REQUEST_TIMEOUT_MS = 15000;
const AI_FALLBACK_RESPONSES = [
  'Brain.exe stopped responding, the raids fried my circuits :3',
  'cant think right now, too busy raiding :3',
  'My brain lagged out, the clan raid prep got me dizzy :3',
  'AGX is on a raid break, ask me again after we win :3',
  'Error 404: thoughts not found, the TSB grind took them :3',
];
const AI_MAX_RESPONSE_LENGTH = 400;
const AI_SYSTEM_PROMPT =
  "You are AGX bot, part of the TSB raid clan. You're playful and mischievous (use :3 vibes). " +
  'Keep responses short (1-2 sentences max) and clan-focused. Only give TSB raid clan themed responses.';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      console.log('[MSG_DEBUG] Raw message from', message.author.tag, 'content:', message.content.slice(0, 50));

      if (message.author.bot || !message.guild) return;

      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

      const countingProcessed = await handleCountingGame(message, client);
      if (countingProcessed) {
        return;
      }

      const aiProcessed = await handleAiResponse(message, client);
      if (aiProcessed) {
        return;
      }

      await handlePrefixCommand(message, client);

      await handleLeveling(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

function getOwnerIds() {
  return (process.env.OWNER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

function isOwner(message) {
  const ownerIds = getOwnerIds();
  console.log(`[OWNER_CHECK] User: ${message.author.id}, Owner IDs configured: ${ownerIds.join(',')}`);

  if (ownerIds.length === 0) {
    console.log('[OWNER_CHECK] No owner IDs configured');
    return false;
  }

  // Check if user ID matches
  if (ownerIds.includes(message.author.id)) {
    console.log(`[OWNER_CHECK] Is owner by user ID: true`);
    return true;
  }

  // Check if any role ID matches
  if (message.member && message.member.roles && message.member.roles.cache) {
    for (const [roleId] of message.member.roles.cache) {
      if (ownerIds.includes(roleId)) {
        console.log(`[OWNER_CHECK] Is owner by role ID ${roleId}: true`);
        return true;
      }
    }
  }

  console.log(`[OWNER_CHECK] Is owner: false`);
  return false;
}

function getFallbackResponse() {
  return AI_FALLBACK_RESPONSES[Math.floor(Math.random() * AI_FALLBACK_RESPONSES.length)];
}

async function fetchAiReply(userMessage) {
  const rawToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
  const token = typeof rawToken === 'string' ? rawToken.trim() : rawToken;
  const model = process.env.HF_MODEL || HF_DEFAULT_MODEL;

  if (!token) {
    console.warn('[AI] No HuggingFace token set (HF_TOKEN / HUGGINGFACE_API_KEY / HF_API_KEY); using fallback');
    return null;
  }

  if (token.startsWith('${')) {
    console.error(
      '[AI] HF_TOKEN appears to be an unsubstituted template variable (starts with "${"); ' +
      'the environment variable was not resolved. Using fallback'
    );
    return null;
  }

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 80,
    stream: false,
  };

  console.log(
    `[AI] Token present: true, length: ${token.length}, prefix "hf_": ${token.startsWith('hf_')}`
  );
  console.log(`[AI] Request URL: ${HF_CHAT_URL}`);
  console.log(
    `[AI] Request details: model=${model}, max_tokens=${requestBody.max_tokens}, ` +
    `stream=${requestBody.stream}, userMessageLength=${userMessage.length}, timeoutMs=${AI_REQUEST_TIMEOUT_MS}`
  );

  let response;
  try {
    response = await fetch(HF_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });
  } catch (fetchError) {
    console.error(
      `[AI] fetch to HuggingFace failed: name=${fetchError?.name}, message=${fetchError?.message}, ` +
      `cause=${fetchError?.cause?.code || fetchError?.cause?.message || fetchError?.cause || 'none'}`
    );
    console.error('[AI] fetch error stack:', fetchError?.stack);
    throw fetchError;
  }

  console.log(`[AI] HuggingFace responded with status ${response.status} ${response.statusText}`);

  const rawBody = await response.text().catch(err => {
    console.error(`[AI] Failed to read HuggingFace response body: ${err?.message || err}`);
    return '';
  });

  let data = null;
  try {
    data = rawBody ? JSON.parse(rawBody) : null;
    console.log(`[AI] Parsed HuggingFace JSON response (status ${response.status}): ${JSON.stringify(data)}`);
  } catch (parseError) {
    console.error(`[AI] HuggingFace response was not valid JSON (${parseError.message}). Raw body: ${rawBody}`);
  }

  if (!response.ok) {
    console.error(`[AI] HuggingFace error ${response.status} ${response.statusText}. Full response body: ${rawBody}`);
    return null;
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    console.error(`[AI] HuggingFace returned no usable content. Full response body: ${rawBody}`);
    return null;
  }

  return reply;
}

async function handleAiResponse(message, client) {
  if (!client.user) return false;
  if (!message.mentions.has(client.user, { ignoreEveryone: true, ignoreRoles: true })) return false;
  console.log(`[AI] Bot mention detected from ${message.author.tag} (${message.author.id})`);
  if (!isOwner(message)) {
    console.log(`[AI] Mention from non-owner ${message.author.tag} (${message.author.id}); ignoring`);
    return false;
  }

  console.log(`[AI] Owner mention detected from ${message.author.tag}`);

  let reply = null;

  try {
    const userMessage = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
      .trim();

    if (!userMessage) {
      await message.reply('Meow? You summoned me but said nothing, clan leader :3');
      return true;
    }

    await message.channel.sendTyping().catch(() => {});

    try {
      reply = await fetchAiReply(userMessage);
    } catch (apiError) {
      const reason = apiError?.name === 'TimeoutError' ? 'request timed out' : apiError?.message || apiError;
      console.error(`[AI] HuggingFace request failed: ${reason}`);
    }
  } catch (error) {
    console.error('[AI] Unexpected error while preparing AI response:', error);
  }

  if (reply) {
    console.log('[AI] Using AI-generated reply');
    if (reply.length > AI_MAX_RESPONSE_LENGTH) {
      reply = `${reply.slice(0, AI_MAX_RESPONSE_LENGTH - 3)}...`;
    }
  } else {
    console.log('[AI] Using fallback reply');
    reply = getFallbackResponse();
  }

  try {
    await message.reply({ content: reply, allowedMentions: { parse: [], repliedUser: false } });
    console.log('[AI] Reply sent');
  } catch (replyError) {
    console.error('[AI] message.reply failed, trying channel.send:', replyError);
    await message.channel.send({ content: reply, allowedMentions: { parse: [] } }).catch(sendError => {
      console.error('[AI] channel.send also failed:', sendError);
    });
  }

  return true;
}

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || client.config.bot.prefix || '!';
    const parsed = parsePrefixCommand(message.content, prefix);
    
    if (!parsed) {
      return; 
    }

    const { commandName, args } = parsed;
    logger.info(`Prefix command detected: ${commandName}, args: ${args.join(', ')}`);

    const resolvedCommandName = resolveCommandAlias(commandName);
    logger.info(`Resolved command name: ${resolvedCommandName}`);
    const command = client.commands.get(resolvedCommandName);

    if (!command) {
      logger.warn(`Command not found: ${resolvedCommandName}`);
      return; 
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      if (restriction.blocked && restriction.reason) {
        const embed = createEmbed({
          title: 'Slash Command Only',
          description: `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`,
          color: 'info',
        });
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
      return;
    }

    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) {
      const embed = createEmbed({
        title: 'Command Disabled',
        description: 'This command has been disabled for this server.',
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };
    const abuseProtection = await enforceAbuseProtection(
      mockInteractionForProtection,
      command,
      resolvedCommandName,
    );
    if (!abuseProtection.allowed) {
      const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
      const embed = createEmbed({
        title: 'Command Cooldown',
        description: `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    logger.info(`Executing prefix command: ${prefix}${commandName} (resolved to ${resolvedCommandName}) by ${message.author.tag}`);
    
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) {
      return false;
    }

    const content = message.content.trim();
    const validCount = isValidCountingMessage(content, config);
    const invalidAttempt = !validCount || message.author.id === config.lastUserId;

    if (invalidAttempt) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, {
        ...config,
        nextNumber: 1,
        lastUserId: null,
        currentStreak: 0,
      });

      const failureMessage = await message.channel.send(`❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`);
      setTimeout(() => {
        failureMessage.delete().catch(() => {});
      }, 10000);

      return true;
    }

    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error('Error handling counting game:', error);
    return false;
  }
}

async function handleLeveling(message, client) {
  try {
    const rateLimitKey = `xp-event:${message.guild.id}:${message.author.id}`;
    const canProcess = await checkRateLimit(rateLimitKey, MESSAGE_XP_RATE_LIMIT_ATTEMPTS, MESSAGE_XP_RATE_LIMIT_WINDOW_MS);
    if (!canProcess) {
      return;
    }

    const levelingConfig = await getLevelingConfig(client, message.guild.id);
    
    if (!levelingConfig?.enabled) {
      return;
    }

    if (levelingConfig.ignoredChannels?.includes(message.channel.id)) {
      return;
    }

    if (levelingConfig.ignoredRoles?.length > 0) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => {
        return null;
      });
      if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) {
        return;
      }
    }

    if (levelingConfig.blacklistedUsers?.includes(message.author.id)) {
      return;
    }

    if (!message.content || message.content.trim().length === 0) {
      return;
    }

    const userData = await getUserLevelData(client, message.guild.id, message.author.id);

    const cooldownTime = levelingConfig.xpCooldown || 60;
    const now = Date.now();
    const timeSinceLastMessage = now - (userData.lastMessage || 0);

    if (timeSinceLastMessage < cooldownTime * 1000) {
      return;
    }

    const minXP = levelingConfig.xpRange?.min || levelingConfig.xpPerMessage?.min || 15;
    const maxXP = levelingConfig.xpRange?.max || levelingConfig.xpPerMessage?.max || 25;

    const safeMinXP = Math.max(1, minXP);
    const safeMaxXP = Math.max(safeMinXP, maxXP);

    const xpToGive = Math.floor(Math.random() * (safeMaxXP - safeMinXP + 1)) + safeMinXP;

    let finalXP = xpToGive;
    if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) {
      finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
    }

    const result = await addXp(client, message.guild, message.member, finalXP);
    
    if (result.success && result.leveledUp) {
      logger.info(
        `${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`
      );
    }
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}