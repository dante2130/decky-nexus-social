# Nexus Social

A Decky Loader plugin for Xbox social features in Steam Gaming Mode.

- **Friends** shows gamerpics and Xbox activity, groups friends by presence, refreshes every 30 seconds in the background after the first successful load, searches by gamertag, and manages friend requests, favorites, removals, and blocks.
- **Messages** uses friend-style inbox rows with one-line previews and opens each conversation in a chat-bubble window. Use **Refresh** in the conversation window to check for new replies.
- **Party** creates an invite-only or friends-joinable Xbox voice party, invites friends, and shows the roster. The microphone starts muted. Select **Enable microphone** to speak, and **Leave party** to disconnect.

The last successful friends list appears immediately when you reopen the panel during the same Decky session. The cached list is read-only while Nexus refreshes your account and roster.
Friends hosting a verified joinable Xbox party show a headset and a **Join party** action in their row menu.

## Install and connect

1. Install Decky Loader and Xodus Nexus on the same SteamOS account. Sign in to Xbox in Xodus Nexus and install its backend. Nexus Social discovers the backend from `~/.config/xodus-nexus/xodus-backends/current.json`. It requires a backend with the `native-social listen`, `people`, and `party` commands.
2. Enable Developer Mode in Decky settings and use **Install Plugin from ZIP File** to select `NexusSocial.zip`.
3. Press the **Steam** button and select **Nexus Social** to open its full-width popup. You can also open it from the Decky quick-access panel. If needed, select **Connect with Nexus sign-in**. Xodus Nexus can be closed once its backend and sign-in are set up.
4. For voice, open **Party** and select **Create invite-only party** or **Create public party (joinable by friends)**. Xbox applies its friends and privacy rules to the public option. The Gaming Mode status bar shows a clickable headset with a member-count badge when voice connects. Party profiles highlight active speakers. Open **View party chat** to read and send live party messages. Steam notifications report party creation, departures, joins, and incoming messages. Once connected, invite a friend and enable the microphone. If Steam blocks playback, use **Enable party audio**. Leave any party active on another device before creating a new one.

Friend rows show a PC or Xbox console icon when presence includes a recognized device. The profile header shows your gamerpic, gamertag, gamerscore, and Xbox presence, with icon controls for Friends, Messages, Party, and Refresh.

Select the **Settings** gear next to **Refresh** to show or hide the Steam menu entry and choose its position. You can also highlight **Nexus Social** in the Steam menu and press **X** to change its position.

If the xCloud region lookup is denied, the bundled backend uses the West Europe relay. This is the relay fallback verified with the existing Xbox sign-in.

Device icons require a Nexus backend that reports device presence. The ZIP built for this workstation bundles an updated Linux x86-64 CLI and its source. Its binary uses the workstation's glibc 2.39 or newer and OpenSSL 4. For other systems, build the plugin without a bundled CLI and use an updated Nexus backend for that system.

The Decky backend launches the Nexus CLI as the Steam user and keeps the Xbox chat socket key in the backend. Steam's web view handles WebRTC audio. Xbox communications and privacy checks are enforced by the Nexus backend. The plugin depends on Nexus's Xbox service integration, so live compatibility can change with Xbox service updates.

## Build

With Node.js, pnpm, and Python 3.11 or newer:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
python3 -m pip install --no-deps --target vendor -r requirements.txt
python3 package_plugin.py
```

The ZIP includes the Python WebSocket dependency and the compiled Decky frontend. The voice client was adapted from Xodus Nexus and retains its MIT license.

See [Nexus backend changes](backend/README.md) for the source patch used by this plugin.

To bundle a locally built CLI, use `python3 package_plugin.py --backend /path/to/xodus-cli --backend-source /path/to/nexus-backend`. The bundled binary reads the existing Xodus Nexus sign-in and runs as the Steam user.
