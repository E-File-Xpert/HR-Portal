
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Download, 
  FileText,
  Building2,
  ChevronLeft,
  ChevronRight,
  Printer,
  DollarSign,
  Search,
  Briefcase,
  CheckCircle,
  XCircle,
  Plus,
  UserPlus,
  CreditCard,
  User,
  MapPin,
  Check,
  Clock,
  Settings,
  Trash2,
  UserMinus,
  LogOut,
  AlertCircle,
  Paperclip,
  Upload,
  Eye,
  Edit,
  FileSpreadsheet,
  UserCheck,
  BarChart3,
  FileDown,
  Ban
} from 'lucide-react';

import { 
  Employee, 
  AttendanceRecord, 
  AttendanceStatus, 
  StaffType,
  LeaveRequest,
  LeaveStatus,
  SalaryStructure,
  PublicHoliday,
  OffboardingDetails,
  EmployeeDocuments
} from './types';
import { 
  getEmployees, 
  saveEmployee,
  updateEmployee,
  offboardEmployee,
  rehireEmployee,
  getAttendanceRange,
  logAttendance, 
  seedMonthlyData,
  exportToCSV,
  importAttendanceFromCSV,
  importEmployeesFromCSV,
  getLeaveRequests,
  saveLeaveRequest,
  updateLeaveRequestStatus,
  getPublicHolidays,
  savePublicHoliday,
  deletePublicHoliday,
  getCompanies,
  addCompany,
  updateCompany,
  deleteCompany
} from './services/storageService';
import { PUBLIC_HOLIDAYS } from './constants';

// --- Constants for Grid ---
const ATTENDANCE_LEGEND = {
  [AttendanceStatus.PRESENT]: { label: 'Present', color: 'bg-green-100 text-green-800', code: 'P' },
  [AttendanceStatus.ABSENT]: { label: 'Absent', color: 'bg-red-100 text-red-800', code: 'A' },
  [AttendanceStatus.WEEK_OFF]: { label: 'Week Off', color: 'bg-gray-200 text-gray-800', code: 'W' },
  [AttendanceStatus.PUBLIC_HOLIDAY]: { label: 'Public Holiday', color: 'bg-purple-100 text-purple-800', code: 'PH' },
  [AttendanceStatus.SICK_LEAVE]: { label: 'Sick Leave', color: 'bg-orange-100 text-orange-800', code: 'SL' },
  [AttendanceStatus.ANNUAL_LEAVE]: { label: 'Annual Leave', color: 'bg-blue-100 text-blue-800', code: 'AL' },
  [AttendanceStatus.UNPAID_LEAVE]: { label: 'Unpaid Leave', color: 'bg-red-50 text-red-600', code: 'UL' },
  [AttendanceStatus.EMERGENCY_LEAVE]: { label: 'Emergency Leave', color: 'bg-pink-100 text-pink-800', code: 'EL' },
};

// --- Helper Functions ---
const getMonthDays = (date: Date) => {
  const y = date.getFullYear();
  const m = date.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const result = [];
  for(let i=1; i<=days; i++) {
    result.push(new Date(y, m, i));
  }
  return result;
}

const calculateAdditionalEarnings = (records: AttendanceRecord[], team: string) => {
    let overtimePay = 0;
    let holidayPay = 0;
    let weekOffPay = 0;

    const HOURLY_OT_RATE = 5;
    const WEEK_OFF_HOURLY_RATE = 5;
    const HOLIDAY_BONUS_FLAT = 50;

    // Office Staff are NOT eligible for Overtime OR Public Holiday Bonus Work
    const isOtEligible = team !== 'Office Staff';

    records.forEach(r => {
        // Overtime Calculation
        if (isOtEligible && r.overtimeHours > 0) {
            overtimePay += r.overtimeHours * HOURLY_OT_RATE;
        }

        // Public Holiday Work Calculation (If PRESENT on a Public Holiday)
        // RESTRICTION: Office Staff do not get extra pay for working on public holidays
        if (isOtEligible && PUBLIC_HOLIDAYS.includes(r.date) && r.status === AttendanceStatus.PRESENT) {
            holidayPay += HOLIDAY_BONUS_FLAT;
        }

        // Week Off Work Calculation (If PRESENT on a Sunday - Day 0)
        const dateObj = new Date(r.date);
        if (isOtEligible && dateObj.getDay() === 0 && r.status === AttendanceStatus.PRESENT) {
            // Use hoursWorked (default 8) * 5
            weekOffPay += (r.hoursWorked || 8) * WEEK_OFF_HOURLY_RATE;
        }
    });

    return { overtimePay, holidayPay, weekOffPay };
};

const getDateColor = (dateStr: string | undefined, type: 'standard' | 'passport' = 'standard') => {
    if (!dateStr) return 'text-gray-500';
    const today = new Date();
    today.setHours(0,0,0,0); // Compare dates only
    const expiry = new Date(dateStr);
    
    if (isNaN(expiry.getTime())) return 'text-gray-500';

    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded'; // Expired

    if (type === 'passport') {
        if (diffDays <= 90) return 'text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded'; // < 3 months
        if (diffDays <= 180) return 'text-yellow-600 font-bold bg-yellow-50 px-2 py-0.5 rounded'; // < 6 months
    } else {
        // Standard (Emirates ID, Labour Card)
        if (diffDays <= 30) return 'text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded'; // < 1 month
    }

    return 'text-gray-600';
};

// --- Sub Components ---

