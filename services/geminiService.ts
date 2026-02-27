import { Employee } from '../types';

export interface ParsedCommandAction {
  employeeName: string;
  actionType: 'check-in' | 'check-out' | 'mark-absent';
  time?: string | null;
  notes?: string;
}

export interface ParsedCommandResult {
  actions: ParsedCommandAction[];
  summary: string;
}

/**
 * Deprecated integration shim.
 *
 * Gemini/AI has been removed. We keep this API-compatible surface so callers
 * from older branches can still compile safely.
 */
export const processNaturalLanguageCommand = async (
  _command: string,
  _employees: Employee[]
): Promise<ParsedCommandResult | null> => ({
  actions: [],
  summary: 'AI Smart Log has been removed from this application.'
});

/**
 * Deprecated integration shim.
 */
export const suggestRotationalSchedule = async (_employees: Employee[]): Promise<string> =>
  'AI schedule suggestions are not available because Gemini integration was removed.';
