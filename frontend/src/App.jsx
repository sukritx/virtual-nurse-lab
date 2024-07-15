import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';

// Pages
import { Homepage } from './pages/Homepage';
import { Signup } from './pages/Signup';
import { Signin } from './pages/Signin';
import { Dashboard } from './pages/Dashboard';
import { ProfessorDashboard } from './pages/ProfessorDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { StudentDashboard } from './pages/StudentDashboard';
import { LabPage } from './pages/LabPage';
import Library from './pages/Library';
import BlogContent from './pages/BlogContent';
import UploadTest from './components/UploadTest';
import Upload1 from './components/Upload1';
import Upload4 from './components/Upload4';
import Contact from './pages/Contact';
import Sale from './pages/Sale';
import StudentLabs from './pages/StudentLabs';
import LabDetails from './pages/LabDetails';

// Layouts
import MainLayout from './layouts/MainLayout';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Homepage />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/signin" element={<Signin />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/sale" element={<Sale />} />
            <Route path="/library" element={<Library />} />
            <Route path="/library/:id" element={<BlogContent />} />
          </Route>

          {/* Private Routes */}
          <Route element={<PrivateRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/student/dashboard" element={<StudentDashboard />} />
              <Route path="/lab/:labId" element={<LabPage />} />
              <Route path="/student/upload1" element={<Upload1 />} />
              <Route path="/student/upload4" element={<Upload4 />} />
              <Route path="/test-upload" element={<UploadTest />} />
            </Route>
          </Route>

          {/* Professor Routes */}
          <Route element={<PrivateRoute role="professor" />}>
            <Route element={<MainLayout />}>
              <Route path="/professor/dashboard" element={<ProfessorDashboard />} />
              <Route path="/professor/view-labs/:studentId" element={<StudentLabs />} />
              <Route path="/professor/view-lab/:studentId/:labNumber" element={<LabDetails />} />
            </Route>
          </Route>

          {/* Admin Routes */}
          <Route element={<PrivateRoute role="admin" />}>
            <Route element={<MainLayout />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
