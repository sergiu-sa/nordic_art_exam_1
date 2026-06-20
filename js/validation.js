// Pure, DOM-free field validators for the auth and artwork forms. Each returns null when the value is acceptable, or a single inline message string.
//  Callers trim values before submitting; these only judge what they are given.

// We tighten the API's `(stud\.)?noroff\.no` to require stud. per the brief.
const EMAIL_PATTERN = /^[\w\-.]+@stud\.noroff\.no$/i;
// Noroff name rule: word characters only
const NAME_PATTERN = /^\w+$/;
const DIGITS_ONLY = /^\d+$/;

const NAME_MAX = 20;
const PASSWORD_MIN = 8;
const IMAGE_URL_MAX = 300;
const IMAGE_ALT_MAX = 120;

const BAD_EMAIL = "Enter a valid stud.noroff.no email address.";
const BAD_YEAR = "Enter a valid year — a positive whole number like 1893.";
const BAD_IMAGE_URL = "Enter a valid image URL starting with http:// or https://.";

const isNullish = (value) => value === null || value === undefined;
// Absent for an optional field, or whitespace-only where that reads as empty.
const isBlank = (value) => isNullish(value) || String(value).trim() === "";
// Stricter: only null/undefined or the empty string (passwords may be spaces).
const isEmpty = (value) => isNullish(value) || String(value) === "";

export function validateRequired(value, label = "This field") {
  return isBlank(value) ? `${label} is required.` : null;
}

export function validateEmail(value) {
  if (isBlank(value)) return "Email is required.";
  return EMAIL_PATTERN.test(value) ? null : BAD_EMAIL;
}

export function validatePassword(value) {
  if (isEmpty(value)) return "Password is required.";
  return String(value).length >= PASSWORD_MIN
    ? null
    : `Password must be at least ${PASSWORD_MIN} characters.`;
}

export function validateName(value) {
  if (isBlank(value)) return "Name is required.";
  if (!NAME_PATTERN.test(value)) {
    return "Name can use only letters, numbers and underscores.";
  }
  return value.length > NAME_MAX ? `Name must be ${NAME_MAX} characters or fewer.` : null;
}

export function validateYear(value) {
  if (isBlank(value)) return null;
  const text = String(value).trim();
  const isPositiveWholeNumber = DIGITS_ONLY.test(text) && Number(text) > 0;
  return isPositiveWholeNumber ? null : BAD_YEAR;
}

export function validateImageUrl(value) {
  if (isBlank(value)) return null;
  const text = String(value).trim();
  if (text.length > IMAGE_URL_MAX) {
    return `Image URL must be ${IMAGE_URL_MAX} characters or fewer.`;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return BAD_IMAGE_URL;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? null : BAD_IMAGE_URL;
}

export function validateImageAlt(value) {
  if (isBlank(value)) return null;
  return String(value).trim().length > IMAGE_ALT_MAX
    ? `Alt text must be ${IMAGE_ALT_MAX} characters or fewer.`
    : null;
}
