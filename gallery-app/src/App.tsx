import './App.css';
import { LoginPage } from "@/features/pages/LoginPage.tsx";
import { Routes, Route, Navigate } from "react-router-dom";
import { WelcomePage } from "@/features/pages/WelcomePage.tsx";
import { AlbumListPage } from "@/features/albums/pages/AlbumListPage.tsx";
import { AlbumNewPage } from "@/features/albums/pages/AlbumNewPage.tsx";
import { NavBar } from "@/components/NavBar.tsx";
import { ProtectedRoute } from "@/components/ProtectedRoute.tsx";
import { S3CredentialsPage } from "@/features/settings/pages/S3CredentialsPage.tsx";
import { AlbumDetailPage } from "@/features/images/pages/AlbumDetailPage.tsx";
import { FavoritesPage } from "@/features/images/pages/FavoritesPage.tsx";
import { SearchPage } from "@/features/images/pages/SearchPage.tsx";
import { UploadQueue } from "@/features/images/components/UploadQueue.tsx";
import { useAuthContext } from "@/features/auth/hooks/useAuthContext";

function App() {
  const { token } = useAuthContext();
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
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings/s3_credential" element={<S3CredentialsPage />} />
        </Route>
      </Routes>
      <UploadQueue />
    </>
  );
}

export default App;
