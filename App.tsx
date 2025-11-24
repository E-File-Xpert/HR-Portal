
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, Calendar, Settings, Upload, UserPlus, LogOut, 
  Building2, CheckCircle, XCircle, User, Check, Trash2, 
  AlertCircle, Paperclip, Eye, Edit, Lock, CheckSquare, 
  Square, Camera, RefreshCcw, Copy, FileText, Download,
  Printer, DollarSign, ChevronLeft, ChevronRight, Search,
  History, BarChart3, FileDown, Menu, Wallet, UserMinus
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

// Unified Payroll Calculation Logic
const calculatePayroll = (
    employee: Employee, 
    allAttendance: AttendanceRecord[], 
    allDeductions: DeductionRecord[], 
    month: number, 
    year: number
) => {
    // Filter records for this employee and month
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;
    
    const empRecs = allAttendance.filter(r => 
        r.employeeId === employee.id && r.date >= start && r.date <= end
    );

    // Earnings from Salary Structure
    const basic = employee.salary?.basic || 0;
    const housing = employee.salary?.housing || 0;
    const transport = employee.salary?.transport || 0;
    const airTicket = employee.salary?.airTicket || 0;
    const leaveSalary = employee.salary?.leaveSalary || 0;
    const other = employee.salary?.other || 0;
    
    const gross = basic + housing + transport + airTicket + leaveSalary + other;

    // Additional Earnings (OT, etc)
    const { overtimePay, holidayPay, weekOffPay, totalOTHours } = calculateAdditionalEarnings(empRecs, employee.team);
    const totalAdditions = overtimePay + holidayPay + weekOffPay;

    // Deductions Logic
    // Absent, UL, AL, EL are treated as Unpaid Days
    const unpaidDaysCount = empRecs.filter(r => 
        r.status === AttendanceStatus.ABSENT || 
        r.status === AttendanceStatus.UNPAID_LEAVE ||
        r.status === AttendanceStatus.ANNUAL_LEAVE ||
        r.status === AttendanceStatus.EMERGENCY_LEAVE
    ).length;

    // Variable Deductions (Loans, fines, etc)
    const empDeds = allDeductions.filter(d => {
        const dDate = new Date(d.date);
        return d.employeeId === employee.id && dDate.getMonth() === month && dDate.getFullYear() === year;
    });
    const variableDeductionsTotal = empDeds.reduce((acc, curr) => acc + curr.amount, 0);

    // Calculate Deduction Amount (Gross / 30 * unpaid days)
    const unpaidDeductionAmount = (gross / 30) * unpaidDaysCount;
    const totalDeductions = unpaidDeductionAmount + variableDeductionsTotal;

    const netSalary = gross - totalDeductions + totalAdditions;

    return {
        basic, housing, transport, airTicket, leaveSalary, other,
        gross,
        overtimePay, holidayPay, weekOffPay, totalOTHours, totalAdditions,
        unpaidDaysCount, unpaidDeductionAmount,
        variableDeductions: empDeds, variableDeductionsTotal,
        totalDeductions,
        netSalary,
        empRecs
    };
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

const LeaveRequestModal = ({ employees, onClose, onSave, currentUser }: any) => {
    const [req, setReq] = useState<any>({
        type: AttendanceStatus.ANNUAL_LEAVE,
        startDate: formatDateLocal(new Date()),
        endDate: formatDateLocal(new Date()),
        reason: ''
    });

    const handleSubmit = () => {
        if (!req.employeeId || !req.reason) return alert("Missing fields");
        saveLeaveRequest(req, currentUser.name || currentUser.username);
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
                    <div className="text-xs text-gray-500">Created by: {currentUser.name}</div>
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

const ReportsView = ({ employees, attendance }: any) => {
    const activeStaff = employees.filter((e: any) => e.active).length;
    const inactiveStaff = employees.filter((e: any) => !e.active).length;
    
    const presentCount = attendance.filter((r: any) => r.status === AttendanceStatus.PRESENT).length;
    const absentCount = attendance.filter((r: any) => r.status === AttendanceStatus.ABSENT).length;

    return (
        <div className="space-y-6">
             <h2 className="text-xl font-bold text-gray-800">Reports & Analytics</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 <div className="bg-white p-4 rounded-xl shadow-sm border">
                     <div className="text-gray-500 text-sm">Active Staff</div>
                     <div className="text-2xl font-bold">{activeStaff}</div>
                 </div>
                 <div className="bg-white p-4 rounded-xl shadow-sm border">
                     <div className="text-gray-500 text-sm">Ex-Employees</div>
                     <div className="text-2xl font-bold">{inactiveStaff}</div>
                 </div>
                 <div className="bg-white p-4 rounded-xl shadow-sm border">
                     <div className="text-gray-500 text-sm">Total Presents (View Range)</div>
                     <div className="text-2xl font-bold text-green-600">{presentCount}</div>
                 </div>
                 <div className="bg-white p-4 rounded-xl shadow-sm border">
                     <div className="text-gray-500 text-sm">Total Absents (View Range)</div>
                     <div className="text-2xl font-bold text-red-600">{absentCount}</div>
                 </div>
             </div>
             <div className="bg-white p-8 rounded-xl shadow-sm border text-center text-gray-500 italic">
                 Detailed charts and exportable reports coming soon.
             </div>
        </div>
    );
};

const AboutView = ({ currentUser }: any) => {
    const [data, setData] = useState<AboutData>(getAboutData());
    const [isEditing, setIsEditing] = useState(false);

    const handleSave = () => {
        saveAboutData(data);
        setIsEditing(false);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const b64 = await readFileAsBase64(e.target.files[0]);
            setData({ ...data, profileImage: b64 });
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 h-32 relative">
                    {currentUser.role === UserRole.CREATOR && (
                         <button onClick={() => setIsEditing(!isEditing)} className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white p-2 rounded-lg backdrop-blur-sm transition-colors">
                             <Edit className="w-5 h-5" />
                         </button>
                    )}
                </div>
                <div className="px-8 pb-8">
                    <div className="relative -mt-16 mb-6 flex justify-center">
                        <div className="w-32 h-32 rounded-full border-4 border-white shadow-lg bg-gray-200 overflow-hidden relative group">
                            {data.profileImage ? (
                                <img src={data.profileImage} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100"><User className="w-16 h-16"/></div>
                            )}
                            {isEditing && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                    <label className="cursor-pointer text-white text-xs flex flex-col items-center">
                                        <Camera className="w-6 h-6 mb-1"/> Change
                                        <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>

                    {isEditing ? (
                        <div className="space-y-4 max-w-lg mx-auto">
                            <input type="text" value={data.name} onChange={e => setData({...data, name: e.target.value})} className="w-full p-2 border rounded font-bold text-center text-xl" placeholder="Name" />
                            <input type="text" value={data.title} onChange={e => setData({...data, title: e.target.value})} className="w-full p-2 border rounded text-center text-indigo-600" placeholder="Title" />
                            <textarea value={data.bio} onChange={e => setData({...data, bio: e.target.value})} className="w-full p-2 border rounded h-32 text-center" placeholder="Bio"></textarea>
                            <input type="text" value={data.email} onChange={e => setData({...data, email: e.target.value})} className="w-full p-2 border rounded text-center" placeholder="Email" />
                            <input type="text" value={data.contactInfo} onChange={e => setData({...data, contactInfo: e.target.value})} className="w-full p-2 border rounded text-center" placeholder="Contact Info" />
                            <button onClick={handleSave} className="w-full bg-indigo-600 text-white py-2 rounded font-bold">Save Changes</button>
                        </div>
                    ) : (
                        <div className="text-center space-y-4">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">{data.name}</h1>
                                <p className="text-indigo-600 font-medium">{data.title}</p>
                            </div>
                            <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed">{data.bio}</p>
                            <div className="flex flex-col md:flex-row justify-center items-center gap-4 text-sm text-gray-500 pt-4 border-t">
                                <span>{data.email}</span>
                                <span className="hidden md:inline">•</span>
                                <span>{data.contactInfo}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <div className="text-center mt-8 text-xs text-gray-400">
                v1.0.0 &copy; 2025 ShiftSync. All rights reserved.
            </div>
        </div>
    );
};

const RehireModal = ({ employee, onClose, onConfirm }: any) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [reason, setReason] = useState('');

    if (!employee) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl max-w-md w-full shadow-2xl">
                <h3 className="font-bold text-lg mb-4">Re-join Employee: {employee.name}</h3>
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium mb-1">Re-joining Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Reason / Notes</label>
                        <textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full p-2 border rounded h-24" placeholder="e.g., Returning from vacation, Contract renewed"></textarea>
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
                    <button onClick={() => onConfirm(employee.id, date, reason)} className="px-4 py-2 bg-green-600 text-white rounded font-bold">Confirm Re-join</button>
                </div>
            </div>
        </div>
    );
};

const OnboardingWizard = ({ companies, onClose, onComplete }: any) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<Partial<Employee>>({
        name: '', code: '', designation: '', department: '',
        company: companies[0] || '', joiningDate: new Date().toISOString().split('T')[0],
        type: StaffType.WORKER, status: 'Active', team: 'Internal Team',
        workLocation: '', leaveBalance: 0,
        salary: { basic: 0, housing: 0, transport: 0, other: 0, airTicket: 0, leaveSalary: 0 },
        active: true, documents: {}
    });

    const handleSave = () => {
        saveEmployee({ ...formData, id: Math.random().toString(36).substr(2, 9) } as Employee);
        onComplete();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl h-[80vh] flex flex-col rounded-xl shadow-2xl">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="font-bold text-lg">Onboard New Employee</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <input placeholder="Name" className="p-2 border rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                        <input placeholder="Code" className="p-2 border rounded" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
                        <select className="p-2 border rounded" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})}>
                            {companies.map((c: string) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select className="p-2 border rounded" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as StaffType})}>
                            <option value={StaffType.WORKER}>Worker</option>
                            <option value={StaffType.OFFICE}>Office Staff</option>
                        </select>
                         <select className="p-2 border rounded" value={formData.team} onChange={e => setFormData({...formData, team: e.target.value as any})}>
                            <option value="Internal Team">Internal Team</option>
                            <option value="External Team">External Team</option>
                            <option value="Office Staff">Office Staff</option>
                        </select>
                        <input placeholder="Designation" className="p-2 border rounded" value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})} />
                         <input placeholder="Department" className="p-2 border rounded" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} />
                         <input type="date" className="p-2 border rounded" value={formData.joiningDate} onChange={e => setFormData({...formData, joiningDate: e.target.value})} />
                    </div>
                    <div className="pt-4 border-t">
                        <h4 className="font-bold mb-2">Salary Structure</h4>
                        <div className="grid grid-cols-3 gap-4">
                            <input type="number" placeholder="Basic" className="p-2 border rounded" value={formData.salary?.basic} onChange={e => setFormData({...formData, salary: {...formData.salary!, basic: Number(e.target.value)}})} />
                            <input type="number" placeholder="Housing" className="p-2 border rounded" value={formData.salary?.housing} onChange={e => setFormData({...formData, salary: {...formData.salary!, housing: Number(e.target.value)}})} />
                            <input type="number" placeholder="Transport" className="p-2 border rounded" value={formData.salary?.transport} onChange={e => setFormData({...formData, salary: {...formData.salary!, transport: Number(e.target.value)}})} />
                             <input type="number" placeholder="Air Ticket" className="p-2 border rounded" value={formData.salary?.airTicket} onChange={e => setFormData({...formData, salary: {...formData.salary!, airTicket: Number(e.target.value)}})} />
                             <input type="number" placeholder="Leave Salary" className="p-2 border rounded" value={formData.salary?.leaveSalary} onChange={e => setFormData({...formData, salary: {...formData.salary!, leaveSalary: Number(e.target.value)}})} />
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t flex justify-end gap-2 bg-gray-50 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded">Complete Onboarding</button>
                </div>
            </div>
        </div>
    );
};

