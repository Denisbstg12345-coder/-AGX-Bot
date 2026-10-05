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

/* ============================================================
   CONSTANTS
============================================================ */

const MAX_FIELDS = 25;
const IDLE_TIMEOUT = 15 * 60 * 1000;
const SUBMENU_TIMEOUT = 60 * 1000;
const MODAL_TIMEOUT = 120 * 1000;
const MAX_EMBED_LENGTH = 6000;

const activeSessions = new Map();

/* ============================================================
   COLOR PRESETS
============================================================ */

const COLOR_PRESETS = [
    {
        label: 'Primary',
        value: 'primary',
        emoji: '🔵',
    },
    {
        label: 'Success',
        value: 'success',
        emoji: '🟢',
    },
    {
        label: 'Error',
        value: 'error',
        emoji: '🔴',
    },
    {
        label: 'Warning',
        value: 'warning',
        emoji: '🟡',
    },
    {
        label: 'Info',
        value: 'info',
        emoji: '🔷',
    },
    {
        label: 'Blurple',
        value: 'blurple',
        emoji: '🟣',
    },
    {
        label: 'Fuchsia',
        value: 'fuchsia',
        emoji: '🩷',
    },
    {
        label: 'Gold',
        value: 'gold',
        emoji: '🟡',
    },
    {
        label: 'White',
        value: 'white',
        emoji: '⚪',
    },
    {
        label: 'Dark',
        value: 'dark',
        emoji: '⚫',
    },
    {
        label: 'Custom Hex',
        value: '__custom__',
        emoji: '🎨',
    },
];

/* ============================================================
   SESSION HELPERS
============================================================ */

function createSessionKey(interaction) {
    return [
        interaction.guildId ?? 'dm',
        interaction.channelId ?? 'unknown',
        interaction.user.id,
    ].join(':');
}

function makeId(session, action) {
    return `eb:${session.id}:${action}`;
}

function registerCollector(session, collector) {
    session.collectors.add(collector);

    collector.once('end', () => {
        session.collectors.delete(collector);
    });

    return collector;
}

function stopSession(session, reason = 'stopped') {
    if (!session) return;

    session.active = false;
    session.busy = false;

    for (const collector of session.collectors) {
        try {
            collector.stop(reason);
        } catch {
            // Ignore already stopped collectors.
        }
    }

    session.collectors.clear();
}

/* ============================================================
   GENERAL HELPERS
============================================================ */

function isValidUrl(value) {
    if (!value) return false;

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
        ? `${value.substring(0, max - 3)}...`
        : value;
}

function cleanInput(value) {
    return String(value ?? '').trim();
}

function isEmptyEmbed(state) {
    return !(
        state.title ||
        state.description ||
        state.author?.name ||
        state.footer?.text ||
        state.thumbnail ||
        state.image ||
        state.fields.length > 0
    );
}

function calculateEmbedLength(state) {
    let length = 0;

    if (state.title) {
        length += state.title.length;
    }

    if (state.description) {
        length += state.description.length;
    }

    if (state.author?.name) {
        length += state.author.name.length;
    }

    if (state.footer?.text) {
        length += state.footer.text.length;
    }

    for (const field of state.fields) {
        length += field.name.length;
        length += field.value.length;
    }

    return length;
}

function getEmbedLengthStatus(state) {
    const length = calculateEmbedLength(state);

    if (length > MAX_EMBED_LENGTH) {
        return {
            length,
            valid: false,
            text: `${length.toLocaleString()}/6,000 — TOO LONG`,
        };
    }

    return {
        length,
        valid: true,
        text: `${length.toLocaleString()}/6,000`,
    };
}

/* ============================================================
   EMBED BUILDING
============================================================ */

function buildPreviewEmbed(state) {
    const embed = new EmbedBuilder();

    if (state.title) {
        embed.setTitle(
            truncate(state.title, 256),
        );
    }

    if (state.description) {
        embed.setDescription(
            truncate(state.description, 4096),
        );
    }

    if (state.color) {
        embed.setColor(state.color);
    }

    if (state.author?.name) {
        embed.setAuthor({
            name: truncate(
                state.author.name,
                256,
            ),
            ...(state.author.icon
                ? {
                      iconURL:
                          state.author.icon,
                  }
                : {}),
            ...(state.author.url
                ? {
                      url: state.author.url,
                  }
                : {}),
        });
    }

    if (state.footer?.text) {
        embed.setFooter({
            text: truncate(
                state.footer.text,
                2048,
            ),
            ...(state.footer.icon
                ? {
                      iconURL:
                          state.footer.icon,
                  }
                : {}),
        });
    }

    if (state.thumbnail) {
        embed.setThumbnail(state.thumbnail);
    }

    if (state.image) {
        embed.setImage(state.image);
    }

    if (state.timestamp) {
        embed.setTimestamp();
    }

    if (state.fields.length > 0) {
        embed.addFields(
            state.fields
                .slice(0, MAX_FIELDS)
                .map(field => ({
                    name: truncate(
                        field.name,
                        256,
                    ),
                    value: truncate(
                        field.value,
                        1024,
                    ),
                    inline: Boolean(field.inline),
                })),
        );
    }

    return embed;
}

