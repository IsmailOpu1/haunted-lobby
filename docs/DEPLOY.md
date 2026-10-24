# Running and Deploying Haunted Lobby

## 1. Run it on your own PC

```bash
npm install
npm run dev
```

This starts two things:

- the **game server** on port 2567
- the **web client** on port 5173

Open http://localhost:5173, type a name and press **Create room**. Open a second browser tab with the invite link (or type the room code) and join with another name. Both tabs show both players and the join messages.

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

## 3. Put the game server on a VPS (Phase 0 deploy step)

This lets friends anywhere join. You need a small Linux server (VPS). The PRD's default is **one VPS in Singapore or Mumbai** (closest to Bangladesh). Any provider works, for example DigitalOcean, Vultr, Linode/Akamai or Hetzner. The smallest plan (1 vCPU, 1 GB RAM) is enough for testing.

Choose **Ubuntu 24.04** when creating it. You will get an **IP address** and a way to log in (SSH).

### 3.1 Install Node.js and the game

Log in to the VPS with SSH, then run:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
git clone https://github.com/IsmailOpu1/haunted-lobby.git
cd haunted-lobby
npm ci
```

### 3.2 Run the server as a service (restarts automatically)

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

### 3.3 Connect the client to the VPS

On your PC, create the file `client/.env.local` with this line (use your VPS IP):

```
VITE_SERVER_URL=ws://<VPS-IP>:2567
```

Then run `npm run dev`. Now every room is created on the VPS. The Phase 0 **Done when** test: a friend on another network opens your client (or runs it themselves with the same `.env.local`), and you both join the same room by code.

### 3.4 Updating the server later

```bash
cd ~/haunted-lobby
git pull
npm ci
sudo systemctl restart haunted-lobby
```

## 4. Later (Phase 10)

For the public release the client will be hosted as a website, and the server will get a domain and HTTPS (`wss://`). Browsers block plain `ws://` connections from `https://` pages, so this is required before sharing the game publicly.
