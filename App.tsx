
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, Calendar, Settings, Upload, UserPlus, LogOut, 
  Building2, CheckCircle, XCircle, User, Check, Trash2, 
  AlertCircle, Paperclip, Eye, Edit, Lock, CheckSquare, 
  Square, Camera, RefreshCcw, Copy, FileText, Download,
  Printer, DollarSign, ChevronLeft, ChevronRight, Search,
  History, BarChart3, FileDown, Menu, Wallet, UserMinus,
  Briefcase, CreditCard, FileBadge, UserCog, ArrowRight, ArrowLeft,
  ClipboardPaste, ClipboardCopy, MoreVertical
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
import { PUBLIC_HOLIDAYS, DEFAULT_COMPANIES } from './constants';

// --- Constants for Grid ---
const LEGEND: any = {
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
                            {Object.entries(LEGEND).map(([key, val]: [string, any]) => (
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

// Reusable Context Menu Component
const ContextMenu = ({ x, y, onClose, onAction, hasClipboard }: any) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    return (
        <div 
            ref={menuRef}
            className="absolute z-50 bg-white rounded-lg shadow-xl border w-48 py-1 flex flex-col animate-fade-in"
            style={{ top: y, left: x }}
        >
            <button 
                onClick={() => onAction('copy')} 
                className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm flex items-center gap-2 text-gray-700"
            >
                <ClipboardCopy className="w-4 h-4" /> Copy Status
            </button>
            <button 
                onClick={() => onAction('paste')} 
                disabled={!hasClipboard}
                className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm flex items-center gap-2 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <ClipboardPaste className="w-4 h-4" /> Paste Status
            </button>
        </div>
    );
};


const ReportsView = ({ employees, attendance, leaveRequests, deductions, companies }: any) => {
    const [reportType, setReportType] = useState('STAFF_DIRECTORY');
    const [selectedCompany, setSelectedCompany] = useState('All Companies');
    const [currentDate, setCurrentDate] = useState(new Date());

    // Filter Data
    const filteredEmployees = useMemo(() => {
        if (selectedCompany === 'All Companies') return employees;
        return employees.filter((e: any) => e.company === selectedCompany);
    }, [employees, selectedCompany]);

    const getReportData = () => {
        switch (reportType) {
            case 'STAFF_DIRECTORY':
                return filteredEmployees.filter((e:any) => e.active).map((e:any) => ({
                    'Code': e.code,
                    'Name': e.name,
                    'Designation': e.designation,
                    'Department': e.department,
                    'Team': e.team,
                    'Company': e.company,
                    'Joining Date': e.joiningDate,
                    'EID Expiry': e.documents?.emiratesIdExpiry || '-',
                    'Passport Expiry': e.documents?.passportExpiry || '-'
                }));
            case 'EX_EMPLOYEES':
                return filteredEmployees.filter((e:any) => !e.active).map((e:any) => ({
                    'Code': e.code,
                    'Name': e.name,
                    'Exit Date': e.offboardingDetails?.exitDate,
                    'Reason': e.offboardingDetails?.reason,
                    'Exit Type': e.offboardingDetails?.type,
                    'Settlement Amt': e.offboardingDetails?.netSettlement
                }));
            case 'ATTENDANCE':
                return filteredEmployees.filter((e:any) => e.active).map((e:any) => {
                    const start = formatDateLocal(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
                    const end = formatDateLocal(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
                    const recs = attendance.filter((r:any) => r.employeeId === e.id && r.date >= start && r.date <= end);
                    const present = recs.filter((r:any) => r.status === AttendanceStatus.PRESENT).length;
                    const absent = recs.filter((r:any) => r.status === AttendanceStatus.ABSENT).length;
                    const ot = recs.reduce((acc:any, r:any) => acc + (r.overtimeHours || 0), 0);
                    return {
                        'Code': e.code,
                        'Name': e.name,
                        'Company': e.company,
                        'Present Days': present,
                        'Absent Days': absent,
                        'Total OT Hours': ot
                    };
                });
            case 'LEAVES':
                 return leaveRequests.filter((r:any) => selectedCompany === 'All Companies' || employees.find((e:any) => e.id === r.employeeId)?.company === selectedCompany).map((r:any) => {
                     const emp = employees.find((e:any) => e.id === r.employeeId);
                     return {
                         'Employee': emp?.name,
                         'Type': r.type,
                         'Start Date': r.startDate,
                         'End Date': r.endDate,
                         'Status': r.status,
                         'Reason': r.reason
                     };
                 });
            case 'DEDUCTIONS':
                return deductions.filter((d:any) => selectedCompany === 'All Companies' || employees.find((e:any) => e.id === d.employeeId)?.company === selectedCompany).map((d:any) => {
                    const emp = employees.find((e:any) => e.id === d.employeeId);
                    return {
                        'Date': d.date,
                        'Employee': emp?.name,
                        'Type': d.type,
                        'Amount': d.amount,
                        'Note': d.note
                    };
                });
            case 'PAYROLL':
                return filteredEmployees.filter((e:any) => e.active).map((e:any) => {
                     const data = calculatePayroll(e, attendance, deductions, currentDate.getMonth(), currentDate.getFullYear());
                     return {
                         'Code': e.code,
                         'Name': e.name,
                         'Basic': data.basic,
                         'Allowances': (data.housing + data.transport + data.other + data.airTicket + data.leaveSalary),
                         'Gross': data.gross + data.totalAdditions,
                         'Deductions': data.totalDeductions,
                         'Net Salary': data.netSalary
                     };
                });
            default: return [];
        }
    };

    const reportData = getReportData();

    const handleDownload = () => {
        if (!reportData.length) return alert("No data to export");
        const ws = XLSX.utils.json_to_sheet(reportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Report");
        XLSX.writeFile(wb, `ShiftSync_Report_${reportType}_${formatDateLocal(new Date())}.xlsx`);
    };

    const handleMonthChange = (delta: number) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + delta);
        setCurrentDate(newDate);
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4 flex-1">
                     <div className="p-3 bg-indigo-50 rounded-lg"><FileText className="w-6 h-6 text-indigo-600" /></div>
                     <div>
                         <h2 className="text-xl font-bold">Advanced Reports</h2>
                         <p className="text-sm text-gray-500">Generate detailed analytics and exports</p>
                     </div>
                </div>
                <div className="flex gap-4 flex-wrap justify-end">
                     {(reportType === 'ATTENDANCE' || reportType === 'PAYROLL') && (
                         <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded border">
                            <button onClick={() => handleMonthChange(-1)}><ChevronLeft className="w-4 h-4 text-gray-500"/></button>
                            <span className="text-sm font-bold w-32 text-center">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                            <button onClick={() => handleMonthChange(1)}><ChevronRight className="w-4 h-4 text-gray-500"/></button>
                         </div>
                     )}
                     <select className="p-2 border rounded text-sm min-w-[200px]" value={reportType} onChange={e => setReportType(e.target.value)}>
                         <option value="STAFF_DIRECTORY">Staff Directory</option>
                         <option value="EX_EMPLOYEES">Ex-Employees</option>
                         <option value="ATTENDANCE">Timesheet / Attendance</option>
                         <option value="DEDUCTIONS">Deductions Report</option>
                         <option value="LEAVES">Leave Management</option>
                         <option value="PAYROLL">Payroll & Payslips</option>
                     </select>
                     <select className="p-2 border rounded text-sm min-w-[200px]" value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}>
                         <option>All Companies</option>
                         {companies.map((c:string) => <option key={c} value={c}>{c}</option>)}
                     </select>
                     <button onClick={handleDownload} className="bg-green-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2">
                         <Download className="w-4 h-4" /> Export Excel
                     </button>
                </div>
            </div>

            {/* Report Preview Grid */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50 font-bold text-sm uppercase text-gray-600 flex justify-between">
                    <span>Report Preview ({reportData.length} Records)</span>
                </div>
                <div className="overflow-x-auto max-h-[60vh]">
                     <table className="w-full text-sm text-left whitespace-nowrap">
                         <thead className="bg-gray-50 text-gray-600 font-bold border-b">
                             <tr>
                                 {reportData.length > 0 && Object.keys(reportData[0]).map((key) => (
                                     <th key={key} className="p-3 border-r last:border-r-0">{key}</th>
                                 ))}
                             </tr>
                         </thead>
                         <tbody className="divide-y">
                             {reportData.map((row: any, idx: number) => (
                                 <tr key={idx} className="hover:bg-gray-50">
                                     {Object.values(row).map((val: any, i) => (
                                         <td key={i} className="p-3 border-r last:border-r-0">
                                             {typeof val === 'number' ? val.toLocaleString(undefined, {maximumFractionDigits: 2}) : val}
                                         </td>
                                     ))}
                                 </tr>
                             ))}
                             {reportData.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-gray-400">No records found for selected criteria.</td></tr>}
                         </tbody>
                     </table>
                </div>
            </div>
        </div>
    );
};

// --- Missing Component Definitions ---

const DeductionsView = ({ deductions, employees, onRefresh }: any) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newDeduction, setNewDeduction] = useState({ employeeId: '', date: new Date().toISOString().split('T')[0], type: 'Other', amount: 0, note: '' });

    const handleSave = () => {
        if (!newDeduction.employeeId) return alert('Select Employee');
        saveDeduction(newDeduction as any);
        setIsModalOpen(false);
        onRefresh();
    };

    const handleDelete = (id: string) => {
        if(confirm('Delete this deduction?')) {
            deleteDeduction(id);
            onRefresh();
        }
    }

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Deductions</h2>
                <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded flex items-center gap-2"><DollarSign className="w-4 h-4" /> Add Deduction</button>
            </div>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 border-b font-bold text-gray-600">
                        <tr>
                            <th className="p-4">Date</th>
                            <th className="p-4">Employee</th>
                            <th className="p-4">Type</th>
                            <th className="p-4">Amount</th>
                            <th className="p-4">Note</th>
                            <th className="p-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {deductions.map((d: any) => (
                            <tr key={d.id} className="hover:bg-gray-50">
                                <td className="p-4">{d.date}</td>
                                <td className="p-4 font-bold">{employees.find((e:any) => e.id === d.employeeId)?.name}</td>
                                <td className="p-4">{d.type}</td>
                                <td className="p-4 font-mono text-red-600 font-bold">{d.amount}</td>
                                <td className="p-4 text-gray-500">{d.note}</td>
                                <td className="p-4 text-right"><button onClick={() => handleDelete(d.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4"/></button></td>
                            </tr>
                        ))}
                         {deductions.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No deductions found.</td></tr>}
                    </tbody>
                </table>
            </div>
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-xl w-full max-w-md">
                        <h3 className="font-bold mb-4">Add Deduction</h3>
                        <div className="space-y-3">
                            <select className="w-full p-2 border rounded" value={newDeduction.employeeId} onChange={e => setNewDeduction({...newDeduction, employeeId: e.target.value})}>
                                <option value="">Select Employee</option>
                                {employees.filter((e:any) => e.active).map((e:any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <input type="date" className="w-full p-2 border rounded" value={newDeduction.date} onChange={e => setNewDeduction({...newDeduction, date: e.target.value})} />
                            <select className="w-full p-2 border rounded" value={newDeduction.type} onChange={e => setNewDeduction({...newDeduction, type: e.target.value})}>
                                <option>Salary Advance</option><option>Loan Amount</option><option>Damage Material/Asset</option><option>Fine Amount</option><option>Penalty</option><option>Other</option>
                            </select>
                            <input type="number" placeholder="Amount" className="w-full p-2 border rounded" value={newDeduction.amount} onChange={e => setNewDeduction({...newDeduction, amount: parseFloat(e.target.value)})} />
                            <textarea placeholder="Note" className="w-full p-2 border rounded" value={newDeduction.note} onChange={e => setNewDeduction({...newDeduction, note: e.target.value})} />
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                            <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const AboutView = ({ currentUser }: any) => {
    const data = getAboutData();
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white p-8 rounded-xl shadow-lg border-t-4 border-indigo-600">
                <h2 className="text-3xl font-bold text-gray-800 mb-6">About the System</h2>
                <div className="flex gap-6">
                    <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center text-4xl font-bold text-gray-400">
                        {data.profileImage ? <img src={data.profileImage} alt="Profile" className="w-full h-full object-cover rounded-lg" /> : 'MK'}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">{data.name}</h3>
                        <p className="text-indigo-600 font-medium">{data.title}</p>
                        <p className="text-gray-600 mt-2">{data.bio}</p>
                        <div className="mt-4 flex gap-4 text-sm text-gray-500">
                            <div>Email: {data.email}</div>
                            <div>{data.contactInfo}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Simplified Placeholder components for other Modals to ensure compilation
const OnboardingWizard = ({ onClose, onComplete }: any) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const handleSave = () => {
        saveEmployee({ id: Math.random().toString(), name, code, active: true, status: 'Active', type: StaffType.WORKER } as any);
        onComplete();
    };
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl w-full max-w-md">
                <h3 className="font-bold mb-4">Onboard Employee</h3>
                <input className="w-full border p-2 mb-2" placeholder="Code" value={code} onChange={e => setCode(e.target.value)} />
                <input className="w-full border p-2 mb-2" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
                <button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded">Save</button>
                <button onClick={onClose} className="ml-2 px-4 py-2">Cancel</button>
            </div>
        </div>
    );
};

const OffboardingWizard = ({ employee, onClose, onComplete }: any) => {
     const handleOffboard = () => {
         offboardEmployee(employee.id, { exitDate: new Date().toISOString().split('T')[0], reason: 'Resignation', type: 'Resignation' } as any);
         onComplete();
     };
     return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl w-full max-w-md">
                <h3 className="font-bold mb-4">Offboard {employee.name}</h3>
                <p className="mb-4">Are you sure you want to offboard this employee?</p>
                <button onClick={handleOffboard} className="bg-red-600 text-white px-4 py-2 rounded">Confirm</button>
                <button onClick={onClose} className="ml-2 px-4 py-2">Cancel</button>
            </div>
        </div>
    );
};

const BulkImportModal = ({ isOpen, onClose, onImport }: any) => {
    const [text, setText] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-xl w-full max-w-lg">
                <h3 className="font-bold mb-4">Import Attendance CSV</h3>
                <textarea className="w-full border p-2 h-32 mb-4" value={text} onChange={e => setText(e.target.value)} placeholder="Code,Date,Status,Overtime" />
                <button onClick={() => onImport(text)} className="bg-green-600 text-white px-4 py-2 rounded">Import</button>
                <button onClick={onClose} className="ml-2 px-4 py-2">Cancel</button>
             </div>
        </div>
    );
};

const EmployeeImportModal = ({ isOpen, onClose, onImport }: any) => {
    const [text, setText] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-xl w-full max-w-lg">
                <h3 className="font-bold mb-4">Import Employees CSV</h3>
                <textarea className="w-full border p-2 h-32 mb-4" value={text} onChange={e => setText(e.target.value)} placeholder="CSV Data..." />
                <button onClick={() => onImport(text)} className="bg-green-600 text-white px-4 py-2 rounded">Import</button>
                <button onClick={onClose} className="ml-2 px-4 py-2">Cancel</button>
             </div>
        </div>
    );
};

const PayslipModal = ({ onClose }: any) => {
    return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><div className="bg-white p-4 rounded">Payslip View <button onClick={onClose}>Close</button></div></div>;
};

const HolidayManagementModal = ({ isOpen, onClose }: any) => {
    if (!isOpen) return null;
    const holidays = getPublicHolidays();
    const [date, setDate] = useState('');
    const [name, setName] = useState('');
    const add = () => { savePublicHoliday({ id: Math.random().toString(), date, name }); setDate(''); setName(''); };
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-xl w-full max-w-md">
                <h3 className="font-bold mb-4">Holidays</h3>
                <div className="mb-4 space-y-2">
                    {holidays.map(h => <div key={h.id} className="flex justify-between border-b pb-1"><span>{h.date} - {h.name}</span> <button onClick={() => deletePublicHoliday(h.id)} className="text-red-500">X</button></div>)}
                </div>
                <input type="date" className="border p-2 w-full mb-2" value={date} onChange={e => setDate(e.target.value)} />
                <input className="border p-2 w-full mb-2" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
                <button onClick={add} className="bg-indigo-600 text-white px-4 py-2 rounded">Add</button>
                <button onClick={onClose} className="ml-2 px-4 py-2">Close</button>
             </div>
        </div>
    );
};

const UserManagementModal = ({ isOpen, onClose }: any) => {
    if (!isOpen) return null;
    return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><div className="bg-white p-4 rounded">User Management <button onClick={onClose}>Close</button></div></div>;
};

const ProfileModal = ({ isOpen, onClose }: any) => {
    if (!isOpen) return null;
    return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><div className="bg-white p-4 rounded">Profile <button onClick={onClose}>Close</button></div></div>;
};

const ManageCompaniesModal = ({ isOpen, onClose, companies, onDataChange }: any) => {
    if (!isOpen) return null;
    const [name, setName] = useState('');
    const add = () => { onDataChange(addCompany(name)); setName(''); };
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-xl w-full max-w-md">
                <h3 className="font-bold mb-4">Companies</h3>
                <div className="mb-4">{companies.map((c: string) => <div key={c} className="border-b py-1">{c}</div>)}</div>
                <input className="border p-2 w-full mb-2" placeholder="Company Name" value={name} onChange={e => setName(e.target.value)} />
                <button onClick={add} className="bg-indigo-600 text-white px-4 py-2 rounded">Add</button>
                <button onClick={onClose} className="ml-2 px-4 py-2">Close</button>
             </div>
        </div>
    );
};

