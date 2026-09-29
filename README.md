# Sticky Dock 🍓

A cute floating sticky note that lives on the edge of your screen. It stays
tucked away as a thin strip while you work, pops open when you click it, and
keeps all your notes safely on your own computer — no accounts, no internet.

This guide is written for someone who is **not** a programmer. Every command
you need to type is spelled out.

---

## 🍎 On a Mac — start here

The Windows `.exe` installer will not run on a Mac. Use one of these instead.

### Easiest: download the ready-made Mac app

1. Download **`Sticky-Dock-mac.zip`** and double-click it to unzip. You get
   **`Sticky Dock.app`**.
2. Drag **`Sticky Dock.app`** into your **Applications** folder.
3. Because the app isn't from the App Store, macOS guards it the first time.
   Open the **Terminal** app (press `Cmd + Space`, type `Terminal`, Enter) and
   paste this one line, then press Enter:

   ```
   xattr -cr "/Applications/Sticky Dock.app"
   ```

   That just tells your Mac the app is safe to open. You only do it once.
4. Now open **Sticky Dock** from Applications (or Launchpad). A pink strip
   appears on the right edge of your screen.
5. The Mac build is a **universal** app: it runs natively on both Apple-chip
   (M1/M2/M3/M4) and Intel Macs, so no Rosetta is needed.

On a Mac the strawberry lives in the **menu bar** at the top-right (near the
clock) instead of the Windows tray. Click it for open / pin / start-at-login /
quit. The app stays out of the Dock on purpose.

### Or: make your own `.dmg` on your Mac

A `.dmg` can only be created on a Mac, so I can't pre-make one for you — but your
Mac can, in three steps. First install Node.js (see the next section), then:

```
cd ~/Desktop/sticky-dock
npm install
npm run build
```

When it finishes, open the new **`dist`** folder — inside is
**`Sticky Dock-1.0.0.dmg`**. Double-click it, drag Sticky Dock into Applications,
done. (This route matches your Mac's chip automatically and needs no Terminal
tricks afterward.)

---

## What you need first: Node.js

Node.js is a free program that lets Sticky Dock run and lets you build the
installer. You only need it on the computer where you **build** the app; once
the installer is made, the app itself runs without it.

1. Press the Windows key, type `cmd`, and open **Command Prompt**.
2. Type this and press Enter:

   ```
   node --version
   ```

3. If you see a version number like `v22.3.0`, you already have it — skip ahead.
4. If it says *"'node' is not recognized"*, go to **https://nodejs.org**,
   download the button that says **LTS**, run the installer (keep clicking
   Next), then **close and reopen** Command Prompt and try step 2 again.

---

## How to run the app (to try it out)

1. Put the `sticky-dock` folder somewhere easy, like your Desktop.
2. Open Command Prompt and go into the folder. If it's on your Desktop:

   ```
   cd %USERPROFILE%\Desktop\sticky-dock
   ```

3. The first time only, install the building blocks the app needs:

   ```
   npm install
   ```

   (This downloads some files and takes a couple of minutes. You only do it once.)

4. Start the app:

   ```
   npm start
   ```

A pink strip appears on the right edge of your screen. Click it to open your
first note. To stop the app while it's running this way, come back to Command
Prompt and press `Ctrl + C`.

---

## How to build the installer (.exe)

This makes a normal Windows installer you can double-click, so the app starts
with Windows and appears in your Start menu — no Command Prompt needed afterward.

1. In the `sticky-dock` folder (see above), run:

   ```
   npm install
   ```

   (Skip this if you already did it.)

2. Then run:

   ```
   npm run build
   ```

3. When it finishes, open the new **`dist`** folder inside `sticky-dock`. Inside
   you'll find a file named something like **`Sticky-Dock-Setup.exe`**.
4. Double-click that file to install Sticky Dock like any normal program.

---

## Building the Mac version (.dmg)

The app also runs on macOS, but a Mac installer (`.dmg`) **can only be built on a
Mac** — Apple's tools for making one don't exist on Windows or Linux. There's no
way around this: making a Mac app needs a Mac.

If you have access to a Mac:

1. Copy the `sticky-dock` folder onto the Mac.
2. Make sure Node.js is installed (same check as above: `node --version` in the
   Terminal app; if missing, get the LTS from **nodejs.org**).
3. In Terminal, go into the folder, e.g. `cd ~/Desktop/sticky-dock`.
4. Run `npm install` (first time only), then:

   ```
   npm run build:mac
   ```

