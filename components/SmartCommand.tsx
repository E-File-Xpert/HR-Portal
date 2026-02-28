import React, { useMemo, useState } from 'react';
import { Bot, Play, Sparkles } from 'lucide-react';
import { AttendanceStatus } from '../types';
import { getEmployees, logAttendance } from '../services/storageService';

type Props = {
  onUpdate: () => void;
};

const STATUS_MAP: Record<string, AttendanceStatus> = {
  present: AttendanceStatus.PRESENT,
  p: AttendanceStatus.PRESENT,
  absent: AttendanceStatus.ABSENT,
  a: AttendanceStatus.ABSENT,
  sick: AttendanceStatus.SICK_LEAVE,
  sl: AttendanceStatus.SICK_LEAVE,
  annual: AttendanceStatus.ANNUAL_LEAVE,
  al: AttendanceStatus.ANNUAL_LEAVE,
  unpaid: AttendanceStatus.UNPAID_LEAVE,
  ul: AttendanceStatus.UNPAID_LEAVE,
  emergency: AttendanceStatus.EMERGENCY_LEAVE,
  el: AttendanceStatus.EMERGENCY_LEAVE,
  weekoff: AttendanceStatus.WEEK_OFF,
  w: AttendanceStatus.WEEK_OFF,
  holiday: AttendanceStatus.PUBLIC_HOLIDAY,
  ph: AttendanceStatus.PUBLIC_HOLIDAY,
};

const SmartCommand: React.FC<Props> = ({ onUpdate }) => {
  const [command, setCommand] = useState('');
  const [result, setResult] = useState('');

  const examples = useMemo(
    () => [
      'present John Doe, Mary',
      'absent Ali on 2026-01-14',
      'sick Fatima',
    ],
    []
  );

  const runCommand = () => {
    const raw = command.trim();
    if (!raw) {
      setResult('Please enter a command.');
      return;
    }

    const employees = getEmployees().filter((e) => e.active);

    const lower = raw.toLowerCase();
    const dateMatch = lower.match(/\bon\s+(\d{4}-\d{2}-\d{2})\b/);
    const dateOverride = dateMatch?.[1];

    const cleaned = lower.replace(/\bon\s+\d{4}-\d{2}-\d{2}\b/g, '').trim();

    const [actionToken, ...nameParts] = cleaned.split(/\s+/);
    const status = STATUS_MAP[actionToken || ''];

    if (!status) {
      setResult('Unknown action. Start with present/absent/sick/annual/unpaid/emergency/weekoff/holiday.');
      return;
    }

    const namesText = nameParts.join(' ').trim();
    if (!namesText) {
      setResult('No employee name provided.');
      return;
    }

    const targets = namesText
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);

    const matched = employees.filter((e) =>
      targets.some((t) => e.name.toLowerCase().includes(t.toLowerCase()))
    );

    if (matched.length === 0) {
      setResult('No matching active employees found.');
      return;
    }

    matched.forEach((employee) => {
      logAttendance(employee.id, status, dateOverride, 0, undefined, 'Smart Command', raw);
    });

    onUpdate();
    setResult(
      `Updated ${matched.length} employee${matched.length > 1 ? 's' : ''} to ${status}${dateOverride ? ` on ${dateOverride}` : ' for today'}.`
    );
    setCommand('');
  };

  return (
    <section className="bg-white border rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
          <Bot className="w-4 h-4" />
        </div>
        <h3 className="text-sm md:text-base font-semibold text-gray-800">Smart Command</h3>
        <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Local parser
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="e.g. present John, Mary on 2026-01-14"
          className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={runCommand}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" /> Run
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-2">Examples: {examples.join(' • ')}</p>
      {result && <p className="text-sm mt-3 text-gray-700">{result}</p>}
    </section>
  );
};

export default SmartCommand;
