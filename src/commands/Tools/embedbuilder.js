import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    ChannelType,
    EmbedBuilder,
} from 'discord.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import {
    TitanBotError,
    replyUserError,
    ErrorTypes,
} from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';

const MAX_FIELDS = 25;
const MAX_EMBED_LENGTH = 6000;

const IDLE_TIMEOUT = 15 * 60 * 1000;
const SUBMENU_TIMEOUT = 60 * 1000;
const MODAL_TIMEOUT = 120 * 1000;

const activeSessions = new Map();

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

function createSessionKey(interaction) {
    return `${interaction.guildId ?? 'dm'}:${interaction.channelId}:${interaction.user.id}`;
}

function makeId(session, action) {
    return `eb:${session.id}:${action}`;
}

function truncate(value, max) {
    if (value === undefined || value === null) {
        return '';
    }

    const string = String(value);

    if (string.length <= max) {
        return string;
    }

    return `${string.slice(0, max - 3)}...`;
}

function isValidUrl(value) {
    if (!value?.trim()) {
        return true;
    }

    try {
        const url = new URL(value.trim());

        return (
            url.protocol === 'http:' ||
            url.protocol === 'https:'
        );
    } catch {
        return false;
    }
}

function isValidHex(value) {
    return /^#[0-9A-Fa-f]{6}$/.test(String(value ?? '').trim());
}

function normalizeHex(value) {
    if (typeof value === 'number') {
        return `#${value.toString(16).padStart(6, '0')}`.toUpperCase();
    }

    if (!value) {
        return null;
    }

    const normalized = String(value).trim();

    if (!isValidHex(normalized)) {
        return null;
    }

    return normalized.toUpperCase();
}

function getDefaultColor() {
    try {
        const color = getColor();

        const normalized = normalizeHex(color);

        if (normalized) {
            return normalized;
        }
    } catch {
        // Use fallback below.
    }

    return '#080808';
}

function createEmptyState() {
    return {
        title: '',
        description: '',
        color: getDefaultColor(),

        author: {
            name: '',
            iconURL: '',
            url: '',
        },

        footer: {
            text: '',
            iconURL: '',
        },

        thumbnail: '',
        image: '',
        timestamp: false,

        fields: [],
    };
}

function cloneState(state) {
    return {
        title: state.title ?? '',
        description: state.description ?? '',
        color: state.color ?? getDefaultColor(),

        author: {
            name: state.author?.name ?? '',
            iconURL: state.author?.iconURL ?? '',
            url: state.author?.url ?? '',
        },

        footer: {
            text: state.footer?.text ?? '',
            iconURL: state.footer?.iconURL ?? '',
        },

        thumbnail: state.thumbnail ?? '',
        image: state.image ?? '',
        timestamp: Boolean(state.timestamp),

        fields: Array.isArray(state.fields)
            ? state.fields.map(field => ({
                  name: field.name ?? '',
                  value: field.value ?? '',
                  inline: Boolean(field.inline),
              }))
            : [],
    };
}

function isEmptyEmbed(state) {
    return !(
        state.title?.trim() ||
        state.description?.trim() ||
        state.author?.name?.trim() ||
        state.footer?.text?.trim() ||
        state.thumbnail?.trim() ||
        state.image?.trim() ||
        state.timestamp ||
        state.fields?.some(
            field =>
                field.name?.trim() &&
                field.value?.trim(),
        )
    );
}

function calculateEmbedLength(state) {
    let total = 0;

    total += state.title?.length ?? 0;
    total += state.description?.length ?? 0;

    total += state.author?.name?.length ?? 0;
    total += state.footer?.text?.length ?? 0;

    for (const field of state.fields ?? []) {
        total += field.name?.length ?? 0;
        total += field.value?.length ?? 0;
    }

    return total;
}

function getStateSummary(state) {
    return {
        fields: state.fields.length,
        characters: calculateEmbedLength(state),
        timestamp: Boolean(state.timestamp),
        author: Boolean(state.author?.name),
        footer: Boolean(state.footer?.text),
        thumbnail: Boolean(state.thumbnail),
        image: Boolean(state.image),
    };
}

/* -------------------------------------------------------------------------- */
/*                              EMBED BUILDERS                                */
/* -------------------------------------------------------------------------- */

function buildEmbed(state, { placeholder = false } = {}) {
    const embed = new EmbedBuilder();

    const title = state.title?.trim();
    const description = state.description?.trim();
    const color = normalizeHex(state.color);

    if (title) {
        embed.setTitle(truncate(title, 256));
    }

    if (description) {
        embed.setDescription(truncate(description, 4096));
    }

    if (color) {
        embed.setColor(color);
    }

    if (state.author?.name?.trim()) {
        const author = {
            name: truncate(state.author.name.trim(), 256),
        };

        if (
            state.author.url?.trim() &&
            isValidUrl(state.author.url)
        ) {
            author.url = state.author.url.trim();
        }

        if (
            state.author.iconURL?.trim() &&
            isValidUrl(state.author.iconURL)
        ) {
            author.iconURL = state.author.iconURL.trim();
        }

        embed.setAuthor(author);
    }

    if (state.footer?.text?.trim()) {
        const footer = {
            text: truncate(state.footer.text.trim(), 2048),
        };

        if (
            state.footer.iconURL?.trim() &&
            isValidUrl(state.footer.iconURL)
        ) {
            footer.iconURL = state.footer.iconURL.trim();
        }

        embed.setFooter(footer);
    }

    if (
        state.thumbnail?.trim() &&
        isValidUrl(state.thumbnail)
    ) {
        embed.setThumbnail(state.thumbnail.trim());
    }

    if (
        state.image?.trim() &&
        isValidUrl(state.image)
    ) {
        embed.setImage(state.image.trim());
    }

    if (state.timestamp) {
        embed.setTimestamp();
    }

    for (const field of state.fields.slice(0, MAX_FIELDS)) {
        if (
            !field.name?.trim() ||
            !field.value?.trim()
        ) {
            continue;
        }

        embed.addFields({
            name: truncate(field.name.trim(), 256),
            value: truncate(field.value.trim(), 1024),
            inline: Boolean(field.inline),
        });
    }

    if (placeholder && isEmptyEmbed(state)) {
        embed.setDescription(
            'Use the menu below to start building your embed.',
        );
    }

    return embed;
}

