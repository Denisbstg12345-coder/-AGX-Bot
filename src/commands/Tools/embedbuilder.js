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
    LabelBuilder,
    RadioGroupBuilder,
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

/* ============================================================
   CONFIG
============================================================ */

const MAX_FIELDS = 25;
const IDLE_TIMEOUT = 15 * 60 * 1000;
const SUBMENU_TIMEOUT = 60 * 1000;
const MODAL_TIMEOUT = 120 * 1000;

/*
 * One active embed builder per:
 * guild + channel + user
 *
 * This prevents multiple /embedbuilder sessions from
 * listening to the same interactions.
 */
const activeSessions = new Map();

/* ============================================================
   COLORS
============================================================ */

const COLOR_PRESETS = [
    {
        label: 'Primary (Blue)',
        value: '#336699',
        emoji: '🔵',
    },
    {
        label: 'Success (Green)',
        value: '#57F287',
        emoji: '🟢',
    },
    {
        label: 'Error (Red)',
        value: '#ED4245',
        emoji: '🔴',
    },
    {
        label: 'Warning (Yellow)',
        value: '#FEE75C',
        emoji: '🟡',
    },
    {
        label: 'Info (Bright Blue)',
        value: '#3498DB',
        emoji: '💠',
    },
    {
        label: 'Blurple (Discord)',
        value: '#5865F2',
        emoji: '🟣',
    },
    {
        label: 'Fuchsia',
        value: '#EB459E',
        emoji: '💗',
    },
    {
        label: 'Gold',
        value: '#F1C40F',
        emoji: '🟨',
    },
    {
        label: 'White',
        value: '#FFFFFF',
        emoji: '⚪',
    },
    {
        label: 'Dark',
        value: '#202225',
        emoji: '⚫',
    },
    {
        label: 'Custom Hex...',
        value: '__custom__',
        emoji: '🎨',
    },
];

/* ============================================================
   GENERAL HELPERS
============================================================ */

function createSessionKey(interaction) {
    return [
        interaction.guildId || 'dm',
        interaction.channelId || 'unknown',
        interaction.user.id,
    ].join(':');
}

function makeId(session, action) {
    return `eb:${session.id}:${action}`;
}

