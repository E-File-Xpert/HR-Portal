
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, Calendar, Settings, Upload, UserPlus, LogOut, 
  Building2, CheckCircle, XCircle, User, Check, Trash2, 
  AlertCircle, Paperclip, Eye, Edit, Lock, CheckSquare, 
  Square, Camera, RefreshCcw, Copy, FileText, Download,
  Printer, DollarSign, ChevronLeft, ChevronRight, Search,
  History, BarChart3, FileDown, Menu, Wallet, UserMinus,
  Briefcase, CreditCard, FileBadge, UserCog, ArrowRight, ArrowLeft
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

const OffboardingWizard = ({ employee, onClose, onComplete }: any) => {
    const [details, setDetails] = useState<OffboardingDetails>({
        type: 'Resignation', exitDate: new Date().toISOString().split('T')[0], reason: '',
        gratuity: 0, leaveEncashment: 0, salaryDues: 0, otherDues: 0, deductions: 0, netSettlement: 0, assetsReturned: false, notes: ''
    });

    useEffect(() => {
        const net = (details.gratuity + details.leaveEncashment + details.salaryDues + details.otherDues) - details.deductions;
        setDetails(prev => ({ ...prev, netSettlement: net }));
    }, [details.gratuity, details.leaveEncashment, details.salaryDues, details.otherDues, details.deductions]);

    const handleSubmit = () => {
        offboardEmployee(employee.id, details);
        onComplete();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-3xl flex flex-col rounded-2xl shadow-2xl h-[85vh] max-h-[85vh] overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="font-bold text-xl text-gray-900">Offboard Employee</h3>
                        <p className="text-sm text-gray-500 mt-1">{employee.name} — <span className="font-mono">{employee.code}</span></p>
                    </div>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-700" /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {/* Section 1: Exit Information */}
                    <section>
                        <h4 className="flex items-center gap-2 text-sm font-bold text-gray-500 uppercase mb-4 border-b pb-2">
                            <LogOut className="w-4 h-4" /> Exit Details
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-700">Exit Type</label>
                                <select className="w-full p-2.5 border rounded-lg text-sm bg-white" value={details.type} onChange={e => setDetails({...details, type: e.target.value as any})}>
                                    <option>Resignation</option><option>Termination</option><option>End of Contract</option><option>Absconding</option>
                                </select>
                             </div>
                             <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-700">Last Working Day</label>
                                <input type="date" className="w-full p-2.5 border rounded-lg text-sm" value={details.exitDate} onChange={e => setDetails({...details, exitDate: e.target.value})} />
                             </div>
                             <div className="md:col-span-2 space-y-1">
                                <label className="text-sm font-medium text-gray-700">Reason for Leaving</label>
                                <textarea className="w-full p-2.5 border rounded-lg text-sm h-24 resize-none" placeholder="Enter detailed reason..." value={details.reason} onChange={e => setDetails({...details, reason: e.target.value})} />
                             </div>
                        </div>
                    </section>

                    {/* Section 2: Settlement */}
                    <section>
                        <h4 className="flex items-center gap-2 text-sm font-bold text-gray-500 uppercase mb-4 border-b pb-2">
                            <DollarSign className="w-4 h-4" /> Final Settlement
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase">Gratuity</label>
                                <input type="number" className="w-full p-2 border rounded-lg text-sm font-medium" value={details.gratuity} onChange={e => setDetails({...details, gratuity: Number(e.target.value)})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase">Salary Dues</label>
                                <input type="number" className="w-full p-2 border rounded-lg text-sm font-medium" value={details.salaryDues} onChange={e => setDetails({...details, salaryDues: Number(e.target.value)})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase">Leave Encash</label>
                                <input type="number" className="w-full p-2 border rounded-lg text-sm font-medium" value={details.leaveEncashment} onChange={e => setDetails({...details, leaveEncashment: Number(e.target.value)})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase">Other</label>
                                <input type="number" className="w-full p-2 border rounded-lg text-sm font-medium" value={details.otherDues} onChange={e => setDetails({...details, otherDues: Number(e.target.value)})} />
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                                 <label className="block text-xs font-bold text-red-600 uppercase mb-1">Total Deductions</label>
                                 <input type="number" className="w-full p-2 border border-red-200 rounded bg-white text-red-700 font-bold" value={details.deductions} onChange={e => setDetails({...details, deductions: Number(e.target.value)})} placeholder="0.00" />
                             </div>
                             <div className="p-4 bg-green-50 rounded-lg border border-green-100 flex flex-col justify-center items-center">
                                 <label className="block text-xs font-bold text-green-700 uppercase mb-1">Net Settlement Amount</label>
                                 <div className="text-2xl font-bold text-green-700">AED {details.netSettlement.toLocaleString()}</div>
                             </div>
                        </div>
                    </section>

                    {/* Section 3: Checklist */}
                    <section>
                         <label className="flex items-start gap-3 p-4 bg-gray-50 border rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                            <input type="checkbox" className="w-5 h-5 accent-indigo-600 mt-0.5" checked={details.assetsReturned} onChange={e => setDetails({...details, assetsReturned: e.target.checked})} />
                            <div>
                                <span className="text-sm font-bold text-gray-800">Assets Returned</span>
                                <p className="text-xs text-gray-500">Confirm that laptop, ID card, uniform, and keys have been returned.</p>
                            </div>
                        </label>
                    </section>
                </div>

                <div className="p-6 border-t flex justify-end gap-3 bg-gray-50">
                    <button onClick={onClose} className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold flex items-center gap-2 shadow-lg shadow-red-200">
                        <LogOut className="w-4 h-4"/> Confirm Offboarding
                    </button>
                </div>
            </div>
        </div>
    );
};

const ViewEmployeeModal = ({ employee, onClose }: any) => {
    if (!employee) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white w-full max-w-4xl p-0 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                <div className="p-6 bg-gradient-to-r from-indigo-700 to-indigo-900 text-white flex justify-between items-start rounded-t-xl shrink-0">
                    <div>
                        <h3 className="font-bold text-2xl mb-1">{employee.name}</h3>
                        <div className="flex gap-3 text-sm opacity-80">
                            <span>{employee.designation}</span>
                            <span>•</span>
                            <span>{employee.code}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white"><XCircle className="w-8 h-8" /></button>
                </div>

                <div className="p-6 space-y-8 bg-gray-50 flex-1 overflow-y-auto">
                    {/* Employment Section */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border">
                        <h4 className="flex items-center gap-2 font-bold text-gray-800 text-lg mb-4 pb-2 border-b">
                            <Briefcase className="w-5 h-5 text-indigo-600" /> Employment Details
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                            <div>
                                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Company</p>
                                <p className="font-medium text-gray-800">{employee.company}</p>
                            </div>
                             <div>
                                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Department</p>
                                <p className="font-medium text-gray-800">{employee.department}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Team</p>
                                <p className="font-medium text-gray-800">{employee.team}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Joining Date</p>
                                <p className="font-medium text-gray-800">{employee.joiningDate}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Status</p>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${employee.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{employee.status}</span>
                            </div>
                             <div>
                                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Work Location</p>
                                <p className="font-medium text-gray-800">{employee.workLocation || '-'}</p>
                            </div>
                             <div>
                                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Staff Type</p>
                                <p className="font-medium text-gray-800">{employee.type}</p>
                            </div>
                             <div>
                                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Leave Balance</p>
                                <p className="font-bold text-indigo-600">{employee.leaveBalance} Days</p>
                            </div>
                        </div>
                    </div>

                    {/* Financial Section */}
                     <div className="bg-white p-6 rounded-xl shadow-sm border">
                        <h4 className="flex items-center gap-2 font-bold text-gray-800 text-lg mb-4 pb-2 border-b">
                            <CreditCard className="w-5 h-5 text-green-600" /> Financial & Banking
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <p className="text-xs text-gray-400 uppercase font-bold mb-3">Salary Breakdown (AED)</p>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between border-b border-dashed pb-1">
                                        <span className="text-gray-600">Basic</span>
                                        <span className="font-bold">{employee.salary?.basic.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-dashed pb-1">
                                        <span className="text-gray-600">Housing</span>
                                        <span className="font-bold">{employee.salary?.housing.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-dashed pb-1">
                                        <span className="text-gray-600">Transport</span>
                                        <span className="font-bold">{employee.salary?.transport.toLocaleString()}</span>
                                    </div>
                                     <div className="flex justify-between border-b border-dashed pb-1">
                                        <span className="text-gray-600">Air Ticket</span>
                                        <span className="font-bold">{employee.salary?.airTicket.toLocaleString()}</span>
                                    </div>
                                     <div className="flex justify-between border-b border-dashed pb-1">
                                        <span className="text-gray-600">Leave Salary</span>
                                        <span className="font-bold">{employee.salary?.leaveSalary.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-dashed pb-1">
                                        <span className="text-gray-600">Other</span>
                                        <span className="font-bold">{employee.salary?.other.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between pt-1 text-base">
                                        <span className="font-bold text-gray-800">Total Gross</span>
                                        <span className="font-bold text-green-700">
                                            {(
                                                (employee.salary?.basic||0) + 
                                                (employee.salary?.housing||0) + 
                                                (employee.salary?.transport||0) + 
                                                (employee.salary?.airTicket||0) + 
                                                (employee.salary?.leaveSalary||0) + 
                                                (employee.salary?.other||0)
                                            ).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 uppercase font-bold mb-3">Bank Details</p>
                                <div className="bg-gray-50 p-4 rounded-lg border text-sm space-y-3">
                                    <div>
                                        <span className="block text-xs text-gray-500">Bank Name</span>
                                        <span className="font-medium text-gray-900">{employee.bankName || 'Cash'}</span>
                                    </div>
                                    {employee.iban && (
                                        <div>
                                            <span className="block text-xs text-gray-500">IBAN / Account Number</span>
                                            <span className="font-mono text-gray-900 font-medium">{employee.iban}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Documents Section */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border">
                        <h4 className="flex items-center gap-2 font-bold text-gray-800 text-lg mb-4 pb-2 border-b">
                            <FileBadge className="w-5 h-5 text-orange-600" /> Documents & IDs
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-3 border rounded-lg bg-gray-50">
                                <p className="text-xs text-gray-500 uppercase font-bold mb-1">Emirates ID</p>
                                <p className="text-sm font-mono font-medium mb-1">{employee.documents?.emiratesId || 'N/A'}</p>
                                <p className={`text-xs ${getDateColor(employee.documents?.emiratesIdExpiry)}`}>Exp: {employee.documents?.emiratesIdExpiry || '-'}</p>
                            </div>
                             <div className="p-3 border rounded-lg bg-gray-50">
                                <p className="text-xs text-gray-500 uppercase font-bold mb-1">Passport</p>
                                <p className="text-sm font-mono font-medium mb-1">{employee.documents?.passportNumber || 'N/A'}</p>
                                <p className={`text-xs ${getDateColor(employee.documents?.passportExpiry, 'passport')}`}>Exp: {employee.documents?.passportExpiry || '-'}</p>
                            </div>
                             <div className="p-3 border rounded-lg bg-gray-50">
                                <p className="text-xs text-gray-500 uppercase font-bold mb-1">Labour Card</p>
                                <p className="text-sm font-mono font-medium mb-1">{employee.documents?.labourCardNumber || 'N/A'}</p>
                                <p className={`text-xs ${getDateColor(employee.documents?.labourCardExpiry)}`}>Exp: {employee.documents?.labourCardExpiry || '-'}</p>
                            </div>
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

    // Grouping for cleaner UI
    const personalFields = [
        { key: 'name', label: 'Full Name' },
        { key: 'code', label: 'Employee Code' },
        { key: 'designation', label: 'Designation' },
        { key: 'department', label: 'Department' },
        { key: 'joiningDate', label: 'Joining Date', type: 'date' },
        { key: 'workLocation', label: 'Work Location' }
    ];

    return (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl p-0 rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl shrink-0">
                    <h3 className="font-bold text-xl text-gray-800">Edit Employee Details</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500 hover:text-gray-700" /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">
                    {/* Section 1: Personal & Work */}
                    <div className="bg-white p-6 rounded-lg shadow-sm border">
                        <h4 className="font-bold text-gray-800 mb-4 pb-2 border-b">Personal & Work Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {personalFields.map(f => (
                                <div key={f.key}>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{f.label}</label>
                                    <input 
                                        type={f.type || 'text'} 
                                        className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                                        value={(data as any)[f.key] || ''} 
                                        onChange={e => setData({...data, [f.key]: e.target.value})} 
                                    />
                                </div>
                            ))}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Company</label>
                                <select className="w-full p-2 border rounded text-sm" value={data.company} onChange={e => setData({...data, company: e.target.value})}>
                                    {companies.map((c: string) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                                <select className="w-full p-2 border rounded text-sm" value={data.status} onChange={e => setData({...data, status: e.target.value as any, active: e.target.value === 'Active'})}>
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Team</label>
                                <select className="w-full p-2 border rounded text-sm" value={data.team} onChange={e => setData({...data, team: e.target.value as any})}>
                                    <option value="Internal Team">Internal Team</option>
                                    <option value="External Team">External Team</option>
                                    <option value="Office Staff">Office Staff</option>
                                </select>
                            </div>
                             <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Staff Type</label>
                                <select className="w-full p-2 border rounded text-sm" value={data.type} onChange={e => setData({...data, type: e.target.value as any})}>
                                    <option value={StaffType.WORKER}>Worker</option>
                                    <option value={StaffType.OFFICE}>Office Staff</option>
                                </select>
                            </div>
                             <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Leave Balance</label>
                                <input type="number" className="w-full p-2 border rounded text-sm" value={data.leaveBalance} onChange={e => setData({...data, leaveBalance: Number(e.target.value)})} />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Salary & Bank */}
                     <div className="bg-white p-6 rounded-lg shadow-sm border">
                        <h4 className="font-bold text-gray-800 mb-4 pb-2 border-b">Salary Structure & Banking</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                            {['basic', 'housing', 'transport', 'airTicket', 'leaveSalary', 'other'].map(key => (
                                <div key={key}>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{key.replace(/([A-Z])/g, ' $1')}</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-2 border rounded text-sm" 
                                        value={(data.salary as any)?.[key]} 
                                        onChange={e => setData({...data, salary: { ...data.salary, [key]: Number(e.target.value) }})} 
                                    />
                                </div>
                            ))}
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                             <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bank Name</label>
                                <input className="w-full p-2 border rounded text-sm" value={data.bankName || ''} onChange={e => setData({...data, bankName: e.target.value})} placeholder="e.g. ADCB" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">IBAN / Account No.</label>
                                <input className="w-full p-2 border rounded text-sm" value={data.iban || ''} onChange={e => setData({...data, iban: e.target.value})} placeholder="AE..." />
                            </div>
                         </div>
                    </div>

                    {/* Section 3: Documents */}
                    <div className="bg-white p-6 rounded-lg shadow-sm border">
                        <h4 className="font-bold text-gray-800 mb-4 pb-2 border-b">Documents</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                             <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Emirates ID No.</label>
                                    <input className="w-full p-2 border rounded text-sm" value={data.documents?.emiratesId || ''} onChange={e => setData({...data, documents: {...data.documents, emiratesId: e.target.value}})} />
                                </div>
                                <div className="w-1/3">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Expiry</label>
                                    <input type="date" className="w-full p-2 border rounded text-sm" value={data.documents?.emiratesIdExpiry || ''} onChange={e => setData({...data, documents: {...data.documents, emiratesIdExpiry: e.target.value}})} />
                                </div>
                             </div>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Passport No.</label>
                                    <input className="w-full p-2 border rounded text-sm" value={data.documents?.passportNumber || ''} onChange={e => setData({...data, documents: {...data.documents, passportNumber: e.target.value}})} />
                                </div>
                                <div className="w-1/3">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Expiry</label>
                                    <input type="date" className="w-full p-2 border rounded text-sm" value={data.documents?.passportExpiry || ''} onChange={e => setData({...data, documents: {...data.documents, passportExpiry: e.target.value}})} />
                                </div>
                             </div>
                             <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Labour Card No.</label>
                                    <input className="w-full p-2 border rounded text-sm" value={data.documents?.labourCardNumber || ''} onChange={e => setData({...data, documents: {...data.documents, labourCardNumber: e.target.value}})} />
                                </div>
                                <div className="w-1/3">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Expiry</label>
                                    <input type="date" className="w-full p-2 border rounded text-sm" value={data.documents?.labourCardExpiry || ''} onChange={e => setData({...data, documents: {...data.documents, labourCardExpiry: e.target.value}})} />
                                </div>
                             </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t flex justify-end gap-3 bg-white rounded-b-xl shrink-0">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg font-medium border">Cancel</button>
                    <button onClick={handleSave} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-200">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const PayslipModal = ({ employee, month, year, onClose, allAttendance, allDeductions }: any) => {
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
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                <span className="text-gray-600">Name:</span><span className="font-bold">{employee.name}</span>
                                <span className="text-gray-600">Code:</span><span className="font-mono">{employee.code}</span>
                                <span className="text-gray-600">Designation:</span><span>{employee.designation}</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase font-bold mb-1">Bank Details</div>
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                <span className="text-gray-600">Bank Name:</span><span>{employee.bankName || '-'}</span>
                                <span className="text-gray-600">IBAN:</span><span className="font-mono">{employee.iban || '-'}</span>
                            </div>
                        </div>
                    </div>

                    <table className="w-full text-sm border border-gray-200 mb-6">
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
                                <td className="p-2 border">Basic Salary</td><td className="p-2 border text-right">{basic.toLocaleString()}</td>
                                <td className="p-2 border">Unpaid Days ({unpaidDaysCount})</td><td className="p-2 border text-right text-red-600">{unpaidDeductionAmount > 0 ? unpaidDeductionAmount.toLocaleString(undefined, {maximumFractionDigits: 2}) : '0.00'}</td>
                            </tr>
                            <tr>
                                <td className="p-2 border">Housing Allowance</td><td className="p-2 border text-right">{housing.toLocaleString()}</td>
                                <td className="p-2 border"></td><td className="p-2 border"></td>
                            </tr>
                            <tr>
                                <td className="p-2 border">Transport Allowance</td><td className="p-2 border text-right">{transport.toLocaleString()}</td>
                                <td className="p-2 border"></td><td className="p-2 border"></td>
                            </tr>
                            <tr>
                                <td className="p-2 border">Air Ticket</td><td className="p-2 border text-right">{airTicket.toLocaleString()}</td>
                                <td className="p-2 border"></td><td className="p-2 border"></td>
                            </tr>
                            <tr>
                                <td className="p-2 border">Leave Salary</td><td className="p-2 border text-right">{leaveSalary.toLocaleString()}</td>
                                <td className="p-2 border"></td><td className="p-2 border"></td>
                            </tr>
                             <tr>
                                <td className="p-2 border">Other Allowances</td><td className="p-2 border text-right">{other.toLocaleString()}</td>
                                <td className="p-2 border"></td><td className="p-2 border"></td>
                            </tr>
                            <tr>
                                <td className="p-2 border text-blue-600">Overtime ({totalOTHours})</td><td className="p-2 border text-right text-blue-600">{overtimePay.toLocaleString()}</td>
                                <td className="p-2 border"></td><td className="p-2 border"></td>
                            </tr>
                            {holidayPay > 0 && <tr><td className="p-2 border text-blue-600">Holiday Pay</td><td className="p-2 border text-right text-blue-600">{holidayPay.toLocaleString()}</td><td className="p-2 border"></td><td className="p-2 border"></td></tr>}
                            {weekOffPay > 0 && <tr><td className="p-2 border text-blue-600">WeekOff Pay</td><td className="p-2 border text-right text-blue-600">{weekOffPay.toLocaleString()}</td><td className="p-2 border"></td><td className="p-2 border"></td></tr>}
                            {variableDeductions.map((d: any) => (
                                <tr key={d.id}><td className="p-2 border"></td><td className="p-2 border"></td><td className="p-2 border text-red-600">{d.type}{d.note ? ` (${d.note})` : ''}</td><td className="p-2 border text-right text-red-600">{d.amount.toLocaleString()}</td></tr>
                            ))}
                             {/* Disclaimer Note */}
                            {(unpaidDaysCount > 0) && (
                                <tr>
                                    <td className="p-2 border" colSpan={4}>
                                        <p className="text-xs text-gray-500 italic">
                                            * Note: Annual Leave and Emergency Leave are treated as unpaid leave as per company policy.
                                        </p>
                                    </td>
                                </tr>
                            )}
                            <tr className="font-bold bg-gray-50">
                                <td className="p-2 border">Total Earnings</td><td className="p-2 border text-right">{(gross + totalAdditions).toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                                <td className="p-2 border">Total Deductions</td><td className="p-2 border text-right">{totalDeductions.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="flex justify-end">
                        <div className="bg-gray-900 text-white p-4 rounded-lg min-w-[200px]">
                            <div className="text-xs text-gray-400 uppercase mb-1">Net Pay</div>
                            <div className="text-xl font-bold">AED {netSalary.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ... [Keep BulkImportModal, EmployeeImportModal, HolidayManagementModal components] ...

const BulkImportModal = ({ isOpen, onClose, onImport }: any) => {
    const [text, setText] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-lg w-full max-w-2xl shadow-xl">
                <div className="flex justify-between mb-4">
                    <h3 className="font-bold">Import Attendance CSV</h3>
                    <button onClick={onClose}><XCircle className="w-5 h-5"/></button>
                </div>
                <textarea className="w-full h-64 border p-2 font-mono text-xs mb-4 bg-gray-50" value={text} onChange={e => setText(e.target.value)} placeholder={`Code,Date,Status,Overtime\n1001,2023-10-01,P,2`} />
                <div className="flex justify-end gap-2">
                    <button onClick={() => onImport(text)} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold">Import Data</button>
                </div>
            </div>
        </div>
    );
};

const EmployeeImportModal = ({ isOpen, onClose, onImport }: any) => {
    const [text, setText] = useState('');
    if (!isOpen) return null;
    return (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-lg w-full max-w-2xl shadow-xl">
                <div className="flex justify-between mb-4">
                    <h3 className="font-bold">Import Employees CSV</h3>
                    <button onClick={onClose}><XCircle className="w-5 h-5"/></button>
                </div>
                <p className="text-xs text-gray-500 mb-2">Format: Code, Name, Designation, Department, Company, JoiningDate, Type, Status, Team, Location, Basic, Housing, Transport, Other, AirTicket, LeaveSalary, EmiratesID, EIDExpiry, Passport, PassExpiry, LabourCard, LCExpiry, VacationDate</p>
                <textarea className="w-full h-64 border p-2 font-mono text-xs mb-4 bg-gray-50" value={text} onChange={e => setText(e.target.value)} placeholder="CSV Data..." />
                <div className="flex justify-end gap-2">
                    <button onClick={() => onImport(text)} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold">Import Employees</button>
                </div>
            </div>
        </div>
    );
};

const HolidayManagementModal = ({ isOpen, onClose }: any) => {
    const [holidays, setHolidays] = useState<PublicHoliday[]>(getPublicHolidays());
    const [newDate, setNewDate] = useState('');
    const [newName, setNewName] = useState('');

    const handleAdd = () => {
        if (newDate && newName) {
            const updated = savePublicHoliday({ id: Math.random().toString(), date: newDate, name: newName });
            setHolidays(updated);
            setNewDate(''); setNewName('');
        }
    };
    const handleDelete = (id: string) => {
        const updated = deletePublicHoliday(id);
        setHolidays(updated);
    };

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-lg w-full max-w-md shadow-xl">
                <div className="flex justify-between mb-4">
                    <h3 className="font-bold">Manage Public Holidays</h3>
                    <button onClick={onClose}><XCircle className="w-5 h-5"/></button>
                </div>
                <div className="flex gap-2 mb-4">
                    <input type="date" className="border p-2 rounded text-sm" value={newDate} onChange={e => setNewDate(e.target.value)} />
                    <input type="text" className="border p-2 rounded text-sm flex-1" placeholder="Holiday Name" value={newName} onChange={e => setNewName(e.target.value)} />
                    <button onClick={handleAdd} className="bg-green-600 text-white p-2 rounded"><Check className="w-4 h-4" /></button>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {holidays.map(h => (
                        <div key={h.id} className="flex justify-between items-center p-2 bg-gray-50 rounded border">
                            <span className="text-sm font-bold">{h.date} <span className="font-normal text-gray-600">- {h.name}</span></span>
                            <button onClick={() => handleDelete(h.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>
                        </div>
                    ))}
                </div>
             </div>
        </div>
    );
};

// --- Updated UserManagementModal with Hierarchy Logic ---
const UserManagementModal = ({ isOpen, onClose, currentUser }: any) => {
    const [users, setUsers] = useState<SystemUser[]>(getSystemUsers());
    const [newUser, setNewUser] = useState<SystemUser>({ username: '', password: '', name: '', role: UserRole.HR, active: true, permissions: { canViewDashboard: true, canManageEmployees: false, canViewDirectory: true, canManageAttendance: true, canViewTimesheet: true, canManageLeaves: false, canViewPayroll: false, canManagePayroll: false, canViewReports: false, canManageUsers: false, canManageSettings: false }});
    const [isEditing, setIsEditing] = useState(false);

    // Visibility Filter Logic
    const visibleUsers = users.filter(u => {
        if (currentUser.role === UserRole.CREATOR) return true; // Creator sees all
        if (currentUser.role === UserRole.ADMIN) return u.role !== UserRole.CREATOR; // Admin sees all EXCEPT Creator
        return u.username === currentUser.username; // Fallback
    });

    const handleSave = () => {
        try {
            if (newUser.role === UserRole.CREATOR && currentUser.role !== UserRole.CREATOR) {
                alert("Only the Creator can create another Creator.");
                return;
            }

            if (isEditing) {
                updateSystemUser(newUser.username, newUser);
            } else {
                addSystemUser(newUser);
            }
            setUsers(getSystemUsers());
            setNewUser({ username: '', password: '', name: '', role: UserRole.HR, active: true, permissions: { canViewDashboard: true, canManageEmployees: false, canViewDirectory: true, canManageAttendance: true, canViewTimesheet: true, canManageLeaves: false, canViewPayroll: false, canManagePayroll: false, canViewReports: false, canManageUsers: false, canManageSettings: false }});
            setIsEditing(false);
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleEdit = (user: SystemUser) => {
        if (currentUser.role === UserRole.ADMIN && user.role === UserRole.CREATOR) {
            alert("Admins cannot edit the Creator.");
            return;
        }
        setNewUser(user);
        setIsEditing(true);
    };

    const handleDelete = (username: string, role: UserRole) => {
        if (role === UserRole.CREATOR) {
            alert("Creator cannot be deleted.");
            return;
        }
        try { 
            deleteSystemUser(username); 
            setUsers(getSystemUsers()); 
        } catch(e:any){ 
            alert(e.message); 
        } 
    };

    if (!isOpen) return null;
    return (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-lg w-full max-w-4xl shadow-xl h-[80vh] flex flex-col">
                <div className="flex justify-between mb-4">
                    <h3 className="font-bold">User Management</h3>
                    <button onClick={onClose}><XCircle className="w-5 h-5"/></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 border-b pb-6">
                    <input className="border p-2 rounded" placeholder="Username" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} disabled={isEditing} />
                    <input className="border p-2 rounded" placeholder="Password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                    <input className="border p-2 rounded" placeholder="Full Name" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
                    <select className="border p-2 rounded" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as any})} disabled={currentUser.role !== UserRole.CREATOR && currentUser.role !== UserRole.ADMIN}>
                        {Object.values(UserRole).filter(r => currentUser.role === UserRole.CREATOR || r !== UserRole.CREATOR).map(r => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                    <div className="col-span-2 flex justify-end">
                         <button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">{isEditing ? 'Update' : 'Create'} User</button>
                    </div>
                </div>
                <div className="overflow-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 font-bold text-gray-600"><tr><th className="p-2">User</th><th className="p-2">Name</th><th className="p-2">Role</th><th className="p-2">Actions</th></tr></thead>
                        <tbody>
                            {visibleUsers.map(u => (
                                <tr key={u.username} className="border-b">
                                    <td className="p-2">{u.username}</td>
                                    <td className="p-2">{u.name}</td>
                                    <td className="p-2">{u.role}</td>
                                    <td className="p-2 flex gap-2">
                                        <button onClick={() => handleEdit(u)} className="text-blue-600 disabled:opacity-30" disabled={currentUser.role === UserRole.ADMIN && u.role === UserRole.CREATOR}><Edit className="w-4 h-4"/></button>
                                        <button onClick={() => handleDelete(u.username, u.role)} className="text-red-600 disabled:opacity-30" disabled={u.role === UserRole.CREATOR}><Trash2 className="w-4 h-4"/></button>
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

// ... [Keep ProfileModal, ManageCompaniesModal, CopyAttendanceModal components] ...

const ProfileModal = ({ isOpen, onClose, currentUser, onUpdate }: any) => {
    const [name, setName] = useState(currentUser.name);
    const [password, setPassword] = useState(currentUser.password);

    const handleSave = () => {
        const updatedUser = { ...currentUser, name, password };
        try {
            updateSystemUser(currentUser.username, updatedUser);
            onUpdate(updatedUser);
            onClose();
        } catch (e: any) {
            alert(e.message);
        }
    };

    if (!isOpen) return null;
    return (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-lg w-full max-w-md shadow-xl">
                <div className="flex justify-between mb-4">
                    <h3 className="font-bold">My Profile Settings</h3>
                    <button onClick={onClose}><XCircle className="w-5 h-5"/></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username</label>
                        <input className="w-full border p-2 rounded bg-gray-100" value={currentUser.username} disabled />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Display Name</label>
                        <input className="w-full border p-2 rounded" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                        <input className="w-full border p-2 rounded" value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                    <button onClick={handleSave} className="w-full bg-indigo-600 text-white py-2 rounded font-bold">Update Profile</button>
                </div>
             </div>
        </div>
    );
};

const ManageCompaniesModal = ({ isOpen, onClose, companies, onDataChange }: any) => {
    const [newComp, setNewComp] = useState('');
    const handleAdd = () => {
        if (newComp) {
            const updated = addCompany(newComp);
            onDataChange(updated);
            setNewComp('');
        }
    };
    const handleDelete = (name: string) => {
        const updated = deleteCompany(name);
        onDataChange(updated);
    };

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-lg w-full max-w-lg shadow-xl">
                 <div className="flex justify-between mb-4">
                    <h3 className="font-bold">Manage Companies</h3>
                    <button onClick={onClose}><XCircle className="w-5 h-5"/></button>
                </div>
                <div className="flex gap-2 mb-4">
                    <input className="border p-2 rounded flex-1" placeholder="New Company Name" value={newComp} onChange={e => setNewComp(e.target.value)} />
                    <button onClick={handleAdd} className="bg-green-600 text-white px-4 rounded">Add</button>
                </div>
                <ul className="max-h-[300px] overflow-y-auto space-y-2">
                    {companies.map((c: string) => (
                         <li key={c} className="flex justify-between items-center bg-gray-50 p-2 rounded border">
                             <span className="text-sm">{c}</span>
                             <button onClick={() => handleDelete(c)} className="text-red-500"><Trash2 className="w-4 h-4"/></button>
                         </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

const CopyAttendanceModal = ({ isOpen, onClose, onCopy }: any) => {
    const [source, setSource] = useState('');
    const [target, setTarget] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-lg w-full max-w-md shadow-xl">
                <h3 className="font-bold mb-4">Copy Daily Attendance</h3>
                <div className="space-y-4 mb-4">
                    <div><label className="block text-xs uppercase font-bold text-gray-500">Source Date</label><input type="date" className="w-full border p-2 rounded" value={source} onChange={e => setSource(e.target.value)} /></div>
                    <div><label className="block text-xs uppercase font-bold text-gray-500">Target Date</label><input type="date" className="w-full border p-2 rounded" value={target} onChange={e => setTarget(e.target.value)} /></div>
                </div>
                 <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
                    <button onClick={() => onCopy(source, target)} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold">Copy Records</button>
                </div>
            </div>
        </div>
    );
};

const LeaveRequestModal = ({ employees, onClose, onSave, currentUser }: any) => {
    const [req, setReq] = useState({ employeeId: '', startDate: '', endDate: '', type: AttendanceStatus.ANNUAL_LEAVE, reason: '' });
    
    const handleSubmit = () => {
        if (!req.employeeId || !req.startDate || !req.endDate) return alert("Please fill all fields");
        saveLeaveRequest(req as any, currentUser.username);
        onSave();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl text-gray-900">New Leave Request</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-700"/></button>
                </div>
                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                        <select className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={req.employeeId} onChange={e => setReq({...req, employeeId: e.target.value})}>
                            <option value="">Select Employee</option>
                            {employees.filter((e:Employee) => e.active).map((e: Employee) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                            <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg" value={req.startDate} onChange={e => setReq({...req, startDate: e.target.value})} />
                         </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                            <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg" value={req.endDate} onChange={e => setReq({...req, endDate: e.target.value})} />
                         </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                        <select className="w-full p-2.5 border border-gray-300 rounded-lg bg-white" value={req.type} onChange={e => setReq({...req, type: e.target.value as any})}>
                            <option value={AttendanceStatus.ANNUAL_LEAVE}>Annual Leave</option>
                            <option value={AttendanceStatus.SICK_LEAVE}>Sick Leave</option>
                            <option value={AttendanceStatus.UNPAID_LEAVE}>Unpaid Leave</option>
                            <option value={AttendanceStatus.EMERGENCY_LEAVE}>Emergency Leave</option>
                        </select>
                    </div>
                    <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                         <textarea className="w-full p-2.5 border border-gray-300 rounded-lg h-24 resize-none" placeholder="Describe the reason for leave..." value={req.reason} onChange={e => setReq({...req, reason: e.target.value})} />
                    </div>
                    <div className="pt-4 flex gap-3">
                        <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50">Cancel</button>
                        <button onClick={handleSubmit} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200">Submit Request</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const RehireModal = ({ employee, onClose, onConfirm }: any) => {
    const [date, setDate] = useState('');
    const [reason, setReason] = useState('');
    if (!employee) return null;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-8 rounded-2xl w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-xl text-gray-800">Rehire Employee</h3>
                     <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-700"/></button>
                </div>
                <div className="mb-6">
                    <p className="text-sm text-gray-500">You are about to re-activate <span className="font-bold text-gray-900">{employee.name}</span>.</p>
                </div>
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Rejoining Date</label>
                        <input type="date" className="w-full border p-2.5 rounded-lg text-sm" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                    <div>
                         <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reason / Notes</label>
                        <textarea className="w-full border p-2.5 rounded-lg text-sm h-24 resize-none" placeholder="Reason for rehiring..." value={reason} onChange={e => setReason(e.target.value)} />
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 border rounded-lg text-gray-600 font-medium">Cancel</button>
                    <button onClick={() => onConfirm(employee.id, date, reason)} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg shadow-green-200">Confirm Rejoin</button>
                </div>
             </div>
        </div>
    );
};

const ExEmployeeDetailsModal = ({ employee, onClose }: any) => {
    if (!employee) return null;
    const details = employee.offboardingDetails;
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                <div className="p-6 bg-gray-900 text-white flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-xl">Ex-Employee Record</h3>
                        <p className="text-sm text-gray-400">{employee.name} — {employee.code}</p>
                    </div>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400 hover:text-white transition-colors"/></button>
                </div>
                <div className="p-8 overflow-y-auto space-y-8">
                    {/* Exit Info */}
                    <div className="grid grid-cols-2 gap-6">
                         <div>
                             <label className="text-xs text-gray-500 uppercase font-bold">Exit Date</label>
                             <p className="font-medium text-lg text-gray-900">{details?.exitDate}</p>
                         </div>
                         <div>
                             <label className="text-xs text-gray-500 uppercase font-bold">Exit Type</label>
                             <span className="inline-block mt-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">{details?.type}</span>
                         </div>
                         <div className="col-span-2">
                             <label className="text-xs text-gray-500 uppercase font-bold">Reason</label>
                             <p className="text-gray-700 mt-1 italic">"{details?.reason}"</p>
                         </div>
                    </div>

                    {/* Financials */}
                    <div className="bg-gray-50 p-6 rounded-xl border">
                        <h4 className="text-sm font-bold text-gray-900 uppercase mb-4 pb-2 border-b">Final Settlement Breakdown</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                            <div className="flex justify-between"><span>Gratuity</span><span className="font-medium">{details?.gratuity.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Leave Encash</span><span className="font-medium">{details?.leaveEncashment.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Salary Dues</span><span className="font-medium">{details?.salaryDues.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span>Other Dues</span><span className="font-medium">{details?.otherDues.toLocaleString()}</span></div>
                            <div className="flex justify-between text-red-600"><span>Deductions</span><span className="font-medium">-{details?.deductions.toLocaleString()}</span></div>
                        </div>
                        <div className="flex justify-between items-center pt-4 border-t">
                            <span className="font-bold text-gray-900">Net Settlement Paid</span>
                            <span className="text-2xl font-bold text-green-700">AED {details?.netSettlement.toLocaleString()}</span>
                        </div>
                    </div>
                    
                    {/* Notes */}
                    {details?.notes && (
                        <div>
                            <label className="text-xs text-gray-500 uppercase font-bold">Additional Notes</label>
                            <p className="text-sm text-gray-600 mt-1">{details.notes}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const OnboardingWizard = ({ companies, onClose, onComplete }: any) => {
    const [step, setStep] = useState(1);
    const [emp, setEmp] = useState<Employee>({
        id: Math.random().toString(36).substr(2, 9),
        code: '', name: '', designation: '', department: '', joiningDate: new Date().toISOString().split('T')[0],
        type: StaffType.WORKER, company: companies[0] || DEFAULT_COMPANIES[0], status: 'Active', team: 'Internal Team',
        workLocation: '', leaveBalance: 30, active: true,
        salary: { basic: 0, housing: 0, transport: 0, other: 0, airTicket: 0, leaveSalary: 0 },
        documents: {}
    });

    const handleNext = () => setStep(step + 1);
    const handleBack = () => setStep(step - 1);
    const handleSave = () => {
        if (!emp.code || !emp.name) return alert("Code and Name are required");
        saveEmployee(emp);
        onComplete();
    };

    const StepIndicator = () => (
        <div className="flex justify-between items-center mb-8 px-8">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className={`flex items-center gap-2 ${step >= i ? 'text-indigo-600' : 'text-gray-300'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${step >= i ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200'}`}>
                        {step > i ? <Check className="w-4 h-4" /> : i}
                    </div>
                    <span className={`text-sm font-medium hidden md:block ${step === i ? 'text-gray-900' : ''}`}>
                        {i === 1 ? 'Personal' : i === 2 ? 'Role & Work' : i === 3 ? 'Financials' : 'Documents'}
                    </span>
                    {i < 4 && <div className={`h-0.5 w-12 mx-2 ${step > i ? 'bg-indigo-600' : 'bg-gray-200'}`} />}
                </div>
            ))}
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl h-[80vh] flex flex-col">
                 <div className="flex justify-between p-6 border-b">
                    <h3 className="font-bold text-xl text-gray-900">Onboard New Employee</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-700"/></button>
                </div>
                
                <div className="py-6 bg-gray-50">
                    <StepIndicator />
                </div>

                <div className="flex-1 overflow-y-auto p-8">
                    {step === 1 && (
                        <div className="space-y-5 animate-fade-in">
                            <h4 className="text-lg font-bold text-gray-800 mb-4">Personal Information</h4>
                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Employee Code *</label>
                                    <input className="w-full p-2.5 border rounded-lg" value={emp.code} onChange={e => setEmp({...emp, code: e.target.value})} placeholder="e.g. 1001" autoFocus />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                                    <input className="w-full p-2.5 border rounded-lg" value={emp.name} onChange={e => setEmp({...emp, name: e.target.value})} placeholder="John Doe" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                                    <select className="w-full p-2.5 border rounded-lg bg-white" value={emp.company} onChange={e => setEmp({...emp, company: e.target.value})}>
                                        {companies.map((c:string) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Joining Date</label>
                                    <input type="date" className="w-full p-2.5 border rounded-lg" value={emp.joiningDate} onChange={e => setEmp({...emp, joiningDate: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    )}
                    {step === 2 && (
                         <div className="space-y-5 animate-fade-in">
                            <h4 className="text-lg font-bold text-gray-800 mb-4">Role & Work Details</h4>
                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                                    <input className="w-full p-2.5 border rounded-lg" value={emp.designation} onChange={e => setEmp({...emp, designation: e.target.value})} placeholder="e.g. Driver" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                                    <input className="w-full p-2.5 border rounded-lg" value={emp.department} onChange={e => setEmp({...emp, department: e.target.value})} placeholder="e.g. Transport" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Team Assignment</label>
                                    <select className="w-full p-2.5 border rounded-lg bg-white" value={emp.team} onChange={e => setEmp({...emp, team: e.target.value as any})}>
                                        <option value="Internal Team">Internal Team</option>
                                        <option value="External Team">External Team</option>
                                        <option value="Office Staff">Office Staff</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Work Location</label>
                                    <input className="w-full p-2.5 border rounded-lg" value={emp.workLocation} onChange={e => setEmp({...emp, workLocation: e.target.value})} placeholder="e.g. Head Office" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Staff Type</label>
                                    <select className="w-full p-2.5 border rounded-lg bg-white" value={emp.type} onChange={e => setEmp({...emp, type: e.target.value as any})}>
                                        <option value={StaffType.WORKER}>Worker</option>
                                        <option value={StaffType.OFFICE}>Office Staff</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                    {step === 3 && (
                         <div className="space-y-5 animate-fade-in">
                            <h4 className="text-lg font-bold text-gray-800 mb-4">Salary & Banking</h4>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-1"><label className="text-xs font-bold text-gray-500">Basic</label><input type="number" className="w-full p-2 border rounded" value={emp.salary.basic || ''} onChange={e => setEmp({...emp, salary: {...emp.salary, basic: Number(e.target.value)}})} /></div>
                                <div className="col-span-1"><label className="text-xs font-bold text-gray-500">Housing</label><input type="number" className="w-full p-2 border rounded" value={emp.salary.housing || ''} onChange={e => setEmp({...emp, salary: {...emp.salary, housing: Number(e.target.value)}})} /></div>
                                <div className="col-span-1"><label className="text-xs font-bold text-gray-500">Transport</label><input type="number" className="w-full p-2 border rounded" value={emp.salary.transport || ''} onChange={e => setEmp({...emp, salary: {...emp.salary, transport: Number(e.target.value)}})} /></div>
                                <div className="col-span-1"><label className="text-xs font-bold text-gray-500">Air Ticket</label><input type="number" className="w-full p-2 border rounded" value={emp.salary.airTicket || ''} onChange={e => setEmp({...emp, salary: {...emp.salary, airTicket: Number(e.target.value)}})} /></div>
                                <div className="col-span-1"><label className="text-xs font-bold text-gray-500">Leave Salary</label><input type="number" className="w-full p-2 border rounded" value={emp.salary.leaveSalary || ''} onChange={e => setEmp({...emp, salary: {...emp.salary, leaveSalary: Number(e.target.value)}})} /></div>
                                <div className="col-span-1"><label className="text-xs font-bold text-gray-500">Other</label><input type="number" className="w-full p-2 border rounded" value={emp.salary.other || ''} onChange={e => setEmp({...emp, salary: {...emp.salary, other: Number(e.target.value)}})} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                                    <input className="w-full p-2.5 border rounded-lg" value={emp.bankName || ''} onChange={e => setEmp({...emp, bankName: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">IBAN / Acct No.</label>
                                    <input className="w-full p-2.5 border rounded-lg" value={emp.iban || ''} onChange={e => setEmp({...emp, iban: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    )}
                    {step === 4 && (
                        <div className="space-y-5 animate-fade-in">
                            <h4 className="text-lg font-bold text-gray-800 mb-4">Documents & Identification</h4>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Emirates ID Number</label>
                                    <input className="w-full p-2.5 border rounded-lg" value={emp.documents?.emiratesId || ''} onChange={e => setEmp({...emp, documents: {...emp.documents, emiratesId: e.target.value}})} placeholder="784-..." />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">EID Expiry</label>
                                    <input type="date" className="w-full p-2.5 border rounded-lg" value={emp.documents?.emiratesIdExpiry || ''} onChange={e => setEmp({...emp, documents: {...emp.documents, emiratesIdExpiry: e.target.value}})} />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Passport Number</label>
                                    <input className="w-full p-2.5 border rounded-lg" value={emp.documents?.passportNumber || ''} onChange={e => setEmp({...emp, documents: {...emp.documents, passportNumber: e.target.value}})} />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Passport Expiry</label>
                                    <input type="date" className="w-full p-2.5 border rounded-lg" value={emp.documents?.passportExpiry || ''} onChange={e => setEmp({...emp, documents: {...emp.documents, passportExpiry: e.target.value}})} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t flex justify-between bg-gray-50 rounded-b-2xl">
                    {step > 1 ? (
                        <button onClick={handleBack} className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-bold hover:bg-white">Back</button>
                    ) : <div></div>}
                    
                    {step < 4 ? (
                        <button onClick={handleNext} className="px-6 py-2.5 bg-gray-900 text-white rounded-lg font-bold hover:bg-black flex items-center gap-2">Next Step <ArrowRight className="w-4 h-4"/></button>
                    ) : (
                        <button onClick={handleSave} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 flex items-center gap-2">Complete Onboarding <Check className="w-4 h-4"/></button>
                    )}
                </div>
            </div>
        </div>
    );
};

const DeductionsView = ({ deductions, employees, onRefresh }: any) => {
    const [newDed, setNewDed] = useState({ employeeId: '', date: new Date().toISOString().split('T')[0], type: 'Salary Advance', amount: 0, note: '' });

    const handleSave = () => {
        if (newDed.employeeId && newDed.amount) {
            saveDeduction(newDed as any);
            setNewDed({ ...newDed, amount: 0, note: '' });
            onRefresh();
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold">Deductions & Penalties</h2>
            <div className="bg-white p-6 rounded-xl shadow-sm border">
                <h3 className="font-bold mb-4">Add New Deduction</h3>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                    <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Employee</label>
                        <select className="w-full border p-2 rounded text-sm" value={newDed.employeeId} onChange={e => setNewDed({...newDed, employeeId: e.target.value})}>
                            <option value="">Select...</option>
                            {employees.map((e: Employee) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date</label>
                        <input type="date" className="w-full border p-2 rounded text-sm" value={newDed.date} onChange={e => setNewDed({...newDed, date: e.target.value})} />
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
                        <select className="w-full border p-2 rounded text-sm" value={newDed.type} onChange={e => setNewDed({...newDed, type: e.target.value})}>
                            <option>Salary Advance</option><option>Loan Amount</option><option>Damage Material/Asset</option><option>Fine Amount</option><option>Penalty</option><option>Other</option>
                        </select>
                    </div>
                    <div className="md:col-span-1">
                         <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount</label>
                        <input type="number" className="w-full border p-2 rounded text-sm" placeholder="0.00" value={newDed.amount || ''} onChange={e => setNewDed({...newDed, amount: Number(e.target.value)})} />
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description / Note</label>
                        <input type="text" className="w-full border p-2 rounded text-sm" placeholder="Reason..." value={newDed.note} onChange={e => setNewDed({...newDed, note: e.target.value})} />
                    </div>
                    <div className="md:col-span-1">
                        <button onClick={handleSave} className="w-full bg-red-600 text-white p-2 rounded font-bold text-sm">Add</button>
                    </div>
                </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs"><tr><th className="p-4">Date</th><th className="p-4">Employee</th><th className="p-4">Type</th><th className="p-4">Note</th><th className="p-4">Amount</th><th className="p-4">Action</th></tr></thead>
                    <tbody>
                        {deductions.map((d: any) => {
                            const emp = employees.find((e: Employee) => e.id === d.employeeId);
                            return (
                                <tr key={d.id} className="border-b hover:bg-gray-50">
                                    <td className="p-4">{d.date}</td>
                                    <td className="p-4 font-bold">{emp?.name || 'Unknown'}</td>
                                    <td className="p-4">{d.type}</td>
                                    <td className="p-4 text-gray-500 italic">{d.note || '-'}</td>
                                    <td className="p-4 font-bold text-red-600">{d.amount}</td>
                                    <td className="p-4"><button onClick={() => { deleteDeduction(d.id); onRefresh(); }} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                                </tr>
                            );
                        })}
                        {deductions.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-400">No deductions recorded.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ReportsView = ({ employees, attendance, leaveRequests }: any) => {
    const totalStaff = employees.length;
    const activeStaff = employees.filter((e:any) => e.active).length;
    const totalSalaries = employees.filter((e:any) => e.active).reduce((acc:number, e:any) => {
        const s = e.salary || {};
        return acc + (s.basic||0) + (s.housing||0) + (s.transport||0) + (s.other||0) + (s.airTicket||0) + (s.leaveSalary||0);
    }, 0);
    
    const deptCounts = employees.reduce((acc:any, e:any) => {
        if(e.active) acc[e.department || 'Other'] = (acc[e.department || 'Other'] || 0) + 1;
        return acc;
    }, {});

    const handlePrint = () => window.print();

    return (
        <div className="space-y-6 print:p-8">
            <div className="flex justify-between items-center print:hidden">
                <h2 className="text-xl font-bold">Company Reports & Analytics</h2>
                <button onClick={handlePrint} className="bg-gray-800 text-white px-4 py-2 rounded flex items-center gap-2">
                    <Printer className="w-4 h-4" /> Print / Download Report
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                 <div className="bg-white p-6 rounded-xl shadow-sm border">
                     <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Total Active Staff</h3>
                     <p className="text-3xl font-bold text-indigo-600">{activeStaff}</p>
                     <p className="text-xs text-gray-400 mt-1">Total Database: {totalStaff}</p>
                 </div>
                 <div className="bg-white p-6 rounded-xl shadow-sm border">
                     <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Est. Monthly Payroll</h3>
                     <p className="text-3xl font-bold text-green-600">AED {totalSalaries.toLocaleString()}</p>
                     <p className="text-xs text-gray-400 mt-1">Base Salaries + Fixed Allowances</p>
                 </div>
                 <div className="bg-white p-6 rounded-xl shadow-sm border">
                     <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Total Leave Requests</h3>
                     <p className="text-3xl font-bold text-orange-600">{leaveRequests.length}</p>
                     <p className="text-xs text-gray-400 mt-1">Pending: {leaveRequests.filter((r:any) => r.status === 'Pending').length}</p>
                 </div>
                 <div className="bg-white p-6 rounded-xl shadow-sm border">
                     <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Avg Attendance Rate</h3>
                     <p className="text-3xl font-bold text-blue-600">92%</p>
                     <p className="text-xs text-gray-400 mt-1">Based on last 30 days</p>
                 </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border">
                    <h3 className="font-bold mb-4">Staff Distribution by Department</h3>
                    <div className="space-y-3">
                        {Object.entries(deptCounts).map(([dept, count]: any) => (
                            <div key={dept}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span>{dept}</span>
                                    <span className="font-bold">{count}</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(count / activeStaff) * 100}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border">
                     <h3 className="font-bold mb-4">Team Allocation</h3>
                     <div className="flex justify-center items-center h-48 gap-8">
                        <div className="text-center">
                             <div className="text-2xl font-bold text-green-600">{employees.filter((e:any) => e.active && e.team === 'Internal Team').length}</div>
                             <div className="text-xs text-gray-500">Internal</div>
                        </div>
                        <div className="text-center">
                             <div className="text-2xl font-bold text-orange-600">{employees.filter((e:any) => e.active && e.team === 'External Team').length}</div>
                             <div className="text-xs text-gray-500">External</div>
                        </div>
                        <div className="text-center">
                             <div className="text-2xl font-bold text-blue-600">{employees.filter((e:any) => e.active && e.team === 'Office Staff').length}</div>
                             <div className="text-xs text-gray-500">Office</div>
                        </div>
                     </div>
                </div>
            </div>
        </div>
    );
};

const AboutView = ({ currentUser }: any) => {
    const [about, setAbout] = useState(getAboutData());
    const [isEditing, setIsEditing] = useState(false);
    
    // Updated Logic: Only Creator or Admin can edit.
    const canEdit = currentUser.role === UserRole.CREATOR || currentUser.role === UserRole.ADMIN;

    const handleSave = () => {
        saveAboutData(about);
        setIsEditing(false);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-bold">About System Owner</h2>
                 {canEdit && !isEditing && <button onClick={() => setIsEditing(true)} className="text-blue-600"><Edit className="w-5 h-5"/></button>}
            </div>
            
            <div className="bg-white p-8 rounded-xl shadow-lg border relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-indigo-600 to-purple-600"></div>
                <div className="relative pt-16 flex flex-col md:flex-row gap-8 items-start">
                     <div className="w-32 h-32 bg-white rounded-full p-2 shadow-xl mx-auto md:mx-0">
                         {about.profileImage ? <img src={about.profileImage} className="w-full h-full rounded-full object-cover" /> : <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center"><User className="w-12 h-12 text-gray-400" /></div>}
                     </div>
                     <div className="flex-1 text-center md:text-left">
                         {isEditing ? (
                             <div className="space-y-3">
                                 <input className="border p-2 rounded w-full font-bold" value={about.name} onChange={e => setAbout({...about, name: e.target.value})} />
                                 <input className="border p-2 rounded w-full" value={about.title} onChange={e => setAbout({...about, title: e.target.value})} />
                                 <textarea className="border p-2 rounded w-full h-24" value={about.bio} onChange={e => setAbout({...about, bio: e.target.value})} />
                                 <input className="border p-2 rounded w-full" value={about.email} onChange={e => setAbout({...about, email: e.target.value})} />
                                 <input className="border p-2 rounded w-full" value={about.contactInfo} onChange={e => setAbout({...about, contactInfo: e.target.value})} />
                                 <button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded">Save Profile</button>
                             </div>
                         ) : (
                             <>
                                <h1 className="text-3xl font-bold text-gray-900 mb-1">{about.name}</h1>
                                <p className="text-indigo-600 font-medium mb-4">{about.title}</p>
                                <p className="text-gray-600 mb-6 leading-relaxed">{about.bio}</p>
                                <div className="flex flex-col md:flex-row gap-4 text-sm text-gray-500">
                                    <div className="flex items-center gap-2 justify-center md:justify-start"><span className="p-2 bg-gray-100 rounded-full"><Users className="w-4 h-4"/></span> {about.email}</div>
                                    <div className="flex items-center gap-2 justify-center md:justify-start"><span className="p-2 bg-gray-100 rounded-full"><Briefcase className="w-4 h-4"/></span> {about.contactInfo}</div>
                                </div>
                             </>
                         )}
                     </div>
                </div>
            </div>
            
            <div className="text-center text-gray-400 text-sm mt-12">
                &copy; 2025 ShiftSync Workforce Management System. All rights reserved.
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
  const [showProfile, setShowProfile] = useState(false);
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

       <main className="p-4 md:p-6 w-full">
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
                  {/* ... [Dashboard Stats Cards remain the same] ... */}
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
          
          {activeTab === 'reports' && <ReportsView employees={employees} attendance={attendance} leaveRequests={leaveRequests} />}
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
