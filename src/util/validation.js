// Validation utilities for form inputs

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateName = (name) => {
  return name && name.trim().length > 0;
};

export const validateStreet = (street) => {
  return street && street.trim().length > 0;
};

export const validatePostalCode = (postalCode) => {
  return postalCode && postalCode.trim().length > 0;
};

export const validateCity = (city) => {
  return city && city.trim().length > 0;
};

export const validateCheckoutForm = (formData) => {
  const errors = {};

  if (!validateName(formData.name)) {
    errors.name = 'Full name is required';
  }

  if (!validateEmail(formData.email)) {
    errors.email = 'Valid email is required';
  }

  if (!validateStreet(formData.street)) {
    errors.street = 'Street is required';
  }

  if (!validatePostalCode(formData['postal-code'])) {
    errors['postal-code'] = 'Postal code is required';
  }

  if (!validateCity(formData.city)) {
    errors.city = 'City is required';
  }

  return errors;
};

export const hasErrors = (errors) => {
  return Object.keys(errors).length > 0;
};