function isValidUrl(value) {
    try {
        const url = new URL(value);

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

function truncate(value, max) {
    if (!value) return '';

    return value.length > max
        ? `${value.substring(0, max)}…`
        : value;
}

function isEmptyEmbed(state) {
    return (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    );
}

/* ============================================================
   EMBED BUILDING
============================================================ */

function buildPreviewEmbed(state) {
    const embed = new EmbedBuilder();

    if (state.title) {
        embed.setTitle(
            state.title.substring(0, 256),
        );
    }

    if (state.description) {
        embed.setDescription(
            state.description.substring(0, 4096),
        );
    }

    try {
        embed.setColor(
            state.color || getColor('primary'),
        );
    } catch {
        embed.setColor(getColor('primary'));
    }

    if (state.author?.name) {
        const author = {
            name: state.author.name.substring(0, 256),
        };

        if (
            state.author.iconUrl &&
            isValidUrl(state.author.iconUrl)
        ) {
            author.iconURL = state.author.iconUrl;
        }

        if (
            state.author.url &&
            isValidUrl(state.author.url)
        ) {
            author.url = state.author.url;
        }

        embed.setAuthor(author);
    }

    if (state.footer?.text) {
        const footer = {
            text: state.footer.text.substring(0, 2048),
        };

        if (
            state.footer.iconUrl &&
            isValidUrl(state.footer.iconUrl)
        ) {
            footer.iconURL = state.footer.iconUrl;
        }

        embed.setFooter(footer);
    }

    if (
        state.thumbnail &&
        isValidUrl(state.thumbnail)
    ) {
        embed.setThumbnail(state.thumbnail);
    }

    if (
        state.image &&
        isValidUrl(state.image)
    ) {
        embed.setImage(state.image);
    }

    if (state.timestamp) {
        embed.setTimestamp();
    }

    if (state.fields.length > 0) {
        embed.addFields(
            state.fields.slice(0, MAX_FIELDS),
        );
    }

    if (isEmptyEmbed(state)) {
        embed.setDescription(
            '*Empty — use the menu below to add content*',
        );
    }

    return embed;
}

function buildDashboardEmbed(state) {
    const lines = [
        `**Title** › ${
            state.title
                ? `\`${truncate(state.title, 40)}\``
                : '`Not set`'
        }`,

        `**Description** › ${
            state.description
                ? `${state.description.length} character(s)`
                : '`Not set`'
        }`,

        `**Color** › ${
            state.color
                ? `\`${state.color}\``
                : '`Default`'
        }`,

        `**Author** › ${
            state.author?.name
                ? `\`${truncate(state.author.name, 30)}\``
                : '`Not set`'
        }`,

        `**Footer** › ${
            state.footer?.text
                ? `\`${truncate(state.footer.text, 30)}\``
                : '`Not set`'
        }`,

        `**Thumbnail** › ${
            state.thumbnail
                ? '✅ Set'
                : '`Not set`'
        }`,

        `**Image** › ${
            state.image
                ? '✅ Set'
                : '`Not set`'
        }`,

        `**Timestamp** › ${
            state.timestamp
                ? '✅ Enabled'
                : '`Disabled`'
        }`,

        `**Fields** › ${state.fields.length} / ${MAX_FIELDS}`,
    ];

    return new EmbedBuilder()
        .setTitle('Embed Builder — Control Panel')
        .setDescription(lines.join('\n'))
        .setColor(getColor('info'))
        .setFooter({
            text:
                'The preview above updates live · Closes after 15 min of inactivity',
        });
}

/* ============================================================
   DASHBOARD MENU
============================================================ */

function buildMainMenu(state, session) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(makeId(session, 'menu'))
        .setPlaceholder('Choose an action...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Content')
                .setDescription(
                    'Set the title and description',
                )
                .setValue('edit_content')
                .setEmoji('✏️'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Set Color')
                .setDescription(
                    'Pick a preset or enter a custom hex code',
                )
                .setValue('set_color')
                .setEmoji('🎨'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Set Author')
                .setDescription(
                    'Configure the author block',
                )
                .setValue('set_author')
                .setEmoji('👤'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Set Footer')
                .setDescription(
                    'Configure the footer text and icon',
                )
                .setValue('set_footer')
                .setEmoji('📄'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Set Images')
                .setDescription(
                    'Set the thumbnail or large image',
                )
                .setValue('set_images')
                .setEmoji('🖼️'),

            new StringSelectMenuOptionBuilder()
                .setLabel(
                    `Add Field (${state.fields.length}/${MAX_FIELDS})`,
                )
                .setDescription(
                    'Add a new inline or block field',
                )
                .setValue('add_field')
                .setEmoji('➕'),
        );

    if (state.fields.length > 0) {
        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Field')
                .setDescription(
                    'Modify an existing field',
                )
                .setValue('edit_field')
                .setEmoji('📝'),

            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Field')
                .setDescription(
                    'Delete a field',
                )
                .setValue('remove_field')
                .setEmoji('➖'),
        );

        if (state.fields.length >= 2) {
            select.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Reorder Fields')
                    .setDescription(
                        'Move a field up or down',
                    )
                    .setValue('reorder_fields')
                    .setEmoji('↕️'),
            );
        }
    }

    select.addOptions(
        new StringSelectMenuOptionBuilder()
            .setLabel(
                state.timestamp
                    ? 'Disable Timestamp'
                    : 'Enable Timestamp',
            )
            .setDescription(
                'Toggle the automatic timestamp',
            )
            .setValue('toggle_timestamp')
            .setEmoji('🕐'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Post Embed')
            .setDescription(
                'Send the finished embed to a channel',
            )
            .setValue('post_embed')
            .setEmoji('📤'),

        new StringSelectMenuOptionBuilder()
            .setLabel('JSON / Raw Data')
            .setDescription(
                'View the raw JSON for this embed',
            )
            .setValue('json_export')
            .setEmoji('📋'),

        new StringSelectMenuOptionBuilder()
            .setLabel('Reset Everything')
            .setDescription(
                'Clear everything and start over',
            )
            .setValue('reset_all')
            .setEmoji('🗑️'),
    );

    return select;
}

/* ============================================================
   DASHBOARD REFRESH
============================================================ */

async function refreshDashboard(session) {
    return InteractionHelper.safeEditReply(
        session.interaction,
        {
            embeds: [
                buildPreviewEmbed(session.state),
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

/* ============================================================
   COLLECTOR CLEANUP
============================================================ */

function registerCollector(session, collector) {
    session.collectors.add(collector);

    collector.once('end', () => {
        session.collectors.delete(collector);
    });

    return collector;
}

function stopSession(session, reason = 'replaced') {
    if (!session) return;

    session.active = false;

    for (const collector of session.collectors) {
        try {
            collector.stop(reason);
        } catch {
            // Ignore already-ended collectors.
        }
    }

    session.collectors.clear();
}

/* ============================================================
   EDIT CONTENT
============================================================ */

async function handleEditContent(session, selectInteraction) {
    const modal = new ModalBuilder()
        .setCustomId(
            makeId(session, 'content_modal'),
        )
        .setTitle('Edit Content')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('title')
                    .setLabel(
                        'Title (max 256 characters)',
                    )
                    .setStyle(
                        TextInputStyle.Short,
                    )
                    .setValue(
                        session.state.title || '',
                    )
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder(
                        'My Embed Title',
                    ),
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel(
                        'Description (max 4000 characters)',
                    )
                    .setStyle(
                        TextInputStyle.Paragraph,
                    )
                    .setValue(
                        session.state.description
                            ? session.state.description.substring(
                                  0,
                                  4000,
                              )
                            : '',
                    )
                    .setMaxLength(4000)
                    .setRequired(false)
                    .setPlaceholder(
                        'Write your embed description here...',
                    ),
            ),
        );

    const shown =
        await InteractionHelper.safeShowModal(
            selectInteraction,
            modal,
        );

    if (!shown) return;

    const submitted =
        await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId ===
                        makeId(
                            session,
                            'content_modal',
                        ) &&
                    i.user.id ===
                        session.interaction.user.id,
                time: MODAL_TIMEOUT,
            })
            .catch(() => null);

    if (!submitted) return;

    session.state.title =
        submitted.fields
            .getTextInputValue('title')
            .trim() || null;

    session.state.description =
        submitted.fields
            .getTextInputValue('description')
            .trim() || null;

    await submitted.deferUpdate().catch(() => {});

    await refreshDashboard(session);
}

/* ============================================================
   COLOR
============================================================ */

async function handleSetColor(
    session,
    selectInteraction,
) {
    if (session.busy) {
        await selectInteraction
            .deferUpdate()
            .catch(() => {});

        return;
    }

    session.busy = true;

    try {
        await selectInteraction
            .deferUpdate()
            .catch(() => {});

        const colorSelect =
            new StringSelectMenuBuilder()
                .setCustomId(
                    makeId(
                        session,
                        'color_pick',
                    ),
                )
                .setPlaceholder(
                    'Choose a color...',
                )
                .addOptions(
                    COLOR_PRESETS.map(color =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                color.label,
                            )
                            .setValue(
                                color.value,
                            )
                            .setEmoji(
                                color.emoji,
                            )
                            .setDescription(
                                color.value !==
                                '__custom__'
                                    ? color.value
                                    : 'Enter your own #RRGGBB value',
                            ),
                    ),
                );

        const colorMessage =
            await selectInteraction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Set Color')
                        .setDescription(
                            'Select a preset color or choose **Custom Hex...** to enter your own `#RRGGBB` value.',
                        )
                        .setColor(
                            getColor('info'),
                        ),
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        colorSelect,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
                fetchReply: true,
            });

        const collector =
            registerCollector(
                session,
                colorMessage.createMessageComponentCollector(
                    {
                        componentType:
                            ComponentType.StringSelect,

                        filter: i =>
                            i.user.id ===
                                session.interaction
                                    .user.id &&
                            i.customId ===
                                makeId(
                                    session,
                                    'color_pick',
                                ),

                        time: SUBMENU_TIMEOUT,
                        max: 1,
                    },
                ),
            );

        collector.on(
            'collect',
            async colorInteraction => {
                try {
                    const picked =
                        colorInteraction.values[0];

                    if (
                        picked ===
                        '__custom__'
                    ) {
                        const modal =
                            new ModalBuilder()
                                .setCustomId(
                                    makeId(
                                        session,
                                        'hex_modal',
                                    ),
                                )
                                .setTitle(
                                    'Custom Color',
                                )
                                .addComponents(
                                    new ActionRowBuilder().addComponents(
                                        new TextInputBuilder()
                                            .setCustomId(
                                                'hex',
                                            )
                                            .setLabel(
                                                'Hex Color Code',
                                            )
                                            .setStyle(
                                                TextInputStyle.Short,
                                            )
                                            .setPlaceholder(
                                                '#5865F2',
                                            )
                                            .setMinLength(
                                                7,
                                            )
                                            .setMaxLength(
                                                7,
                                            )
                                            .setRequired(
                                                true,
                                            ),
                                    ),
                                );

                        const shown =
                            await InteractionHelper.safeShowModal(
                                colorInteraction,
                                modal,
                            );

                        if (!shown) return;

                        const submitted =
                            await colorInteraction
                                .awaitModalSubmit({
                                    filter: i =>
                                        i.customId ===
                                            makeId(
                                                session,
                                                'hex_modal',
                                            ) &&
                                        i.user.id ===
                                            session
                                                .interaction
                                                .user
                                                .id,
                                    time: MODAL_TIMEOUT,
                                })
                                .catch(
                                    () => null,
                                );

                        if (!submitted) return;

                        const hex =
                            submitted.fields
                                .getTextInputValue(
                                    'hex',
                                )
                                .trim()
                                .toUpperCase();

                        if (!isValidHex(hex)) {
                            await replyUserError(
                                submitted,
                                {
                                    type: ErrorTypes.USER_INPUT,
                                    message:
                                        `\`${hex}\` is not a valid hex color. Use the format \`#RRGGBB\` (for example \`#5865F2\`).`,
                                },
                            );

                            return;
                        }

                        session.state.color =
                            hex;

                        await submitted
                            .deferUpdate()
                            .catch(() => {});
                    } else {
                        session.state.color =
                            picked;

                        await colorInteraction
                            .deferUpdate()
                            .catch(() => {});
                    }

                    await refreshDashboard(
                        session,
                    );
                } catch (error) {
                    logger.warn(
                        'Embed builder color picker failed:',
                        error,
                    );
                }
            },
        );

        collector.once('end', () => {
            session.busy = false;
        });
    } catch (error) {
        session.busy = false;

        logger.warn(
            'Failed to open embed color picker:',
            error,
        );
    }
}

