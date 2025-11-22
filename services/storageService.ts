import { Employee, AttendanceRecord, AttendanceStatus, StaffType, ShiftType, LeaveRequest, LeaveStatus, PublicHoliday, OffboardingDetails, SystemUser, UserRole, AboutData, DeductionRecord } from "../types";
import { MOCK_EMPLOYEES, STORAGE_KEYS, DEFAULT_COMPANIES, DEFAULT_ADMIN, CREATOR_USER, DEFAULT_ABOUT_DATA } from "../constants";

// Simulate database initialization
const initStorage = () => {
  if (!localStorage.getItem(STORAGE_KEYS.EMPLOYEES)) {
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(MOCK_EMPLOYEES));
  }
  if (!localStorage.getItem(STORAGE_KEYS.ATTENDANCE)) {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.LEAVE_REQUESTS)) {
    localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.PUBLIC_HOLIDAYS)) {
      localStorage.setItem(STORAGE_KEYS.PUBLIC_HOLIDAYS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.COMPANIES)) {
      localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(DEFAULT_COMPANIES));
  }
  if (!localStorage.getItem(STORAGE_KEYS.ABOUT)) {
      localStorage.setItem(STORAGE_KEYS.ABOUT, JSON.stringify(DEFAULT_ABOUT_DATA));
  }
  if (!localStorage.getItem(STORAGE_KEYS.DEDUCTIONS)) {
      localStorage.setItem(STORAGE_KEYS.DEDUCTIONS, JSON.stringify([]));
  }
  
  // Initialize users logic
  let users: SystemUser[] = [];
  const usersData = localStorage.getItem(STORAGE_KEYS.USERS);
  if (usersData) {
      users = JSON.parse(usersData);
  } else {
      users = [DEFAULT_ADMIN];
  }

  // Ensure Creator exists
  const creatorExists = users.find(u => u.username === CREATOR_USER.username);
  if (!creatorExists) {
      users.push(CREATOR_USER);
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  } else if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      // First time init
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }
};

export const getEmployees = (): Employee[] => {
  initStorage();
  const data = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
  return data ? JSON.parse(data) : [];
};

export const saveEmployee = (employee: Employee) => {
  const employees = getEmployees();
  const index = employees.findIndex(e => e.id === employee.id);
  if (index >= 0) {
    employees[index] = employee;
  } else {
    employees.push(employee);
  }
  localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
  return employees;
};

export const updateEmployee = (employee: Employee) => {
    // Same as save, but explicit semantic name
    return saveEmployee(employee);
};

export const offboardEmployee = (id: string, details: OffboardingDetails) => {
    const employees = getEmployees();
    const index = employees.findIndex(e => e.id === id);
    if (index === -1) throw new Error("Employee not found");

    employees[index].status = 'Inactive';
    employees[index].active = false;
    employees[index].offboardingDetails = details;

    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    return employees;
};

export const rehireEmployee = (id: string, rejoiningDate: string, reason: string) => {
    const employees = getEmployees();
    const index = employees.findIndex(e => e.id === id);
    if (index === -1) throw new Error("Employee not found");

    // Reactivate
    employees[index].status = 'Active';
    employees[index].active = true;
    
    // Important: Update joining date to new date so payroll/attendance calculations start fresh
    // You might want to store the ORIGINAL joining date in a history array in a real app
    employees[index].joiningDate = rejoiningDate; 
    employees[index].rejoiningDate = rejoiningDate;
    employees[index].rejoiningReason = reason;
    
    // Clear offboarding details so they don't show up as "Offboarded" in UI logic
    employees[index].offboardingDetails = undefined;

    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    return employees;
};

export const getAttendanceRange = (startDateStr: string, endDateStr: string): AttendanceRecord[] => {
    initStorage();
    const allRecords: AttendanceRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE) || '[]');
    return allRecords.filter(r => r.date >= startDateStr && r.date <= endDateStr);
};

