import { LoginPage } from "@/features/pages/LoginPage.tsx";
import { Routes, Route, Navigate } from "react-router-dom";
import { WelcomePage } from "@/features/pages/WelcomePage.tsx";
import { AlbumListPage } from "@/features/albums/pages/AlbumListPage.tsx";
import { AlbumNewPage } from "@/features/albums/pages/AlbumNewPage.tsx";
import { LegacyAlbumRedirect } from "@/features/albums/components/LegacyAlbumRedirect.tsx";
import { NavBar } from "@/components/NavBar.tsx";
import { ProtectedRoute } from "@/components/ProtectedRoute.tsx";
import { S3CredentialsPage } from "@/features/settings/pages/S3CredentialsPage.tsx";
import { AlbumDetailPage } from "@/features/images/pages/AlbumDetailPage.tsx";
import { FavoritesPage } from "@/features/images/pages/FavoritesPage.tsx";
import { SearchPage } from "@/features/images/pages/SearchPage.tsx";
import { UploadQueue } from "@/features/images/components/UploadQueue.tsx";
import { DownloadQueue } from "@/features/downloads/components/DownloadQueue.tsx";
import { useAuthContext } from "@/features/auth/hooks/useAuthContext";
import { useUserChannel } from "@/features/downloads/hooks/useUserChannel";
import { useTaskPoller } from "@/features/downloads/hooks/useTaskPoller";

function App() {
  const { token } = useAuthContext();
  useUserChannel();
  useTaskPoller();
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/login" element={
          token ? <Navigate to="/folders" replace /> : <LoginPage />
        } />
        {/* Old bookmarks: redirect outside ProtectedRoute so auth is handled once, at /folders… */}
        <Route path="/albums" element={<Navigate to="/folders" replace />} />
        <Route path="/albums/new" element={<Navigate to="/folders/new" replace />} />
        <Route path="/albums/:id" element={<LegacyAlbumRedirect />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/folders" element={<AlbumListPage />} />
          <Route path="/folders/new" element={<AlbumNewPage />} />
          <Route path="/folders/:id" element={<AlbumDetailPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings/s3_credential" element={<S3CredentialsPage />} />
        </Route>
      </Routes>
      <UploadQueue />
      <DownloadQueue />
    </>
  );
}

export default App;