5. The `.dmg` appears in the new **`dist`** folder. Open it and drag Sticky Dock
   to Applications.

On a Mac, Sticky Dock lives in the **menu bar** (top-right, near the clock)
instead of the system tray, and has no Dock icon — it behaves the same
otherwise. The first time you open it, macOS may say it's from an
"unidentified developer"; right-click the app and choose **Open** to allow it
(normal for any app not sold through the App Store).

Note: since I can't run a Mac here, the Mac build is set up but untested — if
anything looks off on macOS, tell me and I'll fix it.

## Where your notes are stored

Your notes live in a folder on your own computer:

```
C:\Users\<your name>\AppData\Roaming\Sticky Dock
```

The quickest way to open it: open Sticky Dock, click the **gear** icon, and
choose **open data folder**.

Inside you'll find:

- `notes.json` — all your notes and your list of recently deleted notes.
- `state.json` — your settings, window size and positions.
- `backups\` — the last 5 saved copies of your notes, kept automatically. If
  your notes file is ever damaged, the app restores from the newest backup on
  its own and tells you it did.

Nothing is ever sent anywhere. It all stays on your machine.

---

## How to reset everything (start fresh)

If you ever want to wipe all notes and settings and start over:

1. Close Sticky Dock completely: find the little strawberry icon in the system
   tray (bottom-right of the taskbar, you may need to click the small `^`
   arrow), right-click it, and choose **Quit Sticky Dock**.
2. Open the data folder (see the path above — you can paste it into the File
   Explorer address bar).
3. Delete the whole **Sticky Dock** folder.
4. Start Sticky Dock again. It begins fresh with one empty note.

To keep a copy of your notes before resetting, first use **Settings → export all
notes**, which saves everything as a plain text file wherever you choose.

---

## A quick tour

- **Pick your design**: the very first time you open Sticky Dock it asks you to
  pick a note design (strawberry cat, cherry, panda, orange, tap-tap, or fruit
  pets). You can change it any time from **Settings → change design**. Your
  choice sticks and colours the whole note (and the little edge strip) to match.
- **The strip** on the screen edge: click to open, drag up/down to move it.
- **Move the whole note**: grab the **top bar** (next to the title) and drag —
  the note follows your mouse and stays wherever you drop it, even across
  monitors. (Clicks on the buttons and double-click-to-rename still work.)
- **Notes or a to-do list**: the little **notes / to-do toggle** in the row above
  the writing area switches the current note between free typing and a checklist.
  In to-do mode, press `Enter` to start a new task, click a circle to tick it
  off, and the footer shows how many you've done. You can flip a note back to
  free notes whenever you like — nothing is lost.
- **Pin button** (top-left of the note): when on (filled accent colour), the
  note stays open and on top of everything until you tuck it away. When off, the
  note tucks itself away when you click elsewhere or press `Esc`.
- **Title**: double-click it to rename. Leave it alone and it uses the note's
  first line (or first task).
- **Search bar**: finds any word across all your notes and pages. Click a result
  to jump straight to it — the note-selector chip updates to show where you
  landed.
- **`+` button**: makes a new note. The **trash** button deletes the current one
  (it goes to *recently deleted* for 30 days, in case you change your mind).
- **Pages**: just keep typing — when a page fills up, the next one is made for
  you. The arrows at the bottom (or `Ctrl + PageUp` / `Ctrl + PageDown`) flip
  between pages.
- **Resize**: drag the bottom-right corner. It stays square and remembers the
  size.
- **Global shortcut**: press `Ctrl + Alt + N` anywhere to open or close the note.
  You can change this in Settings.
- **Tray icon** (near the clock): right-click for open, pin,
  launch-at-startup and quit.

---

## Rebuilding after I change the code for you

If you ask me to change something later, you'll get an updated `sticky-dock`
folder. To see the changes:

- To just try them: `npm start`
- To make a fresh installer: `npm run build`, then install the new file from the
  `dist` folder (it updates the installed app).

That's it. Enjoy your strawberry notes! 🍓

---

## Automatic builds (GitHub Actions)

- **`.github/workflows/build-macos.yml`** — builds a universal (Apple Silicon +
  Intel) `.dmg` and `.zip` on every push; tagged releases (`v*`) attach them to
  the GitHub release.
- **`.github/workflows/build-web.yml`** — builds the browser version
  (`npm run build:web` → `dist-web/`) and publishes it to GitHub Pages from `main`
  (enable *Settings → Pages → Source: GitHub Actions*). In the web version notes
  are stored in the browser's local storage.