function buildDashboardEmbed(state) {
    const status =
        getEmbedLengthStatus(state);

    const fieldsText =
        state.fields.length === 0
            ? 'None'
            : state.fields
                  .map(
                      (field, index) =>
                          `**${index + 1}.** ${truncate(
                              field.name,
                              45,
                          )} — ${
                              field.inline
                                  ? 'Inline'
                                  : 'Block'
                          }`,
                  )
                  .join('\n');

    return new EmbedBuilder()
        .setTitle('Embed Builder')
        .setDescription(
            'Use the menu below to customize your embed. The first embed is the live preview.',
        )
        .setColor(
            status.valid
                ? state.color
                : getColor('error'),
        )
        .addFields(
            {
                name: 'Content',
                value:
                    `Title: ${
                        state.title
                            ? `\`${state.title.length}/256\``
                            : 'Not set'
                    }\n` +
                    `Description: ${
                        state.description
                            ? `\`${state.description.length}/4096\``
                            : 'Not set'
                    }`,
                inline: true,
            },
            {
                name: 'Appearance',
                value:
                    `Color: \`${state.color}\`\n` +
                    `Author: ${
                        state.author
                            ? 'Set'
                            : 'Not set'
                    }\n` +
                    `Footer: ${
                        state.footer
                            ? 'Set'
                            : 'Not set'
                    }\n` +
                    `Timestamp: ${
                        state.timestamp
                            ? 'On'
                            : 'Off'
                    }`,
                inline: true,
            },
            {
                name: 'Images',
                value:
                    `Thumbnail: ${
                        state.thumbnail
                            ? 'Set'
                            : 'Not set'
                    }\n` +
                    `Image: ${
                        state.image
                            ? 'Set'
                            : 'Not set'
                    }`,
                inline: true,
            },
            {
                name: `Fields (${state.fields.length}/${MAX_FIELDS})`,
                value:
                    fieldsText.length > 1024
                        ? truncate(
                              fieldsText,
                              1024,
                          )
                        : fieldsText,
                inline: false,
            },
            {
                name: 'Embed Size',
                value: status.text,
                inline: false,
            },
        )
        .setFooter({
            text: 'This builder automatically closes after 15 minutes of inactivity.',
        });
}

/* ============================================================
   MAIN MENU
============================================================ */

function buildMainMenu(state, session) {
    const options = [
        {
            label: 'Edit Content',
            description:
                'Set the embed title and description.',
            value: 'edit_content',
            emoji: '✏️',
        },
        {
            label: 'Set Color',
            description:
                'Choose a preset color or custom hex.',
            value: 'set_color',
            emoji: '🎨',
        },
        {
            label: 'Set Author',
            description:
                'Set author name, icon and URL.',
            value: 'set_author',
            emoji: '👤',
        },
        {
            label: 'Set Footer',
            description:
                'Set footer text and icon.',
            value: 'set_footer',
            emoji: '📌',
        },
        {
            label: 'Set Images',
            description:
                'Set thumbnail and main image URLs.',
            value: 'set_images',
            emoji: '🖼️',
        },
        {
            label: `Add Field (${state.fields.length}/${MAX_FIELDS})`,
            description:
                state.fields.length >= MAX_FIELDS
                    ? 'Maximum number of fields reached.'
                    : 'Add a new embed field.',
            value: 'add_field',
            emoji: '➕',
        },
    ];

    if (state.fields.length > 0) {
        options.push({
            label: 'Edit / Remove Field',
            description:
                'Modify or remove an existing field.',
            value: 'field_manage',
            emoji: '📝',
        });
    }

    if (state.fields.length >= 2) {
        options.push({
            label: 'Reorder Fields',
            description:
                'Move fields up or down.',
            value: 'reorder_fields',
            emoji: '↕️',
        });
    }

    options.push(
        {
            label: `Timestamp: ${
                state.timestamp ? 'ON' : 'OFF'
            }`,
            description:
                'Toggle the current timestamp.',
            value: 'toggle_timestamp',
            emoji: '🕐',
        },
        {
            label: 'Post Embed',
            description:
                'Choose a channel and send the embed.',
            value: 'post_embed',
            emoji: '📤',
        },
        {
            label: 'JSON / Raw Data',
            description:
                'View the embed JSON data.',
            value: 'json_export',
            emoji: '📄',
        },
        {
            label: 'Reset Everything',
            description:
                'Reset the entire embed.',
            value: 'reset_all',
            emoji: '♻️',
        },
    );

    return new StringSelectMenuBuilder()
        .setCustomId(
            makeId(session, 'menu'),
        )
        .setPlaceholder(
            'Choose an embed option...',
        )
        .addOptions(
            options.map(option =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        truncate(
                            option.label,
                            100,
                        ),
                    )
                    .setDescription(
                        truncate(
                            option.description,
                            100,
                        ),
                    )
                    .setValue(option.value)
                    .setEmoji(option.emoji),
            ),
        );
}

/* ============================================================
   DASHBOARD
============================================================ */

