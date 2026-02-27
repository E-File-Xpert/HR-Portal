import { Employee } from "../types";
import { GoogleGenAI, Type } from "@google/genai";
import { Employee, StaffType } from "../types";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const MODEL_NAME = "gemini-2.5-flash";

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
  command: string,
  employees: Employee[]
): Promise<{ actions: any[], summary: string } | null> => {
  const employeeList = employees.map(e => `${e.name} (${e.company})`).join(", ");
  const today = new Date().toISOString().split('T')[0];

  const prompt = `
    Current Date: ${today}
    Employee List: ${employeeList}
    
    User Command: "${command}"
    
    Task: Extract attendance actions from the user command. 
    - Match names approximately to the employee list.
    - If time is not specified, use current time.
    - Return a JSON object with a list of actions.
    - actionType can be: 'check-in', 'check-out', 'mark-absent'.
    - Format time as HH:mm 24-hour format if possible, or null if current time is implied.
  `;

  if (!ai) {
    return parseCommandLocally(command, employees);
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            actions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  employeeName: { type: Type.STRING },
                  actionType: { type: Type.STRING, enum: ['check-in', 'check-out', 'mark-absent'] },
                  time: { type: Type.STRING, description: "HH:mm format or null" },
                  notes: { type: Type.STRING }
                }
              }
            },
            summary: { type: Type.STRING, description: "A brief polite confirmation message of what was done." }
          }
        }
      }
    });

    const responseText = response.text;
    if (!responseText) return null;
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Gemini API Error:", error);
    return parseCommandLocally(command, employees);
  }
};

const parseCommandLocally = (
  command: string,
  employees: Employee[]
): { actions: any[], summary: string } | null => {
  const normalized = command.toLowerCase().trim();

  const actionType = normalized.includes('absent')
    ? 'mark-absent'
    : normalized.includes('check out') || normalized.includes('checkout')
      ? 'check-out'
      : normalized.includes('check in') || normalized.includes('checkin')
        ? 'check-in'
        : null;

  if (!actionType) return null;

  const matchedEmployees = employees.filter(e => normalized.includes(e.name.toLowerCase()));
  if (matchedEmployees.length === 0) return null;

  const timeMatch = normalized.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : null;

  return {
    actions: matchedEmployees.map(e => ({
      employeeName: e.name,
      actionType,
      time,
      notes: 'Parsed locally'
    })),
    summary: `Updated ${matchedEmployees.length} attendance record${matchedEmployees.length > 1 ? 's' : ''}.`
  };
};

export const suggestRotationalSchedule = async (
  _employees: Employee[]
): Promise<string> => {
  return "AI schedule suggestions are not available because Gemini integration was removed.";
  if (!ai) {
    return "Gemini API key is missing. Set VITE_GEMINI_API_KEY to enable AI schedule suggestions.";
  }

  const workers = employees.filter(e => e.type === StaffType.WORKER);
  
  const prompt = `
    I have the following workers who need a rotational shift schedule for the upcoming week:
    ${workers.map(w => `${w.name} (${w.company})`).join(', ')}
    
    Please generate a balanced table schedule (Markdown format) assigning them to Morning (A), Evening (B), or Night (C) shifts. 
    Group by company where possible. Ensure fairness. Just return the markdown table.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    return response.text || "Could not generate schedule.";
  } catch (error) {
    console.error("Gemini Schedule Error:", error);
    return "Error generating schedule.";
  }
};
