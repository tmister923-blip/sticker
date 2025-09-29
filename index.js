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

// Helper function to check if a buffer contains an animated image
async function checkIfAnimated(buffer) {
    try {
        // Check for GIF signature
        const gifSignature = [0x47, 0x49, 0x46, 0x38]; // "GIF8"
        const isGif = gifSignature.every((byte, index) => buffer[index] === byte);
        
        if (isGif) {
            // For GIFs, check if it's animated by looking for multiple image descriptors
            // Animated GIFs have multiple image descriptors (0x2C bytes)
            let imageDescriptorCount = 0;
            for (let i = 0; i < buffer.length - 1; i++) {
                if (buffer[i] === 0x2C) { // Image separator
                    imageDescriptorCount++;
                }
            }
            return imageDescriptorCount > 1; // More than one image = animated
        }
        
        // Check for APNG signature
        const apngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]; // PNG signature
        const isPng = apngSignature.every((byte, index) => buffer[index] === byte);
        
        if (isPng) {
            // Look for acTL chunk (animation control) in APNG
            const bufferString = buffer.toString('binary');
            return bufferString.includes('acTL');
        }
        
        return false;
    } catch (error) {
        console.log('Error checking animation:', error.message);
        return false;
    }
}

// Helper function to download file from URL
async function downloadFile(url) {
    try {
        console.log(`Downloading from URL: ${url}`);
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            maxRedirects: 5
        });
        
        if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const buffer = Buffer.from(response.data);
        console.log(`Downloaded ${buffer.length} bytes`);
        return buffer;
    } catch (error) {
        console.error(`Download failed for ${url}:`, error.message);
        throw new Error(`Failed to download file: ${error.message}`);
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
        // Discord stickers work better with PNG format, so convert JPEG to PNG
        let finalFormat = metadata.format === 'gif' ? 'gif' : 'png';
        
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
            // For static images (JPG, PNG), always convert to PNG and resize to 320x320
            console.log('Converting static image to PNG format...');
            processedBuffer = await image
                .resize(320, 320, {
                    fit: 'cover', // Better for preserving aspect ratio
                    position: 'center',
                    background: { r: 255, g: 255, b: 255, alpha: 1 } // White background
                })
                .png({ 
                    compressionLevel: 6,
                    quality: 90
                })
                .toBuffer();
            
            console.log(`Resized to 320x320 pixels, format: ${finalFormat}, size: ${processedBuffer.length} bytes`);
            
            // Check if processed image is still under 512KB
            if (processedBuffer.length > 524288) {
                console.log('PNG still too large, compressing further...');
                processedBuffer = await sharp(processedBuffer)
                    .png({ compressionLevel: 9 })
                    .toBuffer();
                console.log(`Final compressed size: ${processedBuffer.length} bytes`);
            }
        }
        
        // Debug: Log buffer info
        console.log(`Final buffer size: ${processedBuffer.length} bytes`);
        console.log(`Buffer starts with: [${Array.from(processedBuffer.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
        
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

        // Create the sticker using AttachmentBuilder (Discord.js v14 requirement)
        const stickerAttachment = new AttachmentBuilder(imageBuffer, {
            name: `${stickerName}.${format}`
        });
        
        const sticker = await interaction.guild.stickers.create({
            file: stickerAttachment,
            name: stickerName,
            description: stickerDescription
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
        // Get sticker info from Discord API to determine format and proper URL
        let stickerInfo;
        let imageBuffer;
        
        try {
            // Get sticker info from Discord API
            const response = await axios.get(`https://discord.com/api/v10/stickers/${stickerId}`, {
                headers: {
                    'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
                },
                timeout: 10000
            });
            stickerInfo = response.data;
            console.log(`Sticker info: format=${stickerInfo.format_type}, type=${stickerInfo.type}`);
        } catch (error) {
            console.log('Could not get sticker info from API:', error.message);
            return await interaction.editReply({
                content: '❌ Could not access sticker information. The sticker might be from a private server or the ID is invalid.',
            });
        }
        
        // Try to download the sticker using Discord's asset URL
        let success = false;
        let detectedFormat = 'png';
        
        // First, try to get the asset URL from Discord's API
        if (stickerInfo && stickerInfo.asset) {
            console.log(`Using Discord asset URL: ${stickerInfo.asset}`);
            try {
                const rawBuffer = await downloadFile(stickerInfo.asset);
                
                // Check if it's an animated format by examining the buffer
                const isAnimated = await checkIfAnimated(rawBuffer);
                
                if (isAnimated) {
                    // It's animated - preserve as GIF
                    if (rawBuffer.length > 524288) {
                        throw new Error('Animated sticker too large (must be under 512KB)');
                    }
                    
                    imageBuffer = rawBuffer; // Use original buffer to preserve animation
                    detectedFormat = 'gif';
                    console.log(`✅ Animated sticker detected - preserving animation (${rawBuffer.length} bytes)`);
                } else {
                    // It's static - process normally
                    const processedImage = await processStickerImage(rawBuffer, `sticker.png`);
                    imageBuffer = processedImage.buffer;
                    detectedFormat = processedImage.format;
                    console.log(`Successfully processed static sticker`);
                }
                
                success = true;
            } catch (e) {
                console.log(`Failed to download from asset URL:`, e.message);
            }
        }
        
        // Fallback: try direct URL patterns if asset URL doesn't work
        if (!success) {
            console.log('Asset URL failed, trying direct URL patterns...');
            
            // Try different URL patterns
            const urlPatterns = [
                `https://media.discordapp.net/stickers/${stickerId}.png`,
                `https://cdn.discordapp.com/stickers/${stickerId}.png`,
                `https://media.discordapp.net/stickers/${stickerId}.gif`,
                `https://cdn.discordapp.com/stickers/${stickerId}.gif`
            ];
            
            for (const stickerUrl of urlPatterns) {
                try {
                    console.log(`Trying sticker URL: ${stickerUrl}`);
                    const rawBuffer = await downloadFile(stickerUrl);
                    
                    // Check if it's an animated format
                    const isAnimated = await checkIfAnimated(rawBuffer);
                    
                    if (isAnimated) {
                        // It's animated - preserve as GIF
                        if (rawBuffer.length > 524288) {
                            throw new Error('Animated sticker too large (must be under 512KB)');
                        }
                        
                        imageBuffer = rawBuffer; // Use original buffer to preserve animation
                        detectedFormat = 'gif';
                        console.log(`✅ Animated sticker detected - preserving animation (${rawBuffer.length} bytes)`);
                    } else {
                        // It's static - process normally
                        const processedImage = await processStickerImage(rawBuffer, `sticker.png`);
                        imageBuffer = processedImage.buffer;
                        detectedFormat = processedImage.format;
                        console.log(`Successfully processed static sticker`);
                    }
                    
                    success = true;
                    break;
                } catch (e) {
                    console.log(`Failed to process sticker from ${stickerUrl}:`, e.message);
                    continue;
                }
            }
        }
        
        if (!success) {
            return await interaction.editReply({
                content: '❌ Could not find or download the sticker with that ID. Make sure the ID is correct and the sticker is publicly accessible.',
            });
        }

        // Create the sticker using AttachmentBuilder (Discord.js v14 requirement)
        const stickerAttachment = new AttachmentBuilder(imageBuffer, {
            name: `${newName}.${detectedFormat}`
        });
        
        const sticker = await interaction.guild.stickers.create({
            file: stickerAttachment,
            name: newName,
            description: newDescription
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