async function refreshDashboard(session) {
    if (!session.active) return false;

    try {
        await InteractionHelper.safeEditReply(
            session.interaction,
            {
                embeds: [
                    buildPreviewEmbed(
                        session.state,
                    ),
                    buildDashboardEmbed(
                        session.state,
                    ),
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

        return true;
    } catch (error) {
        logger.error(
            'Failed to refresh embed builder:',
            error,
        );

        return false;
    }
}

/* ============================================================
   EDIT CONTENT
============================================================ */

async function handleEditContent(
    session,
    selectInteraction,
) {
    const modal = new ModalBuilder()
        .setCustomId(
            makeId(
                session,
                'content_modal',
            ),
        )
        .setTitle('Edit Content');

    const titleInput =
        new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Title')
            .setStyle(
                TextInputStyle.Short,
            )
            .setMaxLength(256)
            .setRequired(false)
            .setPlaceholder(
                'Embed title...',
            );

    if (session.state.title) {
        titleInput.setValue(
            session.state.title.substring(
                0,
                256,
            ),
        );
    }

    const descriptionInput =
        new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(
                TextInputStyle.Paragraph,
            )
            .setMaxLength(4096)
            .setRequired(false)
            .setPlaceholder(
                'Embed description...',
            );

    if (session.state.description) {
        descriptionInput.setValue(
            session.state.description.substring(
                0,
                4096,
            ),
        );
    }

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            titleInput,
        ),
        new ActionRowBuilder().addComponents(
            descriptionInput,
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
                        session.interaction
                            .user.id,
                time: MODAL_TIMEOUT,
            })
            .catch(() => null);

    if (!submitted) return;

    session.state.title =
        cleanInput(
            submitted.fields.getTextInputValue(
                'title',
            ),
        ) || null;

    session.state.description =
        cleanInput(
            submitted.fields.getTextInputValue(
                'description',
            ),
        ) || null;

    await submitted
        .deferUpdate()
        .catch(() => {});

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

        const colorMenu =
            new StringSelectMenuBuilder()
                .setCustomId(
                    makeId(
                        session,
                        'color_menu',
                    ),
                )
                .setPlaceholder(
                    'Choose a color...',
                )
                .addOptions(
                    COLOR_PRESETS.map(
                        color =>
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
                                    color.value ===
                                    '__custom__'
                                        ? 'Enter your own #RRGGBB color'
                                        : 'Use this preset color',
                                ),
                    ),
                );

        const message =
            await selectInteraction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            'Set Color',
                        )
                        .setDescription(
                            'Choose a preset or enter a custom hex color.',
                        )
                        .setColor(
                            getColor('info'),
                        ),
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        colorMenu,
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
                                session
                                    .interaction
                                    .user.id &&
                            i.customId ===
                                makeId(
                                    session,
                                    'color_menu',
                                ),
                        time: SUBMENU_TIMEOUT,
                    },
                ),
            );

        collector.on(
            'collect',
            async colorInteraction => {
                const value =
                    colorInteraction
                        .values[0];

                if (
                    value ===
                    '__custom__'
                ) {
                    const modal =
                        new ModalBuilder()
                            .setCustomId(
                                makeId(
                                    session,
                                    'custom_color_modal',
                                ),
                            )
                            .setTitle(
                                'Custom Color',
                            );

                    const input =
                        new TextInputBuilder()
                            .setCustomId(
                                'hex',
                            )
                            .setLabel(
                                'Hex Color',
                            )
                            .setStyle(
                                TextInputStyle.Short,
                            )
                            .setMinLength(
                                7,
                            )
                            .setMaxLength(
                                7,
                            )
                            .setRequired(
                                true,
                            )
                            .setPlaceholder(
                                '#5865F2',
                            );

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(
                            input,
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
                            .awaitModalSubmit(
                                {
                                    filter:
                                        i =>
                                            i.customId ===
                                                makeId(
                                                    session,
                                                    'custom_color_modal',
                                                ) &&
                                            i.user.id ===
                                                session
                                                    .interaction
                                                    .user
                                                    .id,
                                    time: MODAL_TIMEOUT,
                                },
                            )
                            .catch(
                                () => null,
                            );

                    if (!submitted)
                        return;

                    const hex =
                        cleanInput(
                            submitted.fields.getTextInputValue(
                                'hex',
                            ),
                        );

                    if (!isValidHex(hex)) {
                        await submitted
                            .reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle(
                                            'Invalid Color',
                                        )
                                        .setDescription(
                                            'Use a valid 6-digit hex color, for example `#5865F2`.',
                                        )
                                        .setColor(
                                            getColor(
                                                'error',
                                            ),
                                        ),
                                ],
                                flags:
                                    MessageFlags.Ephemeral,
                            })
                            .catch(
                                () => {},
                            );

                        return;
                    }

                    session.state.color =
                        hex;

                    await submitted
                        .deferUpdate()
                        .catch(
                            () => {},
                        );

                    collector.stop(
                        'completed',
                    );

                    await refreshDashboard(
                        session,
                    );

                    return;
                }

                const resolved =
                    getColor(value);

                if (!resolved) {
                    await colorInteraction
                        .deferUpdate()
                        .catch(
                            () => {},
                        );
                    return;
                }

                session.state.color =
                    resolved;

                await colorInteraction
                    .deferUpdate()
                    .catch(
                        () => {},
                    );

                collector.stop(
                    'completed',
                );

                await refreshDashboard(
                    session,
                );
            },
        );
    } finally {
        session.busy = false;
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
        .setTitle('Set Author');

    const name =
        new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Author Name')
            .setStyle(
                TextInputStyle.Short,
            )
            .setMaxLength(256)
            .setRequired(true)
            .setPlaceholder(
                'Author name...',
            );

    if (session.state.author?.name) {
        name.setValue(
            session.state.author.name.substring(
                0,
                256,
            ),
        );
    }

    const icon =
        new TextInputBuilder()
            .setCustomId('icon')
            .setLabel('Icon URL')
            .setStyle(
                TextInputStyle.Short,
            )
            .setMaxLength(2048)
            .setRequired(false)
            .setPlaceholder(
                'https://example.com/icon.png',
            );

    if (session.state.author?.icon) {
        icon.setValue(
            session.state.author.icon.substring(
                0,
                2048,
            ),
        );
    }

    const url =
        new TextInputBuilder()
            .setCustomId('url')
            .setLabel('Author URL')
            .setStyle(
                TextInputStyle.Short,
            )
            .setMaxLength(2048)
            .setRequired(false)
            .setPlaceholder(
                'https://example.com',
            );

    if (session.state.author?.url) {
        url.setValue(
            session.state.author.url.substring(
                0,
                2048,
            ),
        );
    }

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            name,
        ),
        new ActionRowBuilder().addComponents(
            icon,
        ),
        new ActionRowBuilder().addComponents(
            url,
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
                        session.interaction
                            .user.id,
                time: MODAL_TIMEOUT,
            })
            .catch(() => null);

    if (!submitted) return;

    const authorName =
        cleanInput(
            submitted.fields.getTextInputValue(
                'name',
            ),
        );

    const iconUrl =
        cleanInput(
            submitted.fields.getTextInputValue(
                'icon',
            ),
        );

    const authorUrl =
        cleanInput(
            submitted.fields.getTextInputValue(
                'url',
            ),
        );

    if (
        iconUrl &&
        !isValidUrl(iconUrl)
    ) {
        await submitted.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        'Invalid Icon URL',
                    )
                    .setDescription(
                        'The author icon must be a valid `http://` or `https://` URL.',
                    )
                    .setColor(
                        getColor('error'),
                    ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        return;
    }

    if (
        authorUrl &&
        !isValidUrl(authorUrl)
    ) {
        await submitted.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        'Invalid Author URL',
                    )
                    .setDescription(
                        'The author URL must be a valid `http://` or `https://` URL.',
                    )
                    .setColor(
                        getColor('error'),
                    ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        return;
    }

    session.state.author = {
        name: authorName,
        icon: iconUrl || null,
        url: authorUrl || null,
    };

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
        .setTitle('Set Footer');

    const text =
        new TextInputBuilder()
            .setCustomId('text')
            .setLabel('Footer Text')
            .setStyle(
                TextInputStyle.Short,
            )
            .setMaxLength(2048)
            .setRequired(true)
            .setPlaceholder(
                'Footer text...',
            );

    if (session.state.footer?.text) {
        text.setValue(
            session.state.footer.text.substring(
                0,
                2048,
            ),
        );
    }

    const icon =
        new TextInputBuilder()
            .setCustomId('icon')
            .setLabel('Icon URL')
            .setStyle(
                TextInputStyle.Short,
            )
            .setMaxLength(2048)
            .setRequired(false)
            .setPlaceholder(
                'https://example.com/icon.png',
            );

    if (session.state.footer?.icon) {
        icon.setValue(
            session.state.footer.icon.substring(
                0,
                2048,
            ),
        );
    }

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            text,
        ),
        new ActionRowBuilder().addComponents(
            icon,
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
                        session.interaction
                            .user.id,
                time: MODAL_TIMEOUT,
            })
            .catch(() => null);

    if (!submitted) return;

    const footerText =
        cleanInput(
            submitted.fields.getTextInputValue(
                'text',
            ),
        );

    const iconUrl =
        cleanInput(
            submitted.fields.getTextInputValue(
                'icon',
            ),
        );

    if (
        iconUrl &&
        !isValidUrl(iconUrl)
    ) {
        await submitted.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        'Invalid Icon URL',
                    )
                    .setDescription(
                        'The footer icon must be a valid `http://` or `https://` URL.',
                    )
                    .setColor(
                        getColor('error'),
                    ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        return;
    }

    session.state.footer = {
        text: footerText,
        icon: iconUrl || null,
    };

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

        const imageMenu =
            new StringSelectMenuBuilder()
                .setCustomId(
                    makeId(
                        session,
                        'images_menu',
                    ),
                )
                .setPlaceholder(
                    'Choose an image option...',
                )
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            'Set Thumbnail',
                        )
                        .setDescription(
                            session.state.thumbnail
                                ? 'Change the thumbnail URL.'
                                : 'Add a thumbnail image.',
                        )
                        .setValue(
                            'set_thumbnail',
                        )
                        .setEmoji('🔲'),

                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            'Set Main Image',
                        )
                        .setDescription(
                            session.state.image
                                ? 'Change the main image URL.'
                                : 'Add a large image.',
                        )
                        .setValue(
                            'set_image',
                        )
                        .setEmoji('🖼️'),

                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            'Remove Thumbnail',
                        )
                        .setDescription(
                            session.state.thumbnail
                                ? 'Remove the current thumbnail.'
                                : 'No thumbnail is currently set.',
                        )
                        .setValue(
                            'remove_thumbnail',
                        )
                        .setEmoji('❌'),

                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            'Remove Main Image',
                        )
                        .setDescription(
                            session.state.image
                                ? 'Remove the current main image.'
                                : 'No main image is currently set.',
                        )
                        .setValue(
                            'remove_image',
                        )
                        .setEmoji('❌'),
                );

        const message =
            await selectInteraction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            'Set Images',
                        )
                        .setDescription(
                            [
                                `Thumbnail: ${
                                    session.state
                                        .thumbnail
                                        ? 'Set'
                                        : 'Not set'
                                }`,
                                `Main Image: ${
                                    session.state
                                        .image
                                        ? 'Set'
                                        : 'Not set'
                                }`,
                                '',
                                'Choose what you want to change.',
                            ].join('\n'),
                        )
                        .setColor(
                            getColor('info'),
                        ),
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        imageMenu,
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
                                session
                                    .interaction
                                    .user.id &&
                            i.customId ===
                                makeId(
                                    session,
                                    'images_menu',
                                ),
                        time: SUBMENU_TIMEOUT,
                    },
                ),
            );

        collector.on(
            'collect',
            async imageInteraction => {
                const choice =
                    imageInteraction
                        .values[0];

                if (
                    choice ===
                    'remove_thumbnail'
                ) {
                    session.state.thumbnail =
                        null;

                    await imageInteraction
                        .deferUpdate()
                        .catch(
                            () => {},
                        );

                    collector.stop(
                        'completed',
                    );

                    await refreshDashboard(
                        session,
                    );

                    return;
                }

                if (
                    choice ===
                    'remove_image'
                ) {
                    session.state.image =
                        null;

                    await imageInteraction
                        .deferUpdate()
                        .catch(
                            () => {},
                        );

                    collector.stop(
                        'completed',
                    );

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
                                    ? 'thumbnail_modal'
                                    : 'image_modal',
                            ),
                        )
                        .setTitle(
                            isThumbnail
                                ? 'Set Thumbnail'
                                : 'Set Main Image',
                        );

                const urlInput =
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
                        .setMaxLength(
                            2048,
                        )
                        .setRequired(
                            true,
                        )
                        .setPlaceholder(
                            'https://example.com/image.png',
                        );

                const current =
                    isThumbnail
                        ? session.state
                              .thumbnail
                        : session.state
                              .image;

                if (current) {
                    urlInput.setValue(
                        current.substring(
                            0,
                            2048,
                        ),
                    );
                }

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        urlInput,
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
                                        isThumbnail
                                            ? 'thumbnail_modal'
                                            : 'image_modal',
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

                if (!submitted)
                    return;

                const url =
                    cleanInput(
                        submitted.fields.getTextInputValue(
                            'url',
                        ),
                    );

                if (!isValidUrl(url)) {
                    await submitted.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    'Invalid Image URL',
                                )
                                .setDescription(
                                    'Please enter a valid `http://` or `https://` URL.',
                                )
                                .setColor(
                                    getColor(
                                        'error',
                                    ),
                                ),
                        ],
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

                await submitted
                    .deferUpdate()
                    .catch(
                        () => {},
                    );

                collector.stop(
                    'completed',
                );

                await refreshDashboard(
                    session,
                );
            },
        );
    } finally {
        session.busy = false;
    }
}