const OffboardingWizard = ({ employee, onClose, onComplete }: any) => {
    const [details, setDetails] = useState<OffboardingDetails>({
        type: 'Resignation', exitDate: new Date().toISOString().split('T')[0], reason: '',
        gratuity: 0, leaveEncashment: 0, salaryDues: 0, otherDues: 0, deductions: 0, netSettlement: 0, assetsReturned: false, notes: ''
    });

    const handleSubmit = () => {
        offboardEmployee(employee.id, details);
        onComplete();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-2xl">
                <h3 className="font-bold text-lg mb-4">Offboard: {employee.name}</h3>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    <div className="grid grid-cols-2 gap-4">
                         <select className="p-2 border rounded" value={details.type} onChange={e => setDetails({...details, type: e.target.value as any})}>
                            <option>Resignation</option><option>Termination</option><option>End of Contract</option>
                        </select>
                        <input type="date" className="p-2 border rounded" value={details.exitDate} onChange={e => setDetails({...details, exitDate: e.target.value})} />
                    </div>
                    <textarea className="w-full p-2 border rounded" placeholder="Reason" value={details.reason} onChange={e => setDetails({...details, reason: e.target.value})} />
                    <div className="grid grid-cols-2 gap-4">
                        <input type="number" placeholder="Gratuity" className="p-2 border rounded" value={details.gratuity} onChange={e => setDetails({...details, gratuity: Number(e.target.value)})} />
                        <input type="number" placeholder="Salary Dues" className="p-2 border rounded" value={details.salaryDues} onChange={e => setDetails({...details, salaryDues: Number(e.target.value)})} />
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-red-600 text-white rounded">Confirm Exit</button>
                </div>
            </div>
        </div>
    );
};

