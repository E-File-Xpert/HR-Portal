import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const shims = {
  'components/SmartCommand.tsx': `import React from 'react';

interface SmartCommandProps {
  onUpdate: () => void;
}

const SmartCommand: React.FC<SmartCommandProps> = () => null;

export default SmartCommand;
`,
  'services/geminiService.ts': `import { Employee } from "../types";

export const processNaturalLanguageCommand = async (
  _command: string,
  _employees: Employee[]
): Promise<{ actions: any[]; summary: string } | null> => ({
  actions: [],
  summary: "AI Smart Log has been removed from this application."
});

export const suggestRotationalSchedule = async (
  _employees: Employee[]
): Promise<string> => "AI schedule suggestions are not available because Gemini integration was removed.";
`,
};

for (const [file, content] of Object.entries(shims)) {
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    console.log(`[shim] Recreated missing file: ${file}`);
  }
}
