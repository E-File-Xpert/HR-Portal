<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your ShiftSync HR Portal

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/133rpF2HZKYxSbfPtijCwWyXZZB-XJXFu

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`


## Notes

- AI Smart Log/Gemini features were removed intentionally.
- `components/SmartCommand.tsx` and `services/geminiService.ts` are kept as compatibility shims to avoid merge/build failures in branches that still import them.


## Conflict Resolution (if GitHub shows conflicts)

If PR conflicts appear for the files below, keep the current branch versions from this repo state:

- `README.md`
- `components/SmartCommand.tsx`
- `services/geminiService.ts`

CLI commands:

```bash
git checkout --ours README.md components/SmartCommand.tsx services/geminiService.ts
git add README.md components/SmartCommand.tsx services/geminiService.ts
git commit -m "Resolve conflicts by keeping compatibility shim files"
```
