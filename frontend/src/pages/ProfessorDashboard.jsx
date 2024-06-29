import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { NavigationMenu } from '../components/NavigationMenu';
import logo from '../assets/NU_CMU_LOGO.png';

export const ProfessorDashboard = () => {
  const [university, setUniversity] = useState(null);
  const { token } = useAuth();

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
            <div className="w-16 h-16 flex items-center justify-center rounded-full bg-red-500 text-white">
              46%
            </div>
          </div>
          <div className="flex flex-col items-center">
            <span>Lab 2</span>
            <div className="w-16 h-16 flex items-center justify-center rounded-full bg-green-500 text-white">
              64%
            </div>
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
        <table className="min-w-full bg-white shadow-md rounded my-6">
          <thead>
            <tr className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
              <th className="py-3 px-6 text-left">Student ID</th>
              <th className="py-3 px-6 text-left">Full Name</th>
              <th className="py-3 px-6 text-center">Progress</th>
            </tr>
          </thead>
          <tbody className="text-gray-600 text-sm font-light">
            {university.students.map((student) => (
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
};
