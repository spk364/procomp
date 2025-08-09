export function isEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isPhoneNumber(phone: string): boolean {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

export function isURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isStrongPassword(password: string): boolean {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return strongPasswordRegex.test(password);
}

export function isValidAge(age: number, minAge: number = 0, maxAge: number = 120): boolean {
  return age >= minAge && age <= maxAge;
}

export function isValidWeight(weight: number, minWeight: number = 1, maxWeight: number = 500): boolean {
  return weight >= minWeight && weight <= maxWeight;
}

export function validateRequired(value: any, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') {
    return `${fieldName} is required`;
  }
  return null;
}

export function validateMinLength(value: string, minLength: number, fieldName: string): string | null {
  if (value.length < minLength) {
    return `${fieldName} must be at least ${minLength} characters long`;
  }
  return null;
}

export function validateMaxLength(value: string, maxLength: number, fieldName: string): string | null {
  if (value.length > maxLength) {
    return `${fieldName} must be no more than ${maxLength} characters long`;
  }
  return null;
}

export function validateEmailFormat(email: string): string | null {
  if (!isEmail(email)) {
    return 'Please enter a valid email address';
  }
  return null;
}

export function validatePasswordStrength(password: string): string | null {
  if (!isStrongPassword(password)) {
    return 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character';
  }
  return null;
} 