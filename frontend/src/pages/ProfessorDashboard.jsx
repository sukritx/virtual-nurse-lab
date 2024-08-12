import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import CircularProgressBar from '../components/CircularProgressBar';
import { SearchBar } from '../components/SearchBar';
import { Button } from '../components/Button';
import { useNavigate } from 'react-router-dom';
import { Toast } from '../components/Toast';

export const ProfessorDashboard = () => {
  const [university, setUniversity] = useState(null);
  const [labStats, setLabStats] = useState([]);
  const [studentLabStatuses, setStudentLabStatuses] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchUniversityData();
  }, [token]);

  const fetchUniversityData = async () => {
    try {
      const universityResponse = await axios.get('/api/v1/professor/university', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setUniversity(universityResponse.data);

      const labsResponse = await axios.get('/api/v1/professor/labs', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setLabStats(labsResponse.data.labStats);
      setStudentLabStatuses(labsResponse.data.studentLabStatuses);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const downloadScores = async () => {
    setIsDownloading(true);
    try {
      const response = await axios.get('/api/v1/professor/download-scores', {
        headers: {
          Authorization: `Bearer ${token}`
        },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'student_scores.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setToastMessage('Scores downloaded successfully!');
    } catch (error) {
      console.error('Error downloading scores:', error);
      setToastMessage('Error downloading scores. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const filteredStudents = studentLabStatuses.filter(student =>
    student.studentId.includes(searchQuery) || 
    `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!university) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-100">
      <header className="w-full mt-10">
      </header>
      <main className="w-full max-w-7xl px-4 text-center">
        <h1 className="text-4xl font-bold mb-8">Professor Dashboard</h1>
        <div className="flex flex-wrap justify-between items-center mb-8">
          <div className="text-lg">Statistics</div>
          <div className="text-lg">Registered students: {university.students.length}/{university.numberOfStudents}</div>
        </div>
        <div className="flex flex-wrap justify-between items-center mb-8">
          <Button 
            onClick={downloadScores} 
            label={isDownloading ? "Downloading..." : "Download Scores"} 
            disabled={isDownloading}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {labStats.map(stat => (
            <div key={stat.labNumber} className="flex flex-col items-center bg-white p-4 rounded-lg shadow-md">
              <span className="text-lg font-semibold mb-2">Lab {stat.labNumber}</span>
              <CircularProgressBar percentage={Math.round((stat.completed / stat.total) * 100)} label="Completed" />
            </div>
          ))}
        </div>
        <div className="mb-8">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white shadow-md rounded-lg">
            <thead>
              <tr className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                <th className="py-3 px-6 text-left">Student ID</th>
                <th className="py-3 px-6 text-left">Full Name</th>
                <th className="py-3 px-6 text-center">Progress</th>
                <th className="py-3 px-6 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="text-gray-600 text-sm font-light">
              {filteredStudents.map((student) => (
                <tr key={student.studentId} className="border-b border-gray-200 hover:bg-gray-100">
                  <td className="py-3 px-6 text-left">{student.studentId}</td>
                  <td className="py-3 px-6 text-left">{student.firstName} {student.lastName}</td>
                  <td className="py-3 px-6 text-center">
                    <div className="flex justify-center space-x-2">
                      {student.labsStatus.map((labStatus, index) => (
                        <div key={index} className={`w-4 h-4 rounded-full ${labStatus.isPass === null ? 'bg-gray-500' : labStatus.isPass ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-6 text-center">
                    <Button onClick={() => navigate(`/professor/view-labs/${student._id}`)} label={"View Labs"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage('')} />}
    </div>
  );
};