/* ============================================================
   FIELD MODAL
============================================================ */

function createFieldModal(
    session,
    action,
    field = null,
) {
    const modal = new ModalBuilder()
        .setCustomId(
            makeId(session, action),
        )
        .setTitle(
            field
                ? 'Edit Field'
                : 'Add Field',
        );

    const name =
        new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Field Name')
            .setStyle(
                TextInputStyle.Short,
            )
            .setMaxLength(256)
            .setRequired(true)
            .setPlaceholder(
                'Field title...',
            );

    if (field?.name) {
        name.setValue(
            field.name.substring(
                0,
                256,
            ),
        );
    }

    const value =
        new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Field Value')
            .setStyle(
                TextInputStyle.Paragraph,
            )
            .setMaxLength(1024)
            .setRequired(true)
            .setPlaceholder(
                'Field content...',
            );

    if (field?.value) {
        value.setValue(
            field.value.substring(
                0,
                1024,
            ),
        );
    }

    const inline =
        new TextInputBuilder()
            .setCustomId('inline')
            .setLabel('Inline?')
            .setStyle(
                TextInputStyle.Short,
            )
            .setMaxLength(3)
            .setRequired(false)
            .setPlaceholder(
                'yes or no',
            );

    inline.setValue(
        field?.inline
            ? 'yes'
            : 'no',
    );

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

    return modal;
}

