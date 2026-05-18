import './App.css';
import { LoginPage } from "@/features/pages/LoginPage.tsx";
import { Routes, Route, Navigate } from "react-router-dom";
import { WelcomePage } from "@/features/pages/WelcomePage.tsx";
import { AlbumGrid } from "@/features/albums/components/AlbumGrid.tsx";
import { AlbumForm } from "@/features/albums/components/AlbumForm.tsx";
import { NavBar } from "@/components/NavBar.tsx";
import { AuthContext } from "@/features/auth/context/AuthContext.tsx";
import { ProtectedRoute } from "@/components/ProtectedRoute.tsx";
import { useContext } from "react";

function App() {
  const { token } = useContext(AuthContext)!;
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/login" element={
          token ? <Navigate to="/albums" replace /> : <LoginPage />
        } />
        <Route element={<ProtectedRoute />}>
          <Route path="/albums" element={<AlbumGrid />} />
          <Route path="/albums/new" element={<AlbumForm />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
