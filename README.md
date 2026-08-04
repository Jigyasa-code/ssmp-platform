# Student Support & Mentorship Portal (SSMP) - Academic Nexus

Academic Nexus is a comprehensive, role-based Student Support & Mentorship Portal designed to bridge the gap between students, faculty mentors, and heads of departments (HOD). It streamlines communication, ticket generation for issue resolution, and performance tracking.

---

## 🚀 Key Features

### 👤 Role-Based Portals

1. **Student Dashboard**
   - Create support tickets under different categories (Academic, ERP/Tech, Infrastructure).
   - Real-time conversation thread with assigned faculty mentors on tickets.
   - Profile verification and mentor detail access.
2. **Faculty Mentor Workspace**
   - View assigned student list and check their status.
   - Interactive ticket queue to manage issues, chat with students, and transition statuses (Open ➔ In Progress ➔ Resolved).
   - Performance indicators based on ticket response time and resolution rates.
3. **HOD (Head of Department) Dashboard**
   - System initialization (upload student/faculty files, assign mentors).
   - View departmental statistics (total tickets, resolved tickets, category-wise breakdown).
   - Faculty performance analysis dashboard.

---

## 🛠️ Technology Stack

- **Frontend:**
  - React (v19)
  - Vite (v8)
  - Tailwind CSS (v3)
  - React Router DOM (v7)
  - Axios (for API requests)
- **Backend:**
  - Node.js & Express
  - MongoDB (Mongoose ODM)
  - JSON Web Tokens (JWT) for secure authentication
  - HttpOnly cookies for session management
  - Security headers (Helmet) & Rate Limiting (express-rate-limit)

---

## 📂 Project Structure

```text
college-project/
├── backend/
│   ├── src/
│   │   ├── config/       # DB & App configuration
│   │   ├── controllers/  # API controllers (auth, tickets, users)
│   │   ├── middleware/   # Authentication, rate limiters, validation
│   │   ├── models/       # Mongoose schemas (User, Ticket)
│   │   ├── routes/       # Express route handlers
│   │   ├── scripts/      # Security testing scripts
│   │   ├── utils/        # Helper functions
│   │   ├── app.js        # Express app configuration
│   │   └── server.js     # Server entry & seeding script
│   └── .env              # Environment configuration
├── frontend/
│   ├── src/
│   │   ├── assets/       # Global assets
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Dashboard and Portal pages
│   │   ├── routes/       # App routing logic
│   │   ├── services/     # API request services (Axios instance)
│   │   ├── App.jsx       # App main component
│   │   └── index.css     # Styling entries
│   └── vite.config.js    # Vite builder configuration
└── Frontend_UI_UX/       # Original design systems & static screens
```

---

## ⚙️ Setup and Installation

### Prerequisites

- [Node.js](https://nodejs.org/) installed (v18+ recommended)
- A running MongoDB instance (local or MongoDB Atlas)

### 1. Clone & Position
```bash
git clone https://github.com/Ammmanx/ssmp-platform.git
cd ssmp-platform
```

### 2. Configure Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create a `.env` file (if not already present) and populate:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGO_URI=your_mongodb_connection_uri
   JWT_SECRET=your_jwt_secret_key
   FRONTEND_URL=http://localhost:5173
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### 3. Configure Frontend
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

---

## 🏃 Running the Application

### Start the Backend
From the `backend/` directory, run:
```bash
npm run dev
```
The server will run at `http://localhost:5000` and automatically connect to MongoDB. If it's a first-time connection, the database will be populated with default HOD and test data.

### Start the Frontend
From the `frontend/` directory, run:
```bash
npm run dev
```
The client development server will start at `http://localhost:5173`.

---

## 🔑 Default Credentials for Seeding / Testing

The database seeding script automatically creates the following test accounts:

| Role | Username / loginId | Password | Name |
| :--- | :--- | :--- | :--- |
| **HOD** | `hod` | `Password123` | Dr. Sarah Jenkins |
| **Faculty (Mentor)** | `faculty1` | `Password123` | Dr. Alice Smith |
| **Faculty (Mentor)** | `faculty2` | `Password123` | Dr. Bob Johnson |
| **Faculty (Mentor)** | `faculty3` | `Password123` | Prof. Carol Williams |
| **Student** | `student1` | `Password123` | John Doe (CSE) |
| **Student** | `student2` | `Password123` | Jane Smith (CSE) |
| **Student** | `student3` | `Password123` | Mike Davis (CSE) |
| **Student** | `student4` | `Password123` | Emily Wilson (ECE) |

---

## 🛡️ Security Implementations
- **Strict Role-based Authorization:** Middleware locks down API endpoints specifically to HOD, Faculty, or Student permissions.
- **Secure Sessions:** Sessions are stored using HttpOnly, Secure, and SameSite cookies, making them immune to XSS token theft.
- **Rate Limiting:** Protects backend endpoints (like login) from brute force attacks.
- **Security Headers:** Integrated `helmet` to mitigate typical web application vulnerabilities.
