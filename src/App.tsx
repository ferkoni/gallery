import './App.css';
import { LoginPage } from "@/features/pages/LoginPage.tsx";
import { Routes, Route, Navigate } from "react-router-dom";
import { WelcomePage } from "@/features/pages/WelcomePage.tsx";
import { AlbumListPage } from "@/features/albums/pages/AlbumListPage.tsx";
import { AlbumNewPage } from "@/features/albums/pages/AlbumNewPage.tsx";
import { AlbumEditPage } from "@/features/albums/pages/AlbumEditPage.tsx";
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
          <Route path="/albums" element={<AlbumListPage />} />
          <Route path="/albums/new" element={<AlbumNewPage />} />
          <Route path="/albums/:id/edit" element={<AlbumEditPage />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
