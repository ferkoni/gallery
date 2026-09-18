import { isAxiosError } from 'axios';

// TanStack retries a failed query three times with backoff. A 4xx is the API's answer, not a
// hiccup — asking again only holds the skeleton for seven seconds before the same message
// (docs: photos-without-credentials/02, decision 5). Network failures and 5xx keep the default.
export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (isAxiosError(error) && error.response && error.response.status < 500) return false;
  return failureCount < 3;
}
