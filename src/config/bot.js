import { logger } from '../utils/logger.js';

/**
 * ============================================================
 * AGX / TITAN BOT CONFIGURATION
 * ============================================================
 *
 * Single source of truth for bot settings.
 *
 * Environment variables are intentionally read here so the
 * rest of the bot can simply import BotConfig / botConfig.
 */

// ============================================================
// HELPERS
// ============================================================

function envList(value) {
  if (!value || typeof value !== 'string') return [];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidHexColor(value) {
  return (
    typeof value === 'string' &&
    /^#[0-9A-Fa-f]{6}$/.test(value)
  );
}

function normalizeColor(value, fallback = '#99AAB5') {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (isValidHexColor(value)) {
    return Number.parseInt(value.slice(1), 16);
  }

  if (typeof value === 'string') {
    const normalized = value.startsWith('#')
      ? value.slice(1)
      : value;

    if (/^[0-9A-Fa-f]{6}$/.test(normalized)) {
      return Number.parseInt(normalized, 16);
    }
  }

  if (isValidHexColor(fallback)) {
    return Number.parseInt(fallback.slice(1), 16);
  }

  return 0x99AAB5;
}

function getNestedValue(object, path) {
  if (!object || typeof path !== 'string' || !path.trim()) {
    return undefined;
  }

  return path
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((current, key) => {
      if (
        current &&
        typeof current === 'object' &&
        Object.prototype.hasOwnProperty.call(current, key)
      ) {
        return current[key];
      }

      return undefined;
    }, object);
}

// ============================================================
// BOT CONFIG
// ============================================================

export const botConfig = {
  // ==========================================================
  // BOT PRESENCE
  // ==========================================================

  presence: {
    status: 'online',

    activities: [
      {
        name: 'TSB, Dont quit the raid untill the last blood is DROPPED.',
        type: 0,
      },
      {
        name: 'AGX growing stronger and bigger',
        type: 1,
      },
      {
        name: 'AGX Raiding music',
        type: 2,
      },
      {
        name: 'AGX Wiping clans',
        type: 3,
      },
      {
        name: ':3',
        type: 4,
      },
      {
        name: 'The road to top 1 raid clan',
        type: 5,
      },
    ],
  },

  // ==========================================================
  // COMMAND BEHAVIOR
  // ==========================================================

  commands: {
    owners: envList(process.env.OWNER_IDS),

    defaultCooldown: 3,

    deleteCommands: false,

    testGuildId: process.env.TEST_GUILD_ID?.trim() || null,

    prefix: process.env.PREFIX?.trim() || '!',
  },

  // ==========================================================
  // APPLICATIONS SYSTEM
  // ==========================================================

  applications: {
    defaultQuestions: [
      {
        question: 'What is your name?',
        required: true,
      },
      {
        question: 'How old are you?',
        required: true,
      },
      {
        question: 'Why do you want to join?',
        required: true,
      },
    ],

    statusColors: {
      pending: '#FFA500',
      approved: '#00FF00',
      denied: '#FF0000',
    },

    applicationCooldown: 24,

    deleteDeniedAfter: 7,

    deleteApprovedAfter: 30,

    managerRoles: [],
  },

  // ==========================================================
  // EMBED COLORS & BRANDING
  // ==========================================================

  embeds: {
    colors: {
      // Main AGX branding.
      primary: '#b6b6b6',
      secondary: '#FFFFFF',

      // Standard status colors.
      success: '#FFFFFF',
      error: '#8B0000',
      warning: '#b6b6b6',
      info: '#FFFFFF',

      // Neutral colors.
      light: '#FFFFFF',
      dark: '#b6b6b6',
      gray: '#b6b6b6',

      // Discord-style shortcuts.
      blurple: '#FFFFFF',
      green: '#FFFFFF',
      yellow: '#b6b6b6',
      fuchsia: '#FFFFFF',
      red: '#8B0000',
      black: '#000000',

      // Giveaway colors.
      giveaway: {
        active: '#FFFFFF',
        ended: '#b6b6b6',
      },

      // Ticket colors.
      ticket: {
        open: '#FFFFFF',
        claimed: '#b6b6b6',
        closed: '#8B0000',
        pending: '#b6b6b6',
      },

      // Feature colors.
      economy: '#FFFFFF',
      birthday: '#FFFFFF',
      moderation: '#b6b6b6',

      // Ticket priority colors.
      priority: {
        none: '#b6b6b6',
        low: '#FFFFFF',
        medium: '#FFFFFF',
        high: '#b6b6b6',
        urgent: '#8B0000',
      },
    },

    footer: {
      text: 'AGX • Titan Bot',

      icon:
        'https://cdn.discordapp.com/attachments/1256037768363249684/1549211140280557598/b51bbe9d-4a32-4c0a-bf6a-53ba29e59e95.png?ex=6aa9dece&is=6aa88d4e&hm=0e03c89fc6a0d6158ab71dcf89e671f5fbcfa93[...]
    },

    thumbnail:
      'https://cdn.discordapp.com/attachments/1256037768363249684/1549211140280557598/b51bbe9d-4a32-4c0a-bf6a-53ba29e59e95.png?ex=6aa9dece&is=6aa88d4e&hm=0e03c89fc6a0d6158ab71dcf89e671f5fbcfa934c[...]

    author: {
      name: 'AGX',

      icon:
        'https://cdn.discordapp.com/attachments/1256037768363249684/1549211140280557598/b51bbe9d-4a32-4c0a-bf6a-53ba29e59e95.png?ex=6aa9dece&is=6aa88d4e&hm=0e03c89fc6a0d6158ab71dcf89e671f5fbcfa93[...]

      url: 'https://www.tiktok.com/@agent_clan_x',
    },
  },

  // ==========================================================
  // ECONOMY SYSTEM
  // ==========================================================

  economy: {
    currency: {
      name: 'AGX Credit',
      namePlural: 'AGX Credits',
      symbol: '$',
    },

    startingBalance: 1000,

    baseBankCapacity: 100_000_000,

    dailyAmount: 2500,

    workMin: 1000,
    workMax: 5000,

    begMin: 1,
    begMax: 50,

    robSuccessRate: 0.4,

    robFailJailTime: 3_600_000,
  },

  // ==========================================================
  // SHOP SYSTEM
  // ==========================================================

  shop: {},

  // ==========================================================
  // TICKET SYSTEM
  // ==========================================================

  tickets: {
    defaultCategory: null,

    supportRoles: [],

    priorities: {
      none: {
        emoji: '⚫',
        color: '#808080',
        label: 'None',
      },

      low: {
        emoji: '⚪',
        color: '#FFFFFF',
        label: 'Low',
      },

      medium: {
        emoji: '⚪',
        color: '#FFFFFF',
        label: 'Medium',
      },

      high: {
        emoji: '⚪',
        color: '#808080',
        label: 'High',
      },

      urgent: {
        emoji: '⚠️',
        color: '#8B0000',
        label: 'Urgent',
      },
    },

    defaultPriority: 'none',

    archiveCategory: null,

    logChannel: null,
  },

  // ==========================================================
  // GIVEAWAY SYSTEM
  // ==========================================================

  giveaways: {
    defaultDuration: 86_400_000,

    minimumWinners: 1,
    maximumWinners: 10,

    minimumDuration: 300_000,
    maximumDuration: 2_592_000_000,

    allowedRoles: [],

    bypassRoles: [],
  },

  // ==========================================================
  // BIRTHDAY SYSTEM
  // ==========================================================

  birthday: {
    defaultRole: null,

    announcementChannel: null,

    timezone: 'Europe/Bucharest',
  },

  // ==========================================================
  // VERIFICATION SYSTEM
  // ==========================================================

  verification: {
    defaultMessage:
      'Click the button below to verify yourself and gain access to the server!',

    defaultButtonText: 'Verify',

    autoVerify: {
      defaultCriteria: 'none',

      defaultAccountAgeDays: 7,

      serverSizeThreshold: 1000,

      minAccountAge: 1,
      maxAccountAge: 365,

      sendDMNotification: true,

      criteria: {
        account_age:
          'Account must be older than specified days',

        server_size:
          'All users if server has less than 1000 members',

        none:
          'All users immediately',
      },
    },

    verificationCooldown: 5_000,

    maxVerificationAttempts: 3,

    attemptWindow: 60_000,

    maxCooldownEntries: 10_000,

    maxAttemptEntries: 10_000,

    cooldownCleanupInterval: 300_000,

    maxAuditMetadataBytes: 4_096,

    maxInMemoryAuditEntries: 1_000,

    logAllVerifications: true,

    keepAuditTrail: true,
  },

  // ==========================================================
  // WELCOME / GOODBYE
  // ==========================================================

  welcome: {
    defaultWelcomeMessage:
      'Welcome {user} to {server}! We now have {memberCount} members!',

    defaultGoodbyeMessage:
      '{user} has left the server. We now have {memberCount} members.',

    defaultWelcomeChannel: null,

    defaultGoodbyeChannel: null,
  },

  // ==========================================================
  // COUNTER CHANNELS
  // ==========================================================

  counters: {
    defaults: {
      name: '{name} Counter',

      description: 'Server {name} counter',

      type: 'voice',

      channelName: '{name}-{count}',
    },

    permissions: {
      deny: ['VIEW_CHANNEL'],

      allow: [
        'VIEW_CHANNEL',
        'CONNECT',
        'SPEAK',
      ],
    },

    messages: {
      created: '✅ Created counter **{name}**',

      deleted: '🗑️ Deleted counter **{name}**',

      updated: '🔄 Updated counter **{name}**',
    },

    types: {
      members: {
        name: '👥 Members',

        description:
          'Total members in the server',

        getCount: (guild) =>
          guild?.memberCount?.toString() ?? '0',
      },

      bots: {
        name: '🤖 Bots',

        description:
          'Total bot accounts in the server',

        getCount: (guild) =>
          guild?.members?.cache
            ?.filter((member) => member.user.bot)
            ?.size?.toString() ?? '0',
      },

      members_only: {
        name: '👤 Humans',

        description:
          'Total human members (non-bots)',

        getCount: (guild) =>
          guild?.members?.cache
            ?.filter((member) => !member.user.bot)
            ?.size?.toString() ?? '0',
      },
    },
  },

  // ==========================================================
  // GENERIC BOT MESSAGES
  // ==========================================================

  messages: {
    noPermission:
      'You do not have permission to use this command.',

    cooldownActive:
      'Please wait {time} before using this command again.',

    errorOccurred:
      'An error occurred while executing this command.',

    missingPermissions:
      'I am missing required permissions to perform this action.',

    commandDisabled:
      'This command has been disabled.',

    maintenanceMode:
      'The bot is currently in maintenance mode.',
  },

  // ==========================================================
  // FEATURE TOGGLES
  // ==========================================================

  features: {
    // Core systems.
    economy: true,
    leveling: true,
    moderation: true,
    logging: true,
    welcome: true,

    // Community systems.
    tickets: true,
    giveaways: true,
    birthday: true,
    counter: true,

    // Security / self-service.
    verification: true,
    reactionRoles: true,
    joinToCreate: true,

    // Utility.
    voice: true,
    search: true,
    tools: true,
    utility: true,
    community: true,
    fun: true,
  },
};

// ============================================================
// CONFIG VALIDATION
// ============================================================

export function validateConfig(config = botConfig) {
  const errors = [];

  // ----------------------------------------------------------
  // Environment
  // ----------------------------------------------------------

  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Environment variables check:');
    logger.debug(
      'DISCORD_TOKEN exists:',
      Boolean(process.env.DISCORD_TOKEN),
    );
    logger.debug(
      'TOKEN exists:',
      Boolean(process.env.TOKEN),
    );
    logger.debug(
      'CLIENT_ID exists:',
      Boolean(process.env.CLIENT_ID),
    );
    logger.debug(
      'GUILD_ID exists:',
      Boolean(process.env.GUILD_ID),
    );
    logger.debug(
      'POSTGRES_HOST exists:',
      Boolean(process.env.POSTGRES_HOST),
    );
    logger.debug(
      'NODE_ENV:',
      process.env.NODE_ENV || 'development',
    );
  }

  // ----------------------------------------------------------
  // Required Discord credentials
  // ----------------------------------------------------------

  if (
    !process.env.DISCORD_TOKEN &&
    !process.env.TOKEN
  ) {
    errors.push(
      'Bot token is required (DISCORD_TOKEN or TOKEN environment variable).',
    );
  }

  if (!process.env.CLIENT_ID) {
    errors.push(
      'Client ID is required (CLIENT_ID environment variable).',
    );
  }

  // ----------------------------------------------------------
  // Production database requirements
  // ----------------------------------------------------------

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.POSTGRES_HOST) {
      errors.push(
        'PostgreSQL host is required in production (POSTGRES_HOST environment variable).',
      );
    }

    if (!process.env.POSTGRES_USER) {
      errors.push(
        'PostgreSQL user is required in production (POSTGRES_USER environment variable).',
      );
    }

    if (!process.env.POSTGRES_PASSWORD) {
      errors.push(
        'PostgreSQL password is required in production (POSTGRES_PASSWORD environment variable).',
      );
    }
  }

  // ----------------------------------------------------------
  // General configuration checks
  // ----------------------------------------------------------

  if (!config || typeof config !== 'object') {
    errors.push('Bot configuration object is invalid.');

    return errors;
  }

  // ----------------------------------------------------------
  // Presence
  // ----------------------------------------------------------

  const validStatuses = [
    'online',
    'idle',
    'dnd',
    'invisible',
  ];

  if (!validStatuses.includes(config.presence?.status)) {
    errors.push(
      `Invalid presence status: ${config.presence?.status}`,
    );
  }

  if (!Array.isArray(config.presence?.activities)) {
    errors.push(
      'presence.activities must be an array.',
    );
  } else {
    for (const [index, activity] of config.presence.activities.entries()) {
      if (!activity || typeof activity !== 'object') {
        errors.push(
          `presence.activities[${index}] must be an object.`,
        );
        continue;
      }

      if (
        typeof activity.name !== 'string' ||
        activity.name.trim().length === 0
      ) {
        errors.push(
          `presence.activities[${index}].name must be a non-empty string.`,
        );
      }

      if (
        !Number.isInteger(activity.type) ||
        activity.type < 0 ||
        activity.type > 5
      ) {
        errors.push(
          `presence.activities[${index}].type must be an integer from 0 to 5.`,
        );
      }
    }
  }

  // ----------------------------------------------------------
  // Commands
  // ----------------------------------------------------------

  if (
    typeof config.commands?.defaultCooldown !== 'number' ||
    config.commands.defaultCooldown < 0
  ) {
    errors.push(
      'commands.defaultCooldown must be a number >= 0.',
    );
  }

  if (
    typeof config.commands?.prefix !== 'string' ||
    config.commands.prefix.length === 0
  ) {
    errors.push(
      'commands.prefix must be a non-empty string.',
    );
  }

  // ----------------------------------------------------------
  // Economy
  // ----------------------------------------------------------

  if (
    config.economy.workMin >
    config.economy.workMax
  ) {
    errors.push(
      'economy.workMin cannot be greater than economy.workMax.',
    );
  }

  if (
    config.economy.begMin >
    config.economy.begMax
  ) {
    errors.push(
      'economy.begMin cannot be greater than economy.begMax.',
    );
  }

  if (
    typeof config.economy.robSuccessRate !== 'number' ||
    config.economy.robSuccessRate < 0 ||
    config.economy.robSuccessRate > 1
  ) {
    errors.push(
      'economy.robSuccessRate must be between 0 and 1.',
    );
  }

  // ----------------------------------------------------------
  // Giveaway limits
  // ----------------------------------------------------------

  if (
    config.giveaways.minimumWinners >
    config.giveaways.maximumWinners
  ) {
    errors.push(
      'giveaways.minimumWinners cannot be greater than maximumWinners.',
    );
  }

  if (
    config.giveaways.minimumDuration >
    config.giveaways.maximumDuration
  ) {
    errors.push(
      'giveaways.minimumDuration cannot be greater than maximumDuration.',
    );
  }

  if (
    config.giveaways.defaultDuration <
      config.giveaways.minimumDuration ||
    config.giveaways.defaultDuration >
      config.giveaways.maximumDuration
  ) {
    errors.push(
      'giveaways.defaultDuration must be between minimumDuration and maximumDuration.',
    );
  }

  // ----------------------------------------------------------
  // Verification
  // ----------------------------------------------------------

  const verification = config.verification;
  const autoVerify = verification?.autoVerify;

  const validCriteria = [
    'none',
    'account_age',
    'server_size',
  ];

  if (!validCriteria.includes(autoVerify?.defaultCriteria)) {
    errors.push(
      `verification.autoVerify.defaultCriteria must be one of: ${validCriteria.join(', ')}.`,
    );
  }

  if (
    typeof autoVerify?.defaultAccountAgeDays !== 'number' ||
    autoVerify.defaultAccountAgeDays <
      autoVerify.minAccountAge ||
    autoVerify.defaultAccountAgeDays >
      autoVerify.maxAccountAge
  ) {
    errors.push(
      'verification.autoVerify.defaultAccountAgeDays is outside the allowed range.',
    );
  }

  if (
    typeof autoVerify?.serverSizeThreshold !== 'number' ||
    autoVerify.serverSizeThreshold < 0
  ) {
    errors.push(
      'verification.autoVerify.serverSizeThreshold must be a number >= 0.',
    );
  }

  if (
    typeof verification?.verificationCooldown !== 'number' ||
    verification.verificationCooldown < 0
  ) {
    errors.push(
      'verification.verificationCooldown must be a number >= 0.',
    );
  }

  if (
    typeof verification?.maxVerificationAttempts !== 'number' ||
    verification.maxVerificationAttempts < 1
  ) {
    errors.push(
      'verification.maxVerificationAttempts must be at least 1.',
    );
  }

  if (
    typeof verification?.attemptWindow !== 'number' ||
    verification.attemptWindow < 1
  ) {
    errors.push(
      'verification.attemptWindow must be greater than 0.',
    );
  }

  // ----------------------------------------------------------
  // Ticket priorities
  // ----------------------------------------------------------

  if (
    !config.tickets?.priorities ||
    typeof config.tickets.priorities !== 'object'
  ) {
    errors.push(
      'tickets.priorities must be an object.',
    );
  } else if (
    !Object.prototype.hasOwnProperty.call(
      config.tickets.priorities,
      config.tickets.defaultPriority,
    )
  ) {
    errors.push(
      `tickets.defaultPriority "${config.tickets.defaultPriority}" does not exist in tickets.priorities.`,
    );
  }

  // ----------------------------------------------------------
  // Feature flags
  // ----------------------------------------------------------

  if (
    !config.features ||
    typeof config.features !== 'object'
  ) {
    errors.push(
      'features must be an object.',
    );
  } else {
    for (const [feature, enabled] of Object.entries(
      config.features,
    )) {
      if (typeof enabled !== 'boolean') {
        errors.push(
          `features.${feature} must be true or false.`,
        );
      }
    }
  }

  // ----------------------------------------------------------
  // Embed colors
  // ----------------------------------------------------------

  const colors = config.embeds?.colors;

  if (!colors || typeof colors !== 'object') {
    errors.push(
      'embeds.colors must be an object.',
    );
  } else {
    const checkColors = (object, path = 'embeds.colors') => {
      for (const [key, value] of Object.entries(object)) {
        const currentPath = `${path}.${key}`;

        if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          checkColors(value, currentPath);
          continue;
        }

        if (!isValidHexColor(value)) {
          errors.push(
            `${currentPath} must be a valid #RRGGBB color.`,
          );
        }
      }
    };

    checkColors(colors);
  }

  return errors;
}