const UserManagementModal = ({ isOpen, onClose }: any) => {
    const [users, setUsers] = useState(getSystemUsers());
    const [newUser, setNewUser] = useState<Partial<SystemUser>>({ username: '', password: '', name: '', role: UserRole.HR });

    if (!isOpen) return null;

    const handleAdd = () => {
        if (!newUser.username || !newUser.password) return;
        try {
            const updated = addSystemUser({ ...newUser, active: true, permissions: { canViewDashboard: true } } as SystemUser);
            setUsers(updated);
            setNewUser({ username: '', password: '', name: '', role: UserRole.HR });
        } catch (e) { alert(e); }
    };

    const handleDelete = (u: string) => {
        if(window.confirm("Delete user?")) setUsers(deleteSystemUser(u));
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg p-6 rounded-xl shadow-2xl">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">System Users</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500" /></button>
                </div>
                <div className="space-y-4 mb-4">
                    <div className="flex gap-2">
                        <input placeholder="Username" className="p-2 border rounded flex-1" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
                        <input placeholder="Password" className="p-2 border rounded flex-1" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                    </div>
                     <button onClick={handleAdd} className="w-full bg-indigo-600 text-white py-2 rounded">Add User</button>
                </div>
                <div className="space-y-2">
                    {users.map(u => (
                        <div key={u.username} className="flex justify-between items-center p-2 bg-gray-50 rounded border">
                            <span>{u.username} ({u.role})</span>
                            <button onClick={() => handleDelete(u.username)} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const ManageCompaniesModal = ({ isOpen, onClose, companies, onDataChange }: any) => {
    const [newCo, setNewCo] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-2xl">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">Manage Companies</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500" /></button>
                </div>
                <div className="flex gap-2 mb-4">
                    <input className="flex-1 p-2 border rounded" value={newCo} onChange={e => setNewCo(e.target.value)} placeholder="New Company Name" />
                    <button onClick={() => { if(newCo) { onDataChange(addCompany(newCo)); setNewCo(''); } }} className="bg-indigo-600 text-white px-4 rounded">Add</button>
                </div>
                <ul className="space-y-2 max-h-60 overflow-y-auto">
                    {companies.map((c: string) => (
                        <li key={c} className="flex justify-between items-center p-2 bg-gray-50 rounded border">
                            <span className="text-sm">{c}</span>
                            <button onClick={() => { if(window.confirm('Delete?')) onDataChange(deleteCompany(c)); }} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

const ExEmployeeDetailsModal = ({ employee, onClose }: any) => {
    if (!employee) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-2xl">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">Exit Details: {employee.name}</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500" /></button>
                </div>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Exit Date:</span> <strong>{employee.offboardingDetails?.exitDate}</strong></div>
                    <div className="flex justify-between"><span>Type:</span> <strong>{employee.offboardingDetails?.type}</strong></div>
                    <div className="bg-gray-50 p-2 rounded italic text-gray-600 my-2">{employee.offboardingDetails?.reason}</div>
                    <div className="border-t pt-2">
                        <div className="flex justify-between"><span>Final Settlement:</span> <strong className="text-green-600">{employee.offboardingDetails?.netSettlement}</strong></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ViewEmployeeModal = ({ employee, onClose }: any) => {
    if (!employee) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl">{employee.name}</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500" /></button>
                </div>
                <div className="grid grid-cols-2 gap-6 text-sm">
                    <div>
                        <h4 className="font-bold text-gray-500 uppercase text-xs mb-2">Personal & Work</h4>
                        <div className="space-y-2">
                            <p><span className="text-gray-500">Code:</span> {employee.code}</p>
                            <p><span className="text-gray-500">Designation:</span> {employee.designation}</p>
                            <p><span className="text-gray-500">Company:</span> {employee.company}</p>
                            <p><span className="text-gray-500">Joining:</span> {employee.joiningDate}</p>
                        </div>
                    </div>
                     <div>
                        <h4 className="font-bold text-gray-500 uppercase text-xs mb-2">Documents</h4>
                        <div className="space-y-2">
                            <p><span className="text-gray-500">EID Expiry:</span> {employee.documents?.emiratesIdExpiry || '-'}</p>
                            <p><span className="text-gray-500">Passport Expiry:</span> {employee.documents?.passportExpiry || '-'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const EditEmployeeModal = ({ employee, companies, onClose, onSave }: any) => {
    const [data, setData] = useState<Employee>(employee);

    const handleSave = () => onSave(data);

    return (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl">Edit Employee</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500" /></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                     <input className="p-2 border rounded" value={data.name} onChange={e => setData({...data, name: e.target.value})} placeholder="Name" />
                     <input className="p-2 border rounded" value={data.code} onChange={e => setData({...data, code: e.target.value})} placeholder="Code" />
                     <select className="p-2 border rounded" value={data.company} onChange={e => setData({...data, company: e.target.value})}>
                        {companies.map((c: string) => <option key={c} value={c}>{c}</option>)}
                     </select>
                     <input className="p-2 border rounded" value={data.designation} onChange={e => setData({...data, designation: e.target.value})} placeholder="Designation" />
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

// Update PayslipModal to show Air Ticket, Leave Salary, OT explicitly
const PayslipModal = ({ employee, month, year, onClose, allAttendance, allDeductions }: any) => {
    // Use the unified calculator
    const payrollData = calculatePayroll(employee, allAttendance, allDeductions, month, year);

    const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
    const { 
        basic, housing, transport, airTicket, leaveSalary, other, 
        gross, totalAdditions, totalDeductions, netSalary,
        overtimePay, holidayPay, weekOffPay, totalOTHours,
        unpaidDaysCount, unpaidDeductionAmount, variableDeductions
    } = payrollData;

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
                            <div class="grid grid-cols-2 gap-y-2 text-sm">
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
                                    <td className="p-2 border">Unpaid Days ({unpaidDaysCount} days)</td>
                                    <td className="p-2 border text-right text-red-600">{unpaidDeductionAmount > 0 ? unpaidDeductionAmount.toLocaleString(undefined, {maximumFractionDigits: 2}) : '0.00'}</td>
                                </tr>
                                <tr>
                                    <td className="p-2 border">Housing Allowance</td>
                                    <td className="p-2 border text-right">{housing.toLocaleString()}</td>
                                    <td className="p-2 border">
                                        {unpaidDaysCount > 0 && (
                                            <span className="text-[10px] text-red-500 italic block">
                                                * Includes Absent/UL/AL/EL as unpaid.
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-2 border text-right"></td>
                                </tr>
                                <tr>
                                    <td className="p-2 border">Transport Allowance</td>
                                    <td className="p-2 border text-right">{transport.toLocaleString()}</td>
                                    <td className="p-2 border"></td>
                                    <td className="p-2 border text-right"></td>
                                </tr>
                                <tr>
                                    <td className="p-2 border">Air Ticket</td>
                                    <td className="p-2 border text-right">{airTicket.toLocaleString()}</td>
                                    <td className="p-2 border"></td>
                                    <td className="p-2 border text-right"></td>
                                </tr>
                                <tr>
                                    <td className="p-2 border">Leave Salary</td>
                                    <td className="p-2 border text-right">{leaveSalary.toLocaleString()}</td>
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
                                {variableDeductions.map((d: any) => (
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
                                    <td className="p-3 border text-right">{totalDeductions.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end">
                        <div className="bg-gray-900 text-white p-4 rounded-lg min-w-[250px]">
                            <div className="text-xs text-gray-400 uppercase mb-1">Net Pay</div>
                            <div className="text-2xl font-bold">AED {netSalary.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
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
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null);
  
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
      updateLeaveRequestStatus(id, status, currentUser?.name || currentUser?.username);
      handleRefresh();
  };

  const handleEditSave = (data: Employee) => {
      saveEmployee(data);
      setEditEmployee(null);
      handleRefresh();
  };

  // --- Print All Payslips Logic ---
  const handlePrintAllPayslips = () => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return alert("Please allow popups to print.");

      // Calculate data for all active visible employees
      const payslipsData = filteredEmployees.filter(e => e.active).map(emp => {
          return {
              emp,
              data: calculatePayroll(emp, attendance, deductions, currentDate.getMonth(), currentDate.getFullYear())
          };
      });
      
      const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

      const htmlContent = `
        <html>
        <head>
            <title>Payslips - ${monthName}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @media print {
                    .page-break { page-break-after: always; }
                    body { -webkit-print-color-adjust: exact; }
                }
                body { font-family: 'Inter', sans-serif; background: #fff; }
            </style>
        </head>
        <body>
            ${payslipsData.map(({ emp, data }) => `
                <div class="max-w-2xl mx-auto p-8 border-b mb-8 page-break">
                    <div class="text-center border-b pb-6 mb-6">
                        <h1 class="text-2xl font-bold uppercase text-gray-900">${emp.company}</h1>
                        <p class="text-sm text-gray-500">Payslip for the month of ${monthName}</p>
                    </div>

                    <div class="grid grid-cols-2 gap-8 mb-8">
                        <div>
                            <div class="text-xs text-gray-500 uppercase font-bold mb-1">Employee Details</div>
                            <div class="grid grid-cols-2 gap-y-2 text-sm">
                                <span class="text-gray-600">Name:</span><span class="font-bold">${emp.name}</span>
                                <span class="text-gray-600">Code:</span><span class="font-mono">${emp.code}</span>
                                <span class="text-gray-600">Designation:</span><span>${emp.designation}</span>
                            </div>
                        </div>
                        <div>
                            <div class="text-xs text-gray-500 uppercase font-bold mb-1">Bank Details</div>
                            <div class="grid grid-cols-2 gap-y-2 text-sm">
                                <span class="text-gray-600">Bank Name:</span><span>${emp.bankName || '-'}</span>
                                <span class="text-gray-600">IBAN:</span><span class="font-mono">${emp.iban || '-'}</span>
                            </div>
                        </div>
                    </div>

                    <table class="w-full text-sm border border-gray-200 mb-6">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="p-2 border text-left">Earnings</th>
                                <th class="p-2 border text-right">Amount</th>
                                <th class="p-2 border text-left">Deductions</th>
                                <th class="p-2 border text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="p-2 border">Basic Salary</td><td class="p-2 border text-right">${data.basic.toLocaleString()}</td>
                                <td class="p-2 border">Unpaid Days (${data.unpaidDaysCount})</td><td class="p-2 border text-right text-red-600">${data.unpaidDeductionAmount > 0 ? data.unpaidDeductionAmount.toLocaleString(undefined, {maximumFractionDigits: 2}) : '0.00'}</td>
                            </tr>
                            <tr>
                                <td class="p-2 border">Housing Allowance</td><td class="p-2 border text-right">${data.housing.toLocaleString()}</td>
                                <td class="p-2 border"></td><td class="p-2 border"></td>
                            </tr>
                            <tr>
                                <td class="p-2 border">Transport Allowance</td><td class="p-2 border text-right">${data.transport.toLocaleString()}</td>
                                <td class="p-2 border"></td><td class="p-2 border"></td>
                            </tr>
                            <tr>
                                <td class="p-2 border">Air Ticket</td><td class="p-2 border text-right">${data.airTicket.toLocaleString()}</td>
                                <td class="p-2 border"></td><td class="p-2 border"></td>
                            </tr>
                            <tr>
                                <td class="p-2 border">Leave Salary</td><td class="p-2 border text-right">${data.leaveSalary.toLocaleString()}</td>
                                <td class="p-2 border"></td><td class="p-2 border"></td>
                            </tr>
                             <tr>
                                <td class="p-2 border">Other Allowances</td><td class="p-2 border text-right">${data.other.toLocaleString()}</td>
                                <td class="p-2 border"></td><td class="p-2 border"></td>
                            </tr>
                            <tr>
                                <td class="p-2 border text-blue-600">Overtime (${data.totalOTHours})</td><td class="p-2 border text-right text-blue-600">${data.overtimePay.toLocaleString()}</td>
                                <td class="p-2 border"></td><td class="p-2 border"></td>
                            </tr>
                            ${data.holidayPay > 0 ? `<tr><td class="p-2 border text-blue-600">Holiday Pay</td><td class="p-2 border text-right text-blue-600">${data.holidayPay.toLocaleString()}</td><td class="p-2 border"></td><td class="p-2 border"></td></tr>` : ''}
                            ${data.weekOffPay > 0 ? `<tr><td class="p-2 border text-blue-600">WeekOff Pay</td><td class="p-2 border text-right text-blue-600">${data.weekOffPay.toLocaleString()}</td><td class="p-2 border"></td><td class="p-2 border"></td></tr>` : ''}
                            ${data.variableDeductions.map((d: any) => `<tr><td class="p-2 border"></td><td class="p-2 border"></td><td class="p-2 border text-red-600">${d.type}</td><td class="p-2 border text-right text-red-600">${d.amount.toLocaleString()}</td></tr>`).join('')}
                            <tr class="font-bold bg-gray-50">
                                <td class="p-2 border">Total Earnings</td><td class="p-2 border text-right">${(data.gross + data.totalAdditions).toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                                <td class="p-2 border">Total Deductions</td><td class="p-2 border text-right">${data.totalDeductions.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="flex justify-end">
                        <div class="bg-gray-900 text-white p-4 rounded-lg min-w-[200px]">
                            <div class="text-xs text-gray-400 uppercase mb-1">Net Pay</div>
                            <div class="text-xl font-bold">AED ${data.netSalary.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                        </div>
                    </div>
                </div>
            `).join('')}
            <script>
                window.onload = () => { window.print(); }
            </script>
        </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
  };

  // Calculate Payroll Totals using useMemo and unified calculator
  const payrollTotals = useMemo(() => {
    if (activeTab !== 'payroll') return { basic: 0, housing: 0, transport: 0, airTicket: 0, leaveSalary: 0, other: 0, gross: 0, deductions: 0, additions: 0, net: 0 };

    return filteredEmployees.filter(e => e.active).reduce((acc, emp) => {
        const { basic, housing, transport, airTicket, leaveSalary, other, gross, totalAdditions, totalDeductions, netSalary } = calculatePayroll(emp, attendance, deductions, currentDate.getMonth(), currentDate.getFullYear());

        return {
            basic: acc.basic + basic,
            housing: acc.housing + housing,
            transport: acc.transport + transport,
            airTicket: acc.airTicket + airTicket,
            leaveSalary: acc.leaveSalary + leaveSalary,
            other: acc.other + other,
            gross: acc.gross + gross,
            deductions: acc.deductions + totalDeductions,
            additions: acc.additions + totalAdditions,
            net: acc.net + netSalary
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
               { id: 'deductions', icon: Wallet, label: 'Deductions' },
               { id: 'leave', icon: FileText, label: 'Leave Management' },
               { id: 'payroll', icon: DollarSign, label: 'Payroll Register' },
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                      <div onClick={() => setActiveTab('ex-employees')} className="bg-white p-6 rounded-xl shadow-sm border cursor-pointer hover:shadow-md transition-shadow">
                          <h3 className="text-gray-500 text-sm font-medium">Ex-Employees</h3>
                          <div className="flex justify-between items-end">
                              <p className="text-3xl font-bold text-gray-800 mt-2">{employees.filter(e => !e.active).length}</p>
                              <div className="p-2 bg-red-50 text-red-600 rounded-lg"><UserMinus className="w-5 h-5" /></div>
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
                                      <th className="p-4">EID Exp</th>
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
                                          <td className={`p-4 text-xs font-mono ${getDateColor(emp.documents?.emiratesIdExpiry)}`}>{emp.documents?.emiratesIdExpiry || '-'}</td>
                                          <td className={`p-4 text-xs font-mono ${getDateColor(emp.documents?.passportExpiry, 'passport')}`}>{emp.documents?.passportExpiry || '-'}</td>
                                          <td className={`p-4 text-xs font-mono ${getDateColor(emp.documents?.labourCardExpiry)}`}>{emp.documents?.labourCardExpiry || '-'}</td>
                                          <td className="p-4 text-center sticky right-0 bg-white z-10 shadow-l border-l flex justify-center gap-2">
                                              <button onClick={() => setViewEmployee(emp)} className="text-indigo-600 hover:bg-indigo-50 p-1 rounded"><Eye className="w-4 h-4" /></button>
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

          {activeTab === 'deductions' && (
              <DeductionsView deductions={deductions} employees={employees} onRefresh={handleRefresh} />
          )}
          
          {activeTab === 'reports' && <ReportsView employees={employees} attendance={attendance} />}
          {activeTab === 'about' && <AboutView currentUser={currentUser} />}

       </main>

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
           <PayslipModal 
                employee={showPayslip} 
                month={currentDate.getMonth()} 
                year={currentDate.getFullYear()} 
                onClose={() => setShowPayslip(null)} 
                allAttendance={attendance}
                allDeductions={deductions}
           />
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
           <LeaveRequestModal employees={employees} onClose={() => setShowLeaveModal(false)} onSave={handleRefresh} currentUser={currentUser} />
       )}
       {showRehire && (
           <RehireModal employee={showRehire} onClose={() => setShowRehire(null)} onConfirm={(id, date, reason) => { rehireEmployee(id, date, reason); setShowRehire(null); handleRefresh(); }} />
       )}
       {editEmployee && (
           <EditEmployeeModal employee={editEmployee} companies={companies} onClose={() => setEditEmployee(null)} onSave={handleEditSave} />
       )}
       {viewEmployee && (
           <ViewEmployeeModal employee={viewEmployee} onClose={() => setViewEmployee(null)} />
       )}
    </div>
  );
};

export default App;
    