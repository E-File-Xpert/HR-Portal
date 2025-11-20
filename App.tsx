
import React, { useState, useEffect, useRef } from 'react';
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
  Ban,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Shield,
  Lock
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
  EmployeeDocuments,
  SystemUser,
  UserRole
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
  deleteSystemUser
} from './services/storageService';
import { PUBLIC_HOLIDAYS } from './constants';
import SmartCommand from './components/SmartCommand';

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
        if (isOtEligible && PUBLIC_HOLIDAYS.includes(r.date) && r.status === AttendanceStatus.PRESENT) {
            holidayPay += HOLIDAY_BONUS_FLAT;
        }

        // Week Off Work Calculation (If PRESENT on a Sunday - Day 0)
        const dateObj = new Date(r.date);
        if (isOtEligible && dateObj.getDay() === 0 && r.status === AttendanceStatus.PRESENT) {
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
                <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">ShiftSync AI</h2>
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

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100 text-center">
                    <p className="text-xs text-blue-600 font-bold uppercase mb-1">Demo Credentials</p>
                    <p className="text-sm text-blue-800">
                        Username: <span className="font-mono font-bold">admin</span>
                    </p>
                    <p className="text-sm text-blue-800">
                        Password: <span className="font-mono font-bold">123</span>
                    </p>
                </div>
                
                <p className="text-xs text-center text-gray-400 mt-6">Protected System. Authorized Access Only.</p>
            </div>
        </div>
    )
}

const UserManagementModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const [users, setUsers] = useState<SystemUser[]>(getSystemUsers());
    const [formData, setFormData] = useState({ username: '', password: '', name: '', role: UserRole.HR });

    const handleAdd = () => {
        if (!formData.username || !formData.password || !formData.name) return;
        try {
            const updated = addSystemUser({ ...formData, active: true });
            setUsers(updated);
            setFormData({ username: '', password: '', name: '', role: UserRole.HR });
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleDelete = (username: string) => {
        if (username === 'admin') {
            alert("Cannot delete the main admin account.");
            return;
        }
        if (confirm(`Delete user ${username}?`)) {
            const updated = deleteSystemUser(username);
            setUsers(updated);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold">System User Management</h3>
                    <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-500"/></button>
                </div>

                {/* Add User */}
                <div className="bg-gray-50 p-4 rounded-lg mb-6 grid grid-cols-2 gap-4">
                     <input placeholder="Username" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="p-2 border rounded text-sm" />
                     <input placeholder="Password" type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="p-2 border rounded text-sm" />
                     <input placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="p-2 border rounded text-sm" />
                     <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})} className="p-2 border rounded text-sm">
                         {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
                     </select>
                     <button onClick={handleAdd} className="col-span-2 bg-indigo-600 text-white py-2 rounded text-sm hover:bg-indigo-700">Create User</button>
                </div>

                {/* User List */}
                <div className="overflow-y-auto max-h-64">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 font-bold">
                            <tr>
                                <th className="p-2">Username</th>
                                <th className="p-2">Name</th>
                                <th className="p-2">Role</th>
                                <th className="p-2 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.username} className="border-b">
                                    <td className="p-2 font-mono">{u.username}</td>
                                    <td className="p-2">{u.name}</td>
                                    <td className="p-2"><span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{u.role}</span></td>
                                    <td className="p-2 text-right">
                                        {u.username !== 'admin' && (
                                            <button onClick={() => handleDelete(u.username)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4"/></button>
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
    const [scale, setScale] = useState(1);
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
        <div className="fixed inset-0 bg-black/90 z-[60] flex flex-col print:bg-white print:z-auto print:relative">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-3 bg-gray-900 text-white border-b border-gray-800 print:hidden">
                <h2 className="font-bold text-lg">Payslip Preview</h2>
                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-gray-800 rounded-lg p-1 border border-gray-700">
                        <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors" title="Zoom Out">
                            <ZoomOut className="w-4 h-4"/>
                        </button>
                        <span className="w-16 text-center text-xs font-mono text-gray-300">{Math.round(scale * 100)}%</span>
                        <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors" title="Zoom In">
                            <ZoomIn className="w-4 h-4"/>
                        </button>
                        <div className="w-px h-4 bg-gray-700 mx-1"></div>
                        <button onClick={() => setScale(1)} className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors" title="Reset Zoom">
                            <RotateCcw className="w-4 h-4"/>
                        </button>
                    </div>
                    <button onClick={() => window.print()} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        <Printer className="w-4 h-4"/> Print
                    </button>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors">
                        <XCircle className="w-6 h-6"/>
                    </button>
                </div>
            </div>

            {/* Scrollable Preview Area */}
            <div className="flex-1 overflow-auto bg-gray-800/50 p-8 flex justify-center items-start print:p-0 print:bg-white print:block">
                <div 
                    className="bg-white shadow-2xl transition-transform duration-200 origin-top print:shadow-none print:transform-none print:w-full"
                    style={{ 
                        width: '210mm', // A4 width
                        minHeight: '297mm', // A4 height
                        transform: `scale(${scale})`,
                        marginBottom: `${(scale - 1) * 300}px`
                    }}
                >
                    <div className="p-12 h-full flex flex-col justify-between print:p-0">
                        <div>
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

                            <div className="flex justify-between items-center border-t-2 border-gray-900 pt-4 mt-4">
                                <span className="text-lg font-bold text-gray-700">Net Payable Amount</span>
                                <span className="text-2xl font-bold text-gray-900">AED {netSalary.toFixed(2)}</span>
                            </div>

                            <div className="mt-8 text-xs text-gray-500">
                                <p><span className="font-bold">Payment Method:</span> {employee.bankName || 'Cash'} {employee.iban ? `| IBAN: ${employee.iban}` : ''}</p>
                                <p className="mt-1">* This is a computer-generated document and does not require a physical signature.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-gray-200">
                            <div>
                                <p className="text-sm font-bold mb-8">Employer Signature</p>
                                <div className="border-b border-gray-400 w-3/4"></div>
                            </div>
                            <div>
                                <p className="text-sm font-bold mb-8">Employee Signature</p>
                                <div className="border-b border-gray-400 w-3/4"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const ReportsView = ({ companies }: { companies: string[] }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedCompany, setSelectedCompany] = useState('All');
    const [filteredRecords, setFilteredRecords] = useState<any[]>([]);
    const [totalEstimatedCost, setTotalEstimatedCost] = useState(0);

    const generateReport = () => {
        if (!startDate || !endDate) return;
        const records = getAttendanceRange(startDate, endDate);
        const employees = getEmployees();
        
        // Aggregate Data
        const reportData = employees
            .filter(e => selectedCompany === 'All' || e.company === selectedCompany)
            .map(emp => {
                const empRecs = records.filter(r => r.employeeId === emp.id);
                const daysWorked = empRecs.filter(r => r.status === AttendanceStatus.PRESENT).length;
                const absent = empRecs.filter(r => r.status === AttendanceStatus.ABSENT).length;
                const otHours = empRecs.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
                
                // Cost Estimation
                const gross = (emp.salary?.basic || 0) + (emp.salary?.housing || 0) + (emp.salary?.transport || 0) + (emp.salary?.other || 0);
                const dailyRate = gross / 30;
                const { overtimePay, holidayPay, weekOffPay } = calculateAdditionalEarnings(empRecs, emp.team);
                const estCost = (dailyRate * daysWorked) + overtimePay + holidayPay + weekOffPay;

                return {
                    code: emp.code,
                    name: emp.name,
                    daysWorked,
                    absent,
                    otHours,
                    estCost
                };
            });
        setFilteredRecords(reportData);
        setTotalEstimatedCost(reportData.reduce((acc, curr) => acc + curr.estCost, 0));
    };

    return (
        <div className="space-y-6 p-6">
             <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-lg shadow print:hidden">
                 <div>
                     <label className="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                     <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border rounded"/>
                 </div>
                 <div>
                     <label className="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                     <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border rounded"/>
                 </div>
                 <div>
                     <label className="block text-xs font-bold text-gray-700 mb-1">Company</label>
                     <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className="p-2 border rounded min-w-[200px]">
                         <option value="All">All Companies</option>
                         {companies.map(c => <option key={c} value={c}>{c}</option>)}
                     </select>
                 </div>
                 <button onClick={generateReport} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">Generate</button>
                 <button onClick={() => window.print()} className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 flex items-center gap-2"><Printer className="w-4 h-4"/> Print</button>
             </div>

             <div className="bg-white shadow-lg rounded-xl overflow-hidden p-6">
                 <div className="flex justify-between items-end mb-6 border-b pb-4">
                     <div>
                         <h2 className="text-xl font-bold text-gray-900">Custom Report</h2>
                         <p className="text-sm text-gray-500">{startDate} to {endDate}</p>
                     </div>
                     <div className="text-right">
                         <p className="text-sm text-gray-500">Total Estimated Cost</p>
                         <p className="text-2xl font-bold text-green-600">AED {totalEstimatedCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                     </div>
                 </div>
                 
                 <table className="w-full text-sm text-left">
                     <thead className="bg-gray-50 text-gray-700 uppercase font-bold">
                         <tr>
                             <th className="p-3">Code</th>
                             <th className="p-3">Name</th>
                             <th className="p-3">Days Worked</th>
                             <th className="p-3">Absent</th>
                             <th className="p-3">OT Hours</th>
                             <th className="p-3 text-right">Est. Cost (AED)</th>
                         </tr>
                     </thead>
                     <tbody>
                         {filteredRecords.map((rec, idx) => (
                             <tr key={idx} className="border-b hover:bg-gray-50">
                                 <td className="p-3">{rec.code}</td>
                                 <td className="p-3">{rec.name}</td>
                                 <td className="p-3">{rec.daysWorked}</td>
                                 <td className="p-3">{rec.absent}</td>
                                 <td className="p-3">{rec.otHours}</td>
                                 <td className="p-3 text-right font-mono">{rec.estCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
             </div>
        </div>
    )
}

const OnboardingWizard = ({ onClose, onComplete, companies }: { onClose: () => void, onComplete: (emp: Employee) => void, companies: string[] }) => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Partial<Employee>>({
      type: StaffType.WORKER,
      status: 'Active',
      team: 'Internal Team',
      salary: { basic: 0, housing: 0, transport: 0, other: 0 }
  });

  const handleChange = (field: string, value: any) => setData(prev => ({...prev, [field]: value}));
  const handleSalary = (field: string, value: number) => setData(prev => ({...prev, salary: {...prev.salary!, [field]: value}}));
  const handleDoc = (field: string, value: string) => setData(prev => ({...prev, documents: {...prev.documents, [field]: value}}));

  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => s - 1);

  const submit = () => {
      const newEmp = {
          ...data,
          id: Math.random().toString(36).substr(2, 9),
          active: true,
          leaveBalance: 30
      } as Employee;
      saveEmployee(newEmp);
      onComplete(newEmp);
  }

  return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
              <div className="p-6 border-b">
                  <h2 className="text-xl font-bold">Employee Onboarding</h2>
                  <div className="flex gap-2 mt-4">
                      {[1,2,3,4,5].map(i => (
                          <div key={i} className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-indigo-600' : 'bg-gray-200'}`} />
                      ))}
                  </div>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                  {step === 1 && (
                      <div className="space-y-4">
                          <h3 className="font-bold text-lg">Personal Details</h3>
                          <div className="grid grid-cols-2 gap-4">
                              <input placeholder="Employee Code" className="p-2 border rounded" onChange={e => handleChange('code', e.target.value)} />
                              <input placeholder="Full Name" className="p-2 border rounded" onChange={e => handleChange('name', e.target.value)} />
                              <select className="p-2 border rounded" onChange={e => handleChange('type', e.target.value)}>
                                  <option value={StaffType.WORKER}>Worker</option>
                                  <option value={StaffType.OFFICE}>Office Staff</option>
                              </select>
                              <input type="date" className="p-2 border rounded" onChange={e => handleChange('joiningDate', e.target.value)} />
                          </div>
                      </div>
                  )}
                   {step === 2 && (
                      <div className="space-y-4">
                          <h3 className="font-bold text-lg">Job Details</h3>
                          <div className="grid grid-cols-2 gap-4">
                              <select className="p-2 border rounded" onChange={e => handleChange('company', e.target.value)}>
                                  <option value="">Select Company</option>
                                  {companies.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <input placeholder="Designation" className="p-2 border rounded" onChange={e => handleChange('designation', e.target.value)} />
                              <input placeholder="Department" className="p-2 border rounded" onChange={e => handleChange('department', e.target.value)} />
                              <select className="p-2 border rounded" onChange={e => handleChange('team', e.target.value)}>
                                 <option value="Internal Team">Internal Team</option>
                                 <option value="External Team">External Team</option>
                                 <option value="Office Staff">Office Staff</option>
                              </select>
                              <input placeholder="Work Location" className="p-2 border rounded" onChange={e => handleChange('workLocation', e.target.value)} />
                          </div>
                      </div>
                  )}
                   {step === 3 && (
                      <div className="space-y-4">
                          <h3 className="font-bold text-lg">Documents</h3>
                          <div className="grid grid-cols-2 gap-4">
                              <input placeholder="Emirates ID" className="p-2 border rounded" onChange={e => handleDoc('emiratesId', e.target.value)} />
                              <input type="date" placeholder="Expiry" className="p-2 border rounded" onChange={e => handleDoc('emiratesIdExpiry', e.target.value)} />
                              <input placeholder="Passport No" className="p-2 border rounded" onChange={e => handleDoc('passportNumber', e.target.value)} />
                              <input type="date" placeholder="Expiry" className="p-2 border rounded" onChange={e => handleDoc('passportExpiry', e.target.value)} />
                              <input placeholder="Labour Card" className="p-2 border rounded" onChange={e => handleDoc('labourCardNumber', e.target.value)} />
                              <input type="date" placeholder="Expiry" className="p-2 border rounded" onChange={e => handleDoc('labourCardExpiry', e.target.value)} />
                          </div>
                      </div>
                  )}
                  {step === 4 && (
                      <div className="space-y-4">
                          <h3 className="font-bold text-lg">Financial Details</h3>
                          <div className="grid grid-cols-2 gap-4">
                              <input type="number" placeholder="Basic Salary" className="p-2 border rounded" onChange={e => handleSalary('basic', parseFloat(e.target.value))} />
                              <input type="number" placeholder="Housing" className="p-2 border rounded" onChange={e => handleSalary('housing', parseFloat(e.target.value))} />
                              <input type="number" placeholder="Transport" className="p-2 border rounded" onChange={e => handleSalary('transport', parseFloat(e.target.value))} />
                              <input type="number" placeholder="Other" className="p-2 border rounded" onChange={e => handleSalary('other', parseFloat(e.target.value))} />
                              <input placeholder="Bank Name" className="p-2 border rounded" onChange={e => handleChange('bankName', e.target.value)} />
                              <input placeholder="IBAN" className="p-2 border rounded" onChange={e => handleChange('iban', e.target.value)} />
                          </div>
                      </div>
                  )}
                   {step === 5 && (
                      <div className="space-y-4">
                          <h3 className="font-bold text-lg">Review & Confirm</h3>
                          <div className="bg-gray-50 p-4 rounded text-sm space-y-4">
                             <div className="grid grid-cols-2 gap-4 border-b pb-2">
                                 <div><span className="font-bold block text-xs text-gray-500">Name</span>{data.name}</div>
                                 <div><span className="font-bold block text-xs text-gray-500">Code</span>{data.code}</div>
                                 <div><span className="font-bold block text-xs text-gray-500">Company</span>{data.company}</div>
                                 <div><span className="font-bold block text-xs text-gray-500">Designation</span>{data.designation}</div>
                             </div>
                             <div className="grid grid-cols-2 gap-4 border-b pb-2">
                                 <div><span className="font-bold block text-xs text-gray-500">Joining Date</span>{data.joiningDate}</div>
                                 <div><span className="font-bold block text-xs text-gray-500">Team</span>{data.team}</div>
                                 <div><span className="font-bold block text-xs text-gray-500">Location</span>{data.workLocation}</div>
                             </div>
                             <div className="grid grid-cols-4 gap-2">
                                 <div><span className="font-bold block text-xs text-gray-500">Basic</span>{data.salary?.basic}</div>
                                 <div><span className="font-bold block text-xs text-gray-500">Housing</span>{data.salary?.housing}</div>
                                 <div><span className="font-bold block text-xs text-gray-500">Transport</span>{data.salary?.transport}</div>
                                 <div><span className="font-bold block text-xs text-gray-500">Other</span>{data.salary?.other}</div>
                             </div>
                             <div className="text-xs text-gray-500 italic mt-2">
                                Documents: {data.documents?.emiratesId ? 'Emirates ID provided' : 'Pending'}, {data.documents?.passportNumber ? 'Passport provided' : 'Pending'}
                             </div>
                          </div>
                      </div>
                  )}
              </div>

              <div className="p-6 border-t flex justify-between">
                  <button onClick={step === 1 ? onClose : back} className="px-4 py-2 text-gray-600">Back</button>
                  <button onClick={step === 5 ? submit : next} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                      {step === 5 ? 'Complete Onboarding' : 'Next'}
                  </button>
              </div>
          </div>
      </div>
  )
}

const OffboardingWizard = ({ employee, onClose, onComplete }: { employee: Employee, onClose: () => void, onComplete: () => void }) => {
    const [details, setDetails] = useState<OffboardingDetails>({
        type: 'Resignation',
        exitDate: '',
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

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const base64 = ev.target?.result as string;
                setDetails(prev => ({
                    ...prev,
                    documents: [...(prev.documents || []), { name: file.name, data: base64 }]
                }));
            };
            reader.readAsDataURL(file);
        }
    };

    const removeDocument = (index: number) => {
        setDetails(prev => ({
            ...prev,
            documents: prev.documents?.filter((_, i) => i !== index)
        }));
    };

    const submit = () => {
        offboardEmployee(employee.id, details);
        onComplete();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4 text-red-600">Offboard Employee: {employee.name}</h2>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <select className="p-2 border rounded" value={details.type} onChange={e => setDetails({...details, type: e.target.value as any})}>
                            <option>Resignation</option>
                            <option>Termination</option>
                            <option>End of Contract</option>
                        </select>
                        <input type="date" className="p-2 border rounded" onChange={e => setDetails({...details, exitDate: e.target.value})} />
                    </div>
                    <textarea placeholder="Reason for leaving..." className="w-full p-2 border rounded" onChange={e => setDetails({...details, reason: e.target.value})}></textarea>
                    
                    <h3 className="font-bold border-b pb-2">Final Settlement</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <input type="number" placeholder="Gratuity" className="p-2 border rounded" onChange={e => setDetails({...details, gratuity: parseFloat(e.target.value)})} />
                        <input type="number" placeholder="Leave Encashment" className="p-2 border rounded" onChange={e => setDetails({...details, leaveEncashment: parseFloat(e.target.value)})} />
                        <input type="number" placeholder="Pending Salary" className="p-2 border rounded" onChange={e => setDetails({...details, salaryDues: parseFloat(e.target.value)})} />
                        <input type="number" placeholder="Deductions" className="p-2 border rounded" onChange={e => setDetails({...details, deductions: parseFloat(e.target.value)})} />
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={details.assetsReturned} onChange={e => setDetails({...details, assetsReturned: e.target.checked})} />
                        <label>All assets returned</label>
                    </div>

                    <h3 className="font-bold border-b pb-2 pt-2">Documents (e.g. Resignation Letter)</h3>
                    <div className="border border-dashed border-gray-300 p-4 rounded-lg text-center">
                        <input type="file" onChange={handleFileUpload} className="hidden" id="offboard-doc-upload" accept=".pdf,.jpg,.png,.doc,.docx" />
                        <label htmlFor="offboard-doc-upload" className="cursor-pointer text-indigo-600 hover:text-indigo-800 flex flex-col items-center">
                             <Upload className="w-6 h-6 mb-1"/>
                             <span className="text-sm">Click to upload document</span>
                        </label>
                    </div>
                    {details.documents && details.documents.length > 0 && (
                        <ul className="space-y-2 mt-2">
                            {details.documents.map((doc, idx) => (
                                <li key={idx} className="flex items-center justify-between bg-gray-50 p-2 rounded text-sm">
                                    <span className="truncate max-w-[200px]" title={doc.name}>{doc.name}</span>
                                    <button onClick={() => removeDocument(idx)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <button onClick={submit} className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 mt-4">Confirm Offboarding</button>
                    <button onClick={onClose} className="w-full text-gray-600 py-2 rounded hover:bg-gray-100 mt-2">Cancel</button>
                </div>
            </div>
        </div>
    )
}

const LeaveRequestModal = ({ onClose, onSave, employees }: { onClose: () => void, onSave: () => void, employees: Employee[] }) => {
    const [empId, setEmpId] = useState(employees[0]?.id || '');
    const [type, setType] = useState<AttendanceStatus>(AttendanceStatus.SICK_LEAVE);
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [reason, setReason] = useState('');

    const submit = () => {
        saveLeaveRequest({
            employeeId: empId,
            type,
            startDate: start,
            endDate: end,
            reason
        });
        onSave();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
                <h3 className="font-bold text-lg mb-4">New Leave Request</h3>
                <div className="space-y-4">
                    <select className="w-full p-2 border rounded" value={empId} onChange={e => setEmpId(e.target.value)}>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <select className="w-full p-2 border rounded" value={type} onChange={e => setType(e.target.value as AttendanceStatus)}>
                        <option value={AttendanceStatus.SICK_LEAVE}>Sick Leave</option>
                        <option value={AttendanceStatus.ANNUAL_LEAVE}>Annual Leave</option>
                        <option value={AttendanceStatus.UNPAID_LEAVE}>Unpaid Leave</option>
                        <option value={AttendanceStatus.EMERGENCY_LEAVE}>Emergency Leave</option>
                    </select>
                    <div className="grid grid-cols-2 gap-4">
                        <input type="date" className="w-full p-2 border rounded" onChange={e => setStart(e.target.value)} />
                        <input type="date" className="w-full p-2 border rounded" onChange={e => setEnd(e.target.value)} />
                    </div>
                    <textarea placeholder="Reason" className="w-full p-2 border rounded" onChange={e => setReason(e.target.value)} />
                    <button onClick={submit} className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700">Submit Request</button>
                </div>
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
  const [showHolidays, setShowHolidays] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);

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

  return (
    <div className="min-h-screen flex flex-col print:bg-white">
      {/* Header */}
      <header className={`bg-white shadow-sm z-10 print:hidden`}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">ShiftSync AI</h1>
              <p className="text-xs text-gray-500">Smart Workforce Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             {/* Filters */}
             <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className="text-sm border rounded-lg px-3 py-2 bg-gray-50 max-w-[200px]">
                 <option value="All">All Companies</option>
                 {companies.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
             {currentUser.role === UserRole.ADMIN && (
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
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-6 overflow-x-auto">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'directory', label: 'Staff Directory', icon: Users },
              { id: 'timesheet', label: 'Monthly Timesheet', icon: Calendar },
              { id: 'leave', label: 'Leave Management', icon: FileText },
              { id: 'payroll', label: 'Payroll Register', icon: DollarSign },
              { id: 'reports', label: 'Reports', icon: BarChart3 },
            ].map(tab => (
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

      <main className={`flex-1 max-w-full mx-auto px-4 py-6 w-full overflow-hidden ${showPayslip ? 'print:hidden' : ''}`}>
        {activeTab === 'dashboard' && (
             <div className="max-w-6xl mx-auto space-y-6">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">Overview</h2>
                    {currentUser.role === UserRole.ADMIN && (
                        <button onClick={() => setShowUserManagement(true)} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-800">
                            <Shield className="w-4 h-4"/> User Management
                        </button>
                    )}
                 </div>

                 <SmartCommand onUpdate={handleRefresh} />
                 
                 {/* Main Stats */}
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-gray-500 text-sm">Total Active Staff</p>
                            <h3 className="text-3xl font-bold text-indigo-600 mt-1">{employees.filter(e => e.active).length}</h3>
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-lg"><Users className="w-6 h-6 text-indigo-600"/></div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                         <div>
                            <p className="text-gray-500 text-sm">Internal Team</p>
                            <h3 className="text-3xl font-bold text-green-600 mt-1">{teamStats['Internal Team'] || 0}</h3>
                        </div>
                         <div className="p-3 bg-green-50 rounded-lg"><Users className="w-6 h-6 text-green-600"/></div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                         <div>
                            <p className="text-gray-500 text-sm">External Team</p>
                            <h3 className="text-3xl font-bold text-orange-600 mt-1">{teamStats['External Team'] || 0}</h3>
                        </div>
                         <div className="p-3 bg-orange-50 rounded-lg"><Users className="w-6 h-6 text-orange-600"/></div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                         <div>
                            <p className="text-gray-500 text-sm">Office Staff</p>
                            <h3 className="text-3xl font-bold text-blue-600 mt-1">{teamStats['Office Staff'] || 0}</h3>
                        </div>
                         <div className="p-3 bg-blue-50 rounded-lg"><Briefcase className="w-6 h-6 text-blue-600"/></div>
                    </div>
                 </div>

                 {/* Company Breakdown */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                         <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Building2 className="w-5 h-5"/> Staff by Company</h3>
                         <div className="space-y-3">
                             {Object.entries(companyStats).map(([company, count]) => (
                                 <div key={company} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                     <span className="text-sm font-medium text-gray-700 truncate max-w-[300px]" title={company}>{company}</span>
                                     <span className="bg-gray-200 text-gray-800 text-xs font-bold px-2 py-1 rounded-full">{count}</span>
                                 </div>
                             ))}
                         </div>
                     </div>

                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                         <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Lock className="w-5 h-5"/> Admin Details</h3>
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
                             <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                                 <div>
                                     <p className="text-xs text-gray-400">Role</p>
                                     <p className="font-medium">{currentUser.role}</p>
                                 </div>
                                 <div>
                                     <p className="text-xs text-gray-400">Access Level</p>
                                     <p className="font-medium">Full Access</p>
                                 </div>
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
                    <div className="flex gap-3">
                        <button onClick={() => setShowEmpImport(true)} className="flex items-center gap-2 text-gray-600 hover:bg-gray-100 px-3 py-2 rounded text-sm font-medium">
                            <Upload className="w-4 h-4"/> Import CSV
                        </button>
                        <button onClick={() => setShowOnboarding(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2">
                            <UserPlus className="w-4 h-4"/> Onboard Employee
                        </button>
                    </div>
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
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setEditingEmployee(emp)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit"><Edit className="w-4 h-4"/></button>
                                                {emp.status === 'Active' ? (
                                                    <button onClick={() => setShowOffboarding(emp)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Offboard"><UserMinus className="w-4 h-4"/></button>
                                                ) : (
                                                    <button onClick={() => setShowRehire(emp)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Re-hire"><UserCheck className="w-4 h-4"/></button>
                                                )}
                                            </div>
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
                        <button onClick={() => setShowHolidays(true)} className="text-xs font-medium text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-200 flex items-center gap-1">
                            <Calendar className="w-3 h-3"/> Manage Holidays
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                         <div className="flex flex-wrap gap-1 max-w-xl justify-end">
                            {Object.values(ATTENDANCE_LEGEND).map((l) => (
                                <span key={l.code} className={`text-[10px] px-2 py-1 rounded ${l.color} border border-black/5`}>{l.code} - {l.label}</span>
                            ))}
                         </div>
                         <div className="h-8 w-px bg-gray-300 mx-2"></div>
                         <button onClick={() => setShowImport(true)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Import CSV"><FileSpreadsheet className="w-5 h-5"/></button>
                         <button onClick={exportToCSV} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Export CSV"><Download className="w-5 h-5"/></button>
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
                                                        onClick={() => setShowAttendanceModal({ 
                                                            isOpen: true, 
                                                            employee: emp, 
                                                            date: day, 
                                                            record 
                                                        })}
                                                        className={`border-r text-center cursor-pointer transition-all hover:opacity-80 relative ${legend?.color || (isSunday ? 'bg-gray-50' : '')}`}
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
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">Leave Management</h2>
                    <button onClick={() => setShowLeaveModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 flex items-center gap-2">
                        <Plus className="w-4 h-4"/> Request Leave
                    </button>
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
                                                    <button onClick={() => { updateLeaveRequestStatus(req.id, LeaveStatus.APPROVED); handleRefresh(); }} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4"/></button>
                                                    <button onClick={() => { updateLeaveRequestStatus(req.id, LeaveStatus.REJECTED); handleRefresh(); }} className="p-1 text-red-600 hover:bg-red-50 rounded"><XCircle className="w-4 h-4"/></button>
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
                    <button onClick={() => window.print()} className="flex items-center gap-2 text-gray-600 hover:bg-gray-100 px-3 py-2 rounded border">
                        <Printer className="w-4 h-4"/> Print Summary
                    </button>
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
                                                 <button onClick={() => setShowPayslip(emp)} className="text-indigo-600 hover:underline">Payslip</button>
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

        {activeTab === 'reports' && <ReportsView companies={companies} />}
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
        onSave={(status, ot, attachment) => {
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
        onPreview={(data) => setShowPreview(data)}
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
          onImport={(csv) => {
              const res = importAttendanceFromCSV(csv);
              alert(`Imported ${res.success} records. Errors: ${res.errors.length}`);
              setShowImport(false);
              handleRefresh();
          }}
      />

      <EmployeeImportModal 
          isOpen={showEmpImport}
          onClose={() => setShowEmpImport(false)}
          onImport={(csv) => {
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
            onSave={(updated) => {
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
            onConfirm={(id, date, reason) => {
                rehireEmployee(id, date, reason);
                setShowRehire(null);
                handleRefresh();
            }}
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
