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
import Upload1 from './components/Lab-Reuse-Component/Lab1';
import Upload1Cn from './components/Lab-Clientside-Record/Upload1Cn';
import Upload1En from './components/Lab-Clientside-Record/Upload1En';
import UploadJp from './components/Lab-Clientside-Record/Upload1Jp';
import Upload2 from './components/Lab-Reuse-Component/Lab2';
import Upload3 from './components/Lab-Clientside-Record/Upload3';
import Upload4 from './components/Lab-Clientside-Record/Upload4';
import Upload5 from './components/Lab-Clientside-Record/Upload5';
import Upload6 from './components/Lab-Clientside-Record/Upload6';
import Upload7 from './components/Lab-Clientside-Record/Upload7';
import Upload8 from './components/Lab-Clientside-Record/Upload8';
import Upload9 from './components/Lab-Clientside-Record/Upload9';
import Upload10 from './components/Lab-Clientside-Record/Upload10';
import Contact from './pages/Contact';
import Sale from './pages/Sale';
import StudentLabs from './pages/StudentLabs';
import LabDetails from './pages/LabDetails';
import LabHistory from './pages/LabHistory';
import UploadToSpace from './components/UploadToSpaces';

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
            <Route path="/student/test-upload" element={<UploadTest />} />
          </Route>

          {/* Private Routes */}
          <Route element={<PrivateRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/student/dashboard" element={<StudentDashboard />} />
              <Route path="/lab/:labId" element={<LabPage />} />
              <Route path="/student/upload1" element={<Upload1 />} />
              <Route path="/student/upload1cn" element={<Upload1Cn />} />
              <Route path="/student/upload1en" element={<Upload1En />} />
              <Route path="/student/upload1jp" element={<UploadJp />} />

              <Route path="/student/upload2" element={<Upload2 />} />
              <Route path="/student/upload3" element={<Upload3 />} />
              <Route path="/student/upload4" element={<Upload4 />} />
              <Route path="/student/upload5" element={<Upload5 />} />
              <Route path="/student/upload6" element={<Upload6 />} />
              <Route path="/student/upload7" element={<Upload7 />} />
              <Route path="/student/upload8" element={<Upload8 />} />
              <Route path="/student/upload9" element={<Upload9 />} />
              <Route path="/student/upload10" element={<Upload10 />} />
              <Route path="/student/upload-to-spaces" element={<UploadToSpace />} />
              <Route path="/student/lab/:labNumber/history" element={<LabHistory />} />
            </Route>
          </Route>

          {/* Professor Routes */}
          <Route element={<PrivateRoute role="professor" />}>
            <Route element={<MainLayout />}>
              <Route path="/professor/dashboard" element={<ProfessorDashboard />} />
              <Route path="/professor/view-labs/:userId" element={<StudentLabs />} />
              <Route path="/professor/view-lab/:userId/:labNumber" element={<LabDetails />} />
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
