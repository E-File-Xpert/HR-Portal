import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, Calendar, Settings, Upload, UserPlus, LogOut, 
  Building2, CheckCircle, XCircle, User, Check, Trash2, 
  AlertCircle, Paperclip, Eye, Edit, Lock, CheckSquare, 
  Square, Camera, RefreshCcw, Copy, FileText, Download,
  Printer, DollarSign, ChevronLeft, ChevronRight, Search,
  History, BarChart3, FileDown, Menu, Wallet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  Employee, AttendanceRecord, AttendanceStatus, StaffType, 
  LeaveRequest, LeaveStatus, PublicHoliday, OffboardingDetails, 
  SystemUser, UserRole, AboutData, SalaryStructure, DeductionRecord
} from './types';
import { 
  getEmployees, saveEmployee, offboardEmployee, rehireEmployee,
  getAttendanceRange, logAttendance, deleteAttendanceRecord, copyDayAttendance,
  getLeaveRequests, saveLeaveRequest, updateLeaveRequestStatus,
  getPublicHolidays, savePublicHoliday, deletePublicHoliday,
  getCompanies, addCompany, updateCompany, deleteCompany,
  getSystemUsers, addSystemUser, updateSystemUser, deleteSystemUser,
  getAboutData, saveAboutData,
  importAttendanceFromCSV, importEmployeesFromCSV,
  getDeductions, saveDeduction, deleteDeduction
} from './services/storageService';
import { PUBLIC_HOLIDAYS } from './constants';

// --- Constants for Grid ---
const LEGEND = {
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
    for (let i = 1; i <= days; i++) {
        result.push(new Date(y, m, i));
    }
    return result;
};

const formatDateLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const calculateAdditionalEarnings = (records: AttendanceRecord[], team: string) => {
    let overtimePay = 0;
    let holidayPay = 0;
    let weekOffPay = 0;
    let totalOTHours = 0;
    const HOURLY_OT_RATE = 5;
    const WEEK_OFF_HOURLY_RATE = 5;
    const HOLIDAY_BONUS_FLAT = 50;

    const isOtEligible = team !== 'Office Staff';

    records.forEach(r => {
        if (isOtEligible && r.overtimeHours > 0) {
            overtimePay += r.overtimeHours * HOURLY_OT_RATE;
            totalOTHours += r.overtimeHours;
        }
        // Public Holiday
        if (isOtEligible && PUBLIC_HOLIDAYS.includes(r.date) && r.status === AttendanceStatus.PRESENT) {
            holidayPay += HOLIDAY_BONUS_FLAT;
        }
        // Week Off (Sunday)
        const dateObj = new Date(r.date);
        if (isOtEligible && dateObj.getDay() === 0 && r.status === AttendanceStatus.PRESENT) {
            weekOffPay += (r.hoursWorked || 8) * WEEK_OFF_HOURLY_RATE;
        }
    });
    return { overtimePay, holidayPay, weekOffPay, totalOTHours };
};

const getDateColor = (dateStr: string | undefined, type: 'standard' | 'passport' = 'standard') => {
    if (!dateStr) return 'text-gray-500';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(dateStr);
    if (isNaN(expiry.getTime())) return 'text-gray-500';
    
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded'; // Expired
    
    if (type === 'passport') {
        if (diffDays <= 180) return 'text-yellow-600 font-bold bg-yellow-50 px-2 py-0.5 rounded'; // < 6 months
    } else {
        if (diffDays <= 30) return 'text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded'; // < 1 month
    }
    return 'text-gray-600 font-mono';
};

const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

const handleFileImport = async (file: File, callback: (text: string) => void) => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            callback(text);
        };
        reader.readAsText(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        try {
            const data = await readFileAsArrayBuffer(file);
            const workbook = XLSX.read(data);
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const csvText = XLSX.utils.sheet_to_csv(worksheet);
            callback(csvText);
        } catch (err) {
            console.error("Error parsing Excel file", err);
            alert("Failed to parse Excel file. Please check the format.");
        }
    } else {
        alert("Unsupported file type. Please upload .csv, .xlsx, or .xls");
    }
};

// --- Sub Components ---
// (LoginScreen, DocumentPreviewModal, AttendanceActionModal, BulkImportModal, EmployeeImportModal, HolidayManagementModal, CopyAttendanceModal, LeaveRequestModal, DeductionModal, DeductionsView, UserManagementModal, ExEmployeeDetailsModal, EditEmployeeModal, AboutView, OnboardingWizard, ManageCompaniesModal, OffboardingWizard, PayslipModal, RehireModal, ReportsView omitted for brevity but assumed to be present in the full file content if I were replacing the whole file. For the update block I will just include the changed parts or the main App component.)

// Due to the file size and structure, I'll provide the updated App component fully to ensure context is maintained, including the necessary imports and state logic.
// Note: I'm including the previous sub-components by reference in the real code, but here I must output the full file content as per instructions.
// Wait, the instruction says "Full content of file_2". So I must output everything. 

// RE-INCLUDING ALL SUB-COMPONENTS IS REQUIRED.
// To avoid hitting token limits if any, I will try to be efficient but complete.

