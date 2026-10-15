import bcrypt from 'bcryptjs';

const BCRYPT_SALT_ROUNDS = 12;

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export interface PasswordPolicyResult {
  isValid: boolean;
  message?: string;
}

export const validatePasswordPolicy = (password: string): PasswordPolicyResult => {
  if (password.length < 8) {
    return { isValid: false, message: 'Password must be at least 8 characters long.' };
  }

  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  if (!hasUppercase) {
    return { isValid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!hasLowercase) {
    return { isValid: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!hasNumber) {
    return { isValid: false, message: 'Password must contain at least one number.' };
  }
  if (!hasSpecial) {
    return { isValid: false, message: 'Password must contain at least one special character.' };
  }

  return { isValid: true };
};
