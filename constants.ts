
import { Employee, StaffType, ShiftType, SystemUser, UserRole, AboutData } from "./types";

export const DEFAULT_COMPANIES = [
  'PERFECT STAR FACILITIES MANAGEMENT SERVICES LLC - SPC',
  'PERFECT STAR CLEANING SERVICES LLC - SPC',
  'PERFECT STAR GROUP',
  'CAPTON FACILITY MANAGEMENT LLC - SPC',
  'GLOBAL PERFECT CONTRACTING & GENERAL MAINTENANCE LLC - SPC'
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
export const MOCK_EMPLOYEES: Employee[] = [
  {
    id: '1', code: '10001', name: 'Chinnathambi', designation: 'Helper', department: 'Cleaning',
    joiningDate: '2025-02-03', type: StaffType.WORKER, company: 'PERFECT STAR FACILITIES MANAGEMENT SERVICES LLC - SPC',
    status: 'Active', team: 'Internal Team', workLocation: '-', leaveBalance: 30,
    salary: { basic: 1000, housing: 0, transport: 0, other: 200, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Abu Dhabi Commercial Bank', iban: 'AEXXXXXXXXXXXXX'
  },
  {
    id: '2', code: '10002', name: 'Welder', designation: 'AC Technician', department: 'Maintenance',
    joiningDate: '2024-11-11', type: StaffType.WORKER, company: 'PERFECT STAR FACILITIES MANAGEMENT SERVICES LLC - SPC',
    status: 'Active', team: 'Internal Team', workLocation: '-', leaveBalance: 30,
    salary: { basic: 1500, housing: 0, transport: 0, other: 1000, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Emirates NBD', iban: 'AEXXXXXXXXXXXXX'
  },
  {
    id: '3', code: '10003', name: 'Samiul Haq', designation: 'Cleaner', department: 'Cleaning',
    joiningDate: '2025-07-23', type: StaffType.WORKER, company: 'PERFECT STAR FACILITIES MANAGEMENT SERVICES LLC - SPC',
    status: 'Active', team: 'Internal Team', workLocation: '-', leaveBalance: 30,
    salary: { basic: 1500, housing: 0, transport: 0, other: 300, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Commercial Bank of Dubai', iban: 'AEXXXXXXXXXXXXX'
  },
  {
    id: '4', code: '10004', name: 'Shahul', designation: 'Driver', department: 'Transportation',
    joiningDate: '2025-08-01', type: StaffType.WORKER, company: 'PERFECT STAR CLEANING SERVICES LLC - SPC',
    status: 'Active', team: 'Internal Team', workLocation: '-', leaveBalance: 30,
    salary: { basic: 1500, housing: 0, transport: 0, other: 300, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'First Abu Dhabi Bank', iban: 'AEXXXXXXXXXXXXX'
  },
  {
    id: '5', code: '10005', name: 'Kaleel', designation: 'Driver', department: 'Transportation',
    joiningDate: '2025-10-01', type: StaffType.WORKER, company: 'PERFECT STAR GROUP',
    status: 'Active', team: 'Internal Team', workLocation: '-', leaveBalance: 30,
    salary: { basic: 1000, housing: 0, transport: 0, other: 800, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Cash', iban: ''
  },
  {
    id: '6', code: '10006', name: 'Anojan', designation: 'Cradle Operator', department: 'Operations',
    joiningDate: '2025-07-23', type: StaffType.WORKER, company: 'PERFECT STAR CLEANING SERVICES LLC - SPC',
    status: 'Active', team: 'Internal Team', workLocation: '-', leaveBalance: 30,
    salary: { basic: 1000, housing: 0, transport: 0, other: 250, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Cash', iban: ''
  },
  {
    id: '7', code: '10012', name: 'Sorwar', designation: 'Cleaner', department: 'Cleaning',
    joiningDate: '2025-01-01', type: StaffType.WORKER, company: 'PERFECT STAR CLEANING SERVICES LLC - SPC',
    status: 'Active', team: 'External Team', workLocation: 'Master Cake', leaveBalance: 30,
    salary: { basic: 800, housing: 0, transport: 0, other: 200, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Cash', iban: ''
  },
  {
    id: '8', code: '10020', name: 'Momen mia', designation: 'Cleaner', department: 'Cleaning',
    joiningDate: '2025-01-01', type: StaffType.WORKER, company: 'CAPTON FACILITY MANAGEMENT LLC - SPC',
    status: 'Active', team: 'External Team', workLocation: 'TOE, Sharjah', leaveBalance: 30,
    salary: { basic: 1000, housing: 0, transport: 0, other: 200, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Cash', iban: ''
  },
  {
    id: '9', code: '10023', name: 'Jahir Hussain', designation: 'Driver', department: 'Transportation',
    joiningDate: '2025-01-01', type: StaffType.WORKER, company: 'GLOBAL PERFECT CONTRACTING & GENERAL MAINTENANCE LLC - SPC',
    status: 'Active', team: 'Internal Team', workLocation: '-', leaveBalance: 30,
    salary: { basic: 1500, housing: 0, transport: 0, other: 300, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Cash', iban: ''
  },
  {
    id: '10', code: '1001', name: 'Basheer Noordeen', designation: 'HR Officer', department: 'Human Resources',
    joiningDate: '2024-11-11', type: StaffType.OFFICE, company: 'PERFECT STAR FACILITIES MANAGEMENT SERVICES LLC - SPC',
    status: 'Active', team: 'Internal Team', workLocation: 'Head Office, Abu Dhabi', leaveBalance: 30,
    salary: { basic: 4500, housing: 0, transport: 0, other: 0, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Abu Dhabi Commercial Bank', iban: 'AEXXXXXXXXXXXXX'
  },
  {
    id: '11', code: '1002', name: 'Mohamed Bilal', designation: 'Procurement Officer', department: 'Procurement',
    joiningDate: '2024-10-24', type: StaffType.OFFICE, company: 'PERFECT STAR FACILITIES MANAGEMENT SERVICES LLC - SPC',
    status: 'Active', team: 'Internal Team', workLocation: 'Head Office, Abu Dhabi', leaveBalance: 30,
    salary: { basic: 1500, housing: 0, transport: 0, other: 1000, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Emirates NBD', iban: 'AEXXXXXXXXXXXXX'
  },
  {
    id: '12', code: '1008', name: 'Arif Deen', designation: 'Store In-charge', department: 'Inventory',
    joiningDate: '2025-07-01', type: StaffType.OFFICE, company: 'PERFECT STAR GROUP',
    status: 'Active', team: 'Internal Team', workLocation: 'Head Office, Abu Dhabi', leaveBalance: 30,
    salary: { basic: 1000, housing: 0, transport: 0, other: 500, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Cash', iban: ''
  },
  {
    id: '13', code: '10045', name: 'Kareem', designation: 'Cleaner', department: 'Cleaning',
    joiningDate: '2025-01-01', type: StaffType.WORKER, company: 'PERFECT STAR GROUP',
    status: 'Active', team: 'External Team', workLocation: 'Technicial, Abu Dhabi', leaveBalance: 30,
    salary: { basic: 1000, housing: 0, transport: 0, other: 500, airTicket: 0, leaveSalary: 0 }, active: true, bankName: 'Cash', iban: ''
  }
];

export const STORAGE_KEYS = {
  EMPLOYEES: 'shiftsync_employees_v2',
  ATTENDANCE: 'shiftsync_attendance_v2',
  LEAVE_REQUESTS: 'shiftsync_leave_requests_v1',
  PUBLIC_HOLIDAYS: 'shiftsync_public_holidays_v1',
  COMPANIES: 'shiftsync_companies_v1',
  USERS: 'shiftsync_users_v1',
  ABOUT: 'shiftsync_about_v1'
};
