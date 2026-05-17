import apiClient from "@/lib/api/client.ts";

export async function loginRequest(email: string, password: string) {
  return apiClient.post('/api/users/login', { user: { email, password } });
}