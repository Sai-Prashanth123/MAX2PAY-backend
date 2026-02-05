# Automated Monthly Invoice Generation System

## 🎯 Overview

Production-grade automated invoice generation system that runs monthly for all active clients in the 3PL warehouse management system.

**Key Features:**
- ✅ Automated cron-based scheduling
- ✅ America/New_York timezone (EST/EDT) with automatic DST handling
- ✅ Idempotent (safe to run multiple times)
- ✅ Individual client error isolation
- ✅ Comprehensive logging
- ✅ Reusable invoice generation logic
- ✅ Internal service authentication

---

## 📅 Schedule

**Cron Expression:** `0 2 1 * *`

- **When:** 1st of every month at 02:00 AM
- **Timezone:** America/New_York (EST/EDT)
- **Billing Period:** Previous month (automatically calculated)
- **DST Safe:** Yes - node-cron handles timezone transitions automatically

### Why 02:00 AM EST?
- Low traffic time
- Ensures previous month data is finalized
- Allows buffer for delayed order status updates
- Completes before business hours start

---

## 🏗️ System Architecture

### Components

1. **Cron Scheduler** (`jobs/invoiceCronScheduler.js`)
   - Manages cron job lifecycle
   - Handles timezone configuration
   - Triggers automated generation

2. **Auto Invoice Controller** (`controllers/autoInvoiceController.js`)
   - Processes all active clients
   - Handles errors per client
   - Provides comprehensive logging

3. **Invoice Generation Service** (`services/invoiceGenerationService.js`)
   - Reusable invoice generation logic
   - Used by both manual and automated processes
   - Implements pricing formula

4. **Protected Routes** (`routes/invoiceRoutes.js`)
   - Internal service endpoint
   - Admin test endpoint

---

## 🔐 Security

### Internal Service Authentication

The automated endpoint is protected by an internal service key:

```javascript
Header: x-service-key: <INTERNAL_SERVICE_KEY>
```

**Environment Variable:**
```bash
INTERNAL_SERVICE_KEY=3plfast-internal-service-key-change-in-production-2026
```

⚠️ **IMPORTANT:** Change this key in production to a secure random value.

---

## 🔄 Workflow

### Monthly Automated Flow

```
1. Cron triggers on 1st at 02:00 AM EST
   ↓
2. Calculate previous month (America/New_York timezone)
   ↓
3. Fetch all active clients
   ↓
4. For each client:
   ├─ Check if invoice already exists (idempotency)
   ├─ If exists → Skip
   └─ If not exists:
      ├─ Fetch billable orders (dispatched/delivered)
      ├─ Filter by fulfillment date (dispatched_at or delivered_at)
      ├─ Calculate charges using pricing formula
      ├─ Generate invoice with status = 'draft'
      └─ Set due date = billing period end + 30 days
   ↓
5. Log results per client
   ↓
6. Return comprehensive summary
```

### Billing Logic

**Billable Orders:**
- Status: `dispatched` OR `delivered`
- Fulfillment date within billing month
- Uses `dispatched_at` or `delivered_at` (NOT `created_at`)

**Pricing Formula:**
```
Per Order Charge = $2.50 + (total_units - 1) × $1.25
```

**Example:**
- Order with 200 units: $2.50 + (199 × $1.25) = $251.25
- Order with 1 unit: $2.50 + (0 × $1.25) = $2.50

**Invoice Details:**
- Type: `monthly`
- Status: `draft` (for auto-generated)
- Tax: $0 (no tax applied)
- Due Date: Billing period end + 30 days

---

## 🚀 Deployment

### Environment Variables

Add to `.env`:

```bash
# Backend URL for cron to call
BACKEND_URL=http://localhost:5001

# Enable/disable cron scheduler
ENABLE_INVOICE_CRON=false  # Set to 'true' in production

# Internal service authentication
INTERNAL_SERVICE_KEY=your-secure-random-key-here
```

### Production Setup

1. **Set environment variables:**
   ```bash
   ENABLE_INVOICE_CRON=true
   INTERNAL_SERVICE_KEY=<generate-secure-random-key>
   NODE_ENV=production
   ```

2. **Verify timezone:**
   ```bash
   # Server should be configured for UTC
   # Cron will handle America/New_York conversion
   ```

3. **Start server:**
   ```bash
   npm start
   ```

4. **Verify cron initialization:**
   ```
   ✅ Invoice cron scheduler initialized successfully
   📅 Next run: [date and time in EST]
   ```

---

## 🧪 Testing

### Manual Test Trigger

For testing without waiting for cron schedule:

**Endpoint:** `POST /api/invoices/test-auto-generation`

**Authentication:** Admin JWT token required

**Request:**
```bash
curl -X POST http://localhost:5001/api/invoices/test-auto-generation \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "Automated invoice generation completed",
  "billingPeriod": {
    "month": 12,
    "year": 2025,
    "monthName": "December"
  },
  "summary": {
    "totalClients": 5,
    "successful": 3,
    "skipped": 1,
    "errors": 1,
    "duration": 2543
  },
  "results": [...]
}
```

### Development Testing

1. **Enable cron in development:**
   ```bash
   ENABLE_INVOICE_CRON=true npm run dev
   ```

