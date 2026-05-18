import { AuthContext } from "@/features/auth/context/AuthContext.tsx";
import { useContext } from "react";
import { Outlet, Navigate } from "react-router-dom";

export function ProtectedRoute() {
  const { token } = useContext(AuthContext)!;
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}