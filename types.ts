
export enum StaffType {
  OFFICE = 'Staff',
  WORKER = 'Worker',
}

export enum ShiftType {
  FIXED_9_5 = 'Fixed (9:00 - 17:00)',
  MORNING_A = 'Morning A (6:00 - 14:00)',
  EVENING_B = 'Evening B (14:00 - 22:00)',
  NIGHT_C = 'Night C (22:00 - 6:00)',
}

export interface SalaryStructure {
  basic: number;
  housing: number;
  transport: number;
  other: number;
}

export interface OffboardingDetails {
  type: 'Resignation' | 'Termination' | 'End of Contract' | 'Absconding';
  exitDate: string;
  reason: string;
  gratuity: number;
  leaveEncashment: number;
  salaryDues: number;
  otherDues: number;
  deductions: number;
  netSettlement: number;
  assetsReturned: boolean;
  notes: string;
  documents?: { name: string; data: string }[]; // Array of Base64 files
}

export interface EmployeeDocuments {
    emiratesId?: string;
    emiratesIdExpiry?: string;
    passportNumber?: string;
    passportExpiry?: string;
    labourCardNumber?: string;
    labourCardExpiry?: string;
}

export interface Employee {
  id: string;
  code: string; // e.g., 10001
  name: string;
  designation: string; // e.g., Helper, Driver
  department: string; // e.g., Cleaning, Maintenance
  joiningDate: string;
  type: StaffType; // Staff / Worker
  company: string; // Specific entity name
  status: 'Active' | 'Inactive';
  team: 'Internal Team' | 'External Team' | 'Office Staff';
  workLocation: string;
  leaveBalance: number;
  bankName?: string;
  iban?: string;
  salary: SalaryStructure;
  active: boolean;
  offboardingDetails?: OffboardingDetails;
  rejoiningDate?: string;
  rejoiningReason?: string;
  
  // New Document Fields
  documents?: EmployeeDocuments;
  vacationScheduledDate?: string;
}

export enum AttendanceStatus {
  PRESENT = 'P',
  ABSENT = 'A',
  WEEK_OFF = 'W',
  PUBLIC_HOLIDAY = 'PH',
  SICK_LEAVE = 'SL',
  ANNUAL_LEAVE = 'AL',
  UNPAID_LEAVE = 'UL',
  EMERGENCY_LEAVE = 'EL',
}

export enum LeaveStatus {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  type: AttendanceStatus; // Restricted to SL, AL, UL usually
  reason: string;
  status: LeaveStatus;
  appliedOn: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  hoursWorked: number; // Default 8 for P, 0 for others usually
  overtimeHours: number;
  checkInTime?: string;
  checkOutTime?: string;
  otAttachment?: string; // Base64 string or file path
}

export interface DashboardStats {
  totalStaff: number;
  present: number;
  leave: number;
  absent: number;
}

export interface PublicHoliday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

export interface AboutData {
    name: string;
    title: string;
    bio: string;
    profileImage: string; // Base64
    email: string;
    contactInfo: string;
}

// --- User / Auth Types ---

export enum UserRole {
    CREATOR = 'Creator', // Special Super Admin
    ADMIN = 'Admin',
    HR = 'HR',
    SUPERVISOR = 'Supervisor',
    ENGINEER = 'Engineer'
}

export interface UserPermissions {
    canViewDashboard: boolean;
    canManageEmployees: boolean; // Add, Edit, Onboard, Offboard
    canViewDirectory: boolean;
    canManageAttendance: boolean; // Edit Timesheet
    canViewTimesheet: boolean;
    canManageLeaves: boolean; // Approve/Reject
    canViewPayroll: boolean;
    canManagePayroll: boolean; // Print, view salary details
    canViewReports: boolean;
    canManageUsers: boolean; // Create other users
    canManageSettings: boolean; // Companies, Holidays
}

export interface SystemUser {
    username: string;
    password: string; // In real app, this must be hashed
    name: string;
    role: UserRole;
    active: boolean;
    permissions: UserPermissions;
}
