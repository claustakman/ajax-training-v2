import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import BiometricSetupSheet from './components/BiometricSetupSheet';
import Login from './pages/Login';
import AcceptInvite from './pages/AcceptInvite';
import Trainings from './pages/Trainings';
import Aarshjul from './pages/Aarshjul';
import Catalog from './pages/Catalog';
import Board from './pages/Board';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Brugere from './pages/Brugere';
import TeamSettings from './pages/TeamSettings';
import TrainingEditor from './pages/TrainingEditor';
import Archive from './pages/Archive';
import Statistik from './pages/Statistik';

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
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <BiometricSetupSheet />
              <Layout>
                <Routes>
                  <Route path="/" element={<Trainings />} />
                  <Route path="/traininger" element={<Trainings />} />
                  <Route path="/traininger/:id" element={<TrainingEditor />} />
                  <Route path="/arkiv" element={<Archive />} />
                  <Route path="/statistik" element={<Statistik />} />
                  <Route path="/aarshjul" element={<Aarshjul />} />
                  <Route path="/katalog" element={<Catalog />} />
                  <Route path="/tavle" element={<Board />} />
                  <Route path="/profil" element={<Profile />} />
                  <Route path="/brugere" element={<Brugere />} />
                  <Route path="/holdindstillinger" element={<TeamSettings />} />
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
