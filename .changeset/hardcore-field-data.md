---
'@maquest/desktop': minor
---

Sheets, cards and the inspector now hold up to any data an agent writes, and Maquest reports what's too much.

- Long text folds to a few lines with "Show more" (stat tiles, text lines, quotes, subtitles, list items, table cells, record descriptions); long lists show their first items with "Show all N" or "+N more" (tags, pairs, refs, list items, table rows), and records open 50 at a time. Chips and labels stay on one line, cut off with the full text on hover, and words that never end wrap instead of pushing the panel sideways.
- Numbers read short everywhere: at most two decimals (`0.30000000000000004` shows `0.3`), compact from a million (`1.2M`, `988M`, `12.3T`), exponents for the extremes (`1.2e29`, `4e−6`); tiles shrink their type for long values, and the exact value is on hover. Files are unchanged.
- Meters with more dots or boxes than fit (over 40), clocks with more than 12 segments, radars with more than 12 axes and score dots past 20 fall back to bars instead of drawing a wrong picture.
- Canvas cards keep their size: titles clamp to three lines, over-long summaries to four, badges and reference chips stay short (+N for the rest).
- New check "Oversized fields" (`field-oversized`, warn): text longer than its widget shows well, too many or too long items, words over 40 characters, numbers too big, small or precise to read, and styles that can't draw the value. The word limit is an option. "Long titles, summaries and tags" (`summary-length`) now also reports titles over 80 characters, tags over 32 and run-together words. Check messages quote at most a few values.
- Agents are told how much a field holds when they write fields, and write results list oversized values with the rest of the problems.