const ExEmployeeDetailsModal = ({ onClose }: any) => {
    return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><div className="bg-white p-4 rounded">Details <button onClick={onClose}>Close</button></div></div>;
};

const CopyAttendanceModal = ({ isOpen, onClose, onCopy }: any) => {
    const [src, setSrc] = useState('');
    const [tgt, setTgt] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-xl w-full max-w-md">
                <h3 className="font-bold mb-4">Copy Attendance</h3>
                <input type="date" className="border p-2 w-full mb-2" value={src} onChange={e => setSrc(e.target.value)} />
                <input type="date" className="border p-2 w-full mb-2" value={tgt} onChange={e => setTgt(e.target.value)} />
                <button onClick={() => onCopy(src, tgt)} className="bg-orange-600 text-white px-4 py-2 rounded">Copy</button>
                <button onClick={onClose} className="ml-2 px-4 py-2">Close</button>
             </div>
        </div>
    );
};

const LeaveRequestModal = ({ onClose, onSave, currentUser, employees }: any) => {
    const [empId, setEmpId] = useState('');
    const [type, setType] = useState(AttendanceStatus.ANNUAL_LEAVE);
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [reason, setReason] = useState('');
    const handleSave = () => {
        saveLeaveRequest({ employeeId: empId, type, startDate: start, endDate: end, reason } as any, currentUser.username);
        onSave();
        onClose();
    };
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-xl w-full max-w-md">
                <h3 className="font-bold mb-4">New Leave Request</h3>
                <select className="border p-2 w-full mb-2" value={empId} onChange={e => setEmpId(e.target.value)}>
                    <option value="">Select Employee</option>
                    {employees.map((e:any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <select className="border p-2 w-full mb-2" value={type} onChange={e => setType(e.target.value as any)}>
                    <option value={AttendanceStatus.ANNUAL_LEAVE}>Annual Leave</option>
                    <option value={AttendanceStatus.SICK_LEAVE}>Sick Leave</option>
                    <option value={AttendanceStatus.UNPAID_LEAVE}>Unpaid Leave</option>
                </select>
                <input type="date" className="border p-2 w-full mb-2" value={start} onChange={e => setStart(e.target.value)} />
                <input type="date" className="border p-2 w-full mb-2" value={end} onChange={e => setEnd(e.target.value)} />
                <input className="border p-2 w-full mb-2" placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} />
                <button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded">Submit</button>
                <button onClick={onClose} className="ml-2 px-4 py-2">Cancel</button>
             </div>
        </div>
    );
};

const RehireModal = ({ employee, onClose, onConfirm }: any) => {
    const [date, setDate] = useState('');
    const [reason, setReason] = useState('');
    return (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-xl w-full max-w-md">
                <h3 className="font-bold mb-4">Rehire {employee.name}</h3>
                <input type="date" className="border p-2 w-full mb-2" value={date} onChange={e => setDate(e.target.value)} />
                <input className="border p-2 w-full mb-2" placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} />
                <button onClick={() => onConfirm(employee.id, date, reason)} className="bg-green-600 text-white px-4 py-2 rounded">Rehire</button>
                <button onClick={onClose} className="ml-2 px-4 py-2">Cancel</button>
             </div>
        </div>
    );
};

