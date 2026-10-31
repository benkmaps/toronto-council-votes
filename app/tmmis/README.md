# Getting item details and motions from TMMIS

TMMIS blocks scripts that are not running inside a real browser tab, so this data is downloaded
by running `fetch-items.js` in your own browser. No account or login is needed.

For each of the 9,472 items it makes two requests, one at a time with a short pause:

- the item's details (summary, recommendations, decision text), for the item pop-up;
- the item's "Agenda Item History" page, for the **text and mover of each motion** and the **exact
  date and time of each vote** (this also dates the 2006 to 2018 meetings, which have no dates in
  the source data).

Expect roughly **2 to 3 hours**. The tab must stay open and the computer awake. It is safe to stop
and resume (see step 6).

## Doing just one term first

Run `node scripts/export-refs.mjs 2022-2026` (from the `app` folder) and choose
`refs-2022-2026.json` instead of `refs.json` in step 1. Only that term's 1,110 items are fetched
(about 15 to 25 minutes) and the council item list is limited to that term. The other terms keep
working as before, without motions, item text or no-vote items. Do the same with another term
later (parts from different runs can sit together in `parts/`).

## 1. Download

1. Open <https://secure.toronto.ca/council/> in Chrome or Edge.
2. Press **F12** (or Ctrl+Shift+J) and click the **Console** tab.
3. Open `fetch-items.js` in this folder, copy everything, paste it into the console and press Enter.
   - Chrome may ask you to type `allow pasting` first. Do that, then paste again.
4. A small panel appears at the bottom-right of the page. Click **Choose file** and pick `refs.json`
   (in this folder), then press **Start**.
5. When the browser asks to allow multiple downloads from this site, choose **Allow**.
   Files named `tmmis-items-0001.json`, `0002`, ... are saved to your Downloads folder as it goes
   (one per 500 items).
6. If it stops (laptop slept, connection dropped), the panel says where. Run the script again, choose
   `refs.json`, enter that number in **Start at item #** and press Start. Nothing already downloaded
   is lost.

If TMMIS starts refusing requests, the script stops by itself. Wait a while and resume rather than
retrying straight away.

## 1b. Download the council item list (items with no recorded vote)

When the item download is done (or any time after the panel is open with `refs.json` chosen), press
**Download council item list** in the same panel. It pages through every City Council item in each
term, about 60 requests, a few minutes. Five files named `tmmis-council-2006-2010.json` ... are saved
to Downloads. Items that already have a recorded council vote are only used to line meetings up;
the rest are added to the site as items with no recorded vote.

## 1c. Download the committee and community council item lists

Committees and community councils also have items that were decided without a recorded vote.
Press **Download committee item lists** in the same panel (it needs a `refs` file made with
`export-refs.mjs`, which now includes the list of bodies). It pages through each body's items for the
term, a few minutes in total, and saves `tmmis-committees-<term>.json`. As with the council list,
items that already have a recorded vote are only used to line meetings up, and the long text
fields are shortened to keep the files small.

## 2. Add the data to the site

1. Move all the `tmmis-items-*.json`, `tmmis-council-*.json` and `tmmis-committees-*.json` files from Downloads into
   `app/tmmis/parts/`.
2. From the `app` folder run:

```
node scripts/build-items.mjs
node scripts/build-data.mjs
```

The first command writes the item text to `public/data/items/` and the motions to
`tmmis/history.json`. The second regroups the votes: it matches each vote to its motion, fills in
exact dates and times, and writes `public/data/motions/`.

After that:

- each vote shows its motion number, who moved it, and the motion text;
- the document icon on each item opens the full item text in a side panel;
- older council meetings get real dates and are merged by consecutive days;
- council items with no recorded vote appear in their meeting and section with a dashed outline and
  TMMIS's status (Adopted, Received, ...). A switch above each meeting's items hides them.
  Motions with no recorded vote show in a "No recorded vote" section inside the item.

## If the item list changes

`node scripts/export-refs.mjs` regenerates `refs.json` from the vote data.

## Keeping it up to date after each meeting

New **votes** update by themselves (see the main README): a scheduled GitHub Action pulls them from
Toronto Open Data every day. The TMMIS extras (motion text, item text, items with no recorded vote)
still need a quick manual top-up, because TMMIS blocks servers. Doing it right after a meeting only
fetches what is new:

1. Wait for the votes to appear on the site (or run `npm run votes` in `app` to pull them yourself).
   If you pulled them yourself, run `git pull` first if the Action has also committed.
2. `npm run tmmis:new` writes `tmmis/refs-new.json`: just the items in the latest term that haven't
   been downloaded yet.
3. In the browser (steps 1 to 1c above), choose `refs-new.json`, press **Start** (usually a minute
   or two), then **Download council item list** and **Download committee item lists** (they
   re-download the whole term's lists so new no-vote items and updated statuses come in).
4. Put the new `tmmis-items-*.json` and `tmmis-council-*.json` files in `tmmis/parts/`
   (remove the older parts first, or keep them; both work).
5. `npm run tmmis:build`, then commit `app/public/data` and `app/tmmis/*.json` and push. The deploy
   workflow publishes it.

The build merges with what is already there, so a top-up run never loses earlier data.
