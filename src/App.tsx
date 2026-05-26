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
import { S3CredentialsPage } from "@/features/settings/pages/S3CredentialsPage.tsx";
import { AlbumDetailPage } from "@/features/images/pages/AlbumDetailPage.tsx";
import { UploadQueue } from "@/features/images/components/UploadQueue.tsx";

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
          <Route path="/albums/:id" element={<AlbumDetailPage />} />
          <Route path="/albums/:id/edit" element={<AlbumEditPage />} />
          <Route path="/settings/s3_credential" element={<S3CredentialsPage />} />
        </Route>
      </Routes>
      <UploadQueue />
    </>
  );
}

export default App;
