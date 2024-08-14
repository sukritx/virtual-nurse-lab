import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import CircularProgressBar from '../components/CircularProgressBar';
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
      const response = await axios.get('/api/v1/student/labs', {
        headers: {
          Authorization: `Bearer ${token}`,
        }
      });
      setLabs(response.data.labs.sort((a, b) => a.labInfo.labNumber - b.labInfo.labNumber));
    } catch (error) {
      console.error('Error fetching labs:', error);
    }
  };

  const isLabAvailable = (labNumber) => [1, 4].includes(labNumber);

  const completedPercentage = Math.floor((labs.filter(lab => lab.isPass !== null && lab.isPass && isLabAvailable(lab.labInfo.labNumber)).length / labs.filter(lab => isLabAvailable(lab.labInfo.labNumber)).length) * 100);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-6 text-center">Student's Dashboard</h1>
        <div className="flex flex-col items-center mb-6">
          <CircularProgressBar percentage={completedPercentage} label={`${completedPercentage}%`} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {labs.map((lab) => {
            const isAvailable = isLabAvailable(lab.labInfo.labNumber);
            return (
              <div key={lab.labInfo._id} className={`relative bg-white p-4 rounded-lg shadow-md flex flex-col items-center justify-between ${
                isAvailable
                  ? lab.isPass === null
                    ? 'bg-gray-100'
                    : lab.isPass
                    ? 'bg-green-100'
                    : 'bg-red-100'
                  : 'bg-gray-300 opacity-50'
              }`}>
                {isAvailable && (
                  <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded">
                    Demo
                  </span>
                )}
                <h2 className="text-xl font-semibold">Lab {lab.labInfo.labNumber}</h2>
                <p className="text-sm text-gray-600">{lab.labInfo.labName}</p>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center`}>
                  {isAvailable
                    ? lab.isPass === null
                      ? ' '
                      : lab.isPass
                      ? '✓'
                      : '✗'
                    : '-'}
                </div>
                <p className="mt-4">
                  {isAvailable
                    ? lab.isPass === null
                      ? 'Not attempted'
                      : lab.isPass
                      ? 'Passed'
                      : 'Try again'
                    : 'Unavailable'}
                </p>
                {isAvailable && (
                  <>
                    <button
                      onClick={() => navigate(`/student/upload${lab.labInfo.labNumber}`)}
                      className="mt-4 bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 transition duration-200"
                    >
                      View
                    </button>
                    {lab.isPass !== null && (
                      <button
                        onClick={() => navigate(`/student/lab/${lab.labInfo.labNumber}/history`)}
                        className="mt-4 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition duration-200"
                      >
                        View Lab History
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};