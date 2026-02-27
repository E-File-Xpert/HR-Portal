<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ShiftSync HR Portal

This repository contains the ShiftSync HR Portal web app.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Start dev server:
   `npm run dev`
3. Build production bundle:
   `npm run build`

## Important

- AI Smart Log/Gemini features were intentionally removed.
- `components/SmartCommand.tsx` and `services/geminiService.ts` are compatibility shims.
- `npm run build` runs `prebuild`, which refreshes shim files automatically to prevent merge/deploy failures.

## If GitHub shows conflicts in shim files

Use CLI conflict resolution and keep current branch versions:

```bash
git checkout --ours README.md components/SmartCommand.tsx services/geminiService.ts
git add README.md components/SmartCommand.tsx services/geminiService.ts
git commit -m "Resolve conflicts by keeping shim files"
```
