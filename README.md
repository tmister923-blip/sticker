# Discord Sticker Bot 🎨

A Discord bot that allows users to upload images/GIFs as stickers and copy stickers from other servers using their IDs.

## Features

- **Upload Images/GIFs as Stickers**: Convert any image or GIF to a server sticker
- **Copy Stickers by ID**: Copy stickers from other servers using their sticker ID
- **Format Support**: PNG, JPEG, GIF, and WebP formats
- **Permission Checks**: Requires "Manage Emojis and Stickers" permission
- **Error Handling**: Comprehensive error messages and validation

## Commands

### `/add-sticker`
Upload an image/GIF as a sticker to the current server.

**Parameters:**
- `image` (required): The image/GIF file to convert
- `name` (required): Name for the sticker (2-30 characters, letters/numbers/underscores only)
- `description` (optional): Description for the sticker

**Usage:**
```
/add-sticker image:my_image.png name:cool_sticker description:A cool sticker
```

### `/copy-sticker`
Copy a sticker from another server using its ID.

**Parameters:**
- `sticker-id` (required): The ID of the sticker to copy
- `name` (required): New name for the sticker (2-30 characters, letters/numbers/underscores only)
- `description` (optional): Description for the sticker

**Usage:**
```
/copy-sticker sticker-id:1234567890123456789 name:copied_sticker description:Copied from another server
```

## Setup Instructions

### 🚀 Quick Deploy to Render (Recommended)
For easy cloud hosting, see **[DEPLOY_TO_RENDER.md](./DEPLOY_TO_RENDER.md)** for step-by-step instructions.

**Why Render?**
- ✅ **Free hosting** for Discord bots
- ✅ **Automatic deployments** from GitHub
- ✅ **Built-in environment variables** (no .env files needed)
- ✅ **Automatic scaling** and SSL certificates
- ✅ **Easy monitoring** with built-in logs

### 💻 Local Development Setup

#### Prerequisites
1. **Node.js**: Download and install from [nodejs.org](https://nodejs.org/)
2. **Discord Application**: Create a bot application on [Discord Developer Portal](https://discord.com/developers/applications)

### Step 1: Create a Discord Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section
4. Click "Add Bot" and confirm
5. Copy the bot token (you'll need this later)
6. Go to the "General Information" section and copy the Application ID (Client ID)

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and add your bot credentials:
   ```
   DISCORD_TOKEN=your_actual_bot_token_here
   CLIENT_ID=your_actual_client_id_here
   ```

### Step 4: Invite Bot to Server
1. Go to Discord Developer Portal > Your App > OAuth2 > URL Generator
2. Select scopes: `bot` and `applications.commands`
3. Select permissions: `Manage Emojis and Stickers`
4. Copy the generated URL and open it to invite the bot to your server

Alternatively, when you run the bot, it will display an invite link in the console.

### Step 5: Run the Bot
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## File Size and Format Limitations

- **Maximum file size**: 500KB (Discord's limit for stickers)
- **Supported formats**: PNG, JPEG, GIF, WebP
- **Sticker name requirements**: 2-30 characters, letters/numbers/underscores only

## Permissions Required

Users need the "Manage Emojis and Stickers" permission to use the bot commands.

## How to Get Sticker IDs

To copy stickers from other servers, you need their sticker IDs. Here's how to get them:

1. **Using Discord's Developer Mode**:
   - Enable Developer Mode in Discord Settings > Advanced > Developer Mode
   - Right-click on a sticker and select "Copy Sticker ID"

2. **From Sticker URL**:
   - Sticker URLs look like: `https://media.discordapp.net/stickers/1234567890123456789.png`
   - The number part is the sticker ID

3. **Using the Bot**:
   - When you create a sticker with `/add-sticker`, the bot shows you the new sticker's ID

## Troubleshooting

### Common Issues

1. **"npm is not recognized"**
   - Install Node.js from [nodejs.org](https://nodejs.org/)
   - Restart your terminal after installation

2. **"Invalid token"**
   - Make sure your bot token is correct in the `.env` file
   - Don't share your bot token with anyone

3. **"Missing permissions"**
   - Make sure the bot has "Manage Emojis and Stickers" permission in your server
   - Users also need this permission to use the commands

4. **"File too large"**
   - Sticker files must be under 500KB
   - Use image compression tools to reduce file size

5. **"Maximum number of stickers reached"**
   - Discord servers have a limit on the number of custom stickers
   - Remove some existing stickers to make room for new ones

### Error Codes
- `30039`: Maximum number of stickers reached
- `50035`: Invalid image format or size
- `10060`: Unknown sticker ID

## Support

If you encounter issues:
1. Check that all prerequisites are installed
2. Verify your bot token and client ID are correct
3. Ensure proper permissions are set
4. Check file size and format requirements

## License

This project is licensed under the MIT License.