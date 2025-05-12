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
import PostpartumDashboard from './pages/PostpartumDashboard';
import AntenatalDashboard from './pages/AntenatalDashboard';
import IntrapartumDashboard from './pages/IntrapartumDashboard';
import { LabPage } from './pages/LabPage';
import Library from './pages/Library';
import BlogContent from './pages/BlogContent';
import UploadTest from './components/UploadTest';
import Upload1 from './components/Lab-Reuse-Component/Lab1';
import Upload1Cn from './components/Lab-Clientside-Record/Upload1Cn';
import Upload1En from './components/Lab-Clientside-Record/Upload1En';
import UploadJp from './components/Lab-Clientside-Record/Upload1Jp';
import Upload1Indo from './components/Lab-Reuse-Component/Lab1Indo';
import Upload2 from './components/Lab-Reuse-Component/Lab2';
import Upload3 from './components/Lab-Reuse-Component/Lab3';
import Upload4 from './components/Lab-Reuse-Component/Lab4';
import Upload4En from './components/Lab-Clientside-Record/Upload4En';
import Upload4Cn from './components/Lab-Clientside-Record/Upload4Cn';
import Upload5 from './components/Lab-Reuse-Component/Lab5';
import Upload6 from './components/Lab-Reuse-Component/Lab6';
import Upload7 from './components/Lab-Reuse-Component/Lab7';
import Upload8 from './components/Lab-Reuse-Component/Lab8';
import Upload9 from './components/Lab-Reuse-Component/Lab9';
import Upload10 from './components/Lab-Reuse-Component/Lab10';
import Maternalchild11 from './components/Lab-Reuse-Component/Maternalchild/Lab11';
import Maternalchild12 from './components/Lab-Reuse-Component/Maternalchild/Lab12';
import Maternalchild13 from './components/Lab-Reuse-Component/Maternalchild/Lab13';
import Maternalchild14 from './components/Lab-Reuse-Component/Maternalchild/Lab14';
import Maternalchild15 from './components/Lab-Reuse-Component/Maternalchild/Lab15';
import Maternalchild16 from './components/Lab-Reuse-Component/Maternalchild/Lab16';
import Maternalchild17 from './components/Lab-Reuse-Component/Maternalchild/Lab17';
import Maternalchild18 from './components/Lab-Reuse-Component/Maternalchild/Lab18';
import Maternalchild19 from './components/Lab-Reuse-Component/Maternalchild/Lab19';
import Maternalchild20 from './components/Lab-Reuse-Component/Maternalchild/Lab20';
import Contact from './pages/Contact';
import Sale from './pages/Sale';
import StudentLabs from './pages/StudentLabs';
import LabDetails from './pages/LabDetails';
import LabHistory from './pages/LabHistory';
{/* 315 */}
import StudentDashboard315 from './pages/315/StudentDashboard315';
import Subject315LabHistory from './pages/315/Subject315LabHistory';
import Subject315Lab1 from './components/Lab-Reuse-Component/315/Subject315Lab1';
import Subject315Lab1En from './components/Lab-Reuse-Component/315/Subject315Lab1En';
import Subject315Lab2 from './components/Lab-Reuse-Component/315/Subject315Lab2';
import Subject315Lab2En from './components/Lab-Reuse-Component/315/Subject315Lab2En';
import Subject315Lab3 from './components/Lab-Reuse-Component/315/Subject315Lab3';
import Subject315Lab3En from './components/Lab-Reuse-Component/315/Subject315Lab3En';
import { Subject315ProfessorDashboard } from './pages/315/Subject315ProfessorDashboard';
import Subject315StudentLabs from './pages/315/Subject315StudentLabs';
import Subject315LabDetails from './pages/315/Subject315LabDetails';

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
              <Route path="/student/postpartum" element={<PostpartumDashboard />} />
              <Route path="/student/antenatal" element={<AntenatalDashboard />} />
              <Route path="/student/intrapartum" element={<IntrapartumDashboard />} />
              <Route path="/lab/:labId" element={<LabPage />} />
              <Route path="/student/maternalchild1" element={<Upload1 />} />
              <Route path="/student/maternalchild1cn" element={<Upload1Cn />} />
              <Route path="/student/maternalchild1en" element={<Upload1En />} />
              <Route path="/student/maternalchild1jp" element={<UploadJp />} />
              <Route path="/student/maternalchild1indo" element={<Upload1Indo />} />
              <Route path="/student/maternalchild2" element={<Upload2 />} />
              <Route path="/student/maternalchild3" element={<Upload3 />} />
              <Route path="/student/maternalchild4" element={<Upload4 />} />
              <Route path="/student/maternalchild4en" element={<Upload4En />} />
              <Route path="/student/maternalchild4cn" element={<Upload4Cn />} />
              <Route path="/student/maternalchild5" element={<Upload5 />} />
              <Route path="/student/maternalchild6" element={<Upload6 />} />
              <Route path="/student/maternalchild7" element={<Upload7 />} />
              <Route path="/student/maternalchild8" element={<Upload8 />} />
              <Route path="/student/maternalchild9" element={<Upload9 />} />
              <Route path="/student/maternalchild10" element={<Upload10 />} />
              <Route path="/student/maternalchild11" element={<Maternalchild11 />} />
              <Route path="/student/maternalchild12" element={<Maternalchild12 />} />
              <Route path="/student/maternalchild13" element={<Maternalchild13 />} />
              <Route path="/student/maternalchild14" element={<Maternalchild14 />} />
              <Route path="/student/maternalchild15" element={<Maternalchild15 />} />
              <Route path="/student/maternalchild16" element={<Maternalchild16 />} />
              <Route path="/student/maternalchild17" element={<Maternalchild17 />} />
              <Route path="/student/maternalchild18" element={<Maternalchild18 />} />
              <Route path="/student/maternalchild19" element={<Maternalchild19 />} />
              <Route path="/student/maternalchild20" element={<Maternalchild20 />} />
              <Route path="/student/lab/:subject/:labNumber/history" element={<LabHistory />} />
              <Route path="/student/lab/:subject/:labNumber/details" element={<LabDetails />} />

              {/* 315 */}
              <Route path="/student/315/dashboard" element={<StudentDashboard315 />} />
              <Route path="/student/315/:labNumber/history" element={<Subject315LabHistory />} />
              <Route path="/student/315/1" element={<Subject315Lab1 />} />
              <Route path="/student/315/1en" element={<Subject315Lab1En />} />
              <Route path="/student/315/2" element={<Subject315Lab2 />} />
              <Route path="/student/315/2en" element={<Subject315Lab2En />} />
              <Route path="/student/315/3" element={<Subject315Lab3 />} />
              <Route path="/student/315/3en" element={<Subject315Lab3En />} />
            </Route>
          </Route>

          {/* Professor Routes */}
          <Route element={<PrivateRoute role="professor" />}>
            <Route element={<MainLayout />}>
              <Route path="/professor/dashboard" element={<ProfessorDashboard />} />
              <Route path="/professor/view-labs/:userId" element={<StudentLabs />} />
              <Route path="/professor/view-lab/:userId/:labNumber" element={<LabDetails />} />

              {/* 315 */}
              <Route path="/professor/315/dashboard" element={<Subject315ProfessorDashboard />} />
              <Route path="/professor/315/view-labs/:userId" element={<Subject315StudentLabs />} />
              <Route path="/professor/315/view-lab/:userId/:labNumber" element={<Subject315LabDetails />} />
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
