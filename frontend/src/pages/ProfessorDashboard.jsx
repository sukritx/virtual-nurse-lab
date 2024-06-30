import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { NavigationMenu } from '../components/NavigationMenu';
import CircularProgressBar from '../components/CircularProgressBar';
import { SearchBar } from '../components/SearchBar';
import logo from '../assets/NU_CMU_LOGO.png';
import { Button } from '../components/Button';
import { useNavigate } from 'react-router-dom';

export const ProfessorDashboard = () => {
  const [university, setUniversity] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchUniversityData();
  }, [token]);

  const fetchUniversityData = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/v1/professor/university', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setUniversity(response.data);
    } catch (error) {
      console.error('Error fetching university data:', error);
    }
  };

  const filteredStudents = university?.students.filter(student => 
    student.studentId.includes(searchQuery) || 
    `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!university) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-100">
      <header className="w-full">
        <NavigationMenu />
        <img src={logo} alt="Logo" className="h-32 mx-auto my-4" />
      </header>
      <main className="w-full max-w-4xl px-4 text-center">
        <h1 className="text-4xl font-bold mb-4">Professor Dashboard</h1>
        <div className="flex justify-between mb-4">
          <span className="text-lg">Statistics</span>
          <span className="text-lg">Registered student: {university.students.length}/{university.numberOfStudents}</span>
        </div>
        <div className="flex justify-around mb-4">
          <div className="flex flex-col items-center">
            <span>Lab 1</span>
            <CircularProgressBar percentage={46} label="Completed" />
          </div>
          <div className="flex flex-col items-center">
            <span>Lab 2</span>
            <CircularProgressBar percentage={64} label="Completed" />
          </div>
          {/* Repeat for other labs */}
          <div className="flex flex-col items-center">
            <span>Lab 3</span>
          </div>
          <div className="flex flex-col items-center">
            <span>Lab 4</span>
          </div>
          <div className="flex flex-col items-center">
            <span>Lab 6</span>
          </div>
          <div className="flex flex-col items-center">
            <span>Lab 7</span>
          </div>
          <div className="flex flex-col items-center">
            <span>Lab 8</span>
          </div>
          <div className="flex flex-col items-center">
            <span>Lab 9</span>
          </div>
        </div>
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        <table className="min-w-full bg-white shadow-md rounded my-6">
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
              <tr key={student._id} className="border-b border-gray-200 hover:bg-gray-100">
                <td className="py-3 px-6 text-left">{student.studentId}</td>
                <td className="py-3 px-6 text-left">{student.firstName} {student.lastName}</td>
                <td className="py-3 px-6 text-center">
                  <div className="flex justify-center space-x-2">
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                    <div className="w-4 h-4 rounded-full bg-red-500"></div>
                    <div className="w-4 h-4 rounded-full bg-red-500"></div>
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                  </div>
                </td>
                <td className="py-3 px-6 text-center">
                  <Button onClick={() => navigate(`/view-labs?studentId=${student._id}`)} label={"View Labs"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
};
