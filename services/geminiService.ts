import { GoogleGenAI, Type } from "@google/genai";
import { Employee, ShiftType, StaffType } from "../types";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = "gemini-2.5-flash";

export const processNaturalLanguageCommand = async (
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
    return null;
  }
};

export const suggestRotationalSchedule = async (
  employees: Employee[]
): Promise<string> => {
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