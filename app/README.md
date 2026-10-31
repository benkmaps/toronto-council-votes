# Toronto Council Votes

React + Vite + Mantine browser for Toronto City Council voting records.

```
npm install
npm run data   # rebuild public/data/*.json from ../voting_records
npm run dev
```

- `scripts/build-data.mjs` regroups the flat member-per-row exports into term -> body -> meeting -> item -> vote.
- Old terms (2006-2018) mostly lack dates, so City Council sittings are split on "Confirmatory Bill" votes and numbered in order. Committee meetings come from the item reference (e.g. `2024.EX17`).
- Items link out to TMMIS (`agenda-item.do?item=<ref>`). TMMIS's API sits behind bot protection, so item text is not bundled.
