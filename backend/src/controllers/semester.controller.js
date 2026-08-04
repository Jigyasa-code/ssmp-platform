const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const Semester = require('../models/Semester');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/responseHandler');

// Parse a buffer containing XLSX or CSV data.
// NOTE: Legacy .xls (binary Excel) is NOT supported — ExcelJS only reads .xlsx (OOXML).
//       The HOD upload UI should only accept .xlsx and .csv files.
const parseBufferData = async (file) => {
  if (file.originalname.endsWith('.csv')) {
    // ── CSV path: custom parser, no third-party library ──────────────────────
    const csvString = file.buffer.toString('utf8');
    const lines = csvString.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    // Simple CSV parser supporting double-quoted fields
    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]);
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length >= headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        data.push(row);
      }
    }
    return data;
  } else {
    // ── Excel path: ExcelJS (replaces vulnerable xlsx package) ───────────────
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) return [];

    const headers = [];
    const data = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // Extract headers from first row
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          headers[colNumber] = String(cell.value || '').trim();
        });
      } else {
        const rowObj = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (headers[colNumber]) {
            rowObj[headers[colNumber]] = cell.value !== null && cell.value !== undefined
              ? String(cell.value).trim()
              : '';
          }
        });
        if (Object.keys(rowObj).length > 0) {
          data.push(rowObj);
        }
      }
    });

    return data;
  }
};


// Step 1: Create a new semester initialization wizard
const startSemesterInit = async (req, res, next) => {
  try {
    const { academicYear, term } = req.body;

    if (!academicYear || !term) {
      return sendError(res, 'Academic year and term are required', 400);
    }

    // Reset previous setup of same name or create new one
    await Semester.deleteMany({ isInitialized: false });

    const semester = new Semester({
      academicYear,
      term,
      currentStep: 1
    });

    await semester.save();
    return sendSuccess(res, 'Semester initialization started', { semester });
  } catch (error) {
    next(error);
  }
};

// Get current active (incomplete) semester setup
const getCurrentSetup = async (req, res, next) => {
  try {
    let semester = await Semester.findOne({ isInitialized: false });
    if (!semester) {
      // Return details of the last initialized semester
      semester = await Semester.findOne({ isInitialized: true }).sort({ updatedAt: -1 });
    }
    return sendSuccess(res, 'Semester details retrieved', { semester });
  } catch (error) {
    next(error);
  }
};

// Step 2: Upload Faculty details file
const uploadFaculty = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 'Please upload a faculty list file', 400);
    }

    const semester = await Semester.findOne({ isInitialized: false });
    if (!semester) {
      return sendError(res, 'No active semester initialization in progress. Please start Step 1.', 400);
    }

    const rawData = await parseBufferData(req.file);

    // Validate headers
    if (rawData.length === 0) {
      return sendError(res, 'The uploaded file is empty', 400);
    }

    const firstRow = rawData[0];
    // Standardize keys (looking for variations of Faculty ID, Name, Dept, Email)
    const normalizedData = rawData.map(row => {
      const facultyId = row['Faculty ID'] || row['facultyId'] || row['ID'] || row['id'];
      const name = row['Name'] || row['name'] || row['Faculty Name'];
      const dept = row['Dept'] || row['dept'] || row['Department'] || row['department'];
      const email = row['Email'] || row['email'];
      return { facultyId, name, dept, email };
    });

    // Check mapping validity
    const invalidRows = normalizedData.filter(row => !row.facultyId || !row.name || !row.email);
    if (invalidRows.length > 0) {
      return sendError(res, 'Rows must contain valid Faculty ID, Name, and Email columns', 400);
    }

    semester.facultyData = normalizedData;
    semester.currentStep = 2;
    await semester.save();

    return sendSuccess(res, 'Faculty data parsed and uploaded successfully', { 
      semester,
      count: normalizedData.length,
      sample: normalizedData.slice(0, 5)
    });
  } catch (error) {
    next(error);
  }
};

// Step 3: Upload Student details file
const uploadStudent = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 'Please upload a student list file', 400);
    }

    const semester = await Semester.findOne({ isInitialized: false });
    if (!semester) {
      return sendError(res, 'No active semester initialization in progress. Please start Step 1.', 400);
    }

    const rawData = await parseBufferData(req.file);

    if (rawData.length === 0) {
      return sendError(res, 'The uploaded file is empty', 400);
    }

    // Standardize keys (looking for Reg. No, Student Name, Section, Branch, Email)
    const normalizedData = rawData.map(row => {
      const regNo = row['Reg. No'] || row['regNo'] || row['Reg. No.'] || row['Registration No'] || row['Registration Number'];
      const name = row['Student Name'] || row['name'] || row['Name'] || row['Student name'];
      const section = row['Section'] || row['section'] || 'A';
      const branch = row['Branch'] || row['branch'] || 'CSE';
      const email = row['Email'] || row['email'];
      return { regNo, name, section, branch, email };
    });

    // Check validity
    const invalidRows = normalizedData.filter(row => !row.regNo || !row.name || !row.email);
    if (invalidRows.length > 0) {
      return sendError(res, 'Rows must contain valid Reg. No, Student Name, and Email columns', 400);
    }

    semester.studentData = normalizedData;
    semester.currentStep = 3;
    await semester.save();

    return sendSuccess(res, 'Student data parsed and uploaded successfully', { 
      semester,
      count: normalizedData.length,
      sample: normalizedData.slice(0, 5)
    });
  } catch (error) {
    next(error);
  }
};