// ============================================================
// STARTUP VALIDATION
// ============================================================

const configErrors = validateConfig(botConfig);

if (configErrors.length > 0) {
  logger.error(
    'Bot configuration errors:',
    configErrors.join('\n'),
  );

  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// ============================================================
// COLOR API
// ============================================================

/**
 * Get an embed color.
 *
 * Supported:
 *   getColor('primary')
 *   getColor('error')
 *   getColor('ticket.closed')
 *   getColor('priority.urgent')
 *   getColor('#FF0000')
 *   getColor(0xFF0000)
 *
 * Always returns a Discord-compatible integer color.
 */
export function getColor(
  path,
  fallback = '#99AAB5',
) {
  // Direct integer.
  if (
    typeof path === 'number' &&
    Number.isInteger(path)
  ) {
    return path;
  }

  // Direct hex string.
  if (typeof path === 'string') {
    if (isValidHexColor(path)) {
      return normalizeColor(path, fallback);
    }

    // Allow "FF0000" without "#".
    if (/^[0-9A-Fa-f]{6}$/.test(path)) {
      return Number.parseInt(path, 16);
    }
  }

  // Named/nested config path.
  const result = getNestedValue(
    botConfig.embeds.colors,
    path,
  );

  return normalizeColor(result, fallback);
}

/**
 * Get a random configured color.
 *
 * Only actual color strings are considered.
 * Nested objects such as `ticket` and `priority`
 * are automatically traversed.
 */
export function getRandomColor() {
  const colors = [];

  const collectColors = (value) => {
    if (typeof value === 'string') {
      if (isValidHexColor(value)) {
        colors.push(value);
      }

      return;
    }

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      for (const nestedValue of Object.values(value)) {
        collectColors(nestedValue);
      }
    }
  };

  collectColors(botConfig.embeds.colors);

  if (colors.length === 0) {
    return '#99AAB5';
  }

  return colors[
    Math.floor(Math.random() * colors.length)
  ];
}

// ============================================================
// PUBLIC ALIASES
// ============================================================

export const BotConfig = botConfig;

export default botConfig;
