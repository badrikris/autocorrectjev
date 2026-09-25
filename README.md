# Edit — Copyediting, with judgment.

A focused, working prototype of a scholarly copyediting assistant. An editor reads a manuscript. As they scroll, a panel on the right shows findings for the passage they are reading. Each finding gets one of four treatments:

- **Auto-applied.** A routine, mechanical correction. It is already applied, marked in the text, and can be undone.
- **Suggested.** A plausible improvement waiting for the editor to apply, edit or dismiss.
- **Needs judgment.** An ambiguous or meaning-sensitive issue. The editor can edit the passage, draft an author query, or mark it reviewed.
- **Suppressed.** Jev judged the proposed edit unnecessary or unsupported. It is kept out of the way.

The core idea: **let the system handle routine corrections, and save the editor's attention for decisions that need judgment.**

> **Prepared suggestions · Live Jev decisions.** The candidate edits are prepared in advance. The decision about how to treat each one comes live from TypeSafe AI's Jev, bounded by a small safety policy in the application.

---

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local      # then add your key (see below)
npm run dev                      # http://localhost:3000
```

For a production build: `npm run build && npm start`.

To run the tests: `npm test`. To typecheck: `npm run typecheck`.

## Jev API key

1. Get an API key from TypeSafe AI.
2. Put it in `.env.local`:
   ```
   TYPESAFE_API_KEY=your-key-here
   JEV_MODEL=jev-latest
   ```
3. Restart the server.

The key is read only by server code (`src/lib/jev/client.ts`, called from `src/app/api/jev/evaluate/route.ts`). The browser never sees it. `GET /api/jev/status` reports only whether a key is configured.

`TYPESAFE_BASE_URL` is also honoured, and defaults to `https://api.typesafe.ai`. It is the same variable the official SDK uses. It is useful only for testing against a stand-in server.

**Without a key**, *Start review* offers **Preview with sample decisions**. Preview mode uses deterministic, hand-written fixture values. It is labelled everywhere with **"Sample decisions · Jev not connected"**. Fixture values are never presented as Jev output. The app never falls back to preview mode because a live call failed.

---

## What is prepared and what is live

| Prepared (static, in the repo) | Live (at runtime) |
| --- | --- |
| The synthetic manuscript (`src/lib/manuscript.ts`), about 1,040 words, all fictional | Jev's answer to three questions per candidate |
| 22 candidate findings (`src/lib/candidates.ts`): original text, proposed replacement, explanation, optional author-query draft | Route confidence, route probabilities, and the two yes/no probabilities, all parsed from Jev's actual response |
| The fictional *Demo Journal Style* profile (`src/lib/style-profile.ts`) | The final treatment, from `routeFinding()` applied to Jev's answer |
| Sample decisions for preview mode only (`src/lib/sample-decisions.ts`) | All edits, undo, staleness and history, held in memory |

The prepared candidates contain **no routing hints**. The same candidate can be auto-applied, suggested, sent to manual review or suppressed, depending entirely on what Jev returns and on the safety policy.

### What is sent to Jev

One request per candidate: `POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer …`.