/* ============================================================
   AUTHOR
============================================================ */

async function handleSetAuthor(
    session,
    selectInteraction,
) {
    const modal = new ModalBuilder()
        .setCustomId(
            makeId(
                session,
                'author_modal',
            ),
        )
        .setTitle('Set Author')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('name')
                    .setLabel('Author Name')
                    .setStyle(
                        TextInputStyle.Short,
                    )
                    .setValue(
                        session.state.author
                            ?.name || '',
                    )
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder(
                        'Your Name',
                    ),
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('icon')
                    .setLabel(
                        'Author Icon URL',
                    )
                    .setStyle(
                        TextInputStyle.Short,
                    )
                    .setValue(
                        session.state.author
                            ?.iconUrl || '',
                    )
                    .setRequired(false)
                    .setPlaceholder(
                        'https://example.com/icon.png',
                    ),
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('url')
                    .setLabel(
                        'Author Link URL',
                    )
                    .setStyle(
                        TextInputStyle.Short,
                    )
                    .setValue(
                        session.state.author
                            ?.url || '',
                    )
                    .setRequired(false)
                    .setPlaceholder(
                        'https://example.com',
                    ),
            ),
        );

    const shown =
        await InteractionHelper.safeShowModal(
            selectInteraction,
            modal,
        );

    if (!shown) return;

    const submitted =
        await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId ===
                        makeId(
                            session,
                            'author_modal',
                        ) &&
                    i.user.id ===
                        session.interaction.user.id,
                time: MODAL_TIMEOUT,
            })
            .catch(() => null);

    if (!submitted) return;

    const name =
        submitted.fields
            .getTextInputValue('name')
            .trim();

    const icon =
        submitted.fields
            .getTextInputValue('icon')
            .trim();

    const url =
        submitted.fields
            .getTextInputValue('url')
            .trim();

    if (icon && !isValidUrl(icon)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message:
                'Author icon URL must be a valid `https://` URL.',
        });

        return;
    }

    if (url && !isValidUrl(url)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message:
                'Author link URL must be a valid `https://` URL.',
        });

        return;
    }

    session.state.author = name
        ? {
              name,
              iconUrl: icon || null,
              url: url || null,
          }
        : null;

    await submitted
        .deferUpdate()
        .catch(() => {});

    await refreshDashboard(session);
}

/* ============================================================
   FOOTER
============================================================ */

