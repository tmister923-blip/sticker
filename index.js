const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const http = require('http');
const sharp = require('sharp');

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
            timeout: 10000,
            headers: {
                'User-Agent': 'Discord Bot'
            }
        });
        return Buffer.from(response.data);
    } catch (error) {
        throw new Error('Failed to download file');
    }
}

// Helper function to process sticker image according to Discord requirements
// Discord: Stickers must be exactly 320x320 pixels, static (JPG/PNG) or animated (APNG/GIF)
// Discord will auto-resize but we'll do it properly to ensure quality
async function processStickerImage(buffer, filename) {
    try {
        // Check if buffer is valid
        if (!buffer || buffer.length === 0) {
            throw new Error('Empty or invalid image buffer');
        }
        
        // Check file size (Discord limit is 512KB)
        if (buffer.length > 524288) {
            throw new Error('File too large (must be under 512KB)');
        }
        
        // Detect format using Sharp
        const image = sharp(buffer);
        const metadata = await image.metadata();
        
        console.log(`Original image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
        
        // Validate format (Discord supports: JPG, PNG, GIF, APNG)
        const supportedFormats = ['jpeg', 'jpg', 'png', 'gif'];
        if (!supportedFormats.includes(metadata.format)) {
            throw new Error(`Unsupported format: ${metadata.format}. Discord supports: JPG, PNG, GIF`);
        }
        
        let processedBuffer;
        let finalFormat = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
        
        if (metadata.format === 'gif') {
            // For GIFs, we need to preserve animation
            // Sharp can't resize animated GIFs properly, so we'll let Discord handle it
            // Just validate and pass through
            if (buffer.length > 524288) {
                throw new Error('Animated GIF too large (must be under 512KB)');
            }
            processedBuffer = buffer;
            console.log('Animated GIF detected - letting Discord handle resizing');
        } else {
            // For static images (JPG, PNG), resize to exactly 320x320
            processedBuffer = await image
                .resize(320, 320, {
                    fit: 'fill', // Discord requirement: exactly 320x320
                    background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background for PNG
                })
                .toFormat(metadata.format === 'jpeg' ? 'jpeg' : 'png')
                .toBuffer();
            
            console.log(`Resized to 320x320 pixels, format: ${finalFormat}`);
            
            // Check if processed image is still under 512KB
            if (processedBuffer.length > 524288) {
                // If still too large, compress further
                if (metadata.format === 'jpeg') {
                    processedBuffer = await sharp(processedBuffer)
                        .jpeg({ quality: 85 })
                        .toBuffer();
                } else {
                    processedBuffer = await sharp(processedBuffer)
                        .png({ compressionLevel: 9 })
                        .toBuffer();
                }
                console.log(`Compressed image to ${processedBuffer.length} bytes`);
            }
        }
        
        return { buffer: processedBuffer, format: finalFormat };
        
    } catch (error) {
        console.error('Image processing error:', error.message);
        throw new Error(`Failed to process image: ${error.message}`);
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

    // Check file type (Discord supports: JPG, PNG, APNG, GIF for stickers)
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
    if (!validTypes.includes(attachment.contentType)) {
        return await interaction.editReply({
            content: '❌ Invalid file type. Discord stickers support: **JPG, PNG, and GIF** formats only.',
        });
    }

    // Check file size (Discord limit is 512KB for stickers)
    if (attachment.size > 524288) {
        return await interaction.editReply({
            content: '❌ File too large. Sticker files must be under 512KB (Discord requirement).',
        });
    }

    try {
        // Download and process the image according to Discord requirements
        const rawBuffer = await downloadFile(attachment.url);
        const { buffer: imageBuffer, format } = await processStickerImage(rawBuffer, attachment.name);

        // Create the sticker with proper format using AttachmentBuilder
        const stickerAttachment = new AttachmentBuilder(imageBuffer, { 
            name: `${stickerName}.${format}`,
            description: stickerDescription
        });
        
        const sticker = await interaction.guild.stickers.create({
            file: stickerAttachment,
            name: stickerName,
            description: stickerDescription,
            tags: 'bot'
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
        // First, try to get sticker info from Discord API
        let stickerInfo;
        let imageBuffer;
        
        try {
            // Try to get sticker info first
            const response = await axios.get(`https://discord.com/api/v10/stickers/${stickerId}`, {
                headers: {
                    'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
                },
                timeout: 10000
            });
            stickerInfo = response.data;
        } catch (error) {
            // If can't get info, try direct download
            console.log('Could not get sticker info, trying direct download...');
        }
        
        // Try to download the sticker (Discord formats: PNG, JPG, GIF)
        const extensions = ['png', 'gif', 'jpg', 'jpeg'];
        let success = false;
        let detectedFormat = 'png';
        
        for (const ext of extensions) {
            try {
                const stickerUrl = `https://media.discordapp.net/stickers/${stickerId}.${ext}`;
                const rawBuffer = await downloadFile(stickerUrl);
                const processedImage = await processStickerImage(rawBuffer, `sticker.${ext}`);
                imageBuffer = processedImage.buffer;
                detectedFormat = processedImage.format;
                success = true;
                console.log(`Successfully downloaded and processed sticker with .${ext} extension`);
                break;
            } catch (e) {
                console.log(`Failed to process sticker as .${ext}:`, e.message);
                continue;
            }
        }
        
        if (!success) {
            return await interaction.editReply({
                content: '❌ Could not find or download the sticker with that ID. Make sure the ID is correct and the sticker is publicly accessible.',
            });
        }

        // Create the sticker with proper format using AttachmentBuilder
        const stickerAttachment = new AttachmentBuilder(imageBuffer, { 
            name: `${newName}.${detectedFormat}`,
            description: newDescription
        });
        
        const sticker = await interaction.guild.stickers.create({
            file: stickerAttachment,
            name: newName,
            description: newDescription,
            tags: 'copied'
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