const EditEmployeeModal = ({ employee, onClose, onSave }: any) => {
    const [name, setName] = useState(employee.name);
    return (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-xl w-full max-w-md">
                <h3 className="font-bold mb-4">Edit {employee.name}</h3>
                <input className="border p-2 w-full mb-2" value={name} onChange={e => setName(e.target.value)} />
                <button onClick={() => onSave({ ...employee, name })} className="bg-blue-600 text-white px-4 py-2 rounded">Save</button>
                <button onClick={onClose} className="ml-2 px-4 py-2">Cancel</button>
             </div>
        </div>
    );
};

const ViewEmployeeModal = ({ employee, onClose }: any) => {
    return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><div className="bg-white p-4 rounded">View {employee.name} <button onClick={onClose}>Close</button></div></div>;
};

// ... [Rest of the App Component logic] ...

const App: React.FC = () => {
  // ... [Keep existing state] ...
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [deductions, setDeductions] = useState<DeductionRecord[]>([]);
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
  const [showProfile, setShowProfile] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showRehire, setShowRehire] = useState<Employee | null>(null);
  const [showExEmployeeDetails, setShowExEmployeeDetails] = useState<Employee | null>(null);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null);
  const [selectedCompany, setSelectedCompany] = useState('All Companies');
  const [selectedStatus, setSelectedStatus] = useState('Active');
  const [selectedTeam, setSelectedTeam] = useState('All Teams');
  const [directorySearch, setDirectorySearch] = useState('');
  const [exEmployeeSearch, setExEmployeeSearch] = useState('');
  const [timesheetSearch, setTimesheetSearch] = useState('');
  const [payrollSearch, setPayrollSearch] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  // --- New State for Copy/Paste & Context Menu ---
  const [clipboard, setClipboard] = useState<{status: AttendanceStatus, overtimeHours: number, note: string} | null>(null);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, empId: string, dateStr: string} | null>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefresh = () => {
    const allEmps = getEmployees();
    setEmployees(allEmps);
    setCompanies(getCompanies());
    setLeaveRequests(getLeaveRequests());
    setDeductions(getDeductions());
    // Get larger range to ensure we cover enough
    const start = '2020-01-01';
    const end = '2030-12-31';
    setAttendance(getAttendanceRange(start, end));
  };

  useEffect(() => {
    if (currentUser) handleRefresh();
  }, [currentUser]);

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

  const filteredEmployees = useMemo(() => {
      return employees.filter(e => {
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
  }, [employees, activeTab, selectedCompany, selectedTeam, selectedStatus, directorySearch, exEmployeeSearch, timesheetSearch, payrollSearch]);

  const handleLogin = (user: SystemUser) => setCurrentUser(user);
  const handleLogout = () => { setCurrentUser(null); setActiveTab('dashboard'); };
  const handleMonthChange = (delta: number) => {
      const newDate = new Date(currentDate);
      newDate.setMonth(newDate.getMonth() + delta);
      setCurrentDate(newDate);
  };

  // --- Timesheet Interactions ---
  const handleAttendanceClick = (emp: Employee, day: Date) => setShowAttendanceModal({ isOpen: true, employee: emp, date: day });
  
  const handleAttendanceSave = (status: any, ot: any, attachment: any, note: any) => {
      if (showAttendanceModal.employee && showAttendanceModal.date) {
          const dateStr = formatDateLocal(showAttendanceModal.date);
          logAttendance(showAttendanceModal.employee.id, status, dateStr, ot, attachment, currentUser?.username, note);
          setShowAttendanceModal({ isOpen: false });
          handleRefresh();
      }
  };

  const handleContextMenu = (e: React.MouseEvent, empId: string, dateStr: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, empId, dateStr });
  };

  const handleTouchStart = (empId: string, dateStr: string, e: React.TouchEvent) => {
      const touch = e.touches[0];
      touchTimer.current = setTimeout(() => {
          setContextMenu({ x: touch.clientX, y: touch.clientY, empId, dateStr });
      }, 600); // Long press threshold
  };

  const handleTouchEnd = () => {
      if (touchTimer.current) clearTimeout(touchTimer.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent, empId: string, dateStr: string) => {
      if (e.ctrlKey || e.metaKey) {
          if (e.key === 'c') {
              e.preventDefault();
              copyToClipboard(empId, dateStr);
          }
          if (e.key === 'p') { // User specifically requested Ctrl+P for Paste
              e.preventDefault();
              pasteFromClipboard(empId, dateStr);
          }
      }
  };

  const copyToClipboard = (empId: string, dateStr: string) => {
      const record = attendance.find(r => r.employeeId === empId && r.date === dateStr);
      const data = {
          status: record?.status || AttendanceStatus.PRESENT,
          overtimeHours: record?.overtimeHours || 0,
          note: record?.note || ''
      };
      setClipboard(data);
      // Optional: Show toast (removed for cleanliness as per prompt style)
      setContextMenu(null);
  };

  const pasteFromClipboard = (empId: string, dateStr: string) => {
      if (!clipboard) return;
      logAttendance(empId, clipboard.status, dateStr, clipboard.overtimeHours, undefined, currentUser?.username, clipboard.note);
      handleRefresh();
      setContextMenu(null);
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

  // Calculate Payroll Totals using useMemo
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
       {/* ... [Header and Tabs remain same] ... */}
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
                <button onClick={() => setShowProfile(true)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-600">
                    <UserCog className="w-4 h-4" />
                </button>
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

       <main className="p-4 md:p-6 w-full relative">
          {/* ... [Keep dashboard, directory, ex-employees] ... */}
          {activeTab === 'dashboard' && (
              <div className="space-y-6">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-gray-800">Overview</h2>
                      {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CREATOR) && (
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
                  {/* Company list ... */}
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
                              <button onClick={() => setShowCopyModal(true)} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50 text-orange-600 border-orange-200 bg-orange-50 flex items-center justify-center gap-2 flex-1 md:flex-none"><Copy className="w-4 h-4"/> Copy Day</button>
                          </div>
                      </div>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-end mb-2">
                      {Object.entries(LEGEND).map(([key, val]: [string, any]) => (
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
                                                    tabIndex={0}
                                                    className={`border text-center cursor-pointer transition-all hover:opacity-80 p-0 h-10 relative outline-none focus:ring-2 focus:ring-indigo-500 ${legend ? legend.color : 'hover:bg-gray-100'}`}
                                                    onClick={() => handleAttendanceClick(emp, day)}
                                                    onContextMenu={(e) => handleContextMenu(e, emp.id, dateStr)}
                                                    onKeyDown={(e) => handleKeyDown(e, emp.id, dateStr)}
                                                    onTouchStart={(e) => handleTouchStart(emp.id, dateStr, e)}
                                                    onTouchEnd={handleTouchEnd}
                                                    title={record ? `Updated by: ${record.updatedBy}\nNote: ${record.note || '-'}` : 'Click to mark\nCtrl+C to Copy\nCtrl+P to Paste'}
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
                      <h2 className="text-xl font-bold">Leave Management</h2>
                      <button onClick={() => setShowLeaveModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded flex items-center gap-2">
                          <UserPlus className="w-4 h-4" /> New Request
                      </button>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 font-bold text-gray-600 border-b">
                              <tr>
                                  <th className="p-4">Employee</th>
                                  <th className="p-4">Type</th>
                                  <th className="p-4">Dates</th>
                                  <th className="p-4">Reason</th>
                                  <th className="p-4">Status</th>
                                  <th className="p-4">Requested By</th>
                                  <th className="p-4">Approved By</th>
                                  <th className="p-4 text-right">Actions</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y">
                              {leaveRequests.map(req => {
                                  const emp = employees.find(e => e.id === req.employeeId);
                                  return (
                                      <tr key={req.id} className="hover:bg-gray-50">
                                          <td className="p-4 font-medium">{emp?.name || 'Unknown'}</td>
                                          <td className="p-4">
                                              <span className={`px-2 py-1 rounded text-xs font-bold ${LEGEND[req.type]?.color}`}>{LEGEND[req.type]?.label}</span>
                                          </td>
                                          <td className="p-4">{req.startDate} to {req.endDate}</td>
                                          <td className="p-4 text-gray-500 max-w-[200px] truncate">{req.reason}</td>
                                          <td className="p-4">
                                              <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                  req.status === LeaveStatus.APPROVED ? 'bg-green-100 text-green-700' : 
                                                  req.status === LeaveStatus.REJECTED ? 'bg-red-100 text-red-700' : 
                                                  'bg-yellow-100 text-yellow-700'
                                              }`}>{req.status}</span>
                                          </td>
                                          <td className="p-4 text-xs text-gray-500">{req.createdBy || '-'}</td>
                                          <td className="p-4 text-xs text-gray-500">{req.approvedBy || '-'}</td>
                                          <td className="p-4 text-right flex justify-end gap-2">
                                              {req.status === LeaveStatus.PENDING && (
                                                  <>
                                                      <button onClick={() => handleLeaveAction(req.id, LeaveStatus.APPROVED)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4"/></button>
                                                      <button onClick={() => handleLeaveAction(req.id, LeaveStatus.REJECTED)} className="p-1 text-red-600 hover:bg-red-50 rounded"><XCircle className="w-4 h-4"/></button>
                                                  </>
                                              )}
                                          </td>
                                      </tr>
                                  );
                              })}
                              {leaveRequests.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-gray-500">No leave requests found.</td></tr>}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {activeTab === 'payroll' && (
              <div className="space-y-4">
                  <div className="flex justify-between items-center bg-white p-3 rounded-xl border shadow-sm">
                       <div className="flex items-center gap-4">
                          <button onClick={() => handleMonthChange(-1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft /></button>
                          <h2 className="text-lg font-bold w-48 text-center">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                          <button onClick={() => handleMonthChange(1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight /></button>
                       </div>
                       <div className="flex gap-4">
                          <div className="relative">
                               <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                               <input 
                                  type="text" 
                                  placeholder="Search..." 
                                  value={payrollSearch} 
                                  onChange={e => setPayrollSearch(e.target.value)} 
                                  className="pl-9 pr-4 py-2 border rounded-lg text-sm w-64" 
                               />
                          </div>
                          <button onClick={handlePrintAllPayslips} className="bg-indigo-600 text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-bold">
                              <Download className="w-4 h-4" /> Download All Payslips
                          </button>
                       </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                          <thead className="bg-gray-50 font-bold text-gray-600 border-b text-xs uppercase">
                              <tr>
                                  <th className="p-3">#</th>
                                  <th className="p-3">Employee</th>
                                  <th className="p-3 text-right">Basic</th>
                                  <th className="p-3 text-right">Housing</th>
                                  <th className="p-3 text-right">Transport</th>
                                  <th className="p-3 text-right">Air Ticket</th>
                                  <th className="p-3 text-right">Leave Salary</th>
                                  <th className="p-3 text-right">Others</th>
                                  <th className="p-3 text-right text-blue-600">OT</th>
                                  <th className="p-3 text-right text-red-600">Deductions</th>
                                  <th className="p-3 text-right font-bold text-green-700">Net Salary</th>
                                  <th className="p-3 text-center">Action</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y">
                              {filteredEmployees.map((emp, idx) => {
                                   const data = calculatePayroll(emp, attendance, deductions, currentDate.getMonth(), currentDate.getFullYear());
                                   return (
                                      <tr key={emp.id} className="hover:bg-gray-50">
                                          <td className="p-3 text-gray-500">{idx + 1}</td>
                                          <td className="p-3 font-bold">
                                              <div>{emp.name}</div>
                                              <div className="text-xs text-gray-400 font-normal">{emp.designation}</div>
                                          </td>
                                          <td className="p-3 text-right">{data.basic.toLocaleString()}</td>
                                          <td className="p-3 text-right">{data.housing.toLocaleString()}</td>
                                          <td className="p-3 text-right">{data.transport.toLocaleString()}</td>
                                          <td className="p-3 text-right">{data.airTicket.toLocaleString()}</td>
                                          <td className="p-3 text-right">{data.leaveSalary.toLocaleString()}</td>
                                          <td className="p-3 text-right">{data.other.toLocaleString()}</td>
                                          <td className="p-3 text-right text-blue-600 font-medium">{data.totalAdditions.toLocaleString()}</td>
                                          <td className="p-3 text-right text-red-600 font-medium">{data.totalDeductions.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                                          <td className="p-3 text-right font-bold text-green-700">{data.netSalary.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                                          <td className="p-3 text-center">
                                              <button onClick={() => setShowPayslip(emp)} className="text-indigo-600 hover:underline text-xs font-bold border border-indigo-200 px-2 py-1 rounded bg-indigo-50">View Slip</button>
                                          </td>
                                      </tr>
                                   );
                              })}
                              {/* Totals Row */}
                              <tr className="bg-gray-100 font-bold border-t-2 border-gray-300 text-xs">
                                  <td className="p-3 text-right" colSpan={2}>TOTALS:</td>
                                  <td className="p-3 text-right">{payrollTotals.basic.toLocaleString()}</td>
                                  <td className="p-3 text-right">{payrollTotals.housing.toLocaleString()}</td>
                                  <td className="p-3 text-right">{payrollTotals.transport.toLocaleString()}</td>
                                  <td className="p-3 text-right">{payrollTotals.airTicket.toLocaleString()}</td>
                                  <td className="p-3 text-right">{payrollTotals.leaveSalary.toLocaleString()}</td>
                                  <td className="p-3 text-right">{payrollTotals.other.toLocaleString()}</td>
                                  <td className="p-3 text-right text-blue-800">{payrollTotals.additions.toLocaleString()}</td>
                                  <td className="p-3 text-right text-red-800">{payrollTotals.deductions.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                                  <td className="p-3 text-right text-green-800 text-lg">{payrollTotals.net.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                                  <td></td>
                              </tr>
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

          {activeTab === 'deductions' && (
              <DeductionsView deductions={deductions} employees={employees} onRefresh={handleRefresh} />
          )}
          
          {activeTab === 'reports' && <ReportsView employees={employees} attendance={attendance} leaveRequests={leaveRequests} deductions={deductions} companies={companies} />}
          {activeTab === 'about' && <AboutView currentUser={currentUser} />}

       </main>

       {contextMenu && (
           <ContextMenu 
               x={contextMenu.x} 
               y={contextMenu.y} 
               onClose={() => setContextMenu(null)} 
               hasClipboard={!!clipboard}
               onAction={(action: 'copy' | 'paste') => {
                   if (action === 'copy') copyToClipboard(contextMenu.empId, contextMenu.dateStr);
                   if (action === 'paste') pasteFromClipboard(contextMenu.empId, contextMenu.dateStr);
               }}
           />
       )}

       {/* Modals ... */}
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
           <UserManagementModal isOpen={true} onClose={() => setShowUserManagement(false)} currentUser={currentUser} />
       )}
       {showProfile && (
           <ProfileModal isOpen={true} onClose={() => setShowProfile(false)} currentUser={currentUser} onUpdate={(user: SystemUser) => { setCurrentUser(user); handleRefresh(); }} />
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