function parseInline(value) {
    const normalized =
        cleanInput(value).toLowerCase();

    return [
        'yes',
        'y',
        'true',
        '1',
        'inline',
    ].includes(normalized);
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

    const modal =
        createFieldModal(
            session,
            'add_field_modal',
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
                        session.interaction
                            .user.id,
                time: MODAL_TIMEOUT,
            })
            .catch(() => null);

    if (!submitted) return;

    const name =
        cleanInput(
            submitted.fields.getTextInputValue(
                'name',
            ),
        );

    const value =
        cleanInput(
            submitted.fields.getTextInputValue(
                'value',
            ),
        );

    if (!name || !value) {
        await submitted.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        'Invalid Field',
                    )
                    .setDescription(
                        'Both the field name and field value are required.',
                    )
                    .setColor(
                        getColor('error'),
                    ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        return;
    }

    session.state.fields.push({
        name,
        value,
        inline: parseInline(
            submitted.fields.getTextInputValue(
                'inline',
            ),
        ),
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
            session.state.fields.map(
                (field, index) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(
                            truncate(
                                `${index + 1}. ${field.name}`,
                                100,
                            ),
                        )
                        .setDescription(
                            truncate(
                                `${field.value} · ${
                                    field.inline
                                        ? 'Inline'
                                        : 'Block'
                                }`,
                                100,
                            ),
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

    const message =
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        'Edit Field',
                    )
                    .setDescription(
                        'Select the field you want to modify.',
                    )
                    .setColor(
                        getColor('info'),
                    ),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    buildFieldPicker(
                        session,
                        'edit_field_pick',
                        '📝',
                    ),
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
                            session
                                .interaction
                                .user.id &&
                        i.customId ===
                            makeId(
                                session,
                                'edit_field_pick',
                            ),
                    time: SUBMENU_TIMEOUT,
                },
            ),
        );

    collector.on(
        'collect',
        async fieldInteraction => {
            const index =
                Number.parseInt(
                    fieldInteraction
                        .values[0],
                    10,
                );

            const field =
                session.state.fields[
                    index
                ];

            if (!field) {
                await fieldInteraction
                    .deferUpdate()
                    .catch(
                        () => {},
                    );
                return;
            }

            const modal =
                createFieldModal(
                    session,
                    'edit_field_modal',
                    field,
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

            if (!submitted)
                return;

            const name =
                cleanInput(
                    submitted.fields.getTextInputValue(
                        'name',
                    ),
                );

            const value =
                cleanInput(
                    submitted.fields.getTextInputValue(
                        'value',
                    ),
                );

            if (!name || !value) {
                await submitted.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                'Invalid Field',
                            )
                            .setDescription(
                                'Both the field name and field value are required.',
                            )
                            .setColor(
                                getColor(
                                    'error',
                                ),
                            ),
                    ],
                    flags:
                        MessageFlags.Ephemeral,
                });

                return;
            }

            session.state.fields[
                index
            ] = {
                name,
                value,
                inline: parseInline(
                    submitted.fields.getTextInputValue(
                        'inline',
                    ),
                ),
            };

            await submitted
                .deferUpdate()
                .catch(
                    () => {},
                );

            collector.stop(
                'completed',
            );

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

    const message =
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        'Remove Field',
                    )
                    .setDescription(
                        'Select the field you want to delete.',
                    )
                    .setColor(
                        getColor('warning'),
                    ),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    buildFieldPicker(
                        session,
                        'remove_field_pick',
                        '➖',
                    ),
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
                            session
                                .interaction
                                .user.id &&
                        i.customId ===
                            makeId(
                                session,
                                'remove_field_pick',
                            ),
                    time: SUBMENU_TIMEOUT,
                },
            ),
        );

    collector.on(
        'collect',
        async fieldInteraction => {
            const index =
                Number.parseInt(
                    fieldInteraction
                        .values[0],
                    10,
                );

            if (
                Number.isNaN(index) ||
                !session.state.fields[
                    index
                ]
            ) {
                await fieldInteraction
                    .deferUpdate()
                    .catch(
                        () => {},
                    );
                return;
            }

            session.state.fields.splice(
                index,
                1,
            );

            await fieldInteraction
                .deferUpdate()
                .catch(
                    () => {},
                );

            collector.stop(
                'completed',
            );

            await refreshDashboard(
                session,
            );
        },
    );
}

