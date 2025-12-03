# AI Dev Community - Backend API

Backend API for the AI Dev Community platform built with Node.js, Express, TypeScript, and Prisma.

## 🚀 Quick Start


### Prerequisites

- Node.js 18+ 
- MySQL 8.0+
- npm or yarn

### Installation

1. **Install dependencies:**
```bash
cd backend
npm install
```

2. **Configure environment:**
Create a `.env` file in the backend directory:
```env
DATABASE_URL="mysql://root:password@localhost:3306/aidevclub"
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
PORT=5000
CORS_ORIGIN=http://localhost:5173
```

3. **Set up database:**
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed database with sample data
npm run prisma:seed
```

4. **Start development server:**
```bash
npm run dev
```

Server will run on http://localhost:5000

## 📁 Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.ts           # Seed data
├── src/
│   ├── controllers/      # Route controllers
│   ├── middleware/       # Express middleware
│   ├── routes/          # API routes
│   └── server.ts        # Express app setup
├── uploads/             # Uploaded files
└── package.json
```

## 🔑 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user

### Users
- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update profile
- `POST /api/users/me/photo` - Upload profile photo

### Events
- `GET /api/events` - Get all events
- `GET /api/events/:id` - Get event details
- `POST /api/events` - Create event (Staff/Admin)
- `PUT /api/events/:id` - Update event (Staff/Admin)
- `DELETE /api/events/:id` - Delete event (Staff/Admin)
- `POST /api/events/:id/register` - Register for event
- `POST /api/events/:id/checkin` - Check-in with QR (Staff/Admin)
- `GET /api/events/:id/registrations` - Get registrations (Staff/Admin)
- `GET /api/events/:id/registrations/export` - Export CSV (Staff/Admin)

### Forms
- `POST /api/forms` - Create form (Staff/Admin)
- `GET /api/forms/:id` - Get form
- `POST /api/forms/:id/submit` - Submit form response
- `GET /api/forms/:id/responses` - Get responses (Staff/Admin)
- `GET /api/forms/:id/responses/export` - Export CSV (Staff/Admin)

### Polls
- `GET /api/polls` - Get all polls
- `GET /api/polls/:id` - Get poll details
- `POST /api/polls` - Create poll (Staff/Admin)
- `POST /api/polls/:id/vote` - Vote on poll
- `GET /api/polls/:id/results` - Get poll results

### Notifications
- `GET /api/notifications` - Get user notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read

### Admin
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:id/role` - Update user role
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/stats` - Get dashboard statistics
- `GET /api/admin/audit-logs` - Get audit logs

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication:

1. Register or login to receive `accessToken` and `refreshToken`
2. Include access token in Authorization header: `Bearer <token>`
3. Access tokens expire in 1 hour
4. Use refresh token endpoint to get new access token

## 👥 Default Users

After seeding, you can login with:

- **Admin:** admin@aidevclub.com / admin123
- **Staff:** staff@aidevclub.com / staff123
- **User:** john@example.com / user123

## 🛠️ Development

```bash
# Run development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Open Prisma Studio (database GUI)
npm run prisma:studio
```

## 📝 Database Schema

Main entities:
- **User** - User accounts with roles (USER, STAFF, ADMIN)
- **Event** - Community events
- **Registration** - Event registrations with QR codes
- **Form** - Dynamic forms
- **FormResponse** - Form submissions
- **Poll** - Polls/surveys
- **Vote** - Poll votes
- **Notification** - User notifications
- **AuditLog** - System audit trail

## 🔒 Security Features

- Password hashing with bcrypt
- JWT authentication
- Role-based access control (RBAC)
- Input validation
- CORS protection
- Helmet security headers
- Rate limiting
- SQL injection protection (Prisma)

## 📦 Dependencies

- **express** - Web framework
- **prisma** - Database ORM
- **jsonwebtoken** - JWT auth
- **bcryptjs** - Password hashing
- **multer** - File uploads
- **qrcode** - QR code generation
- **cors** - CORS middleware
- **helmet** - Security headers

## 🚀 Deployment

1. Set environment variables on your hosting platform
2. Run database migrations
3. Build the application: `npm run build`
4. Start server: `npm start`

Recommended platforms:
- Railway
- Render
- DigitalOcean App Platform
- AWS EC2/ECS

## 📄 License

MIT
