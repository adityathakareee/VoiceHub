# CSE Voice Hub — Authentication API Specification

> **Base Route**: `/api/auth`

---

## 1. Public Registration
> `POST /api/auth/register`

Creates a new user account. Role is strictly assigned as `STUDENT` by the backend.

### Request Body
```json
{
  "firstName": "Aditya",
  "lastName": "Thakare",
  "email": "aditya@example.com",
  "password": "SecurePassword123!",
  "department": "Computer Engineering"
}
```

### Response (`201 Created`)
```json
{
  "success": true,
  "message": "Registration successful. You can now log in.",
  "data": {
    "user": {
      "id": "660a1f2b4c9e8d1234567890",
      "firstName": "Aditya",
      "lastName": "Thakare",
      "email": "aditya@example.com",
      "role": "STUDENT",
      "department": "Computer Engineering",
      "isActive": true,
      "createdAt": "2026-09-23T00:50:00.000Z",
      "updatedAt": "2026-09-23T00:50:00.000Z"
    }
  }
}
```

### Error Responses
* `400 Bad Request`: Validation failure (e.g. invalid email format, weak password).
* `409 Conflict`: Account with this email address already exists.
* `429 Too Many Requests`: Rate limit exceeded (max 30 requests per 15 minutes).

---

## 2. User Login
> `POST /api/auth/login`

Authenticates user credentials and sets a secure `HttpOnly` cookie containing the signed JWT.

### Request Body
```json
{
  "email": "aditya@example.com",
  "password": "SecurePassword123!"
}
```

### Response (`200 OK`)
* **Headers**: `Set-Cookie: cse_voice_hub_auth=<jwt_token>; Path=/; HttpOnly; SameSite=Lax`
* **Response Body**:
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "user": {
      "id": "660a1f2b4c9e8d1234567890",
      "firstName": "Aditya",
      "lastName": "Thakare",
      "email": "aditya@example.com",
      "role": "STUDENT",
      "department": "Computer Engineering",
      "isActive": true
    }
  }
}
```

### Error Responses
* `401 Unauthorized`: Generic error message (`"Invalid email or password."`) or account deactivated.
* `429 Too Many Requests`: Rate limit exceeded.

---

## 3. User Logout
> `POST /api/auth/logout`

Clears the `HttpOnly` authentication cookie and invalidates the browser session.

### Headers
* `Cookie: cse_voice_hub_auth=<jwt_token>`

### Response (`200 OK`)
* **Headers**: `Set-Cookie: cse_voice_hub_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
```json
{
  "success": true,
  "message": "Logout successful."
}
```

---

## 4. Current User Session
> `GET /api/auth/me`

Retrieves authenticated user profile. Requires a valid HttpOnly session cookie.

### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "660a1f2b4c9e8d1234567890",
      "firstName": "Aditya",
      "lastName": "Thakare",
      "email": "aditya@example.com",
      "role": "STUDENT",
      "department": "Computer Engineering",
      "isActive": true
    }
  }
}
```

### Error Responses
* `401 Unauthorized`: Missing, invalid, or expired session cookie.