2. **Use test endpoint:**
   - Login as admin
   - Call `/api/invoices/test-auto-generation`
   - Review console logs

3. **Verify invoice creation:**
   - Check invoices table in Supabase
   - Verify status = 'draft'
   - Confirm billing period is previous month

---

## 📊 Monitoring

### Console Logs

The system provides detailed logging:

```
========================================
🤖 AUTOMATED MONTHLY INVOICE GENERATION
========================================
Started at: [timestamp] EST
📅 Billing Period: December 2025
🕐 Current NY Time: [timestamp]
🌍 Timezone: America/New_York (EST)
👥 Processing 5 active clients...

📋 Processing: TechCorp Solutions (abc12345)
   ✅ Invoice generated: INV-202512-ABC123
   💰 Amount: $251.25
   📦 Orders: 1
   ⏱️  Duration: 234ms

📋 Processing: Another Client (def67890)
   ⏭️  Skipped: duplicate
   ℹ️  Invoice already exists: INV-202512-DEF678
   ⏱️  Duration: 45ms

========================================
📊 GENERATION SUMMARY
========================================
✅ Successful: 3
⏭️  Skipped: 1
❌ Errors: 1
⏱️  Total Duration: 2.54s
🏁 Completed at: [timestamp] EST
========================================
```

### Error Handling

- **Individual client errors:** Logged but don't stop processing
- **Fatal errors:** Logged and reported in response
- **Network errors:** Retry next month automatically
- **Duplicate invoices:** Skipped with reason logged

---

## 🔧 API Endpoints

### 1. Automated Generation (Internal)

**Endpoint:** `POST /api/invoices/generate-monthly-auto`

**Authentication:** Internal service key (header)

**Headers:**
```
x-service-key: <INTERNAL_SERVICE_KEY>
Content-Type: application/json
```

**Response:**
```json
{
  "success": true,
  "message": "Automated invoice generation completed",
  "billingPeriod": { "month": 12, "year": 2025, "monthName": "December" },
  "summary": { "totalClients": 5, "successful": 3, "skipped": 1, "errors": 1 },
  "results": [...]
}
```

### 2. Test Generation (Admin)

**Endpoint:** `POST /api/invoices/test-auto-generation`

**Authentication:** Admin JWT token

**Headers:**
```
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json
```

---

## 🛠️ Maintenance

### Updating Cron Schedule

Edit `jobs/invoiceCronScheduler.js`:

```javascript
cronJob = cron.schedule(
  '0 2 1 * *', // Change this expression
  async () => { ... },
  {
    scheduled: true,
    timezone: 'America/New_York' // Keep this for DST handling
  }
);
```

### Changing Timezone

⚠️ **Not recommended** - System is designed for US market.

If needed, update:
1. `timezone` in cron.schedule()
2. All `toLocaleString()` calls
3. Documentation

### Disabling Automated Generation

Set in `.env`:
```bash
ENABLE_INVOICE_CRON=false
```

Or remove from production environment variables.

---

## 📝 Database Schema

### Invoices Table

Generated invoices have:

```javascript
{
  invoice_number: "INV-202512-ABC123",
  client_id: "uuid",
  type: "monthly",
  billing_period_month: 12,
  billing_period_year: 2025,
  billing_period_start_date: "2025-12-01T00:00:00Z",
  billing_period_end_date: "2025-12-31T23:59:59Z",
  status: "draft",  // Auto-generated invoices start as draft
  line_items: [...],
  total_amount: 251.25,
  due_date: "2026-01-30",  // Billing end + 30 days
  uploaded_by: "system",
  notes: "Monthly invoice for December 2025. Generated automatically."
}
```

---

## 🐛 Troubleshooting

### Cron Not Running

1. Check environment variable:
   ```bash
   echo $ENABLE_INVOICE_CRON  # Should be 'true'
   ```

2. Check server logs for initialization message

3. Verify cron expression is valid

### Invoices Not Generating

1. Check if clients are active (`is_active = true`)
2. Verify orders have correct status (`dispatched` or `delivered`)
3. Check fulfillment dates are in billing period
4. Review console logs for specific errors

### Duplicate Invoice Errors

This is expected behavior - cron is idempotent. Duplicates are skipped automatically.

### Timezone Issues

Verify server time:
```bash
date
TZ='America/New_York' date
```

Cron handles timezone internally - server can be UTC.

---

## 📚 Related Files

- `backend/services/invoiceGenerationService.js` - Core generation logic
- `backend/controllers/autoInvoiceController.js` - Automated controller
- `backend/jobs/invoiceCronScheduler.js` - Cron scheduler
- `backend/routes/invoiceRoutes.js` - API routes
- `backend/server.js` - Cron initialization

---

## 🔄 Future Enhancements

Potential improvements:

- Email notifications to clients when invoices are generated
- Slack/webhook notifications for admin
- Retry mechanism for failed generations
- Invoice approval workflow
- Customizable billing periods per client
- Multi-timezone support for international clients

---

## 📞 Support

For issues or questions:
1. Check console logs for detailed error messages
2. Review this documentation
3. Test using `/test-auto-generation` endpoint
4. Contact system administrator

---

**Last Updated:** January 2026
**Version:** 1.0.0
**Timezone:** America/New_York (EST/EDT)