async function handleSetFooter(
    session,
    selectInteraction,
) {
    const modal = new ModalBuilder()
        .setCustomId(
            makeId(
                session,
                'footer_modal',
            ),
        )
        .setTitle('Set Footer')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('text')
                    .setLabel('Footer Text')
                    .setStyle(
                        TextInputStyle.Short,
                    )
                    .setValue(
                        session.state.footer
                            ?.text || '',
                    )
                    .setMaxLength(2048)
                    .setRequired(false)
                    .setPlaceholder(
                        'Built with TitanBot',
                    ),
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('icon')
                    .setLabel(
                        'Footer Icon URL',
                    )
                    .setStyle(
                        TextInputStyle.Short,
                    )
                    .setValue(
                        session.state.footer
                            ?.iconUrl || '',
                    )
                    .setRequired(false)
                    .setPlaceholder(
                        'https://example.com/icon.png',
                    ),
            ),
        );

    const shown =
        await InteractionHelper.safeShowModal(
            selectInteraction,
            modal,
        );

    if (!shown) return;

    const submitted =
        await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId ===
                        makeId(
                            session,
                            'footer_modal',
                        ) &&
                    i.user.id ===
                        session.interaction.user.id,
                time: MODAL_TIMEOUT,
            })
            .catch(() => null);

    if (!submitted) return;

    const text =
        submitted.fields
            .getTextInputValue('text')
            .trim();

    const icon =
        submitted.fields
            .getTextInputValue('icon')
            .trim();

    if (icon && !isValidUrl(icon)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message:
                'Footer icon URL must be a valid `https://` URL.',
        });

        return;
    }

    session.state.footer = text
        ? {
              text,
              iconUrl: icon || null,
          }
        : null;

    await submitted
        .deferUpdate()
        .catch(() => {});

    await refreshDashboard(session);
}

/* ============================================================
   IMAGES
============================================================ */

async function handleSetImages(
    session,
    selectInteraction,
) {
    if (session.busy) {
        await selectInteraction
            .deferUpdate()
            .catch(() => {});

        return;
    }

    session.busy = true;

    try {
        await selectInteraction
            .deferUpdate()
            .catch(() => {});

        const menu =
            new StringSelectMenuBuilder()
                .setCustomId(
                    makeId(
                        session,
                        'image_pick',
                    ),
                )
                .setPlaceholder(
                    'What would you like to change?',
                )
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            'Set Thumbnail',
                        )
                        .setDescription(
                            'Small image in the top-right',
                        )
                        .setValue(
                            'set_thumbnail',
                        )
                        .setEmoji('🖼️'),

                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            'Set Large Image',
                        )
                        .setDescription(
                            'Large image at the bottom',
                        )
                        .setValue(
                            'set_image',
                        )
                        .setEmoji('📸'),

                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            'Clear Thumbnail',
                        )
                        .setDescription(
                            'Remove the thumbnail',
                        )
                        .setValue(
                            'clear_thumbnail',
                        )
                        .setEmoji('🗑️'),

                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            'Clear Large Image',
                        )
                        .setDescription(
                            'Remove the large image',
                        )
                        .setValue(
                            'clear_image',
                        )
                        .setEmoji('🗑️'),
                );

        const message =
            await selectInteraction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Set Images')
                        .setDescription(
                            'Choose which image to set or remove.',
                        )
                        .addFields(
                            {
                                name: 'Thumbnail',
                                value:
                                    session.state
                                        .thumbnail
                                        ? `[View](${session.state.thumbnail})`
                                        : '`Not set`',
                                inline: true,
                            },
                            {
                                name: 'Large Image',
                                value:
                                    session.state
                                        .image
                                        ? `[View](${session.state.image})`
                                        : '`Not set`',
                                inline: true,
                            },
                        )
                        .setColor(
                            getColor('info'),
                        ),
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        menu,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
                fetchReply: true,
            });

        const collector =
            registerCollector(
                session,
                message.createMessageComponentCollector(
                    {
                        componentType:
                            ComponentType.StringSelect,

                        filter: i =>
                            i.user.id ===
                                session.interaction
                                    .user.id &&
                            i.customId ===
                                makeId(
                                    session,
                                    'image_pick',
                                ),

                        time: SUBMENU_TIMEOUT,
                        max: 1,
                    },
                ),
            );

        collector.on(
            'collect',
            async imageInteraction => {
                try {
                    const value =
                        imageInteraction
                            .values[0];

                    if (
                        value ===
                        'clear_thumbnail'
                    ) {
                        session.state.thumbnail =
                            null;

                        await imageInteraction
                            .deferUpdate()
                            .catch(() => {});

                        await refreshDashboard(
                            session,
                        );

                        return;
                    }

                    if (
                        value ===
                        'clear_image'
                    ) {
                        session.state.image =
                            null;

                        await imageInteraction
                            .deferUpdate()
                            .catch(() => {});

                        await refreshDashboard(
                            session,
                        );

                        return;
                    }

                    const thumbnail =
                        value ===
                        'set_thumbnail';

                    const modal =
                        new ModalBuilder()
                            .setCustomId(
                                makeId(
                                    session,
                                    'image_modal',
                                ),
                            )
                            .setTitle(
                                thumbnail
                                    ? 'Set Thumbnail'
                                    : 'Set Large Image',
                            )
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId(
                                            'url',
                                        )
                                        .setLabel(
                                            'Image URL',
                                        )
                                        .setStyle(
                                            TextInputStyle.Short,
                                        )
                                        .setValue(
                                            thumbnail
                                                ? session
                                                      .state
                                                      .thumbnail ||
                                                  ''
                                                : session
                                                      .state
                                                      .image ||
                                                  '',
                                        )
                                        .setRequired(
                                            true,
                                        )
                                        .setPlaceholder(
                                            'https://example.com/image.png',
                                        ),
                                ),
                            );

                    const shown =
                        await InteractionHelper.safeShowModal(
                            imageInteraction,
                            modal,
                        );

                    if (!shown) return;

                    const submitted =
                        await imageInteraction
                            .awaitModalSubmit({
                                filter: i =>
                                    i.customId ===
                                        makeId(
                                            session,
                                            'image_modal',
                                        ) &&
                                    i.user.id ===
                                        session
                                            .interaction
                                            .user
                                            .id,
                                time: MODAL_TIMEOUT,
                            })
                            .catch(
                                () => null,
                            );

                    if (!submitted) return;

                    const url =
                        submitted.fields
                            .getTextInputValue(
                                'url',
                            )
                            .trim();

                    if (!isValidUrl(url)) {
                        await replyUserError(
                            submitted,
                            {
                                type: ErrorTypes.USER_INPUT,
                                message:
                                    'Image URL must be a valid `https://` URL.',
                            },
                        );

                        return;
                    }

                    if (thumbnail) {
                        session.state.thumbnail =
                            url;
                    } else {
                        session.state.image =
                            url;
                    }

                    await submitted
                        .deferUpdate()
                        .catch(() => {});

                    await refreshDashboard(
                        session,
                    );
                } catch (error) {
                    logger.warn(
                        'Embed builder image interaction failed:',
                        error,
                    );
                }
            },
        );

        collector.once('end', () => {
            session.busy = false;
        });
    } catch (error) {
        session.busy = false;

        logger.warn(
            'Failed to open image picker:',
            error,
        );
    }
}