export const logAttendance = (
  employeeId: string, 
  status: AttendanceStatus,
  dateOverride?: string,
  overtimeHours?: number,
  otAttachment?: string,
  updatedBy?: string,
  note?: string
): AttendanceRecord => {
  const employees = getEmployees();
  const employee = employees.find(e => e.id === employeeId);
  if (!employee) throw new Error("Employee not found");

  const now = new Date();
  // Fix for Timezone Issue: Use local date string construction instead of toISOString() which shifts to UTC
  let dateStr = dateOverride;
  if (!dateStr) {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      dateStr = `${year}-${month}-${day}`;
  }

  const allRecords: AttendanceRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE) || '[]');
  
  let recordIndex = allRecords.findIndex(r => r.employeeId === employeeId && r.date === dateStr);
  let record: AttendanceRecord;

  // Determine hours based on status
  let hours = 0;
  if (status === AttendanceStatus.PRESENT) hours = 8;
  
  if (recordIndex === -1) {
    record = {
      id: Math.random().toString(36).substr(2, 9),
      employeeId,
      date: dateStr,
      status: status,
      hoursWorked: hours,
      overtimeHours: overtimeHours || 0,
      checkInTime: status === AttendanceStatus.PRESENT ? new Date().toISOString() : undefined,
      otAttachment: otAttachment,
      updatedBy: updatedBy || 'System',
      note: note
    };
    allRecords.push(record);
  } else {
    record = allRecords[recordIndex];
    record.status = status;
    record.hoursWorked = hours;
    record.updatedBy = updatedBy || 'System';
    
    if (note !== undefined) {
        record.note = note;
    }
    
    // Update overtime if provided, otherwise keep existing or default to 0
    if (overtimeHours !== undefined) {
        record.overtimeHours = overtimeHours;
    } else if (record.overtimeHours === undefined) {
        record.overtimeHours = 0;
    }

    // Update attachment if provided
    if (otAttachment !== undefined) {
        record.otAttachment = otAttachment;
    }

    if (status === AttendanceStatus.PRESENT && !record.checkInTime) {
        record.checkInTime = new Date().toISOString();
    }
    allRecords[recordIndex] = record;
  }

  localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(allRecords));
  return record;
};

export const deleteAttendanceRecord = (employeeId: string, date: string) => {
    initStorage();
    let allRecords: AttendanceRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE) || '[]');
    const initialLength = allRecords.length;
    allRecords = allRecords.filter(r => !(r.employeeId === employeeId && r.date === date));
    
    if (allRecords.length !== initialLength) {
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(allRecords));
        return true;
    }
    return false;
};

export const copyDayAttendance = (sourceDate: string, targetDate: string, user: string) => {
    initStorage();
    const allRecords: AttendanceRecord[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE) || '[]');
    
    // Find all records for the source date
    const sourceRecords = allRecords.filter(r => r.date === sourceDate);
    if (sourceRecords.length === 0) return 0;

    let count = 0;
    sourceRecords.forEach(src => {
        logAttendance(
            src.employeeId, 
            src.status, 
            targetDate, 
            src.overtimeHours, 
            src.otAttachment, 
            user, 
            `Copied from ${sourceDate}`
        );
        count++;
    });

    return count;
};

// --- IMPORT / EXPORT ---

