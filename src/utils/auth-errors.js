// Friendly, safe messages for Supabase Auth errors. Raw error text is never shown to users.
const MESSAGES = {
  invalid_credentials: 'Invalid email or password.',
  email_not_confirmed: 'Please confirm your email address first. Check your inbox for the confirmation link.',
  user_already_exists: 'An account with this email already exists. Try logging in instead.',
  email_exists: 'An account with this email already exists. Try logging in instead.',
  weak_password: 'This password is too weak. Choose a longer, less common password.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  over_email_send_rate_limit: 'Too many emails were sent. Please wait a few minutes and try again.',
  signup_disabled: 'Registration is currently disabled.',
  email_provider_disabled: 'Email sign-in is currently unavailable.',
  email_address_invalid: 'This email address is not accepted. Please use a different one.',
  validation_failed: 'Please check the details you entered and try again.',
  user_banned: 'This account is not allowed to sign in.',
};

export function toAuthMessage(error) {
  if (error?.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error?.status === 429) return MESSAGES.over_request_rate_limit;
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0 || error instanceof TypeError) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
