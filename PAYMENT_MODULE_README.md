# Payment Module for ProComp Tournament Platform

## 🎯 Overview

This is a complete payment module implementation for the ProComp martial arts tournament platform. It provides secure payment processing for tournament registrations using multiple payment methods.

## 🧾 Supported Payment Methods

### 1. **Kaspi QR** (Kazakhstan)
- Manual API-based QR code generation
- Sends POST requests to Kaspi's payment API
- Returns payment URL and QR code image
- **Note**: Kaspi doesn't support real-time status updates - requires manual polling or verification

### 2. **Apple Pay** (via Stripe)
- Uses Stripe's Wallet API with `PaymentIntent`
- Supports Apple Pay through Stripe's card payment method
- Real-time webhook notifications for payment status

### 3. **Google Pay** (via Stripe)
- Uses Stripe's Wallet API with `PaymentIntent`
- Supports Google Pay through Stripe's card payment method
- Real-time webhook notifications for payment status

## 🔁 Payment Flow Architecture

### 1. **Initiate Payment**
**Endpoint**: `POST /api/v1/payments/initiate`

**Request Body**:
```json
{
  "participant_id": "participant_123",
  "method": "kaspi_qr" | "apple_pay" | "google_pay",
  "amount": 50.00,
  "currency": "USD",
  "return_url": "https://app.procomp.com/payment/success"
}
```

**Response for Kaspi QR**:
```json
{
  "payment_id": "payment_456",
  "payment_url": "https://kaspi.kz/pay/payment_456",
  "qr_image_url": "https://kaspi.kz/qr/payment_456.png",
  "expires_at": "2024-01-15T14:30:00Z",
  "amount": 50.00,
  "currency": "KZT"
}
```

**Response for Apple/Google Pay**:
```json
{
  "payment_id": "payment_456",
  "client_secret": "pi_1234567890_secret_abcdef",
  "amount": 50.00,
  "currency": "USD"
}
```

### 2. **Webhook Handler**
**Endpoint**: `POST /api/v1/payments/webhooks/stripe`

- Automatically processes Stripe webhook events
- Verifies webhook signatures for security
- Updates payment status in database
- Activates participant upon successful payment

### 3. **Payment Status Check**
**Endpoint**: `GET /api/v1/payments/status/{participant_id}`

**Response**:
```json
{
  "payment_id": "payment_456",
  "participant_id": "participant_123",
  "status": "COMPLETED",
  "method": "apple_pay",
  "amount": 50.00,
  "currency": "USD",
  "created_at": "2024-01-15T14:00:00Z",
  "updated_at": "2024-01-15T14:05:00Z",
  "failure_reason": null
}
```

## 🏗️ Technical Architecture

### Service Layer Design

#### 1. **PaymentDatabaseService**
- Handles all database operations
- Manages payment records, participant relationships
- Provides transaction safety with async/await

#### 2. **KaspiPaymentService**
- Manages Kaspi QR payment creation
- Handles API communication with Kaspi
- Provides mock implementation for demo purposes

#### 3. **StripePaymentService**
- Creates Stripe PaymentIntents
- Handles Apple Pay and Google Pay processing
- Manages Stripe-specific error handling

### Database Schema Integration

The module integrates with your existing Prisma schema:

```prisma
model Payment {
  id              String        @id @default(cuid())
  amount          Decimal       @db.Decimal(10, 2)
  currency        Currency      @default(USD)
  status          PaymentStatus @default(PENDING)
  method          PaymentMethod?
  
  // External payment IDs
  stripePaymentId String?
  stripeSessionId String?
  kaspiQrCode     String?
  kaspiTransactionId String?
  applePayId      String?
  googlePayId     String?
  
  // Metadata and relationships
  metadata        Json?
  failureReason   String?
  userId          String
  tournamentId    String
  participant     Participant?
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}
```

## 🔒 Security Features

### Authentication & Authorization
- JWT-based user authentication
- Participant ownership validation
- Admin role-based access control

### Webhook Security
- Stripe signature verification
- Request payload validation
- Timestamp tolerance checking

### Data Protection
- Sensitive payment data encryption
- PCI DSS compliance considerations
- Audit logging for all payment events

## 📊 Status Management