/* ============================================================
   ADD FIELD
============================================================ */

async function handleAddField(
    session,
    selectInteraction,
) {
    if (
        session.state.fields.length >=
        MAX_FIELDS
    ) {
        await selectInteraction
            .deferUpdate()
            .catch(() => {});

        await replyUserError(
            selectInteraction,
            {
                type: ErrorTypes.VALIDATION,
                message:
                    `Embeds can have a maximum of ${MAX_FIELDS} fields.`,
            },
        );

        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(
            makeId(
                session,
                'add_field_modal',
            ),
        )
        .setTitle('Add Field');

    const nameLabel =
        new LabelBuilder()
            .setLabel('Field Name')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('name')
                    .setStyle(
                        TextInputStyle.Short,
                    )
                    .setMaxLength(256)
                    .setRequired(true)
                    .setPlaceholder(
                        'Field Title',
                    ),
            );

    const valueLabel =
        new LabelBuilder()
            .setLabel('Field Value')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('value')
                    .setStyle(
                        TextInputStyle.Paragraph,
                    )
                    .setMaxLength(1024)
                    .setRequired(true)
                    .setPlaceholder(
                        'Field content goes here...',
                    ),
            );

    const inlineRadio =
        new RadioGroupBuilder()
            .setCustomId('inline')
            .setRequired(false)
            .addOptions([
                {
                    label: 'No — full width',
                    value: 'no',
                },
                {
                    label: 'Yes — side-by-side',
                    value: 'yes',
                },
            ]);

    const inlineLabel =
        new LabelBuilder()
            .setLabel(
                'Display inline?',
            )
            .setRadioGroupComponent(
                inlineRadio,
            );

    modal.addLabelComponents(
        nameLabel,
        valueLabel,
        inlineLabel,
    );

    const shown =
        await InteractionHelper.safeShowModal(
            selectInteraction,
            modal,
        );

    if (!shown) return;

    const submitted =
        await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId ===
                        makeId(
                            session,
                            'add_field_modal',
                        ) &&
                    i.user.id ===
                        session.interaction.user.id,
                time: MODAL_TIMEOUT,
            })
            .catch(() => null);

    if (!submitted) return;

    const name =
        submitted.fields
            .getTextInputValue('name')
            .trim();

    const value =
        submitted.fields
            .getTextInputValue('value')
            .trim();

    const inline =
        submitted.fields.getRadioGroup(
            'inline',
        ) === 'yes';

    session.state.fields.push({
        name,
        value,
        inline,
    });

    await submitted
        .deferUpdate()
        .catch(() => {});

    await refreshDashboard(session);
}

/* ============================================================
   FIELD PICKER
============================================================ */

function buildFieldPicker(
    session,
    action,
    fields,
    emoji,
) {
    return new StringSelectMenuBuilder()
        .setCustomId(
            makeId(session, action),
        )
        .setPlaceholder(
            'Select a field...',
        )
        .addOptions(
            fields.map((field, index) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        `${index + 1}. ${truncate(
                            field.name,
                            50,
                        )}`,
                    )
                    .setDescription(
                        `${truncate(
                            field.value,
                            70,
                        )} · ${
                            field.inline
                                ? 'Inline'
                                : 'Block'
                        }`,
                    )
                    .setValue(
                        String(index),
                    )
                    .setEmoji(emoji),
            ),
        );
}

/* ============================================================
   EDIT FIELD
============================================================ */

async function handleEditField(
    session,
    selectInteraction,
) {
    await selectInteraction
        .deferUpdate()
        .catch(() => {});

    const picker =
        buildFieldPicker(
            session,
            'edit_field_pick',
            session.state.fields.slice(
                0,
                MAX_FIELDS,
            ),
            '📝',
        );

    const message =
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Edit Field')
                    .setDescription(
                        'Select the field you want to modify.',
                    )
                    .setColor(
                        getColor('info'),
                    ),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    picker,
                ),
            ],
            flags: MessageFlags.Ephemeral,
            fetchReply: true,
        });

    const collector =
        registerCollector(
            session,
            message.createMessageComponentCollector(
                {
                    componentType:
                        ComponentType.StringSelect,

                    filter: i =>
                        i.user.id ===
                            session.interaction
                                .user.id &&
                        i.customId ===
                            makeId(
                                session,
                                'edit_field_pick',
                            ),

                    time: SUBMENU_TIMEOUT,
                    max: 1,
                },
            ),
        );

    collector.on(
        'collect',
        async fieldInteraction => {
            const index = Number.parseInt(
                fieldInteraction.values[0],
                10,
            );

            const field =
                session.state.fields[index];

            if (!field) {
                await fieldInteraction
                    .deferUpdate()
                    .catch(() => {});

                return;
            }

            const modal =
                new ModalBuilder()
                    .setCustomId(
                        makeId(
                            session,
                            'edit_field_modal',
                        ),
                    )
                    .setTitle(
                        `Edit Field ${index + 1}`,
                    );

            const nameLabel =
                new LabelBuilder()
                    .setLabel('Field Name')
                    .setTextInputComponent(
                        new TextInputBuilder()
                            .setCustomId('name')
                            .setStyle(
                                TextInputStyle.Short,
                            )
                            .setValue(
                                field.name.substring(
                                    0,
                                    256,
                                ),
                            )
                            .setMaxLength(256)
                            .setRequired(true),
                    );

            const valueLabel =
                new LabelBuilder()
                    .setLabel('Field Value')
                    .setTextInputComponent(
                        new TextInputBuilder()
                            .setCustomId('value')
                            .setStyle(
                                TextInputStyle.Paragraph,
                            )
                            .setValue(
                                field.value.substring(
                                    0,
                                    1024,
                                ),
                            )
                            .setMaxLength(1024)
                            .setRequired(true),
                    );

            const inlineRadio =
                new RadioGroupBuilder()
                    .setCustomId('inline')
                    .setRequired(false)
                    .addOptions([
                        {
                            label: 'No — full width',
                            value: 'no',
                            default:
                                !field.inline,
                        },
                        {
                            label: 'Yes — side-by-side',
                            value: 'yes',
                            default:
                                field.inline,
                        },
                    ]);

            const inlineLabel =
                new LabelBuilder()
                    .setLabel(
                        'Display inline?',
                    )
                    .setRadioGroupComponent(
                        inlineRadio,
                    );

            modal.addLabelComponents(
                nameLabel,
                valueLabel,
                inlineLabel,
            );

            const shown =
                await InteractionHelper.safeShowModal(
                    fieldInteraction,
                    modal,
                );

            if (!shown) return;

            const submitted =
                await fieldInteraction
                    .awaitModalSubmit({
                        filter: i =>
                            i.customId ===
                                makeId(
                                    session,
                                    'edit_field_modal',
                                ) &&
                            i.user.id ===
                                session
                                    .interaction
                                    .user.id,
                        time: MODAL_TIMEOUT,
                    })
                    .catch(
                        () => null,
                    );

            if (!submitted) return;

            const name =
                submitted.fields
                    .getTextInputValue(
                        'name',
                    )
                    .trim();

            const value =
                submitted.fields
                    .getTextInputValue(
                        'value',
                    )
                    .trim();

            const inline =
                submitted.fields.getRadioGroup(
                    'inline',
                ) === 'yes';

            session.state.fields[
                index
            ] = {
                name,
                value,
                inline,
            };

            await submitted
                .deferUpdate()
                .catch(() => {});

            await refreshDashboard(
                session,
            );
        },
    );
}

