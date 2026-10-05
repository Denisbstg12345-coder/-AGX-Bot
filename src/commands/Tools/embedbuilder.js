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
    if (!value) return '';
    const string = String(value);
    return string.length > max
        ? `${string.slice(0, max - 3)}...`
        : string;
}

function isValidUrl(value) {
    if (!value?.trim()) return true;

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
    return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function normalizeHex(value) {
    if (!value) return null;

    const trimmed = String(value).trim();

    if (!isValidHex(trimmed)) return null;

    return trimmed.toUpperCase();
}

function getDefaultColor() {
    try {
        const color = getColor();

        if (typeof color === 'number') {
            return color;
        }

        if (typeof color === 'string') {
            const normalized = color.startsWith('#')
                ? color
                : `#${color}`;

            if (isValidHex(normalized)) {
                return normalized;
            }
        }
    } catch {
        // Fall back below.
    }

    return '#080808';
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
        state.fields.length > 0
    );
}

function calculateEmbedLength(state) {
    let total = 0;

    total += state.title?.length ?? 0;
    total += state.description?.length ?? 0;

    if (state.author?.name) {
        total += state.author.name.length;
    }

    if (state.footer?.text) {
        total += state.footer.text.length;
    }

    for (const field of state.fields) {
        total += field.name?.length ?? 0;
        total += field.value?.length ?? 0;
    }

    return total;
}

function cloneState(state) {
    return {
        title: state.title,
        description: state.description,
        color: state.color,
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
        fields: state.fields.map(field => ({
            name: field.name,
            value: field.value,
            inline: Boolean(field.inline),
        })),
    };
}

/* -------------------------------------------------------------------------- */
/*                              EMBED BUILDERS                                */
/* -------------------------------------------------------------------------- */

/*
 * IMPORTANT:
 * Every optional Discord embed property is added conditionally.
 *
 * This prevents:
 *   embeds[0].description[BASE_TYPE_REQUIRED]
 *
 * which happens when an undefined value is accidentally passed into
 * EmbedBuilder.setDescription().
 */

function buildPreviewEmbed(state) {
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

        if (state.author.url?.trim() && isValidUrl(state.author.url)) {
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
        if (!field.name?.trim() || !field.value?.trim()) {
            continue;
        }

        embed.addFields({
            name: truncate(field.name.trim(), 256),
            value: truncate(field.value.trim(), 1024),
            inline: Boolean(field.inline),
        });
    }

    /*
     * Discord requires an actual embed property.
     * If the user has made absolutely nothing yet, give them a harmless
     * preview description.
     *
     * This is only the dashboard preview. The actual posted embed will
     * refuse to post if it is empty.
     */
    if (isEmptyEmbed(state)) {
        embed.setDescription('Use the menu below to start building your embed.');
    }

    return embed;
}