function buildDashboardEmbed(state) {
    const embed = new EmbedBuilder();

    const summary = getStateSummary(state);
    const color = normalizeHex(state.color) ?? '#080808';

    embed.setTitle('Embed Builder');

    const lines = [
        `**Fields:** ${summary.fields}/${MAX_FIELDS}`,
        `**Characters:** ${summary.characters}/${MAX_EMBED_LENGTH}`,
        `**Color:** ${color}`,
        `**Timestamp:** ${summary.timestamp ? 'Enabled' : 'Disabled'}`,
    ];

    if (summary.author) {
        lines.push(
            `**Author:** ${truncate(state.author.name, 100)}`,
        );
    }

    if (summary.footer) {
        lines.push(
            `**Footer:** ${truncate(state.footer.text, 100)}`,
        );
    }

    lines.push(
        `**Thumbnail:** ${summary.thumbnail ? 'Set' : 'Not set'}`,
        `**Main Image:** ${summary.image ? 'Set' : 'Not set'}`,
    );

    embed.setDescription(lines.join('\n'));
    embed.setColor(color);

    embed.setFooter({
        text: 'AGX • Titan Bot • Embed Builder',
    });

    return embed;
}

/* -------------------------------------------------------------------------- */
/*                              MAIN MENU                                     */
/* -------------------------------------------------------------------------- */