export const exportToCSV = () => {
    const records = getAttendanceRange('2020-01-01', '2030-12-31'); // Get all
    const employees = getEmployees();
    const empMap = new Map(employees.map(e => [e.id, e]));

    if (records.length === 0) return;

    const headers = ['Date', 'Employee Code', 'Employee Name', 'Designation', 'Company', 'Status', 'Hours', 'Overtime', 'Attachment', 'Updated By', 'Notes'];
    const csvContent = [
        headers.join(','),
        ...records.map(r => {
            const emp = empMap.get(r.employeeId);
            return [
                r.date,
                emp?.code || '',
                `"${emp?.name || 'Unknown'}"`,
                `"${emp?.designation || ''}"`,
                `"${emp?.company || ''}"`,
                r.status,
                r.hoursWorked,
                r.overtimeHours || 0,
                r.otAttachment ? 'Yes' : 'No',
                r.updatedBy || '',
                `"${r.note || ''}"`
            ].join(',');
        })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `perfect_star_attendance.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const importAttendanceFromCSV = (csvText: string): { success: number, errors: string[] } => {
    const lines = csvText.split('\n');
    const employees = getEmployees();
    let success = 0;
    const errors: string[] = [];

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Basic CSV parsing (assuming simple comma separation, no quoted commas for now)
        const parts = line.split(',');
        if (parts.length < 3) {
            errors.push(`Row ${i + 1}: Invalid format`);
            continue;
        }

        const code = parts[0].trim(); // Assuming first column is Code or Date
        const date = parts[1].trim(); // Assuming second column is Date
        const status = parts[2].trim();
        const ot = parseFloat(parts[3]?.trim() || '0');

        // Helper to find employee by code
        const emp = employees.find(e => e.code === code);
        
        if (!emp) {
            errors.push(`Row ${i+1}: Employee code '${code}' not found.`);
            continue;
        }

        let formattedDate = date;
        // Check for DD/MM/YYYY
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
             const [d, m, y] = date.split('/');
             formattedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        } 
        // Check for YYYY/MM/DD (New Requirement)
        else if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(date)) {
             const [y, m, d] = date.split('/');
             formattedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        // Check for YYYY-MM-DD (Standard)
        else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
             formattedDate = date;
        } else {
             errors.push(`Row ${i+1}: Invalid date format '${date}'. Use YYYY/MM/DD, DD/MM/YYYY or YYYY-MM-DD.`);
             continue;
        }

        try {
            logAttendance(emp.id, status as AttendanceStatus, formattedDate, ot);
            success++;
        } catch (e) {
            errors.push(`Row ${i+1}: Error saving record.`);
        }
    }
    return { success, errors };
};

export const importEmployeesFromCSV = (csvText: string): { success: number, errors: string[] } => {
    const lines = csvText.split('\n');
    let success = 0;
    const errors: string[] = [];
    const employees = getEmployees();
    
    // Header expectation:
    // Code, Name, Designation, Department, Company, JoiningDate, Type, Status, Team, Location, Basic, Housing, Transport, Other, AirTicket, LeaveSalary, EmiratesID, EIDExpiry, Passport, PassExpiry, LabourCard, LCExpiry, VacationDate
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
  
      const parts = line.split(',');
      if (parts.length < 2) continue; 
  
      const code = parts[0]?.trim();
      const name = parts[1]?.trim();
      const designation = parts[2]?.trim() || '';
      const department = parts[3]?.trim() || '';
      const company = parts[4]?.trim() || '';
      const joiningDate = parts[5]?.trim() || new Date().toISOString().split('T')[0];
      const typeRaw = parts[6]?.trim();
      const statusRaw = parts[7]?.trim();
      const teamRaw = parts[8]?.trim();
      const workLocation = parts[9]?.trim() || '';
      const basic = parseFloat(parts[10]?.trim() || '0') || 0;
      const housing = parseFloat(parts[11]?.trim() || '0') || 0;
      const transport = parseFloat(parts[12]?.trim() || '0') || 0;
      const other = parseFloat(parts[13]?.trim() || '0') || 0;
      const airTicket = parseFloat(parts[14]?.trim() || '0') || 0;
      const leaveSalary = parseFloat(parts[15]?.trim() || '0') || 0;

      const emiratesId = parts[16]?.trim();
      const eidExpiry = parts[17]?.trim();
      const passport = parts[18]?.trim();
      const passExpiry = parts[19]?.trim();
      const labourCard = parts[20]?.trim();
      const lcExpiry = parts[21]?.trim();
      const vacationDate = parts[22]?.trim();
  
      if (!code || !name) {
          errors.push(`Row ${i+1}: Missing Code or Name`);
          continue;
      }
  
      // Check existing
      const existingIndex = employees.findIndex(e => e.code === code);
      
      // Logic to parse Team properly
      let parsedTeam: 'Internal Team' | 'External Team' | 'Office Staff' = 'Internal Team';
      if (teamRaw === 'External Team') parsedTeam = 'External Team';
      else if (teamRaw === 'Office Staff') parsedTeam = 'Office Staff';

      const empData: Employee = {
          id: existingIndex >= 0 ? employees[existingIndex].id : Math.random().toString(36).substr(2, 9),
          code,
          name: name.replace(/^"|"$/g, ''),
          designation,
          department,
          company: company || DEFAULT_COMPANIES[0],
          joiningDate,
          type: (typeRaw === 'Staff' || typeRaw === 'Worker') ? typeRaw as StaffType : StaffType.WORKER,
          status: (statusRaw === 'Active' || statusRaw === 'Inactive') ? statusRaw as 'Active' | 'Inactive' : 'Active',
          team: parsedTeam,
          workLocation,
          leaveBalance: existingIndex >= 0 ? employees[existingIndex].leaveBalance : 30,
          salary: { basic, housing, transport, other, airTicket, leaveSalary },
          active: statusRaw !== 'Inactive',
          bankName: existingIndex >= 0 ? employees[existingIndex].bankName : undefined,
          iban: existingIndex >= 0 ? employees[existingIndex].iban : undefined,
          documents: {
              emiratesId,
              emiratesIdExpiry: eidExpiry,
              passportNumber: passport,
              passportExpiry: passExpiry,
              labourCardNumber: labourCard,
              labourCardExpiry: lcExpiry
          },
          vacationScheduledDate: vacationDate
      };
  
      if (existingIndex >= 0) {
          employees[existingIndex] = empData;
      } else {
          employees.push(empData);
      }
      success++;
    }
    
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    return { success, errors };
  };

// Mock function to seed random attendance for the month if empty (for demo purposes)
export const seedMonthlyData = (year: number, month: number) => {
    initStorage();
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.ATTENDANCE) || '[]');
    if (existing.length > 50) return; // Don't overwrite if data exists

    const employees = getEmployees();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const newRecords: AttendanceRecord[] = [];

    employees.forEach(emp => {
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dateObj = new Date(year, month, day);
            const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
            
            // Default logic: Sunday is Week Off (W), others Present (P)
            let status = AttendanceStatus.PRESENT;
            if (dayOfWeek === 0) status = AttendanceStatus.WEEK_OFF;
            
            // Randomly assign some PH or A
            if (Math.random() > 0.95 && status === AttendanceStatus.PRESENT) status = AttendanceStatus.ABSENT;

            // Random overtime for present days (20% chance)
            let ot = 0;
            if (status === AttendanceStatus.PRESENT && Math.random() > 0.8) {
                ot = Math.floor(Math.random() * 4) + 1; // 1 to 4 hours
            }

            newRecords.push({
                id: Math.random().toString(36).substr(2, 9),
                employeeId: emp.id,
                date: dateStr,
                status,
                hoursWorked: status === AttendanceStatus.PRESENT ? 8 : 0,
                overtimeHours: ot,
                updatedBy: 'System'
            });
        }
    });
    
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify([...existing, ...newRecords]));
    window.location.reload();
};

// ... (Rest of the functions remain the same: getLeaveRequests, saveLeaveRequest, etc.)
// Only ensuring imports/exports are valid.
export const getLeaveRequests = (): LeaveRequest[] => {
  initStorage();
  const data = localStorage.getItem(STORAGE_KEYS.LEAVE_REQUESTS);
  return data ? JSON.parse(data) : [];
};

export const saveLeaveRequest = (request: Omit<LeaveRequest, 'id' | 'status' | 'appliedOn'>) => {
  const requests = getLeaveRequests();
  const newRequest: LeaveRequest = {
    ...request,
    id: Math.random().toString(36).substr(2, 9),
    status: LeaveStatus.PENDING,
    appliedOn: new Date().toISOString().split('T')[0]
  };
  requests.push(newRequest);
  localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(requests));
  return newRequest;
};

export const updateLeaveRequestStatus = (id: string, status: LeaveStatus) => {
  const requests = getLeaveRequests();
  const index = requests.findIndex(r => r.id === id);
  if (index === -1) return;

  requests[index].status = status;
  localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(requests));

  // If Approved, auto-update the timesheet attendance AND Leave Balance
  if (status === LeaveStatus.APPROVED) {
    const req = requests[index];
    const start = new Date(req.startDate);
    const end = new Date(req.endDate);
    
    // 1. Update Timesheet
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
       const dateStr = d.toISOString().split('T')[0];
       logAttendance(req.employeeId, req.type, dateStr);
    }

    // 2. Deduct Leave Balance (Only for Annual and Sick Leave)
    if (req.type === AttendanceStatus.ANNUAL_LEAVE || req.type === AttendanceStatus.SICK_LEAVE) {
        const employees = getEmployees();
        const empIndex = employees.findIndex(e => e.id === req.employeeId);
        if (empIndex !== -1) {
            // Calculate days difference (inclusive)
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
            
            // Deduct
            employees[empIndex].leaveBalance = Math.max(0, employees[empIndex].leaveBalance - diffDays);
            
            // Save
            localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
        }
    }
  }
};

export const getPublicHolidays = (): PublicHoliday[] => {
    initStorage();
    const data = localStorage.getItem(STORAGE_KEYS.PUBLIC_HOLIDAYS);
    return data ? JSON.parse(data) : [];
}

export const savePublicHoliday = (holiday: PublicHoliday) => {
    const holidays = getPublicHolidays();
    holidays.push(holiday);
    localStorage.setItem(STORAGE_KEYS.PUBLIC_HOLIDAYS, JSON.stringify(holidays));

    // Auto-apply to attendance for all active employees
    const employees = getEmployees().filter(e => e.active);
    employees.forEach(emp => {
        logAttendance(emp.id, AttendanceStatus.PUBLIC_HOLIDAY, holiday.date);
    });

    return holidays;
}

export const deletePublicHoliday = (id: string) => {
    const holidays = getPublicHolidays();
    const updated = holidays.filter(h => h.id !== id);
    localStorage.setItem(STORAGE_KEYS.PUBLIC_HOLIDAYS, JSON.stringify(updated));
    return updated;
}

export const getCompanies = (): string[] => {
    initStorage();
    const data = localStorage.getItem(STORAGE_KEYS.COMPANIES);
    return data ? JSON.parse(data) : DEFAULT_COMPANIES;
}

export const addCompany = (name: string): string[] => {
    const companies = getCompanies();
    if (!companies.includes(name)) {
        companies.push(name);
        localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
    }
    return companies;
}

export const updateCompany = (oldName: string, newName: string): string[] => {
    const companies = getCompanies();
    const index = companies.indexOf(oldName);
    if (index !== -1) {
        companies[index] = newName;
        localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
    }
    return companies;
}

export const deleteCompany = (name: string): string[] => {
    let companies = getCompanies();
    companies = companies.filter(c => c !== name);
    localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
    return companies;
}

export const getSystemUsers = (): SystemUser[] => {
    initStorage();
    const data = localStorage.getItem(STORAGE_KEYS.USERS);
    return data ? JSON.parse(data) : [DEFAULT_ADMIN];
}

export const addSystemUser = (user: SystemUser): SystemUser[] => {
    const users = getSystemUsers();
    if (users.some(u => u.username === user.username)) {
        throw new Error("Username already exists");
    }
    users.push(user);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    return users;
}

export const updateSystemUser = (username: string, updatedUser: SystemUser): SystemUser[] => {
    const users = getSystemUsers();
    const index = users.findIndex(u => u.username === username);
    if (index === -1) throw new Error("User not found");
    
    // Check username uniqueness if changed
    if (username !== updatedUser.username && users.some(u => u.username === updatedUser.username)) {
         throw new Error("Username already taken");
    }

    users[index] = updatedUser;
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    return users;
}

export const deleteSystemUser = (username: string): SystemUser[] => {
    let users = getSystemUsers();
    // Prevent deleting self if admin/creator logic is needed, but UI handles some.
    if (username === DEFAULT_ADMIN.username || username === CREATOR_USER.username) {
        throw new Error("Cannot delete default admin or creator.");
    }
    
    users = users.filter(u => u.username !== username);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    return users;
}

export const getAboutData = (): AboutData => {
    initStorage();
    const data = localStorage.getItem(STORAGE_KEYS.ABOUT);
    return data ? JSON.parse(data) : DEFAULT_ABOUT_DATA;
}

export const saveAboutData = (data: AboutData) => {
    localStorage.setItem(STORAGE_KEYS.ABOUT, JSON.stringify(data));
}

export const getDeductions = (): DeductionRecord[] => {
    initStorage();
    const data = localStorage.getItem(STORAGE_KEYS.DEDUCTIONS);
    return data ? JSON.parse(data) : [];
};

export const saveDeduction = (deduction: Omit<DeductionRecord, 'id'>) => {
    const deductions = getDeductions();
    const newRecord: DeductionRecord = {
        ...deduction,
        id: Math.random().toString(36).substr(2, 9)
    };
    deductions.push(newRecord);
    localStorage.setItem(STORAGE_KEYS.DEDUCTIONS, JSON.stringify(deductions));
    return deductions;
};

export const deleteDeduction = (id: string) => {
    const deductions = getDeductions();
    const updated = deductions.filter(d => d.id !== id);
    localStorage.setItem(STORAGE_KEYS.DEDUCTIONS, JSON.stringify(updated));
    return updated;
};
