const dotenv = require('dotenv');
const app = require('./app');
const connectDB = require('./config/db');
const User = require('./models/User');
const Ticket = require('./models/Ticket');
const bcrypt = require('bcryptjs');

// Load environment variables
dotenv.config();

// ============================================================
// STARTUP VALIDATION — Fail fast on missing critical env vars
// ============================================================
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'MONGO_URI'];
const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error('\n❌ FATAL: Missing required environment variables:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error('\nCopy backend/.env.example to backend/.env and fill in all required values.');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

// Seed HOD if it doesn't exist
const seedHodAccount = async () => {
  try {
    const hod = await User.findOne({ role: 'hod' });
    if (!hod) {
      console.log('Seeding default HOD account...');
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash('Password123', salt);
      
      const defaultHod = new User({
        name: 'Dr. Sarah Jenkins',
        email: 'hod@muj.manipal.edu',
        loginId: 'hod',
        passwordHash,
        role: 'hod',
        tempPasswordUsed: true
      });
      
      await defaultHod.save();
      console.log('Default HOD user created: loginId="hod", password="Password123"');
    } else {
      console.log('HOD account exists: loginId="hod"');
    }
  } catch (error) {
    console.error('Seeding HOD account failed:', error);
  }
};

// Seed dummy test data (Mentors, Students, Tickets)
const seedDummyTestData = async () => {
  try {
    const facultyCount = await User.countDocuments({ role: 'faculty' });
    if (facultyCount === 0) {
      console.log('Seeding dummy test data (Mentors, Students, Tickets)...');
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash('Password123', salt);

      // Create Faculty (Mentors)
      const faculty1 = new User({
        name: 'Dr. Alice Smith',
        email: 'alice@muj.manipal.edu',
        loginId: 'faculty1',
        passwordHash,
        role: 'faculty',
        branch: 'CSE',
        tempPasswordUsed: true
      });
      const faculty2 = new User({
        name: 'Dr. Bob Johnson',
        email: 'bob@muj.manipal.edu',
        loginId: 'faculty2',
        passwordHash,
        role: 'faculty',
        branch: 'CSE',
        tempPasswordUsed: true
      });
      const faculty3 = new User({
        name: 'Prof. Carol Williams',
        email: 'carol@muj.manipal.edu',
        loginId: 'faculty3',
        passwordHash,
        role: 'faculty',
        branch: 'ECE',
        tempPasswordUsed: true
      });

      await faculty1.save();
      await faculty2.save();
      await faculty3.save();

      // Create Students
      const student1 = new User({
        name: 'John Doe',
        email: 'john@student.muj.edu',
        loginId: 'student1',
        passwordHash,
        role: 'student',
        section: 'A',
        branch: 'CSE',
        semester: '3rd Semester',
        assignedMentor: faculty1._id,
        tempPasswordUsed: true
      });
      const student2 = new User({
        name: 'Jane Smith',
        email: 'jane@student.muj.edu',
        loginId: 'student2',
        passwordHash,
        role: 'student',
        section: 'B',
        branch: 'CSE',
        semester: '3rd Semester',
        assignedMentor: faculty1._id,
        tempPasswordUsed: true
      });
      const student3 = new User({
        name: 'Mike Davis',
        email: 'mike@student.muj.edu',
        loginId: 'student3',
        passwordHash,
        role: 'student',
        section: 'A',
        branch: 'CSE',
        semester: '3rd Semester',
        assignedMentor: faculty2._id,
        tempPasswordUsed: true
      });
      const student4 = new User({
        name: 'Emily Wilson',
        email: 'emily@student.muj.edu',
        loginId: 'student4',
        passwordHash,
        role: 'student',
        section: 'A',
        branch: 'ECE',
        semester: '3rd Semester',
        assignedMentor: faculty3._id,
        tempPasswordUsed: true
      });

      await student1.save();
      await student2.save();
      await student3.save();
      await student4.save();

      // Update Faculty assignedStudents lists
      faculty1.assignedStudents = [student1._id, student2._id];
      faculty2.assignedStudents = [student3._id];
      faculty3.assignedStudents = [student4._id];

      await faculty1.save();
      await faculty2.save();
      await faculty3.save();

      // Create Tickets
      const ticket1 = new Ticket({
        ticketId: 'TKT-1001',
        studentId: student1._id,
        mentorId: faculty1._id,
        subject: 'ERP Portal login issue',
        category: 'ERP/Tech',
        status: 'Open',
        messages: [
          {
            sender: student1._id,
            text: 'I cannot log in to the ERP portal. It says invalid credentials even though I reset the password.',
            timestamp: new Date(Date.now() - 3600000 * 2)
          }
        ]
      });

      const ticket2 = new Ticket({
        ticketId: 'TKT-1002',
        studentId: student1._id,
        mentorId: faculty1._id,
        subject: 'Lacking course material for DBMS',
        category: 'Academic',
        status: 'In Progress',
        messages: [
          {
            sender: student1._id,
            text: 'Can you please share the lab manuals and slides for DBMS? I missed the last class.',
            timestamp: new Date(Date.now() - 3600000 * 24)
          },
          {
            sender: faculty1._id,
            text: 'Hello John, yes, I will upload them on Microsoft Teams under the files section by tomorrow morning.',
            timestamp: new Date(Date.now() - 3600000 * 23)
          },
          {
            sender: student1._id,
            text: "Thank you, ma'am! I will check there.",
            timestamp: new Date(Date.now() - 3600000 * 22)
          }
        ]
      });

      const ticket3 = new Ticket({
        ticketId: 'TKT-1003',
        studentId: student4._id,
        mentorId: faculty3._id,
        subject: 'Lab computer not working',
        category: 'Infrastructure',
        status: 'Resolved',
        messages: [
          {
            sender: student4._id,
            text: 'PC 12 in the ECE lab is not booting. It just makes a beep sound.',
            timestamp: new Date(Date.now() - 3600000 * 48)
          },
          {
            sender: faculty3._id,
            text: 'I have logged a request with the IT technician to inspect PC 12.',
            timestamp: new Date(Date.now() - 3600000 * 47)
          },
          {
            sender: faculty3._id,
            text: 'The technician has fixed the RAM seating issue. The PC is working fine now.',
            timestamp: new Date(Date.now() - 3600000 * 24)
          },
          {
            sender: student4._id,
            text: 'Verified. Working now. Thanks!',
            timestamp: new Date(Date.now() - 3600000 * 23)
          }
        ]
      });

      await ticket1.save();
      await ticket2.save();
      await ticket3.save();

      console.log('Dummy test data seeded successfully!');
      console.log('=========================================');
      console.log('STUDENT ACCOUNTS:');
      console.log('  loginId: student1  |  password: Password123  (John Doe - CSE)');
      console.log('  loginId: student2  |  password: Password123  (Jane Smith - CSE)');
      console.log('  loginId: student3  |  password: Password123  (Mike Davis - CSE)');
      console.log('  loginId: student4  |  password: Password123  (Emily Wilson - ECE)');
      console.log('FACULTY ACCOUNTS:');
      console.log('  loginId: faculty1  |  password: Password123  (Dr. Alice Smith)');
      console.log('  loginId: faculty2  |  password: Password123  (Dr. Bob Johnson)');
      console.log('  loginId: faculty3  |  password: Password123  (Prof. Carol Williams)');
      console.log('HOD ACCOUNT:');
      console.log('  loginId: hod       |  password: Password123  (Dr. Sarah Jenkins)');
      console.log('=========================================');
    } else {
      console.log('Dummy test data already exists.');
    }
  } catch (error) {
    console.error('Seeding dummy test data failed:', error);
  }
};

// Bootstrap Server
const startServer = async () => {
  // Connect database
  await connectDB();

  // Seed default system admin (HOD)
  await seedHodAccount();

  // Seed dummy dev data
  await seedDummyTestData();

  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
};

startServer();

