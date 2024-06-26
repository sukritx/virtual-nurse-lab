import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Homepage } from "./pages/Homepage";
import { Signup } from "./pages/Signup";
import { Signin } from "./pages/Signin";
import { Dashboard } from "./pages/Dashboard";
import { ProfessorDashboard } from "./pages/ProfessorDashboard";
import { AdminDashboard } from "./pages/AdminDashboard";
import { Labs } from './pages/Labs';
import { AuthProvider } from './context/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import Upload from './components/Upload';
import Library from './pages/Library';
import BlogContent from './pages/BlogContent';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Homepage />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/signin" element={<Signin />} />
          <Route path="/dashboard" element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } />
          <Route path="/professor/dashboard" element={
            <PrivateRoute role="professor">
              <ProfessorDashboard />
            </PrivateRoute>
          } />
          <Route path="/admin/dashboard" element={
            <PrivateRoute role="admin">
              <AdminDashboard />
            </PrivateRoute>
          } />
          <Route path="/labs/*" element={
            <PrivateRoute>
              <Labs />
            </PrivateRoute>
          } />
          <Route path="/upload" element={<Upload />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:id" element={<BlogContent />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;