/* ============================================================
   REMOVE FIELD
============================================================ */

async function handleRemoveField(
    session,
    selectInteraction,
) {
    await selectInteraction
        .deferUpdate()
        .catch(() => {});

    const picker =
        buildFieldPicker(
            session,
            'remove_field_pick',
            session.state.fields.slice(
                0,
                MAX_FIELDS,
            ),
            '➖',
        );

    const message =
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Remove Field')
                    .setDescription(
                        'Select the field you want to delete.',
                    )
                    .setColor(
                        getColor('warning'),
                    ),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    picker,
                ),
            ],
            flags: MessageFlags.Ephemeral,
            fetchReply: true,
        });

    const collector =
        registerCollector(
            session,
            message.createMessageComponentCollector(
                {
                    componentType:
                        ComponentType.StringSelect,

                    filter: i =>
                        i.user.id ===
                            session.interaction
                                .user.id &&
                        i.customId ===
                            makeId(
                                session,
                                'remove_field_pick',
                            ),

                    time: SUBMENU_TIMEOUT,
                    max: 1,
                },
            ),
        );

    collector.on(
        'collect',
        async fieldInteraction => {
            const index = Number.parseInt(
                fieldInteraction.values[0],
                10,
            );

            if (
                Number.isNaN(index) ||
                index < 0 ||
                index >=
                    session.state.fields.length
            ) {
                await fieldInteraction
                    .deferUpdate()
                    .catch(() => {});

                return;
            }

            session.state.fields.splice(
                index,
                1,
            );

            await fieldInteraction
                .deferUpdate()
                .catch(() => {});

            await refreshDashboard(
                session,
            );
        },
    );
}

/* ============================================================
   REORDER FIELD
============================================================ */

async function handleReorderFields(
    session,
    selectInteraction,
) {
    await selectInteraction
        .deferUpdate()
        .catch(() => {});

    const picker =
        buildFieldPicker(
            session,
            'reorder_pick',
            session.state.fields.slice(
                0,
                MAX_FIELDS,
            ),
            '↕️',
        );

    const message =
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Reorder Fields')
                    .setDescription(
                        'Select a field, then use the arrows to move it.',
                    )
                    .setColor(
                        getColor('info'),
                    ),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    picker,
                ),
            ],
            flags: MessageFlags.Ephemeral,
            fetchReply: true,
        });

    const pickerCollector =
        registerCollector(
            session,
            message.createMessageComponentCollector(
                {
                    componentType:
                        ComponentType.StringSelect,

                    filter: i =>
                        i.user.id ===
                            session.interaction
                                .user.id &&
                        i.customId ===
                            makeId(
                                session,
                                'reorder_pick',
                            ),

                    time: SUBMENU_TIMEOUT,
                    max: 1,
                },
            ),
        );

    pickerCollector.on(
        'collect',
        async fieldInteraction => {
            const index = Number.parseInt(
                fieldInteraction.values[0],
                10,
            );

            if (
                Number.isNaN(index) ||
                !session.state.fields[index]
            ) {
                await fieldInteraction
                    .deferUpdate()
                    .catch(() => {});

                return;
            }

            await fieldInteraction
                .deferUpdate()
                .catch(() => {});

            const up =
                new ButtonBuilder()
                    .setCustomId(
                        makeId(
                            session,
                            'reorder_up',
                        ),
                    )
                    .setLabel('Move Up')
                    .setStyle(
                        ButtonStyle.Primary,
                    )
                    .setEmoji('⬆️')
                    .setDisabled(
                        index === 0,
                    );

            const down =
                new ButtonBuilder()
                    .setCustomId(
                        makeId(
                            session,
                            'reorder_down',
                        ),
                    )
                    .setLabel('Move Down')
                    .setStyle(
                        ButtonStyle.Primary,
                    )
                    .setEmoji('⬇️')
                    .setDisabled(
                        index ===
                            session.state
                                .fields.length -
                                1,
                    );

            const cancel =
                new ButtonBuilder()
                    .setCustomId(
                        makeId(
                            session,
                            'reorder_cancel',
                        ),
                    )
                    .setLabel('Cancel')
                    .setStyle(
                        ButtonStyle.Secondary,
                    );

            const moveMessage =
                await fieldInteraction.followUp({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                'Move Field',
                            )
                            .setDescription(
                                `Moving **${
                                    session.state
                                        .fields[
                                        index
                                    ].name
                                }** — position **${
                                    index + 1
                                }** of **${
                                    session.state
                                        .fields
                                        .length
                                }**.`,
                            )
                            .setColor(
                                getColor(
                                    'info',
                                ),
                            ),
                    ],
                    components: [
                        new ActionRowBuilder().addComponents(
                            up,
                            down,
                            cancel,
                        ),
                    ],
                    flags:
                        MessageFlags.Ephemeral,
                    fetchReply: true,
                });

            const buttonCollector =
                registerCollector(
                    session,
                    moveMessage.createMessageComponentCollector(
                        {
                            componentType:
                                ComponentType.Button,

                            filter: i =>
                                i.user.id ===
                                    session
                                        .interaction
                                        .user.id &&
                                [
                                    makeId(
                                        session,
                                        'reorder_up',
                                    ),
                                    makeId(
                                        session,
                                        'reorder_down',
                                    ),
                                    makeId(
                                        session,
                                        'reorder_cancel',
                                    ),
                                ].includes(
                                    i.customId,
                                ),

                            time: 30_000,
                            max: 1,
                        },
                    ),
                );

            buttonCollector.on(
                'collect',
                async buttonInteraction => {
                    await buttonInteraction
                        .deferUpdate()
                        .catch(() => {});

                    if (
                        buttonInteraction.customId ===
                        makeId(
                            session,
                            'reorder_cancel',
                        )
                    ) {
                        return;
                    }

                    const target =
                        buttonInteraction.customId ===
                        makeId(
                            session,
                            'reorder_up',
                        )
                            ? index - 1
                            : index + 1;

                    if (
                        target < 0 ||
                        target >=
                            session.state
                                .fields.length
                    ) {
                        return;
                    }

                    const temp =
                        session.state.fields[
                            index
                        ];

                    session.state.fields[
                        index
                    ] =
                        session.state.fields[
                            target
                        ];

                    session.state.fields[
                        target
                    ] = temp;

                    await refreshDashboard(
                        session,
                    );
                },
            );
        },
    );
}

