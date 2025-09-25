# Deploy Discord Sticker Bot to Render 🚀

This guide will help you deploy your Discord Sticker Bot to Render.com for free hosting.

## Prerequisites

1. **Discord Bot Created**: Make sure you have created a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications)
2. **GitHub Account**: Your code needs to be in a GitHub repository
3. **Render Account**: Sign up at [render.com](https://render.com)

## Step 1: Push Code to GitHub

1. Initialize git repository (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. Create a new repository on GitHub and push your code:
   ```bash
   git remote add origin https://github.com/yourusername/discord-sticker-bot.git
   git branch -M main
   git push -u origin main
   ```

## Step 2: Deploy to Render

### Method 1: Using Render Dashboard (Recommended)

1. **Connect GitHub**:
   - Log into [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" button
   - Select "Web Service"
   - Connect your GitHub account and select your repository

2. **Configure Service**:
   - **Name**: `discord-sticker-bot` (or any name you prefer)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free` (for testing, upgrade to Starter for 24/7 uptime)

3. **Set Environment Variables**:
   - In the service settings, go to "Environment" tab
   - Add these environment variables:
     ```
     DISCORD_TOKEN = your_bot_token_here
     CLIENT_ID = your_bot_client_id_here
     NODE_ENV = production
     ```
   - **Important**: Get these values from your Discord Developer Portal

4. **Deploy**:
   - Click "Create Web Service"
   - Render will automatically build and deploy your bot

### Method 2: Using render.yaml (Infrastructure as Code)

The project includes a `render.yaml` file that automatically configures the deployment.

1. **Push to GitHub** with the render.yaml file
2. **Import to Render**:
   - In Render Dashboard, click "New +" → "Blueprint"
   - Connect your repository
   - Render will read the `render.yaml` and create the service

3. **Set Environment Variables** in the Render dashboard after creation

## Step 3: Get Your Discord Bot Credentials

### Bot Token:
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to "Bot" section
4. Copy the "Token" (click "Reset Token" if needed)
5. **Keep this secret!**

### Client ID:
1. In the same application
2. Go to "General Information"
3. Copy the "Application ID"

## Step 4: Configure Environment Variables in Render

1. In your Render service dashboard
2. Go to "Environment" tab
3. Add these variables:
   ```
   Key: DISCORD_TOKEN
   Value: [Your bot token from Discord Developer Portal]
   
   Key: CLIENT_ID  
   Value: [Your application ID from Discord Developer Portal]
   
   Key: NODE_ENV
   Value: production
   ```
4. Click "Save Changes"

## Step 5: Invite Bot to Your Server

1. **Get Invite Link**:
   - After deployment, check your Render service logs
   - The bot will print an invite link when it starts
   - Or manually create: `https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=1073741824&scope=bot%20applications.commands`

2. **Required Permissions**:
   - Manage Emojis and Stickers
   - Use Slash Commands
   - Send Messages

## Step 6: Test Your Bot

After deployment, test these commands in your Discord server:

```
/add-sticker image:[upload an image] name:test_sticker
/copy-sticker sticker-id:123456789 name:copied_sticker
```

## Important Notes for Render Deployment

### Free Tier Limitations:
- **Sleep after 15 minutes** of inactivity
- **750 hours per month** (about 31 days)
- Bot will wake up when Discord sends a command

### Production Considerations:
- **Upgrade to Starter plan** ($7/month) for 24/7 uptime
- **Monitor logs** in Render dashboard for debugging
- **Environment variables** are managed through Render dashboard, not `.env` files

### Troubleshooting:

1. **Bot not responding**:
   - Check Render service logs for errors
   - Verify environment variables are set correctly
   - Ensure Discord bot token is valid

2. **Commands not appearing**:
   - Check that CLIENT_ID is correct
   - Bot needs to be invited with proper permissions

3. **File upload errors**:
   - Render has temporary file system
   - Bot downloads and processes files in memory (no persistent storage needed)

## Security Best Practices

- ✅ Never commit `.env` files to GitHub
- ✅ Use Render's environment variables for secrets
- ✅ Regenerate bot token if accidentally exposed
- ✅ Limit bot permissions to what's needed

## Monitoring Your Bot

- **Logs**: Check Render dashboard → Service → Logs
- **Status**: Bot will show "Managing stickers! 🎨" status when online
- **Uptime**: Monitor through Render dashboard

Your Discord Sticker Bot is now deployed and ready to use! 🎉