- **`state`** (JSON, treated as data): the style rules; the section; the paragraph; the preceding and following paragraphs; related passages where useful (for example, the abstract's figure for a numerical-consistency check); the target marked `⟦…⟧` in context; the original text; the replacement; and the prepared description. Manuscript text travels only as quoted data inside `state`. The questions carry the only instructions.
- **`questions`**:
  - `route`: a **Choice** among `AUTO_APPLY`, `SUGGEST`, `MANUAL_REVIEW` and `NO_CHANGE`, with the definitions from the brief.
  - `finding_valid`: a **Noul** question. Is this a legitimate error, or a useful optional improvement under the style rules?
  - `meaning_preserved`: a **Noul** question. Does the replacement preserve the author's claim and meaning? This is asked only when a replacement exists.

The response is parsed strictly as `answers.route.{choice, confidence, probabilities}` and `answers.<noul>.noul`. If anything is missing or out of range, the result is treated as **malformed** and no decision is made. Confidence values are never filled in.

### Routing policy (`src/lib/policy.ts`)

Jev provides the judgment. The application adds conservative safety boundaries. The thresholds are **illustrative, not validated**.

- **AUTO_APPLY** requires all of the following:
  - Jev chose `AUTO_APPLY`.
  - Route confidence ≥ 0.95.
  - `finding_valid` ≥ 0.95.
  - `meaning_preserved` ≥ 0.98.
  - The exact target is verified.
  - The change is on the mechanical allowlist: an ordinary typo, duplicate whitespace, mechanical punctuation, or a defined style normalisation. The *shape* of the edit is checked, not just its label.
  - No protected content changes.
- **SUGGEST** requires:
  - Jev chose `SUGGEST`, or chose `AUTO_APPLY` but missed the stricter bar above.
  - Route confidence ≥ 0.70, `finding_valid` ≥ 0.80 and `meaning_preserved` ≥ 0.95.
  - A valid replacement, and no protected-content change.
- **NO_CHANGE**: Jev chose `NO_CHANGE` with confidence ≥ 0.70. With lower confidence, the finding goes to manual review rather than being silently hidden.
- **MANUAL_REVIEW** covers everything else. A `MANUAL_REVIEW` answer from Jev is never upgraded.

Protected content is checked in `src/lib/protected.ts`: numbers, units, statistical expressions, negation, association versus causation, claim strength, technical terms, names, quotations and citations. The check looks at **what the edit actually changes**. A number elsewhere in the paragraph does not block an unrelated typo fix. For example, `Landsat 9,,` → `Landsat 9,` is still mechanical punctuation.

Each card's *Why this treatment?* shows:
- the route Jev proposed, with its confidence and the probabilities for every route;
- the two yes/no probabilities;
- every safety rule and whether it passed;
- where the decision came from (live Jev or sample);
- a sentence written by the application, not by Jev.

*Technical details* shows the raw request and response.

### Edit reliability

- Blocks and findings have stable IDs. Blocks carry a `revision`, and an `editEpoch` that increases only when a person rewrites the passage.
- Every change goes through `applyExactEdit()`. It checks that the expected text is at the anchor offset and replaces only that range, never using string search-and-replace or `innerHTML`. Other anchors in the same block are re-mapped across each change.
- Undo checks that the applied text is still in place and restores exactly the original. Undoing one change never touches another.
- A Jev response is accepted only if:
  - it answers the latest request for that finding, and
  - the passage has not been rewritten since the request was sent.
  Otherwise it is discarded and marked *Out of date*.
- Rewriting a paragraph marks that paragraph's open decisions *Out of date*, with a *Re-evaluate* button. A finding whose own text was rewritten is marked *No longer applies*. An automatic edit whose text you later overwrote can no longer be undone on its own, and the card says so.

### Failure handling

Failures show as **Not evaluated**, with a reason and a **Retry** button. Handled failures:
- missing key
- authentication (401/403)
- invalid request (400/404/422)
- rate limit (429)
- timeout (20 s)
- temporary server error (5xx)
- network failure
- malformed response

A 429, 5xx or network error is retried once, automatically. Nothing is retried after that. No text is changed and no decision is invented. Up to 3 requests run at a time, and passages on screen go first. Scrolling never triggers a request.

---

## Code map

```
src/lib/manuscript.ts         demo manuscript (stable block IDs)
src/lib/candidates.ts         22 prepared candidate findings
src/lib/style-profile.ts      fictional Demo Journal Style
src/lib/jev/payload.ts        builds the System One request
src/lib/jev/client.ts         server-only HTTP client + strict response parser
src/lib/policy.ts             routing policy (pure, tested)
src/lib/protected.ts          protected-change detection (pure, tested)
src/lib/document.ts           exact, offset-anchored edits and anchor mapping
src/lib/review.ts             review state reducer (auto-apply, undo, staleness)
src/lib/sample-decisions.ts   preview-mode fixtures (never shown as Jev output)
src/app/api/jev/*             server routes (status, evaluate)
src/components/*              workspace, manuscript, review panel, cards, dialogs
tests/*                       routing, vetoes, exact edits, undo, staleness, Jev client
```

The stack is Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Lucide icons and Vitest. All state lives in memory, and reloading resets the demo.

---

## A 90-second demo walkthrough

1. **(0:00)** The app opens on the manuscript, which is readable straight away. Point out the olive *Start review* button and the Jev indicator, which reads *Jev configured*. It changes to *Jev connected* only after a real request succeeds.
2. **(0:10)** Click **Start review**. Results arrive progressively, in the passage on screen first. The header counts *Evaluating · n of 22*.
3. **(0:20)** In the abstract, *teh* is already *the*. It has a pale olive highlight and a small olive dot. Click it: the card says **Auto-applied**. Click **Undo** and *teh* returns. Everything else stays as it was.
4. **(0:30)** The dotted terracotta underline on *was associated with* is Jev's **Needs judgment**: the proposed change to *caused*. Open **Why this treatment?** to see Jev's route, its probabilities, and the association-versus-causation safety rule. Click **Draft author query** to see the prepared, editable query. It is not sent.
5. **(0:45)** Scroll to Methods. The panel follows you: *Heading case* and *Punctuation* have been handled automatically. *Subject–verb agreement* is **Suggested**. Open *Why*: Jev proposed automatic correction, but grammar is not on the mechanical allowlist, so the app asks for your approval. Click **Apply**. Only that sentence changes.
6. **(1:00)** In Results, *1.8 °C → 1.6 °C* is a numerical change, so it is always a matter for judgment. On *a large number of*, click **Edit suggestion**, type your own wording and apply it. The card records it as *your wording*, not as a Jev-approved edit.
7. **(1:15)** Hover a Discussion paragraph and click the pencil to rewrite a sentence. Open decisions in that paragraph become **Out of date** and offer **Re-evaluate**.
8. **(1:25)** Tick **Show all findings**. At the bottom, *5 proposed edits not shown — Jev judged them unnecessary* holds the negative controls. Resolve the rest and the panel reads **All current demo findings reviewed**, with counts taken from the actual state.

---

## Honest notes

- **Live Jev was not exercised from the build environment.** The sandbox where this was built blocks both `docs.typesafe.ai` and `api.typesafe.ai`. The request and response formats were therefore taken from the type declarations and source of the official `@typesafe-ai/sdk` package, version 0.6.0 on npm:
  - request: `{ model, state, questions }`, sent with a Bearer token;
  - Choice answer: `{ type: "choice", choice, confidence, probabilities }`;
  - Noul answer: `{ type: "noul", noul }`.

  The end-to-end flow was verified against a **local stand-in server that returns that documented shape**. The stand-in was used only for testing and is not part of this repository. The first run with a real key is the first real Jev call. If Jev's live answers differ from what the stand-in returned, the routing may differ as well. That is intended.
- The routing thresholds are illustrative. Model confidence is not a guarantee of editorial correctness.
- *Demo Journal Style* is fictional. It is **not** a verified requirement of any TNQ customer or real journal.
- The manuscript, authors, city, citations and data are synthetic.
- The layout is designed for desktop, and was reviewed at 1440 × 900 and 1280 × 800. It is not designed for small screens.