/* ============================================================
   POST EMBED
============================================================ */

async function handlePostEmbed(
    session,
    selectInteraction,
) {
    if (isEmptyEmbed(session.state)) {
        await selectInteraction
            .deferUpdate()
            .catch(() => {});

        await replyUserError(
            selectInteraction,
            {
                type: ErrorTypes.VALIDATION,
                message:
                    'Add at least a title, description, or field before posting.',
            },
        );

        return;
    }

    await selectInteraction
        .deferUpdate()
        .catch(() => {});

    const channelSelect =
        new ChannelSelectMenuBuilder()
            .setCustomId(
                makeId(
                    session,
                    'post_channel',
                ),
            )
            .setPlaceholder(
                'Select a channel...',
            )
            .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
            );

    const message =
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Post Embed')
                    .setDescription(
                        'Select the channel where this embed will be sent.',
                    )
                    .setColor(
                        getColor('info'),
                    ),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    channelSelect,
                ),
            ],
            flags: MessageFlags.Ephemeral,
            fetchReply: true,
        });

    const collector =
        registerCollector(
            session,
            message.createMessageComponentCollector(
                {
                    componentType:
                        ComponentType.ChannelSelect,

                    filter: i =>
                        i.user.id ===
                            session.interaction
                                .user.id &&
                        i.customId ===
                            makeId(
                                session,
                                'post_channel',
                            ),

                    time: SUBMENU_TIMEOUT,
                    max: 1,
                },
            ),
        );

    collector.on(
        'collect',
        async channelInteraction => {
            try {
                await channelInteraction
                    .deferUpdate()
                    .catch(() => {});

                const channel =
                    channelInteraction.channels.first();

                if (!channel) {
                    await replyUserError(
                        channelInteraction,
                        {
                            type: ErrorTypes.USER_INPUT,
                            message:
                                'Could not resolve the selected channel.',
                        },
                    );

                    return;
                }

                const me =
                    session.guild?.members.me;

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
                    await replyUserError(
                        channelInteraction,
                        {
                            type: ErrorTypes.PERMISSION,
                            message:
                                `I need **Send Messages** and **Embed Links** permissions in ${channel} to post there.`,
                        },
                    );

                    return;
                }

                const embed =
                    buildPreviewEmbed(
                        session.state,
                    );

                if (
                    embed.data.description ===
                    '*Empty — use the menu below to add content*'
                ) {
                    embed.setDescription(null);
                }

                await channel.send({
                    embeds: [embed],
                });

                await channelInteraction.followUp(
                    {
                        embeds: [
                            successEmbed(
                                'Embed Sent',
                                `Your embed has been posted to ${channel}.`,
                            ),
                        ],
                        flags:
                            MessageFlags.Ephemeral,
                    },
                );
            } catch (error) {
                logger.error(
                    'Embed builder post interaction failed:',
                    error,
                );
            }
        },
    );
}

/* ============================================================
   JSON EXPORT
============================================================ */

async function handleJsonExport(
    session,
    selectInteraction,
) {
    await selectInteraction
        .deferUpdate()
        .catch(() => {});

    const json = JSON.stringify(
        buildPreviewEmbed(
            session.state,
        ).toJSON(),
        null,
        2,
    );

    if (json.length <= 3980) {
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Embed JSON')
                    .setDescription(
                        `\`\`\`json\n${json}\n\`\`\``,
                    )
                    .setColor(
                        getColor('info'),
                    ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        return;
    }

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Embed JSON')
                .setDescription(
                    'The JSON is too long to display inline — see the attached file.',
                )
                .setColor(
                    getColor('info'),
                ),
        ],
        files: [
            {
                attachment: Buffer.from(
                    json,
                    'utf-8',
                ),
                name: 'embed.json',
            },
        ],
        flags: MessageFlags.Ephemeral,
    });
}

/* ============================================================
   RESET
============================================================ */

