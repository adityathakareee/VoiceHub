# CSE Voice Hub — User Management API Specification

> **Base Route**: `/api/users`

---

## 1. Update User Profile
> `PATCH /api/users/me`

Updates editable profile fields (`firstName`, `lastName`, `department`) for the authenticated user.
Attempts to modify protected fields (`role`, `isActive`, `passwordHash`) are ignored or rejected.

### Request Body
```json
{
  "firstName": "Aditya",
  "lastName": "Thakare-Updated",
  "department": "Advanced Computer Engineering"
}
```

### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Profile updated successfully.",
  "data": {
    "user": {
      "id": "660a1f2b4c9e8d1234567890",
      "firstName": "Aditya",
      "lastName": "Thakare-Updated",
      "email": "aditya@example.com",
      "role": "STUDENT",
      "department": "Advanced Computer Engineering",
      "isActive": true
    }
  }
}
```

---

## 2. Change Password
> `PATCH /api/users/me/password`

Verifies the current password, hashes the new password, updates database records, and **clears the active HttpOnly session cookie**, requiring the user to re-authenticate with their new password.

### Request Body
```json
{
  "currentPassword": "SecurePassword123!",
  "newPassword": "NewPassword456!"
}
```

### Response (`200 OK`)
* **Headers**: `Set-Cookie: cse_voice_hub_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
```json
{
  "success": true,
  "message": "Password changed successfully. Your session has been invalidated. Please log in with your new password."
}
```

### Error Responses
* `400 Bad Request`: New password does not meet security policy.
* `401 Unauthorized`: Current password is incorrect or session cookie missing.
