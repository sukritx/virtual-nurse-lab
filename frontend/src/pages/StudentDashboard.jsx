import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import CircularProgressBar from '../components/CircularProgressBar';
import { NavigationMenu } from '../components/NavigationMenu';
import { useNavigate } from 'react-router-dom';

export const StudentDashboard = () => {
  const [labs, setLabs] = useState([]);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchLabs();
  }, [token]);

  const fetchLabs = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/v1/student/labs', {
        headers: {
          Authorization: `Bearer ${token}`,
        }
      });
      setLabs(response.data.labs);
    } catch (error) {
      console.error('Error fetching labs:', error);
    }
  };

  const completedPercentage = Math.floor((labs.filter(lab => lab.isPass !== null && lab.isPass).length / labs.length) * 100);

  return (
    <div className="min-h-screen bg-gray-100">
      <NavigationMenu />
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-6">Student's Dashboard</h1>
        <div className="flex justify-center mb-6">
          <CircularProgressBar percentage={completedPercentage} label={`${completedPercentage}%`} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {labs.map((lab, index) => (
            <div key={lab.labInfo._id} className={`bg-white p-4 rounded-lg shadow-md flex flex-col items-center justify-between ${lab.isPass === null ? 'bg-gray-300' : lab.isPass ? 'bg-green-300' : 'bg-red-300'}`}>
              <h2 className="text-lg font-semibold mb-4">Lab {lab.labInfo.labNumber}</h2>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center`}>
                {lab.isPass === null ? ' ' : lab.isPass ? '✓' : '✗'}
              </div>
              <p className="mt-4">{lab.isPass === null ? 'Not attempted' : lab.isPass ? 'Passed' : 'Try again'}</p>
              <button
                onClick={() => navigate(`/student/upload${lab.labInfo.labNumber}`)}
                className="mt-4 bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 transition duration-200"
              >
                View
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
