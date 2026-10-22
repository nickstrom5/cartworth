# Cartworth price tracker → Google Sheet: setup (about 5 minutes)

The tracker on the Mac writes CSV files into your Google Drive folder
**My Drive › Cartworth › price-tracker › incoming**. A small script inside a Google Sheet picks
them up every hour and adds the rows. You set that Sheet up once; after that it runs by itself.

Do this in a desktop browser, signed in to the same Google account as Google Drive for desktop on the Mac.

## 1. Make the Sheet (1 minute)

1. Go to <https://sheets.new> (opens a new blank Google Sheet in your Drive).
2. Click the title **Untitled spreadsheet** (top left) and type **Cartworth price tracker**. Press Enter.
3. Optional, tidy: **File › Move**, pick **My Drive › Cartworth › price-tracker**, click **Move**.
   (If that folder does not exist yet, skip this. The script creates it in step 3.)

## 2. Paste the script (1 minute)

1. In the Sheet: **Extensions › Apps Script**. A new tab opens with a file called `Code.gs`
   containing `function myFunction() { }`.
2. Select all of it (**⌘A**) and delete it.
3. Open `marketing/sheets/Code.gs` from the Cartworth repo, copy **all** of it (**⌘A**, **⌘C**), and
   paste it into the editor (**⌘V**).
4. Click the project name **Untitled project** (top left), type **Cartworth importer**, click **Rename**.
5. Save: **⌘S** (or the disk icon).

## 3. Run it once and authorize it (2 minutes)

1. In the toolbar, the function drop-down next to **Debug** — choose **`setup`**.
2. Click **Run**.
3. A box says **Authorization required** → click **Review permissions**.
4. Choose that same Google account.
5. You will see **"Google hasn't verified this app"**. That is normal for a script you wrote
   yourself and nobody else uses. Click **Advanced** (small, bottom left), then
   **Go to Cartworth importer (unsafe)**.
6. Google lists what the script may do. Click **Allow**. It asks for three things:

   | Google says | Why the script needs it |
   |---|---|
   | **See, edit, create, and delete all of your Google Drive files** | To open the CSVs in `Cartworth/price-tracker/incoming`, move each one to `imported` once it has been read, and copy the Sheet to `archive` at the end of a month. Google has no narrower permission for files another app (Drive for desktop) put there. The script only touches the `Cartworth/price-tracker` folder. |
   | **See, edit, create, and delete all your Google Sheets spreadsheets** | To add rows to this Sheet, and to add late rows to a month's archive copy. |
   | **Allow this application to run when you are not present** | For the hourly trigger: the import runs every hour whether or not the Sheet is open. |

   The script sends nothing anywhere. It has no web access (no `UrlFetchApp`), no email, and no
   access to anything outside your Drive and Sheets.
7. The run finishes in a few seconds. The **Execution log** at the bottom ends with something like
   `Installed the hourly import trigger. Watching My Drive/Cartworth/price-tracker/incoming. Nothing new in incoming/.`

## 4. See it work (1 minute)

Go back to the Sheet's tab. It now has these tabs:

- **README** — what every column and every basis means, and the rule at the top:
  *every number is a snapshot — re-check it live the same day before posting.*
- **prices** — one row per term, store and ZIP per day: that store's best comparable item.
- **daily_summary** — per store per ZIP per run: what was priced, what failed, and why.
- **import_log** — every file the script read, and what it added.

A **Cartworth** menu appears on the menu bar (reload the page if it does not): **Import now**
imports straight away instead of waiting for the hour.

**The first rows** land after the tracker's first run writes a file into `incoming/`:

- if the daily job is installed, that is the next 06:30 capture, imported within the hour after it;
- to see one right now, run a one-term capture on the Mac (about 3 minutes, ~135 polite requests):

  ```sh
  cd /path/to/cartworth
  node --disable-warning=ExperimentalWarning scripts/tracker/capture.js --zips 60618 --terms butter
  ```

  wait a minute for Drive to upload it, then **Cartworth › Import now**. The `prices` tab gets
  the day's butter rows for Chicago 60618, and `import_log` shows the file.

Running **Import now** twice adds nothing the second time: every row has a key, and a key that
is already in the tab is skipped. Each file is moved to `imported/` after it is read.

## Good to know

- **Check the trigger:** in the Apps Script tab, the clock icon (**Triggers**) on the left shows
  one trigger: `importNew`, time-based, every hour.
- **To stop the imports:** delete that trigger. The Sheet keeps its rows.
- **Monthly archive:** `prices` holds one calendar month (at most about 2.6 million cells; Google's
  limit is 10 million per spreadsheet, and Sheets slows down well before it). The first row of a
  new month copies the whole Sheet to
  **Cartworth › price-tracker › archive › Cartworth prices 2026-10 (archive)** and empties
  `prices`. `daily_summary` stays.
- **A file that will not import** stays in `incoming/` with a "waiting" line in `import_log`
  (usually: Drive has not finished uploading it). After 24 hours it moves to `rejected/`.
- **The full detail** — every kept row, including ones marked implausible or low-relevance — is in
  `Cartworth › price-tracker › daily › YYYY-MM-DD.csv`, not in the Sheet.
- **Not tested outside Google:** the repo's tests run this script's CSV reader, de-duplication,
  file-name check, monthly routing and cell conversion. The parts that talk to Drive and Sheets
  (moving files, the trigger, the monthly archive copy) only run inside Google and were not run here.
