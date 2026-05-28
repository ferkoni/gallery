import { Outlet, Navigate } from "react-router-dom";
import { useAuthContext } from "@/features/auth/hooks/useAuthContext";

export function ProtectedRoute() {
  const { token } = useAuthContext();
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}
