import { isAxiosError } from 'axios';

// The API explains a failed upload as `{ errors: "<sentence for the user>" }` on a 422.
// axios's own message ("Request failed with status code 422") is for developers, so it
// is never shown: this returns the API's sentence when there is one, and the fallback
// for everything else — a network failure, a 500, or one of the API's other error
// shapes (objects from validation failures, arrays from login).
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const errors: unknown = err.response?.data?.errors;
    if (typeof errors === 'string' && errors.trim() !== '') return errors;
  }
  return fallback;
}
