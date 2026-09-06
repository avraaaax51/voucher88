# Authentication and Login Activity Testing

## Session checks

1. Sign in using an existing valid account and confirm the response sets only httpOnly
   access and refresh cookies.
2. Request `GET /api/auth/me` with those cookies and confirm it returns the signed-in user.
3. Sign out and confirm both cookies are removed and `/api/auth/me` returns 401.

## Login activity checks

1. Sign in as the Super Admin and call `GET /api/users/login-activities` with cookies.
2. Confirm the latest activity contains the signed-in name, role, successful status, and time.
3. Sign in as an Admin or Kasir and confirm the same endpoint returns 403.
4. Confirm the activity endpoint never returns a MongoDB `_id`, password hash, PIN hash,
   session token, or reset code.

## Quick voucher link checks

1. Create and print a new voucher, then scan its QR code using the device camera.
2. Confirm the QR opens `/kasir?scan=<voucher-code>`.
3. With an active session, confirm the voucher is redeemed automatically once.
4. Confirm a second scan reports that the voucher was already used.