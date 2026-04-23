# Modify Report Feature — Design Spec

**Date:** 2026-04-23
**Status:** Approved

---

## Goal

Allow users to upload an existing ABAP report (or paste code directly) and ask an LLM to apply specific modifications, returning a complete modified program in the same coding style as the original.

---

## Architecture

A new dedicated page `ModifyReportPage` is added alongside the existing Generator, My Reports, and API Keys pages. No new backend routes are required — the feature reuses the exact same LLM provider routing already in place:

- **Gemini**: frontend fetches decrypted key from `/api/apikeys/decrypt/gemini`, calls Google GenAI SDK directly
- **OpenAI**: frontend fetches decrypted key from `/api/apikeys/decrypt/openai`, calls OpenAI REST API directly
- **Claude**: frontend posts to `/api/generate/claude` (existing backend proxy, avoids CORS)

The only new files are `pages/ModifyReportPage.tsx` plus small additions to `App.tsx`, `Header.tsx`, and the `Page` type.

---

## Components

### `pages/ModifyReportPage.tsx`

Two-column layout matching GeneratorPage:

**Left panel (input form):**
1. **Upload area** — drag-and-drop zone + click-to-browse for any text/`.abap` file. File content is read client-side via `FileReader`. Accepts any extension (ABAP files may be `.abap`, `.txt`, or no extension).
2. **Code textarea** — populated automatically from the uploaded file; user can also paste directly. Editable after upload.
3. **Modification instructions textarea** — free-text field: "What should be changed?"
4. **Model selector** — same `LLM_MODELS` array and `optgroup` structure as GeneratorPage; reads/writes `abap_pref_model` localStorage key.
5. **Generation profile selector** — same four options (Balanced, Creative, Concise, Well-Commented).
6. **"Apply Changes" button** — disabled when either the code or instructions textarea is empty.

**Right panel (output):**
- Identical dark code block as GeneratorPage: `h-[75vh]`, sticky, Copy button with clipboard fallback, save toast (green/orange).

### `App.tsx`
- `Page` union extended with `'modify'`
- New render branch for `ModifyReportPage`
- `handleNavigate` already generic — no logic changes needed

### `Header.tsx`
- New "Modify Code" nav button between Generator and My Reports
- Active state styling matches existing buttons

---

## Data Flow

```
1. User drops a .abap file OR pastes code into textarea
2. User types modification instructions
3. User selects model + generation profile
4. Click "Apply Changes"
5. Frontend builds prompt (see Prompt Design below)
6. Provider routing:
     Gemini  → fetchApiKey('gemini') → GoogleGenAI SDK
     OpenAI  → fetchApiKey('openai') → fetch openai.com/v1/chat/completions
     Claude  → POST /api/generate/claude  (existing proxy)
7. Raw response stripped of code fences (same regex as GeneratorPage)
8. setModifiedCode(code) → shown in right panel
9. POST /api/reports to save (program_name parsed from code, fallback to filename or 'Z_MODIFIED')
```

---

## Prompt Design

```
You are an expert SAP ABAP developer. Below is an existing ABAP program.
Apply ONLY the requested modification. Do not add any extra features or
restructure anything beyond what is asked. Preserve the exact coding style,
naming conventions, indentation, and comment patterns of the original code.
Return the complete modified program — no explanations, no markdown, just code.

──────────────── ORIGINAL CODE ────────────────
<uploaded code>
──────────────── END OF CODE ────────────────

REQUESTED MODIFICATION:
<modification instructions>
```

`systemInstruction` from the generation profile (Concise / Well-Commented) is layered on top of this base prompt exactly as in GeneratorPage. Temperature follows the same mapping.

---

## Program Name Extraction

To populate `program_name` when saving to My Reports, the frontend scans the first 20 lines of the uploaded/pasted code for a line matching `/^\s*REPORT\s+(\w+)/i` or `/^\s*PROGRAM\s+(\w+)/i`. If found, that identifier is used. Otherwise falls back to the uploaded filename (without extension) or the string `'Z_MODIFIED'`.

---

## Error States

| Condition | Behaviour |
|---|---|
| Neither code nor file provided | "Apply Changes" button disabled |
| Instructions field empty | "Apply Changes" button disabled |
| No API key for selected provider | Error message in output panel: "No \<provider\> API key configured." |
| LLM API error | Error shown in red in output panel, same as GeneratorPage |
| Save fails | Orange toast "Save failed: \<reason\>", code still shown |
| File too large (> 500 KB) | Alert: "File is too large. Please paste the code directly." |

---

## What This Does NOT Include

- Diff view between original and modified code
- Version history or linking to the original report
- Multi-file upload
- Streaming output
- Syntax validation of the uploaded code

---

## Files Changed

| File | Change |
|---|---|
| `pages/ModifyReportPage.tsx` | **Create** |
| `App.tsx` | Add `'modify'` to `Page` type, add render branch, pass `token` prop |
| `components/Header.tsx` | Add "Modify Code" nav button |