function buildDashboardEmbed(state) {
    const embed = new EmbedBuilder();

    const title = state.title?.trim();
    const color = normalizeHex(state.color);

    if (title) {
        embed.setTitle(`Embed Builder • ${truncate(title, 230)}`);
    } else {
        embed.setTitle('Embed Builder');
    }

    /*
     * ALWAYS provide a real description here.
     * This is the direct fix for the Discord BASE_TYPE_REQUIRED error.
     */
    const lines = [
        `**Fields:** ${state.fields.length}/${MAX_FIELDS}`,
        `**Characters:** ${calculateEmbedLength(state)}/6000`,
        `**Color:** ${normalizeHex(state.color) ?? '#080808'}`,
        `**Timestamp:** ${state.timestamp ? 'Enabled' : 'Disabled'}`,
    ];

    if (state.author?.name) {
        lines.push(`**Author:** ${truncate(state.author.name, 100)}`);
    }

    if (state.footer?.text) {
        lines.push(`**Footer:** ${truncate(state.footer.text, 100)}`);
    }

    if (state.thumbnail) {
        lines.push('**Thumbnail:** Set');
    }

    if (state.image) {
        lines.push('**Image:** Set');
    }

    embed.setDescription(lines.join('\n'));

    if (color) {
        embed.setColor(color);
    }

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
            .setDescription('Set the embed title and description')
            .setValue('edit_content')
            .setEmoji('📝'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Set Color')
            .setDescription('Choose a color or enter a custom hex')
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
            .setDescription('Set or remove thumbnail and image')
            .setValue('set_images')
            .setEmoji('🖼️'),

        new StringSelectMenuOptionBuilder()
            .setLabel(`Add Field • ${state.fields.length}/${MAX_FIELDS}`)
            .setDescription(
                state.fields.length >= MAX_FIELDS
                    ? 'Maximum number of fields reached'
                    : 'Add a new field to the embed',
            )
            .setValue('add_field')
            .setEmoji('➕'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Edit / Remove Fields')
            .setDescription(
                state.fields.length
                    ? 'Edit or remove an existing field'
                    : 'No fields have been added',
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
            .setDescription('Choose a channel and post the embed')
            .setValue('post_embed')
            .setEmoji('📤'),

        new StringSelectMenuOptionBuilder()
            .setLabel('JSON / Raw Data')
            .setDescription('View or export the embed data')
            .setValue('json')
            .setEmoji('📦'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Reset Everything')
            .setDescription('Clear the entire embed')
            .setValue('reset')
            .setEmoji('♻️'),
    ];

    if (state.fields.length >= MAX_FIELDS) {
        options[5].setDescription('Maximum number of fields reached');
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId(makeId(session, 'main'))
        .setPlaceholder('Choose an embed builder option...')
        .addOptions(options);

    return menu;
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

    for (const collector of session.collectors) {
        try {
            collector.stop('session_stopped');
        } catch {
            // Ignore collector cleanup errors.
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
        state: {
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
        },
    };

    activeSessions.set(key, session);

    session.timeout = setTimeout(() => {
        stopSession(session);
    }, IDLE_TIMEOUT);

    return session;
}

function touchSession(session) {
    if (!session.active) return;

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
    if (!session.active) return;

    touchSession(session);

    return InteractionHelper.safeEditReply(session.interaction, {
        embeds: [
            buildPreviewEmbed(session.state),
            buildDashboardEmbed(session.state),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                buildMainMenu(session.state, session),
            ),
        ],
    });
}

/* -------------------------------------------------------------------------- */
/*                              MODAL HELPER                                  */
/* -------------------------------------------------------------------------- */

async function showModalAndWait(session, modal) {
    if (!session.active) {
        return null;
    }

    try {
        await InteractionHelper.safeShowModal(
            session.interaction,
            modal,
        );
    } catch (error) {
        logger.error(error);
        return null;
    }

    try {
        const submission =
            await session.interaction.awaitModalSubmit({
                time: MODAL_TIMEOUT,
                filter: submitted =>
                    submitted.user.id === session.userId &&
                    submitted.customId.startsWith(
                        `eb:${session.id}:`,
                    ),
            });

        return submission;
    } catch {
        return null;
    }
}

/* -------------------------------------------------------------------------- */
/*                           EDIT CONTENT                                     */
/* -------------------------------------------------------------------------- */

async function handleEditContent(session) {
    const modal = new ModalBuilder()
        .setCustomId(makeId(session, 'modal_content'))
        .setTitle('Edit Embed Content');

    const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Title')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(256)
        .setPlaceholder('Optional embed title');

    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(4096)
        .setPlaceholder('Optional embed description');

    if (session.state.title) {
        titleInput.setValue(session.state.title);
    }

    if (session.state.description) {
        descriptionInput.setValue(session.state.description);
    }

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descriptionInput),
    );

    const submission = await showModalAndWait(session, modal);

    if (!submission) return;

    session.state.title =
        submission.fields.getTextInputValue('title').trim();

    session.state.description =
        submission.fields.getTextInputValue('description').trim();

    await submission.deferUpdate();

    await refreshDashboard(session);
}

/* -------------------------------------------------------------------------- */
/*                              COLOR                                         */
/* -------------------------------------------------------------------------- */

const COLOR_PRESETS = [
    ['Primary', '#080808', '⬛'],
    ['White', '#FFFFFF', '⬜'],
    ['Black', '#000000', '⚫'],
    ['Gray', '#808080', '🔘'],
    ['Success', '#57F287', '🟢'],
    ['Error', '#ED4245', '🔴'],
    ['Warning', '#FEE75C', '🟡'],
    ['Info', '#5865F2', '🔵'],
    ['Blurple', '#5865F2', '🟣'],
    ['Fuchsia', '#EB459E', '🩷'],
    ['Gold', '#F1C40F', '🟨'],
];

async function handleSetColor(session) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(makeId(session, 'color_menu'))
        .setPlaceholder('Choose a color...')
        .addOptions(
            COLOR_PRESETS.map(([label, value, emoji]) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(label)
                    .setValue(value)
                    .setEmoji(emoji)
                    .setDescription(value),
            ),
            new StringSelectMenuOptionBuilder()
                .setLabel('Custom Hex')
                .setValue('custom')
                .setEmoji('🔧')
                .setDescription('Enter your own #RRGGBB color'),
        );

    const message = await session.interaction.followUp({
        content: '🎨 Choose the embed color:',
        components: [
            new ActionRowBuilder().addComponents(menu),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: SUBMENU_TIMEOUT,
        max: 1,
    });

    registerCollector(session, collector);

    collector.on('collect', async interaction => {
        if (interaction.user.id !== session.userId) {
            return interaction.reply({
                content: 'This embed builder belongs to another user.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (interaction.values[0] === 'custom') {
            const modal = new ModalBuilder()
                .setCustomId(makeId(session, 'modal_color'))
                .setTitle('Custom Embed Color');

            const input = new TextInputBuilder()
                .setCustomId('hex')
                .setLabel('Hex Color')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(7)
                .setMaxLength(7)
                .setPlaceholder('#FFFFFF')
                .setValue(
                    normalizeHex(session.state.color) ?? '#080808',
                );

            modal.addComponents(
                new ActionRowBuilder().addComponents(input),
            );

            await interaction.showModal(modal);

            try {
                const submission =
                    await interaction.awaitModalSubmit({
                        time: MODAL_TIMEOUT,
                        filter: submitted =>
                            submitted.user.id === session.userId &&
                            submitted.customId ===
                                makeId(session, 'modal_color'),
                    });

                const value = submission.fields
                    .getTextInputValue('hex')
                    .trim();

                if (!isValidHex(value)) {
                    return submission.reply({
                        content:
                            '❌ Invalid color. Use the format `#RRGGBB`.',
                        flags: MessageFlags.Ephemeral,
                    });
                }

                session.state.color = value.toUpperCase();

                await submission.reply({
                    content: '✅ Color updated.',
                    flags: MessageFlags.Ephemeral,
                });

                await refreshDashboard(session);
            } catch {
                // Modal timed out.
            }

            return;
        }

        session.state.color = interaction.values[0];

        await interaction.update({
            content: '✅ Color updated.',
            components: [],
        });

        await refreshDashboard(session);
    });
}

/* -------------------------------------------------------------------------- */
/*                              AUTHOR                                        */
/* -------------------------------------------------------------------------- */

async function handleSetAuthor(session) {
    const modal = new ModalBuilder()
        .setCustomId(makeId(session, 'modal_author'))
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
        .setPlaceholder('https://example.com/icon.png');

    const url = new TextInputBuilder()
        .setCustomId('url')
        .setLabel('Author URL')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(2048)
        .setPlaceholder('https://example.com');

    if (session.state.author.name) {
        name.setValue(session.state.author.name);
    }

    if (session.state.author.iconURL) {
        icon.setValue(session.state.author.iconURL);
    }

    if (session.state.author.url) {
        url.setValue(session.state.author.url);
    }

    modal.addComponents(
        new ActionRowBuilder().addComponents(name),
        new ActionRowBuilder().addComponents(icon),
        new ActionRowBuilder().addComponents(url),
    );

    const submission = await showModalAndWait(session, modal);

    if (!submission) return;

    const authorName =
        submission.fields.getTextInputValue('name').trim();

    const iconURL =
        submission.fields.getTextInputValue('icon').trim();

    const authorURL =
        submission.fields.getTextInputValue('url').trim();

    if (iconURL && !isValidUrl(iconURL)) {
        return submission.reply({
            content: '❌ Icon URL must be a valid HTTP/HTTPS URL.',
            flags: MessageFlags.Ephemeral,
        });
    }

    if (authorURL && !isValidUrl(authorURL)) {
        return submission.reply({
            content: '❌ Author URL must be a valid HTTP/HTTPS URL.',
            flags: MessageFlags.Ephemeral,
        });
    }

    session.state.author = {
        name: authorName,
        iconURL,
        url: authorURL,
    };

    await submission.deferUpdate();

    await refreshDashboard(session);
}

/* -------------------------------------------------------------------------- */
/*                              FOOTER                                        */
/* -------------------------------------------------------------------------- */

async function handleSetFooter(session) {
    const modal = new ModalBuilder()
        .setCustomId(makeId(session, 'modal_footer'))
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
        .setPlaceholder('https://example.com/icon.png');

    if (session.state.footer.text) {
        text.setValue(session.state.footer.text);
    }

    if (session.state.footer.iconURL) {
        icon.setValue(session.state.footer.iconURL);
    }

    modal.addComponents(
        new ActionRowBuilder().addComponents(text),
        new ActionRowBuilder().addComponents(icon),
    );

    const submission = await showModalAndWait(session, modal);

    if (!submission) return;

    const footerText =
        submission.fields.getTextInputValue('text').trim();

    const iconURL =
        submission.fields.getTextInputValue('icon').trim();

    if (iconURL && !isValidUrl(iconURL)) {
        return submission.reply({
            content: '❌ Footer icon must be a valid HTTP/HTTPS URL.',
            flags: MessageFlags.Ephemeral,
        });
    }

    session.state.footer = {
        text: footerText,
        iconURL,
    };

    await submission.deferUpdate();

    await refreshDashboard(session);
}

/* -------------------------------------------------------------------------- */
/*                              IMAGES                                        */
/* -------------------------------------------------------------------------- */

async function handleSetImages(session) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(makeId(session, 'images_menu'))
        .setPlaceholder('Choose an image option...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Thumbnail')
                .setDescription('Set the small image in the top-right')
                .setValue('set_thumbnail')
                .setEmoji('🔳'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Set Main Image')
                .setDescription('Set the large image at the bottom')
                .setValue('set_image')
                .setEmoji('🖼️'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Thumbnail')
                .setDescription(
                    session.state.thumbnail
                        ? 'Remove the current thumbnail'
                        : 'No thumbnail is currently set',
                )
                .setValue('remove_thumbnail')
                .setEmoji('❌'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Main Image')
                .setDescription(
                    session.state.image
                        ? 'Remove the current main image'
                        : 'No main image is currently set',
                )
                .setValue('remove_image')
                .setEmoji('❌'),
        );

    const message = await session.interaction.followUp({
        content: '🖼️ Choose what you want to do:',
        components: [
            new ActionRowBuilder().addComponents(menu),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: SUBMENU_TIMEOUT,
        max: 1,
    });

    registerCollector(session, collector);

    collector.on('collect', async interaction => {
        if (interaction.user.id !== session.userId) {
            return interaction.reply({
                content: 'This embed builder belongs to another user.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const choice = interaction.values[0];

        if (choice === 'remove_thumbnail') {
            session.state.thumbnail = '';

            await interaction.update({
                content: '✅ Thumbnail removed.',
                components: [],
            });

            await refreshDashboard(session);
            return;
        }

        if (choice === 'remove_image') {
            session.state.image = '';

            await interaction.update({
                content: '✅ Main image removed.',
                components: [],
            });

            await refreshDashboard(session);
            return;
        }

        const isThumbnail = choice === 'set_thumbnail';

        const modal = new ModalBuilder()
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

        const input = new TextInputBuilder()
            .setCustomId('url')
            .setLabel('Image URL')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(2048)
            .setPlaceholder('https://example.com/image.png');

        const current = isThumbnail
            ? session.state.thumbnail
            : session.state.image;

        if (current) {
            input.setValue(current);
        }

        modal.addComponents(
            new ActionRowBuilder().addComponents(input),
        );

        await interaction.showModal(modal);

        try {
            const submission =
                await interaction.awaitModalSubmit({
                    time: MODAL_TIMEOUT,
                    filter: submitted =>
                        submitted.user.id === session.userId &&
                        submitted.customId ===
                            makeId(
                                session,
                                isThumbnail
                                    ? 'modal_thumbnail'
                                    : 'modal_image',
                            ),
                });

            const url = submission.fields
                .getTextInputValue('url')
                .trim();

            if (!isValidUrl(url)) {
                return submission.reply({
                    content:
                        '❌ Please enter a valid HTTP/HTTPS image URL.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (isThumbnail) {
                session.state.thumbnail = url;
            } else {
                session.state.image = url;
            }

            await submission.reply({
                content: isThumbnail
                    ? '✅ Thumbnail updated.'
                    : '✅ Main image updated.',
                flags: MessageFlags.Ephemeral,
            });

            await refreshDashboard(session);
        } catch {
            // Modal timed out.
        }
    });
}

/* -------------------------------------------------------------------------- */
/*                              FIELD MODAL                                   */
/* -------------------------------------------------------------------------- */

async function showFieldModal(
    session,
    {
        mode = 'add',
        index = null,
    } = {},
) {
    const existing =
        index !== null
            ? session.state.fields[index]
            : null;

    const modal = new ModalBuilder()
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

    const name = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Field Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256)
        .setPlaceholder('Field name');

    const value = new TextInputBuilder()
        .setCustomId('value')
        .setLabel('Field Value')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1024)
        .setPlaceholder('Field value');

    const inline = new TextInputBuilder()
        .setCustomId('inline')
        .setLabel('Inline? Type yes or no')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3)
        .setPlaceholder('yes');

    if (existing) {
        name.setValue(existing.name);
        value.setValue(existing.value);
        inline.setValue(existing.inline ? 'yes' : 'no');
    }

    modal.addComponents(
        new ActionRowBuilder().addComponents(name),
        new ActionRowBuilder().addComponents(value),
        new ActionRowBuilder().addComponents(inline),
    );

    const submission = await showModalAndWait(session, modal);

    if (!submission) return;

    const fieldName =
        submission.fields.getTextInputValue('name').trim();

    const fieldValue =
        submission.fields.getTextInputValue('value').trim();

    const inlineValue =
        submission.fields
            .getTextInputValue('inline')
            .trim()
            .toLowerCase();

    if (!['yes', 'no'].includes(inlineValue)) {
        return submission.reply({
            content: '❌ Inline must be `yes` or `no`.',
            flags: MessageFlags.Ephemeral,
        });
    }

    const field = {
        name: fieldName,
        value: fieldValue,
        inline: inlineValue === 'yes',
    };

    if (index === null) {
        if (session.state.fields.length >= MAX_FIELDS) {
            return submission.reply({
                content: `❌ You can only have ${MAX_FIELDS} fields.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        session.state.fields.push(field);
    } else {
        session.state.fields[index] = field;
    }

    await submission.deferUpdate();

    await refreshDashboard(session);
}

/* -------------------------------------------------------------------------- */
/*                              ADD FIELD                                     */
/* -------------------------------------------------------------------------- */

async function handleAddField(session) {
    if (session.state.fields.length >= MAX_FIELDS) {
        return session.interaction.followUp({
            content: `❌ Maximum of ${MAX_FIELDS} fields reached.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    await showFieldModal(session, {
        mode: 'add',
    });
}

/* -------------------------------------------------------------------------- */
/*                           FIELD MANAGEMENT                                  */
/* -------------------------------------------------------------------------- */

async function handleManageFields(session) {
    if (!session.state.fields.length) {
        return session.interaction.followUp({
            content: '❌ There are no fields to manage.',
            flags: MessageFlags.Ephemeral,
        });
    }

    const options = session.state.fields.map((field, index) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(
                `${index + 1}. ${truncate(field.name, 90)}`,
            )
            .setDescription(
                truncate(field.value.replace(/\n/g, ' '), 100),
            )
            .setValue(String(index))
            .setEmoji(field.inline ? '↔️' : '⬇️'),
    );

    const menu = new StringSelectMenuBuilder()
        .setCustomId(makeId(session, 'field_manage_menu'))
        .setPlaceholder('Choose a field...')
        .addOptions(options);

    const message = await session.interaction.followUp({
        content: '📋 Choose a field to manage:',
        components: [
            new ActionRowBuilder().addComponents(menu),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: SUBMENU_TIMEOUT,
        max: 1,
    });

    registerCollector(session, collector);

    collector.on('collect', async interaction => {
        if (interaction.user.id !== session.userId) {
            return interaction.reply({
                content: 'This embed builder belongs to another user.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const index = Number(interaction.values[0]);

        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= session.state.fields.length
        ) {
            return interaction.update({
                content: '❌ That field no longer exists.',
                components: [],
            });
        }

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(makeId(session, `edit_field_${index}`))
                .setLabel('Edit')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️'),

            new ButtonBuilder()
                .setCustomId(makeId(session, `remove_field_${index}`))
                .setLabel('Remove')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),

            new ButtonBuilder()
                .setCustomId(makeId(session, 'field_cancel'))
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary),
        );

        await interaction.update({
            content: `📋 Managing field **${index + 1}**: **${truncate(
                session.state.fields[index].name,
                100,
            )}**`,
            components: [buttons],
        });

        const buttonCollector =
            interaction.message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: SUBMENU_TIMEOUT,
                max: 1,
            });

        registerCollector(session, buttonCollector);

        buttonCollector.on('collect', async button => {
            if (button.user.id !== session.userId) {
                return button.reply({
                    content:
                        'This embed builder belongs to another user.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const action = button.customId.split(':').pop();

            if (action === 'field_cancel') {
                await button.update({
                    content: 'Cancelled.',
                    components: [],
                });

                return;
            }

            if (action === `edit_field_${index}`) {
                await showFieldModal(session, {
                    mode: 'edit',
                    index,
                });

                return;
            }

            if (action === `remove_field_${index}`) {
                session.state.fields.splice(index, 1);

                await button.update({
                    content: '✅ Field removed.',
                    components: [],
                });

                await refreshDashboard(session);
            }
        });
    });
}

/* -------------------------------------------------------------------------- */
/*                              REORDER                                       */
/* -------------------------------------------------------------------------- */

async function handleReorderFields(session) {
    if (session.state.fields.length < 2) {
        return session.interaction.followUp({
            content: '❌ You need at least two fields to reorder them.',
            flags: MessageFlags.Ephemeral,
        });
    }

    const options = session.state.fields.map((field, index) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(
                `${index + 1}. ${truncate(field.name, 90)}`,
            )
            .setDescription(
                truncate(field.value.replace(/\n/g, ' '), 100),
            )
            .setValue(String(index)),
    );

    const menu = new StringSelectMenuBuilder()
        .setCustomId(makeId(session, 'reorder_menu'))
        .setPlaceholder('Choose a field to move...')
        .addOptions(options);

    const message = await session.interaction.followUp({
        content: '↕️ Choose a field to move:',
        components: [
            new ActionRowBuilder().addComponents(menu),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: SUBMENU_TIMEOUT,
        max: 1,
    });

    registerCollector(session, collector);

    collector.on('collect', async interaction => {
        if (interaction.user.id !== session.userId) {
            return interaction.reply({
                content: 'This embed builder belongs to another user.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const index = Number(interaction.values[0]);

        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= session.state.fields.length
        ) {
            return interaction.update({
                content: '❌ Invalid field.',
                components: [],
            });
        }

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(makeId(session, `move_up_${index}`))
                .setLabel('Move Up')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⬆️')
                .setDisabled(index === 0),

            new ButtonBuilder()
                .setCustomId(makeId(session, `move_down_${index}`))
                .setLabel('Move Down')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⬇️')
                .setDisabled(
                    index === session.state.fields.length - 1,
                ),

            new ButtonBuilder()
                .setCustomId(makeId(session, 'reorder_cancel'))
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary),
        );

        await interaction.update({
            content: `↕️ Moving field **${index + 1}**`,
            components: [buttons],
        });

        const buttonCollector =
            interaction.message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: SUBMENU_TIMEOUT,
                max: 1,
            });

        registerCollector(session, buttonCollector);

        buttonCollector.on('collect', async button => {
            if (button.user.id !== session.userId) {
                return button.reply({
                    content:
                        'This embed builder belongs to another user.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const action = button.customId.split(':').pop();

            if (action === 'reorder_cancel') {
                await button.update({
                    content: 'Cancelled.',
                    components: [],
                });

                return;
            }

            if (action === `move_up_${index}` && index > 0) {
                const temp = session.state.fields[index];

                session.state.fields[index] =
                    session.state.fields[index - 1];

                session.state.fields[index - 1] = temp;

                await button.update({
                    content: '✅ Field moved up.',
                    components: [],
                });

                await refreshDashboard(session);

                return;
            }

            if (
                action === `move_down_${index}` &&
                index < session.state.fields.length - 1
            ) {
                const temp = session.state.fields[index];

                session.state.fields[index] =
                    session.state.fields[index + 1];

                session.state.fields[index + 1] = temp;

                await button.update({
                    content: '✅ Field moved down.',
                    components: [],
                });

                await refreshDashboard(session);
            }
        });
    });
}

/* -------------------------------------------------------------------------- */
/*                             POST EMBED                                     */
/* -------------------------------------------------------------------------- */

async function handlePostEmbed(session) {
    if (isEmptyEmbed(session.state)) {
        return session.interaction.followUp({
            content:
                '❌ Your embed is empty. Add a title, description, field, author, footer, image, thumbnail, or timestamp first.',
            flags: MessageFlags.Ephemeral,
        });
    }

    const length = calculateEmbedLength(session.state);

    if (length > 6000) {
        return session.interaction.followUp({
            content:
                `❌ Your embed is too long (${length}/6000 characters).`,
            flags: MessageFlags.Ephemeral,
        });
    }

    const menu = new ChannelSelectMenuBuilder()
        .setCustomId(makeId(session, 'post_channel'))
        .setPlaceholder('Choose a channel...')
        .setChannelTypes(ChannelType.GuildText);

    const message = await session.interaction.followUp({
        content: '📤 Choose where to post the embed:',
        components: [
            new ActionRowBuilder().addComponents(menu),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        time: SUBMENU_TIMEOUT,
        max: 1,
    });

    registerCollector(session, collector);

    collector.on('collect', async interaction => {
        if (interaction.user.id !== session.userId) {
            return interaction.reply({
                content: 'This embed builder belongs to another user.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const channelId = interaction.values[0];

        const channel = await interaction.guild.channels
            .fetch(channelId)
            .catch(() => null);

        if (!channel?.isTextBased()) {
            return interaction.update({
                content: '❌ That channel cannot receive messages.',
                components: [],
            });
        }

        const permissions =
            channel.permissionsFor(interaction.guild.members.me);

        if (
            !permissions?.has(PermissionFlagsBits.SendMessages) ||
            !permissions?.has(PermissionFlagsBits.EmbedLinks)
        ) {
            return interaction.update({
                content:
                    '❌ I need **Send Messages** and **Embed Links** permission in that channel.',
                components: [],
            });
        }

        const embed = buildPreviewEmbed(session.state);

        /*
         * The preview placeholder must never be posted.
         * Build a clean embed for the actual message instead.
         */
        const cleanState = cloneState(session.state);
        const finalEmbed = buildPreviewEmbed(cleanState);

        /*
         * buildPreviewEmbed adds a placeholder only when the state is empty.
         * We already checked isEmptyEmbed(), so this cannot normally happen.
         */

        await channel.send({
            embeds: [finalEmbed],
        });

        await interaction.update({
            content: `✅ Embed posted in <#${channel.id}>.`,
            components: [],
        });

        await session.interaction.followUp({
            embeds: [
                successEmbed(
                    'Embed Posted',
                    `Your embed was successfully posted in <#${channel.id}>.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    });
}

/* -------------------------------------------------------------------------- */
/*                              JSON EXPORT                                   */
/* -------------------------------------------------------------------------- */

async function handleJson(session) {
    const embed = buildPreviewEmbed(session.state);

    const json = JSON.stringify(
        embed.toJSON(),
        null,
        2,
    );

    if (json.length <= 3900) {
        return session.interaction.followUp({
            content: `\`\`\`json\n${json}\n\`\`\``,
            flags: MessageFlags.Ephemeral,
        });
    }

    const buffer = Buffer.from(json, 'utf8');

    return session.interaction.followUp({
        content: '📦 Your embed JSON is attached below.',
        files: [
            {
                attachment: buffer,
                name: 'embed.json',
            },
        ],
        flags: MessageFlags.Ephemeral,
    });
}

/* -------------------------------------------------------------------------- */
/*                              RESET                                         */
/* -------------------------------------------------------------------------- */

async function handleReset(session) {
    session.state = {
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

    await refreshDashboard(session);
}

/* -------------------------------------------------------------------------- */
/*                              ERROR HANDLER                                  */
/* -------------------------------------------------------------------------- */

async function safeError(interaction, error) {
    logger.error(error);

    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.followUp({
                content:
                    '❌ Something went wrong while using the embed builder.',
                flags: MessageFlags.Ephemeral,
            });
        }

        return await replyUserError(interaction, {
            type: ErrorTypes?.GENERAL ?? 'GENERAL',
            message:
                'Something went wrong while using the embed builder.',
        });
    } catch {
        // Prevent error handling from creating another Discord error.
    }
}

/* -------------------------------------------------------------------------- */
/*                              COMMAND                                        */
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
        const key = createSessionKey(interaction);

        const oldSession = activeSessions.get(key);

        if (oldSession) {
            stopSession(oldSession);
        }

        const session = createSession(interaction);

        try {
            await InteractionHelper.safeDefer(
                interaction,
                MessageFlags.Ephemeral,
            );

            await refreshDashboard(session);

            const collector =
                interaction.channel?.createMessageComponentCollector({
                    componentType: ComponentType.StringSelect,
                    time: IDLE_TIMEOUT,
                    filter: component =>
                        component.user.id === session.userId &&
                        component.customId.startsWith(
                            `eb:${session.id}:`,
                        ),
                });

            if (!collector) {
                throw new TitanBotError(
                    'Unable to create embed builder collector.',
                    ErrorTypes?.GENERAL ?? 'GENERAL',
                    'Unable to start the embed builder.',
                );
            }

            registerCollector(session, collector);

            collector.on('collect', async component => {
                if (!session.active) {
                    return;
                }

                touchSession(session);

                if (session.busy) {
                    return component.reply({
                        content:
                            '⏳ Please finish the current action first.',
                        flags: MessageFlags.Ephemeral,
                    });
                }

                const selected = component.values?.[0];

                try {
                    switch (selected) {
                        case 'edit_content':
                            await component.deferUpdate();
                            await handleEditContent(session);
                            break;

                        case 'set_color':
                            await component.deferUpdate();
                            await handleSetColor(session);
                            break;

                        case 'set_author':
                            await component.deferUpdate();
                            await handleSetAuthor(session);
                            break;

                        case 'set_footer':
                            await component.deferUpdate();
                            await handleSetFooter(session);
                            break;

                        case 'set_images':
                            await component.deferUpdate();
                            await handleSetImages(session);
                            break;

                        case 'add_field':
                            await component.deferUpdate();
                            await handleAddField(session);
                            break;

                        case 'manage_fields':
                            await component.deferUpdate();
                            await handleManageFields(session);
                            break;

                        case 'reorder_fields':
                            await component.deferUpdate();
                            await handleReorderFields(session);
                            break;

                        case 'toggle_timestamp':
                            await component.deferUpdate();

                            session.state.timestamp =
                                !session.state.timestamp;

                            await refreshDashboard(session);
                            break;

                        case 'post_embed':
                            await component.deferUpdate();
                            await handlePostEmbed(session);
                            break;

                        case 'json':
                            await component.deferUpdate();
                            await handleJson(session);
                            break;

                        case 'reset':
                            await component.deferUpdate();
                            await handleReset(session);
                            break;

                        default:
                            await component.reply({
                                content:
                                    '❌ Unknown embed builder option.',
                                flags: MessageFlags.Ephemeral,
                            });
                    }
                } catch (error) {
                    await safeError(component, error);
                }
            });

            collector.on('end', () => {
                if (session.active) {
                    stopSession(session);
                }
            });
        } catch (error) {
            stopSession(session);

            await safeError(interaction, error);
        }
    },
};
