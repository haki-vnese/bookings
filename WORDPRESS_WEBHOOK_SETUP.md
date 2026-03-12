# WordPress -> Backend Webhook Setup

This guide is for connecting a WordPress form (Forminator or custom webhook plugin) to:

`POST /webhooks/forminator`

## 1. Configure backend environment

In `backend/.env`:

```env
FORMINATOR_WEBHOOK_TOKEN=replace_with_long_random_secret
FORMINATOR_DEFAULT_SALON_ID=<salon-uuid>
FORMINATOR_SALON_MAP={"downtown":"<salon-uuid>","uptown":"<salon-uuid>"}
FORMINATOR_SERVICE_MAP={"gel manicure":"<service-uuid>","pedicure":"<service-uuid>"}
FORMINATOR_TECHNICIAN_MAP={"anna":"<staff-uuid>","mia":"<staff-uuid>"}
FORMINATOR_DEDUPLICATE=true
```

Notes:
- Keep `FORMINATOR_WEBHOOK_TOKEN` secret.
- If the WordPress form sends salon/location directly, `FORMINATOR_DEFAULT_SALON_ID` is fallback only.
- Dedupe is recommended to prevent duplicate bookings when WordPress retries failed webhooks.

## 2. Configure WordPress webhook request

Use endpoint:

`https://<your-api-domain>/webhooks/forminator`

Send one of these auth options:
- Header `x-webhook-token: <FORMINATOR_WEBHOOK_TOKEN>` (recommended)
- Header `x-forminator-token: <FORMINATOR_WEBHOOK_TOKEN>`
- Query `?token=<FORMINATOR_WEBHOOK_TOKEN>`

## 3. Required payload fields

Your webhook payload must include:
- Service field: one of `service_id`, `service`, `service_name`, `select_1`
- Technician field: one of `technician_id`, `technician`, `technician_name`, `select_2`
- Date field: one of `date_1`, `appointment_date`, `date`
- Customer identity: `customer_id` or email (`email_1`, `email`)

Optional but recommended:
- Time: `time_1` or (`time_1_hours` + `time_1_minutes`)
- Notes: `textarea_1` or `notes`
- Salon/location: `salon_id`, `salonId`, `location`, `branch`

## 4. Example payload

```json
{
  "full_name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+1 555 123 4567",
  "service": "Gel Manicure",
  "technician": "Anna",
  "date_1": "2026-03-25",
  "time_1": "10:30 AM",
  "location": "Downtown",
  "textarea_1": "Please use neutral tones"
}
```

## 5. Verify integration quickly

```bash
curl -X POST "http://localhost:8000/webhooks/forminator" \
  -H "Content-Type: application/json" \
  -H "x-webhook-token: replace_with_long_random_secret" \
  -d '{
    "full_name":"Webhook Test",
    "email":"webhook-test@example.com",
    "service":"Gel Manicure",
    "technician":"Anna",
    "date_1":"2026-03-26",
    "time_1":"09:00 AM",
    "location":"Downtown"
  }'
```

Expected immediate response:

```json
{ "ok": true }
```

The booking is created asynchronously after the response.
