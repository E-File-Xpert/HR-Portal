import { Employee } from "../types";

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