function buildMainMenu(state, session) {
    const options = [
        new StringSelectMenuOptionBuilder()
            .setLabel('Edit Content')
            .setDescription('Set the title and description')
            .setValue('edit_content')
            .setEmoji('📝'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Set Color')
            .setDescription('Choose a preset or custom hex')
            .setValue('set_color')
            .setEmoji('🎨'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Set Author')
            .setDescription('Configure the embed author')
            .setValue('set_author')
            .setEmoji('👤'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Set Footer')
            .setDescription('Configure the embed footer')
            .setValue('set_footer')
            .setEmoji('🔻'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Set Images')
            .setDescription('Set or remove images')
            .setValue('set_images')
            .setEmoji('🖼️'),

        new StringSelectMenuOptionBuilder()
            .setLabel(`Add Field • ${state.fields.length}/${MAX_FIELDS}`)
            .setDescription(
                state.fields.length >= MAX_FIELDS
                    ? 'Maximum fields reached'
                    : 'Add a field',
            )
            .setValue('add_field')
            .setEmoji('➕'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Edit / Remove Fields')
            .setDescription(
                state.fields.length
                    ? 'Edit or remove a field'
                    : 'No fields available',
            )
            .setValue('manage_fields')
            .setEmoji('📋'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Reorder Fields')
            .setDescription(
                state.fields.length >= 2
                    ? 'Move fields up or down'
                    : 'Requires at least two fields',
            )
            .setValue('reorder_fields')
            .setEmoji('↕️'),

        new StringSelectMenuOptionBuilder()
            .setLabel(
                state.timestamp
                    ? 'Disable Timestamp'
                    : 'Enable Timestamp',
            )
            .setDescription(
                state.timestamp
                    ? 'Remove the timestamp'
                    : 'Add the current timestamp',
            )
            .setValue('toggle_timestamp')
            .setEmoji('🕒'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Post Embed')
            .setDescription('Choose a channel and post')
            .setValue('post_embed')
            .setEmoji('📤'),

        new StringSelectMenuOptionBuilder()
            .setLabel('JSON / Raw Data')
            .setDescription('View or export JSON')
            .setValue('json')
            .setEmoji('📦'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Reset Everything')
            .setDescription('Clear the entire embed')
            .setValue('reset')
            .setEmoji('♻️'),
    ];

    return new StringSelectMenuBuilder()
        .setCustomId(makeId(session, 'main'))
        .setPlaceholder('Choose an embed builder option...')
        .addOptions(options);
}

/* -------------------------------------------------------------------------- */
/*                              SESSION                                       */
/* -------------------------------------------------------------------------- */

function registerCollector(session, collector) {
    session.collectors.add(collector);

    collector.once('end', () => {
        session.collectors.delete(collector);
    });

    return collector;
}

function stopSession(session) {
    if (!session || !session.active) {
        return;
    }

    session.active = false;

    if (session.timeout) {
        clearTimeout(session.timeout);
        session.timeout = null;
    }

    for (const collector of session.collectors) {
        try {
            collector.stop('session_stopped');
        } catch {
            // Ignore cleanup errors.
        }
    }

    session.collectors.clear();

    if (activeSessions.get(session.key) === session) {
        activeSessions.delete(session.key);
    }
}

function createSession(interaction) {
    const key = createSessionKey(interaction);

    const session = {
        id: `${Date.now().toString(36)}${Math.random()
            .toString(36)
            .slice(2, 8)}`,

        key,

        interaction,

        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,

        active: true,
        busy: false,

        collectors: new Set(),
        timeout: null,

        state: createEmptyState(),
    };

    activeSessions.set(key, session);

    touchSession(session);

    return session;
}

function touchSession(session) {
    if (!session.active) {
        return;
    }

    if (session.timeout) {
        clearTimeout(session.timeout);
    }

    session.timeout = setTimeout(() => {
        stopSession(session);
    }, IDLE_TIMEOUT);
}

/* -------------------------------------------------------------------------- */
/*                              DASHBOARD                                     */
/* -------------------------------------------------------------------------- */

async function refreshDashboard(session) {
    if (!session.active) {
        return false;
    }

    touchSession(session);

    return InteractionHelper.safeEditReply(
        session.interaction,
        {
            embeds: [
                buildEmbed(session.state, {
                    placeholder: true,
                }),
                buildDashboardEmbed(session.state),
            ],

            components: [
                new ActionRowBuilder().addComponents(
                    buildMainMenu(
                        session.state,
                        session,
                    ),
                ),
            ],
        },
    );
}

/* -------------------------------------------------------------------------- */
/*                              MODALS                                        */
/* -------------------------------------------------------------------------- */

/*
 * IMPORTANT:
 * The interaction passed here MUST be the component interaction
 * that opened the modal.
 *
 * Never use the original slash-command interaction here.
 */

async function showModalAndWait(
    componentInteraction,
    session,
    modal,
) {
    if (!session.active) {
        return null;
    }

    try {
        const shown =
            await InteractionHelper.safeShowModal(
                componentInteraction,
                modal,
            );

        if (!shown) {
            return null;
        }
    } catch (error) {
        logger.error(
            'Failed to show Embed Builder modal:',
            error,
        );

        return null;
    }

    try {
        return await componentInteraction.awaitModalSubmit({
            time: MODAL_TIMEOUT,

            filter: submitted =>
                submitted.user.id === session.userId &&
                submitted.customId.startsWith(
                    `eb:${session.id}:`,
                ),
        });
    } catch {
        return null;
    }
}

/* -------------------------------------------------------------------------- */
/*                           EDIT CONTENT                                     */
/* -------------------------------------------------------------------------- */

async function handleEditContent(
    session,
    componentInteraction,
) {
    const modal = new ModalBuilder()
        .setCustomId(
            makeId(session, 'modal_content'),
        )
        .setTitle('Edit Embed Content');

    const title = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Title')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(256)
        .setPlaceholder('Optional embed title');

    const description = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(4000)
        .setPlaceholder('Optional embed description');

    if (session.state.title) {
        title.setValue(session.state.title);
    }

    if (session.state.description) {
        description.setValue(session.state.description);
    }

    modal.addComponents(
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(description),
    );

    const submission = await showModalAndWait(
        componentInteraction,
        session,
        modal,
    );

    if (!submission) {
        return;
    }

    session.state.title =
        submission.fields
            .getTextInputValue('title')
            .trim();

    session.state.description =
        submission.fields
            .getTextInputValue('description')
            .trim();

    await submission.reply({
        content: '✅ Content updated.',
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(session);
}

/* -------------------------------------------------------------------------- */
/*                              COLOR                                         */
/* -------------------------------------------------------------------------- */

const COLOR_PRESETS = [
    {
        id: 'primary',
        label: 'Primary',
        value: '#080808',
        emoji: '⬛',
    },
    {
        id: 'white',
        label: 'White',
        value: '#FFFFFF',
        emoji: '⬜',
    },
    {
        id: 'black',
        label: 'Black',
        value: '#000000',
        emoji: '⚫',
    },
    {
        id: 'gray',
        label: 'Gray',
        value: '#808080',
        emoji: '🔘',
    },
    {
        id: 'success',
        label: 'Success',
        value: '#57F287',
        emoji: '🟢',
    },
    {
        id: 'error',
        label: 'Error',
        value: '#ED4245',
        emoji: '🔴',
    },
    {
        id: 'warning',
        label: 'Warning',
        value: '#FEE75C',
        emoji: '🟡',
    },
    {
        id: 'info',
        label: 'Info',
        value: '#5865F2',
        emoji: '🔵',
    },
    {
        id: 'blurple',
        label: 'Blurple',
        value: '#5865F2',
        emoji: '🟣',
    },
    {
        id: 'fuchsia',
        label: 'Fuchsia',
        value: '#EB459E',
        emoji: '🩷',
    },
    {
        id: 'gold',
        label: 'Gold',
        value: '#F1C40F',
        emoji: '🟨',
    },
];

async function handleSetColor(
    session,
    componentInteraction,
) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(
            makeId(session, 'color_menu'),
        )
        .setPlaceholder('Choose a color...')
        .addOptions(
            ...COLOR_PRESETS.map(preset =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(preset.label)
                    .setValue(preset.id)
                    .setEmoji(preset.emoji)
                    .setDescription(preset.value),
            ),

            new StringSelectMenuOptionBuilder()
                .setLabel('Custom Hex')
                .setValue('custom')
                .setEmoji('🔧')
                .setDescription(
                    'Enter your own #RRGGBB color',
                ),
        );

    const message =
        await session.interaction.followUp({
            content: '🎨 Choose the embed color:',
            components: [
                new ActionRowBuilder().addComponents(menu),
            ],
            flags: MessageFlags.Ephemeral,
        });

    const collector =
        message.createMessageComponentCollector({
            componentType:
                ComponentType.StringSelect,

            time: SUBMENU_TIMEOUT,

            max: 1,

            filter: interaction =>
                interaction.user.id === session.userId &&
                interaction.customId ===
                    makeId(session, 'color_menu'),
        });

    registerCollector(session, collector);

    collector.on(
        'collect',
        async interaction => {
            try {
                if (
                    interaction.values[0] ===
                    'custom'
                ) {
                    const modal =
                        new ModalBuilder()
                            .setCustomId(
                                makeId(
                                    session,
                                    'modal_color',
                                ),
                            )
                            .setTitle(
                                'Custom Embed Color',
                            );

                    const input =
                        new TextInputBuilder()
                            .setCustomId('hex')
                            .setLabel('Hex Color')
                            .setStyle(
                                TextInputStyle.Short,
                            )
                            .setRequired(true)
                            .setMinLength(7)
                            .setMaxLength(7)
                            .setPlaceholder(
                                '#FFFFFF',
                            )
                            .setValue(
                                normalizeHex(
                                    session.state.color,
                                ) ??
                                    '#080808',
                            );

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(
                            input,
                        ),
                    );

                    const submission =
                        await showModalAndWait(
                            interaction,
                            session,
                            modal,
                        );

                    if (!submission) {
                        return;
                    }

                    const value =
                        submission.fields
                            .getTextInputValue(
                                'hex',
                            )
                            .trim();

                    if (!isValidHex(value)) {
                        await submission.reply({
                            content:
                                '❌ Invalid color. Use `#RRGGBB`.',
                            flags:
                                MessageFlags.Ephemeral,
                        });

                        return;
                    }

                    session.state.color =
                        value.toUpperCase();

                    await submission.reply({
                        content:
                            '✅ Color updated.',
                        flags:
                            MessageFlags.Ephemeral,
                    });

                    await refreshDashboard(
                        session,
                    );

                    return;
                }

                const preset =
                    COLOR_PRESETS.find(
                        p =>
                            p.id ===
                            interaction.values[0],
                    );

                if (!preset) {
                    await interaction.update({
                        content:
                            '❌ Invalid color selection.',
                        components: [],
                    });

                    return;
                }

                session.state.color =
                    preset.value;

                await interaction.update({
                    content:
                        `✅ Color set to ${preset.value}.`,
                    components: [],
                });

                await refreshDashboard(
                    session,
                );
            } catch (error) {
                await safeError(
                    interaction,
                    error,
                );
            }
        },
    );
}

/* -------------------------------------------------------------------------- */
/*                              AUTHOR                                        */
/* -------------------------------------------------------------------------- */

async function handleSetAuthor(
    session,
    componentInteraction,
) {
    const modal = new ModalBuilder()
        .setCustomId(
            makeId(session, 'modal_author'),
        )
        .setTitle('Set Embed Author');

    const name = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Author Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(256)
        .setPlaceholder('Optional author name');

    const icon = new TextInputBuilder()
        .setCustomId('icon')
        .setLabel('Icon URL')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(2048)
        .setPlaceholder(
            'https://example.com/icon.png',
        );

    const url = new TextInputBuilder()
        .setCustomId('url')
        .setLabel('Author URL')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(2048)
        .setPlaceholder(
            'https://example.com',
        );

    if (session.state.author.name) {
        name.setValue(
            session.state.author.name,
        );
    }

    if (session.state.author.iconURL) {
        icon.setValue(
            session.state.author.iconURL,
        );
    }

    if (session.state.author.url) {
        url.setValue(
            session.state.author.url,
        );
    }

    modal.addComponents(
        new ActionRowBuilder().addComponents(name),
        new ActionRowBuilder().addComponents(icon),
        new ActionRowBuilder().addComponents(url),
    );

    const submission =
        await showModalAndWait(
            componentInteraction,
            session,
            modal,
        );

    if (!submission) {
        return;
    }

    const authorName =
        submission.fields
            .getTextInputValue('name')
            .trim();

    const iconURL =
        submission.fields
            .getTextInputValue('icon')
            .trim();

    const authorURL =
        submission.fields
            .getTextInputValue('url')
            .trim();

    if (
        iconURL &&
        !isValidUrl(iconURL)
    ) {
        await submission.reply({
            content:
                '❌ Icon URL must be a valid HTTP/HTTPS URL.',
            flags: MessageFlags.Ephemeral,
        });

        return;
    }

    if (
        authorURL &&
        !isValidUrl(authorURL)
    ) {
        await submission.reply({
            content:
                '❌ Author URL must be a valid HTTP/HTTPS URL.',
            flags: MessageFlags.Ephemeral,
        });

        return;
    }

    session.state.author = {
        name: authorName,
        iconURL,
        url: authorURL,
    };

    await submission.reply({
        content: '✅ Author updated.',
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(session);
}

/* -------------------------------------------------------------------------- */
/*                              FOOTER                                        */
/* -------------------------------------------------------------------------- */

async function handleSetFooter(
    session,
    componentInteraction,
) {
    const modal = new ModalBuilder()
        .setCustomId(
            makeId(session, 'modal_footer'),
        )
        .setTitle('Set Embed Footer');

    const text = new TextInputBuilder()
        .setCustomId('text')
        .setLabel('Footer Text')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(2048)
        .setPlaceholder('Optional footer text');

    const icon = new TextInputBuilder()
        .setCustomId('icon')
        .setLabel('Footer Icon URL')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(2048)
        .setPlaceholder(
            'https://example.com/icon.png',
        );

    if (session.state.footer.text) {
        text.setValue(
            session.state.footer.text,
        );
    }

    if (session.state.footer.iconURL) {
        icon.setValue(
            session.state.footer.iconURL,
        );
    }

    modal.addComponents(
        new ActionRowBuilder().addComponents(text),
        new ActionRowBuilder().addComponents(icon),
    );

    const submission =
        await showModalAndWait(
            componentInteraction,
            session,
            modal,
        );

    if (!submission) {
        return;
    }

    const footerText =
        submission.fields
            .getTextInputValue('text')
            .trim();

    const iconURL =
        submission.fields
            .getTextInputValue('icon')
            .trim();

    if (
        iconURL &&
        !isValidUrl(iconURL)
    ) {
        await submission.reply({
            content:
                '❌ Footer icon must be a valid HTTP/HTTPS URL.',
            flags: MessageFlags.Ephemeral,
        });

        return;
    }

    session.state.footer = {
        text: footerText,
        iconURL,
    };

    await submission.reply({
        content: '✅ Footer updated.',
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(session);
}

/* -------------------------------------------------------------------------- */
/*                              IMAGES                                        */
/* -------------------------------------------------------------------------- */

async function handleSetImages(session) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(
            makeId(session, 'images_menu'),
        )
        .setPlaceholder(
            'Choose an image option...',
        )
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Thumbnail')
                .setDescription(
                    'Set the small top-right image',
                )
                .setValue('set_thumbnail')
                .setEmoji('🔳'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Set Main Image')
                .setDescription(
                    'Set the large bottom image',
                )
                .setValue('set_image')
                .setEmoji('🖼️'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Thumbnail')
                .setDescription(
                    session.state.thumbnail
                        ? 'Remove current thumbnail'
                        : 'No thumbnail set',
                )
                .setValue(
                    'remove_thumbnail',
                )
                .setEmoji('❌'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Main Image')
                .setDescription(
                    session.state.image
                        ? 'Remove current image'
                        : 'No main image set',
                )
                .setValue('remove_image')
                .setEmoji('❌'),
        );

    const message =
        await session.interaction.followUp({
            content:
                '🖼️ Choose what you want to do:',
            components: [
                new ActionRowBuilder().addComponents(
                    menu,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

    const collector =
        message.createMessageComponentCollector({
            componentType:
                ComponentType.StringSelect,

            time: SUBMENU_TIMEOUT,

            max: 1,

            filter: interaction =>
                interaction.user.id ===
                    session.userId &&
                interaction.customId ===
                    makeId(
                        session,
                        'images_menu',
                    ),
        });

    registerCollector(session, collector);

    collector.on(
        'collect',
        async interaction => {
            try {
                const choice =
                    interaction.values[0];

                if (
                    choice ===
                    'remove_thumbnail'
                ) {
                    session.state.thumbnail = '';

                    await interaction.update({
                        content:
                            '✅ Thumbnail removed.',
                        components: [],
                    });

                    await refreshDashboard(
                        session,
                    );

                    return;
                }

                if (
                    choice ===
                    'remove_image'
                ) {
                    session.state.image = '';

                    await interaction.update({
                        content:
                            '✅ Main image removed.',
                        components: [],
                    });

                    await refreshDashboard(
                        session,
                    );

                    return;
                }

                const isThumbnail =
                    choice ===
                    'set_thumbnail';

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            makeId(
                                session,
                                isThumbnail
                                    ? 'modal_thumbnail'
                                    : 'modal_image',
                            ),
                        )
                        .setTitle(
                            isThumbnail
                                ? 'Set Thumbnail'
                                : 'Set Main Image',
                        );

                const input =
                    new TextInputBuilder()
                        .setCustomId('url')
                        .setLabel(
                            'Image URL',
                        )
                        .setStyle(
                            TextInputStyle.Short,
                        )
                        .setRequired(true)
                        .setMaxLength(2048)
                        .setPlaceholder(
                            'https://example.com/image.png',
                        );

                const current =
                    isThumbnail
                        ? session.state.thumbnail
                        : session.state.image;

                if (current) {
                    input.setValue(current);
                }

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        input,
                    ),
                );

                const submission =
                    await showModalAndWait(
                        interaction,
                        session,
                        modal,
                    );

                if (!submission) {
                    return;
                }

                const url =
                    submission.fields
                        .getTextInputValue(
                            'url',
                        )
                        .trim();

                if (!isValidUrl(url)) {
                    await submission.reply({
                        content:
                            '❌ Please enter a valid HTTP/HTTPS image URL.',
                        flags:
                            MessageFlags.Ephemeral,
                    });

                    return;
                }

                if (isThumbnail) {
                    session.state.thumbnail =
                        url;
                } else {
                    session.state.image =
                        url;
                }

                await submission.reply({
                    content: isThumbnail
                        ? '✅ Thumbnail updated.'
                        : '✅ Main image updated.',
                    flags:
                        MessageFlags.Ephemeral,
                });

                await refreshDashboard(
                    session,
                );
            } catch (error) {
                await safeError(
                    interaction,
                    error,
                );
            }
        },
    );
}

/* -------------------------------------------------------------------------- */
/*                              FIELD MODAL                                   */
/* -------------------------------------------------------------------------- */

async function showFieldModal(
    session,
    componentInteraction,
    index = null,
) {
    const existing =
        index !== null
            ? session.state.fields[index]
            : null;

    const modal =
        new ModalBuilder()
            .setCustomId(
                makeId(
                    session,
                    index === null
                        ? 'modal_add_field'
                        : `modal_edit_field_${index}`,
                ),
            )
            .setTitle(
                index === null
                    ? 'Add Embed Field'
                    : `Edit Field ${index + 1}`,
            );

    const name =
        new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Field Name')
            .setStyle(
                TextInputStyle.Short,
            )
            .setRequired(true)
            .setMaxLength(256)
            .setPlaceholder(
                'Field name',
            );

    const value =
        new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Field Value')
            .setStyle(
                TextInputStyle.Paragraph,
            )
            .setRequired(true)
            .setMaxLength(1024)
            .setPlaceholder(
                'Field value',
            );

    const inline =
        new TextInputBuilder()
            .setCustomId('inline')
            .setLabel(
                'Inline? Type yes or no',
            )
            .setStyle(
                TextInputStyle.Short,
            )
            .setRequired(true)
            .setMaxLength(3)
            .setPlaceholder('yes');

    if (existing) {
        name.setValue(existing.name);
        value.setValue(existing.value);
        inline.setValue(
            existing.inline
                ? 'yes'
                : 'no',
        );
    }

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            name,
        ),
        new ActionRowBuilder().addComponents(
            value,
        ),
        new ActionRowBuilder().addComponents(
            inline,
        ),
    );

    const submission =
        await showModalAndWait(
            componentInteraction,
            session,
            modal,
        );

    if (!submission) {
        return;
    }

    const fieldName =
        submission.fields
            .getTextInputValue('name')
            .trim();

    const fieldValue =
        submission.fields
            .getTextInputValue('value')
            .trim();

    const inlineValue =
        submission.fields
            .getTextInputValue('inline')
            .trim()
            .toLowerCase();

    if (
        !['yes', 'no'].includes(
            inlineValue,
        )
    ) {
        await submission.reply({
            content:
                '❌ Inline must be `yes` or `no`.',
            flags:
                MessageFlags.Ephemeral,
        });

        return;
    }

    const field = {
        name: fieldName,
        value: fieldValue,
        inline:
            inlineValue === 'yes',
    };

    if (index === null) {
        if (
            session.state.fields.length >=
            MAX_FIELDS
        ) {
            await submission.reply({
                content:
                    `❌ You can only have ${MAX_FIELDS} fields.`,
                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }

        session.state.fields.push(
            field,
        );
    } else {
        if (
            !session.state.fields[index]
        ) {
            await submission.reply({
                content:
                    '❌ That field no longer exists.',
                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }

        session.state.fields[index] =
            field;
    }

    await submission.reply({
        content:
            index === null
                ? '✅ Field added.'
                : '✅ Field updated.',
        flags:
            MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        session,
    );
}

/* -------------------------------------------------------------------------- */
/*                              ADD FIELD                                     */
/* -------------------------------------------------------------------------- */

async function handleAddField(
    session,
    componentInteraction,
) {
    if (
        session.state.fields.length >=
        MAX_FIELDS
    ) {
        await componentInteraction.reply({
            content:
                `❌ Maximum of ${MAX_FIELDS} fields reached.`,
            flags:
                MessageFlags.Ephemeral,
        });

        return;
    }

    await showFieldModal(
        session,
        componentInteraction,
    );
}

/* -------------------------------------------------------------------------- */
/*                           FIELD MANAGEMENT                                  */
/* -------------------------------------------------------------------------- */

async function handleManageFields(
    session,
) {
    if (!session.state.fields.length) {
        await session.interaction.followUp({
            content:
                '❌ There are no fields to manage.',
            flags:
                MessageFlags.Ephemeral,
        });

        return;
    }

    const options =
        session.state.fields.map(
            (field, index) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        `${index + 1}. ${truncate(
                            field.name,
                            90,
                        )}`,
                    )
                    .setDescription(
                        truncate(
                            field.value.replace(
                                /\n/g,
                                ' ',
                            ),
                            100,
                        ),
                    )
                    .setValue(
                        String(index),
                    )
                    .setEmoji(
                        field.inline
                            ? '↔️'
                            : '⬇️',
                    ),
        );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                makeId(
                    session,
                    'field_manage_menu',
                ),
            )
            .setPlaceholder(
                'Choose a field...',
            )
            .addOptions(options);

    const message =
        await session.interaction.followUp({
            content:
                '📋 Choose a field to manage:',
            components: [
                new ActionRowBuilder().addComponents(
                    menu,
                ),
            ],
            flags:
                MessageFlags.Ephemeral,
        });

    const collector =
        message.createMessageComponentCollector({
            componentType:
                ComponentType.StringSelect,

            time: SUBMENU_TIMEOUT,

            max: 1,

            filter: interaction =>
                interaction.user.id ===
                    session.userId &&
                interaction.customId ===
                    makeId(
                        session,
                        'field_manage_menu',
                    ),
        });

    registerCollector(
        session,
        collector,
    );

    collector.on(
        'collect',
        async interaction => {
            try {
                const index = Number(
                    interaction.values[0],
                );

                if (
                    !Number.isInteger(index) ||
                    index < 0 ||
                    index >=
                        session.state.fields
                            .length
                ) {
                    await interaction.update({
                        content:
                            '❌ That field no longer exists.',
                        components: [],
                    });

                    return;
                }

                const row =
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                makeId(
                                    session,
                                    `edit_field_${index}`,
                                ),
                            )
                            .setLabel('Edit')
                            .setStyle(
                                ButtonStyle.Primary,
                            )
                            .setEmoji('✏️'),

                        new ButtonBuilder()
                            .setCustomId(
                                makeId(
                                    session,
                                    `remove_field_${index}`,
                                ),
                            )
                            .setLabel('Remove')
                            .setStyle(
                                ButtonStyle.Danger,
                            )
                            .setEmoji('🗑️'),

                        new ButtonBuilder()
                            .setCustomId(
                                makeId(
                                    session,
                                    'field_cancel',
                                ),
                            )
                            .setLabel('Cancel')
                            .setStyle(
                                ButtonStyle.Secondary,
                            ),
                    );

                await interaction.update({
                    content:
                        `📋 Managing field **${index + 1}**: **${truncate(
                            session.state.fields[
                                index
                            ].name,
                            100,
                        )}**`,
                    components: [row],
                });

                const buttonCollector =
                    interaction.message.createMessageComponentCollector(
                        {
                            componentType:
                                ComponentType.Button,

                            time:
                                SUBMENU_TIMEOUT,

                            max: 1,

                            filter: button =>
                                button.user.id ===
                                    session.userId &&
                                button.customId.startsWith(
                                    `eb:${session.id}:`,
                                ),
                        },
                    );

                registerCollector(
                    session,
                    buttonCollector,
                );

                buttonCollector.on(
                    'collect',
                    async button => {
                        try {
                            const action =
                                button.customId.split(
                                    ':',
                                ).pop();

                            if (
                                action ===
                                'field_cancel'
                            ) {
                                await button.update({
                                    content:
                                        'Cancelled.',
                                    components: [],
                                });

                                return;
                            }

                            if (
                                action ===
                                `remove_field_${index}`
                            ) {
                                if (
                                    !session.state
                                        .fields[
                                        index
                                    ]
                                ) {
                                    await button.update({
                                        content:
                                            '❌ That field no longer exists.',
                                        components: [],
                                    });

                                    return;
                                }

                                session.state.fields.splice(
                                    index,
                                    1,
                                );

                                await button.update({
                                    content:
                                        '✅ Field removed.',
                                    components: [],
                                });

                                await refreshDashboard(
                                    session,
                                );

                                return;
                            }

                            if (
                                action ===
                                `edit_field_${index}`
                            ) {
                                await showFieldModal(
                                    session,
                                    button,
                                    index,
                                );
                            }
                        } catch (error) {
                            await safeError(
                                button,
                                error,
                            );
                        }
                    },
                );
            } catch (error) {
                await safeError(
                    interaction,
                    error,
                );
            }
        },
    );
}

/* -------------------------------------------------------------------------- */
/*                              REORDER                                       */
/* -------------------------------------------------------------------------- */

async function handleReorderFields(
    session,
) {
    if (
        session.state.fields.length < 2
    ) {
        await session.interaction.followUp({
            content:
                '❌ You need at least two fields to reorder them.',
            flags:
                MessageFlags.Ephemeral,
        });

        return;
    }

    const options =
        session.state.fields.map(
            (field, index) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        `${index + 1}. ${truncate(
                            field.name,
                            90,
                        )}`,
                    )
                    .setDescription(
                        truncate(
                            field.value.replace(
                                /\n/g,
                                ' ',
                            ),
                            100,
                        ),
                    )
                    .setValue(
                        String(index),
                    ),
        );

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                makeId(
                    session,
                    'reorder_menu',
                ),
            )
            .setPlaceholder(
                'Choose a field to move...',
            )
            .addOptions(options);

    const message =
        await session.interaction.followUp({
            content:
                '↕️ Choose a field to move:',
            components: [
                new ActionRowBuilder().addComponents(
                    menu,
                ),
            ],
            flags:
                MessageFlags.Ephemeral,
        });

    const collector =
        message.createMessageComponentCollector({
            componentType:
                ComponentType.StringSelect,

            time: SUBMENU_TIMEOUT,

            max: 1,

            filter: interaction =>
                interaction.user.id ===
                    session.userId &&
                interaction.customId ===
                    makeId(
                        session,
                        'reorder_menu',
                    ),
        });

    registerCollector(
        session,
        collector,
    );

    collector.on(
        'collect',
        async interaction => {
            try {
                const index = Number(
                    interaction.values[0],
                );

                if (
                    !Number.isInteger(index) ||
                    index < 0 ||
                    index >=
                        session.state.fields
                            .length
                ) {
                    await interaction.update({
                        content:
                            '❌ Invalid field.',
                        components: [],
                    });

                    return;
                }

                const row =
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                makeId(
                                    session,
                                    `move_up_${index}`,
                                ),
                            )
                            .setLabel(
                                'Move Up',
                            )
                            .setStyle(
                                ButtonStyle.Primary,
                            )
                            .setEmoji('⬆️')
                            .setDisabled(
                                index === 0,
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                makeId(
                                    session,
                                    `move_down_${index}`,
                                ),
                            )
                            .setLabel(
                                'Move Down',
                            )
                            .setStyle(
                                ButtonStyle.Primary,
                            )
                            .setEmoji('⬇️')
                            .setDisabled(
                                index ===
                                    session.state
                                        .fields
                                        .length -
                                        1,
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                makeId(
                                    session,
                                    'reorder_cancel',
                                ),
                            )
                            .setLabel(
                                'Cancel',
                            )
                            .setStyle(
                                ButtonStyle.Secondary,
                            ),
                    );

                await interaction.update({
                    content:
                        `↕️ Moving field **${index + 1}**`,
                    components: [row],
                });

                const buttonCollector =
                    interaction.message.createMessageComponentCollector(
                        {
                            componentType:
                                ComponentType.Button,

                            time:
                                SUBMENU_TIMEOUT,

                            max: 1,

                            filter: button =>
                                button.user.id ===
                                    session.userId &&
                                button.customId.startsWith(
                                    `eb:${session.id}:`,
                                ),
                        },
                    );

                registerCollector(
                    session,
                    buttonCollector,
                );

                buttonCollector.on(
                    'collect',
                    async button => {
                        try {
                            const action =
                                button.customId.split(
                                    ':',
                                ).pop();

                            if (
                                action ===
                                'reorder_cancel'
                            ) {
                                await button.update({
                                    content:
                                        'Cancelled.',
                                    components: [],
                                });

                                return;
                            }

                            if (
                                action ===
                                    `move_up_${index}` &&
                                index > 0
                            ) {
                                const temp =
                                    session.state
                                        .fields[
                                        index
                                    ];

                                session.state
                                    .fields[
                                    index
                                ] =
                                    session.state
                                        .fields[
                                        index - 1
                                    ];

                                session.state
                                    .fields[
                                    index - 1
                                ] = temp;

                                await button.update({
                                    content:
                                        '✅ Field moved up.',
                                    components: [],
                                });

                                await refreshDashboard(
                                    session,
                                );

                                return;
                            }

                            if (
                                action ===
                                    `move_down_${index}` &&
                                index <
                                    session.state
                                        .fields
                                        .length -
                                        1
                            ) {
                                const temp =
                                    session.state
                                        .fields[
                                        index
                                    ];

                                session.state
                                    .fields[
                                    index
                                ] =
                                    session.state
                                        .fields[
                                        index + 1
                                    ];

                                session.state
                                    .fields[
                                    index + 1
                                ] = temp;

                                await button.update({
                                    content:
                                        '✅ Field moved down.',
                                    components: [],
                                });

                                await refreshDashboard(
                                    session,
                                );
                            }
                        } catch (error) {
                            await safeError(
                                button,
                                error,
                            );
                        }
                    },
                );
            } catch (error) {
                await safeError(
                    interaction,
                    error,
                );
            }
        },
    );
}

/* -------------------------------------------------------------------------- */
/*                             POST EMBED                                     */
/* -------------------------------------------------------------------------- */

async function handlePostEmbed(
    session,
) {
    if (isEmptyEmbed(session.state)) {
        await session.interaction.followUp({
            content:
                '❌ Your embed is empty. Add content before posting it.',
            flags:
                MessageFlags.Ephemeral,
        });

        return;
    }

    const length =
        calculateEmbedLength(
            session.state,
        );

    if (length > MAX_EMBED_LENGTH) {
        await session.interaction.followUp({
            content:
                `❌ Your embed is too long (${length}/${MAX_EMBED_LENGTH} characters).`,
            flags:
                MessageFlags.Ephemeral,
        });

        return;
    }

    const menu =
        new ChannelSelectMenuBuilder()
            .setCustomId(
                makeId(
                    session,
                    'post_channel',
                ),
            )
            .setPlaceholder(
                'Choose a channel...',
            )
            .setChannelTypes(
                ChannelType.GuildText,
            );

    const message =
        await session.interaction.followUp({
            content:
                '📤 Choose where to post the embed:',
            components: [
                new ActionRowBuilder().addComponents(
                    menu,
                ),
            ],
            flags:
                MessageFlags.Ephemeral,
        });

    const collector =
        message.createMessageComponentCollector({
            componentType:
                ComponentType.ChannelSelect,

            time: SUBMENU_TIMEOUT,

            max: 1,

            filter: interaction =>
                interaction.user.id ===
                    session.userId &&
                interaction.customId ===
                    makeId(
                        session,
                        'post_channel',
                    ),
        });

    registerCollector(
        session,
        collector,
    );

    collector.on(
        'collect',
        async interaction => {
            try {
                const channelId =
                    interaction.values[0];

                const channel =
                    await interaction.guild.channels
                        .fetch(channelId)
                        .catch(
                            () => null,
                        );

                if (
                    !channel ||
                    !channel.isTextBased()
                ) {
                    await interaction.update({
                        content:
                            '❌ That channel cannot receive messages.',
                        components: [],
                    });

                    return;
                }

                const me =
                    interaction.guild.members.me;

                const permissions =
                    me
                        ? channel.permissionsFor(
                              me,
                          )
                        : null;

                if (
                    !permissions?.has(
                        PermissionFlagsBits.SendMessages,
                    ) ||
                    !permissions?.has(
                        PermissionFlagsBits.EmbedLinks,
                    )
                ) {
                    await interaction.update({
                        content:
                            '❌ I need **Send Messages** and **Embed Links** permission in that channel.',
                        components: [],
                    });

                    return;
                }

                const finalState =
                    cloneState(
                        session.state,
                    );

                const finalEmbed =
                    buildEmbed(
                        finalState,
                        {
                            placeholder:
                                false,
                        },
                    );

                await channel.send({
                    embeds: [
                        finalEmbed,
                    ],
                });

                await interaction.update({
                    content:
                        `✅ Embed posted in <#${channel.id}>.`,
                    components: [],
                });

                await session.interaction.followUp({
                    embeds: [
                        successEmbed(
                            'Embed Posted',
                            `Your embed was successfully posted in <#${channel.id}>.`,
                        ),
                    ],
                    flags:
                        MessageFlags.Ephemeral,
                });
            } catch (error) {
                await safeError(
                    interaction,
                    error,
                );
            }
        },
    );
}

/* -------------------------------------------------------------------------- */
/*                              JSON EXPORT                                   */
/* -------------------------------------------------------------------------- */

async function handleJson(session) {
    const embed =
        buildEmbed(
            session.state,
            {
                placeholder: true,
            },
        );

    const json =
        JSON.stringify(
            embed.toJSON(),
            null,
            2,
        );

    if (json.length <= 3900) {
        await session.interaction.followUp({
            content:
                `\`\`\`json\n${json}\n\`\`\``,
            flags:
                MessageFlags.Ephemeral,
        });

        return;
    }

    await session.interaction.followUp({
        content:
            '📦 Your embed JSON is attached below.',
        files: [
            {
                attachment:
                    Buffer.from(
                        json,
                        'utf8',
                    ),
                name: 'embed.json',
            },
        ],
        flags:
            MessageFlags.Ephemeral,
    });
}

/* -------------------------------------------------------------------------- */
/*                              RESET                                         */
/* -------------------------------------------------------------------------- */

async function handleReset(session) {
    session.state =
        createEmptyState();

    await refreshDashboard(
        session,
    );
}

/* -------------------------------------------------------------------------- */
/*                              ERROR                                         */
/* -------------------------------------------------------------------------- */

async function safeError(
    interaction,
    error,
) {
    logger.error(
        'Embed Builder error:',
        error,
    );

    try {
        if (
            interaction.replied ||
            interaction.deferred
        ) {
            await interaction.followUp({
                content:
                    '❌ Something went wrong while using the embed builder.',
                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }

        await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes?.GENERAL ??
                    'GENERAL',

                message:
                    'Something went wrong while using the embed builder.',
            },
        );
    } catch {
        // Do not create another interaction error.
    }
}

/* -------------------------------------------------------------------------- */
/*                              MAIN COMMAND                                  */
/* -------------------------------------------------------------------------- */

export default {
    data: new SlashCommandBuilder()
        .setName('embedbuilder')
        .setDescription(
            'Build and post a fully custom embed with live preview',
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages,
        ),

    slashOnly: true,

    async execute(interaction) {
        const key =
            createSessionKey(
                interaction,
            );

        const oldSession =
            activeSessions.get(key);

        if (oldSession) {
            stopSession(
                oldSession,
            );
        }

        const session =
            createSession(
                interaction,
            );

        try {
            /*
             * IMPORTANT:
             * safeDefer expects an options object.
             */
            const deferred =
                await InteractionHelper.safeDefer(
                    interaction,
                    {
                        flags:
                            MessageFlags.Ephemeral,
                    },
                );

            if (!deferred) {
                stopSession(
                    session,
                );

                return;
            }

            await refreshDashboard(
                session,
            );

            /*
             * Get the actual dashboard message.
             *
             * The previous implementation attached the collector to
             * interaction.channel, which allowed every eb: select menu
             * in the channel to reach the main collector.
             *
             * We only want the dashboard menu here.
             */
            const dashboardMessage =
                await interaction.fetchReply();

            const collector =
                dashboardMessage.createMessageComponentCollector(
                    {
                        componentType:
                            ComponentType.StringSelect,

                        time:
                            IDLE_TIMEOUT,

                        filter:
                            component =>
                                component.user.id ===
                                    session.userId &&
                                component.customId ===
                                    makeId(
                                        session,
                                        'main',
                                    ),
                    },
                );

            registerCollector(
                session,
                collector,
            );

            collector.on(
                'collect',
                async component => {
                    if (
                        !session.active
                    ) {
                        return;
                    }

                    touchSession(
                        session,
                    );

                    if (
                        session.busy
                    ) {
                        await component.reply({
                            content:
                                '⏳ Please finish the current action first.',
                            flags:
                                MessageFlags.Ephemeral,
                        });

                        return;
                    }

                    const selected =
                        component.values?.[0];

                    session.busy = true;

                    try {
                        switch (
                            selected
                        ) {
                            case 'edit_content':
                                /*
                                 * DO NOT deferUpdate().
                                 * This interaction is used to open the modal.
                                 */
                                await handleEditContent(
                                    session,
                                    component,
                                );
                                break;

                            case 'set_color':
                                /*
                                 * This creates a submenu,
                                 * so acknowledge the main
                                 * interaction first.
                                 */
                                await component.deferUpdate();

                                await handleSetColor(
                                    session,
                                    component,
                                );
                                break;

                            case 'set_author':
                                await handleSetAuthor(
                                    session,
                                    component,
                                );
                                break;

                            case 'set_footer':
                                await handleSetFooter(
                                    session,
                                    component,
                                );
                                break;

                            case 'set_images':
                                await component.deferUpdate();

                                await handleSetImages(
                                    session,
                                );
                                break;

                            case 'add_field':
                                await handleAddField(
                                    session,
                                    component,
                                );
                                break;

                            case 'manage_fields':
                                await component.deferUpdate();

                                await handleManageFields(
                                    session,
                                );
                                break;

                            case 'reorder_fields':
                                await component.deferUpdate();

                                await handleReorderFields(
                                    session,
                                );
                                break;

                            case 'toggle_timestamp':
                                await component.deferUpdate();

                                session.state.timestamp =
                                    !session.state.timestamp;

                                await refreshDashboard(
                                    session,
                                );
                                break;

                            case 'post_embed':
                                await component.deferUpdate();

                                await handlePostEmbed(
                                    session,
                                );
                                break;

                            case 'json':
                                await component.deferUpdate();

                                await handleJson(
                                    session,
                                );
                                break;

                            case 'reset':
                                await component.deferUpdate();

                                await handleReset(
                                    session,
                                );
                                break;

                            default:
                                await component.reply({
                                    content:
                                        '❌ Unknown embed builder option.',
                                    flags:
                                        MessageFlags.Ephemeral,
                                });
                        }
                    } catch (error) {
                        await safeError(
                            component,
                            error,
                        );
                    } finally {
                        session.busy =
                            false;

                        touchSession(
                            session,
                        );
                    }
                },
            );

            collector.once(
                'end',
                () => {
                    if (
                        session.active
                    ) {
                        stopSession(
                            session,
                        );
                    }
                },
            );
        } catch (error) {
            stopSession(
                session,
            );

            await safeError(
                interaction,
                error,
            );
        }
    },
};