// Step 4: Validate Onboarding data structure and resolve overlap warnings
const validateData = async (req, res, next) => {
  try {
    const semester = await Semester.findOne({ isInitialized: false });
    if (!semester) {
      return sendError(res, 'No active semester setup in progress', 400);
    }

    if (semester.facultyData.length === 0 || semester.studentData.length === 0) {
      return sendError(res, 'Both Student and Faculty lists must be uploaded first', 400);
    }

    const anomalies = [];

    // Check duplicates in Faculty ID
    const facIds = semester.facultyData.map(f => f.facultyId);
    const dupFacIds = facIds.filter((id, index) => facIds.indexOf(id) !== index);
    if (dupFacIds.length > 0) {
      anomalies.push(`Duplicate Faculty IDs: ${[...new Set(dupFacIds)].join(', ')}`);
    }

    // Check duplicates in Student Reg No
    const studentRegNos = semester.studentData.map(s => s.regNo);
    const dupRegNos = studentRegNos.filter((no, index) => studentRegNos.indexOf(no) !== index);
    if (dupRegNos.length > 0) {
      anomalies.push(`Duplicate Student Registration Numbers: ${[...new Set(dupRegNos)].join(', ')}`);
    }

    // Check duplicates in Emails
    const emails = [...semester.facultyData.map(f => f.email), ...semester.studentData.map(s => s.email)];
    const dupEmails = emails.filter((email, index) => emails.indexOf(email) !== index);
    if (dupEmails.length > 0) {
      anomalies.push(`Duplicate email addresses across dataset: ${[...new Set(dupEmails)].join(', ')}`);
    }

    // Verify existing database overlap
    const existingEmails = await User.find({ email: { $in: emails } }).select('email');
    if (existingEmails.length > 0) {
      anomalies.push(`Emails already registered in system database: ${existingEmails.map(e => e.email).join(', ')}`);
    }

    semester.currentStep = 4;
    await semester.save();

    return sendSuccess(res, 'Data validation run completed', {
      semester,
      isValid: anomalies.length === 0,
      warnings: anomalies
    });
  } catch (error) {
    next(error);
  }
};

// Step 5: Finalize setup, save to User collection, link student-mentor, generate passwords
const finalizeSemester = async (req, res, next) => {
  try {
    const semester = await Semester.findOne({ isInitialized: false });
    if (!semester) {
      return sendError(res, 'No active semester setup in progress', 400);
    }

    if (semester.currentStep < 4) {
      return sendError(res, 'Please run Validation check (Step 4) first', 400);
    }

    const { facultyData, studentData } = semester;

    // Create Faculty accounts
    const facultyMap = {}; // mapping facultyId -> Mongo User Object
    const facultyCreated = [];

    // BCrypt hashing (12 rounds)
    const salt = await bcrypt.genSalt(12);

    for (const fac of facultyData) {
      const tempPassword = `fac_${fac.facultyId}`;
      const passwordHash = await bcrypt.hash(tempPassword, salt);

      const user = new User({
        name: fac.name,
        email: fac.email,
        loginId: fac.facultyId,
        passwordHash,
        role: 'faculty',
        branch: fac.dept,
        tempPasswordUsed: false
      });

      await user.save();
      facultyMap[fac.facultyId] = user;
      facultyCreated.push({
        id: fac.facultyId,
        name: fac.name,
        email: fac.email,
        tempPassword
      });
    }

    // Separate faculty by branch/dept to distribute students logically
    const facultyByBranch = {};
    Object.values(facultyMap).forEach(fac => {
      const branch = (fac.branch || 'CSE').toUpperCase().trim();
      if (!facultyByBranch[branch]) {
        facultyByBranch[branch] = [];
      }
      facultyByBranch[branch].push(fac);
    });

    const studentsCreated = [];

    // Create Student accounts and assign mentors
    for (let i = 0; i < studentData.length; i++) {
      const stu = studentData[i];
      const tempPassword = `stu_${stu.regNo}`;
      const passwordHash = await bcrypt.hash(tempPassword, salt);

      // Find available faculty for this branch (round-robin)
      const branchKey = (stu.branch || 'CSE').toUpperCase().trim();
      const activeFacultyInBranch = facultyByBranch[branchKey] || facultyByBranch['CSE'] || Object.values(facultyMap);

      let assignedMentor = null;
      if (activeFacultyInBranch && activeFacultyInBranch.length > 0) {
        // Assign round robin
        const mentorIndex = i % activeFacultyInBranch.length;
        assignedMentor = activeFacultyInBranch[mentorIndex];
      }

      const studentUser = new User({
        name: stu.name,
        email: stu.email,
        loginId: stu.regNo,
        passwordHash,
        role: 'student',
        section: stu.section,
        branch: stu.branch,
        semester: `${semester.term === 'Odd' ? '1st' : '2nd'} Semester`,
        assignedMentor: assignedMentor ? assignedMentor._id : null,
        tempPasswordUsed: false
      });

      await studentUser.save();

      // Update mentor's assigned student list
      if (assignedMentor) {
        assignedMentor.assignedStudents.push(studentUser._id);
        await assignedMentor.save();
      }

      studentsCreated.push({
        regNo: stu.regNo,
        name: stu.name,
        email: stu.email,
        assignedMentor: assignedMentor ? assignedMentor.name : 'None',
        tempPassword
      });
    }

    // Mark semester setup as complete
    semester.isInitialized = true;
    semester.currentStep = 5;
    await semester.save();

    return sendSuccess(res, 'Academic semester fully initialized and users onboarded', {
      academicYear: semester.academicYear,
      term: semester.term,
      facultyCount: facultyCreated.length,
      studentCount: studentsCreated.length,
      facultyCredentials: facultyCreated,
      studentCredentials: studentsCreated
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  startSemesterInit,
  getCurrentSetup,
  uploadFaculty,
  uploadStudent,
  validateData,
  finalizeSemester
};