function resetState(state) {
    state.title = null;
    state.description = null;
    state.color = getColor('primary');
    state.author = null;
    state.footer = null;
    state.thumbnail = null;
    state.image = null;
    state.timestamp = false;
    state.fields = [];
}

/* ============================================================
   MAIN COMMAND
============================================================ */

export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName('embedbuilder')
        .setDescription(
            'Build and post a fully custom embed with live preview',
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages,
        ),

    async execute(interaction) {
        const sessionKey =
            createSessionKey(interaction);

        try {
            /*
             * Kill any previous builder opened by
             * this exact user in this exact channel.
             */
            const previous =
                activeSessions.get(
                    sessionKey,
                );

            if (previous) {
                stopSession(
                    previous,
                    'replaced',
                );

                activeSessions.delete(
                    sessionKey,
                );

                await InteractionHelper.safeEditReply(
                    previous.interaction,
                    {
                        components: [],
                    },
                ).catch(() => {});
            }

            const deferred =
                await InteractionHelper.safeDefer(
                    interaction,
                    {
                        flags:
                            MessageFlags.Ephemeral,
                    },
                );

            if (!deferred) return;

            const session = {
                id: interaction.id,
                key: sessionKey,
                interaction,
                guild: interaction.guild,
                active: true,
                busy: false,
                collectors: new Set(),

                state: {
                    title: null,
                    description: null,
                    color: getColor(
                        'primary',
                    ),
                    author: null,
                    footer: null,
                    thumbnail: null,
                    image: null,
                    timestamp: false,
                    fields: [],
                },
            };

            activeSessions.set(
                sessionKey,
                session,
            );

            await refreshDashboard(
                session,
            );

            /*
             * The main collector has a UNIQUE custom ID.
             * Old sessions therefore cannot react to
             * interactions belonging to this session.
             */
            const mainCollector =
                registerCollector(
                    session,
                    interaction.channel.createMessageComponentCollector(
                        {
                            componentType:
                                ComponentType.StringSelect,

                            filter: i =>
                                i.user.id ===
                                    interaction.user
                                        .id &&
                                i.customId ===
                                    makeId(
                                        session,
                                        'menu',
                                    ),

                            time: IDLE_TIMEOUT,
                        },
                    ),
                );

            mainCollector.on(
                'collect',
                async component => {
                    if (!session.active) {
                        await component
                            .deferUpdate()
                            .catch(
                                () => {},
                            );

                        return;
                    }

                    try {
                        /*
                         * Don't allow another temporary
                         * picker to be opened while one is
                         * already active.
                         */
                        if (
                            session.busy &&
                            [
                                'set_color',
                                'set_images',
                            ].includes(
                                component.values[0],
                            )
                        ) {
                            await component
                                .deferUpdate()
                                .catch(
                                    () => {},
                                );

                            return;
                        }

                        switch (
                            component.values[0]
                        ) {
                            case 'edit_content':
                                await handleEditContent(
                                    session,
                                    component,
                                );
                                break;

                            case 'set_color':
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
                                await handleSetImages(
                                    session,
                                    component,
                                );
                                break;

                            case 'add_field':
                                await handleAddField(
                                    session,
                                    component,
                                );
                                break;

                            case 'edit_field':
                                await handleEditField(
                                    session,
                                    component,
                                );
                                break;

                            case 'remove_field':
                                await handleRemoveField(
                                    session,
                                    component,
                                );
                                break;

                            case 'reorder_fields':
                                await handleReorderFields(
                                    session,
                                    component,
                                );
                                break;

                            case 'toggle_timestamp':
                                session.state.timestamp =
                                    !session
                                        .state
                                        .timestamp;

                                await component
                                    .deferUpdate()
                                    .catch(
                                        () => {},
                                    );

                                await refreshDashboard(
                                    session,
                                );

                                break;

                            case 'post_embed':
                                await handlePostEmbed(
                                    session,
                                    component,
                                );

                                break;

                            case 'json_export':
                                await handleJsonExport(
                                    session,
                                    component,
                                );

                                break;

                            case 'reset_all':
                                resetState(
                                    session.state,
                                );

                                await component
                                    .deferUpdate()
                                    .catch(
                                        () => {},
                                    );

                                await refreshDashboard(
                                    session,
                                );

                                break;

                            default:
                                await component
                                    .deferUpdate()
                                    .catch(
                                        () => {},
                                    );
                        }
                    } catch (error) {
                        logger.error(
                            'Error in embedbuilder collector:',
                            error,
                        );

                        const message =
                            error instanceof
                            TitanBotError
                                ? error.userMessage ||
                                  'An error occurred.'
                                : 'An unexpected error occurred.';

                        if (
                            !component.replied &&
                            !component.deferred
                        ) {
                            await component
                                .deferUpdate()
                                .catch(
                                    () => {},
                                );
                        }

                        await replyUserError(
                            component,
                            {
                                type: ErrorTypes.UNKNOWN,
                                message,
                            },
                        ).catch(
                            () => {},
                        );
                    }
                },
            );

            mainCollector.once(
                'end',
                async (
                    _,
                    reason,
                ) => {
                    session.active =
                        false;

                    for (const collector of session.collectors) {
                        if (
                            collector !==
                            mainCollector
                        ) {
                            try {
                                collector.stop(
                                    'session_end',
                                );
                            } catch {
                                // Ignore.
                            }
                        }
                    }

                    session.collectors.clear();

                    if (
                        activeSessions.get(
                            sessionKey,
                        ) === session
                    ) {
                        activeSessions.delete(
                            sessionKey,
                        );
                    }

                    if (
                        reason === 'time' ||
                        reason ===
                            'replaced'
                    ) {
                        await InteractionHelper.safeEditReply(
                            interaction,
                            {
                                components: [],
                            },
                        ).catch(
                            () => {},
                        );
                    }
                },
            );
        } catch (error) {
            activeSessions.delete(
                sessionKey,
            );

            if (
                error instanceof
                TitanBotError
            ) {
                throw error;
            }

            logger.error(
                'Unexpected error in embedbuilder:',
                error,
            );

            throw new TitanBotError(
                `embedbuilder failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to open the embed builder.',
            );
        }
    },
};