const ManageCompaniesModal = ({ isOpen, onClose, companies, onDataChange }: { isOpen: boolean, onClose: () => void, companies: string[], onDataChange: (companies: string[]) => void }) => {
    const [newName, setNewName] = useState('');
    const [editingName, setEditingName] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const handleAdd = () => {
        if (!newName.trim()) return;
        const updated = addCompany(newName.trim());
        onDataChange(updated);
        setNewName('');
    }

    const handleDelete = (name: string) => {
        if (window.confirm(`Are you sure you want to delete "${name}"? This will remove it from filters, but historical employee records may still reference it.`)) {
            const updated = deleteCompany(name);
            onDataChange(updated);
        }
    }

    const startEdit = (name: string) => {
        setEditingName(name);
        setEditValue(name);
    }

    const saveEdit = () => {
        if (editingName && editValue.trim()) {
            const updated = updateCompany(editingName, editValue.trim());
            onDataChange(updated);
            setEditingName(null);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl p-6 animate-fade-in flex flex-col max-h-[80vh]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900">Manage Companies</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><XCircle className="w-6 h-6"/></button>
                </div>
                
                {/* Add Form */}
                <div className="flex gap-2 mb-6">
                    <input 
                        type="text" 
                        value={newName} 
                        onChange={e => setNewName(e.target.value)} 
                        className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="Enter new company name"
                    />
                    <button onClick={handleAdd} disabled={!newName.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                        Add
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto pr-2">
                    <h4 className="text-sm font-bold text-gray-700 mb-2">Existing Companies</h4>
                    <ul className="space-y-2">
                        {companies.map(c => (
                            <li key={c} className="flex items-center gap-2 p-3 border border-gray-100 rounded-lg bg-gray-50 hover:bg-white hover:shadow-sm transition-all group">
                                {editingName === c ? (
                                    <div className="flex-1 flex gap-2 items-center">
                                        <input 
                                            type="text" 
                                            value={editValue} 
                                            onChange={e => setEditValue(e.target.value)}
                                            className="flex-1 p-2 border border-indigo-300 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500"
                                            autoFocus
                                        />
                                        <button onClick={saveEdit} className="text-green-600 hover:bg-green-100 p-1.5 rounded"><Check className="w-4 h-4"/></button>
                                        <button onClick={() => setEditingName(null)} className="text-gray-500 hover:bg-gray-100 p-1.5 rounded"><XCircle className="w-4 h-4"/></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="flex-1 text-sm font-medium text-gray-700 truncate" title={c}>{c}</span>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => startEdit(c)} className="text-blue-600 hover:bg-blue-100 p-1.5 rounded" title="Rename">
                                                <Edit className="w-4 h-4"/>
                                            </button>
                                            <button onClick={() => handleDelete(c)} className="text-red-600 hover:bg-red-100 p-1.5 rounded" title="Delete">
                                                <Trash2 className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    )
}

const DocumentPreviewModal = ({ isOpen, onClose, attachment }: { isOpen: boolean, onClose: () => void, attachment: string }) => {
    if (!isOpen) return null;
    
    const isPdf = attachment.startsWith('data:application/pdf');
    
    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl h-[80vh] rounded-xl overflow-hidden flex flex-col">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50">
                    <h3 className="font-bold">Document Preview</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500 hover:text-gray-800"/></button>
                </div>
                <div className="flex-1 bg-gray-200 flex items-center justify-center overflow-auto p-4">
                    {isPdf ? (
                        <iframe src={attachment} className="w-full h-full rounded bg-white" title="Preview" />
                    ) : (
                        <img src={attachment} alt="Preview" className="max-w-full max-h-full object-contain shadow-lg rounded" />
                    )}
                </div>
            </div>
        </div>
    );
};

const AttendanceActionModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  employeeName, 
  date, 
  currentStatus, 
  currentOt,
  currentAttachment,
  onPreview,
  isOtEligible
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (status: AttendanceStatus, ot: number, attachment?: string) => void; 
  employeeName: string; 
  date: Date; 
  currentStatus: AttendanceStatus; 
  currentOt: number; 
  currentAttachment?: string;
  onPreview: (data: string) => void;
  isOtEligible: boolean;
}) => {
  const [status, setStatus] = useState(currentStatus);
  const [ot, setOt] = useState(currentOt);
  const [fileName, setFileName] = useState<string>('');
  const [fileData, setFileData] = useState<string | undefined>(currentAttachment);

  useEffect(() => {
    if (isOpen) {
        setStatus(currentStatus);
        setOt(currentOt);
        setFileData(currentAttachment);
        setFileName(currentAttachment ? 'Existing File Attached' : '');
    }
  }, [isOpen, currentStatus, currentOt, currentAttachment]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setFileName(file.name);
          const reader = new FileReader();
          reader.onload = (e) => {
              setFileData(e.target?.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const dateStr = date.toISOString().split('T')[0];
  const isPublicHoliday = PUBLIC_HOLIDAYS.includes(dateStr);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="bg-indigo-600 p-4 text-white">
            <h3 className="text-lg font-bold">Update Attendance</h3>
            <p className="text-indigo-200 text-sm">{employeeName}</p>
            <p className="text-xs text-indigo-200">{date.toDateString()}</p>
        </div>
        <div className="p-6 space-y-6">
            
            {/* Public Holiday Restriction Notice */}
            {!isOtEligible && isPublicHoliday && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-sm p-3 rounded-lg flex items-start gap-2">
                    <Ban className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-bold">Office Staff Restrictions:</span> Not eligible for work/bonus pay on Public Holidays.
                    </div>
                </div>
            )}

            {/* Status Selection */}
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">Select Status</label>
                <div className="grid grid-cols-2 gap-3">
                    {Object.entries(ATTENDANCE_LEGEND).map(([key, val]) => (
                        <button 
                        key={key}
                        onClick={() => setStatus(key as AttendanceStatus)}
                        className={`p-3 rounded-lg border text-sm font-medium transition-all flex items-center gap-3 ${
                            status === key 
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100' 
                            : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                        }`}
                        >
                        <span className={`w-3 h-3 rounded-full shrink-0 ${val.color.split(' ')[0].replace('bg-', 'bg-')}`}></span>
                        {val.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Overtime Input */}
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400"/> Overtime Hours
                </label>
                {isOtEligible ? (
                    <input 
                        type="number" 
                        min="0" 
                        max="24" 
                        step="0.5"
                        value={ot}
                        onChange={(e) => setOt(parseFloat(e.target.value) || 0)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="Enter hours (e.g. 2.5)"
                    />
                ) : (
                    <div className="w-full p-3 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-500 italic flex items-center gap-2">
                        <Ban className="w-4 h-4"/> Not eligible (Office Staff)
                    </div>
                )}
            </div>

            {/* File Upload */}
            {isOtEligible && (
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                        <Upload className="w-4 h-4 text-gray-400"/> OT Timesheet Document
                    </label>
                    <div className="relative border border-gray-300 border-dashed rounded-lg p-4 hover:bg-gray-50 transition-colors text-center cursor-pointer">
                        <input 
                            type="file" 
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleFileChange}
                        />
                        <div className="pointer-events-none">
                            {fileName ? (
                                <div className="flex items-center justify-center gap-2 text-indigo-600 font-medium">
                                    <Paperclip className="w-4 h-4"/>
                                    <span className="text-sm truncate max-w-[200px]">{fileName}</span>
                                </div>
                            ) : (
                                <span className="text-sm text-gray-500">Click to upload document (PDF, JPG)</span>
                            )}
                        </div>
                    </div>
                    {fileData && (
                        <button 
                            type="button"
                            onClick={() => onPreview(fileData)}
                            className="text-xs text-indigo-600 mt-2 ml-1 flex items-center gap-1 hover:underline"
                        >
                            <Eye className="w-3 h-3"/> Preview Document
                        </button>
                    )}
                </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
                <button onClick={() => onSave(status, ot, fileData)} className="px-6 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium shadow-sm">Save Changes</button>
            </div>
        </div>
      </div>
    </div>
  )
}

const BulkImportModal = ({ isOpen, onClose, onImport }: { isOpen: boolean, onClose: () => void, onImport: (csv: string) => void }) => {
    const [csvText, setCsvText] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => setCsvText(e.target?.result as string);
            reader.readAsText(file);
        }
    };

    const downloadSample = () => {
        const headers = ['EmployeeCode', 'Date', 'Status', 'Overtime'];
        const rows = [
            ['10001', '2025-12-01', 'P', '0'],
            ['10002', '2025-12-01', 'A', '0'],
            ['10003', '2025-12-01', 'P', '2.5'],
             ['10004', '2025-12-01', 'PH', '0']
        ];
        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'attendance_sample.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl p-6">
                 <div className="flex justify-between items-center mb-4">
                     <h3 className="text-lg font-bold">Import Attendance (CSV)</h3>
                     <button 
                         onClick={downloadSample}
                         className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                     >
                         <Download className="w-4 h-4" /> Sample Format
                     </button>
                 </div>
                 <p className="text-sm text-gray-500 mb-4">
                    Upload a CSV file with format: <code>EmployeeCode, Date(YYYY-MM-DD), Status(P/A/PH), Overtime(0)</code>
                 </p>
                 <input type="file" accept=".csv" onChange={handleFileChange} className="mb-4 w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                 <textarea 
                    className="w-full h-32 border p-2 text-xs font-mono rounded bg-gray-50 mb-4" 
                    placeholder="Or paste CSV data here..."
                    value={csvText}
                    onChange={e => setCsvText(e.target.value)}
                 ></textarea>
                 <div className="flex justify-end gap-3">
                     <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                     <button onClick={() => onImport(csvText)} disabled={!csvText} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">Import</button>
                 </div>
            </div>
        </div>
    )
}

const EmployeeImportModal = ({ isOpen, onClose, onImport }: { isOpen: boolean, onClose: () => void, onImport: (csv: string) => void }) => {
    const [csvText, setCsvText] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => setCsvText(e.target?.result as string);
            reader.readAsText(file);
        }
    };

    const downloadSample = () => {
        const headers = ['Code', 'Name', 'Designation', 'Department', 'Company', 'JoiningDate', 'Type', 'Status', 'Team', 'Location', 'Basic', 'Housing', 'Transport', 'Other', 'EmiratesID', 'EIDExpiry', 'Passport', 'PassExpiry', 'LabourCard', 'LCExpiry', 'VacationDate'];
        const rows = [
            ['1001', 'John Doe', 'Driver', 'Logistics', 'Perfect Star', '2025-01-01', 'Worker', 'Active', 'Internal Team', 'Abu Dhabi', '1200', '0', '0', '300', '784-1234-1234567-1', '2026-01-01', 'N123456', '2028-01-01', 'LC123456', '2026-01-01', '2026-06-01']
        ];
        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'employee_sample_v2.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl p-6">
                 <div className="flex justify-between items-center mb-4">
                     <h3 className="text-lg font-bold">Import Employees (CSV)</h3>
                     <button 
                         onClick={downloadSample}
                         className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                     >
                         <Download className="w-4 h-4" /> Sample Format
                     </button>
                 </div>
                 <p className="text-sm text-gray-500 mb-4">
                    Upload a CSV file with employee details. Includes Salary & Documents.
                 </p>
                 <input type="file" accept=".csv" onChange={handleFileChange} className="mb-4 w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                 <textarea 
                    className="w-full h-32 border p-2 text-xs font-mono rounded bg-gray-50 mb-4" 
                    placeholder="Or paste CSV data here..."
                    value={csvText}
                    onChange={e => setCsvText(e.target.value)}
                 ></textarea>
                 <div className="flex justify-end gap-3">
                     <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                     <button onClick={() => onImport(csvText)} disabled={!csvText} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">Import</button>
                 </div>
            </div>
        </div>
    )
}

const EditEmployeeModal = ({ employee, companies, onClose, onSave }: { employee: Employee, companies: string[], onClose: () => void, onSave: (emp: Employee) => void }) => {
    const [data, setData] = useState<Employee>(employee);

    const handleChange = (field: keyof Employee, value: any) => {
        setData(prev => ({ ...prev, [field]: value }));
    };
    
    const handleSalaryChange = (field: keyof SalaryStructure, value: number) => {
        setData(prev => ({ ...prev, salary: { ...prev.salary, [field]: value } }));
    };

    const handleDocChange = (field: keyof EmployeeDocuments, value: string) => {
        setData(prev => ({ ...prev, documents: { ...prev.documents, [field]: value } }));
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(data);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                 <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
                     <h3 className="font-bold">Edit Employee Profile</h3>
                     <button onClick={onClose}><XCircle className="w-5 h-5 text-indigo-200 hover:text-white"/></button>
                 </div>
                 <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
                    {/* Personal */}
                    <h4 className="font-bold text-sm text-gray-700 border-b pb-2">Basic Info</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Name</label>
                            <input type="text" value={data.name} onChange={e => handleChange('name', e.target.value)} className="w-full p-2 border rounded"/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Designation</label>
                            <input type="text" value={data.designation} onChange={e => handleChange('designation', e.target.value)} className="w-full p-2 border rounded"/>
                        </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Department</label>
                            <input type="text" value={data.department} onChange={e => handleChange('department', e.target.value)} className="w-full p-2 border rounded"/>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-700 mb-1">Company</label>
                             <select value={data.company} onChange={e => handleChange('company', e.target.value)} className="w-full p-2 border rounded">
                                 {companies.map(c => <option key={c} value={c}>{c}</option>)}
                             </select>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-700 mb-1">Team</label>
                             <select value={data.team} onChange={e => handleChange('team', e.target.value)} className="w-full p-2 border rounded">
                                 <option value="Internal Team">Internal Team</option>
                                 <option value="External Team">External Team</option>
                                 <option value="Office Staff">Office Staff</option>
                             </select>
                        </div>
                    </div>
                    
                    {/* Documents */}
                    <h4 className="font-bold text-sm text-gray-700 border-b pb-2 mt-4">Documents & Identification</h4>
                    <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded">
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Emirates ID</label>
                            <input type="text" value={data.documents?.emiratesId || ''} onChange={e => handleDocChange('emiratesId', e.target.value)} className="w-full p-2 border rounded text-sm"/>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Expiry</label>
                            <input type="date" value={data.documents?.emiratesIdExpiry || ''} onChange={e => handleDocChange('emiratesIdExpiry', e.target.value)} className="w-full p-2 border rounded text-sm"/>
                        </div>
                        <div className="row-span-1"></div> {/* Spacer */}

                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Passport No</label>
                            <input type="text" value={data.documents?.passportNumber || ''} onChange={e => handleDocChange('passportNumber', e.target.value)} className="w-full p-2 border rounded text-sm"/>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Expiry</label>
                            <input type="date" value={data.documents?.passportExpiry || ''} onChange={e => handleDocChange('passportExpiry', e.target.value)} className="w-full p-2 border rounded text-sm"/>
                        </div>
                        <div className="row-span-1"></div> {/* Spacer */}

                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Labour Card No</label>
                            <input type="text" value={data.documents?.labourCardNumber || ''} onChange={e => handleDocChange('labourCardNumber', e.target.value)} className="w-full p-2 border rounded text-sm"/>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Expiry</label>
                            <input type="date" value={data.documents?.labourCardExpiry || ''} onChange={e => handleDocChange('labourCardExpiry', e.target.value)} className="w-full p-2 border rounded text-sm"/>
                        </div>
                        
                        <div>
                             <label className="block text-xs font-bold text-indigo-700 mb-1">Vacation Scheduled</label>
                             <input type="date" value={data.vacationScheduledDate || ''} onChange={e => handleChange('vacationScheduledDate', e.target.value)} className="w-full p-2 border border-indigo-200 bg-indigo-50 rounded text-sm"/>
                        </div>
                    </div>

                    {/* Salary */}
                    <div className="bg-gray-50 p-4 rounded border border-gray-200">
                        <h4 className="font-bold text-sm mb-2 text-gray-700">Salary Structure</h4>
                         <div className="grid grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Basic</label>
                                <input type="number" value={data.salary.basic} onChange={e => handleSalaryChange('basic', parseFloat(e.target.value))} className="w-full p-2 border rounded"/>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Housing</label>
                                <input type="number" value={data.salary.housing} onChange={e => handleSalaryChange('housing', parseFloat(e.target.value))} className="w-full p-2 border rounded"/>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Transport</label>
                                <input type="number" value={data.salary.transport} onChange={e => handleSalaryChange('transport', parseFloat(e.target.value))} className="w-full p-2 border rounded"/>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Other</label>
                                <input type="number" value={data.salary.other} onChange={e => handleSalaryChange('other', parseFloat(e.target.value))} className="w-full p-2 border rounded"/>
                            </div>
                         </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Save Changes</button>
                    </div>
                 </form>
            </div>
        </div>
    )
}

const RehireModal = ({ employee, onClose, onConfirm }: { employee: Employee, onClose: () => void, onConfirm: (id: string, date: string, reason: string) => void }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [reason, setReason] = useState('');

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
                 <h3 className="text-lg font-bold mb-4">Re-hire Employee</h3>
                 <p className="text-sm text-gray-600 mb-4">Re-activating <strong>{employee.name}</strong> ({employee.code}). Please provide new joining details.</p>
                 
                 <div className="space-y-4">
                     <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">New Joining Date</label>
                         <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded"/>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Re-joining</label>
                         <textarea 
                            value={reason} 
                            onChange={e => setReason(e.target.value)} 
                            className="w-full p-2 border rounded h-24 resize-none"
                            placeholder="e.g. Contract renewal, Re-hired after break..."
                         ></textarea>
                     </div>
                 </div>

                 <div className="flex justify-end gap-3 mt-6">
                     <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                     <button 
                        onClick={() => onConfirm(employee.id, date, reason)}
                        disabled={!date || !reason}
                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                     >
                         Confirm Re-hire
                     </button>
                 </div>
             </div>
        </div>
    )
}

const HolidayManagementModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [newDate, setNewDate] = useState('');
    const [newName, setNewName] = useState('');

    useEffect(() => {
        if(isOpen) setHolidays(getPublicHolidays());
    }, [isOpen]);

    const handleAdd = () => {
        if (!newDate || !newName) return;
        const updated = savePublicHoliday({
            id: Math.random().toString(36).substr(2, 9),
            date: newDate,
            name: newName
        });
        setHolidays(updated);
        setNewDate('');
        setNewName('');
    }

    const handleDelete = (id: string) => {
        const updated = deletePublicHoliday(id);
        setHolidays(updated);
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900">Manage Public Holidays</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><XCircle className="w-6 h-6"/></button>
                </div>
                
                {/* Add Form */}
                <div className="bg-gray-50 p-4 rounded-lg mb-6 flex gap-3 items-end">
                    <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Date</label>
                        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full p-2 border rounded text-sm"/>
                    </div>
                    <div className="flex-[2]">
                        <label className="block text-xs text-gray-500 mb-1">Holiday Name</label>
                        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="e.g. National Day"/>
                    </div>
                    <button onClick={handleAdd} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">Add</button>
                </div>

                {/* List */}
                <div className="max-h-[300px] overflow-y-auto">
                    <h4 className="text-sm font-bold text-gray-700 mb-2">Existing Holidays</h4>
                    {holidays.length === 0 && <p className="text-sm text-gray-400 italic">No holidays defined.</p>}
                    <ul className="space-y-2">
                        {holidays.map(h => (
                            <li key={h.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50">
                                <div>
                                    <p className="font-bold text-sm text-gray-800">{h.name}</p>
                                    <p className="text-xs text-gray-500">{h.date}</p>
                                </div>
                                <button onClick={() => handleDelete(h.id)} className="text-red-500 hover:text-red-700 p-1">
                                    <Trash2 className="w-4 h-4"/>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    )
}

const PayslipModal = ({ employee, month, year, onClose }: { employee: Employee, month: number, year: number, onClose: () => void }) => {
    const totalDays = new Date(year, month + 1, 0).getDate();
    const salary = employee.salary || { basic: 0, housing: 0, transport: 0, other: 0 };
    const basic = salary.basic || 0;
    const housing = salary.housing || 0;
    const transport = salary.transport || 0;
    const other = salary.other || 0;
    
    const gross = basic + housing + transport + other;
    
    // Calculations
    const records = getAttendanceRange(`${year}-${String(month+1).padStart(2,'0')}-01`, `${year}-${String(month+1).padStart(2,'0')}-${totalDays}`);
    const empRecords = records.filter(r => r.employeeId === employee.id);
    const absentDays = empRecords.filter(r => r.status === AttendanceStatus.ABSENT || r.status === AttendanceStatus.UNPAID_LEAVE || r.status === AttendanceStatus.EMERGENCY_LEAVE).length;
    
    const deductionPerDay = gross / 30; // Simple rule
    const totalDeduction = absentDays * deductionPerDay;
    
    // Additional Earnings
    const { overtimePay, holidayPay, weekOffPay } = calculateAdditionalEarnings(empRecords, employee.team);

    // Calculate Total OT Hours for display (Only show if eligible)
    let totalOTHours = 0;
    if (employee.team !== 'Office Staff') {
        empRecords.forEach(r => {
            if (r.overtimeHours) totalOTHours += r.overtimeHours;
        });
    }

    const netSalary = gross - totalDeduction + overtimePay + holidayPay + weekOffPay;

    const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto print:p-0 print:relative print:bg-white print:z-auto">
            <div className="bg-white w-full max-w-3xl rounded-none shadow-2xl print:shadow-none print:w-full">
                <div className="p-8 border-b border-gray-200 print:border-none">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-indigo-900 text-white flex items-center justify-center text-2xl font-bold">PS</div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900 uppercase">{employee.company}</h1>
                                <p className="text-sm text-gray-500">Navy Gate, Tourist Club Area, Abu Dhabi, UAE</p>
                            </div>
                        </div>
                        <div className="text-right">
                             <h2 className="text-lg font-bold text-gray-800">PaySlip - {monthName}'{year}</h2>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm border border-gray-300 p-4 mb-6">
                        <div><span className="font-bold w-32 inline-block">Employee ID:</span> {employee.code}</div>
                        <div><span className="font-bold w-32 inline-block">Designation:</span> {employee.designation}</div>
                        <div><span className="font-bold w-32 inline-block">Name:</span> {employee.name}</div>
                        <div><span className="font-bold w-32 inline-block">Date of Joining:</span> {employee.joiningDate}</div>
                        <div><span className="font-bold w-32 inline-block">Department:</span> {employee.department}</div>
                        <div><span className="font-bold w-32 inline-block">Location:</span> {employee.workLocation}</div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 text-sm mb-6 bg-gray-50 p-3 border border-gray-200 print:bg-transparent">
                         <div className="text-center"><span className="block font-bold text-gray-500">Calendar Days</span> {totalDays}</div>
                         <div className="text-center"><span className="block font-bold text-gray-500">Paid Days</span> {totalDays - absentDays}</div>
                         <div className="text-center"><span className="block font-bold text-gray-500">Unpaid Days</span> {absentDays}</div>
                         <div className="text-center"><span className="block font-bold text-gray-500">Eligible Leave</span> {employee.leaveBalance}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-0 border border-gray-300 mb-8">
                        <div className="border-r border-gray-300">
                            <div className="bg-gray-100 font-bold p-2 border-b border-gray-300 print:bg-gray-100">Earnings</div>
                            <div className="p-2 flex justify-between"><span>Basic Salary</span> <span>{basic.toFixed(2)}</span></div>
                            <div className="p-2 flex justify-between"><span>Housing Allowance</span> <span>{housing.toFixed(2)}</span></div>
                            <div className="p-2 flex justify-between"><span>Transport Allowance</span> <span>{transport.toFixed(2)}</span></div>
                            <div className="p-2 flex justify-between"><span>Other Allowance</span> <span>{other.toFixed(2)}</span></div>
                            
                            {/* Additional Pay */}
                            {employee.team !== 'Office Staff' && (
                                <div className="p-2 flex justify-between text-blue-700 bg-blue-50 print:bg-transparent print:text-black">
                                    <span>Overtime Pay ({totalOTHours} hrs @ 5/hr)</span> <span>{overtimePay.toFixed(2)}</span>
                                </div>
                            )}
                            {employee.team !== 'Office Staff' && (
                                <div className="p-2 flex justify-between text-blue-700 bg-blue-50 print:bg-transparent print:text-black">
                                    <span>Week Off Work (@5/hr)</span> <span>{weekOffPay.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="p-2 flex justify-between text-blue-700 bg-blue-50 print:bg-transparent print:text-black">
                                <span>Public Holiday Bonus</span> <span>{holidayPay.toFixed(2)}</span>
                            </div>

                            <div className="p-2 flex justify-between font-bold border-t border-gray-200 mt-2 pt-2 bg-gray-50 print:bg-transparent">
                                <span>Total Gross + Additions</span> <span>{(gross + overtimePay + weekOffPay + holidayPay).toFixed(2)}</span>
                            </div>
                        </div>
                        <div>
                            <div className="bg-gray-100 font-bold p-2 border-b border-gray-300 print:bg-gray-100">Deductions</div>
                            <div className="p-2 flex justify-between text-red-600 print:text-black"><span>Unpaid Leave / EL</span> <span>({totalDeduction.toFixed(2)})</span></div>
                            <div className="p-2 flex justify-between"><span>Other</span> <span>-</span></div>
                             <div className="p-2 flex justify-between font-bold border-t border-gray-200 mt-2 pt-2 bg-gray-50 print:bg-transparent">
                                <span>Total Deductions</span> <span>{totalDeduction.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center bg-gray-100 p-4 border border-gray-300 mb-8 print:bg-gray-50">
                        <span className="font-bold text-lg">Net Salary</span>
                        <span className="font-bold text-xl">{netSalary.toFixed(2)} AED</span>
                    </div>

                    <div className="flex justify-between text-sm mt-12 pt-4 border-t border-gray-300">
                         <div>
                            <p className="font-bold">Payment Method: {employee.bankName || 'Cash'}</p>
                            {employee.iban && <p className="text-gray-500">IBAN: {employee.iban}</p>}
                         </div>
                         <div className="text-right">
                            <p className="font-bold">Authorized Signatory</p>
                            <p className="text-gray-500">Perfect Star Group</p>
                         </div>
                    </div>
                </div>
                <div className="bg-gray-50 p-4 flex justify-end gap-3 print:hidden">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded">Close</button>
                    <button onClick={() => window.print()} className="px-4 py-2 bg-indigo-600 text-white rounded flex items-center gap-2 hover:bg-indigo-700"><Printer className="w-4 h-4"/> Print</button>
                </div>
            </div>
        </div>
    )
}

const LeaveRequestModal = ({ employees, onClose, onSuccess }: { employees: Employee[], onClose: () => void, onSuccess: () => void }) => {
  const [empId, setEmpId] = useState('');
  const [type, setType] = useState<AttendanceStatus>(AttendanceStatus.ANNUAL_LEAVE);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empId || !start || !end) return;

    saveLeaveRequest({
      employeeId: empId,
      startDate: start,
      endDate: end,
      type,
      reason
    });
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Apply for Leave</h3>
          <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500 hover:text-gray-800"/></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className="w-full p-2 border rounded" required>
              <option value="">Select Employee</option>
              {employees.filter(e => e.active).map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Leave Type</label>
            <select value={type} onChange={e => setType(e.target.value as AttendanceStatus)} className="w-full p-2 border rounded">
              <option value={AttendanceStatus.ANNUAL_LEAVE}>Annual Leave</option>
              <option value={AttendanceStatus.SICK_LEAVE}>Sick Leave</option>
              <option value={AttendanceStatus.UNPAID_LEAVE}>Unpaid Leave</option>
              <option value={AttendanceStatus.EMERGENCY_LEAVE}>Emergency Leave</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Start Date</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full p-2 border rounded" required/>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">End Date</label>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full p-2 border rounded" required/>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Reason</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full p-2 border rounded h-24 resize-none" required></textarea>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Submit Request</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const OnboardingWizard = ({ onClose, onSave, companies }: { onClose: () => void, onSave: (emp: Employee) => void, companies: string[] }) => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Partial<Employee>>({
    salary: { basic: 0, housing: 0, transport: 0, other: 0 },
    status: 'Active',
    leaveBalance: 30,
    active: true,
    documents: {}
  });

  const handleChange = (field: keyof Employee, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const handleSalaryChange = (field: keyof SalaryStructure, value: number) => {
    setData(prev => ({
      ...prev,
      salary: { ...prev.salary!, [field]: value }
    }));
  };

  const handleDocChange = (field: keyof EmployeeDocuments, value: string) => {
      setData(prev => ({
          ...prev,
          documents: { ...prev.documents, [field]: value }
      }));
  };

  const handleSubmit = () => {
    // Basic validation
    if (!data.name || !data.code) return;
    
    const newEmployee: Employee = {
      id: Math.random().toString(36).substr(2, 9),
      code: data.code!,
      name: data.name!,
      designation: data.designation || 'Staff',
      department: data.department || 'General',
      company: data.company || companies[0],
      joiningDate: data.joiningDate || new Date().toISOString().split('T')[0],
      type: data.type || StaffType.WORKER,
      status: 'Active',
      team: (data.team as any) || 'Internal Team',
      workLocation: data.workLocation || '',
      leaveBalance: data.leaveBalance || 30,
      salary: data.salary as SalaryStructure,
      active: true,
      bankName: data.bankName,
      iban: data.iban,
      documents: data.documents,
      vacationScheduledDate: data.vacationScheduledDate
    };
    onSave(newEmployee);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
          <h3 className="font-bold">Onboard New Employee</h3>
          <button onClick={onClose}><XCircle className="w-5 h-5 text-indigo-200 hover:text-white"/></button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6">
           {/* Simple form for brevity since I am implementing missing code */}
           <div className="grid grid-cols-2 gap-4">
             <input placeholder="Employee Code" value={data.code || ''} onChange={e => handleChange('code', e.target.value)} className="p-2 border rounded" />
             <input placeholder="Full Name" value={data.name || ''} onChange={e => handleChange('name', e.target.value)} className="p-2 border rounded" />
             <input placeholder="Designation" value={data.designation || ''} onChange={e => handleChange('designation', e.target.value)} className="p-2 border rounded" />
             <input placeholder="Department" value={data.department || ''} onChange={e => handleChange('department', e.target.value)} className="p-2 border rounded" />
             <select value={data.company || ''} onChange={e => handleChange('company', e.target.value)} className="p-2 border rounded">
                <option value="">Select Company</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
             <select value={data.type || StaffType.WORKER} onChange={e => handleChange('type', e.target.value)} className="p-2 border rounded">
                <option value={StaffType.WORKER}>Worker</option>
                <option value={StaffType.OFFICE}>Office Staff</option>
             </select>
             <input type="date" placeholder="Joining Date" value={data.joiningDate || ''} onChange={e => handleChange('joiningDate', e.target.value)} className="p-2 border rounded" />
             <select value={data.team || 'Internal Team'} onChange={e => handleChange('team', e.target.value)} className="p-2 border rounded">
                <option value="Internal Team">Internal Team</option>
                <option value="External Team">External Team</option>
                <option value="Office Staff">Office Staff</option>
             </select>
           </div>

            <div className="border-t pt-4">
                <h4 className="font-bold mb-2 text-gray-700">Documents & ID</h4>
                <div className="grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded">
                    <input placeholder="Emirates ID No" value={data.documents?.emiratesId || ''} onChange={e => handleDocChange('emiratesId', e.target.value)} className="p-2 border rounded text-sm" />
                    <div className="col-span-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500">Expires:</span>
                        <input type="date" value={data.documents?.emiratesIdExpiry || ''} onChange={e => handleDocChange('emiratesIdExpiry', e.target.value)} className="p-2 border rounded text-sm flex-1" />
                    </div>

                    <input placeholder="Passport No" value={data.documents?.passportNumber || ''} onChange={e => handleDocChange('passportNumber', e.target.value)} className="p-2 border rounded text-sm" />
                    <div className="col-span-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500">Expires:</span>
                        <input type="date" value={data.documents?.passportExpiry || ''} onChange={e => handleDocChange('passportExpiry', e.target.value)} className="p-2 border rounded text-sm flex-1" />
                    </div>

                    <input placeholder="Labour Card No" value={data.documents?.labourCardNumber || ''} onChange={e => handleDocChange('labourCardNumber', e.target.value)} className="p-2 border rounded text-sm" />
                    <div className="col-span-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500">Expires:</span>
                        <input type="date" value={data.documents?.labourCardExpiry || ''} onChange={e => handleDocChange('labourCardExpiry', e.target.value)} className="p-2 border rounded text-sm flex-1" />
                    </div>
                    
                    <div className="col-span-3 mt-2">
                         <label className="text-xs font-bold text-indigo-600 block mb-1">Next Vacation Schedule</label>
                         <input type="date" value={data.vacationScheduledDate || ''} onChange={e => handleChange('vacationScheduledDate', e.target.value)} className="w-full p-2 border border-indigo-200 bg-indigo-50 rounded" />
                    </div>
                </div>
            </div>

           <div className="border-t pt-4">
             <h4 className="font-bold mb-2">Salary Details</h4>
             <div className="grid grid-cols-4 gap-2">
               <input type="number" placeholder="Basic" value={data.salary?.basic} onChange={e => handleSalaryChange('basic', parseFloat(e.target.value))} className="p-2 border rounded" />
               <input type="number" placeholder="Housing" value={data.salary?.housing} onChange={e => handleSalaryChange('housing', parseFloat(e.target.value))} className="p-2 border rounded" />
               <input type="number" placeholder="Transport" value={data.salary?.transport} onChange={e => handleSalaryChange('transport', parseFloat(e.target.value))} className="p-2 border rounded" />
               <input type="number" placeholder="Other" value={data.salary?.other} onChange={e => handleSalaryChange('other', parseFloat(e.target.value))} className="p-2 border rounded" />
             </div>
           </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Complete Onboarding</button>
        </div>
      </div>
    </div>
  );
};

const OffboardingWizard = ({ employee, onClose, onComplete }: { employee: Employee, onClose: () => void, onComplete: () => void }) => {
  const [details, setDetails] = useState<OffboardingDetails>({
    type: 'Resignation',
    exitDate: new Date().toISOString().split('T')[0],
    reason: '',
    gratuity: 0,
    leaveEncashment: 0,
    salaryDues: 0,
    otherDues: 0,
    deductions: 0,
    netSettlement: 0,
    assetsReturned: false,
    notes: ''
  });

  useEffect(() => {
      // Auto calculate net
      const net = (details.gratuity || 0) + (details.leaveEncashment || 0) + (details.salaryDues || 0) + (details.otherDues || 0) - (details.deductions || 0);
      setDetails(prev => ({ ...prev, netSettlement: net }));
  }, [details.gratuity, details.leaveEncashment, details.salaryDues, details.otherDues, details.deductions]);

  const handleSave = () => {
      offboardEmployee(employee.id, details);
      onComplete();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4 text-red-600">Offboarding: {employee.name}</h3>
        
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold mb-1">Exit Type</label>
                    <select value={details.type} onChange={e => setDetails({...details, type: e.target.value as any})} className="w-full p-2 border rounded">
                        <option>Resignation</option>
                        <option>Termination</option>
                        <option>End of Contract</option>
                        <option>Absconding</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-bold mb-1">Last Working Day</label>
                    <input type="date" value={details.exitDate} onChange={e => setDetails({...details, exitDate: e.target.value})} className="w-full p-2 border rounded" />
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold mb-1">Reason / Notes</label>
                <textarea value={details.reason} onChange={e => setDetails({...details, reason: e.target.value})} className="w-full p-2 border rounded h-20"></textarea>
            </div>

            <div className="bg-gray-50 p-4 rounded border">
                <h4 className="font-bold mb-3">Full & Final Settlement</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs">Gratuity</label><input type="number" value={details.gratuity} onChange={e => setDetails({...details, gratuity: parseFloat(e.target.value) || 0})} className="w-full p-2 border rounded"/></div>
                    <div><label className="text-xs">Leave Encashment</label><input type="number" value={details.leaveEncashment} onChange={e => setDetails({...details, leaveEncashment: parseFloat(e.target.value) || 0})} className="w-full p-2 border rounded"/></div>
                    <div><label className="text-xs">Pending Salary</label><input type="number" value={details.salaryDues} onChange={e => setDetails({...details, salaryDues: parseFloat(e.target.value) || 0})} className="w-full p-2 border rounded"/></div>
                    <div><label className="text-xs">Other Dues</label><input type="number" value={details.otherDues} onChange={e => setDetails({...details, otherDues: parseFloat(e.target.value) || 0})} className="w-full p-2 border rounded"/></div>
                    <div><label className="text-xs text-red-600">Deductions</label><input type="number" value={details.deductions} onChange={e => setDetails({...details, deductions: parseFloat(e.target.value) || 0})} className="w-full p-2 border rounded border-red-200"/></div>
                </div>
                <div className="mt-4 pt-2 border-t flex justify-between items-center">
                    <span className="font-bold">Net Payable:</span>
                    <span className="text-xl font-bold text-indigo-600">{details.netSettlement.toFixed(2)} AED</span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <input type="checkbox" checked={details.assetsReturned} onChange={e => setDetails({...details, assetsReturned: e.target.checked})} id="assets" />
                <label htmlFor="assets" className="text-sm font-medium">All company assets returned (Laptop, SIM, ID Card, etc.)</label>
            </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
             <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
             <button onClick={handleSave} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Confirm Exit</button>
        </div>
      </div>
    </div>
  );
};

const ReportsView = ({ employees, companies }: { employees: Employee[], companies: string[] }) => {
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterCompany, setFilterCompany] = useState('All');
    const [filterTeam, setFilterTeam] = useState('All');
    const [reportData, setReportData] = useState<any[]>([]);
    const [totalCost, setTotalCost] = useState(0);

    useEffect(() => {
        const total = reportData.reduce((sum, row) => sum + parseFloat(row.estimatedCost || 0), 0);
        setTotalCost(total);
    }, [reportData]);

    const generateReport = () => {
        const records = getAttendanceRange(startDate, endDate);
        
        // Filter Employees
        const filteredEmps = employees.filter(e => {
            if (filterCompany !== 'All' && e.company !== filterCompany) return false;
            if (filterTeam !== 'All' && e.team !== filterTeam) return false;
            return true;
        });

        const data = filteredEmps.map(emp => {
            const empRecords = records.filter(r => r.employeeId === emp.id);
            
            let present = 0;
            let absent = 0;
            let leaves = 0;
            let otHours = 0;
            
            empRecords.forEach(r => {
                if (r.status === AttendanceStatus.PRESENT) present++;
                else if (r.status === AttendanceStatus.ABSENT || r.status === AttendanceStatus.UNPAID_LEAVE || r.status === AttendanceStatus.EMERGENCY_LEAVE) absent++;
                else if (r.status === AttendanceStatus.SICK_LEAVE || r.status === AttendanceStatus.ANNUAL_LEAVE) leaves++;

                if (r.overtimeHours) otHours += r.overtimeHours;
            });

            // Financials (Estimated Pro-rata)
            const salary = emp.salary || { basic: 0, housing: 0, transport: 0, other: 0 };
            const gross = (salary.basic || 0) + (salary.housing || 0) + (salary.transport || 0) + (salary.other || 0);
            
            // Daily Rate Logic
            const dailyRate = gross / 30;
            const { overtimePay, holidayPay, weekOffPay } = calculateAdditionalEarnings(empRecords, emp.team);
            
            // Net Estimate
            const diffTime = Math.abs(new Date(endDate).getTime() - new Date(startDate).getTime());
            const totalDaysInRange = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
            const paidDays = totalDaysInRange - absent;

            const estimatedCost = (paidDays * dailyRate) + overtimePay + holidayPay + weekOffPay;

            return {
                code: emp.code,
                name: emp.name,
                company: emp.company,
                team: emp.team,
                present,
                absent,
                leaves,
                otHours: emp.team === 'Office Staff' ? 0 : otHours,
                estimatedCost: estimatedCost.toFixed(2)
            };
        });

        setReportData(data);
    };

    const exportReport = () => {
        if (reportData.length === 0) return;
        const headers = ['Code', 'Name', 'Company', 'Team', 'Present Days', 'Absent Days', 'Leave Days', 'OT Hours', 'Est. Cost (AED)'];
        const csvRows = [
            headers.join(','),
            ...reportData.map(row => [
                row.code,
                `"${row.name}"`,
                `"${row.company}"`,
                row.team,
                row.present,
                row.absent,
                row.leaves,
                row.otHours,
                row.estimatedCost
            ].join(',')),
            `TOTAL,,,,,,,,${totalCost.toFixed(2)}`
        ].join('\n');

        const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `custom_report_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    return (
        <div className="bg-white shadow-sm rounded-xl border border-gray-200 flex flex-col h-full print:shadow-none print:border-none">
            <div className="p-4 border-b bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:bg-white print:border-b-2 print:border-gray-800">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-600"/> Custom Reports
                    </h2>
                    <p className="text-xs text-gray-500 print:hidden">Generate attendance & cost reports for specific periods.</p>
                    <p className="hidden print:block text-sm text-gray-600">Period: {startDate} to {endDate}</p>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                     <button onClick={generateReport} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-sm">
                         Generate Report
                     </button>
                     <button onClick={exportReport} disabled={reportData.length === 0} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 disabled:opacity-50 shadow-sm flex items-center gap-2">
                         <FileDown className="w-4 h-4"/> Export CSV
                     </button>
                     <button onClick={() => window.print()} disabled={reportData.length === 0} className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-900 disabled:opacity-50 shadow-sm flex items-center gap-2">
                         <Printer className="w-4 h-4"/> Print
                     </button>
                </div>
            </div>

            <div className="p-4 border-b bg-white grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
                 <div>
                     <label className="block text-xs font-bold text-gray-500 mb-1">Start Date</label>
                     <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border rounded text-sm"/>
                 </div>
                 <div>
                     <label className="block text-xs font-bold text-gray-500 mb-1">End Date</label>
                     <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 border rounded text-sm"/>
                 </div>
                 <div>
                     <label className="block text-xs font-bold text-gray-500 mb-1">Filter Company</label>
                     <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="w-full p-2 border rounded text-sm">
                         <option value="All">All Companies</option>
                         {companies.map(c => <option key={c} value={c}>{c}</option>)}
                     </select>
                 </div>
                 <div>
                     <label className="block text-xs font-bold text-gray-500 mb-1">Filter Team</label>
                     <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} className="w-full p-2 border rounded text-sm">
                        <option value="All">All Teams</option>
                        <option value="Internal Team">Internal Team</option>
                        <option value="External Team">External Team</option>
                        <option value="Office Staff">Office Staff</option>
                     </select>
                 </div>
            </div>

            {/* Report Summary Header */}
            {reportData.length > 0 && (
                <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center print:bg-gray-50 print:border-gray-200">
                    <div className="text-sm text-indigo-800 print:text-gray-800">
                        Generated for <strong>{reportData.length}</strong> employees.
                    </div>
                    <div className="text-lg font-bold text-indigo-900 print:text-black">
                        Total Cost: {totalCost.toFixed(2)} AED
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-auto p-4 print:overflow-visible">
                {reportData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 print:hidden">
                        <BarChart3 className="w-12 h-12 mb-2 opacity-20"/>
                        <p>Select dates and filters, then click Generate.</p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b print:bg-gray-100">
                            <tr>
                                <th className="p-3 font-medium text-gray-500">Code</th>
                                <th className="p-3 font-medium text-gray-500">Name</th>
                                <th className="p-3 font-medium text-gray-500">Company</th>
                                <th className="p-3 font-medium text-gray-500 text-center">Present</th>
                                <th className="p-3 font-medium text-gray-500 text-center">Absent</th>
                                <th className="p-3 font-medium text-gray-500 text-center">Leave</th>
                                <th className="p-3 font-medium text-gray-500 text-center">OT (Hrs)</th>
                                <th className="p-3 font-medium text-gray-500 text-right">Est. Cost</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {reportData.map((row, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 print:hover:bg-transparent">
                                    <td className="p-3 font-mono text-xs text-gray-600">{row.code}</td>
                                    <td className="p-3 font-medium">{row.name}</td>
                                    <td className="p-3 text-xs text-gray-500 truncate max-w-[150px]">{row.company}</td>
                                    <td className="p-3 text-center text-green-600 font-bold">{row.present}</td>
                                    <td className="p-3 text-center text-red-600 font-bold">{row.absent}</td>
                                    <td className="p-3 text-center text-blue-600">{row.leaves}</td>
                                    <td className="p-3 text-center font-mono">{row.otHours}</td>
                                    <td className="p-3 text-right font-bold text-indigo-600">{row.estimatedCost}</td>
                                </tr>
                            ))}
                            <tr className="bg-gray-100 font-bold border-t-2 border-gray-300 print:bg-gray-50">
                                <td colSpan={7} className="p-3 text-right uppercase text-gray-600">Total Estimated Amount</td>
                                <td className="p-3 text-right text-indigo-800 text-lg">{totalCost.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default function App() {
  // ... (rest of the existing App component code remains exactly the same)
  const [activeTab, setActiveTab] = useState<'timesheet' | 'staff' | 'payroll' | 'leave' | 'reports'>('timesheet');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedTeam, setSelectedTeam] = useState<string>('All');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPayslipEmp, setSelectedPayslipEmp] = useState<Employee | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showEmployeeImport, setShowEmployeeImport] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  
  // Previews & Edits
  const [previewAttachment, setPreviewAttachment] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Offboarding State
  const [selectedOffboardingEmp, setSelectedOffboardingEmp] = useState<Employee | null>(null);

  // Rehire State
  const [selectedRehireEmp, setSelectedRehireEmp] = useState<Employee | null>(null);

  // State for Attendance Action Modal
  const [editingCell, setEditingCell] = useState<{empId: string, date: Date, currentStatus: AttendanceStatus, currentOt: number, empName: string, currentAttachment?: string, isOtEligible: boolean} | null>(null);

  useEffect(() => {
    const data = getEmployees();
    const companyList = getCompanies();
    setEmployees(data);
    setCompanies(companyList);
    refreshRecords();
    
    const todayStr = new Date().toISOString().split('T')[0];
    const existing = getAttendanceRange(todayStr, todayStr);
    if (existing.length === 0 && data.length > 0) {
         seedMonthlyData(currentDate.getFullYear(), currentDate.getMonth());
    }
  }, []);

  useEffect(() => {
      refreshRecords();
  }, [currentDate]);

  useEffect(() => {
    if (activeTab === 'leave') {
      setLeaveRequests(getLeaveRequests().sort((a,b) => b.appliedOn.localeCompare(a.appliedOn)));
    }
  }, [activeTab]);

  const refreshRecords = () => {
      const days = getMonthDays(currentDate);
      const start = days[0].toISOString().split('T')[0];
      const end = days[days.length - 1].toISOString().split('T')[0];
      const range = getAttendanceRange(start, end);
      setRecords(range);
      setLeaveRequests(getLeaveRequests());
  };

  const handleLeaveAction = (id: string, status: LeaveStatus) => {
    updateLeaveRequestStatus(id, status);
    refreshRecords(); // To update the timesheet immediately if approved
    // Reload employees to reflect leave balance deduction if approved
    setEmployees(getEmployees());
  };

  const handleAddEmployee = (emp: Employee) => {
    const updatedList = saveEmployee(emp);
    setEmployees(updatedList);
    setShowOnboarding(false);
  };
  
  const handleUpdateEmployee = (emp: Employee) => {
      const updatedList = updateEmployee(emp);
      setEmployees(updatedList);
      setEditingEmployee(null);
  }

  const handleAttendanceSave = (status: AttendanceStatus, ot: number, attachment?: string) => {
      if (editingCell) {
          const dateStr = editingCell.date.toISOString().split('T')[0];
          logAttendance(editingCell.empId, status, dateStr, ot, attachment);
          refreshRecords();
          setEditingCell(null);
      }
  };
  
  const handleOffboardingComplete = () => {
      setEmployees(getEmployees());
      setSelectedOffboardingEmp(null);
  }

  const handleRehireConfirm = (id: string, date: string, reason: string) => {
      rehireEmployee(id, date, reason);
      setEmployees(getEmployees());
      setSelectedRehireEmp(null);
      alert("Employee re-hired successfully!");
  }

  const handleBulkImport = (csv: string) => {
      const { success, errors } = importAttendanceFromCSV(csv);
      if (errors.length > 0) {
          alert(`Imported ${success} records with errors:\n` + errors.slice(0, 5).join('\n') + (errors.length > 5 ? '\n...' : ''));
      } else {
          alert(`Successfully imported ${success} records.`);
      }
      refreshRecords();
      setShowBulkImport(false);
  }

  const handleEmployeeImport = (csv: string) => {
      const { success, errors } = importEmployeesFromCSV(csv);
      if (errors.length > 0) {
          alert(`Imported ${success} employees with errors:\n` + errors.slice(0, 5).join('\n') + (errors.length > 5 ? '\n...' : ''));
      } else {
          alert(`Successfully imported ${success} employees.`);
      }
      setEmployees(getEmployees());
      setShowEmployeeImport(false);
  }

  const handleCompaniesUpdate = (updated: string[]) => {
      setCompanies(updated);
      // Also refresh employees in case names were updated
      setEmployees(getEmployees());
  }

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const filteredEmployees = employees.filter(e => {
      const matchesCompany = selectedCompany === 'All' || e.company === selectedCompany;
      const matchesTeam = selectedTeam === 'All' || e.team === selectedTeam;
      const matchesSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.code.includes(searchTerm);
      
      // Date Logic for Offboarding/Join visibility
      const viewMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const viewMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const joinDate = new Date(e.joiningDate);
      // Hide if employee joined AFTER the current view month
      if (joinDate > viewMonthEnd) return false;

      // Hide if employee was offboarded BEFORE the current view month
      if (e.status === 'Inactive' && e.offboardingDetails?.exitDate) {
          const exitDate = new Date(e.offboardingDetails.exitDate);
          if (exitDate < viewMonthStart) return false;
      }

      const matchesStatus = selectedStatus === 'All' 
        ? true 
        : e.status === selectedStatus;

      return matchesCompany && matchesStatus && matchesTeam && matchesSearch;
  });

  const monthDays = getMonthDays(currentDate);
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col print:bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 print:hidden">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                        <Building2 className="text-white w-6 h-6" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 hidden sm:block">Perfect Star Group <span className="text-gray-400 font-normal">| HR Portal</span></h1>
                </div>
                
                <div className="flex items-center gap-3 overflow-x-auto pb-2 sm:pb-0">
                    <div className="relative hidden md:block min-w-[200px]">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search name or code..."
                            className="pl-9 pr-4 py-2 bg-gray-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 w-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1">
                        <select 
                            className="bg-transparent border-none text-sm py-2 px-2 w-36 truncate focus:ring-0"
                            value={selectedCompany}
                            onChange={(e) => setSelectedCompany(e.target.value)}
                        >
                            <option value="All">All Companies</option>
                            {companies.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button onClick={() => setShowCompanyModal(true)} title="Manage Companies" className="p-1 hover:bg-gray-200 rounded"><Settings className="w-4 h-4 text-gray-500"/></button>
                    </div>
                    <select 
                        className="bg-gray-100 border-none rounded-lg text-sm py-2 px-3 w-32"
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                    >
                        <option value="All">All Status</option>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                     <select 
                        className="bg-gray-100 border-none rounded-lg text-sm py-2 px-3 w-40"
                        value={selectedTeam}
                        onChange={(e) => setSelectedTeam(e.target.value)}
                    >
                        <option value="All">All Teams</option>
                        <option value="Internal Team">Internal Team</option>
                        <option value="External Team">External Team</option>
                        <option value="Office Staff">Office Staff</option>
                    </select>
                </div>
            </div>
            
            {/* Navigation Tabs */}
            <div className="flex gap-8 -mb-px overflow-x-auto">
                <button 
                    onClick={() => setActiveTab('timesheet')}
                    className={`pb-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'timesheet' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <Calendar className="w-4 h-4" /> Monthly Timesheet
                </button>
                <button 
                     onClick={() => setActiveTab('staff')}
                     className={`pb-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'staff' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <Users className="w-4 h-4" /> Employee Directory
                </button>
                <button 
                     onClick={() => setActiveTab('leave')}
                     className={`pb-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'leave' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <Briefcase className="w-4 h-4" /> Leave Management
                </button>
                <button 
                     onClick={() => setActiveTab('payroll')}
                     className={`pb-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'payroll' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <DollarSign className="w-4 h-4" /> Payroll Register
                </button>
                 <button 
                     onClick={() => setActiveTab('reports')}
                     className={`pb-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'reports' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <BarChart3 className="w-4 h-4" /> Custom Reports
                </button>
            </div>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-auto print:p-0 print:overflow-visible">
        <div className="max-w-[1920px] mx-auto">
            
            {/* TIMESHEET VIEW */}
            {activeTab === 'timesheet' && (
                <div className="bg-white shadow-sm rounded-xl border border-gray-200 flex flex-col h-[calc(100vh-160px)] print:h-auto print:shadow-none print:border-none">
                    {/* Controls */}
                    <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-xl print:hidden flex flex-col lg:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-4">
                             <button onClick={() => handleMonthChange('prev')} className="p-1 hover:bg-white rounded shadow-sm"><ChevronLeft className="w-5 h-5"/></button>
                             <h2 className="text-lg font-bold text-gray-800 min-w-[200px] text-center">{monthName}</h2>
                             <button onClick={() => handleMonthChange('next')} className="p-1 hover:bg-white rounded shadow-sm"><ChevronRight className="w-5 h-5"/></button>
                        </div>
                        
                        {/* Aligned Controls Area */}
                        <div className="flex flex-wrap items-center justify-center lg:justify-end gap-4 flex-1">
                            <div className="flex flex-wrap justify-center gap-2 text-xs bg-white p-2 rounded border border-gray-200 shadow-sm">
                                {Object.entries(ATTENDANCE_LEGEND).map(([key, val]) => (
                                    <span key={key} className={`px-2 py-1 rounded ${val.color} whitespace-nowrap`}>{key}={val.label}</span>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowHolidayModal(true)} className="flex items-center gap-2 text-sm bg-white border border-gray-300 px-3 py-2 rounded hover:bg-gray-50 text-purple-700 border-purple-200 whitespace-nowrap shadow-sm">
                                    <Settings className="w-4 h-4" /> Holidays
                                </button>
                                <button onClick={() => setShowBulkImport(true)} className="flex items-center gap-2 text-sm bg-white border border-gray-300 px-3 py-2 rounded hover:bg-gray-50 whitespace-nowrap shadow-sm">
                                    <FileSpreadsheet className="w-4 h-4" /> Import CSV
                                </button>
                                <button onClick={exportToCSV} className="flex items-center gap-2 text-sm bg-white border border-gray-300 px-3 py-2 rounded hover:bg-gray-50 whitespace-nowrap shadow-sm">
                                    <Download className="w-4 h-4" /> Export
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Grid */}
                    <div className="flex-1 overflow-auto print:overflow-visible">
                        <table className="w-full border-collapse text-xs text-center">
                            <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm print:static print:shadow-none">
                                <tr>
                                    <th className="p-3 border border-gray-300 bg-gray-100 min-w-[60px] sticky left-0 z-20 print:static">Code</th>
                                    <th className="p-3 border border-gray-300 bg-gray-100 min-w-[150px] text-left sticky left-[60px] z-20 print:static">Employee Name</th>
                                    <th className="p-3 border border-gray-300 bg-gray-100 min-w-[100px]">Designation</th>
                                    <th className="p-3 border border-gray-300 bg-gray-100 min-w-[80px]">Leave Bal</th>
                                    <th className="p-2 border border-gray-300 bg-gray-50 min-w-[40px]">OT</th>
                                    {monthDays.map(d => (
                                        <th key={d.getDate()} className={`p-1 border border-gray-300 min-w-[30px] ${d.getDay() === 0 ? 'bg-gray-200' : ''}`}>
                                            {d.getDate()} <br/> <span className="text-[9px] text-gray-500">{d.toLocaleDateString('en-US', {weekday: 'narrow'})}</span>
                                        </th>
                                    ))}
                                    <th className="p-2 border border-gray-300 bg-gray-50 min-w-[40px]">P</th>
                                    <th className="p-2 border border-gray-300 bg-gray-50 min-w-[40px]">A</th>
                                    <th className="p-2 border border-gray-300 bg-gray-50 min-w-[60px]">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmployees.map(emp => {
                                    let present = 0;
                                    let absent = 0;
                                    let totalHours = 0;
                                    let totalOvertime = 0;
                                    
                                    const empRecords = records.filter(r => r.employeeId === emp.id);

                                    monthDays.forEach(d => {
                                        const dateStr = d.toISOString().split('T')[0];
                                        const rec = empRecords.find(r => r.date === dateStr);
                                        if (rec) {
                                            const status = rec.status;
                                            if (status === AttendanceStatus.PRESENT) present++;
                                            if (status === AttendanceStatus.ABSENT) absent++;
                                            if (rec.hoursWorked) totalHours += rec.hoursWorked;
                                            if (rec.overtimeHours) totalOvertime += rec.overtimeHours;
                                        }
                                    });

                                    return (
                                        <tr key={emp.id} className="hover:bg-blue-50">
                                            <td className="p-2 border border-gray-300 sticky left-0 bg-white z-10 font-medium print:static">{emp.code}</td>
                                            <td className="p-2 border border-gray-300 text-left sticky left-[60px] bg-white z-10 font-medium whitespace-nowrap print:static">{emp.name}</td>
                                            <td className="p-2 border border-gray-300 text-gray-500 whitespace-nowrap">{emp.designation}</td>
                                            <td className="p-2 border border-gray-300 font-bold text-blue-600 bg-gray-50">{emp.leaveBalance}</td>
                                            <td className="p-2 border border-gray-300 font-bold text-indigo-600 bg-indigo-50">
                                              {emp.team === 'Office Staff' ? '-' : (totalOvertime > 0 ? totalOvertime : '-')}
                                            </td>
                                            {monthDays.map(d => {
                                                const dateStr = d.toISOString().split('T')[0];
                                                const rec = empRecords.find(r => r.date === dateStr);
                                                const status = rec?.status || '-';
                                                
                                                let cellClass = '';
                                                if (status === AttendanceStatus.PRESENT) cellClass = 'bg-green-100 text-green-700';
                                                if (status === AttendanceStatus.ABSENT) cellClass = 'bg-red-100 text-red-700 font-bold';
                                                if (status === AttendanceStatus.WEEK_OFF) cellClass = 'bg-gray-100 text-gray-400';
                                                if (status === AttendanceStatus.PUBLIC_HOLIDAY) cellClass = 'bg-purple-100 text-purple-700';
                                                if (status === AttendanceStatus.SICK_LEAVE) cellClass = 'bg-orange-100 text-orange-700';
                                                if (status === AttendanceStatus.ANNUAL_LEAVE) cellClass = 'bg-blue-100 text-blue-700';
                                                if (status === AttendanceStatus.UNPAID_LEAVE) cellClass = 'bg-red-50 text-red-600';
                                                if (status === AttendanceStatus.EMERGENCY_LEAVE) cellClass = 'bg-pink-100 text-pink-700';

                                                return (
                                                    <td 
                                                        key={d.getDate()} 
                                                        className={`border border-gray-300 cursor-pointer hover:opacity-80 relative ${cellClass}`}
                                                        onClick={() => {
                                                            setEditingCell({
                                                                empId: emp.id,
                                                                date: d,
                                                                currentStatus: status as AttendanceStatus || AttendanceStatus.PRESENT,
                                                                currentOt: rec?.overtimeHours || 0,
                                                                empName: emp.name,
                                                                currentAttachment: rec?.otAttachment,
                                                                isOtEligible: emp.team !== 'Office Staff'
                                                            });
                                                        }}
                                                        title={rec?.overtimeHours && emp.team !== 'Office Staff' ? `Overtime: ${rec.overtimeHours}h` : undefined}
                                                    >
                                                        {ATTENDANCE_LEGEND[status as AttendanceStatus]?.code || ''}
                                                        {rec?.overtimeHours && emp.team !== 'Office Staff' ? <div className="text-[8px] -mt-1 font-bold text-indigo-600">+{rec.overtimeHours}</div> : null}
                                                        {rec?.otAttachment && <Paperclip className="w-3 h-3 absolute top-0 right-0 text-gray-500 opacity-70" />}
                                                    </td>
                                                )
                                            })}
                                            <td className="p-2 border border-gray-300 font-bold text-green-600 bg-gray-50">{present}</td>
                                            <td className="p-2 border border-gray-300 font-bold text-red-600 bg-gray-50">{absent}</td>
                                            <td className="p-2 border border-gray-300 font-bold text-gray-700 bg-gray-50">{totalHours}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {/* ... (Rest of the tabs: staff, leave, payroll) - keeping code structure identical */}
            {/* STAFF DIRECTORY (Same as existing) */}
            {activeTab === 'staff' && (
                <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden flex flex-col h-full print:h-auto print:border-none">
                     {/* ... Staff Directory Table ... */}
                     <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 print:hidden">
                         <h2 className="text-lg font-bold text-gray-800">Employee Directory</h2>
                         <div className="flex gap-2">
                             <button 
                                onClick={() => setShowEmployeeImport(true)}
                                className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm"
                             >
                                 <Upload className="w-5 h-5" /> Import
                             </button>
                             <button 
                                onClick={() => setShowOnboarding(true)}
                                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-md"
                             >
                                 <UserPlus className="w-5 h-5" /> Onboard Employee
                             </button>
                         </div>
                     </div>
                     <div className="overflow-x-auto print:overflow-visible">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase">Code</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase">Desig.</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase">Dept</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase">Company</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase">Team</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase">Status</th>
                                    {/* Extended Columns */}
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase bg-indigo-50">Emirates ID</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase bg-indigo-50">Expires</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase">Passport</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase">Expires</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase">Labour Card</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase">Expires</th>
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase text-purple-600">Vacation</th>
                                    
                                    <th className="px-4 py-3 font-medium text-gray-500 uppercase print:hidden sticky right-0 bg-gray-50 shadow-l">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredEmployees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-mono text-gray-600">{emp.code}</td>
                                        <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                                        <td className="px-4 py-3 text-gray-500">{emp.designation}</td>
                                        <td className="px-4 py-3 text-gray-500">{emp.department}</td>
                                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate" title={emp.company}>{emp.company}</td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">{emp.team}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${emp.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{emp.status}</span>
                                        </td>
                                        {/* Document Data */}
                                        <td className="px-4 py-3 text-xs font-mono text-gray-600 bg-gray-50">{emp.documents?.emiratesId || '-'}</td>
                                        <td className={`px-4 py-3 text-xs ${getDateColor(emp.documents?.emiratesIdExpiry, 'standard')} bg-gray-50`}>
                                            {emp.documents?.emiratesIdExpiry || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-xs font-mono text-gray-600">{emp.documents?.passportNumber || '-'}</td>
                                        <td className={`px-4 py-3 text-xs ${getDateColor(emp.documents?.passportExpiry, 'passport')}`}>
                                            {emp.documents?.passportExpiry || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-xs font-mono text-gray-600">{emp.documents?.labourCardNumber || '-'}</td>
                                        <td className={`px-4 py-3 text-xs ${getDateColor(emp.documents?.labourCardExpiry, 'standard')}`}>
                                            {emp.documents?.labourCardExpiry || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-xs font-medium text-purple-700">{emp.vacationScheduledDate || '-'}</td>

                                        <td className="px-4 py-3 print:hidden flex gap-2 sticky right-0 bg-white shadow-l">
                                            {emp.status === 'Active' && (
                                                <>
                                                    <button 
                                                        onClick={() => setEditingEmployee(emp)}
                                                        className="text-blue-600 hover:bg-blue-50 p-2 rounded flex items-center gap-1 text-xs font-medium"
                                                        title="Edit Profile"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => setSelectedOffboardingEmp(emp)}
                                                        className="text-red-600 hover:bg-red-50 p-2 rounded flex items-center gap-1 text-xs font-medium"
                                                        title="Offboard Employee"
                                                    >
                                                        <UserMinus className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                            {emp.status === 'Inactive' && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-400 italic">Exited {emp.offboardingDetails?.exitDate}</span>
                                                    <button 
                                                        onClick={() => setSelectedRehireEmp(emp)}
                                                        className="text-green-600 hover:bg-green-50 p-2 rounded flex items-center gap-1 text-xs font-medium"
                                                        title="Re-hire Employee"
                                                    >
                                                        <UserCheck className="w-4 h-4" /> Re-join
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* LEAVE MANAGEMENT (Same as existing) */}
            {activeTab === 'leave' && (
                <div className="space-y-6 print:hidden">
                    {/* ... Leave content ... */}
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-gray-800">Leave Applications</h2>
                        <button 
                          onClick={() => setShowLeaveModal(true)}
                          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-md"
                        >
                          <Plus className="w-4 h-4" /> Apply for Leave
                        </button>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-200 bg-yellow-50">
                            <h3 className="font-bold text-yellow-800">Pending Approvals</h3>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {leaveRequests.filter(r => r.status === LeaveStatus.PENDING).length === 0 ? (
                                <div className="p-8 text-center text-gray-500">No pending requests.</div>
                            ) : (
                                leaveRequests.filter(r => r.status === LeaveStatus.PENDING).map(req => {
                                    const emp = employees.find(e => e.id === req.employeeId);
                                    const label = ATTENDANCE_LEGEND[req.type]?.label || req.type;
                                    return (
                                        <div key={req.id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-gray-50">
                                            <div className="flex gap-4 items-center">
                                                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600">
                                                    {emp?.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-900">{emp?.name} <span className="text-xs font-normal text-gray-500">({emp?.designation})</span></h4>
                                                    <p className="text-sm text-gray-600">Requesting <span className="font-medium text-indigo-600">{label}</span> from {req.startDate} to {req.endDate}</p>
                                                    <p className="text-xs text-gray-500 mt-1">Reason: {req.reason}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                  onClick={() => handleLeaveAction(req.id, LeaveStatus.REJECTED)}
                                                  className="flex items-center gap-1 px-3 py-2 text-sm text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200"
                                                >
                                                  <XCircle className="w-4 h-4"/> Reject
                                                </button>
                                                <button 
                                                  onClick={() => handleLeaveAction(req.id, LeaveStatus.APPROVED)}
                                                  className="flex items-center gap-1 px-3 py-2 text-sm text-green-700 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200"
                                                >
                                                  <CheckCircle className="w-4 h-4"/> Approve
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-200 bg-gray-50">
                            <h3 className="font-bold text-gray-700">Request History</h3>
                        </div>
                         <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 font-medium text-gray-500">Employee</th>
                                        <th className="px-6 py-3 font-medium text-gray-500">Type</th>
                                        <th className="px-6 py-3 font-medium text-gray-500">Duration</th>
                                        <th className="px-6 py-3 font-medium text-gray-500">Reason</th>
                                        <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {leaveRequests.filter(r => r.status !== LeaveStatus.PENDING).map(req => {
                                        const emp = employees.find(e => e.id === req.employeeId);
                                         const label = ATTENDANCE_LEGEND[req.type]?.label || req.type;
                                        return (
                                            <tr key={req.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 font-medium">{emp?.name}</td>
                                                <td className="px-6 py-4 text-gray-600">{label}</td>
                                                <td className="px-6 py-4 text-gray-600">{req.startDate} <span className="text-gray-400">to</span> {req.endDate}</td>
                                                <td className="px-6 py-4 text-gray-500 italic truncate max-w-[200px]">{req.reason}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                        req.status === LeaveStatus.APPROVED ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {req.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* PAYROLL REGISTER (Same as existing) */}
            {activeTab === 'payroll' && (
                <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden print:shadow-none print:border-none">
                     {/* ... Payroll Table ... */}
                     <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 print:hidden">
                        <h2 className="text-lg font-bold text-gray-800">Staff Payroll Register - {monthName}</h2>
                        <button 
                            onClick={() => window.print()}
                            className="flex items-center gap-2 text-sm bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                        >
                            <Printer className="w-4 h-4" /> Print Summary
                        </button>
                     </div>
                     <div className="overflow-x-auto print:overflow-visible">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-100 border-b border-gray-200">
                                <tr>
                                    <th className="p-3 font-medium text-gray-600 border-r">Emp</th>
                                    <th className="p-3 font-medium text-gray-600 border-r">Name</th>
                                    <th className="p-3 font-medium text-gray-600 border-r text-right bg-blue-50">Basic</th>
                                    <th className="p-3 font-medium text-gray-600 border-r text-right bg-blue-50">Housing</th>
                                    <th className="p-3 font-medium text-gray-600 border-r text-right bg-blue-50">Other</th>
                                    <th className="p-3 font-medium text-gray-600 border-r text-right bg-green-50">Total Gross</th>
                                    <th className="p-3 font-medium text-gray-600 border-r text-center">Paid Days</th>
                                    <th className="p-3 font-medium text-gray-600 border-r text-right text-blue-600">Additions (OT/PH)</th>
                                    <th className="p-3 font-medium text-gray-600 border-r text-right text-red-600">Deductions</th>
                                    <th className="p-3 font-medium text-gray-600 border-r text-right bg-yellow-50 font-bold">Net Salary</th>
                                    <th className="p-3 font-medium text-gray-600 text-center print:hidden">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredEmployees.map(emp => {
                                    const salary = emp.salary || { basic: 0, housing: 0, transport: 0, other: 0 };
                                    const basic = salary.basic || 0;
                                    const housing = salary.housing || 0;
                                    const transport = salary.transport || 0;
                                    const other = salary.other || 0;
                                    const gross = basic + housing + transport + other;
                                    
                                    // Calculate Deductions based on Attendance
                                    const empRecords = records.filter(r => r.employeeId === emp.id);
                                    const absentDays = empRecords.filter(r => r.status === AttendanceStatus.ABSENT || r.status === AttendanceStatus.UNPAID_LEAVE || r.status === AttendanceStatus.EMERGENCY_LEAVE).length;
                                    const daysInMonth = monthDays.length;
                                    const paidDays = daysInMonth - absentDays;
                                    
                                    const perDaySalary = gross / 30; // Standard 30 days usually
                                    const deductionAmount = absentDays * perDaySalary;

                                    // Calculate Additions
                                    const { overtimePay, holidayPay, weekOffPay } = calculateAdditionalEarnings(empRecords, emp.team);
                                    const totalAdditions = overtimePay + holidayPay + weekOffPay;

                                    const netSalary = gross - deductionAmount + totalAdditions;

                                    return (
                                        <tr key={emp.id} className="hover:bg-gray-50">
                                            <td className="p-3 border-r font-mono">{emp.code}</td>
                                            <td className="p-3 border-r font-medium">{emp.name}</td>
                                            <td className="p-3 border-r text-right">{basic.toLocaleString()}</td>
                                            <td className="p-3 border-r text-right">{housing.toLocaleString()}</td>
                                            <td className="p-3 border-r text-right">{other.toLocaleString()}</td>
                                            <td className="p-3 border-r text-right font-medium bg-blue-50">{gross.toLocaleString()}</td>
                                            <td className="p-3 border-r text-center">{paidDays}</td>
                                            <td className="p-3 border-r text-right text-blue-600">{totalAdditions > 0 ? `+${totalAdditions.toFixed(2)}` : '-'}</td>
                                            <td className="p-3 border-r text-right text-red-600">{deductionAmount > 0 ? `(${deductionAmount.toFixed(2)})` : '-'}</td>
                                            <td className="p-3 border-r text-right font-bold bg-yellow-50">{netSalary.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                            <td className="p-3 text-center print:hidden">
                                                <button 
                                                    onClick={() => setSelectedPayslipEmp(emp)}
                                                    className="text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1 w-full"
                                                >
                                                    <FileText className="w-4 h-4" /> Slip
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* CUSTOM REPORTS */}
            {activeTab === 'reports' && (
                <ReportsView employees={employees} companies={companies} />
            )}
        </div>
      </main>
      
      {/* ... (Modals remain unchanged) ... */}
      {selectedPayslipEmp && (
          <PayslipModal 
            employee={selectedPayslipEmp} 
            month={currentDate.getMonth()} 
            year={currentDate.getFullYear()} 
            onClose={() => setSelectedPayslipEmp(null)} 
          />
      )}

      {editingCell && (
          <AttendanceActionModal 
            isOpen={!!editingCell}
            onClose={() => setEditingCell(null)}
            onSave={handleAttendanceSave}
            employeeName={editingCell.empName}
            date={editingCell.date}
            currentStatus={editingCell.currentStatus}
            currentOt={editingCell.currentOt}
            currentAttachment={editingCell.currentAttachment}
            onPreview={setPreviewAttachment}
            isOtEligible={editingCell.isOtEligible}
          />
      )}

      {showLeaveModal && (
        <LeaveRequestModal 
          employees={employees}
          onClose={() => setShowLeaveModal(false)}
          onSuccess={() => {
            setShowLeaveModal(false);
            refreshRecords();
          }}
        />
      )}

      {showOnboarding && (
        <OnboardingWizard 
          onClose={() => setShowOnboarding(false)}
          onSave={handleAddEmployee}
          companies={companies}
        />
      )}
      
      {selectedOffboardingEmp && (
          <OffboardingWizard
            employee={selectedOffboardingEmp}
            onClose={() => setSelectedOffboardingEmp(null)}
            onComplete={handleOffboardingComplete}
          />
      )}
      
      {selectedRehireEmp && (
          <RehireModal
            employee={selectedRehireEmp}
            onClose={() => setSelectedRehireEmp(null)}
            onConfirm={handleRehireConfirm}
          />
      )}

      <HolidayManagementModal 
        isOpen={showHolidayModal}
        onClose={() => setShowHolidayModal(false)}
      />

      <ManageCompaniesModal
        isOpen={showCompanyModal}
        onClose={() => setShowCompanyModal(false)}
        companies={companies}
        onDataChange={handleCompaniesUpdate}
      />

      {previewAttachment && (
          <DocumentPreviewModal 
             isOpen={!!previewAttachment}
             onClose={() => setPreviewAttachment(null)}
             attachment={previewAttachment}
          />
      )}

      <BulkImportModal 
          isOpen={showBulkImport}
          onClose={() => setShowBulkImport(false)}
          onImport={handleBulkImport}
      />

      <EmployeeImportModal
          isOpen={showEmployeeImport}
          onClose={() => setShowEmployeeImport(false)}
          onImport={handleEmployeeImport}
      />

      {editingEmployee && (
          <EditEmployeeModal 
            employee={editingEmployee}
            companies={companies}
            onClose={() => setEditingEmployee(null)}
            onSave={handleUpdateEmployee}
          />
      )}
    </div>
  );
}