/* ============================================================
   FIELD MANAGEMENT
============================================================ */

async function handleFieldManage(
    session,
    selectInteraction,
) {
    await selectInteraction
        .deferUpdate()
        .catch(() => {});

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                makeId(
                    session,
                    'field_manage_menu',
                ),
            )
            .setPlaceholder(
                'Choose a field action...',
            )
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        'Edit Field',
                    )
                    .setDescription(
                        'Change a field.',
                    )
                    .setValue(
                        'edit_field',
                    )
                    .setEmoji('📝'),

                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        'Remove Field',
                    )
                    .setDescription(
                        'Delete a field.',
                    )
                    .setValue(
                        'remove_field',
                    )
                    .setEmoji('➖'),
            );

    const message =
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        'Field Management',
                    )
                    .setDescription(
                        'Choose what you want to do.',
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
                            session
                                .interaction
                                .user.id &&
                        i.customId ===
                            makeId(
                                session,
                                'field_manage_menu',
                            ),
                    time: SUBMENU_TIMEOUT,
                },
            ),
        );

    collector.on(
        'collect',
        async fieldAction => {
            const action =
                fieldAction.values[0];

            collector.stop(
                'completed',
            );

            if (
                action ===
                'edit_field'
            ) {
                await handleEditField(
                    session,
                    fieldAction,
                );
                return;
            }

            if (
                action ===
                'remove_field'
            ) {
                await handleRemoveField(
                    session,
                    fieldAction,
                );
            }
        },
    );
}

