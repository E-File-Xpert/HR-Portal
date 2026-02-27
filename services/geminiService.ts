import { Employee } from "../types";

/**
 * Gemini integration has been intentionally removed.
 * This module is kept as a compatibility shim so branches that still
 * reference this file can merge cleanly without reintroducing AI behavior.
 */
export const processNaturalLanguageCommand = async (
  _command: string,
  _employees: Employee[]
): Promise<{ actions: any[]; summary: string } | null> => {
  return {
    actions: [],
    summary: "AI Smart Log has been removed from this application."
  };
};

export const suggestRotationalSchedule = async (
  _employees: Employee[]
): Promise<string> => {
  return "AI schedule suggestions are not available because Gemini integration was removed.";
};
