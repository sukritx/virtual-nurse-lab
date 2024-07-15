import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Homepage } from "./pages/Homepage";
import { Signup } from "./pages/Signup";
import { Signin } from "./pages/Signin";
import { Dashboard } from "./pages/Dashboard";
import { ProfessorDashboard } from "./pages/ProfessorDashboard";
import { AdminDashboard } from "./pages/AdminDashboard";
import { StudentDashboard } from "./pages/StudentDashboard";
import { LabPage } from "./pages/LabPage";
import { AuthProvider } from './context/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import Library from './pages/Library';
import BlogContent from './pages/BlogContent';
import UploadTest from './components/UploadTest';
import Upload1 from './components/Upload1';
import Upload4 from './components/Upload4';
import Contact from './pages/Contact';
import Sale from './pages/Sale';

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
          <Route path="/student/dashboard" element={
            <PrivateRoute>
              <StudentDashboard />
            </PrivateRoute>
          } />
          <Route path="/lab/:labId" element={
            <PrivateRoute>
              <LabPage />
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
          <Route path="/student/upload1" element={
            <PrivateRoute>
              <Upload1 />
            </PrivateRoute>
          } />
          <Route path="/student/upload4" element={
            <PrivateRoute>
              <Upload4 />
            </PrivateRoute>
          } />
          <Route path="/contact" element={<Contact />} />
          <Route path="/sale" element={<Sale />} />
          <Route path="/test-upload" element={<UploadTest />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:id" element={<BlogContent />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
