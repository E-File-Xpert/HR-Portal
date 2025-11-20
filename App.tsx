
import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Download, 
  FileText,
  Building2,
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
  Ban,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Shield,
  Lock,
  CheckSquare,
  Square,
  FileIcon,
  Info,
  Camera,
  RefreshCcw,
  History,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';

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
  EmployeeDocuments,
  SystemUser,
  UserRole,
  UserPermissions,
  AboutData
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
  deleteCompany,
  getSystemUsers,
  addSystemUser,
  updateSystemUser,
  deleteSystemUser,
  getAboutData,
  saveAboutData
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
    let totalOTHours = 0;

    const HOURLY_OT_RATE = 5;
    const WEEK_OFF_HOURLY_RATE = 5;
    const HOLIDAY_BONUS_FLAT = 50;

    // Office Staff are NOT eligible for Overtime OR Public Holiday Bonus Work
    const isOtEligible = team !== 'Office Staff';

    records.forEach(r => {
        // Overtime Calculation
        if (isOtEligible && r.overtimeHours > 0) {
            overtimePay += r.overtimeHours * HOURLY_OT_RATE;
            totalOTHours += r.overtimeHours;
        }

        // Public Holiday Work Calculation (If PRESENT on a Public Holiday)
        if (isOtEligible && PUBLIC_HOLIDAYS.includes(r.date) && r.status === AttendanceStatus.PRESENT) {
            holidayPay += HOLIDAY_BONUS_FLAT;
        }

        // Week Off Work Calculation (If PRESENT on a Sunday - Day 0)
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

const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

// Helper to read file as ArrayBuffer for Excel
const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

// Common File Import Handler Logic
const handleFileImport = async (file: File, callback: (csvText: string) => void) => {
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
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <div className="bg-indigo-600 p-3 rounded-lg">
                        <Building2 className="w-8 h-8 text-white" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">ShiftSync</h2>
                <p className="text-center text-gray-500 mb-8">Secure Workforce Management Portal</p>
                
                {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm text-center font-medium">{error}</div>}
                
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                        <input 
                            type="text" 
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Enter username"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input 
                            type="password" 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Enter password"
                        />
                    </div>
                    <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-lg">
                        Login to Portal
                    </button>
                </form>
            </div>
        </div>
    )
}

const UserManagementModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const [users, setUsers] = useState<SystemUser[]>(getSystemUsers());
    const [isEditing, setIsEditing] = useState(false);
    const [originalUsername, setOriginalUsername] = useState(''); // For tracking updates
    const [formData, setFormData] = useState({ username: '', password: '', name: '', role: UserRole.HR });
    const [permissions, setPermissions] = useState<UserPermissions>({
        canViewDashboard: true,
        canManageEmployees: false,
        canViewDirectory: true,
        canManageAttendance: false,
        canViewTimesheet: true,
        canManageLeaves: false,
        canViewPayroll: false,
        canManagePayroll: false,
        canViewReports: false,
        canManageUsers: false,
        canManageSettings: false
    });

    const togglePermission = (key: keyof UserPermissions) => {
        setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
    };

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
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleEdit = (user: SystemUser) => {
        setFormData({
            username: user.username,
            password: user.password,
            name: user.name,
            role: user.role
        });
        setPermissions(user.permissions);
        setOriginalUsername(user.username);
        setIsEditing(true);
    };

    const resetForm = () => {
        setFormData({ username: '', password: '', name: '', role: UserRole.HR });
        setIsEditing(false);
        setOriginalUsername('');
        // Reset permissions default
        setPermissions({
            canViewDashboard: true,
            canManageEmployees: false,
            canViewDirectory: true,
            canManageAttendance: false,
            canViewTimesheet: true,
            canManageLeaves: false,
            canViewPayroll: false,
            canManagePayroll: false,
            canViewReports: false,
            canManageUsers: false,
            canManageSettings: false
        });
    };

    const handleDelete = (username: string) => {
        try {
            if (confirm(`Delete user ${username}?`)) {
                const updated = deleteSystemUser(username);
                setUsers(updated);
            }
        } catch (e: any) {
            alert(e.message);
        }
    };

    if (!isOpen) return null;

    const permissionLabels: Record<keyof UserPermissions, string> = {
        canViewDashboard: "View Dashboard",
        canViewDirectory: "View Staff Directory",
        canManageEmployees: "Manage Employees (Add/Edit/Offboard)",
        canViewTimesheet: "View Monthly Timesheet",
        canManageAttendance: "Edit Attendance & OT",
        canManageLeaves: "Manage Leave Requests",
        canViewPayroll: "View Payroll Register",
        canManagePayroll: "Manage Payroll (Print/Slip)",
        canViewReports: "View Custom Reports",
        canManageUsers: "Manage System Users",
        canManageSettings: "Manage Settings (Companies/Holidays)"
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
            <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl p-6 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold">System User Management</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500"/></button>
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
                             {Object.entries(permissionLabels).map(([key, label]) => (
                                 <div key={key} onClick={() => togglePermission(key as keyof UserPermissions)} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded select-none">
                                     {permissions[key as keyof UserPermissions] ? 
                                        <CheckSquare className="w-4 h-4 text-indigo-600" /> : 
                                        <Square className="w-4 h-4 text-gray-400" />
                                     }
                                     <span className="text-xs text-gray-700">{label}</span>
                                 </div>
                             ))}
                         </div>
                     </div>

                     <button onClick={handleSave} className={`w-full text-white py-2 rounded text-sm font-medium transition-colors ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                         {isEditing ? 'Update User' : 'Create System User'}
                     </button>
                </div>

                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 font-bold sticky top-0">
                            <tr>
                                <th className="p-2">Username</th>
                                <th className="p-2">Name</th>
                                <th className="p-2">Role</th>
                                <th className="p-2">Permissions</th>
                                <th className="p-2 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Hiding Creator from the list completely so others cannot see/edit/delete it */}
                            {users.filter(u => u.role !== UserRole.CREATOR).map(u => (
                                <tr key={u.username} className={`border-b ${isEditing && originalUsername === u.username ? 'bg-blue-50' : ''}`}>
                                    <td className="p-2 font-mono">{u.username}</td>
                                    <td className="p-2">{u.name}</td>
                                    <td className="p-2"><span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{u.role}</span></td>
                                    <td className="p-2 text-xs text-gray-500 max-w-xs truncate" title={JSON.stringify(u.permissions)}>
                                        {Object.values(u.permissions || {}).filter(Boolean).length} active permissions
                                    </td>
                                    <td className="p-2 text-right flex justify-end gap-2">
                                        <button onClick={() => handleEdit(u)} className="text-blue-500 hover:bg-blue-50 p-1 rounded" title="Edit"><Edit className="w-4 h-4"/></button>
                                        {u.username !== 'admin' && (
                                            <button onClick={() => handleDelete(u.username)} className="text-red-500 hover:bg-red-50 p-1 rounded" title="Delete"><Trash2 className="w-4 h-4"/></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

const ExEmployeeDetailsModal = ({ employee, onClose }: { employee: Employee, onClose: () => void }) => {
    const [previewDoc, setPreviewDoc] = useState<string | null>(null);
    const details = employee.offboardingDetails;

    if (!details) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-6 flex flex-col max-h-[85vh]">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">{employee.name}</h3>
                        <p className="text-sm text-gray-500">{employee.designation} - {employee.code}</p>
                    </div>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500 hover:text-gray-700"/></button>
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
                             <div className="p-2 border rounded"><span className="block text-xs text-gray-500">Gratuity</span>AED {details.gratuity}</div>
                             <div className="p-2 border rounded"><span className="block text-xs text-gray-500">Leave Encash</span>AED {details.leaveEncashment}</div>
                             <div className="p-2 border rounded"><span className="block text-xs text-gray-500">Salary Dues</span>AED {details.salaryDues}</div>
                             <div className="p-2 border rounded"><span className="block text-xs text-gray-500">Other Dues</span>AED {details.otherDues}</div>
                             <div className="p-2 border rounded"><span className="block text-xs text-red-500">Deductions</span>AED {details.deductions}</div>
                             <div className="p-2 border rounded bg-green-50"><span className="block text-xs text-green-700 font-bold">Net Pay</span>AED {(details.gratuity + details.leaveEncashment + details.salaryDues + details.otherDues - details.deductions).toLocaleString()}</div>
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
                                {details.documents.map((doc, idx) => (
                                    <li key={idx} className="flex justify-between items-center p-2 border rounded hover:bg-gray-50">
                                        <span className="text-sm text-gray-700 truncate max-w-[300px] flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-blue-500"/> {doc.name}
                                        </span>
                                        <button onClick={() => setPreviewDoc(doc.data)} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded font-medium hover:bg-blue-100">
                                            View
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-400 italic">No documents attached.</p>
                        )}
                    </div>
                </div>
            </div>
            {previewDoc && <DocumentPreviewModal isOpen={true} onClose={() => setPreviewDoc(null)} attachment={previewDoc} />}
        </div>
    );
}

const AboutView = ({ currentUser }: { currentUser: SystemUser }) => {
    const [data, setData] = useState<AboutData>(getAboutData());
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<AboutData>(data);
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
                        <button 
                            onClick={() => { setFormData(data); setIsEditing(true); }} 
                            className="absolute top-4 right-4 bg-white/20 text-white p-2 rounded-full hover:bg-white/30 backdrop-blur-sm transition-colors"
                            title="Edit Page"
                        >
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
                                <div 
                                    className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                            )}
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                        </div>
                    </div>

                    {isEditing ? (
                        <div className="space-y-4 max-w-lg mx-auto">
                            <div className="text-center">
                                <input 
                                    className="text-3xl font-bold text-center w-full border-b border-gray-300 focus:border-indigo-500 outline-none pb-1" 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    placeholder="Your Name"
                                />
                                <input 
                                    className="text-indigo-600 font-medium text-center w-full mt-2 border-b border-gray-300 focus:border-indigo-500 outline-none pb-1" 
                                    value={formData.title} 
                                    onChange={e => setFormData({...formData, title: e.target.value})}
                                    placeholder="Your Title"
                                />
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-lg border">
                                <label className="text-xs text-gray-500 uppercase font-bold">Bio / Description</label>
                                <textarea 
                                    className="w-full bg-transparent border-b border-gray-300 focus:border-indigo-500 outline-none mt-1 min-h-[100px]"
                                    value={formData.bio} 
                                    onChange={e => setFormData({...formData, bio: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-500 uppercase font-bold">Email</label>
                                    <input 
                                        className="w-full border p-2 rounded mt-1"
                                        value={formData.email}
                                        onChange={e => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 uppercase font-bold">Contact Info</label>
                                    <input 
                                        className="w-full border p-2 rounded mt-1"
                                        value={formData.contactInfo}
                                        onChange={e => setFormData({...formData, contactInfo: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-center gap-4 mt-6">
                                <button onClick={() => setIsEditing(false)} className="px-6 py-2 rounded-full border text-gray-600 hover:bg-gray-50">Cancel</button>
                                <button onClick={handleSave} className="px-6 py-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700">Save Changes</button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center max-w-2xl mx-auto">
                            <h1 className="text-3xl font-bold text-gray-900">{data.name}</h1>
                            <p className="text-indigo-600 font-medium mt-1">{data.title}</p>
                            
                            <div className="my-8 text-gray-600 leading-relaxed text-lg">
                                {data.bio}
                            </div>

                            <div className="flex justify-center gap-8 text-sm text-gray-500 border-t pt-6">
                                <div>
                                    <span className="block font-bold text-gray-700">Email</span>
                                    {data.email}
                                </div>
                                <div>
                                    <span className="block font-bold text-gray-700">Contact</span>
                                    {data.contactInfo}
                                </div>
                            </div>
                        </div>
                    )}

                    {!isCreator && !isEditing && (
                        <div className="mt-12 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                            <p className="text-sm text-yellow-800 flex items-center justify-center gap-2">
                                <Lock className="w-4 h-4" />
                                The About page is managed by the creator and cannot be edited or removed by users.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ... (ManageCompaniesModal, DocumentPreviewModal, AttendanceActionModal, BulkImportModal, EmployeeImportModal, EditEmployeeModal, OnboardingWizard, OffboardingWizard, RehireModal, LeaveRequestModal, HolidayManagementModal, PayslipModal, ReportsView remain unchanged)

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
  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-4xl h-[80vh] rounded-xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h3 className="font-bold">Document Preview</h3>
          <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500 hover:text-gray-800"/></button>
        </div>
        <div className="flex-1 bg-gray-200 flex items-center justify-center overflow-auto p-4">
          {attachment.startsWith('data:image') ? (
             <img src={attachment} alt="Preview" className="max-w-full max-h-full object-contain shadow-lg rounded" />
          ) : (
             <iframe src={attachment} className="w-full h-full bg-white shadow-lg rounded" title="Preview" />
          )}
        </div>
      </div>
    </div>
  );
};

const AttendanceActionModal = ({ isOpen, onClose, onSave, employeeName, date, currentStatus, currentOt, currentAttachment, onPreview, isOtEligible }: any) => {
    const [status, setStatus] = useState(currentStatus);
    const [ot, setOt] = useState(currentOt);
    const [file, setFile] = useState<File | null>(null);

    useEffect(() => {
        setStatus(currentStatus);
        setOt(currentOt);
        setFile(null);
    }, [isOpen, currentStatus, currentOt]);

    const handleSave = async () => {
        let attachmentStr = currentAttachment;
        if (file) {
            attachmentStr = await readFileAsBase64(file);
        }
        onSave(status, ot, attachmentStr);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
                <h3 className="font-bold text-lg mb-1">Update Attendance</h3>
                <p className="text-sm text-gray-500 mb-4">{employeeName} - {date.toLocaleDateString()}</p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full p-2 border rounded">
                            {Object.entries(ATTENDANCE_LEGEND).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                            ))}
                        </select>
                    </div>

                    {isOtEligible && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Overtime (Hours)</label>
                            <input type="number" min="0" max="12" value={ot} onChange={(e) => setOt(Number(e.target.value))} className="w-full p-2 border rounded"/>
                        </div>
                    )}

                    {isOtEligible && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">OT Proof (Document/Image)</label>
                            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-sm text-gray-500 mb-2"/>
                            {currentAttachment && (
                                <div className="flex items-center justify-between bg-gray-50 p-2 rounded border">
                                    <span className="text-xs text-gray-600 flex items-center gap-1"><Paperclip className="w-3 h-3"/> File Attached</span>
                                    <button type="button" onClick={() => onPreview(currentAttachment)} className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"><Eye className="w-3 h-3"/> View</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Save</button>
                </div>
            </div>
        </div>
    )
};

const BulkImportModal = ({ isOpen, onClose, onImport }: any) => {
    const [csv, setCsv] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const downloadSample = () => {
        const headers = "EmployeeCode,Date,Status,Overtime";
        // Use DD/MM/YYYY format for sample
        const row1 = "10001,01/12/2025,P,2";
        const row2 = "10002,01/12/2025,A,0";
        const content = `${headers}\n${row1}\n${row2}`;
        const blob = new Blob([content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'attendance_sample.csv';
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
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-6 flex flex-col h-[80vh]">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">Bulk Import Attendance</h3>
                    <button onClick={downloadSample} className="flex items-center gap-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded border border-blue-200">
                        <Download className="w-3 h-3"/> Download Sample CSV
                    </button>
                </div>

                <div className="mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex flex-col items-center justify-center text-center">
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 font-medium mb-1">Upload CSV or Excel File</p>
                    <p className="text-xs text-gray-500 mb-3">Supported formats: .csv, .xlsx, .xls</p>
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={onFileChange}
                        accept=".csv, .xlsx, .xls"
                        className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                </div>

                <p className="text-xs font-bold mb-1">Or paste CSV data here:</p>
                <textarea 
                    value={csv} 
                    onChange={e => setCsv(e.target.value)} 
                    placeholder="Format: EmployeeCode, Date(DD/MM/YYYY), Status(P/A/etc), OT(number)"
                    className="flex-1 w-full p-4 border rounded font-mono text-xs"
                />
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                    <button onClick={() => onImport(csv)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Import</button>
                </div>
            </div>
        </div>
    )
};

const EmployeeImportModal = ({ isOpen, onClose, onImport }: any) => {
    const [csv, setCsv] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const downloadSample = () => {
        const headers = "Code,Name,Designation,Department,Company,JoiningDate,Type,Status,Team,Location,Basic,Housing,Transport,Other,EmiratesID,EIDExpiry,Passport,PassExpiry,LabourCard,LCExpiry,VacationDate";
        const row1 = "EMP001,John Doe,Manager,IT,MyCompany,2025-01-01,Staff,Active,Office Staff,Dubai,5000,2000,1000,500,784-1234-1234567-1,2026-01-01,N123456,2030-01-01,12345678,2026-05-01,2025-12-15";
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
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-6 flex flex-col h-[80vh]">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">Bulk Import Employees</h3>
                    <button onClick={downloadSample} className="flex items-center gap-2 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded border border-blue-200">
                        <Download className="w-3 h-3"/> Download Sample CSV
                    </button>
                </div>
                
                <div className="mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex flex-col items-center justify-center text-center">
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 font-medium mb-1">Upload CSV or Excel File</p>
                    <p className="text-xs text-gray-500 mb-3">Supported formats: .csv, .xlsx, .xls</p>
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={onFileChange}
                        accept=".csv, .xlsx, .xls"
                        className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                </div>

                <p className="text-xs text-gray-500 mb-2">Header: Code, Name, Designation, Department, Company, JoiningDate, Type, Status, Team, Location, Basic, Housing, Transport, Other, EID, EIDExp, Passport, PassExp, Labour, LabourExp, VacationDate</p>
                <textarea 
                    value={csv} 
                    onChange={e => setCsv(e.target.value)} 
                    className="flex-1 w-full p-4 border rounded font-mono text-xs"
                    placeholder="Paste CSV data here..."
                />
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                    <button onClick={() => onImport(csv)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Import</button>
                </div>
            </div>
        </div>
    )
};

const EditEmployeeModal = ({ employee, companies, onClose, onSave }: any) => {
    const [formData, setFormData] = useState<Employee>({...employee});
    
    const handleChange = (field: string, value: any) => {
        setFormData(prev => ({...prev, [field]: value}));
    }
    
    const handleSalaryChange = (field: string, value: number) => {
        setFormData(prev => ({...prev, salary: {...prev.salary, [field]: value}}));
    }

    const handleDocChange = (field: string, value: string) => {
        setFormData(prev => ({...prev, documents: {...prev.documents, [field]: value}}));
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl p-6 my-8">
                <div className="flex justify-between mb-6">
                    <h3 className="font-bold text-lg">Edit Employee: {employee.name}</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500"/></button>
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
                <div className="grid grid-cols-4 gap-4 mb-4">
                    <input type="number" className="p-2 border rounded" placeholder="Basic" value={formData.salary.basic} onChange={e => handleSalaryChange('basic', parseFloat(e.target.value))} />
                    <input type="number" className="p-2 border rounded" placeholder="Housing" value={formData.salary.housing} onChange={e => handleSalaryChange('housing', parseFloat(e.target.value))} />
                    <input type="number" className="p-2 border rounded" placeholder="Transport" value={formData.salary.transport} onChange={e => handleSalaryChange('transport', parseFloat(e.target.value))} />
                    <input type="number" className="p-2 border rounded" placeholder="Other" value={formData.salary.other} onChange={e => handleSalaryChange('other', parseFloat(e.target.value))} />
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
    )
};

const OnboardingWizard = ({ companies, onClose, onComplete }: any) => {
    const [step, setStep] = useState(1);
    const [rehireMode, setRehireMode] = useState(false);
    const [data, setData] = useState<Partial<Employee>>({
        type: StaffType.WORKER,
        status: 'Active',
        salary: { basic: 0, housing: 0, transport: 0, other: 0 },
        leaveBalance: 0,
        active: true,
        joiningDate: new Date().toISOString().split('T')[0],
        documents: {}
    });

    const checkCode = (e: React.FocusEvent<HTMLInputElement>) => {
        const code = e.target.value;
        if (!code) return;
        
        const all = getEmployees();
        const existing = all.find(emp => emp.code === code);

        if (existing) {
            if (existing.status === 'Inactive') {
                if (window.confirm(`Employee "${existing.name}" (Inactive) found with this code. Do you want to re-hire and update details?`)) {
                    setRehireMode(true);
                    setData({
                        ...existing,
                        status: 'Active',
                        active: true,
                        joiningDate: new Date().toISOString().split('T')[0], // Reset Joining Date for new cycle
                        rejoiningDate: new Date().toISOString().split('T')[0],
                        rejoiningReason: '',
                        offboardingDetails: undefined // Clear offboarding
                    });
                } else {
                    // User chose not to rehire, clear code to prevent dup
                     setData(prev => ({...prev, code: ''}));
                }
            } else {
                alert(`Employee Code ${code} is already active! Please check the directory.`);
                setData(prev => ({...prev, code: ''}));
            }
        } else {
            setRehireMode(false);
        }
    };

    const handleSave = () => {
        if (!data.name || !data.code) return alert("Name and Code are required");
        
        let employeeToSave = { ...data } as Employee;

        if (!rehireMode) {
             // Generate ID for new employee if not present
             if (!employeeToSave.id) {
                 employeeToSave.id = Math.random().toString(36).substr(2, 9);
             }
             // Ensure joining date is set
             if(!employeeToSave.joiningDate) employeeToSave.joiningDate = new Date().toISOString().split('T')[0];
        } else {
            // Rehire mode validations
            if (!employeeToSave.rejoiningReason) return alert("Please enter a reason for re-joining in Step 1.");
            employeeToSave.joiningDate = employeeToSave.rejoiningDate || new Date().toISOString().split('T')[0];
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
                            {[1,2,3,4].map(i => (
                                <div key={i} className={`h-1 flex-1 rounded-full ${step >= i ? 'bg-indigo-600' : 'bg-gray-200'}`}/>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Step {step} of 4</p>
                    </div>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-600"/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-1">
                    {step === 1 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-gray-700">Personal Info</h4>
                            
                            <div className="relative">
                                <input 
                                    className={`w-full p-2 border rounded ${rehireMode ? 'bg-green-50 border-green-300' : ''}`} 
                                    placeholder="Employee Code (ID)" 
                                    value={data.code || ''} 
                                    onChange={e => setData({...data, code: e.target.value})} 
                                    onBlur={checkCode}
                                    disabled={rehireMode} // Lock code in rehire mode
                                />
                                {rehireMode && <span className="absolute right-3 top-2.5 text-xs font-bold text-green-600">Existing Record Found</span>}
                            </div>

                            {rehireMode && (
                                <div className="bg-green-50 p-3 rounded border border-green-200">
                                    <label className="block text-xs font-bold text-green-800 mb-1">Reason for Re-joining</label>
                                    <textarea 
                                        className="w-full p-2 border rounded text-sm" 
                                        placeholder="Why is the employee joining again? (e.g. New Contract)"
                                        value={data.rejoiningReason || ''}
                                        onChange={e => setData({...data, rejoiningReason: e.target.value})}
                                    />
                                </div>
                            )}

                            <input className="w-full p-2 border rounded" placeholder="Full Name" value={data.name || ''} onChange={e => setData({...data, name: e.target.value})} />
                            <select className="w-full p-2 border rounded" value={data.company || ''} onChange={e => setData({...data, company: e.target.value})}>
                                <option value="">Select Company</option>
                                {companies.map((c: string) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-500">{rehireMode ? 'New Joining Date' : 'Joining Date'}</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-2 border rounded" 
                                        value={rehireMode ? (data.rejoiningDate || '') : (data.joiningDate || '')} 
                                        onChange={e => rehireMode ? setData({...data, rejoiningDate: e.target.value}) : setData({...data, joiningDate: e.target.value})} 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-gray-700">Job Details</h4>
                            <input className="w-full p-2 border rounded" placeholder="Designation" value={data.designation || ''} onChange={e => setData({...data, designation: e.target.value})} />
                            <input className="w-full p-2 border rounded" placeholder="Department" value={data.department || ''} onChange={e => setData({...data, department: e.target.value})} />
                            <select className="w-full p-2 border rounded" value={data.team || 'Internal Team'} onChange={e => setData({...data, team: e.target.value as any})}>
                                <option value="Internal Team">Internal Team</option>
                                <option value="External Team">External Team</option>
                                <option value="Office Staff">Office Staff</option>
                            </select>
                            <select className="w-full p-2 border rounded" value={data.type || StaffType.WORKER} onChange={e => setData({...data, type: e.target.value as any})}>
                                <option value={StaffType.WORKER}>Worker</option>
                                <option value={StaffType.OFFICE}>Office Staff</option>
                            </select>
                            <input className="w-full p-2 border rounded" placeholder="Work Location" value={data.workLocation || ''} onChange={e => setData({...data, workLocation: e.target.value})} />
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-gray-700">Salary & Documents</h4>
                            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded mb-4">
                                <input type="number" className="p-2 border rounded" placeholder="Basic" value={data.salary?.basic} onChange={e => setData({...data, salary: {...data.salary!, basic: parseFloat(e.target.value)}})} />
                                <input type="number" className="p-2 border rounded" placeholder="Housing" value={data.salary?.housing} onChange={e => setData({...data, salary: {...data.salary!, housing: parseFloat(e.target.value)}})} />
                                <input type="number" className="p-2 border rounded" placeholder="Transport" value={data.salary?.transport} onChange={e => setData({...data, salary: {...data.salary!, transport: parseFloat(e.target.value)}})} />
                                <input type="number" className="p-2 border rounded" placeholder="Other" value={data.salary?.other} onChange={e => setData({...data, salary: {...data.salary!, other: parseFloat(e.target.value)}})} />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <input className="p-2 border rounded" placeholder="Emirates ID" value={data.documents?.emiratesId || ''} onChange={e => setData({...data, documents: {...data.documents, emiratesId: e.target.value}})} />
                                <div><label className="text-xs text-gray-500">EID Expiry</label><input type="date" className="w-full p-2 border rounded" value={data.documents?.emiratesIdExpiry || ''} onChange={e => setData({...data, documents: {...data.documents, emiratesIdExpiry: e.target.value}})} /></div>
                                <input className="p-2 border rounded" placeholder="Passport No" value={data.documents?.passportNumber || ''} onChange={e => setData({...data, documents: {...data.documents, passportNumber: e.target.value}})} />
                                <div><label className="text-xs text-gray-500">Passport Expiry</label><input type="date" className="w-full p-2 border rounded" value={data.documents?.passportExpiry || ''} onChange={e => setData({...data, documents: {...data.documents, passportExpiry: e.target.value}})} /></div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-gray-700">Review Details</h4>
                            {rehireMode && <div className="bg-green-100 text-green-800 p-2 rounded text-center font-bold text-xs mb-2">RE-HIRING EXISTING EMPLOYEE</div>}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm bg-gray-50 p-4 rounded border">
                                <span className="text-gray-500">Code:</span><span className="font-mono font-bold">{data.code}</span>
                                <span className="text-gray-500">Name:</span><span className="font-bold">{data.name}</span>
                                <span className="text-gray-500">Company:</span><span>{data.company}</span>
                                <span className="text-gray-500">Designation:</span><span>{data.designation}</span>
                                <span className="text-gray-500">Team:</span><span>{data.team}</span>
                                <span className="text-gray-500">Total Salary:</span><span className="font-bold text-green-600">
                                    {((data.salary?.basic||0) + (data.salary?.housing||0) + (data.salary?.transport||0) + (data.salary?.other||0)).toLocaleString()}
                                </span>
                                {rehireMode && (
                                    <>
                                        <span className="text-gray-500">Re-joining:</span><span>{data.rejoiningDate}</span>
                                        <span className="text-gray-500">Reason:</span><span>{data.rejoiningReason}</span>
                                    </>
                                )}
                            </div>
                            <p className="text-center text-gray-500 text-sm mt-4">Please confirm all details are correct before finalizing.</p>
                        </div>
                    )}
                </div>

                <div className="flex justify-between mt-6 pt-4 border-t">
                    {step > 1 ? <button onClick={() => setStep(step - 1)} className="px-4 py-2 border rounded hover:bg-gray-50">Back</button> : <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>}
                    {step < 4 ? <button onClick={() => setStep(step + 1)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Next</button> : <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"><CheckCircle className="w-4 h-4"/> {rehireMode ? 'Confirm Re-hire' : 'Complete Onboarding'}</button>}
                </div>
            </div>
        </div>
    )
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
        notes: '',
        documents: []
    });

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

    const handleOffboard = () => {
        offboardEmployee(employee.id, details);
        onComplete();
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-6 my-8">
                 <h3 className="font-bold text-lg mb-4 text-red-600">Offboard Employee: {employee.name}</h3>
                 
                 <div className="space-y-4">
                     <select className="w-full p-2 border rounded" value={details.type} onChange={e => setDetails({...details, type: e.target.value as any})}>
                         <option value="Resignation">Resignation</option>
                         <option value="Termination">Termination</option>
                         <option value="End of Contract">End of Contract</option>
                         <option value="Absconding">Absconding</option>
                     </select>
                     <input type="date" className="w-full p-2 border rounded" value={details.exitDate} onChange={e => setDetails({...details, exitDate: e.target.value})} />
                     <textarea className="w-full p-2 border rounded" placeholder="Reason" value={details.reason} onChange={e => setDetails({...details, reason: e.target.value})} />
                     
                     <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded">
                         <div><label className="text-xs">Gratuity</label><input type="number" className="w-full p-1 border" value={details.gratuity} onChange={e => setDetails({...details, gratuity: parseFloat(e.target.value)})} /></div>
                         <div><label className="text-xs">Leave Encashment</label><input type="number" className="w-full p-1 border" value={details.leaveEncashment} onChange={e => setDetails({...details, leaveEncashment: parseFloat(e.target.value)})} /></div>
                         <div><label className="text-xs">Salary Dues</label><input type="number" className="w-full p-1 border" value={details.salaryDues} onChange={e => setDetails({...details, salaryDues: parseFloat(e.target.value)})} /></div>
                         <div><label className="text-xs">Other Dues</label><input type="number" className="w-full p-1 border" value={details.otherDues} onChange={e => setDetails({...details, otherDues: parseFloat(e.target.value)})} /></div>
                         <div><label className="text-xs">Deductions</label><input type="number" className="w-full p-1 border" value={details.deductions} onChange={e => setDetails({...details, deductions: parseFloat(e.target.value)})} /></div>
                     </div>

                     {/* Document Upload */}
                     <div className="border p-3 rounded-lg bg-blue-50">
                        <label className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-2">
                            <Upload className="w-4 h-4" /> Upload Documents (e.g. Resignation Letter, Clearance)
                        </label>
                        <input type="file" onChange={handleFileChange} className="text-xs w-full mb-2" />
                        <ul className="space-y-1">
                            {details.documents?.map((doc, idx) => (
                                <li key={idx} className="flex justify-between items-center text-xs bg-white p-1 rounded border">
                                    <span className="truncate max-w-[200px]">{doc.name}</span>
                                    <button onClick={() => removeFile(idx)} className="text-red-500 hover:text-red-700"><XCircle className="w-3 h-3"/></button>
                                </li>
                            ))}
                        </ul>
                     </div>
                     
                     <div className="flex items-center gap-2">
                         <input type="checkbox" checked={details.assetsReturned} onChange={e => setDetails({...details, assetsReturned: e.target.checked})} />
                         <label>All Assets Returned</label>
                     </div>
                 </div>

                 <div className="flex justify-end gap-2 mt-6">
                     <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                     <button onClick={handleOffboard} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Confirm Offboarding</button>
                 </div>
            </div>
        </div>
    )
};

const RehireModal = ({ employee, onClose, onConfirm }: any) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [reason, setReason] = useState('');

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6 animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <RefreshCcw className="w-5 h-5 text-green-600"/> Re-hire Employee
                    </h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-600"/></button>
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
                        <input
                            type="date"
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Re-hiring <span className="text-red-500">*</span></label>
                        <textarea
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 min-h-[100px] text-sm"
                            placeholder="Please explain why the employee is re-joining (e.g., New Contract, Returned from Leave)..."
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(employee.id, date, reason)}
                        disabled={!reason.trim()}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <UserCheck className="w-4 h-4"/> Confirm Re-hire
                    </button>
                </div>
            </div>
        </div>
    )
};

const LeaveRequestModal = ({ employees, onClose, onSave }: any) => {
    const [req, setReq] = useState<Partial<LeaveRequest>>({
        type: AttendanceStatus.ANNUAL_LEAVE,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        reason: ''
    });

    const handleSubmit = () => {
        if (!req.employeeId || !req.reason) return alert("Missing fields");
        saveLeaveRequest(req as any);
        onSave();
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-lg max-w-md w-full">
                <h3 className="font-bold mb-4">New Leave Request</h3>
                <div className="space-y-3">
                    <select className="w-full p-2 border rounded" onChange={e => setReq({...req, employeeId: e.target.value})}>
                        <option value="">Select Employee</option>
                        {employees.map((e: Employee) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <select className="w-full p-2 border rounded" value={req.type} onChange={e => setReq({...req, type: e.target.value as any})}>
                        <option value={AttendanceStatus.ANNUAL_LEAVE}>Annual Leave</option>
                        <option value={AttendanceStatus.SICK_LEAVE}>Sick Leave</option>
                        <option value={AttendanceStatus.UNPAID_LEAVE}>Unpaid Leave</option>
                        <option value={AttendanceStatus.EMERGENCY_LEAVE}>Emergency Leave</option>
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                        <input type="date" className="p-2 border rounded" value={req.startDate} onChange={e => setReq({...req, startDate: e.target.value})} />
                        <input type="date" className="p-2 border rounded" value={req.endDate} onChange={e => setReq({...req, endDate: e.target.value})} />
                    </div>
                    <textarea className="w-full p-2 border rounded" placeholder="Reason" value={req.reason} onChange={e => setReq({...req, reason: e.target.value})} />
                </div>
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-indigo-600 text-white rounded">Submit</button>
                </div>
            </div>
        </div>
    )
};

const HolidayManagementModal = ({ isOpen, onClose }: any) => {
    const [holidays, setHolidays] = useState<PublicHoliday[]>(getPublicHolidays());
    const [newH, setNewH] = useState({ date: '', name: '' });

    if(!isOpen) return null;

    const add = () => {
        if(newH.date && newH.name) {
            const updated = savePublicHoliday({ id: Date.now().toString(), ...newH });
            setHolidays(updated);
            setNewH({ date: '', name: '' });
        }
    };

    const del = (id: string) => {
        setHolidays(deletePublicHoliday(id));
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white p-6 rounded-lg max-w-md w-full">
                 <h3 className="font-bold mb-4">Manage Public Holidays</h3>
                 <div className="flex gap-2 mb-4">
                     <input type="date" className="border p-2 rounded" value={newH.date} onChange={e => setNewH({...newH, date: e.target.value})} />
                     <input type="text" className="border p-2 rounded flex-1" placeholder="Holiday Name" value={newH.name} onChange={e => setNewH({...newH, name: e.target.value})} />
                     <button onClick={add} className="bg-indigo-600 text-white px-3 rounded">Add</button>
                 </div>
                 <ul className="space-y-2">
                     {holidays.map(h => (
                         <li key={h.id} className="flex justify-between bg-gray-50 p-2 rounded">
                             <span>{h.date} - {h.name}</span>
                             <button onClick={() => del(h.id)} className="text-red-500"><Trash2 className="w-4 h-4"/></button>
                         </li>
                     ))}
                 </ul>
                 <button onClick={onClose} className="mt-4 w-full border p-2 rounded text-gray-600">Close</button>
             </div>
        </div>
    )
};

const PayslipModal = ({ employee, month, year, onClose }: any) => {
    // Basic logic to recalculate details for display
    const start = new Date(year, month, 1).toISOString().split('T')[0];
    const end = new Date(year, month + 1, 0).toISOString().split('T')[0];
    const recs = getAttendanceRange(start, end).filter(r => r.employeeId === employee.id);
    
    const { basic, housing, transport, other } = employee.salary;
    const gross = basic + housing + transport + other;
    const absent = recs.filter(r => r.status === AttendanceStatus.ABSENT || r.status === AttendanceStatus.UNPAID_LEAVE).length;
    const deduction = Math.round((gross / 30) * absent);
    
    const { overtimePay, holidayPay, weekOffPay, totalOTHours } = calculateAdditionalEarnings(recs, employee.team);
    const additions = overtimePay + holidayPay + weekOffPay;
    const net = gross - deduction + additions;

    const [scale, setScale] = useState(1);

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col h-screen w-screen print:bg-white print:relative print:h-auto print:w-auto">
             {/* Toolbar - Hidden on Print */}
             <div className="bg-gray-900 text-white p-4 flex justify-between items-center print:hidden z-50">
                 <h2 className="font-bold">Payslip Preview</h2>
                 <div className="flex gap-4 items-center">
                     <div className="flex bg-gray-800 rounded p-1">
                        <button onClick={() => setScale(Math.max(0.5, scale - 0.1))} className="p-2 hover:bg-gray-700 rounded"><ZoomOut className="w-4 h-4"/></button>
                        <span className="px-3 py-2 text-sm min-w-[60px] text-center">{Math.round(scale * 100)}%</span>
                        <button onClick={() => setScale(Math.min(2, scale + 0.1))} className="p-2 hover:bg-gray-700 rounded"><ZoomIn className="w-4 h-4"/></button>
                        <button onClick={() => setScale(1)} className="p-2 hover:bg-gray-700 rounded ml-2"><RotateCcw className="w-4 h-4"/></button>
                     </div>
                     <button onClick={() => window.print()} className="bg-indigo-600 px-4 py-2 rounded hover:bg-indigo-700 flex items-center gap-2"><Printer className="w-4 h-4"/> Print</button>
                     <button onClick={onClose} className="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600">Close</button>
                 </div>
             </div>

             {/* Scrollable Preview Area */}
             <div className="flex-1 overflow-auto bg-gray-500 flex justify-center p-8 print:p-0 print:overflow-visible print:bg-white">
                 <div 
                    className="bg-white shadow-2xl w-[210mm] min-h-[297mm] p-12 origin-top transition-transform duration-200 print:transform-none print:shadow-none print:w-full print:h-auto print:m-0"
                    style={{ transform: `scale(${scale})` }}
                 >
                     <div className="text-center mb-8 border-b pb-4">
                         <h1 className="text-2xl font-bold uppercase text-gray-900">{employee.company}</h1>
                         <p className="text-sm text-gray-500">Payslip for {new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                     </div>

                     <div className="grid grid-cols-2 gap-8 mb-8">
                         <div>
                             <p className="text-xs text-gray-500 uppercase">Employee Name</p>
                             <p className="font-bold">{employee.name}</p>
                             <p className="text-xs text-gray-500 uppercase mt-2">Designation</p>
                             <p className="font-bold">{employee.designation}</p>
                         </div>
                         <div className="text-right">
                             <p className="text-xs text-gray-500 uppercase">Employee Code</p>
                             <p className="font-bold">{employee.code}</p>
                             <p className="text-xs text-gray-500 uppercase mt-2">Bank Account</p>
                             <p className="font-bold">{employee.iban || 'Cash'}</p>
                         </div>
                     </div>

                     <div className="border rounded-lg overflow-hidden mb-6">
                         <table className="w-full text-sm">
                             <thead className="bg-gray-100 border-b">
                                 <tr>
                                     <th className="p-3 text-left">Earnings</th>
                                     <th className="p-3 text-right">Amount (AED)</th>
                                     <th className="p-3 text-left border-l">Deductions</th>
                                     <th className="p-3 text-right">Amount (AED)</th>
                                 </tr>
                             </thead>
                             <tbody>
                                 <tr>
                                     <td className="p-2">Basic Salary</td>
                                     <td className="p-2 text-right">{basic.toLocaleString()}</td>
                                     <td className="p-2 border-l">Absent Deduction ({absent} days)</td>
                                     <td className="p-2 text-right text-red-600">{deduction.toLocaleString()}</td>
                                 </tr>
                                 <tr>
                                     <td className="p-2">Housing Allowance</td>
                                     <td className="p-2 text-right">{housing.toLocaleString()}</td>
                                     <td className="p-2 border-l"></td>
                                     <td className="p-2 text-right"></td>
                                 </tr>
                                 <tr>
                                     <td className="p-2">Transport Allowance</td>
                                     <td className="p-2 text-right">{transport.toLocaleString()}</td>
                                     <td className="p-2 border-l"></td>
                                     <td className="p-2 text-right"></td>
                                 </tr>
                                 <tr>
                                     <td className="p-2">Other Allowance</td>
                                     <td className="p-2 text-right">{other.toLocaleString()}</td>
                                     <td className="p-2 border-l"></td>
                                     <td className="p-2 text-right"></td>
                                 </tr>
                                 {additions > 0 && (
                                    <tr>
                                        <td className="p-2">
                                            Overtime & Additions 
                                            <span className="block text-[10px] text-gray-500">
                                                (OT: {totalOTHours} hrs, Holidays: {holidayPay > 0 ? 'Yes' : 'No'}, W/O: {weekOffPay > 0 ? 'Yes' : 'No'})
                                            </span>
                                        </td>
                                        <td className="p-2 text-right text-blue-600">{additions.toLocaleString()}</td>
                                        <td className="p-2 border-l"></td>
                                        <td className="p-2 text-right"></td>
                                    </tr>
                                 )}
                             </tbody>
                             <tfoot className="bg-gray-50 font-bold border-t">
                                 <tr>
                                     <td className="p-3">Total Earnings</td>
                                     <td className="p-3 text-right">{(gross + additions).toLocaleString()}</td>
                                     <td className="p-3 border-l">Total Deductions</td>
                                     <td className="p-3 text-right text-red-600">{deduction.toLocaleString()}</td>
                                 </tr>
                             </tfoot>
                         </table>
                     </div>

                     <div className="flex justify-between items-center p-4 bg-indigo-50 rounded-lg mb-8">
                         <span className="text-lg font-bold text-indigo-900">Net Salary Payable</span>
                         <span className="text-2xl font-bold text-indigo-600">AED {net.toLocaleString()}</span>
                     </div>

                     <div className="flex justify-between mt-12 text-xs text-gray-400 print:mt-24">
                         <div className="text-center w-32 border-t pt-2">Employee Signature</div>
                         <div className="text-center w-32 border-t pt-2">Manager Signature</div>
                     </div>
                 </div>
             </div>
        </div>
    )
}

const ReportsView = ({ employees, attendance }: { employees: Employee[], attendance: AttendanceRecord[] }) => {
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportType, setReportType] = useState<'Summary' | 'Detailed'>('Summary');
    const [filteredData, setFilteredData] = useState<any[]>([]);
    const [totals, setTotals] = useState({ hours: 0, cost: 0, ot: 0, absent: 0 });

    useEffect(() => {
        // Filter records by date
        const relevantRecords = attendance.filter(r => r.date >= startDate && r.date <= endDate);
        
        // Group by Employee
        const reportData = employees.map(emp => {
            const empRecs = relevantRecords.filter(r => r.employeeId === emp.id);
            const present = empRecs.filter(r => r.status === AttendanceStatus.PRESENT).length;
            const absent = empRecs.filter(r => r.status === AttendanceStatus.ABSENT || r.status === AttendanceStatus.UNPAID_LEAVE).length;
            const leaves = empRecs.filter(r => r.status === AttendanceStatus.SICK_LEAVE || r.status === AttendanceStatus.ANNUAL_LEAVE).length;
            const otHours = empRecs.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
            
            const dailySalary = (emp.salary.basic + emp.salary.housing + emp.salary.transport + emp.salary.other) / 30;
            const otCost = emp.team === 'Office Staff' ? 0 : otHours * 5; // 5 AED per hour OT
            const salaryCost = Math.round(dailySalary * (present + leaves)); // Basic calculation
            const totalCost = salaryCost + otCost;

            return {
                name: emp.name,
                company: emp.company,
                team: emp.team,
                present,
                absent,
                leaves,
                otHours,
                totalCost
            };
        }).filter(d => d.present > 0 || d.absent > 0 || d.leaves > 0); // Only show active in period

        setFilteredData(reportData);
        
        setTotals({
            hours: reportData.reduce((sum, d) => sum + (d.present * 8), 0), // Approx
            cost: reportData.reduce((sum, d) => sum + d.totalCost, 0),
            ot: reportData.reduce((sum, d) => sum + d.otHours, 0),
            absent: reportData.reduce((sum, d) => sum + d.absent, 0)
        });

    }, [startDate, endDate, employees, attendance]);

    return (
        <div className="w-full space-y-6 p-6">
            <div className="flex justify-between items-end print:hidden">
                <div className="flex gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">From</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border p-2 rounded bg-white" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">To</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border p-2 rounded bg-white" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Type</label>
                        <select value={reportType} onChange={e => setReportType(e.target.value as any)} className="border p-2 rounded bg-white">
                            <option value="Summary">Summary Report</option>
                            <option value="Detailed">Detailed Breakdown</option>
                        </select>
                    </div>
                </div>
                <button onClick={() => window.print()} className="bg-gray-900 text-white px-4 py-2 rounded flex items-center gap-2">
                    <Printer className="w-4 h-4"/> Print Report
                </button>
            </div>

            {/* Report Content */}
            <div className="bg-white p-8 rounded-xl shadow-sm border print:shadow-none print:border-none">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">Workforce Analytics Report</h2>
                    <p className="text-gray-500 text-sm">Period: {startDate} to {endDate}</p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-4 gap-4 mb-8">
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-xs text-blue-600 uppercase font-bold">Est. Cost</p>
                        <p className="text-2xl font-bold text-blue-900">AED {totals.cost.toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                        <p className="text-xs text-green-600 uppercase font-bold">Total OT Hours</p>
                        <p className="text-2xl font-bold text-green-900">{totals.ot}</p>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                        <p className="text-xs text-orange-600 uppercase font-bold">Absent Days</p>
                        <p className="text-2xl font-bold text-orange-900">{totals.absent}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 uppercase font-bold">Employees Active</p>
                        <p className="text-2xl font-bold text-gray-900">{filteredData.length}</p>
                    </div>
                </div>

                {/* Table */}
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-700 font-bold uppercase border-b">
                        <tr>
                            <th className="p-3">Employee</th>
                            <th className="p-3">Company</th>
                            <th className="p-3 text-center">Present</th>
                            <th className="p-3 text-center">Absent</th>
                            <th className="p-3 text-center">OT (Hrs)</th>
                            <th className="p-3 text-right">Est. Cost</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredData.map((row, idx) => (
                            <tr key={idx}>
                                <td className="p-3 font-medium">{row.name}</td>
                                <td className="p-3 text-gray-500 text-xs">{row.company}</td>
                                <td className="p-3 text-center">{row.present}</td>
                                <td className="p-3 text-center text-red-500">{row.absent}</td>
                                <td className="p-3 text-center text-blue-600 font-bold">{row.otHours}</td>
                                <td className="p-3 text-right font-mono">AED {row.totalCost.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-bold border-t">
                        <tr>
                            <td className="p-3" colSpan={4}>TOTAL</td>
                            <td className="p-3 text-center text-blue-600">{totals.ot}</td>
                            <td className="p-3 text-right">AED {totals.cost.toLocaleString()}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}

// --- Main App ---

function App() {
  // State
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [companies, setCompanies] = useState<string[]>([]);
  
  // Filters
  const [selectedCompany, setSelectedCompany] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('Active');
  const [selectedTeam, setSelectedTeam] = useState('All');

  // Modals
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showOffboarding, setShowOffboarding] = useState<Employee | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showEmpImport, setShowEmpImport] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState<{
      isOpen: boolean;
      employee?: Employee;
      date?: Date;
      record?: AttendanceRecord;
  }>({ isOpen: false });
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showManageCompanies, setShowManageCompanies] = useState(false);
  const [showPayslip, setShowPayslip] = useState<Employee | null>(null);
  const [showRehire, setShowRehire] = useState<Employee | null>(null);
  const [showExEmployeeDetails, setShowExEmployeeDetails] = useState<Employee | null>(null);
  const [showHolidays, setShowHolidays] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  
  const navRef = useRef<HTMLDivElement>(null);

  // Load Data
  useEffect(() => {
    if (currentUser) {
        setEmployees(getEmployees());
        setLeaveRequests(getLeaveRequests());
        setCompanies(getCompanies());
        loadAttendanceForMonth(currentDate);
    }
  }, [currentUser, currentDate]);

  const loadAttendanceForMonth = (date: Date) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const start = new Date(y, m, 1).toISOString().split('T')[0];
    const end = new Date(y, m + 1, 0).toISOString().split('T')[0];
    setAttendance(getAttendanceRange(start, end));
  };

  const handleMonthChange = (delta: number) => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1);
    setCurrentDate(newDate);
  };

  const handleRefresh = () => {
    setEmployees(getEmployees());
    setLeaveRequests(getLeaveRequests());
    setCompanies(getCompanies());
    loadAttendanceForMonth(currentDate);
  };

  const handleDashboardFilter = (filterType: 'team' | 'company' | 'status', value: string) => {
      setActiveTab('directory');
      setSelectedTeam('All');
      setSelectedCompany('All');
      setSelectedStatus('All');

      if (filterType === 'team') setSelectedTeam(value);
      if (filterType === 'company') setSelectedCompany(value);
      if (filterType === 'status') setSelectedStatus(value);
  };

  // Filter Logic
  const filteredEmployees = employees.filter(e => {
    if (selectedCompany !== 'All' && e.company !== selectedCompany) return false;
    if (selectedStatus !== 'All' && e.status !== selectedStatus) return false;
    if (selectedTeam !== 'All' && e.team !== selectedTeam) return false;
    
    const viewMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const joining = new Date(e.joiningDate);
    if (joining > new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)) return false;

    if (e.status === 'Inactive' && e.offboardingDetails?.exitDate) {
        const exitDate = new Date(e.offboardingDetails.exitDate);
        if (exitDate < viewMonthStart) return false;
    }
    return true;
  });

  const monthDays = getMonthDays(currentDate);

  // If not logged in, show login screen
  if (!currentUser) {
      return <LoginScreen onLogin={setCurrentUser} />;
  }

  // Dashboard Stats Logic
  const activeEmployees = employees.filter(e => e.active);
  const companyStats = activeEmployees.reduce((acc, curr) => {
      acc[curr.company] = (acc[curr.company] || 0) + 1;
      return acc;
  }, {} as Record<string, number>);
  
  const teamStats = activeEmployees.reduce((acc, curr) => {
      acc[curr.team] = (acc[curr.team] || 0) + 1;
      return acc;
  }, {} as Record<string, number>);

  // Navigation Tabs based on Permissions
  const navTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: currentUser.permissions.canViewDashboard },
    { id: 'directory', label: 'Staff Directory', icon: Users, visible: currentUser.permissions.canViewDirectory },
    { id: 'offboarded', label: 'Ex-Employees', icon: History, visible: currentUser.permissions.canViewDirectory },
    { id: 'timesheet', label: 'Monthly Timesheet', icon: Calendar, visible: currentUser.permissions.canViewTimesheet },
    { id: 'leave', label: 'Leave Management', icon: FileText, visible: currentUser.permissions.canManageLeaves }, // Or view leaves
    { id: 'payroll', label: 'Payroll Register', icon: DollarSign, visible: currentUser.permissions.canViewPayroll },
    { id: 'reports', label: 'Reports', icon: BarChart3, visible: currentUser.permissions.canViewReports },
    { id: 'about', label: 'About', icon: Info, visible: true }, // Everyone can see
  ].filter(t => t.visible);

  // Force redirect if active tab is not allowed
  if (!navTabs.find(t => t.id === activeTab)) {
      if (navTabs.length > 0) setActiveTab(navTabs[0].id);
  }

  return (
    <div className="min-h-screen flex flex-col print:bg-white">
      {/* Header */}
      <header className={`bg-white shadow-sm z-10 print:hidden`}>
        <div className="w-full px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">ShiftSync</h1>
              <p className="text-xs text-gray-500">Smart Workforce Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             {/* Filters */}
             <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className="text-sm border rounded-lg px-3 py-2 bg-gray-50 max-w-[200px]">
                 <option value="All">All Companies</option>
                 {companies.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
             {currentUser.permissions.canManageSettings && (
                <button onClick={() => setShowManageCompanies(true)} className="p-2 text-gray-500 hover:bg-gray-100 rounded"><Settings className="w-4 h-4"/></button>
             )}

             <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className="text-sm border rounded-lg px-3 py-2 bg-gray-50">
                 <option value="All">All Status</option>
                 <option value="Active">Active</option>
                 <option value="Inactive">Inactive</option>
             </select>
             
             <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} className="text-sm border rounded-lg px-3 py-2 bg-gray-50">
                 <option value="All">All Teams</option>
                 <option value="Internal Team">Internal Team</option>
                 <option value="External Team">External Team</option>
                 <option value="Office Staff">Office Staff</option>
             </select>

             <div className="h-6 w-px bg-gray-300 mx-2"></div>
             <div className="flex items-center gap-2">
                 <div className="text-right hidden md:block">
                     <p className="text-sm font-bold text-gray-900">{currentUser.name}</p>
                     <p className="text-xs text-gray-500">{currentUser.role}</p>
                 </div>
                 <button onClick={() => setCurrentUser(null)} className="p-2 text-gray-500 hover:text-red-600" title="Logout">
                     <LogOut className="w-5 h-5"/>
                 </button>
             </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b print:hidden">
        <div className="w-full px-6 flex items-center overflow-x-auto">
            <div className="flex gap-6">
                {navTabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 py-4 px-2 border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id 
                        ? 'border-indigo-600 text-indigo-600 font-medium' 
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                </button>
                ))}
            </div>
        </div>
      </nav>

      <main className={`flex-1 max-w-full mx-auto px-6 py-6 w-full overflow-hidden ${showPayslip ? 'print:hidden' : ''}`}>
        {activeTab === 'dashboard' && (
             <div className="w-full space-y-6">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">Overview</h2>
                    {currentUser.permissions.canManageUsers && (
                        <button onClick={() => setShowUserManagement(true)} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-800">
                            <Shield className="w-4 h-4"/> User Management
                        </button>
                    )}
                 </div>

                 {/* Main Stats - Clickable for Drill Down */}
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <button onClick={() => handleDashboardFilter('status', 'Active')} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-all text-left">
                        <div>
                            <p className="text-gray-500 text-sm">Total Active Staff</p>
                            <h3 className="text-3xl font-bold text-indigo-600 mt-1">{employees.filter(e => e.active).length}</h3>
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-lg"><Users className="w-6 h-6 text-indigo-600"/></div>
                    </button>
                    
                    <button onClick={() => handleDashboardFilter('team', 'Internal Team')} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-all text-left">
                         <div>
                            <p className="text-gray-500 text-sm">Internal Team</p>
                            <h3 className="text-3xl font-bold text-green-600 mt-1">{teamStats['Internal Team'] || 0}</h3>
                        </div>
                         <div className="p-3 bg-green-50 rounded-lg"><Users className="w-6 h-6 text-green-600"/></div>
                    </button>

                    <button onClick={() => handleDashboardFilter('team', 'External Team')} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-all text-left">
                         <div>
                            <p className="text-gray-500 text-sm">External Team</p>
                            <h3 className="text-3xl font-bold text-orange-600 mt-1">{teamStats['External Team'] || 0}</h3>
                        </div>
                         <div className="p-3 bg-orange-50 rounded-lg"><Users className="w-6 h-6 text-orange-600"/></div>
                    </button>

                    <button onClick={() => handleDashboardFilter('team', 'Office Staff')} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-all text-left">
                         <div>
                            <p className="text-gray-500 text-sm">Office Staff</p>
                            <h3 className="text-3xl font-bold text-blue-600 mt-1">{teamStats['Office Staff'] || 0}</h3>
                        </div>
                         <div className="p-3 bg-blue-50 rounded-lg"><Briefcase className="w-6 h-6 text-blue-600"/></div>
                    </button>
                 </div>

                 {/* Company Breakdown */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                         <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Building2 className="w-5 h-5"/> Staff by Company</h3>
                         <div className="space-y-3">
                             {Object.entries(companyStats).map(([company, count]) => (
                                 <button key={company} onClick={() => handleDashboardFilter('company', company)} className="w-full flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                     <span className="text-sm font-medium text-gray-700 truncate max-w-[300px]" title={company}>{company}</span>
                                     <span className="bg-gray-200 text-gray-800 text-xs font-bold px-2 py-1 rounded-full">{count}</span>
                                 </button>
                             ))}
                         </div>
                     </div>

                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                         <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Lock className="w-5 h-5"/> My Access</h3>
                         <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-xl text-white">
                             <div className="flex items-center gap-4 mb-4">
                                 <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-xl font-bold">
                                     {currentUser.name.charAt(0)}
                                 </div>
                                 <div>
                                     <h4 className="text-lg font-bold">{currentUser.name}</h4>
                                     <p className="text-sm text-gray-300">@{currentUser.username}</p>
                                 </div>
                             </div>
                             <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-xs text-gray-400">
                                 {Object.entries(currentUser.permissions).filter(([_, v]) => v).map(([k]) => (
                                     <div key={k} className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-400" /> {k.replace('can', '')}</div>
                                 ))}
                             </div>
                         </div>
                     </div>
                 </div>
             </div>
        )}

        {activeTab === 'directory' && (
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Employee Directory</h2>
                    {currentUser.permissions.canManageEmployees && (
                        <div className="flex gap-3">
                            <button onClick={() => setShowEmpImport(true)} className="flex items-center gap-2 text-gray-600 hover:bg-gray-100 px-3 py-2 rounded text-sm font-medium">
                                <Upload className="w-4 h-4"/> Import CSV/Excel
                            </button>
                            <button onClick={() => setShowOnboarding(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2">
                                <UserPlus className="w-4 h-4"/> Onboard Employee
                            </button>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-200">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-700 uppercase font-bold border-b">
                                <tr>
                                    <th className="p-4 whitespace-nowrap">Code</th>
                                    <th className="p-4 whitespace-nowrap">Name</th>
                                    <th className="p-4 whitespace-nowrap">Company</th>
                                    <th className="p-4 whitespace-nowrap">Team</th>
                                    <th className="p-4 whitespace-nowrap">Designation</th>
                                    <th className="p-4 whitespace-nowrap">Status</th>
                                    <th className="p-4 whitespace-nowrap">Leave Bal</th>
                                    <th className="p-4 whitespace-nowrap">Emirates ID</th>
                                    <th className="p-4 whitespace-nowrap">Passport Exp</th>
                                    <th className="p-4 whitespace-nowrap">Labour Card Exp</th>
                                    <th className="p-4 whitespace-nowrap text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredEmployees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="p-4 font-mono text-gray-500">{emp.code}</td>
                                        <td className="p-4 font-medium text-gray-900">{emp.name}</td>
                                        <td className="p-4 text-gray-600 max-w-xs truncate" title={emp.company}>{emp.company}</td>
                                        <td className="p-4 text-gray-600">{emp.team}</td>
                                        <td className="p-4 text-gray-500">{emp.designation}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${emp.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {emp.status}
                                            </span>
                                        </td>
                                        <td className="p-4 font-bold text-indigo-600">{emp.leaveBalance}</td>
                                        <td className="p-4 font-mono text-xs">{emp.documents?.emiratesId || '-'} <br/> <span className={getDateColor(emp.documents?.emiratesIdExpiry)}>{emp.documents?.emiratesIdExpiry}</span></td>
                                        <td className="p-4 font-mono text-xs"><span className={getDateColor(emp.documents?.passportExpiry, 'passport')}>{emp.documents?.passportExpiry || '-'}</span></td>
                                        <td className="p-4 font-mono text-xs"><span className={getDateColor(emp.documents?.labourCardExpiry)}>{emp.documents?.labourCardExpiry || '-'}</span></td>
                                        <td className="p-4 text-right">
                                            {currentUser.permissions.canManageEmployees && (
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => setEditingEmployee(emp)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit"><Edit className="w-4 h-4"/></button>
                                                    {emp.status === 'Active' ? (
                                                        <button onClick={() => setShowOffboarding(emp)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Offboard"><UserMinus className="w-4 h-4"/></button>
                                                    ) : (
                                                        <button onClick={() => setShowRehire(emp)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Re-hire"><UserCheck className="w-4 h-4"/></button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'offboarded' && (
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-gray-800">Offboarded Employee History</h2>
                <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-200">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-bold border-b">
                            <tr>
                                <th className="p-4">Code</th>
                                <th className="p-4">Name</th>
                                <th className="p-4">Company</th>
                                <th className="p-4">Designation</th>
                                <th className="p-4">Exit Date</th>
                                <th className="p-4">Type</th>
                                <th className="p-4">Exit Reason</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {employees.filter(e => !e.active).map(emp => (
                                <tr key={emp.id} className="hover:bg-gray-50">
                                    <td className="p-4 font-mono text-gray-500">{emp.code}</td>
                                    <td className="p-4 font-medium">{emp.name}</td>
                                    <td className="p-4 text-gray-500">{emp.company}</td>
                                    <td className="p-4 text-gray-500">{emp.designation}</td>
                                    <td className="p-4 font-mono">{emp.offboardingDetails?.exitDate || '-'}</td>
                                    <td className="p-4">
                                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                                            {emp.offboardingDetails?.type || 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-500 max-w-xs truncate" title={emp.offboardingDetails?.reason}>
                                        {emp.offboardingDetails?.reason || '-'}
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button 
                                                onClick={() => setShowExEmployeeDetails(emp)} 
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" 
                                                title="View Details"
                                            >
                                                <Eye className="w-4 h-4"/>
                                            </button>
                                            {currentUser.permissions.canManageEmployees && (
                                                <button 
                                                    onClick={() => setShowRehire(emp)} 
                                                    className="bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-green-700 flex items-center gap-1"
                                                >
                                                    <RefreshCcw className="w-3 h-3"/> Re-join
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {employees.filter(e => !e.active).length === 0 && (
                                <tr><td colSpan={8} className="p-8 text-center text-gray-400">No offboarded employees found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {activeTab === 'timesheet' && (
            <div className="space-y-4 h-full flex flex-col">
                {/* Timesheet Header */}
                <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center bg-gray-100 rounded-lg p-1">
                            <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-white rounded-md shadow-sm transition-all"><ChevronLeft className="w-4 h-4"/></button>
                            <span className="px-4 font-bold text-gray-700 w-32 text-center">
                                {currentDate.toLocaleString('default', { month: 'short' })} '{currentDate.getFullYear().toString().substr(2)}
                            </span>
                            <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-white rounded-md shadow-sm transition-all"><ChevronRight className="w-4 h-4"/></button>
                        </div>
                        {currentUser.permissions.canManageSettings && (
                            <button onClick={() => setShowHolidays(true)} className="text-xs font-medium text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-200 flex items-center gap-1">
                                <Calendar className="w-3 h-3"/> Manage Holidays
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                         <div className="flex flex-wrap gap-1 max-w-xl justify-end">
                            {Object.values(ATTENDANCE_LEGEND).map((l) => (
                                <span key={l.code} className={`text-[10px] px-2 py-1 rounded ${l.color} border border-black/5`}>{l.code} - {l.label}</span>
                            ))}
                         </div>
                         {currentUser.permissions.canManageAttendance && (
                             <>
                                 <div className="h-8 w-px bg-gray-300 mx-2"></div>
                                 <button onClick={() => setShowImport(true)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Import CSV/Excel"><FileSpreadsheet className="w-5 h-5"/></button>
                                 <button onClick={exportToCSV} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Export CSV"><Download className="w-5 h-5"/></button>
                             </>
                         )}
                    </div>
                </div>

                {/* Timesheet Grid */}
                <div className="flex-1 bg-white rounded-xl shadow border border-gray-200 overflow-hidden flex flex-col">
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-xs border-collapse">
                            <thead className="bg-gray-50 text-gray-700 font-bold sticky top-0 z-10">
                                <tr>
                                    <th className="p-2 border-b border-r w-10 bg-gray-50 sticky left-0 z-20">#</th>
                                    <th className="p-2 border-b border-r w-48 text-left bg-gray-50 sticky left-10 z-20">Employee</th>
                                    <th className="p-2 border-b border-r w-16 text-center bg-gray-50">Leave Bal</th>
                                    <th className="p-2 border-b border-r w-16 text-center bg-blue-50 text-blue-700">OT</th>
                                    {monthDays.map(d => (
                                        <th key={d.getDate()} className={`p-1 border-b min-w-[32px] text-center ${d.getDay() === 0 ? 'bg-gray-100 text-red-500' : ''}`}>
                                            <div className="flex flex-col items-center">
                                                <span>{d.getDate()}</span>
                                                <span className="text-[9px] opacity-50">{d.toLocaleString('default', {weekday: 'narrow'})}</span>
                                            </div>
                                        </th>
                                    ))}
                                    <th className="p-2 border-b border-l bg-gray-50">Summary</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredEmployees.map((emp, idx) => {
                                    // Calculate stats for row
                                    const empRecs = attendance.filter(r => r.employeeId === emp.id);
                                    const present = empRecs.filter(r => r.status === AttendanceStatus.PRESENT).length;
                                    const absent = empRecs.filter(r => r.status === AttendanceStatus.ABSENT || r.status === AttendanceStatus.UNPAID_LEAVE).length;
                                    const totalOT = empRecs.reduce((acc, curr) => acc + (curr.overtimeHours || 0), 0);
                                    const totalHours = empRecs.reduce((acc, curr) => acc + (curr.hoursWorked || 0), 0);

                                    return (
                                        <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-2 border-r text-center text-gray-400 sticky left-0 bg-white">{idx + 1}</td>
                                            <td className="p-2 border-r font-medium text-gray-900 sticky left-10 bg-white">
                                                <div className="truncate w-44" title={emp.name}>{emp.name}</div>
                                                <div className="text-[10px] text-gray-400 truncate w-44">{emp.designation}</div>
                                            </td>
                                            <td className="p-2 border-r text-center font-bold text-gray-600">{emp.leaveBalance}</td>
                                            <td className="p-2 border-r text-center font-bold text-blue-600 bg-blue-50/30">{emp.team !== 'Office Staff' ? totalOT : '-'}</td>
                                            {monthDays.map(day => {
                                                const dateStr = day.toISOString().split('T')[0];
                                                const record = attendance.find(r => r.employeeId === emp.id && r.date === dateStr);
                                                const status = record?.status;
                                                const legend = status ? ATTENDANCE_LEGEND[status] : null;
                                                const isSunday = day.getDay() === 0;
                                                
                                                return (
                                                    <td 
                                                        key={day.getDate()} 
                                                        onClick={() => {
                                                            if (currentUser.permissions.canManageAttendance) {
                                                                setShowAttendanceModal({ 
                                                                    isOpen: true, 
                                                                    employee: emp, 
                                                                    date: day, 
                                                                    record 
                                                                });
                                                            }
                                                        }}
                                                        className={`border-r text-center transition-all relative ${legend?.color || (isSunday ? 'bg-gray-50' : '')} ${currentUser.permissions.canManageAttendance ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                                    >
                                                        <div className="h-8 flex items-center justify-center text-[10px] font-bold relative group">
                                                            {legend?.code}
                                                            {/* Small indicators */}
                                                            {record?.otAttachment && (
                                                                <Paperclip className="w-2 h-2 absolute top-0.5 right-0.5 text-indigo-600" />
                                                            )}
                                                            {record?.overtimeHours && record.overtimeHours > 0 && (
                                                                <span className="absolute bottom-0.5 right-0.5 text-[8px] text-blue-600 font-mono">+{record.overtimeHours}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                            <td className="p-2 border-l text-xs text-gray-500 whitespace-nowrap">
                                                P: {present} / A: {absent} <br/>
                                                Hrs: {totalHours}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'leave' && (
            <div className="w-full space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">Leave Management</h2>
                    {currentUser.permissions.canManageLeaves && (
                        <button onClick={() => setShowLeaveModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 flex items-center gap-2">
                            <Plus className="w-4 h-4"/> Request Leave
                        </button>
                    )}
                </div>
                
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-700 font-bold uppercase">
                            <tr>
                                <th className="p-4">Employee</th>
                                <th className="p-4">Type</th>
                                <th className="p-4">Duration</th>
                                <th className="p-4">Reason</th>
                                <th className="p-4">Applied On</th>
                                <th className="p-4 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {leaveRequests.map(req => {
                                const emp = employees.find(e => e.id === req.employeeId);
                                return (
                                    <tr key={req.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-medium">{emp?.name || 'Unknown'}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                req.type === AttendanceStatus.SICK_LEAVE ? 'bg-orange-100 text-orange-700' :
                                                req.type === AttendanceStatus.ANNUAL_LEAVE ? 'bg-blue-100 text-blue-700' :
                                                req.type === AttendanceStatus.UNPAID_LEAVE ? 'bg-red-100 text-red-700' : 'bg-pink-100 text-pink-700'
                                            }`}>
                                                {ATTENDANCE_LEGEND[req.type]?.label}
                                            </span>
                                        </td>
                                        <td className="p-4 text-gray-600">{req.startDate} to {req.endDate}</td>
                                        <td className="p-4 text-gray-500 truncate max-w-xs">{req.reason}</td>
                                        <td className="p-4 text-gray-400 text-xs">{req.appliedOn}</td>
                                        <td className="p-4 text-right">
                                            {req.status === LeaveStatus.PENDING ? (
                                                <div className="flex justify-end gap-2">
                                                    {currentUser.permissions.canManageLeaves && (
                                                        <>
                                                            <button onClick={() => { updateLeaveRequestStatus(req.id, LeaveStatus.APPROVED); handleRefresh(); }} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4"/></button>
                                                            <button onClick={() => { updateLeaveRequestStatus(req.id, LeaveStatus.REJECTED); handleRefresh(); }} className="p-1 text-red-600 hover:bg-red-50 rounded"><XCircle className="w-4 h-4"/></button>
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className={`text-xs font-bold ${req.status === LeaveStatus.APPROVED ? 'text-green-600' : 'text-red-600'}`}>
                                                    {req.status}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {leaveRequests.length === 0 && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400 italic">No leave requests found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {activeTab === 'payroll' && (
             <div className="space-y-4">
                 <div className="flex justify-between items-center print:hidden">
                    <h2 className="text-xl font-bold">Payroll Register - {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                    {currentUser.permissions.canManagePayroll && (
                        <button onClick={() => window.print()} className="flex items-center gap-2 text-gray-600 hover:bg-gray-100 px-3 py-2 rounded border">
                            <Printer className="w-4 h-4"/> Print Summary
                        </button>
                    )}
                 </div>

                 {/* Using print:block ensures the table is visible when printing, while the surrounding layout hides */}
                 <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-200 print:shadow-none print:border-none print:w-full">
                     <div className="overflow-x-auto">
                         <table className="w-full text-xs text-left border-collapse">
                             <thead className="bg-gray-50 text-gray-700 font-bold border-b">
                                 <tr>
                                     <th className="p-2 border-r">Code</th>
                                     <th className="p-2 border-r w-32">Name</th>
                                     <th className="p-2 border-r text-right">Basic</th>
                                     <th className="p-2 border-r text-right">Housing</th>
                                     <th className="p-2 border-r text-right">Transport</th>
                                     <th className="p-2 border-r text-right">Other</th>
                                     <th className="p-2 border-r text-right bg-gray-100">Gross</th>
                                     <th className="p-2 border-r text-right text-red-600">Deductions</th>
                                     <th className="p-2 border-r text-right text-blue-600">Additions</th>
                                     <th className="p-2 border-r text-right bg-green-50 text-green-700">Net Salary</th>
                                     <th className="p-2 text-center print:hidden">Action</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-gray-100">
                                 {filteredEmployees.map(emp => {
                                     const gross = (emp.salary?.basic || 0) + (emp.salary?.housing || 0) + (emp.salary?.transport || 0) + (emp.salary?.other || 0);
                                     const empRecs = attendance.filter(r => r.employeeId === emp.id);
                                     const absentDays = empRecs.filter(r => r.status === AttendanceStatus.ABSENT || r.status === AttendanceStatus.UNPAID_LEAVE || r.status === AttendanceStatus.EMERGENCY_LEAVE).length;
                                     const deduction = (gross / 30) * absentDays;
                                     
                                     const { overtimePay, holidayPay, weekOffPay } = calculateAdditionalEarnings(empRecs, emp.team);
                                     const additions = overtimePay + holidayPay + weekOffPay;

                                     const net = gross - deduction + additions;

                                     return (
                                         <tr key={emp.id} className="hover:bg-gray-50">
                                             <td className="p-2 border-r font-mono text-gray-500">{emp.code}</td>
                                             <td className="p-2 border-r font-medium">{emp.name}</td>
                                             <td className="p-2 border-r text-right text-gray-500">{(emp.salary?.basic || 0).toLocaleString()}</td>
                                             <td className="p-2 border-r text-right text-gray-500">{(emp.salary?.housing || 0).toLocaleString()}</td>
                                             <td className="p-2 border-r text-right text-gray-500">{(emp.salary?.transport || 0).toLocaleString()}</td>
                                             <td className="p-2 border-r text-right text-gray-500">{(emp.salary?.other || 0).toLocaleString()}</td>
                                             <td className="p-2 border-r text-right font-bold bg-gray-50">{gross.toLocaleString()}</td>
                                             <td className="p-2 border-r text-right text-red-600">({deduction.toLocaleString(undefined, {maximumFractionDigits: 0})})</td>
                                             <td className="p-2 border-r text-right text-blue-600">
                                                 {additions > 0 ? `+${additions.toLocaleString(undefined, {maximumFractionDigits: 0})}` : '-'}
                                             </td>
                                             <td className="p-2 border-r text-right font-bold bg-green-50 text-green-700">{net.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                                             <td className="p-2 text-center print:hidden">
                                                 {currentUser.permissions.canManagePayroll && (
                                                     <button onClick={() => setShowPayslip(emp)} className="text-indigo-600 hover:underline">Payslip</button>
                                                 )}
                                             </td>
                                         </tr>
                                     );
                                 })}
                             </tbody>
                         </table>
                     </div>
                 </div>
             </div>
        )}

        {activeTab === 'reports' && <ReportsView employees={employees} attendance={attendance} />}
        
        {activeTab === 'about' && <AboutView currentUser={currentUser} />}
      </main>

      {/* Modals */}
      <ManageCompaniesModal 
        isOpen={showManageCompanies} 
        onClose={() => setShowManageCompanies(false)} 
        companies={companies}
        onDataChange={setCompanies}
      />

      <UserManagementModal 
        isOpen={showUserManagement}
        onClose={() => setShowUserManagement(false)}
      />

      <AttendanceActionModal 
        isOpen={showAttendanceModal.isOpen}
        onClose={() => setShowAttendanceModal({ isOpen: false })}
        onSave={(status: AttendanceStatus, ot: number, attachment?: string) => {
            if (showAttendanceModal.employee && showAttendanceModal.date) {
                logAttendance(showAttendanceModal.employee.id, status, showAttendanceModal.date.toISOString().split('T')[0], ot, attachment);
                setShowAttendanceModal({ isOpen: false });
                handleRefresh();
            }
        }}
        employeeName={showAttendanceModal.employee?.name || ''}
        date={showAttendanceModal.date || new Date()}
        currentStatus={showAttendanceModal.record?.status || (showAttendanceModal.date?.getDay() === 0 ? AttendanceStatus.WEEK_OFF : AttendanceStatus.PRESENT)}
        currentOt={showAttendanceModal.record?.overtimeHours || 0}
        currentAttachment={showAttendanceModal.record?.otAttachment}
        onPreview={(data: string) => setShowPreview(data)}
        isOtEligible={showAttendanceModal.employee?.team !== 'Office Staff'}
      />

      {showPreview && (
          <DocumentPreviewModal 
            isOpen={true} 
            onClose={() => setShowPreview(null)} 
            attachment={showPreview} 
          />
      )}

      <BulkImportModal 
          isOpen={showImport}
          onClose={() => setShowImport(false)}
          onImport={(csv: string) => {
              const res = importAttendanceFromCSV(csv);
              alert(`Imported ${res.success} records. Errors: ${res.errors.length}`);
              setShowImport(false);
              handleRefresh();
          }}
      />

      <EmployeeImportModal 
          isOpen={showEmpImport}
          onClose={() => setShowEmpImport(false)}
          onImport={(csv: string) => {
              const res = importEmployeesFromCSV(csv);
              alert(`Imported/Updated ${res.success} employees. Errors: ${res.errors.length}`);
              setShowEmpImport(false);
              handleRefresh();
          }}
      />

      {editingEmployee && (
          <EditEmployeeModal 
            employee={editingEmployee}
            companies={companies}
            onClose={() => setEditingEmployee(null)}
            onSave={(updated: Employee) => {
                updateEmployee(updated);
                setEditingEmployee(null);
                handleRefresh();
            }}
          />
      )}

      {showOnboarding && (
          <OnboardingWizard 
            companies={companies}
            onClose={() => setShowOnboarding(false)} 
            onComplete={() => {
                setShowOnboarding(false);
                handleRefresh();
            }} 
          />
      )}

      {showOffboarding && (
          <OffboardingWizard 
            employee={showOffboarding}
            onClose={() => setShowOffboarding(null)}
            onComplete={() => {
                setShowOffboarding(null);
                handleRefresh();
            }}
          />
      )}

      {showRehire && (
          <RehireModal 
            employee={showRehire}
            onClose={() => setShowRehire(null)}
            onConfirm={(id: string, date: string, reason: string) => {
                rehireEmployee(id, date, reason);
                setShowRehire(null);
                handleRefresh();
            }}
          />
      )}
      
      {showExEmployeeDetails && (
          <ExEmployeeDetailsModal 
            employee={showExEmployeeDetails}
            onClose={() => setShowExEmployeeDetails(null)}
          />
      )}

      {showLeaveModal && (
          <LeaveRequestModal 
            employees={employees.filter(e => e.active)}
            onClose={() => setShowLeaveModal(false)}
            onSave={() => {
                setShowLeaveModal(false);
                handleRefresh();
            }}
          />
      )}

      <HolidayManagementModal 
        isOpen={showHolidays} 
        onClose={() => { setShowHolidays(false); handleRefresh(); }} 
      />

      {showPayslip && (
          <PayslipModal 
            employee={showPayslip}
            month={currentDate.getMonth()}
            year={currentDate.getFullYear()}
            onClose={() => setShowPayslip(null)}
          />
      )}

    </div>
  );
}

export default App;
