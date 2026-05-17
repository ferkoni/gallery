import './App.css';
import { LoginPage } from "@/features/pages/LoginPage.tsx";
import { Routes, Route, Navigate } from "react-router-dom";
import { WelcomePage } from "@/features/pages/WelcomePage.tsx";
import { AlbumGrid } from "@/features/albums/components/AlbumGrid.tsx";
import { NavBar } from "@/components/NavBar.tsx";
import { AuthContext } from "@/features/auth/context/AuthContext.tsx";
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
        <Route path="/albums" element={
          token ? <AlbumGrid /> : <Navigate to="/login" replace />
        } />
      </Routes>
    </>
  );
}

export default App;
