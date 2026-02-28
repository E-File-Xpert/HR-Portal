
import { Employee, StaffType, ShiftType, SystemUser, UserRole, AboutData } from "./types";

export const DEFAULT_COMPANIES = [
  'Al Reem Cosmetics & Beauty Equipments Trading',
  'Al Reem Henna And Beauty Saloon. Branch',
  'Al Reem Henna & Beauty Saloon',
  'Al Reem Henna And Beauty Saloon Branch 2',
  'Salina Henna & Beauty Saloon',
  'Naqsh Al Reem Heena & Beauty',
  'Bait Al Reem Hena And Beauty Saloon O.P.C L.L.C',
  'Saloon Bait Alnaqsha L L C'
];

// Known Public Holidays (YYYY-MM-DD)
export const PUBLIC_HOLIDAYS = [
    '2025-12-02', // UAE National Day
    '2025-12-25'  // Christmas
];

// Default Admin User
export const DEFAULT_ADMIN: SystemUser = {
    username: 'admin',
    password: '123', // Simple for demo
    name: 'System Administrator',
    role: UserRole.ADMIN,
    active: true,
    permissions: {
        canViewDashboard: true,
        canManageEmployees: true,
        canViewDirectory: true,
        canManageAttendance: true,
        canViewTimesheet: true,
        canManageLeaves: true,
        canViewPayroll: true,
        canManagePayroll: true,
        canViewReports: true,
        canManageUsers: true,
        canManageSettings: true
    }
};

export const CREATOR_USER: SystemUser = {
    username: 'abdulkaderp3010@gmail.com',
    password: 'Haji@3010',
    name: 'Mohamed Abdul Kader',
    role: UserRole.CREATOR,
    active: true,
    permissions: {
        canViewDashboard: true,
        canManageEmployees: true,
        canViewDirectory: true,
        canManageAttendance: true,
        canViewTimesheet: true,
        canManageLeaves: true,
        canViewPayroll: true,
        canManagePayroll: true,
        canViewReports: true,
        canManageUsers: true,
        canManageSettings: true
    }
};

export const DEFAULT_ABOUT_DATA: AboutData = {
    name: 'Mohamed Abdul Kader',
    title: 'Full Stack Developer & System Architect',
    bio: 'Passionate developer dedicated to building efficient, user-friendly workforce management solutions. Expert in React, modern web technologies, and system automation.',
    profileImage: '', // Will default to placeholder in UI if empty
    email: 'abdulkaderp3010@gmail.com',
    contactInfo: 'Contact for support and custom development.'
};

// Data extracted from PDF Pages 1-4
export const MOCK_EMPLOYEES: Employee[] = [];

export const STORAGE_KEYS = {
  EMPLOYEES: 'shiftsync_employees_v2',
  ATTENDANCE: 'shiftsync_attendance_v2',
  LEAVE_REQUESTS: 'shiftsync_leave_requests_v1',
  PUBLIC_HOLIDAYS: 'shiftsync_public_holidays_v1',
  COMPANIES: 'shiftsync_companies_v1',
  COMPANY_PROFILES: 'shiftsync_company_profiles_v1',
  USERS: 'shiftsync_users_v1',
  ABOUT: 'shiftsync_about_v1',
  DEDUCTIONS: 'shiftsync_deductions_v1'
};
