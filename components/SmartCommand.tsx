import React, { useState } from 'react';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { processNaturalLanguageCommand } from '../services/geminiService';
import { logAttendance, getEmployees } from '../services/storageService';

interface SmartCommandProps {
  onUpdate: () => void;
}

const SmartCommand: React.FC<SmartCommandProps> = ({ onUpdate }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const employees = getEmployees();
      const response = await processNaturalLanguageCommand(input, employees);

      if (response && response.actions.length > 0) {
        let successCount = 0;
        
        response.actions.forEach(action => {
            // Find approximate match for name
            const targetEmp = employees.find(e => e.name.toLowerCase().includes(action.employeeName.toLowerCase()));
            if (targetEmp) {
                logAttendance(targetEmp.id, action.actionType, action.time);
                successCount++;
            }
        });

        setResult(response.summary || `Processed ${successCount} actions.`);
        onUpdate();
        setInput('');
      } else {
        setResult("I couldn't understand that command. Try 'Check in Alice at 9am'.");
      }
    } catch (err) {
      console.error(err);
      setResult("Something went wrong. Please check your API connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl p-6 text-white shadow-lg mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-yellow-300" />
        <h2 className="text-lg font-semibold">AI Smart Log</h2>
      </div>
      <p className="text-blue-100 text-sm mb-4">
        Type naturally to manage attendance. e.g., "Check in Tom and Jerry at 9:00 AM" or "Mark Sarah as absent".
      </p>
      
      <form onSubmit={handleCommand} className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe attendance actions..."
          className="w-full py-3 px-4 pr-12 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400 shadow-inner"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-500 hover:bg-indigo-700 rounded-md text-white transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>

      {result && (
        <div className="mt-3 text-sm bg-white/20 p-2 rounded border border-white/10 backdrop-blur-sm animate-fade-in">
          {result}
        </div>
      )}
    </div>
  );
};

export default SmartCommand;