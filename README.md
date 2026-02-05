# 3PL WMS Backend API

Backend API for 3PL Warehouse Management System built with Node.js, Express, and MongoDB.

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/3pl-wms
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRE=7d
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLIENT_URL=http://localhost:5173
```

4. Seed the database:
```bash
npm run seed
```

5. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

The API will be running at `http://localhost:5000`

## 📚 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "client",
  "clientId": "client_id_here",
  "phone": "+91-1234567890"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@max2pay.com",
  "password": "admin123"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

### Client Endpoints

```http
GET    /api/clients              # Get all clients
GET    /api/clients/:id          # Get client by ID
GET    /api/clients/:id/stats    # Get client statistics
POST   /api/clients              # Create client (Admin only)
PUT    /api/clients/:id          # Update client (Admin only)
DELETE /api/clients/:id          # Delete client (Admin only)
```

### Product Endpoints

```http
GET    /api/products                    # Get all products
GET    /api/products/:id                # Get product by ID
GET    /api/products/client/:clientId   # Get products by client
POST   /api/products                    # Create product (Admin only)
PUT    /api/products/:id                # Update product (Admin only)
DELETE /api/products/:id                # Delete product (Admin only)
```

### Inventory Endpoints

```http
GET    /api/inventory                    # Get all inventory
GET    /api/inventory/stats              # Get inventory statistics
GET    /api/inventory/product/:productId # Get inventory by product
POST   /api/inventory/adjust             # Adjust inventory (Admin/Employee)
```

### Inbound Endpoints

```http
GET    /api/inbound        # Get all inbound logs
GET    /api/inbound/stats  # Get inbound statistics
POST   /api/inbound        # Create inbound entry (Admin/Employee)
PUT    /api/inbound/:id    # Update inbound log (Admin/Employee)
```

### Order Endpoints

```http
GET    /api/orders              # Get all orders
GET    /api/orders/stats        # Get order statistics
GET    /api/orders/:id          # Get order by ID
POST   /api/orders              # Create order
PUT    /api/orders/:id/status   # Update order status (Admin/Employee)
```

### Invoice Endpoints

```http
GET    /api/invoices              # Get all invoices
GET    /api/invoices/:id          # Get invoice by ID
POST   /api/invoices              # Create invoice
POST   /api/invoices/:id/upload   # Upload invoice file
PUT    /api/invoices/:id          # Update invoice
DELETE /api/invoices/:id          # Delete invoice (Admin only)
```

### Report Endpoints

```http
GET /api/reports/dashboard           # Get dashboard statistics
GET /api/reports/inventory           # Get inventory report (CSV/JSON)
GET /api/reports/orders              # Get order report (CSV/JSON)
GET /api/reports/inbound             # Get inbound report (CSV/JSON)
GET /api/reports/client/:clientId    # Get client report (Admin only)
```

## 🔐 Default Login Credentials

After running the seed script, use these credentials:

**Admin:**
- Email: `admin@3plwms.com`
- Password: `admin123`

**Client (TechCorp):**
- Email: `john@techcorp.com`
- Password: `client123`

**Client (Fashion Hub):**
- Email: `sarah@fashionhub.com`
- Password: `client123`

**Client (Electronics Mart):**
- Email: `michael@electronicsmart.com`
- Password: `client123`

**Employee:**
- Email: `manager@3plwms.com`
- Password: `employee123`

## 📁 Project Structure

```
backend/
├── config/
│   ├── database.js          # MongoDB connection
│   └── cloudinary.js        # Cloudinary configuration
├── controllers/
│   ├── authController.js
│   ├── clientController.js
│   ├── productController.js
│   ├── inventoryController.js
│   ├── inboundController.js
│   ├── orderController.js
│   ├── invoiceController.js
│   ├── reportController.js
│   └── userController.js
├── middleware/
│   ├── auth.js              # JWT authentication
│   ├── errorHandler.js      # Global error handler
│   ├── upload.js            # File upload
│   ├── auditLog.js          # Audit logging
│   └── validator.js         # Request validation
├── models/
│   ├── User.js
│   ├── Client.js
│   ├── Product.js
│   ├── Inventory.js
│   ├── InboundLog.js
│   ├── Order.js
│   ├── Invoice.js
│   └── AuditLog.js
├── routes/
│   ├── authRoutes.js
│   ├── clientRoutes.js
│   ├── productRoutes.js
│   ├── inventoryRoutes.js
│   ├── inboundRoutes.js
│   ├── orderRoutes.js
│   ├── invoiceRoutes.js
│   ├── reportRoutes.js
│   └── userRoutes.js
├── scripts/
│   └── seed.js              # Database seeding
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## 🔒 Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control (RBAC)
- Request validation
- Helmet for security headers
- CORS configuration
- Rate limiting
- Audit logging

## 📊 Database Models

- **User**: Admin, Client, and Employee users
- **Client**: Company/client information
- **Product**: Product catalog
- **Inventory**: Real-time stock tracking
- **InboundLog**: Inbound shipment records
- **Order**: Delivery orders
- **Invoice**: Invoice management
- **AuditLog**: System activity tracking

## 🛠️ Technologies Used

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **Bcrypt** - Password hashing
- **Cloudinary** - File storage
- **Multer** - File upload
- **PDFKit** - PDF generation
- **json2csv** - CSV export

## 📝 License

ISC