const LoginScreen = ({ onLogin }: { onLogin: (user: SystemUser) => void }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        const users = getSystemUsers();
        const user = users.find(u => u.username === username && u.password === password && u.active);
        if (user) {
            onLogin(user);
        } else {
            setError("Invalid credentials or inactive account");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <div className="bg-indigo-600 p-3 rounded-lg">
                        <Building2 className="w-8 h-8 text-white" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">ShiftSync</h2>
                {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm text-center font-medium">{error}</div>}
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                        <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Enter username" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Enter password" />
                    </div>
                    <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-lg">Login to Portal</button>
                </form>
            </div>
        </div>
    );
};

const DocumentPreviewModal = ({ isOpen, onClose, attachment }: any) => {
    if (!isOpen) return null;
    const isPdf = attachment.startsWith('data:application/pdf');
    const isImage = attachment.startsWith('data:image');

    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-4xl h-[80vh] rounded-xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b bg-gray-50">
                    <h3 className="font-bold">Document Preview</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500 hover:text-gray-800" /></button>
                </div>
                <div className="flex-1 bg-gray-200 flex items-center justify-center overflow-auto p-4">
                    {isImage ? (
                        <img src={attachment} alt="Preview" className="max-w-full max-h-full object-contain shadow-lg rounded" />
                    ) : (
                        <iframe src={attachment} className="w-full h-full bg-white shadow-lg rounded" title="Preview"></iframe>
                    )}
                    {!isImage && !isPdf && (
                        <div className="text-center bg-white p-8 rounded shadow">
                            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500 mb-4">Preview not available.</p>
                            <a href={attachment} download="document" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2 mx-auto w-fit">
                                <Download className="w-4 h-4" /> Download File
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const AttendanceActionModal = ({ isOpen, onClose, onSave, onDelete, employeeName, date, currentStatus, currentOt, currentAttachment, currentNote, onPreview, isOtEligible }: any) => {
    const [status, setStatus] = useState(currentStatus);
    const [ot, setOt] = useState(currentOt);
    const [file, setFile] = useState<File | null>(null);
    const [note, setNote] = useState(currentNote || '');

    useEffect(() => {
        setStatus(currentStatus);
        setOt(currentOt);
        setNote(currentNote || '');
        setFile(null);
    }, [isOpen, currentStatus, currentOt, currentNote]);

    const handleSave = async () => {
        let attachmentStr = currentAttachment;
        if (file) {
            attachmentStr = await readFileAsBase64(file);
        }
        onSave(status, ot, attachmentStr, note);
    };

    const handlePreview = async () => {
        if (file) {
            const b64 = await readFileAsBase64(file);
            onPreview(b64);
        } else if (currentAttachment) {
            onPreview(currentAttachment);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
                <h3 className="font-bold text-lg mb-1">Update Attendance</h3>
                <p className="text-sm text-gray-500 mb-4">{employeeName} - {date}</p>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full p-2 border rounded">
                            {Object.entries(LEGEND).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                            ))}
                        </select>
                    </div>
                    
                    {isOtEligible && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Overtime (Hours)</label>
                            <input type="number" min="0" max="12" value={ot} onChange={(e) => setOt(Number(e.target.value))} className="w-full p-2 border rounded" />
                        </div>
                    )}

                    {isOtEligible && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">OT Proof (Document/Image)</label>
                            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-sm text-gray-500 mb-2" accept="image/*,application/pdf" />
                            {(currentAttachment || file) && (
                                <div className="flex items-center justify-between bg-gray-50 p-2 rounded border">
                                    <span className="text-xs text-gray-600 flex items-center gap-1 truncate max-w-[150px]">
                                        <Paperclip className="w-3 h-3" /> {file ? `Selected: ${file.name}` : 'Current File Attached'}
                                    </span>
                                    <button type="button" onClick={handlePreview} className="text-xs text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                                        <Eye className="w-3 h-3" /> Preview
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="Optional note (e.g. Late arrival)"></textarea>
                    </div>
                </div>

                <div className="flex justify-between mt-6">
                     <button onClick={onDelete} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded flex items-center gap-2 border border-red-200 text-xs md:text-sm font-medium">
                        <Trash2 className="w-4 h-4" /> Clear Status
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded text-xs md:text-sm">Cancel</button>
                        <button onClick={handleSave} className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs md:text-sm">Save</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const BulkImportModal = ({ isOpen, onClose, onImport }: any) => {
    const [csv, setCsv] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const downloadSample = () => {
        const headers = "EmployeeCode,Date,Status,Overtime";
        const row1 = "10001,2025/12/01,P,2";
        const row2 = "10002,2025/12/01,A,0";
        const content = `${headers}\n${row1}\n${row2}`;
        const blob = new Blob([content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'attendance_sample_yyyy_mm_dd.csv';
        a.click();
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileImport(e.target.files[0], (text) => setCsv(text));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-6 flex flex-col h-[80vh] max-h-[80vh]">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">Bulk Import Attendance</h3>
                    <button onClick={downloadSample} className="flex items-center gap-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded border border-blue-200">
                        <Download className="w-3 h-3" /> Download Sample CSV
                    </button>
                </div>
                
                <div className="mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex flex-col items-center justify-center text-center">
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 font-medium mb-1">Upload CSV or Excel File</p>
                    <input type="file" ref={fileInputRef} onChange={onFileChange} accept=".csv, .xlsx, .xls" className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                </div>

                <p className="text-xs font-bold mb-1">Or paste CSV data here:</p>
                <textarea value={csv} onChange={e => setCsv(e.target.value)} className="flex-1 w-full p-4 border rounded font-mono text-xs" placeholder="Format: EmployeeCode, Date(YYYY/MM/DD), Status(P/A/etc), OT(number)"></textarea>
                
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                    <button onClick={() => onImport(csv)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Import</button>
                </div>
            </div>
        </div>
    );
};

const EmployeeImportModal = ({ isOpen, onClose, onImport }: any) => {
    const [csv, setCsv] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const downloadSample = () => {
        const headers = "Code,Name,Designation,Department,Company,JoiningDate,Type,Status,Team,Location,Basic,Housing,Transport,Other,AirTicket,LeaveSalary,EmiratesID,EIDExpiry,Passport,PassExpiry,LabourCard,LCExpiry,VacationDate";
        const row1 = "EMP001,John Doe,Manager,IT,MyCompany,2025-01-01,Staff,Active,Office Staff,Dubai,5000,2000,1000,500,0,0,784-1234-1234567-1,2026-01-01,N123456,2030-01-01,12345678,2026-05-01,2025-12-15";
        const content = `${headers}\n${row1}`;
        const blob = new Blob([content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'employee_import_sample.csv';
        a.click();
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileImport(e.target.files[0], (text) => setCsv(text));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-6 flex flex-col h-[80vh] max-h-[80vh]">
                <div className="flex justify-between items-center mb-4 border-b pb-4">
                    <h3 className="font-bold text-lg text-gray-800">Bulk Import Employees</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500 hover:text-gray-700" /></button>
                </div>
                
                <div className="mb-4 p-8 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 flex flex-col items-center justify-center text-center hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-10 h-10 text-indigo-400 mb-3" />
                    <p className="text-sm text-gray-700 font-medium mb-1">Click to Upload CSV or Excel</p>
                    <p className="text-xs text-gray-500">or drag and drop here</p>
                    <input type="file" ref={fileInputRef} onChange={onFileChange} accept=".csv, .xlsx, .xls" className="hidden" />
                </div>

                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-700">CSV Content Preview:</p>
                    <div className="flex items-center gap-2">
                        <button onClick={downloadSample} className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline">
                            <Download className="w-3 h-3" /> Sample
                        </button>
                        <span className="text-[10px] text-gray-500">Header: Code, Name, Designation...</span>
                    </div>
                </div>
                <textarea value={csv} onChange={e => setCsv(e.target.value)} className="flex-1 w-full p-4 border rounded-lg font-mono text-xs bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none resize-none" placeholder="Paste CSV data here..."></textarea>
                
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancel</button>
                    <button onClick={() => onImport(csv)} disabled={!csv} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center gap-2">
                        <FileDown className="w-4 h-4" /> Import Employees
                    </button>
                </div>
            </div>
        </div>
    );
};

const HolidayManagementModal = ({ isOpen, onClose }: any) => {
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [newDate, setNewDate] = useState('');
    const [newName, setNewName] = useState('');

    useEffect(() => {
        if (isOpen) setHolidays(getPublicHolidays());
    }, [isOpen]);

    const handleAdd = () => {
        if (newDate && newName) {
            const updated = savePublicHoliday({ id: Math.random().toString(), date: newDate, name: newName });
            setHolidays(updated);
            setNewDate('');
            setNewName('');
        }
    };

    const handleDelete = (id: string) => {
        if(window.confirm("Remove this holiday?")) {
            const updated = deletePublicHoliday(id);
            setHolidays(updated);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600"/> Public Holidays</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500 hover:text-gray-700" /></button>
                </div>

                <div className="flex gap-2 mb-6 items-center">
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="flex-1 border rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-10" />
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Holiday Name" className="flex-[1.5] border rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-10" />
                    <button onClick={handleAdd} disabled={!newDate || !newName} className="bg-indigo-600 text-white px-4 h-10 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center"><Check className="w-5 h-5" /></button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {holidays.length === 0 && <p className="text-sm text-gray-400 text-center py-8 italic">No holidays configured.</p>}
                    {holidays.map(h => (
                        <div key={h.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border hover:border-indigo-200 transition-colors group">
                            <div>
                                <div className="font-bold text-sm text-gray-800">{h.name}</div>
                                <div className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3"/> {h.date}</div>
                            </div>
                            <button onClick={() => handleDelete(h.id)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const CopyAttendanceModal = ({ isOpen, onClose, onCopy }: any) => {
    const [sourceDate, setSourceDate] = useState(formatDateLocal(new Date()));
    const [targetDate, setTargetDate] = useState(formatDateLocal(new Date(Date.now() + 86400000)));

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl max-w-md w-full shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Copy className="w-5 h-5 text-orange-500"/> Copy Attendance</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-600" /></button>
                </div>
                
                <div className="space-y-4 mb-6">
                    <div className="p-4 bg-orange-50 rounded-lg border border-orange-100 text-sm text-orange-800">
                        <p className="font-bold mb-1">Warning:</p>
                        This will copy all attendance status, hours, and notes from the source date to the target date for all employees. Existing records on the target date will be overwritten.
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Copy From</label>
                            <input type="date" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" value={sourceDate} onChange={e => setSourceDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Copy To</label>
                            <input type="date" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancel</button>
                    <button onClick={() => onCopy(sourceDate, targetDate)} className="px-4 py-2 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700">Confirm Copy</button>
                </div>
            </div>
        </div>
    );
}

const LeaveRequestModal = ({ employees, onClose, onSave }: any) => {
    const [req, setReq] = useState<any>({
        type: AttendanceStatus.ANNUAL_LEAVE,
        startDate: formatDateLocal(new Date()),
        endDate: formatDateLocal(new Date()),
        reason: ''
    });

    const handleSubmit = () => {
        if (!req.employeeId || !req.reason) return alert("Missing fields");
        saveLeaveRequest(req);
        onSave();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-lg max-w-md w-full shadow-xl">
                <h3 className="font-bold mb-4 text-lg">New Leave Request</h3>
                <div className="space-y-3">
                    <select className="w-full p-2 border rounded" onChange={e => setReq({ ...req, employeeId: e.target.value })}>
                        <option value="">Select Employee</option>
                        {employees.map((e: Employee) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <select className="w-full p-2 border rounded" value={req.type} onChange={e => setReq({ ...req, type: e.target.value })}>
                        <option value={AttendanceStatus.ANNUAL_LEAVE}>Annual Leave</option>
                        <option value={AttendanceStatus.SICK_LEAVE}>Sick Leave</option>
                        <option value={AttendanceStatus.UNPAID_LEAVE}>Unpaid Leave</option>
                        <option value={AttendanceStatus.EMERGENCY_LEAVE}>Emergency Leave</option>
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                        <input type="date" className="p-2 border rounded" value={req.startDate} onChange={e => setReq({ ...req, startDate: e.target.value })} />
                        <input type="date" className="p-2 border rounded" value={req.endDate} onChange={e => setReq({ ...req, endDate: e.target.value })} />
                    </div>
                    <textarea className="w-full p-2 border rounded h-24 resize-none" placeholder="Reason" value={req.reason} onChange={e => setReq({ ...req, reason: e.target.value })}></textarea>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-indigo-600 text-white rounded">Submit</button>
                </div>
            </div>
        </div>
    );
};

const DeductionModal = ({ isOpen, onClose, employees, onSave }: any) => {
    const [form, setForm] = useState({
        employeeId: '',
        date: new Date().toISOString().split('T')[0],
        type: 'Salary Advance',
        amount: 0,
        note: ''
    });

    const handleSubmit = () => {
        if (!form.employeeId || form.amount <= 0) return alert("Please select employee and enter a valid amount");
        onSave(form);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-gray-800">Add New Deduction</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500 hover:text-gray-700" /></button>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                        <select className="w-full p-2 border rounded" value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}>
                            <option value="">Select Employee</option>
                            {employees.filter((e: Employee) => e.active).map((e: Employee) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                        <input type="date" className="w-full p-2 border rounded" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deduction Type</label>
                        <select className="w-full p-2 border rounded" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                            <option value="Salary Advance">Salary Advance</option>
                            <option value="Loan Amount">Loan Amount</option>
                            <option value="Damage Material/Asset">Damage Material/Asset</option>
                            <option value="Fine Amount">Fine Amount</option>
                            <option value="Penalty">Penalty</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount (AED)</label>
                        <input type="number" className="w-full p-2 border rounded" value={form.amount} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) })} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                        <textarea className="w-full p-2 border rounded h-20 resize-none" placeholder="Additional details..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}></textarea>
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Save Deduction</button>
                </div>
            </div>
        </div>
    );
};

const DeductionsView = ({ deductions, employees, onRefresh }: any) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);

    const handleSave = (data: any) => {
        saveDeduction(data);
        onRefresh();
    };

    const handleDelete = (id: string) => {
        if (window.confirm("Are you sure you want to delete this deduction?")) {
            deleteDeduction(id);
            onRefresh();
        }
    };

    const filteredDeductions = deductions.filter((d: any) => {
        const emp = employees.find((e: any) => e.id === d.employeeId);
        return emp && (emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || emp.code.includes(searchTerm));
    }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Deductions Management</h2>
                <div className="flex gap-4 items-center">
                    <div className="relative">
                         <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                         <input 
                            type="text" 
                            placeholder="Search Employee..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64" 
                         />
                    </div>
                    <button onClick={() => setShowModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-indigo-700">
                        <Wallet className="w-4 h-4" /> Add Deduction
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50 border-b font-bold text-gray-600 uppercase text-xs">
                        <tr>
                            <th className="p-4">Date</th>
                            <th className="p-4">Employee</th>
                            <th className="p-4">Type</th>
                            <th className="p-4">Note</th>
                            <th className="p-4 text-right">Amount (AED)</th>
                            <th className="p-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredDeductions.length === 0 && (
                            <tr><td colSpan={6} className="p-6 text-center text-gray-400 italic">No deductions found.</td></tr>
                        )}
                        {filteredDeductions.map((d: any) => {
                            const emp = employees.find((e: any) => e.id === d.employeeId);
                            return (
                                <tr key={d.id} className="hover:bg-gray-50">
                                    <td className="p-4 text-gray-500">{d.date}</td>
                                    <td className="p-4">
                                        <div className="font-bold text-gray-800">{emp?.name}</div>
                                        <div className="text-xs text-gray-500">{emp?.code}</div>
                                    </td>
                                    <td className="p-4"><span className="bg-red-50 text-red-600 px-2 py-1 rounded text-xs font-bold">{d.type}</span></td>
                                    <td className="p-4 text-gray-500 truncate max-w-[200px]">{d.note}</td>
                                    <td className="p-4 text-right font-bold text-red-600">{d.amount.toLocaleString()}</td>
                                    <td className="p-4 text-center">
                                        <button onClick={() => handleDelete(d.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <DeductionModal isOpen={showModal} onClose={() => setShowModal(false)} employees={employees} onSave={handleSave} />
        </div>
    );
};

const UserManagementModal = ({ isOpen, onClose }: any) => {
    const [users, setUsers] = useState(getSystemUsers());
    const [isEditing, setIsEditing] = useState(false);
    const [originalUsername, setOriginalUsername] = useState('');
    const [formData, setFormData] = useState({ username: '', password: '', name: '', role: UserRole.HR });
    const [permissions, setPermissions] = useState({
        canViewDashboard: true, canManageEmployees: false, canViewDirectory: true,
        canManageAttendance: false, canViewTimesheet: true, canManageLeaves: false,
        canViewPayroll: false, canManagePayroll: false, canViewReports: false,
        canManageUsers: false, canManageSettings: false
    });
    const [searchTerm, setSearchTerm] = useState('');

    const togglePermission = (key: string) => setPermissions(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));

    const handleSave = () => {
        if (!formData.username || !formData.password || !formData.name) return;
        try {
            const updatedUser = { ...formData, active: true, permissions };
            let updatedList;
            if (isEditing) {
                updatedList = updateSystemUser(originalUsername, updatedUser);
            } else {
                updatedList = addSystemUser(updatedUser);
            }
            setUsers(updatedList);
            resetForm();
        } catch (e: any) { alert(e.message); }
    };

    const handleEdit = (user: SystemUser) => {
        setFormData({ username: user.username, password: user.password, name: user.name, role: user.role });
        setPermissions(user.permissions);
        setOriginalUsername(user.username);
        setIsEditing(true);
    };

    const resetForm = () => {
        setFormData({ username: '', password: '', name: '', role: UserRole.HR });
        setIsEditing(false);
        setOriginalUsername('');
    };

    const handleDelete = (username: string) => {
        try {
            if (confirm(`Delete user ${username}?`)) {
                const updated = deleteSystemUser(username);
                setUsers(updated);
            }
        } catch (e: any) { alert(e.message); }
    };

    if (!isOpen) return null;

    const filteredUsers = users.filter(u => 
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
        u.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl p-6 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold">System User Management</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500" /></button>
                </div>
                
                <div className={`bg-gray-50 p-4 rounded-lg mb-6 border ${isEditing ? 'border-blue-300 ring-1 ring-blue-200' : 'border-gray-200'}`}>
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-sm">{isEditing ? 'Edit User' : 'Create New User'}</h4>
                        {isEditing && <button onClick={resetForm} className="text-xs text-gray-500 underline">Cancel Edit</button>}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <input placeholder="Username" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="p-2 border rounded text-sm" />
                        <input placeholder="Password" type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="p-2 border rounded text-sm" />
                        <input placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="p-2 border rounded text-sm" />
                        <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})} className="p-2 border rounded text-sm">
                            {Object.values(UserRole).filter(r => r !== UserRole.CREATOR).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    
                    <div className="mb-4">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Access Permissions</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {Object.keys(permissions).map((key) => (
                                <div key={key} onClick={() => togglePermission(key)} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded select-none">
                                    {permissions[key as keyof typeof permissions] ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                                    <span className="text-xs text-gray-700">{key.replace('can', '').replace(/([A-Z])/g, ' $1').trim()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button onClick={handleSave} className={`w-full text-white py-2 rounded text-sm font-medium transition-colors ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                        {isEditing ? 'Update User' : 'Create System User'}
                    </button>
                </div>

                <div className="mb-4 flex justify-between items-center">
                    <div className="relative">
                         <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                         <input 
                            type="text" 
                            placeholder="Search users..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64" 
                         />
                    </div>
                    <div className="text-sm text-gray-500">Total Users: <span className="font-bold">{filteredUsers.filter(u => u.role !== UserRole.CREATOR).length}</span></div>
                </div>

                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 font-bold sticky top-0">
                            <tr><th className="p-2">Username</th><th className="p-2">Name</th><th className="p-2">Role</th><th className="p-2 text-right">Action</th></tr>
                        </thead>
                        <tbody>
                            {filteredUsers.filter(u => u.role !== UserRole.CREATOR).map(u => (
                                <tr key={u.username} className={`border-b ${isEditing && originalUsername === u.username ? 'bg-blue-50' : ''}`}>
                                    <td className="p-2 font-mono">{u.username}</td>
                                    <td className="p-2">{u.name}</td>
                                    <td className="p-2"><span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{u.role}</span></td>
                                    <td className="p-2 text-right flex justify-end gap-2">
                                        <button onClick={() => handleEdit(u)} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><Edit className="w-4 h-4" /></button>
                                        {u.username !== 'admin' && <button onClick={() => handleDelete(u.username)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4" /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const ExEmployeeDetailsModal = ({ employee, onClose }: any) => {
    const [previewDoc, setPreviewDoc] = useState(null);
    const details = employee?.offboardingDetails;
    if (!employee || !details) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-6 flex flex-col max-h-[85vh]">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">{employee.name}</h3>
                        <p className="text-sm text-gray-500">{employee.designation} - {employee.code}</p>
                    </div>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500 hover:text-gray-700" /></button>
                </div>
                
                <div className="overflow-y-auto flex-1 space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-gray-50 p-3 rounded">
                            <span className="block text-xs font-bold text-gray-500 uppercase">Offboarding Type</span>
                            <span className="font-medium text-gray-900">{details.type}</span>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                            <span className="block text-xs font-bold text-gray-500 uppercase">Exit Date</span>
                            <span className="font-medium text-gray-900">{details.exitDate}</span>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Reason & Notes</h4>
                        <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm text-gray-700 whitespace-pre-wrap">
                            {details.reason}
                            {details.notes && <div className="mt-2 pt-2 border-t border-gray-200 text-gray-500 text-xs">{details.notes}</div>}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Final Settlement</h4>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="p-2 border rounded"><span className="block text-xs text-gray-500">Gratuity</span> AED {details.gratuity}</div>
                            <div className="p-2 border rounded"><span className="block text-xs text-gray-500">Leave Encash</span> AED {details.leaveEncashment}</div>
                            <div className="p-2 border rounded"><span className="block text-xs text-gray-500">Salary Dues</span> AED {details.salaryDues}</div>
                            <div className="p-2 border rounded"><span className="block text-xs text-gray-500">Other Dues</span> AED {details.otherDues}</div>
                            <div className="p-2 border rounded"><span className="block text-xs text-red-500">Deductions</span> AED {details.deductions}</div>
                            <div className="p-2 border rounded bg-green-50"><span className="block text-xs text-green-700 font-bold">Net Pay</span> AED {details.netSettlement}</div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-sm">
                            {details.assetsReturned ? <CheckCircle className="w-4 h-4 text-green-600"/> : <AlertCircle className="w-4 h-4 text-red-600"/>}
                            <span>Assets Returned: <strong>{details.assetsReturned ? 'Yes' : 'No'}</strong></span>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Uploaded Documents</h4>
                        {details.documents && details.documents.length > 0 ? (
                            <ul className="space-y-2">
                                {details.documents.map((doc: any, idx: number) => (
                                    <li key={idx} className="flex justify-between items-center p-2 border rounded hover:bg-gray-50">
                                        <span className="text-sm text-gray-700 truncate max-w-[300px] flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-blue-500" /> {doc.name}
                                        </span>
                                        <button onClick={() => setPreviewDoc(doc.data)} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded font-medium hover:bg-blue-100">View</button>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-sm text-gray-400 italic">No documents attached.</p>}
                    </div>
                </div>
            </div>
            {previewDoc && <DocumentPreviewModal isOpen={true} onClose={() => setPreviewDoc(null)} attachment={previewDoc} />}
        </div>
    );
};

const EditEmployeeModal = ({ employee, companies, onClose, onSave }: any) => {
    const [formData, setFormData] = useState({ ...employee });
    
    const handleChange = (field: string, value: any) => setFormData((prev: any) => ({ ...prev, [field]: value }));
    
    const handleSalaryChange = (field: string, value: number) => 
        setFormData((prev: any) => ({ ...prev, salary: { ...prev.salary, [field]: value } }));
    
    const handleDocChange = (field: string, value: string) => 
        setFormData((prev: any) => ({ ...prev, documents: { ...prev.documents, [field]: value } }));

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl p-6 my-8">
                <div className="flex justify-between mb-6">
                    <h3 className="font-bold text-lg">Edit Employee: {employee.name}</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500" /></button>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <input className="p-2 border rounded" placeholder="Name" value={formData.name} onChange={e => handleChange('name', e.target.value)} />
                    <input className="p-2 border rounded" placeholder="Designation" value={formData.designation} onChange={e => handleChange('designation', e.target.value)} />
                    <input className="p-2 border rounded" placeholder="Department" value={formData.department} onChange={e => handleChange('department', e.target.value)} />
                    <select className="p-2 border rounded" value={formData.company} onChange={e => handleChange('company', e.target.value)}>
                        {companies.map((c: string) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="p-2 border rounded" value={formData.team} onChange={e => handleChange('team', e.target.value)}>
                        <option value="Internal Team">Internal Team</option>
                        <option value="External Team">External Team</option>
                        <option value="Office Staff">Office Staff</option>
                    </select>
                    <input className="p-2 border rounded" placeholder="Work Location" value={formData.workLocation} onChange={e => handleChange('workLocation', e.target.value)} />
                </div>

                <h4 className="font-bold text-sm mb-2 mt-4">Salary Structure</h4>
                <div className="grid grid-cols-3 gap-4 mb-4">
                    <div><label className="text-xs font-bold text-gray-500">Basic</label><input type="number" className="w-full p-2 border rounded" value={formData.salary?.basic} onChange={e => handleSalaryChange('basic', parseFloat(e.target.value) || 0)} /></div>
                    <div><label className="text-xs font-bold text-gray-500">Housing</label><input type="number" className="w-full p-2 border rounded" value={formData.salary?.housing} onChange={e => handleSalaryChange('housing', parseFloat(e.target.value) || 0)} /></div>
                    <div><label className="text-xs font-bold text-gray-500">Transport</label><input type="number" className="w-full p-2 border rounded" value={formData.salary?.transport} onChange={e => handleSalaryChange('transport', parseFloat(e.target.value) || 0)} /></div>
                    <div><label className="text-xs font-bold text-gray-500">Air Ticket</label><input type="number" className="w-full p-2 border rounded" value={formData.salary?.airTicket} onChange={e => handleSalaryChange('airTicket', parseFloat(e.target.value) || 0)} /></div>
                    <div><label className="text-xs font-bold text-gray-500">Leave Payment</label><input type="number" className="w-full p-2 border rounded" value={formData.salary?.leaveSalary} onChange={e => handleSalaryChange('leaveSalary', parseFloat(e.target.value) || 0)} /></div>
                    <div><label className="text-xs font-bold text-gray-500">Other</label><input type="number" className="w-full p-2 border rounded" value={formData.salary?.other} onChange={e => handleSalaryChange('other', parseFloat(e.target.value) || 0)} /></div>
                </div>

                <h4 className="font-bold text-sm mb-2 mt-4">Documents & Dates</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs">Emirates ID</label><input className="w-full p-2 border rounded" value={formData.documents?.emiratesId || ''} onChange={e => handleDocChange('emiratesId', e.target.value)} /></div>
                    <div><label className="text-xs">EID Expiry</label><input type="date" className="w-full p-2 border rounded" value={formData.documents?.emiratesIdExpiry || ''} onChange={e => handleDocChange('emiratesIdExpiry', e.target.value)} /></div>
                    <div><label className="text-xs">Passport No</label><input className="w-full p-2 border rounded" value={formData.documents?.passportNumber || ''} onChange={e => handleDocChange('passportNumber', e.target.value)} /></div>
                    <div><label className="text-xs">Passport Expiry</label><input type="date" className="w-full p-2 border rounded" value={formData.documents?.passportExpiry || ''} onChange={e => handleDocChange('passportExpiry', e.target.value)} /></div>
                    <div><label className="text-xs">Labour Card No</label><input className="w-full p-2 border rounded" value={formData.documents?.labourCardNumber || ''} onChange={e => handleDocChange('labourCardNumber', e.target.value)} /></div>
                    <div><label className="text-xs">LC Expiry</label><input type="date" className="w-full p-2 border rounded" value={formData.documents?.labourCardExpiry || ''} onChange={e => handleDocChange('labourCardExpiry', e.target.value)} /></div>
                    <div><label className="text-xs">Vacation Date</label><input type="date" className="w-full p-2 border rounded" value={formData.vacationScheduledDate || ''} onChange={e => handleChange('vacationScheduledDate', e.target.value)} /></div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                    <button onClick={() => onSave(formData)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const AboutView = ({ currentUser }: { currentUser: SystemUser }) => {
    const [data, setData] = useState(getAboutData());
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState(data);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const isCreator = currentUser.role === UserRole.CREATOR;

    const handleSave = () => {
        saveAboutData(formData);
        setData(formData);
        setIsEditing(false);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const base64 = await readFileAsBase64(e.target.files[0]);
            setFormData(prev => ({ ...prev, profileImage: base64 }));
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="h-32 bg-gradient-to-r from-indigo-600 to-blue-500 relative">
                    {isCreator && !isEditing && (
                        <button onClick={() => { setFormData(data); setIsEditing(true); }} className="absolute top-4 right-4 bg-white/20 text-white p-2 rounded-full hover:bg-white/30 backdrop-blur-sm transition-colors" title="Edit Page">
                            <Edit className="w-5 h-5" />
                        </button>
                    )}
                </div>
                <div className="px-8 pb-8 relative">
                    <div className="relative -mt-16 mb-6 flex justify-center">
                        <div className="w-32 h-32 rounded-full border-4 border-white shadow-lg overflow-hidden bg-gray-200 relative group">
                            {formData.profileImage ? (
                                <img src={formData.profileImage} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                                    <User className="w-16 h-16" />
                                </div>
                            )}
                            {isEditing && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => fileInputRef.current?.click()}>
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                            )}
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                        </div>
                    </div>

                    {isEditing ? (
                        <div className="space-y-4 max-w-lg mx-auto">
                            <div className="text-center">
                                <input className="text-3xl font-bold text-center w-full border-b pb-1" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                <input className="text-indigo-600 font-medium text-center w-full mt-2 border-b pb-1" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg border">
                                <textarea className="w-full bg-transparent border-b mt-1 min-h-[100px]" value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input className="w-full border p-2 rounded" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                                <input className="w-full border p-2 rounded" value={formData.contactInfo} onChange={e => setFormData({ ...formData, contactInfo: e.target.value })} />
                            </div>
                            <div className="flex justify-center gap-4 mt-6">
                                <button onClick={() => setIsEditing(false)} className="px-6 py-2 rounded-full border">Cancel</button>
                                <button onClick={handleSave} className="px-6 py-2 rounded-full bg-indigo-600 text-white">Save Changes</button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center max-w-2xl mx-auto">
                            <h1 className="text-3xl font-bold text-gray-900">{data.name}</h1>
                            <p className="text-indigo-600 font-medium mt-1">{data.title}</p>
                            <div className="my-8 text-gray-600 leading-relaxed text-lg">{data.bio}</div>
                            <div className="flex justify-center gap-8 text-sm text-gray-500 border-t pt-6">
                                <div><span className="block font-bold text-gray-700">Email</span>{data.email}</div>
                                <div><span className="block font-bold text-gray-700">Contact</span>{data.contactInfo}</div>
                            </div>
                        </div>
                    )}

                    {!isCreator && !isEditing && (
                        <div className="mt-12 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                            <p className="text-sm text-yellow-800 flex items-center justify-center gap-2">
                                <Lock className="w-4 h-4" /> The About page is managed by the creator and cannot be edited or removed by users.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const OnboardingWizard = ({ companies, onClose, onComplete }: any) => {
    const [step, setStep] = useState(1);
    const [rehireMode, setRehireMode] = useState(false);
    const [data, setData] = useState<any>({
        type: StaffType.WORKER,
        status: 'Active',
        salary: { basic: 0, housing: 0, transport: 0, other: 0, airTicket: 0, leaveSalary: 0 },
        leaveBalance: 0,
        active: true,
        joiningDate: formatDateLocal(new Date()),
        documents: {}
    });

    const checkCode = (e: any) => {
        const code = e.target.value;
        if (!code) return;
        const all = getEmployees();
        const existing = all.find(emp => emp.code === code);
        if (existing) {
            if (existing.status === 'Inactive') {
                if (window.confirm(`Employee "${existing.name}" (Inactive) found with this code. Re-hire?`)) {
                    setRehireMode(true);
                    setData({
                        ...existing,
                        status: 'Active',
                        active: true,
                        joiningDate: formatDateLocal(new Date()),
                        rejoiningDate: formatDateLocal(new Date()),
                        rejoiningReason: '',
                        offboardingDetails: undefined
                    });
                } else {
                    setData(prev => ({ ...prev, code: '' }));
                }
            } else {
                alert(`Employee Code ${code} is already active!`);
                setData(prev => ({ ...prev, code: '' }));
            }
        } else {
            setRehireMode(false);
        }
    };

    const handleSalaryChange = (field: string, value: string) => {
        const numVal = value === '' ? 0 : parseFloat(value);
        setData(prev => ({
            ...prev,
            salary: { ...prev.salary, [field]: numVal }
        }));
    };

    const handleSave = () => {
        if (!data.name || !data.code) return alert("Name and Code are required");
        let employeeToSave = { ...data };
        if (!rehireMode) {
            if (!employeeToSave.id) employeeToSave.id = Math.random().toString(36).substr(2, 9);
        }
        saveEmployee(employeeToSave);
        onComplete();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl p-6 h-[85vh] flex flex-col">
                <div className="mb-4 flex justify-between items-start">
                    <div>
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            {rehireMode ? <><RefreshCcw className="w-5 h-5 text-green-600"/> Re-hiring Employee</> : 'Onboard New Employee'}
                        </h3>
                        <div className="flex gap-2 mt-2 w-64">
                            {[1, 2, 3, 4].map(i => <div key={i} className={`h-1 flex-1 rounded-full ${step >= i ? 'bg-indigo-600' : 'bg-gray-200'}`} />)}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Step {step} of 4</p>
                    </div>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-600" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-1">
                    {step === 1 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-gray-700">Personal Info</h4>
                            <div className="relative">
                                <input className={`w-full p-2 border rounded ${rehireMode ? 'bg-green-50 border-green-300' : ''}`} placeholder="Employee Code (ID)" value={data.code || ''} onChange={e => setData({ ...data, code: e.target.value })} onBlur={checkCode} disabled={rehireMode} />
                                {rehireMode && <span className="absolute right-3 top-2.5 text-xs font-bold text-green-600">Existing Record Found</span>}
                            </div>
                            <input className="w-full p-2 border rounded" placeholder="Full Name" value={data.name || ''} onChange={e => setData({ ...data, name: e.target.value })} />
                            <select className="w-full p-2 border rounded" value={data.company || ''} onChange={e => setData({ ...data, company: e.target.value })}>
                                <option value="">Select Company</option>
                                {companies.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-500">Joining Date</label>
                                    <input type="date" className="w-full p-2 border rounded" value={rehireMode ? (data.rejoiningDate || '') : (data.joiningDate || '')} onChange={e => rehireMode ? setData({ ...data, rejoiningDate: e.target.value }) : setData({ ...data, joiningDate: e.target.value })} />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-gray-700">Job Details</h4>
                            <input className="w-full p-2 border rounded" placeholder="Designation" value={data.designation || ''} onChange={e => setData({ ...data, designation: e.target.value })} />
                            <input className="w-full p-2 border rounded" placeholder="Department" value={data.department || ''} onChange={e => setData({ ...data, department: e.target.value })} />
                            <select className="w-full p-2 border rounded" value={data.team || 'Internal Team'} onChange={e => setData({ ...data, team: e.target.value })}>
                                <option value="Internal Team">Internal Team</option>
                                <option value="External Team">External Team</option>
                                <option value="Office Staff">Office Staff</option>
                            </select>
                            <select className="w-full p-2 border rounded" value={data.type || StaffType.WORKER} onChange={e => setData({ ...data, type: e.target.value })}>
                                <option value={StaffType.WORKER}>Worker</option>
                                <option value={StaffType.OFFICE}>Office Staff</option>
                            </select>
                            <input className="w-full p-2 border rounded" placeholder="Work Location" value={data.workLocation || ''} onChange={e => setData({ ...data, workLocation: e.target.value })} />
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-gray-700">Salary & Documents</h4>
                            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded mb-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Basic Salary</label>
                                    <input type="number" className="w-full p-2 border rounded" value={data.salary?.basic} onChange={e => handleSalaryChange('basic', e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Housing</label>
                                    <input type="number" className="w-full p-2 border rounded" value={data.salary?.housing} onChange={e => handleSalaryChange('housing', e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Transport</label>
                                    <input type="number" className="w-full p-2 border rounded" value={data.salary?.transport} onChange={e => handleSalaryChange('transport', e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Air Ticket</label>
                                    <input type="number" className="w-full p-2 border rounded" value={data.salary?.airTicket} onChange={e => handleSalaryChange('airTicket', e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Leave Payment</label>
                                    <input type="number" className="w-full p-2 border rounded" value={data.salary?.leaveSalary} onChange={e => handleSalaryChange('leaveSalary', e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Other</label>
                                    <input type="number" className="w-full p-2 border rounded" value={data.salary?.other} onChange={e => handleSalaryChange('other', e.target.value)} />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-gray-700">Review Details</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm bg-gray-50 p-4 rounded border">
                                <span className="text-gray-500">Code:</span><span className="font-mono font-bold">{data.code}</span>
                                <span className="text-gray-500">Name:</span><span className="font-bold">{data.name}</span>
                                <span className="text-gray-500">Company:</span><span>{data.company}</span>
                                <span className="text-gray-500">Designation:</span><span>{data.designation}</span>
                                <span className="text-gray-500">Team:</span><span>{data.team}</span>
                                <span className="text-gray-500">Total Salary:</span>
                                <span className="font-bold text-green-600">
                                    {((data.salary?.basic || 0) + (data.salary?.housing || 0) + (data.salary?.transport || 0) + (data.salary?.other || 0) + (data.salary?.airTicket || 0) + (data.salary?.leaveSalary || 0)).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-between mt-6 pt-4 border-t">
                    {step > 1 ? <button onClick={() => setStep(step - 1)} className="px-4 py-2 border rounded hover:bg-gray-50">Back</button> : <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>}
                    {step < 4 ? <button onClick={() => setStep(step + 1)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Next</button> : <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {rehireMode ? 'Confirm Re-hire' : 'Complete Onboarding'}</button>}
                </div>
            </div>
        </div>
    );
};

const ManageCompaniesModal = ({ isOpen, onClose, companies, onDataChange }: any) => {
    const [newName, setNewName] = useState('');
    const [editingName, setEditingName] = useState(null);
    const [editValue, setEditValue] = useState('');

    const handleAdd = () => {
        if (!newName.trim()) return;
        const updated = addCompany(newName.trim());
        onDataChange(updated);
        setNewName('');
    };

    const handleDelete = (name: string) => {
        if (window.confirm(`Delete "${name}"?`)) {
            const updated = deleteCompany(name);
            onDataChange(updated);
        }
    };

    const startEdit = (name: any) => { setEditingName(name); setEditValue(name); };
    
    const saveEdit = () => {
        if (editingName && editValue.trim()) {
            const updated = updateCompany(editingName, editValue.trim());
            onDataChange(updated);
            setEditingName(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl p-6 flex flex-col max-h-[80vh]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold">Manage Companies</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500" /></button>
                </div>
                <div className="flex gap-2 mb-6">
                    <input value={newName} onChange={e => setNewName(e.target.value)} className="flex-1 p-2 border rounded-lg" placeholder="New company name" />
                    <button onClick={handleAdd} disabled={!newName.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50">Add</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <ul className="space-y-2">
                        {companies.map((c: string) => (
                            <li key={c} className="flex items-center gap-2 p-3 border rounded-lg bg-gray-50 group">
                                {editingName === c ? (
                                    <div className="flex-1 flex gap-2 items-center">
                                        <input value={editValue} onChange={e => setEditValue(e.target.value)} className="flex-1 p-2 border rounded-lg text-sm" autoFocus />
                                        <button onClick={saveEdit} className="text-green-600 p-1.5"><Check className="w-4 h-4" /></button>
                                        <button onClick={() => setEditingName(null)} className="text-gray-500 p-1.5"><XCircle className="w-4 h-4" /></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="flex-1 text-sm font-medium truncate" title={c}>{c}</span>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => startEdit(c)} className="text-blue-600 p-1.5"><Edit className="w-4 h-4" /></button>
                                            <button onClick={() => handleDelete(c)} className="text-red-600 p-1.5"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

const OffboardingWizard = ({ employee, onClose, onComplete }: any) => {
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

    // Auto-calculate net
    useEffect(() => {
        const net = (Number(details.gratuity) || 0) + 
                    (Number(details.leaveEncashment) || 0) + 
                    (Number(details.salaryDues) || 0) + 
                    (Number(details.otherDues) || 0) - 
                    (Number(details.deductions) || 0);
        setDetails(prev => ({ ...prev, netSettlement: net }));
    }, [details.gratuity, details.leaveEncashment, details.salaryDues, details.otherDues, details.deductions]);

    const handleSubmit = () => {
        if (!details.exitDate || !details.type) return alert("Please fill required fields");
        offboardEmployee(employee.id, details);
        onComplete();
    };

    const handleChange = (field: string, value: any) => {
        setDetails(prev => ({ ...prev, [field]: value }));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const base64 = await readFileAsBase64(file);
            setDetails(prev => ({
                ...prev,
                documents: [...(prev.documents || []), { name: file.name, data: base64 }]
            }));
        }
    };

    const removeFile = (index: number) => {
        setDetails(prev => ({
            ...prev,
            documents: prev.documents?.filter((_, i) => i !== index)
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-6 my-8">
                <h3 className="font-bold text-lg mb-4 text-red-600">Offboard Employee: {employee.name}</h3>
                
                <div className="space-y-4">
                    <select className="w-full p-2 border rounded" value={details.type} onChange={e => setDetails({ ...details, type: e.target.value as OffboardingDetails['type'] })}>
                        <option value="Resignation">Resignation</option>
                        <option value="Termination">Termination</option>
                        <option value="End of Contract">End of Contract</option>
                        <option value="Absconding">Absconding</option>
                    </select>
                    
                    <input type="date" className="w-full p-2 border rounded" value={details.exitDate} onChange={e => setDetails({ ...details, exitDate: e.target.value })} />
                    
                    <textarea className="w-full p-2 border rounded" placeholder="Reason" value={details.reason} onChange={e => setDetails({ ...details, reason: e.target.value })} />

                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded">
                        <div>
                            <label className="text-xs">Gratuity</label>
                            <input type="number" className="w-full p-1 border" value={details.gratuity} onChange={e => setDetails({ ...details, gratuity: parseFloat(e.target.value) })} />
                        </div>
                        <div>
                            <label className="text-xs">Leave Encashment</label>
                            <input type="number" className="w-full p-1 border" value={details.leaveEncashment} onChange={e => setDetails({ ...details, leaveEncashment: parseFloat(e.target.value) })} />
                        </div>
                        <div>
                            <label className="text-xs">Salary Dues</label>
                            <input type="number" className="w-full p-1 border" value={details.salaryDues} onChange={e => setDetails({ ...details, salaryDues: parseFloat(e.target.value) })} />
                        </div>
                        <div>
                            <label className="text-xs">Other Dues</label>
                            <input type="number" className="w-full p-1 border" value={details.otherDues} onChange={e => setDetails({ ...details, otherDues: parseFloat(e.target.value) })} />
                        </div>
                        <div>
                            <label className="text-xs">Deductions</label>
                            <input type="number" className="w-full p-1 border" value={details.deductions} onChange={e => setDetails({ ...details, deductions: parseFloat(e.target.value) })} />
                        </div>
                    </div>

                    <div className="border p-3 rounded-lg bg-blue-50">
                        <label className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-2">
                            <Upload className="w-4 h-4" /> Upload Documents
                        </label>
                        <input type="file" onChange={handleFileChange} className="text-xs w-full mb-2" />
                        <ul className="space-y-1">
                            {details.documents?.map((doc: any, idx: number) => (
                                <li key={idx} className="flex justify-between items-center text-xs bg-white p-1 rounded border">
                                    <span className="truncate max-w-[200px]">{doc.name}</span>
                                    <button onClick={() => removeFile(idx)} className="text-red-500 hover:text-red-700"><XCircle className="w-3 h-3" /></button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={details.assetsReturned} onChange={e => setDetails({ ...details, assetsReturned: e.target.checked })} id="assets" />
                        <label htmlFor="assets" className="text-sm font-medium">All company assets returned (Laptop, ID, Uniform, etc.)</label>
                    </div>

                    <div>
                         <label className="block text-xs font-bold text-gray-500 mb-1">Additional Notes</label>
                         <textarea className="w-full p-2 border rounded h-16" value={details.notes} onChange={e => handleChange('notes', e.target.value)}></textarea>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-bold flex items-center gap-2">
                        <LogOut className="w-4 h-4" /> Confirm Offboarding
                    </button>
                </div>
            </div>
        </div>
    );
};

const PayslipModal = ({ employee, month, year, onClose }: any) => {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    
    useEffect(() => {
        const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const end = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;
        setRecords(getAttendanceRange(start, end).filter(r => r.employeeId === employee.id));
    }, [employee, month, year]);

    const { overtimePay, holidayPay, weekOffPay, totalOTHours } = calculateAdditionalEarnings(records, employee.team);
    
    const basic = employee.salary?.basic || 0;
    const housing = employee.salary?.housing || 0;
    const transport = employee.salary?.transport || 0;
    const other = employee.salary?.other || 0;
    const airTicket = employee.salary?.airTicket || 0;
    const leaveSalary = employee.salary?.leaveSalary || 0;
    const gross = basic + housing + transport + other + airTicket + leaveSalary;
    
    // Separate unpaid leave and absent for clarity
    const unpaidLeaveDays = records.filter(r => r.status === AttendanceStatus.UNPAID_LEAVE).length;
    const absentDays = records.filter(r => r.status === AttendanceStatus.ABSENT).length;
    const totalUnpaidDays = unpaidLeaveDays + absentDays;
    
    const deduction = (gross / 30) * totalUnpaidDays;

    // Fetch Variable Deductions
    const empDeductions = getDeductions().filter(d => {
        const dDate = new Date(d.date);
        return d.employeeId === employee.id && dDate.getMonth() === month && dDate.getFullYear() === year;
    });
    const totalVariableDeductions = empDeductions.reduce((acc, curr) => acc + curr.amount, 0);

    const totalAdditions = overtimePay + holidayPay + weekOffPay;
    const totalDeductionVal = deduction + totalVariableDeductions;
    const net = gross - totalDeductionVal + totalAdditions;

    const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:p-0 print:static print:bg-white">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-gray-50 p-4 flex justify-between items-center border-b print:hidden">
                    <h3 className="font-bold text-lg">Payslip Preview</h3>
                    <div className="flex gap-2">
                        <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 text-white rounded text-sm"><Printer className="w-4 h-4"/> Print</button>
                        <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500 hover:text-gray-700" /></button>
                    </div>
                </div>

                <div className="p-8 overflow-y-auto bg-white" id="payslip-content">
                    <div className="text-center border-b pb-6 mb-6">
                        <h1 className="text-2xl font-bold uppercase text-gray-900">{employee.company}</h1>
                        <p className="text-sm text-gray-500">Payslip for the month of {monthName}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-8">
                        <div>
                            <div className="text-xs text-gray-500 uppercase font-bold mb-1">Employee Details</div>
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                <span className="text-gray-600">Name:</span><span className="font-bold">{employee.name}</span>
                                <span className="text-gray-600">Code:</span><span className="font-mono">{employee.code}</span>
                                <span className="text-gray-600">Designation:</span><span>{employee.designation}</span>
                                <span className="text-gray-600">Department:</span><span>{employee.department}</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase font-bold mb-1">Bank Details</div>
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                <span className="text-gray-600">Bank Name:</span><span>{employee.bankName || '-'}</span>
                                <span className="text-gray-600">IBAN:</span><span className="font-mono">{employee.iban || '-'}</span>
                                <span className="text-gray-600">Payment Mode:</span><span>{employee.iban ? 'Bank Transfer' : 'Cash'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mb-8">
                        <table className="w-full text-sm border border-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="p-2 border text-left">Earnings</th>
                                    <th className="p-2 border text-right">Amount</th>
                                    <th className="p-2 border text-left">Deductions</th>
                                    <th className="p-2 border text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="p-2 border">Basic Salary</td>
                                    <td className="p-2 border text-right">{basic.toLocaleString()}</td>
                                    <td className="p-2 border">Absent/Unpaid ({totalUnpaidDays} days)</td>
                                    <td className="p-2 border text-right text-red-600">{deduction > 0 ? deduction.toLocaleString(undefined, {maximumFractionDigits: 2}) : '0.00'}</td>
                                </tr>
                                <tr>
                                    <td className="p-2 border">Housing Allowance</td>
                                    <td className="p-2 border text-right">{housing.toLocaleString()}</td>
                                    <td className="p-2 border"></td>
                                    <td className="p-2 border text-right"></td>
                                </tr>
                                <tr>
                                    <td className="p-2 border">Transport Allowance</td>
                                    <td className="p-2 border text-right">{transport.toLocaleString()}</td>
                                    <td className="p-2 border"></td>
                                    <td className="p-2 border text-right"></td>
                                </tr>
                                <tr>
                                    <td className="p-2 border">Other Allowances</td>
                                    <td className="p-2 border text-right">{other.toLocaleString()}</td>
                                    <td className="p-2 border"></td>
                                    <td className="p-2 border text-right"></td>
                                </tr>
                                <tr>
                                    <td className="p-2 border text-blue-600">Overtime ({totalOTHours} hrs)</td>
                                    <td className="p-2 border text-right text-blue-600">{overtimePay > 0 ? overtimePay.toLocaleString() : '0.00'}</td>
                                    <td className="p-2 border"></td>
                                    <td className="p-2 border text-right"></td>
                                </tr>
                                {holidayPay > 0 && (
                                    <tr>
                                        <td className="p-2 border text-blue-600">Holiday Pay</td>
                                        <td className="p-2 border text-right text-blue-600">{holidayPay.toLocaleString()}</td>
                                        <td className="p-2 border"></td>
                                        <td className="p-2 border text-right"></td>
                                    </tr>
                                )}
                                 {weekOffPay > 0 && (
                                    <tr>
                                        <td className="p-2 border text-blue-600">WeekOff Pay</td>
                                        <td className="p-2 border text-right text-blue-600">{weekOffPay.toLocaleString()}</td>
                                        <td className="p-2 border"></td>
                                        <td className="p-2 border text-right"></td>
                                    </tr>
                                )}
                                {/* Variable Deductions Rows */}
                                {empDeductions.map(d => (
                                    <tr key={d.id}>
                                        <td className="p-2 border"></td>
                                        <td className="p-2 border text-right"></td>
                                        <td className="p-2 border text-red-600">{d.type} {d.note ? `(${d.note})` : ''}</td>
                                        <td className="p-2 border text-right text-red-600">{d.amount.toLocaleString()}</td>
                                    </tr>
                                ))}

                                <tr className="font-bold bg-gray-50">
                                    <td className="p-3 border">Total Earnings</td>
                                    <td className="p-3 border text-right">{(gross + totalAdditions).toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                                    <td className="p-3 border">Total Deductions</td>
                                    <td className="p-3 border text-right">{totalDeductionVal.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end">
                        <div className="bg-gray-900 text-white p-4 rounded-lg min-w-[250px]">
                            <div className="text-xs text-gray-400 uppercase mb-1">Net Pay</div>
                            <div className="text-2xl font-bold">AED {net.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                        </div>
                    </div>
                    
                    <div className="mt-12 pt-8 border-t grid grid-cols-2 gap-8 text-center">
                        <div>
                            <div className="h-16 border-b border-gray-300 mb-2"></div>
                            <div className="text-xs text-gray-500 uppercase">Employer Signature</div>
                        </div>
                        <div>
                             <div className="h-16 border-b border-gray-300 mb-2"></div>
                             <div className="text-xs text-gray-500 uppercase">Employee Signature</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const RehireModal = ({ employee, onClose, onConfirm }: any) => {
    const [date, setDate] = useState(formatDateLocal(new Date()));
    const [reason, setReason] = useState('');

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6 animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <RefreshCcw className="w-5 h-5 text-green-600" /> Re-hire Employee
                    </h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-600" /></button>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="block text-xs text-gray-500 uppercase font-bold">Name</span>
                            <span className="font-medium text-gray-900">{employee.name}</span>
                        </div>
                        <div>
                            <span className="block text-xs text-gray-500 uppercase font-bold">Code</span>
                            <span className="font-mono text-gray-900">{employee.code}</span>
                        </div>
                        <div className="col-span-2">
                            <span className="block text-xs text-gray-500 uppercase font-bold">Designation</span>
                            <span className="text-gray-700">{employee.designation}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Re-joining Date</label>
                        <input type="date" className="w-full p-2 border border-gray-300 rounded-lg" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reason / Notes</label>
                        <textarea className="w-full p-3 border border-gray-300 rounded-lg" placeholder="Explain re-joining..." value={reason} onChange={e => setReason(e.target.value)}></textarea>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
                    <button onClick={() => onConfirm(employee.id, date, reason)} disabled={!reason.trim()} className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50">Confirm Re-hire</button>
                </div>
            </div>
        </div>
    );
};

const ReportsView = ({ employees, attendance }: any) => {
    const [fromDate, setFromDate] = useState(formatDateLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
    const [toDate, setToDate] = useState(formatDateLocal(new Date()));
    const [searchTerm, setSearchTerm] = useState('');

    const filterAttendance = () => {
        return attendance.filter((r: any) => r.date >= fromDate && r.date <= toDate);
    };

    const filteredRecs = filterAttendance();
    const totalPresent = filteredRecs.filter((r: any) => r.status === AttendanceStatus.PRESENT).length;
    const totalAbsent = filteredRecs.filter((r: any) => r.status === AttendanceStatus.ABSENT).length;
    const totalLeaves = filteredRecs.filter((r: any) => [AttendanceStatus.SICK_LEAVE, AttendanceStatus.ANNUAL_LEAVE, AttendanceStatus.EMERGENCY_LEAVE].includes(r.status)).length;
    const totalOTHours = filteredRecs.reduce((acc: number, curr: any) => acc + (curr.overtimeHours || 0), 0);
    const activeEmployeesCount = employees.filter((e: any) => e.active).length;

    // Calculate estimated cost
    let totalEstCost = 0;
    employees.filter((e: any) => e.active).forEach((emp: any) => {
        const empRecs = filteredRecs.filter((r: any) => r.employeeId === emp.id);
        const { basic = 0, housing = 0, transport = 0, other = 0, airTicket = 0, leaveSalary = 0 } = emp.salary || {};
        const gross = basic + housing + transport + other + airTicket + leaveSalary;
        const dailyRate = gross / 30;
        
        // Basic Pay for days present/weekoff/holidays/paid leaves
        const paidDays = empRecs.filter((r: any) => r.status !== AttendanceStatus.ABSENT && r.status !== AttendanceStatus.UNPAID_LEAVE).length;
        const basicCost = dailyRate * paidDays;

        // Additional Earnings
        const { overtimePay, holidayPay, weekOffPay } = calculateAdditionalEarnings(empRecs, emp.team);
        
        totalEstCost += basicCost + overtimePay + holidayPay + weekOffPay;
    });

    const employeeStats = employees
        .filter((e: any) => e.active)
        .filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .map((emp: any) => {
            const empRecs = filteredRecs.filter((r: any) => r.employeeId === emp.id);
            const present = empRecs.filter((r: any) => r.status === AttendanceStatus.PRESENT).length;
            const absent = empRecs.filter((r: any) => r.status === AttendanceStatus.ABSENT).length;
            const ot = empRecs.reduce((acc: number, curr: any) => acc + (curr.overtimeHours || 0), 0);
            
            // Simplified cost per employee for the table
            const { basic = 0, housing = 0, transport = 0, other = 0, airTicket = 0, leaveSalary = 0 } = emp.salary || {};
            const gross = basic + housing + transport + other + airTicket + leaveSalary;
            const daily = gross / 30;
            const paid = empRecs.filter((r: any) => r.status !== AttendanceStatus.ABSENT && r.status !== AttendanceStatus.UNPAID_LEAVE).length;
            const { overtimePay, holidayPay, weekOffPay } = calculateAdditionalEarnings(empRecs, emp.team);
            const cost = (daily * paid) + overtimePay + holidayPay + weekOffPay;

            return { ...emp, present, absent, ot, cost };
        });

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                    <div className="w-full md:w-auto">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">From</label>
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="p-2 border rounded-lg bg-white w-full" />
                    </div>
                    <div className="w-full md:w-auto">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">To</label>
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="p-2 border rounded-lg bg-white w-full" />
                    </div>
                </div>
                <button onClick={() => window.print()} className="bg-gray-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm hover:bg-gray-800 w-full md:w-auto justify-center">
                    <Printer className="w-4 h-4" /> Print Report
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-8 text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Workforce Analytics Report</h2>
                <p className="text-gray-500 mt-1">Period: {fromDate} to {toDate}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
                    <h3 className="text-blue-800 text-xs font-bold uppercase mb-1">Est. Cost</h3>
                    <div className="text-2xl font-bold text-blue-900">AED {totalEstCost.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                </div>
                <div className="bg-green-50 p-6 rounded-lg border border-green-100">
                    <h3 className="text-green-800 text-xs font-bold uppercase mb-1">Total OT Hours</h3>
                    <div className="text-2xl font-bold text-green-900">{totalOTHours}</div>
                </div>
                <div className="bg-orange-50 p-6 rounded-lg border border-orange-100">
                    <h3 className="text-orange-800 text-xs font-bold uppercase mb-1">Absent Days</h3>
                    <div className="text-2xl font-bold text-orange-900">{totalAbsent}</div>
                </div>
                <div className="bg-white p-6 rounded-lg border border-gray-200">
                    <h3 className="text-gray-500 text-xs font-bold uppercase mb-1">Employees Active</h3>
                    <div className="text-2xl font-bold text-gray-900">{activeEmployeesCount}</div>
                </div>
            </div>

            <div className="mt-8 mb-4 flex items-center gap-2 max-w-md w-full">
                 <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                         type="text" 
                         placeholder="Filter by employee name..." 
                         value={searchTerm} 
                         onChange={e => setSearchTerm(e.target.value)} 
                         className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full" 
                      />
                 </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden mt-6">
                <table className="w-full text-sm text-left min-w-[600px]">
                    <thead className="bg-gray-50 text-gray-600 font-bold text-xs uppercase border-b">
                        <tr>
                            <th className="p-4">Employee</th>
                            <th className="p-4">Company</th>
                            <th className="p-4 text-center">Present</th>
                            <th className="p-4 text-center">Absent</th>
                            <th className="p-4 text-center text-blue-600">OT (Hrs)</th>
                            <th className="p-4 text-right">Est. Cost</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {employeeStats.map(stat => (
                            <tr key={stat.id} className="hover:bg-gray-50">
                                <td className="p-4 font-bold text-gray-800">{stat.name}</td>
                                <td className="p-4 text-gray-500 text-xs">{stat.company}</td>
                                <td className="p-4 text-center">{stat.present}</td>
                                <td className="p-4 text-center text-red-500 font-bold">{stat.absent}</td>
                                <td className="p-4 text-center text-blue-600 font-bold">{stat.ot}</td>
                                <td className="p-4 text-right font-bold">AED {stat.cost.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                            </tr>
                        ))}
                        <tr className="bg-gray-50 font-bold">
                            <td className="p-4" colSpan={4}>TOTAL</td>
                            <td className="p-4 text-center text-blue-600">{totalOTHours}</td>
                            <td className="p-4 text-right">AED {totalEstCost.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [deductions, setDeductions] = useState<DeductionRecord[]>([]);
  
  // Modals State
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showHolidays, setShowHolidays] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showEmpImport, setShowEmpImport] = useState(false);
  const [showOffboarding, setShowOffboarding] = useState<Employee | null>(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState<{isOpen: boolean, employee?: Employee, date?: Date}>({ isOpen: false });
  const [showPayslip, setShowPayslip] = useState<Employee | null>(null);
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const [showManageCompanies, setShowManageCompanies] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showRehire, setShowRehire] = useState<Employee | null>(null);
  const [showExEmployeeDetails, setShowExEmployeeDetails] = useState<Employee | null>(null);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  
  // Filters
  const [selectedCompany, setSelectedCompany] = useState('All Companies');
  const [selectedStatus, setSelectedStatus] = useState('Active');
  const [selectedTeam, setSelectedTeam] = useState('All Teams');

  // Search States
  const [directorySearch, setDirectorySearch] = useState('');
  const [exEmployeeSearch, setExEmployeeSearch] = useState('');
  const [timesheetSearch, setTimesheetSearch] = useState('');
  const [payrollSearch, setPayrollSearch] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Date State
  const [currentDate, setCurrentDate] = useState(new Date());

  const handleRefresh = () => {
    const allEmps = getEmployees();
    setEmployees(allEmps);
    setCompanies(getCompanies());
    setLeaveRequests(getLeaveRequests());
    setDeductions(getDeductions());
    const start = formatDateLocal(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    const end = formatDateLocal(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
    setAttendance(getAttendanceRange(start, end));
  };

  useEffect(() => {
    if (currentUser) handleRefresh();
  }, [currentUser, currentDate]);

  // --- Dashboard Filter Handlers ---
  const handleDashboardFilter = (filterType: 'active' | 'internal' | 'external' | 'office' | 'company', value?: string) => {
      setActiveTab('directory');
      if (filterType === 'active') {
          setSelectedStatus('Active');
          setSelectedTeam('All Teams');
          setSelectedCompany('All Companies');
      } else if (filterType === 'internal') {
          setSelectedTeam('Internal');
          setSelectedStatus('Active');
      } else if (filterType === 'external') {
          setSelectedTeam('External');
          setSelectedStatus('Active');
      } else if (filterType === 'office') {
          setSelectedTeam('Office');
          setSelectedStatus('Active');
      } else if (filterType === 'company' && value) {
          setSelectedCompany(value);
          setSelectedStatus('Active');
          setSelectedTeam('All Teams');
      }
  };

  const filteredEmployees = employees.filter(e => {
      // 1. Filter by Tab Logic & Search
      if (activeTab === 'directory') {
          if (selectedStatus !== 'All' && e.status !== selectedStatus) return false;
          if (directorySearch && !e.name.toLowerCase().includes(directorySearch.toLowerCase()) && !e.code.includes(directorySearch)) return false;
      }
      if (activeTab === 'ex-employees') {
          if (e.status !== 'Inactive') return false;
          if (exEmployeeSearch && !e.name.toLowerCase().includes(exEmployeeSearch.toLowerCase()) && !e.code.includes(exEmployeeSearch)) return false;
      }
      if (activeTab === 'timesheet') {
          if (!e.active) return false;
          if (timesheetSearch && !e.name.toLowerCase().includes(timesheetSearch.toLowerCase()) && !e.code.includes(timesheetSearch)) return false;
      }
      if (activeTab === 'payroll') {
           if (!e.active) return false;
           if (payrollSearch && !e.name.toLowerCase().includes(payrollSearch.toLowerCase()) && !e.code.includes(payrollSearch)) return false;
      }

      // 2. Filter by Header Dropdowns
      if (selectedCompany !== 'All Companies' && e.company !== selectedCompany) return false;
      if (selectedTeam !== 'All Teams' && e.team !== (selectedTeam === 'Internal' ? 'Internal Team' : selectedTeam === 'External' ? 'External Team' : 'Office Staff')) return false;
      return true;
  });

  const handleLogin = (user: SystemUser) => setCurrentUser(user);
  const handleLogout = () => { setCurrentUser(null); setActiveTab('dashboard'); };
  const handleMonthChange = (delta: number) => {
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() + delta);
      setCurrentDate(newDate);
  };

  const handleAttendanceClick = (emp: Employee, day: Date) => setShowAttendanceModal({ isOpen: true, employee: emp, date: day });
  
  const handleAttendanceSave = (status: any, ot: any, attachment: any, note: any) => {
      if (showAttendanceModal.employee && showAttendanceModal.date) {
          const dateStr = formatDateLocal(showAttendanceModal.date);
          logAttendance(showAttendanceModal.employee.id, status, dateStr, ot, attachment, currentUser?.username, note);
          setShowAttendanceModal({ isOpen: false });
          handleRefresh();
      }
  };

  const handleAttendanceDelete = () => {
      if (showAttendanceModal.employee && showAttendanceModal.date) {
          if (window.confirm("Are you sure you want to delete this attendance record?")) {
              const dateStr = formatDateLocal(showAttendanceModal.date);
              deleteAttendanceRecord(showAttendanceModal.employee.id, dateStr);
              setShowAttendanceModal({ isOpen: false });
              handleRefresh();
          }
      }
  };

  const handleCopyAttendance = (source: string, target: string) => {
      const count = copyDayAttendance(source, target, currentUser?.username || 'Admin');
      alert(`Copied ${count} records.`);
      setShowCopyModal(false);
      handleRefresh();
  };

  const handleLeaveAction = (id: string, status: LeaveStatus) => {
      updateLeaveRequestStatus(id, status);
      handleRefresh();
  };

  const handleEditSave = (data: Employee) => {
      saveEmployee(data);
      setEditEmployee(null);
      handleRefresh();
  };

  // Calculate Payroll Totals using useMemo
  const payrollTotals = useMemo(() => {
    if (activeTab !== 'payroll') return { basic: 0, housing: 0, transport: 0, airTicket: 0, leaveSalary: 0, other: 0, gross: 0, deductions: 0, additions: 0, net: 0 };

    return filteredEmployees.filter(e => e.active).reduce((acc, emp) => {
        const empRecs = attendance.filter(r => r.employeeId === emp.id);
        const { overtimePay, holidayPay, weekOffPay } = calculateAdditionalEarnings(empRecs, emp.team);
        const totalAdditions = overtimePay + holidayPay + weekOffPay;

        const basic = emp.salary?.basic || 0;
        const housing = emp.salary?.housing || 0;
        const transport = emp.salary?.transport || 0;
        const other = emp.salary?.other || 0;
        const airTicket = emp.salary?.airTicket || 0;
        const leaveSalary = emp.salary?.leaveSalary || 0;
        const gross = basic + housing + transport + other + airTicket + leaveSalary;

        const absentDays = empRecs.filter(r => r.status === AttendanceStatus.ABSENT || r.status === AttendanceStatus.UNPAID_LEAVE).length;
        
        const empDeds = deductions.filter(d => {
            const dDate = new Date(d.date);
            return d.employeeId === emp.id && dDate.getMonth() === currentDate.getMonth() && dDate.getFullYear() === currentDate.getFullYear();
        });
        const variableDeductions = empDeds.reduce((sum, curr) => sum + curr.amount, 0);

        const deduction = ((gross / 30) * absentDays) + variableDeductions;
        const net = gross - deduction + totalAdditions;

        return {
            basic: acc.basic + basic,
            housing: acc.housing + housing,
            transport: acc.transport + transport,
            airTicket: acc.airTicket + airTicket,
            leaveSalary: acc.leaveSalary + leaveSalary,
            other: acc.other + other,
            gross: acc.gross + gross,
            deductions: acc.deductions + deduction,
            additions: acc.additions + totalAdditions,
            net: acc.net + net
        };
    }, { basic: 0, housing: 0, transport: 0, airTicket: 0, leaveSalary: 0, other: 0, gross: 0, deductions: 0, additions: 0, net: 0 });
  }, [activeTab, filteredEmployees, attendance, deductions, currentDate]);

  if (!currentUser) return <LoginScreen onLogin={handleLogin} />;

  const daysInMonth = getMonthDays(currentDate);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans w-full">
       <header className="bg-white shadow px-4 sm:px-6 py-4 flex flex-col md:flex-row justify-between items-center sticky top-0 z-30 w-full gap-4">
         <div className="flex items-center gap-4 w-full md:w-auto justify-between">
             <div className="flex items-center gap-4">
                 <div className="bg-indigo-600 p-2 rounded text-white"><Building2 className="w-6 h-6" /></div>
                 <h1 className="text-xl font-bold text-gray-900">ShiftSync</h1>
             </div>
             <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-2 text-gray-600">
                 <Menu className="w-6 h-6" />
             </button>
         </div>
         
         <div className={`${isMobileMenuOpen ? 'flex' : 'hidden'} md:flex flex-col md:flex-row items-center gap-4 w-full md:w-auto`}>
            <div className="flex flex-wrap justify-center gap-2 w-full md:w-auto">
                <select className="bg-gray-100 border-none text-sm rounded px-3 py-1.5 flex-1 md:flex-none" value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}>
                    <option>All Companies</option>
                    {companies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => setShowManageCompanies(true)} className="p-1.5 text-gray-400 hover:text-gray-600"><Settings className="w-4 h-4" /></button>
                {activeTab === 'directory' && (
                    <select className="bg-gray-100 border-none text-sm rounded px-3 py-1.5 flex-1 md:flex-none" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="All">All</option>
                    </select>
                )}
                <select className="bg-gray-100 border-none text-sm rounded px-3 py-1.5 flex-1 md:flex-none" value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
                    <option>All Teams</option>
                    <option value="Internal">Internal</option>
                    <option value="External">External</option>
                    <option value="Office">Office</option>
                </select>
            </div>
            <div className="flex items-center justify-between w-full md:w-auto gap-4">
                <div className="text-right hidden md:block">
                    <div className="text-sm font-bold">{currentUser.name}</div>
                    <div className="text-xs text-gray-500">{currentUser.role}</div>
                </div>
                <button onClick={handleLogout} className="text-gray-400 hover:text-red-600"><LogOut className="w-5 h-5" /></button>
            </div>
         </div>
       </header>

       <div className="bg-white border-b px-6 flex gap-8 overflow-x-auto w-full no-scrollbar">
           {[
               { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
               { id: 'directory', icon: Users, label: 'Staff Directory' },
               { id: 'ex-employees', icon: History, label: 'Ex-Employees' },
               { id: 'timesheet', icon: Calendar, label: 'Monthly Timesheet' },
               { id: 'leave', icon: FileText, label: 'Leave Management' },
               { id: 'payroll', icon: DollarSign, label: 'Payroll Register' },
               { id: 'deductions', icon: Wallet, label: 'Deductions' },
               { id: 'reports', icon: BarChart3, label: 'Reports' },
               { id: 'about', icon: AlertCircle, label: 'About' }
           ].map(tab => (
               <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-4 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                   <tab.icon className="w-4 h-4" /> {tab.label}
               </button>
           ))}
       </div>

       <main className="p-4 md:p-6 w-full">
          {activeTab === 'dashboard' && (
              <div className="space-y-6">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-gray-800">Overview</h2>
                      {currentUser.role === UserRole.ADMIN && (
                          <button onClick={() => setShowUserManagement(true)} className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                              <User className="w-4 h-4" /> User Management
                          </button>
                      )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div onClick={() => handleDashboardFilter('active')} className="bg-white p-6 rounded-xl shadow-sm border cursor-pointer hover:shadow-md transition-shadow">
                          <h3 className="text-gray-500 text-sm font-medium">Total Active Staff</h3>
                          <div className="flex justify-between items-end">
                              <p className="text-3xl font-bold text-gray-800 mt-2">{employees.filter(e => e.active).length}</p>
                              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Users className="w-5 h-5" /></div>
                          </div>
                      </div>
                      <div onClick={() => handleDashboardFilter('internal')} className="bg-white p-6 rounded-xl shadow-sm border cursor-pointer hover:shadow-md transition-shadow">
                          <h3 className="text-gray-500 text-sm font-medium">Internal Team</h3>
                          <div className="flex justify-between items-end">
                              <p className="text-3xl font-bold text-gray-800 mt-2">{employees.filter(e => e.active && e.team === 'Internal Team').length}</p>
                              <div className="p-2 bg-green-50 text-green-600 rounded-lg"><Users className="w-5 h-5" /></div>
                          </div>
                      </div>
                      <div onClick={() => handleDashboardFilter('external')} className="bg-white p-6 rounded-xl shadow-sm border cursor-pointer hover:shadow-md transition-shadow">
                          <h3 className="text-gray-500 text-sm font-medium">External Team</h3>
                          <div className="flex justify-between items-end">
                              <p className="text-3xl font-bold text-gray-800 mt-2">{employees.filter(e => e.active && e.team === 'External Team').length}</p>
                              <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Users className="w-5 h-5" /></div>
                          </div>
                      </div>
                      <div onClick={() => handleDashboardFilter('office')} className="bg-white p-6 rounded-xl shadow-sm border cursor-pointer hover:shadow-md transition-shadow">
                          <h3 className="text-gray-500 text-sm font-medium">Office Staff</h3>
                          <div className="flex justify-between items-end">
                              <p className="text-3xl font-bold text-gray-800 mt-2">{employees.filter(e => e.active && e.team === 'Office Staff').length}</p>
                              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Building2 className="w-5 h-5" /></div>
                          </div>
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-white p-6 rounded-xl shadow-sm border">
                          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Building2 className="w-4 h-4"/> Staff by Company</h3>
                          <div className="space-y-3">
                              {companies.map(c => {
                                  const count = employees.filter(e => e.active && e.company === c).length;
                                  return (
                                      <div key={c} onClick={() => handleDashboardFilter('company', c)} className="flex justify-between items-center p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100">
                                          <span className="text-sm text-gray-600 truncate flex-1 pr-4" title={c}>{c}</span>
                                          <span className="font-bold text-gray-800 bg-white px-2 py-1 rounded text-xs border">{count}</span>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                      <div className="bg-white p-6 rounded-xl shadow-sm border">
                          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Lock className="w-4 h-4"/> My Access</h3>
                          <div className="bg-gray-900 text-white p-6 rounded-xl">
                              <div className="flex items-center gap-4 mb-6">
                                  <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-xl font-bold">
                                      {currentUser.name.charAt(0)}
                                  </div>
                                  <div>
                                      <div className="font-bold text-lg">{currentUser.name}</div>
                                      <div className="text-gray-400 text-sm">@{currentUser.username}</div>
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-xs text-gray-400">
                                  {Object.entries(currentUser.permissions).filter(([_, v]) => v).map(([k]) => (
                                      <div key={k} className="flex items-center gap-2">
                                          <CheckCircle className="w-3 h-3 text-green-500" />
                                          {k.replace('can', '')}
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'directory' && (
              <div className="space-y-4">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                      <h2 className="text-xl font-bold">Employee Directory</h2>
                      <div className="flex flex-col md:flex-row gap-2 items-center w-full md:w-auto">
                          <div className="relative w-full md:w-auto">
                             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                             <input 
                                type="text" 
                                placeholder="Search..." 
                                value={directorySearch} 
                                onChange={e => setDirectorySearch(e.target.value)} 
                                className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64" 
                             />
                          </div>
                          <div className="flex gap-2 w-full md:w-auto">
                            <button onClick={() => setShowEmpImport(true)} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm flex items-center gap-2 flex-1 md:flex-none justify-center"><Upload className="w-4 h-4"/> Import</button>
                            <button onClick={() => setShowOnboarding(true)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm flex items-center gap-2 flex-1 md:flex-none justify-center">
                                <UserPlus className="w-4 h-4" /> Onboard
                            </button>
                          </div>
                      </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm whitespace-nowrap">
                              <thead className="bg-gray-50 border-b font-bold text-gray-600 uppercase text-xs">
                                  <tr>
                                      <th className="p-4">Code</th>
                                      <th className="p-4">Name</th>
                                      <th className="p-4">Company</th>
                                      <th className="p-4">Team</th>
                                      <th className="p-4">Designation</th>
                                      <th className="p-4">Status</th>
                                      <th className="p-4">Leave Bal</th>
                                      <th className="p-4">Emirates ID</th>
                                      <th className="p-4">Passport Exp</th>
                                      <th className="p-4">Labour Card Exp</th>
                                      <th className="p-4 text-center sticky right-0 bg-gray-50 z-10 shadow-l">Actions</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y">
                                  {filteredEmployees.map(emp => (
                                      <tr key={emp.id} className="hover:bg-gray-50">
                                          <td className="p-4 font-mono text-gray-500">{emp.code}</td>
                                          <td className="p-4 font-bold text-gray-800">{emp.name}</td>
                                          <td className="p-4 text-gray-500 truncate max-w-[150px]" title={emp.company}>{emp.company}</td>
                                          <td className="p-4 text-gray-500">{emp.team}</td>
                                          <td className="p-4 text-gray-500">{emp.designation}</td>
                                          <td className="p-4"><span className={`px-2 py-1 rounded-full text-xs font-bold ${emp.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{emp.status}</span></td>
                                          <td className="p-4 font-bold text-indigo-600">{emp.leaveBalance}</td>
                                          <td className="p-4 text-xs font-mono">{emp.documents?.emiratesId || '-'}</td>
                                          <td className={`p-4 text-xs font-mono ${getDateColor(emp.documents?.passportExpiry, 'passport')}`}>{emp.documents?.passportExpiry || '-'}</td>
                                          <td className={`p-4 text-xs font-mono ${getDateColor(emp.documents?.labourCardExpiry)}`}>{emp.documents?.labourCardExpiry || '-'}</td>
                                          <td className="p-4 text-center sticky right-0 bg-white z-10 shadow-l border-l flex justify-center gap-2">
                                              <button onClick={() => setEditEmployee(emp)} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Edit className="w-4 h-4" /></button>
                                              {emp.active && <button onClick={() => setShowOffboarding(emp)} className="text-red-600 hover:bg-red-50 p-1 rounded"><UserPlus className="w-4 h-4" /></button>}
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'ex-employees' && (
              <div className="space-y-4">
                  <div className="flex justify-between items-center">
                      <h2 className="text-xl font-bold">Ex-Employees History</h2>
                      <div className="relative">
                             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                             <input 
                                type="text" 
                                placeholder="Search..." 
                                value={exEmployeeSearch} 
                                onChange={e => setExEmployeeSearch(e.target.value)} 
                                className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64" 
                             />
                      </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                      <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead className="bg-gray-50 border-b font-bold text-gray-600 uppercase text-xs">
                              <tr>
                                  <th className="p-4">Code</th>
                                  <th className="p-4">Name</th>
                                  <th className="p-4">Exit Date</th>
                                  <th className="p-4">Type</th>
                                  <th className="p-4">Reason</th>
                                  <th className="p-4 text-center">Actions</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y">
                              {filteredEmployees.map(emp => (
                                  <tr key={emp.id} className="hover:bg-gray-50">
                                      <td className="p-4 font-mono text-gray-500">{emp.code}</td>
                                      <td className="p-4 font-bold text-gray-800">{emp.name}</td>
                                      <td className="p-4">{emp.offboardingDetails?.exitDate}</td>
                                      <td className="p-4"><span className="bg-red-50 text-red-600 px-2 py-1 rounded text-xs font-bold">{emp.offboardingDetails?.type}</span></td>
                                      <td className="p-4 text-gray-500 truncate max-w-[200px]">{emp.offboardingDetails?.reason}</td>
                                      <td className="p-4 text-center flex justify-center gap-2">
                                          <button onClick={() => setShowExEmployeeDetails(emp)} className="text-gray-600 hover:bg-gray-100 px-2 py-1 rounded text-xs border">View Details</button>
                                          <button onClick={() => setShowRehire(emp)} className="text-green-600 hover:bg-green-50 px-2 py-1 rounded text-xs border border-green-200 font-bold flex items-center gap-1">
                                              <RefreshCcw className="w-3 h-3" /> Re-join
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'timesheet' && (
              <div className="space-y-4">
                  <div className="flex flex-col md:flex-row justify-between items-center bg-white p-3 rounded-xl border shadow-sm gap-4">
                      <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
                          <button onClick={() => handleMonthChange(-1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft /></button>
                          <h2 className="text-lg font-bold w-32 text-center">{currentDate.toLocaleString('default', { month: 'short', year: '2-digit' })}</h2>
                          <button onClick={() => handleMonthChange(1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight /></button>
                      </div>

                      <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto items-center">
                          <div className="relative w-full md:w-auto">
                                 <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                 <input 
                                    type="text" 
                                    placeholder="Search Employee..." 
                                    value={timesheetSearch} 
                                    onChange={e => setTimesheetSearch(e.target.value)} 
                                    className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 bg-gray-50" 
                                 />
                          </div>

                          <div className="flex gap-2 w-full md:w-auto">
                              <button onClick={() => setShowHolidays(true)} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50 text-purple-600 border-purple-200 bg-purple-50 flex items-center justify-center gap-2 flex-1 md:flex-none"><Calendar className="w-4 h-4"/> Holidays</button>
                              <button onClick={() => setShowCopyModal(true)} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50 text-orange-600 border-orange-200 bg-orange-50 flex items-center justify-center gap-2 flex-1 md:flex-none"><Copy className="w-4 h-4"/> Copy</button>
                          </div>
                      </div>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-end mb-2">
                      {Object.entries(LEGEND).map(([key, val]) => (
                          <span key={key} className={`text-[10px] px-2 py-1 rounded border ${val.color}`}>{val.code} - {val.label}</span>
                      ))}
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                          <thead>
                              <tr>
                                  <th className="p-2 border bg-gray-50 min-w-[50px] sticky left-0 z-20 text-center">#</th>
                                  <th className="p-2 border bg-gray-50 min-w-[200px] sticky left-[50px] z-20 text-left">Employee</th>
                                  <th className="p-2 border bg-gray-50 min-w-[60px] text-center">Leave Bal</th>
                                  <th className="p-2 border bg-gray-50 min-w-[50px] text-center text-blue-600">OT</th>
                                  {daysInMonth.map(day => (
                                      <th key={day.toString()} className={`p-1 border min-w-[36px] text-center ${day.getDay() === 0 ? 'text-red-600 bg-red-50' : 'bg-gray-50'}`}>
                                          <div className="text-xs font-bold">{day.getDate()}</div>
                                          <div className="text-[9px] uppercase">{day.toLocaleString('default', { weekday: 'narrow' })}</div>
                                      </th>
                                  ))}
                                  <th className="p-2 border bg-gray-50 min-w-[100px]">Summary</th>
                              </tr>
                          </thead>
                          <tbody>
                              {filteredEmployees.map((emp, idx) => {
                                  const empRecords = attendance.filter(r => r.employeeId === emp.id);
                                  const totalOT = empRecords.reduce((acc, r) => acc + r.overtimeHours, 0);
                                  return (
                                      <tr key={emp.id} className="hover:bg-gray-50 group">
                                          <td className="p-2 border text-center sticky left-0 bg-white z-10 text-gray-400 text-xs">{idx + 1}</td>
                                          <td className="p-2 border font-medium sticky left-[50px] bg-white z-10">
                                              <div className="font-bold text-gray-800">{emp.name}</div>
                                              <div className="text-[10px] text-gray-500">{emp.designation}</div>
                                          </td>
                                          <td className="p-2 border text-center font-bold text-gray-600">{emp.leaveBalance}</td>
                                          <td className="p-2 border text-center font-bold text-blue-600">{totalOT > 0 ? totalOT : '-'}</td>
                                          {daysInMonth.map(day => {
                                              const dateStr = formatDateLocal(day);
                                              const record = attendance.find(r => r.employeeId === emp.id && r.date === dateStr);
                                              const legend = record ? LEGEND[record.status] : null;
                                              
                                              // Logic to display P+OT
                                              let cellLabel = legend ? legend.code : '';
                                              if (record?.status === AttendanceStatus.PRESENT && record.overtimeHours > 0) {
                                                  cellLabel = `P+${record.overtimeHours}`;
                                              }

                                              return (
                                                  <td 
                                                    key={day.toString()} 
                                                    className={`border text-center cursor-pointer transition-all hover:opacity-80 p-0 h-10 relative ${legend ? legend.color : 'hover:bg-gray-100'}`}
                                                    onClick={() => handleAttendanceClick(emp, day)}
                                                    title={record ? `Updated by: ${record.updatedBy}\nNote: ${record.note || '-'}` : 'Click to mark'}
                                                  >
                                                      <div className="flex flex-col items-center justify-center h-full">
                                                          <span className="font-bold text-xs">{cellLabel}</span>
                                                          {record?.otAttachment && <Paperclip className="w-2 h-2 text-indigo-600 absolute top-0.5 right-0.5" />}
                                                      </div>
                                                  </td>
                                              );
                                          })}
                                          <td className="p-2 border text-[10px] text-gray-500 leading-tight">
                                              P: {empRecords.filter(r => r.status === AttendanceStatus.PRESENT).length} / A: {empRecords.filter(r => r.status === AttendanceStatus.ABSENT).length}<br/>
                                              Hrs: {empRecords.reduce((acc, r) => acc + r.hoursWorked, 0)}
                                          </td>
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {activeTab === 'leave' && (
              <div className="space-y-4">
                  <div className="flex justify-between items-center">
                      <h2 className="text-xl font-bold text-gray-800">Leave Management</h2>
                      <button onClick={() => setShowLeaveModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-indigo-700">
                          <FileText className="w-4 h-4" /> New Request
                      </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {leaveRequests.map(req => {
                          const emp = employees.find(e => e.id === req.employeeId);
                          return (
                              <div key={req.id} className="bg-white p-4 rounded-xl shadow-sm border flex flex-col justify-between">
                                  <div>
                                      <div className="flex justify-between items-start mb-2">
                                          <div>
                                              <h4 className="font-bold text-gray-800">{emp?.name}</h4>
                                              <span className="text-xs text-gray-500">{emp?.designation}</span>
                                          </div>
                                          <span className={`px-2 py-1 rounded text-xs font-bold ${req.status === LeaveStatus.APPROVED ? 'bg-green-100 text-green-800' : req.status === LeaveStatus.REJECTED ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                              {req.status}
                                          </span>
                                      </div>
                                      <div className="bg-gray-50 p-2 rounded text-sm mb-3">
                                          <div className="flex justify-between"><span className="text-gray-500">Type:</span> <span className="font-medium">{req.type}</span></div>
                                          <div className="flex justify-between"><span className="text-gray-500">From:</span> <span className="font-medium">{req.startDate}</span></div>
                                          <div className="flex justify-between"><span className="text-gray-500">To:</span> <span className="font-medium">{req.endDate}</span></div>
                                      </div>
                                      <p className="text-sm text-gray-600 italic mb-4">"{req.reason}"</p>
                                  </div>
                                  {req.status === LeaveStatus.PENDING && (
                                      <div className="flex gap-2 mt-auto">
                                          <button onClick={() => handleLeaveAction(req.id, LeaveStatus.REJECTED)} className="flex-1 py-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50 text-sm">Reject</button>
                                          <button onClick={() => handleLeaveAction(req.id, LeaveStatus.APPROVED)} className="flex-1 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm">Approve</button>
                                      </div>
                                  )}
                              </div>
                          );
                      })}
                      {leaveRequests.length === 0 && <p className="col-span-3 text-center text-gray-400 py-12 italic">No leave requests found.</p>}
                  </div>
              </div>
          )}

          {activeTab === 'payroll' && (
              <div className="space-y-4">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                      <h2 className="text-xl font-bold text-gray-800">Payroll Register - {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                      <div className="flex flex-col md:flex-row gap-2 items-center w-full md:w-auto">
                          <div className="relative w-full md:w-auto">
                             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                             <input 
                                type="text" 
                                placeholder="Search..." 
                                value={payrollSearch} 
                                onChange={e => setPayrollSearch(e.target.value)} 
                                className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64" 
                             />
                          </div>
                          <button className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50 flex items-center justify-center gap-2 w-full md:w-auto" onClick={() => window.print()}>
                              <Printer className="w-4 h-4" /> Print Summary
                          </button>
                      </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm whitespace-nowrap">
                              <thead className="bg-gray-50 border-b font-bold text-gray-600 uppercase text-xs">
                                  <tr>
                                      <th className="p-4">Code</th>
                                      <th className="p-4">Name</th>
                                      <th className="p-4 text-right">Basic</th>
                                      <th className="p-4 text-right">Housing</th>
                                      <th className="p-4 text-right">Transport</th>
                                      <th className="p-4 text-right">Air Ticket</th>
                                      <th className="p-4 text-right">Leave Payment</th>
                                      <th className="p-4 text-right">Other</th>
                                      <th className="p-4 text-right font-bold">Gross</th>
                                      <th className="p-4 text-right text-red-600">Deductions</th>
                                      <th className="p-4 text-right text-blue-600">Additions</th>
                                      <th className="p-4 text-right font-bold text-green-600">Net Salary</th>
                                      <th className="p-4 text-center print:hidden">Action</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y">
                                  {filteredEmployees.filter(e => e.active).map(emp => {
                                      const empRecs = attendance.filter(r => r.employeeId === emp.id);
                                      const { overtimePay, holidayPay, weekOffPay } = calculateAdditionalEarnings(empRecs, emp.team);
                                      const totalAdditions = overtimePay + holidayPay + weekOffPay;
                                      
                                      const basic = emp.salary?.basic || 0;
                                      const housing = emp.salary?.housing || 0;
                                      const transport = emp.salary?.transport || 0;
                                      const other = emp.salary?.other || 0;
                                      const airTicket = emp.salary?.airTicket || 0;
                                      const leaveSalary = emp.salary?.leaveSalary || 0;
                                      
                                      const gross = basic + housing + transport + other + airTicket + leaveSalary;
                                      
                                      const absentDays = empRecs.filter(r => r.status === AttendanceStatus.ABSENT || r.status === AttendanceStatus.UNPAID_LEAVE).length;
                                      
                                      const empDeds = deductions.filter(d => {
                                            const dDate = new Date(d.date);
                                            return d.employeeId === emp.id && dDate.getMonth() === currentDate.getMonth() && dDate.getFullYear() === currentDate.getFullYear();
                                      });
                                      const variableDeductions = empDeds.reduce((acc, curr) => acc + curr.amount, 0);

                                      const deduction = ((gross / 30) * absentDays) + variableDeductions;
                                      const net = gross - deduction + totalAdditions;

                                      return (
                                          <tr key={emp.id} className="hover:bg-gray-50">
                                              <td className="p-4 font-mono text-gray-500 text-xs">{emp.code}</td>
                                              <td className="p-4 font-bold text-gray-800">{emp.name}</td>
                                              <td className="p-4 text-right text-gray-600">{basic.toLocaleString()}</td>
                                              <td className="p-4 text-right text-gray-600">{housing.toLocaleString()}</td>
                                              <td className="p-4 text-right text-gray-600">{transport.toLocaleString()}</td>
                                              <td className="p-4 text-right text-gray-600">{airTicket.toLocaleString()}</td>
                                              <td className="p-4 text-right text-gray-600">{leaveSalary.toLocaleString()}</td>
                                              <td className="p-4 text-right text-gray-600">{other.toLocaleString()}</td>
                                              <td className="p-4 text-right font-bold">{gross.toLocaleString()}</td>
                                              <td className="p-4 text-right text-red-600">({deduction.toLocaleString(undefined, {maximumFractionDigits: 0})})</td>
                                              <td className="p-4 text-right text-blue-600">{totalAdditions > 0 ? totalAdditions.toLocaleString() : '-'}</td>
                                              <td className="p-4 text-right font-bold text-green-700">{net.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                                              <td className="p-4 text-center print:hidden">
                                                  <button onClick={() => setShowPayslip(emp)} className="text-blue-600 hover:text-blue-800 text-xs font-bold hover:underline">Payslip</button>
                                              </td>
                                          </tr>
                                      );
                                  })}
                                  {/* Total Row */}
                                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                                      <td className="p-4" colSpan={2}>TOTAL</td>
                                      <td className="p-4 text-right">{payrollTotals.basic.toLocaleString()}</td>
                                      <td className="p-4 text-right">{payrollTotals.housing.toLocaleString()}</td>
                                      <td className="p-4 text-right">{payrollTotals.transport.toLocaleString()}</td>
                                      <td className="p-4 text-right">{payrollTotals.airTicket.toLocaleString()}</td>
                                      <td className="p-4 text-right">{payrollTotals.leaveSalary.toLocaleString()}</td>
                                      <td className="p-4 text-right">{payrollTotals.other.toLocaleString()}</td>
                                      <td className="p-4 text-right">{payrollTotals.gross.toLocaleString()}</td>
                                      <td className="p-4 text-right text-red-600">({payrollTotals.deductions.toLocaleString(undefined, {maximumFractionDigits: 0})})</td>
                                      <td className="p-4 text-right text-blue-600">{payrollTotals.additions.toLocaleString()}</td>
                                      <td className="p-4 text-right text-green-700">{payrollTotals.net.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                                      <td className="p-4"></td>
                                  </tr>
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'deductions' && (
              <DeductionsView deductions={deductions} employees={employees} onRefresh={handleRefresh} />
          )}
          
          {activeTab === 'reports' && <ReportsView employees={employees} attendance={attendance} />}
          {activeTab === 'about' && <AboutView currentUser={currentUser} />}

       </main>

       {/* Modals */}
       {showOnboarding && (
           <OnboardingWizard companies={companies} onClose={() => setShowOnboarding(false)} onComplete={() => { setShowOnboarding(false); handleRefresh(); }} />
       )}
       {showOffboarding && (
           <OffboardingWizard employee={showOffboarding} onClose={() => setShowOffboarding(null)} onComplete={() => { setShowOffboarding(null); handleRefresh(); }} />
       )}
       {showImport && (
           <BulkImportModal isOpen={showImport} onClose={() => setShowImport(false)} onImport={(csv) => { importAttendanceFromCSV(csv); setShowImport(false); handleRefresh(); }} />
       )}
       {showEmpImport && (
           <EmployeeImportModal isOpen={showEmpImport} onClose={() => setShowEmpImport(false)} onImport={(csv) => { importEmployeesFromCSV(csv); setShowEmpImport(false); handleRefresh(); }} />
       )}
       {showAttendanceModal.isOpen && showAttendanceModal.employee && showAttendanceModal.date && (
           <AttendanceActionModal 
                isOpen={true}
                onClose={() => setShowAttendanceModal({ isOpen: false })}
                onSave={handleAttendanceSave}
                onDelete={handleAttendanceDelete}
                employeeName={showAttendanceModal.employee.name}
                date={formatDateLocal(showAttendanceModal.date)}
                currentStatus={attendance.find(r => r.employeeId === showAttendanceModal.employee!.id && r.date === formatDateLocal(showAttendanceModal.date!))?.status || AttendanceStatus.PRESENT}
                currentOt={attendance.find(r => r.employeeId === showAttendanceModal.employee!.id && r.date === formatDateLocal(showAttendanceModal.date!))?.overtimeHours || 0}
                currentAttachment={attendance.find(r => r.employeeId === showAttendanceModal.employee!.id && r.date === formatDateLocal(showAttendanceModal.date!))?.otAttachment}
                currentNote={attendance.find(r => r.employeeId === showAttendanceModal.employee!.id && r.date === formatDateLocal(showAttendanceModal.date!))?.note}
                onPreview={setShowPreview}
                isOtEligible={showAttendanceModal.employee.team !== 'Office Staff'}
           />
       )}
       {showPayslip && (
           <PayslipModal employee={showPayslip} month={currentDate.getMonth()} year={currentDate.getFullYear()} onClose={() => setShowPayslip(null)} />
       )}
       {showHolidays && (
           <HolidayManagementModal isOpen={showHolidays} onClose={() => setShowHolidays(false)} />
       )}
       {showPreview && (
           <DocumentPreviewModal isOpen={true} onClose={() => setShowPreview(null)} attachment={showPreview} />
       )}
       {showUserManagement && (
           <UserManagementModal isOpen={true} onClose={() => setShowUserManagement(false)} />
       )}
       {showManageCompanies && (
           <ManageCompaniesModal isOpen={true} onClose={() => setShowManageCompanies(false)} companies={companies} onDataChange={setCompanies} />
       )}
       {showExEmployeeDetails && (
           <ExEmployeeDetailsModal employee={showExEmployeeDetails} onClose={() => setShowExEmployeeDetails(null)} />
       )}
       {showCopyModal && (
           <CopyAttendanceModal isOpen={true} onClose={() => setShowCopyModal(false)} onCopy={handleCopyAttendance} />
       )}
       {showLeaveModal && (
           <LeaveRequestModal employees={employees} onClose={() => setShowLeaveModal(false)} onSave={handleRefresh} />
       )}
       {showRehire && (
           <RehireModal employee={showRehire} onClose={() => setShowRehire(null)} onConfirm={(id, date, reason) => { rehireEmployee(id, date, reason); setShowRehire(null); handleRefresh(); }} />
       )}
       {editEmployee && (
           <EditEmployeeModal employee={editEmployee} companies={companies} onClose={() => setEditEmployee(null)} onSave={handleEditSave} />
       )}
    </div>
  );
};

export default App;