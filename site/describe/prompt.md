# Drafting descriptions: instructions for Claude

**Prompt version:** v5. Every draft records this version, so edits can be traced back to it.

You are drafting photo descriptions for TXYDE, a visual archive of the Circassian people. A
researcher will review every draft, so it is better to leave something out and ask than to state
something that may be wrong.

## Inputs (in the batch folder)

- `batch.json`: the photos to describe. Each item has `id`, `image` (local file, sometimes null)
  and the filled-in fields from the archive sheet: `title`, `period`, `dateTaken`, `dateType`,
  place fields, `names`, `dignitaries`, `creator`, `museum`, `book`, `inscription`, `keywords`,
  `context` (category notes) and, most importantly, `notes`: the researcher's own description.
  Empty fields are left out.
- `../../style-guide.md`: the house style. Follow it exactly.
- `../../examples.json`: approved descriptions with the input each one had. They show how the
  notes and fields become a description. Match their style and length.

## Steps

1. Read the style guide and the examples first.
2. For each item in `batch.json`, read its notes and fields, then open its image file and look at
   it closely. If there is no image, draft from the notes and fields and add the check
   "No image seen". If there are no notes, draft from the fields and the image only, keep to what
   they show, and add the check "No researcher notes: names, year and background still needed".
3. Write the description from the metadata, the notes, what is plainly visible and any writing on
   the image, following the style guide. Never add a fact from general knowledge (style guide, section 2).
4. List the checks: what the researcher should add or confirm (style guide, section 9). Give each
   one a type and say whether it is blocking (see "Checks" below).
5. Write all results to `drafts.json` in the batch folder:

```json
{
  "promptVersion": "v5",
  "drafts": [
    { "id": 123, "description": "A 20th-century photograph from …", "checks": [
      { "type": "date", "blocking": true, "text": "The caption reads 1925, date taken is 1935. Which year?" },
      { "type": "missing-info", "blocking": false, "text": "Names of the people?" }
    ] }
  ]
}
```

## Checks

Each check has a `type`, `blocking` (true or false) and `text` (the question, as in the style guide).

Write a check as a question (ending in "?") only when you need an answer. A note on what the draft
did, or a transcription that matches the data, ends in a full stop: *Caption reads "…". Matches the
title.* Questions go to the issues list; the review card shows only the notes. A draft whose only
questions are `missing-info` still goes to the review page.

**Blocking** means the description could be wrong, or the photo's data contradicts itself, until
the researcher answers. Blocked drafts do not go to the review page; their questions go to an
issues list he answers in bulk, and the photo is drafted again afterwards. **Not blocking** means
the description is right as it stands and the answer would only add to it.

| type | what it is | blocking? |
|---|---|---|
| `date` | the year in the caption, the date field, the notes or the period disagree | yes |
| `spelling` | a name or place spelled differently in different fields | yes, unless the style guide settles it (title spelling for people, place fields for places) |
| `place` | the place fields disagree, or the place in the draft is uncertain | yes |
| `contradiction` | fields that cannot both be right (Location "Diaspora" with country Russia), or impossible data (a lifespan of 119 years) | yes |
| `who-is-who` | the draft names people in positions it is not sure of | yes; no if the draft names them without positions |
| `duplicate` | the photo looks like another one in the batch (a copy, a colourised version, another print) | yes |
| `missing-info` | names, year, place or background that are not in the data, and the draft leaves them out | no |
| `other` | anything else: a translation to confirm, a detail to add | usually no |

A photo with no notes and almost no fields is blocking (`missing-info`, blocking true) only when the
draft would be little more than its title. Do not mark something blocking just to be safe: the point
is to send clean photos to the review page quickly.

## Before you finish, check each draft against these questions

- Is every name, date, place and event in it found in the notes, the fields or writing on the image?
- Does it open with the right pattern for the image type, without "This image shows"?
- Does the opening sentence identify the image in about 12–25 words, rather than list what is visible, with no judgement adjectives and no filler?
- Is the notes' background, provenance and any catalogue or object number kept after it (style guide, section 3)? With no notes, is there an approved photo of the same subject whose background can be reused?
- Costume as *Circassian traditional costume*, historical places with the present-day name in brackets?
- Is every fact taken from writing on the image also listed in checks, with the original words?
- Are the country and place spelled as in the metadata, with the full country name?
