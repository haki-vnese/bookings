# Nail Dashboard WordPress Plugin

This plugin provides a frontend admin dashboard shell for your nail salon system and connects to your backend API.

## Current implementation scope

- Protected dashboard route: `/dashboard`
- Login against backend JWT auth (`POST /api/auth/login`)
- Session bootstrap (`GET /api/auth/me`)
- Overview metrics (bookings, customers, staff, services)
- Bookings: filter + create + edit + delete + availability slot picker
- Customers: list + create + edit + delete
- Users: list + create + edit + delete
- Services list
- Role-aware navigation placeholders for:
  - Overview
  - Bookings
  - Customers
  - Staff
  - Services
  - Integration

## Install

1. Copy `wordpress-plugin/nail-dashboard` into your WordPress site:
   - `wp-content/plugins/nail-dashboard`
2. Activate plugin in WordPress admin.
3. Go to `Settings -> Nail Dashboard`.
4. Set `Backend API Base URL` (example: `https://api.yourdomain.com/api`).
5. Save settings.
6. Visit `https://your-wordpress-site.com/dashboard`.

## Notes

- First activation requires permalink flush for `/dashboard` rewrite:
  - Visit `Settings -> Permalinks` and click Save.
- The dashboard uses backend credentials, not WordPress users.
- JavaScript architecture is feature-based and split for maintainability.

## JS Architecture

```
assets/js/
  app.js                    # app shell + orchestration only
  api-client.js             # backend API wrapper
  core/
    state.js                # state shape + state reset helpers
    helpers.js              # shared formatters/utilities
  features/
    auth.js                 # login view
    overview.js             # overview panel
    bookings.js             # bookings panel + handlers
    customers.js            # customers panel + handlers
    users.js                # users panel + handlers
    services.js             # services panel + handlers
    integration.js          # integration panel
```

## Next implementation targets

1. Add technician-services assignment UI.
2. Add booking calendar/timeline visualization.
3. Add integration test button for webhook payload validation.
4. Add pagination/virtualized rows for large datasets.
5. Add toast notifications and non-blocking error surface.