### Payment Statuses
- `PENDING`: Payment initiated, awaiting completion
- `PROCESSING`: Payment being processed by provider
- `COMPLETED`: Payment successful, participant activated
- `FAILED`: Payment failed, reason logged
- `REFUNDED`: Payment refunded
- `CANCELLED`: Payment cancelled by user
- `EXPIRED`: Payment expired (Kaspi QR timeout)

### Participant Status Updates
When payment is completed:
- Participant status → `PAID`
- Tournament registration activated
- Notification sent to participant (if implemented)

## 🚀 Production Deployment

### Environment Variables Required

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Kaspi Configuration (if using real API)
KASPI_API_KEY=your_kaspi_api_key
KASPI_API_SECRET=your_kaspi_api_secret

# Database
DATABASE_URL=postgresql://user:pass@host:5432/procomp

# Logging
LOG_LEVEL=INFO
```

### Stripe Webhook Setup

1. **Create Webhook Endpoint** in Stripe Dashboard:
   - URL: `https://api.procomp.com/api/v1/payments/webhooks/stripe`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`

2. **Configure Webhook Secret**:
   - Copy webhook signing secret from Stripe Dashboard
   - Set `STRIPE_WEBHOOK_SECRET` environment variable

### Kaspi Integration

For production Kaspi integration:

1. **Replace Mock Implementation**:
   ```typescript
   // In KaspiPaymentService.create_qr_payment()
   // Replace mock response with actual Kaspi API call
   response = await client.post(
       self.api_url,
       json=payload,
       headers={
           "Authorization": f"Bearer {settings.KASPI_API_KEY}",
           "Content-Type": "application/json"
       }
   )
   ```

2. **Handle Kaspi Callbacks**:
   - Implement callback endpoint for Kaspi status updates
   - Add manual payment verification for Kaspi QR codes

## 🧪 Testing

### Unit Tests
```python
# Test payment initiation
async def test_initiate_stripe_payment():
    # Mock user, participant, and database
    # Test payment creation
    # Verify response format

# Test webhook processing
async def test_stripe_webhook_success():
    # Mock webhook payload
    # Test payment status update
    # Verify participant activation
```

### Integration Tests
```python
# Test full payment flow
async def test_complete_payment_flow():
    # Create participant
    # Initiate payment
    # Simulate webhook
    # Verify final state
```

### Load Testing
- Test concurrent payment processing
- Verify database transaction safety
- Test webhook handling under load

## 📈 Monitoring & Analytics

### Metrics to Track
- Payment success rates by method
- Average payment processing time
- Failed payment reasons
- Revenue by tournament/timeframe

### Logging Events
- Payment initiation
- Status changes
- Webhook processing
- Error conditions

### Health Checks
**Endpoint**: `GET /api/v1/payments/health`

Returns service status and external integrations:
```json
{
  "status": "healthy",
  "services": {
    "stripe": "connected",
    "kaspi": "configured"
  },
  "timestamp": "2024-01-15T14:00:00Z"
}
```

## 🔧 Maintenance

### Regular Tasks
1. **Monitor Payment Statuses**: Check for stuck payments
2. **Reconcile Transactions**: Match payment records with external providers
3. **Update API Versions**: Keep Stripe SDK updated
4. **Review Logs**: Monitor for errors and performance issues

### Error Handling
- Automatic retry logic for transient failures
- Dead letter queues for failed webhooks
- Alert system for critical payment failures

## 📚 API Reference

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/payments/initiate` | Initiate payment |
| POST | `/api/v1/payments/webhooks/stripe` | Stripe webhook handler |
| GET | `/api/v1/payments/status/{participant_id}` | Get payment status |
| GET | `/api/v1/payments/participant/{participant_id}/history` | Payment history |
| GET | `/api/v1/payments/admin/payments` | Admin: List all payments |
| GET | `/api/v1/payments/health` | Service health check |

### Error Responses

```json
{
  "detail": "Payment amount must match tournament entry fee",
  "status_code": 400
}
```

Common error codes:
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (authentication required)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found (participant/payment not found)
- `503`: Service Unavailable (external service down)

## 🤝 Contributing

### Code Style
- Follow PEP 8 guidelines
- Use type hints for all functions
- Add comprehensive docstrings
- Include error handling for all external calls

### Pull Request Process
1. Add tests for new functionality
2. Update documentation
3. Ensure all tests pass
4. Request review from team lead

---

This payment module provides a robust, secure, and scalable solution for tournament payment processing. For questions or support, contact the ProComp development team. 