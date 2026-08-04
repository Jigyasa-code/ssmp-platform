/**
 * Authorization Regression Tests — SSMP Portal
 *
 * Strategy: These are integration tests against the real Express app and a
 * real MongoDB instance. We use the MONGO_URI from .env (which must be
 * available in the test environment, or set via CI secrets).
 *
 * We do NOT use mongodb-memory-server here because the User model uses
 * pre-indexed fields that require a real MongoDB session to test collisions.
 *
 * Each describe block tears down its own test data after completion.
 */

require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// We import the app WITHOUT starting the HTTP server (no listen() call).
// server.js calls connectDB() and then app.listen() — so we need the raw
// app object. Refactoring note: if server.js doesn't export app, we import
// the express app factory from app.js.
let app;

// Bootstrap: connect to DB and get the app
beforeAll(async () => {
  // Skip connecting if already connected (from a previous test file)
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  // Import app after mongoose is connected so all model hooks work
  app = require('../app');
});

afterAll(async () => {
  await mongoose.connection.close();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const User = require('../models/User');
const Ticket = require('../models/Ticket');

/**
 * Create a test user and log in, returning the agent (cookie jar) for
 * subsequent requests. Cleans up the created user on teardown if the
 * caller calls `cleanup()`.
 */
async function createAndLoginUser(loginId, role, extraFields = {}) {
  const passwordHash = await bcrypt.hash('TestPass@123', 10);
  const user = await User.create({
    loginId,
    name: `Test ${role}`,
    email: `${loginId}@test.ssmp.local`,
    role,
    passwordHash,
    tempPasswordUsed: true,
    ...extraFields,
  });

  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({
    loginId,
    password: 'TestPass@123',
  });
  expect(res.status).toBe(200);

  return { agent, user };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('Authorization Regression Tests', () => {
  let studentAgent, student1;
  let student2User;
  let facultyAgent, faculty1;
  let hodAgent, hod1;
  let testTicket;

  beforeAll(async () => {
    // Cleanup any leftover test data from a previous failed run
    await User.deleteMany({ email: /@test\.ssmp\.local$/ });
    await Ticket.deleteMany({ subject: /\[SSMP-TEST\]/ });

    ({ agent: studentAgent, user: student1 } = await createAndLoginUser(
      'stu_test_001', 'student'
    ));
    ({ user: student2User } = await createAndLoginUser(
      'stu_test_002', 'student'
    ));
    ({ agent: facultyAgent, user: faculty1 } = await createAndLoginUser(
      'fac_test_001', 'faculty'
    ));
    ({ agent: hodAgent, user: hod1 } = await createAndLoginUser(
      'hod_test_001', 'hod'
    ));

    // Assign mentor to student1 so they can create a ticket
    await User.findByIdAndUpdate(student1._id, { assignedMentor: faculty1._id });
    await User.findByIdAndUpdate(faculty1._id, {
      $push: { assignedStudents: student1._id }
    });

    // Create a ticket owned by student1
    testTicket = await Ticket.create({
      studentId: student1._id,
      mentorId: faculty1._id,
      subject: '[SSMP-TEST] Auth regression ticket',
      description: 'Created by auth regression test',
      category: 'Academic',
      status: 'Open',
    });
  });

  afterAll(async () => {
    await Ticket.deleteMany({ subject: /\[SSMP-TEST\]/ });
    await User.deleteMany({ email: /@test\.ssmp\.local$/ });
  });

  // ── 1. JWT validation ───────────────────────────────────────────────────────

  describe('JWT validation', () => {
    it('rejects requests with no token (401)', async () => {
      const res = await request(app).get('/api/tickets');
      expect(res.status).toBe(401);
    });

    it('rejects requests with an invalid/tampered token (401)', async () => {
      const res = await request(app)
        .get('/api/tickets')
        .set('Cookie', 'token=this.is.not.a.valid.jwt');
      expect(res.status).toBe(401);
    });
  });

  // ── 2. Student data isolation ───────────────────────────────────────────────

  describe('Student data isolation', () => {
    it("student can view their own ticket", async () => {
      const res = await studentAgent.get(`/api/tickets/${testTicket._id}`);
      expect(res.status).toBe(200);
    });

    it("student CANNOT view another student's ticket (403)", async () => {
      // Login as student2
      const { agent: student2Agent } = await createAndLoginUser(
        'stu_test_003', 'student'
      );
      const res = await student2Agent.get(`/api/tickets/${testTicket._id}`);
      expect(res.status).toBe(403);
      await User.deleteOne({ loginId: 'stu_test_003' });
    });

    it("student CANNOT access HOD-only routes (403)", async () => {
      const res = await studentAgent.get('/api/semester/current');
      expect(res.status).toBe(403);
    });

    it("student CANNOT access faculty user list (403)", async () => {
      const res = await studentAgent.get('/api/users/faculty');
      expect(res.status).toBe(403);
    });
  });

  // ── 3. Faculty authorization ────────────────────────────────────────────────

  describe('Faculty authorization', () => {
    it("assigned faculty mentor CAN view the ticket", async () => {
      const res = await facultyAgent.get(`/api/tickets/${testTicket._id}`);
      expect(res.status).toBe(200);
    });

    it("faculty CANNOT access HOD semester init route (403)", async () => {
      const res = await facultyAgent.post('/api/semester/init').send({
        academicYear: '2024-25',
        term: 'Odd',
      });
      expect(res.status).toBe(403);
    });

    it("faculty CANNOT access HOD user-list route (403)", async () => {
      const res = await facultyAgent.get('/api/users/faculty');
      expect(res.status).toBe(403);
    });
  });

  // ── 4. HOD authorization ────────────────────────────────────────────────────

  describe('HOD authorization', () => {
    it("HOD CAN access faculty list", async () => {
      const res = await hodAgent.get('/api/users/faculty');
      expect(res.status).toBe(200);
    });

    it("HOD CAN access ticket queue (sees all tickets)", async () => {
      const res = await hodAgent.get('/api/tickets');
      expect(res.status).toBe(200);
    });
  });

  // ── 5. Category validation ──────────────────────────────────────────────────

  describe('Ticket category validation', () => {
    it("rejects invalid category with 400", async () => {
      const res = await studentAgent.post('/api/tickets').send({
        subject: '[SSMP-TEST] bad category',
        description: 'Testing invalid category',
        category: 'InvalidCategory',
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid category/);
    });

    it("accepts valid category 'Academic'", async () => {
      // Ensure student1 has mentor assigned
      const res = await studentAgent.post('/api/tickets').send({
        subject: '[SSMP-TEST] valid category',
        description: 'Testing valid category',
        category: 'Academic',
      });
      // Either 201 (created) or 200 success — not 400/403/500
      expect([200, 201]).toContain(res.status);
    });
  });
});
