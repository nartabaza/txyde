# Blind tests of the drafting prompt (v1 to v3)

**Date:** 2026-11-13. **Images:** 12 approved archive images of different kinds: 18, 30, 45, 65,
109, 116, 129, 131, 144, 158, 182, 199.

**How it was run:** a separate Claude agent got only the prompt, the style guide, the examples
(none of them these 12 images or their near-duplicates), the metadata and the images. It could not
see the approved descriptions. Drafts are in `batches/test-v1/` and `batches/test-v2/`.

## Results

| | Approved | v1 drafts | v2 drafts |
|---|---|---|---|
| Median length | 15.5 words | 27 words | 24 words |
| Facts not supported by data or image | — | none | none |

**What went well**

- No invented names, dates or events in either version.
- Reading writing on the images helped. #65's inscription lists eight names, and the approved text
  gives only seven (Nihad is missing). #116's caption shows the photo is a send-off for volunteers
  to the Russo-Japanese War, which the approved text does not say.
- The checks asked the right questions: who is who (18, 144), the artist (30), the museum (158),
  and the conflicting spellings (131).

**What did not**

- Too long. Drafts listed what is visible where the approved texts just identify the subject. v2
  ("one sentence, identify rather than inventory") helped a little. The rest of the gap is the
  opening formula (*A 20th-century photograph from …, in the Circassian diaspora,*), which the
  approved texts don't always use. Review round 1 should show whether the researcher wants the
  formula every time.
- The approved texts often contain what only the researcher knows: the exact year (1910, 1926,
  1993), who is standing, the names of instruments, what the knives were used for. No prompt can
  supply these. A **notes** column for researcher notes on draft images would close most of the
  gap.

**Issues found in the approved set** (worth fixing in the sheet):

- "An 1969 / An 1930 / An 1926 / An 1910 / An 1965 / An 1951" should be "A …"; "A 1895" should be "An 1895".
- Spellings: forth → fourth (86), Bolshoviks → Bolsheviks (92, 132), Kabardno → Kabardino (59),
  tripe → tribe (187, 188), illustraion (36), Qunaitra / Quneitra, Hakurinahabl / Hakurynehebl.
- Filler endings: "It documents … and cultural context" (37, 49, 50, 51).
- #182: period is 19th, but the description says 1914 (already in REVIEW-NOTES).

## v3: with the master sheet (2026-11-14)

The master sheet holds the researcher's notes (column CM) and many more fields. Test v3 used 12
other ready photos (18, 25, 45, 86, 105, 131, 132, 141, 158, 171, 184, 197), with the notes and
fields as input and the approved text (column CN) as the target. Drafts are in
`batches/test-v3/`.

- Content now matches the approved texts: the same names, years and background.
- The drafts also correct errors in the approved texts: forth → fourth (86), An 1930 → A 1930
  (105), Bolshoviks → Bolsheviks (132).
- Still a little longer: median 29 words against 22.5, mostly from keeping an extra detail from
  the notes (86, 105). The first review round should settle how much of the notes to keep.
