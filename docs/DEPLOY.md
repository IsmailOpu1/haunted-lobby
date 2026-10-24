# Running and Deploying Haunted Lobby

## 1. Run it on your own PC

```bash
npm install
npm run dev
```

This starts two things:

- the **game server** on port 2567
- the **web client** on port 5173

Open http://localhost:5173, type a name and press **Create room**. Open a second browser tab with the invite link (or type the room code) and join with another name. Click the scene in each tab to play: you see the other player's body and flashlight move.

Note: browsers pause games in hidden tabs. Put the two tabs side by side in two windows to watch both at once.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs all tests |
| `npm run typecheck` | Checks TypeScript in every package |
| `npm run build` | Builds the web client into `client/dist` |

## 2. Test with a second computer on the same Wi-Fi

1. Run `npm run dev` on your PC. Vite prints a **Network** address, for example `http://192.168.0.100:5173`.
2. On the second computer (same Wi-Fi), open that address.
3. If it doesn't load, Windows Firewall is blocking it. Allow **Node.js** on private networks when Windows asks, or allow ports 5173 and 2567.
4. Create a room on one computer and join with the code on the other.

## 3. Put the game online: Railway (server) + Vercel (website)

This is the easiest way for friends on other networks to play. Both have free or cheap plans, and both give you secure `https://` / `wss://` addresses automatically. Vercel cannot run the game server itself (it does not keep connections open), which is why the server goes on Railway.

You create the accounts and approve the GitHub access yourself. Both sign in with your GitHub account.

### 3.1 Game server on Railway

1. Go to https://railway.com and sign in with GitHub.
2. **New Project → Deploy from GitHub repo →** pick `IsmailOpu1/haunted-lobby`.
3. Open the service's **Settings**:
   - **Build command:** `npm ci`
   - **Start command:** `npm start`
   - **Region:** the one closest to Bangladesh (for example Singapore / Southeast Asia).
4. Under **Networking**, press **Generate Domain**. You get an address like `haunted-lobby-production.up.railway.app`.
5. Check it: open `https://<that-address>/health` in a browser. It should show `{"ok":true}`.

Railway sets the `PORT` variable itself, and the server already reads it.

### 3.2 Website on Vercel

1. Go to https://vercel.com and sign in with GitHub.
2. **Add New → Project →** import `IsmailOpu1/haunted-lobby`.
3. Settings on the import screen:
   - **Root Directory:** `client`
   - **Framework Preset:** Vite (usually detected automatically)
   - **Environment Variable:** `VITE_SERVER_URL` = `wss://<your-railway-address>` (the address from step 3.1, starting with `wss://`, no `/health`)
4. Press **Deploy**. You get an address like `haunted-lobby.vercel.app`.
5. Open it, create a room, and send the invite link to a friend. **This is the Phase 1 "Done when" test.**

Every `git push` to GitHub redeploys both automatically.

## 4. Alternative: the game server on your own VPS

Use this instead of Railway if you want full control. A plain VPS needs extra setup for `wss://` (a domain and a certificate) before a Vercel website can connect to it. Until then, run the client from your own PC as in step 4.3.

This lets friends anywhere join. You need a small Linux server (VPS). The PRD's default is **one VPS in Singapore or Mumbai** (closest to Bangladesh). Any provider works, for example DigitalOcean, Vultr, Linode/Akamai or Hetzner. The smallest plan (1 vCPU, 1 GB RAM) is enough for testing.

Choose **Ubuntu 24.04** when creating it. You will get an **IP address** and a way to log in (SSH).

### 4.1 Install Node.js and the game

Log in to the VPS with SSH, then run:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
git clone https://github.com/IsmailOpu1/haunted-lobby.git
cd haunted-lobby
npm ci
```

### 4.2 Run the server as a service (restarts automatically)

```bash
sudo tee /etc/systemd/system/haunted-lobby.service > /dev/null <<EOF
[Unit]
Description=Haunted Lobby game server
After=network.target

[Service]
WorkingDirectory=$HOME/haunted-lobby
ExecStart=/usr/bin/npm start
Environment=PORT=2567
Restart=always
User=$USER

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now haunted-lobby
sudo ufw allow 2567/tcp
```

Check it works from your own PC by opening `http://<VPS-IP>:2567/health` in a browser. It should show `{"ok":true}`.

### 4.3 Connect the client to the VPS

On your PC, create the file `client/.env.local` with this line (use your VPS IP):

```
VITE_SERVER_URL=ws://<VPS-IP>:2567
```

Then run `npm run dev`. Now every room is created on the VPS. The Phase 0 **Done when** test: a friend on another network opens your client (or runs it themselves with the same `.env.local`), and you both join the same room by code.

### 4.4 Updating the server later

```bash
cd ~/haunted-lobby
git pull
npm ci
sudo systemctl restart haunted-lobby
```

## 5. Later (Phase 10)

For the public release the game gets its own domain name. Browsers block plain `ws://` connections from `https://` pages, so the server must always be reachable over `wss://` once the website is online.
