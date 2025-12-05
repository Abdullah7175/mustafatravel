# Production Setup Guide

## Issues Fixed

1. **Vite processing .git files**: Updated `vite.config.ts` to properly exclude `.git` directory
2. **lucide-react optimization**: Removed from `exclude` list to allow proper optimization
3. **Production server**: Added `start` script to serve built files

## Production Deployment Steps

### Option 1: Using Vite Preview (Recommended for PM2)

1. **Build the application:**
   ```bash
   cd /var/www/mustafatravel/frontend
   npm run build
   ```

2. **Stop the current dev server:**
   ```bash
   sudo pm2 stop frontend
   sudo pm2 delete frontend
   ```

3. **Start with production preview:**
   ```bash
   sudo pm2 start "npm run start -- --host 0.0.0.0 --port 5173" --name frontend --time
   ```

   Or update your PM2 command to:
   ```bash
   sudo pm2 start "npm run start" --name frontend --time -- --host 0.0.0.0 --port 5173
   ```

### Option 2: Using Nginx (Best for Production)

1. **Build the application:**
   ```bash
   cd /var/www/mustafatravel/frontend
   npm run build
   ```

2. **Configure Nginx to serve the `dist` folder:**
   ```nginx
   server {
       listen 80;
       server_name booking.mustafatravelsandtour.com;

       root /var/www/mustafatravel/frontend/dist;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }

       location /api {
           proxy_pass http://localhost:7000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **Restart Nginx:**
   ```bash
   sudo nginx -t
   sudo systemctl restart nginx
   ```

## Troubleshooting

### If you still see .git file errors:

1. **Clear Vite cache:**
   ```bash
   rm -rf node_modules/.vite
   rm -rf dist
   ```

2. **Rebuild:**
   ```bash
   npm run build
   ```

3. **Verify .git is not being accessed:**
   ```bash
   # Check if there are any symlinks pointing to .git
   find . -type l -ls | grep git
   ```

### If lucide-react icons fail to load:

1. **Clear node_modules and reinstall:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Rebuild:**
   ```bash
   npm run build
   ```

## Current PM2 Configuration

The current PM2 command runs the dev server. For production, you should:

1. Build first: `npm run build`
2. Use preview: `npm run start` (serves the built files)
3. Or use Nginx to serve the `dist` folder directly

## Environment Variables

Make sure your production environment has the correct API endpoints configured in your code.
