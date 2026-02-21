# Mustafa Travel – AWS deployment checklist

## 1. Build the frontend after every pull

**You must run `npm run build` after `git pull`.**  
`vite preview` serves from the `dist/` folder. If you don’t build, the server keeps serving the old bundle and the dashboard (and any new code) won’t update.

On the server:

```bash
cd /var/www/mustafatravel/frontend
git pull
npm ci --omit=dev    # or npm install if you don't use ci
npm run build        # ← required so dashboard and latest code are in dist/
pm2 restart frontend
```

## 2. Nginx – match Marwah (working) config

Use the same `location /api` pattern and headers as on the Marwah instance so behavior is identical.

Edit the site config:

```bash
sudo nano /etc/nginx/sites-available/booking
```

**Replace the `location /api/` block** with this (same style as Marwah):

```nginx
    # BACKEND (Node.js API) – same pattern as Marwah
    location /api {
        proxy_pass http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header Origin $http_origin;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
```

Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 3. PM2 – what to run

- **Frontend:** after `npm run build`, run `vite preview` (or your `start` script) so it serves the built app from `dist/`.
- **Backend:** Node app on port 7000.

Example PM2 start (if you’re not using a config file):

```bash
# From /var/www/mustafatravel/frontend (after npm run build)
pm2 start npm --name frontend -- run start

# From /var/www/mustafatravel/backend
pm2 start server.js --name backend
```

## 4. If the dashboard still shows 0

1. Confirm a **new build** was deployed: check `dist/assets/*.js` modification time after `npm run build`.
2. In the browser on the dashboard page: **F12 → Network** → find the request to `.../api/bookings` or `.../api/bookings/my` → check **Status** and **Response** (array of bookings or error).
3. Confirm the backend on 7000 is the **Mustafa** backend (this app’s API), not another app.
