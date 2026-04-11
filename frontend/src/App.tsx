import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Trainings from './pages/Trainings';
import Aarshjul from './pages/Aarshjul';
import Catalog from './pages/Catalog';
import Board from './pages/Board';
import Profile from './pages/Profile';
import Admin from './pages/Admin';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { token } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route path="/" element={<Trainings />} />
                  <Route path="/aarshjul" element={<Aarshjul />} />
                  <Route path="/katalog" element={<Catalog />} />
                  <Route path="/tavle" element={<Board />} />
                  <Route path="/profil" element={<Profile />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
