const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const http = require('http');

// Load environment variables (dotenv for local development, Render uses built-in env vars)
try {
    require('dotenv').config();
} catch (error) {
    // dotenv not available in production, that's fine
    console.log('Running without dotenv (production environment)');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildEmojisAndStickers
    ]
});

// Commands
const commands = [
    new SlashCommandBuilder()
        .setName('add-sticker')
        .setDescription('Upload an image/GIF as a sticker to this server')
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('The image/GIF to convert to a sticker')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name for the sticker (2-30 characters)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description for the sticker (optional)')
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('copy-sticker')
        .setDescription('Copy a sticker from another server using its ID')
        .addStringOption(option =>
            option.setName('sticker-id')
                .setDescription('The ID of the sticker to copy')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('New name for the sticker (2-30 characters)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description for the sticker (optional)')
                .setRequired(false))
];

// Helper function to validate sticker name
function validateStickerName(name) {
    const regex = /^[a-zA-Z0-9_]{2,30}$/;
    return regex.test(name);
}

// Helper function to check if user has permission to manage stickers
function hasManageStickersPermission(member) {
    return member.permissions.has('ManageEmojisAndStickers');
}

// Helper function to download file from URL
async function downloadFile(url) {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000
        });
        return Buffer.from(response.data);
    } catch (error) {
        throw new Error('Failed to download file');
    }
}

client.once('ready', () => {
    console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
    console.log(`🔗 Invite link: https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=1073741824&scope=bot%20applications.commands`);
    
    // Set bot status
    client.user.setActivity('Managing stickers! 🎨', { type: 'WATCHING' });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
        if (commandName === 'add-sticker') {
            await handleAddSticker(interaction);
        } else if (commandName === 'copy-sticker') {
            await handleCopySticker(interaction);
        }
    } catch (error) {
        console.error('Error handling command:', error);
        const errorMessage = '❌ An error occurred while processing your request. Please try again.';
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});

async function handleAddSticker(interaction) {
    await interaction.deferReply();

    // Check permissions
    if (!hasManageStickersPermission(interaction.member)) {
        return await interaction.editReply({
            content: '❌ You need the "Manage Emojis and Stickers" permission to use this command.',
        });
    }

    const attachment = interaction.options.getAttachment('image');
    const stickerName = interaction.options.getString('name');
    const stickerDescription = interaction.options.getString('description') || 'Added via bot';

    // Validate sticker name
    if (!validateStickerName(stickerName)) {
        return await interaction.editReply({
            content: '❌ Sticker name must be 2-30 characters long and contain only letters, numbers, and underscores.',
        });
    }

    // Check file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(attachment.contentType)) {
        return await interaction.editReply({
            content: '❌ Invalid file type. Please upload a PNG, JPEG, GIF, or WebP image.',
        });
    }

    // Check file size (Discord limit is 500KB for stickers)
    if (attachment.size > 500000) {
        return await interaction.editReply({
            content: '❌ File too large. Sticker files must be under 500KB.',
        });
    }

    try {
        // Download the image
        const imageBuffer = await downloadFile(attachment.url);

        // Create the sticker
        const sticker = await interaction.guild.stickers.create({
            file: imageBuffer,
            name: stickerName,
            description: stickerDescription,
            tags: '🎨'
        });

        await interaction.editReply({
            content: `✅ Successfully created sticker **${stickerName}**!\nSticker ID: \`${sticker.id}\``,
        });

    } catch (error) {
        console.error('Error creating sticker:', error);
        let errorMessage = '❌ Failed to create sticker. ';
        
        if (error.code === 30039) {
            errorMessage += 'This server has reached the maximum number of stickers.';
        } else if (error.code === 50035) {
            errorMessage += 'Invalid image format or size.';
        } else {
            errorMessage += 'Please check the image format and size.';
        }

        await interaction.editReply({ content: errorMessage });
    }
}

async function handleCopySticker(interaction) {
    await interaction.deferReply();

    // Check permissions
    if (!hasManageStickersPermission(interaction.member)) {
        return await interaction.editReply({
            content: '❌ You need the "Manage Emojis and Stickers" permission to use this command.',
        });
    }

    const stickerId = interaction.options.getString('sticker-id');
    const newName = interaction.options.getString('name');
    const newDescription = interaction.options.getString('description') || 'Copied via bot';

    // Validate sticker name
    if (!validateStickerName(newName)) {
        return await interaction.editReply({
            content: '❌ Sticker name must be 2-30 characters long and contain only letters, numbers, and underscores.',
        });
    }

    try {
        // Try to fetch the sticker from Discord's API
        const stickerUrl = `https://media.discordapp.net/stickers/${stickerId}.png?size=160`;
        
        // Try PNG first, if it fails, try the original format
        let imageBuffer;
        try {
            imageBuffer = await downloadFile(stickerUrl);
        } catch (error) {
            // Try with different extensions
            const extensions = ['gif', 'webp', 'jpg'];
            let success = false;
            
            for (const ext of extensions) {
                try {
                    const alternateUrl = `https://media.discordapp.net/stickers/${stickerId}.${ext}?size=160`;
                    imageBuffer = await downloadFile(alternateUrl);
                    success = true;
                    break;
                } catch (e) {
                    continue;
                }
            }
            
            if (!success) {
                return await interaction.editReply({
                    content: '❌ Could not find or download the sticker with that ID. Make sure the ID is correct.',
                });
            }
        }

        // Create the sticker
        const sticker = await interaction.guild.stickers.create({
            file: imageBuffer,
            name: newName,
            description: newDescription,
            tags: '📋'
        });

        await interaction.editReply({
            content: `✅ Successfully copied sticker as **${newName}**!\nOriginal ID: \`${stickerId}\`\nNew ID: \`${sticker.id}\``,
        });

    } catch (error) {
        console.error('Error copying sticker:', error);
        let errorMessage = '❌ Failed to copy sticker. ';
        
        if (error.code === 30039) {
            errorMessage += 'This server has reached the maximum number of stickers.';
        } else if (error.code === 10060) {
            errorMessage += 'Unknown sticker ID.';
        } else {
            errorMessage += 'Please check if the sticker ID is valid and accessible.';
        }

        await interaction.editReply({ content: errorMessage });
    }
}

// Register slash commands
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('🔄 Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

// Create HTTP server for Render (required for web service)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: client.user ? client.user.tag : 'Starting...',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    }));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 HTTP server listening on port ${PORT}`);
});

// Login and register commands
if (process.env.DISCORD_TOKEN && process.env.CLIENT_ID) {
    client.login(process.env.DISCORD_TOKEN);
    registerCommands();
} else {
    console.error('❌ Please set DISCORD_TOKEN and CLIENT_ID in your .env file');
}
