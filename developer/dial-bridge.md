# Dial bridge — clicking a phone number in the CRM

Every phone number in the CRM renders as a plain `tel:` link. What happens when
you click one depends on the workstation, so there are two paths and the page
picks between them on load.

**The browser's own `tel:` handler.** Works out of the box on Windows (Phone
Link, Skype or Teams, whichever is registered) and macOS (FaceTime, which places
the call through a paired iPhone). On Linux there is usually no handler
registered at all, so the click does nothing.

**The dial bridge** (`developer/kdeconnect-bridge.mjs`). A small daemon on
`127.0.0.1:8765` that hands the number to a phone paired over KDE Connect. This
is what makes the links work on Linux, and it also works on Windows and macOS if
you would rather dial from your own handset than through whatever the OS
registered.

The CRM asks the bridge once per page load whether it is running:

- **answering** → the click goes to the bridge, and your paired phone dials
- **not answering** → the click is left alone and the OS handles the `tel:` link

So the bridge is optional on Windows and macOS, and effectively required on
Linux. Nothing breaks when it is absent; the call just takes the other path.

## Install

1. **KDE Connect**
   - Linux: `sudo apt install kdeconnect` (or your distribution's package)
   - Windows: the KDE Connect app from the Microsoft Store
   - macOS: `brew install --cask kdeconnect` — note that the macOS build is the
     least maintained of the three. FaceTime via the `tel:` fallback is usually
     the better route on a Mac.
2. **The KDE Connect app on your phone**, from the Play Store or App Store.
3. **Pair them.** Both devices must be on the same network. Confirm with
   `kdeconnect-cli --list-devices`; you want `(paired and reachable)`.

## Run it

```
pnpm run dial:bridge
```

It prints the platform and the `kdeconnect-cli` path it resolved, so a wrong
path is visible immediately. Check it from another terminal:

```
curl http://127.0.0.1:8765/health
{"ok":true,"platform":"linux","cli":"/usr/bin/kdeconnect-cli","device":"0bc9…","error":null}
```

`ok: false` comes with an `error` saying whether the CLI could not be found or
the phone is not reachable — they need different fixes.

## Run it at login

**Linux** — `~/.config/systemd/user/kdeconnect-bridge.service`:

```ini
[Unit]
Description=CRM dial bridge
After=graphical-session.target

[Service]
ExecStart=/usr/bin/node %h/dev/projects/bytestreams/bytestreams_info/developer/kdeconnect-bridge.mjs
Restart=on-failure

[Install]
WantedBy=default.target
```

```
systemctl --user enable --now kdeconnect-bridge
```

**Windows** — save as `dial-bridge.vbs` and put a shortcut to it in
`shell:startup` (Win+R → `shell:startup`). The VBScript wrapper is only there to
keep a console window from appearing:

```vbs
CreateObject("WScript.Shell").Run "node ""C:\path\to\bytestreams_info\developer\kdeconnect-bridge.mjs""", 0, False
```

**macOS** — `~/Library/LaunchAgents/ai.bytestreams.dial-bridge.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Label</key><string>ai.bytestreams.dial-bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/you/dev/projects/bytestreams/bytestreams_info/developer/kdeconnect-bridge.mjs</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
```

```
launchctl load ~/Library/LaunchAgents/ai.bytestreams.dial-bridge.plist
```

## Troubleshooting

**`kdeconnect-cli not found`** — the bridge guesses the usual install paths per
platform. Point it at yours:

```
KDECONNECT_CLI="C:\Program Files\KDE Connect\bin\kdeconnect-cli.exe" node developer/kdeconnect-bridge.mjs
```

**`No paired device reachable`** — phone and workstation must be on the same
network, and some networks block the peer-to-peer discovery KDE Connect needs.
`kdeconnect-cli --list-devices` is the check; fix it there, not here.

**Clicks do nothing on Linux with the bridge stopped** — expected. There is no
`tel:` handler to fall back to. Start the bridge.

**Clicks open the wrong app on Windows** — that is the OS `tel:` association,
not this code. Settings → Apps → Default apps → Choose defaults by link type →
`TEL`. Or run the bridge, which bypasses the association entirely.

**Origins** — the bridge only answers requests from the origins listed in
`ALLOWED_ORIGINS` at the top of `kdeconnect-bridge.mjs`. Add yours if you serve
the intranet from somewhere else.
