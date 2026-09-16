import axios from 'axios';
import { getToken, setToken } from './tokenStore';

const apiClient = axios.create({
  // VITE_API_URL is the API's origin, empty when nginx serves the SPA on the same origin. The
  // version lives here and nowhere else, so call sites say '/albums' (docs: api-versioning/02,
  // decision 6).
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api/v1`,
  headers: { 'Content-Type': 'application/json' }
});

apiClient.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      setToken(null);
      window.location.replace('/login');
    }
    return Promise.reject(err);
  }
);

export default apiClient;