/* ============================================================
   REORDER FIELDS
============================================================ */

async function handleReorderFields(
    session,
    selectInteraction,
) {
    await selectInteraction
        .deferUpdate()
        .catch(() => {});

    const message =
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        'Reorder Fields',
                    )
                    .setDescription(
                        'Select a field to move it.',
                    )
                    .setColor(
                        getColor('info'),
                    ),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    buildFieldPicker(
                        session,
                        'reorder_pick',
                        '↕️',
                    ),
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
                            session
                                .interaction
                                .user.id &&
                        i.customId ===
                            makeId(
                                session,
                                'reorder_pick',
                            ),
                    time: SUBMENU_TIMEOUT,
                },
            ),
        );

    pickerCollector.on(
        'collect',
        async fieldInteraction => {
            const index =
                Number.parseInt(
                    fieldInteraction
                        .values[0],
                    10,
                );

            if (
                Number.isNaN(index) ||
                !session.state.fields[
                    index
                ]
            ) {
                await fieldInteraction
                    .deferUpdate()
                    .catch(
                        () => {},
                    );
                return;
            }

            await fieldInteraction
                .deferUpdate()
                .catch(
                    () => {},
                );

            const selected =
                session.state.fields[
                    index
                ];

            const moveMenu =
                new StringSelectMenuBuilder()
                    .setCustomId(
                        makeId(
                            session,
                            'reorder_action',
                        ),
                    )
                    .setPlaceholder(
                        'Choose a movement...',
                    )
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                'Move Up',
                            )
                            .setDescription(
                                index === 0
                                    ? 'Already at the top.'
                                    : 'Move this field up one position.',
                            )
                            .setValue(
                                'up',
                            )
                            .setEmoji('⬆️'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                'Move Down',
                            )
                            .setDescription(
                                index ===
                                session
                                    .state
                                    .fields
                                    .length -
                                    1
                                    ? 'Already at the bottom.'
                                    : 'Move this field down one position.',
                            )
                            .setValue(
                                'down',
                            )
                            .setEmoji('⬇️'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                'Cancel',
                            )
                            .setDescription(
                                'Keep the current order.',
                            )
                            .setValue(
                                'cancel',
                            )
                            .setEmoji('❌'),
                    );

            const moveMessage =
                await fieldInteraction.followUp({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                'Move Field',
                            )
                            .setDescription(
                                `Moving **${truncate(
                                    selected.name,
                                    100,
                                )}** — position **${
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
                            moveMenu,
                        ),
                    ],
                    flags:
                        MessageFlags.Ephemeral,
                    fetchReply: true,
                });

            const actionCollector =
                registerCollector(
                    session,
                    moveMessage.createMessageComponentCollector(
                        {
                            componentType:
                                ComponentType.StringSelect,
                            filter: i =>
                                i.user.id ===
                                    session
                                        .interaction
                                        .user.id &&
                                i.customId ===
                                    makeId(
                                        session,
                                        'reorder_action',
                                    ),
                            time: 30_000,
                        },
                    ),
                );

            actionCollector.on(
                'collect',
                async actionInteraction => {
                    const action =
                        actionInteraction
                            .values[0];

                    if (
                        action ===
                        'cancel'
                    ) {
                        await actionInteraction
                            .deferUpdate()
                            .catch(
                                () => {},
                            );

                        actionCollector.stop(
                            'completed',
                        );

                        return;
                    }

                    const target =
                        action === 'up'
                            ? index - 1
                            : index + 1;

                    if (
                        target < 0 ||
                        target >=
                            session.state
                                .fields
                                .length
                    ) {
                        await actionInteraction
                            .reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle(
                                            'Cannot Move Field',
                                        )
                                        .setDescription(
                                            'That field is already at the edge.',
                                        )
                                        .setColor(
                                            getColor(
                                                'warning',
                                            ),
                                        ),
                                ],
                                flags:
                                    MessageFlags.Ephemeral,
                            })
                            .catch(
                                () => {},
                            );

                        return;
                    }

                    [
                        session.state.fields[
                            index
                        ],
                        session.state.fields[
                            target
                        ],
                    ] = [
                        session.state.fields[
                            target
                        ],
                        session.state.fields[
                            index
                        ],
                    ];

                    await actionInteraction
                        .deferUpdate()
                        .catch(
                            () => {},
                        );

                    actionCollector.stop(
                        'completed',
                    );
                    pickerCollector.stop(
                        'completed',
                    );

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
                    'Add at least a title, description, author, footer, image, thumbnail, or field before posting.',
            },
        );

        return;
    }

    const status =
        getEmbedLengthStatus(
            session.state,
        );

    if (!status.valid) {
        await selectInteraction
            .deferUpdate()
            .catch(() => {});

        await replyUserError(
            selectInteraction,
            {
                type: ErrorTypes.VALIDATION,
                message:
                    `Your embed is ${status.length.toLocaleString()}/6,000 characters. Remove some content before posting.`,
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
                    .setTitle(
                        'Post Embed',
                    )
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
                            session
                                .interaction
                                .user.id &&
                        i.customId ===
                            makeId(
                                session,
                                'post_channel',
                            ),
                    time: SUBMENU_TIMEOUT,
                },
            ),
        );

    collector.on(
        'collect',
        async channelInteraction => {
            try {
                const channel =
                    channelInteraction
                        .channels.first();

                if (!channel) {
                    await channelInteraction
                        .reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle(
                                        'Invalid Channel',
                                    )
                                    .setDescription(
                                        'The selected channel could not be found.',
                                    )
                                    .setColor(
                                        getColor(
                                            'error',
                                        ),
                                    ),
                            ],
                            flags:
                                MessageFlags.Ephemeral,
                        })
                        .catch(
                            () => {},
                        );

                    return;
                }

                const me =
                    session.guild?.members
                        .me;

                const permissions =
                    me
                        ? channel.permissionsFor(
                              me,
                          )
                        : null;

                if (
                    !permissions?.has(
                        PermissionFlagsBits.SendMessages,
                    )
                ) {
                    await channelInteraction
                        .reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle(
                                        'Missing Permission',
                                    )
                                    .setDescription(
                                        `I don't have **Send Messages** permission in ${channel}.`,
                                    )
                                    .setColor(
                                        getColor(
                                            'error',
                                        ),
                                    ),
                            ],
                            flags:
                                MessageFlags.Ephemeral,
                        })
                        .catch(
                            () => {},
                        );

                    return;
                }

                if (
                    !permissions?.has(
                        PermissionFlagsBits.EmbedLinks,
                    )
                ) {
                    await channelInteraction
                        .reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle(
                                        'Missing Permission',
                                    )
                                    .setDescription(
                                        `I don't have **Embed Links** permission in ${channel}.`,
                                    )
                                    .setColor(
                                        getColor(
                                            'error',
                                        ),
                                    ),
                            ],
                            flags:
                                MessageFlags.Ephemeral,
                        })
                        .catch(
                            () => {},
                        );

                    return;
                }

                const embed =
                    buildPreviewEmbed(
                        session.state,
                    );

                await channel.send({
                    embeds: [embed],
                });

                await channelInteraction
                    .reply({
                        embeds: [
                            successEmbed(
                                'Embed Sent',
                                `Your embed has been posted to ${channel}.`,
                            ),
                        ],
                        flags:
                            MessageFlags.Ephemeral,
                    })
                    .catch(
                        () => {},
                    );

                collector.stop(
                    'completed',
                );
            } catch (error) {
                logger.error(
                    'Embed builder post failed:',
                    error,
                );

                if (
                    !channelInteraction.replied &&
                    !channelInteraction.deferred
                ) {
                    await channelInteraction
                        .reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle(
                                        'Failed to Post',
                                    )
                                    .setDescription(
                                        'I could not send the embed to that channel.',
                                    )
                                    .setColor(
                                        getColor(
                                            'error',
                                        ),
                                    ),
                            ],
                            flags:
                                MessageFlags.Ephemeral,
                        })
                        .catch(
                            () => {},
                        );
                }
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

    const json =
        JSON.stringify(
            buildPreviewEmbed(
                session.state,
            ).toJSON(),
            null,
            2,
        );

    if (json.length <= 3900) {
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        'Embed JSON',
                    )
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
                .setTitle(
                    'Embed JSON',
                )
                .setDescription(
                    'The JSON is too large to display here, so it has been attached as a file.',
                )
                .setColor(
                    getColor('info'),
                ),
        ],
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
            createSessionKey(
                interaction,
            );

        try {
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
                guild:
                    interaction.guild,
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

            if (
                !interaction.channel
            ) {
                stopSession(
                    session,
                    'no_channel',
                );

                activeSessions.delete(
                    sessionKey,
                );

                return;
            }

            const mainCollector =
                registerCollector(
                    session,
                    interaction.channel.createMessageComponentCollector(
                        {
                            componentType:
                                ComponentType.StringSelect,

                            filter: component =>
                                component.user
                                    .id ===
                                    interaction
                                        .user
                                        .id &&
                                component.customId ===
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
                    if (
                        !session.active
                    ) {
                        await component
                            .deferUpdate()
                            .catch(
                                () => {},
                            );
                        return;
                    }

                    try {
                        const action =
                            component
                                .values[0];

                        switch (action) {
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

                            case 'field_manage':
                                await handleFieldManage(
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
                            'Embed builder collector error:',
                            error,
                        );

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

                        const message =
                            error instanceof
                            TitanBotError
                                ? error.userMessage ||
                                  'An error occurred.'
                                : 'An unexpected error occurred.';

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
                    session.busy =
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
                        reason ===
                            'time' ||
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
