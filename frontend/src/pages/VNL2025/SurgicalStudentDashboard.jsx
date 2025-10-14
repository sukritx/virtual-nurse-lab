// SurgicalStudentDashboard.jsx
import { useState, useEffect } from 'react';
import axios from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import CircularProgressBar from '../../components/CircularProgressBar';
import { useNavigate } from 'react-router-dom';

const SurgicalStudentDashboard = () => {
  const [labs, setLabs] = useState([]);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchLabs();
  }, [token]);

  const fetchLabs = async () => {
    try {
      const response = await axios.get('/api/v1/student/surgical/labs', {
        headers: {
          Authorization: `Bearer ${token}`,
        }
      });
      setLabs(response.data.labs.filter(lab => lab.labInfo.labNumber >= 1 && lab.labInfo.labNumber <= 5));
    } catch (error) {
      console.error('Error fetching labs:', error);
    }
  };

  const completedPercentage = Math.floor((labs.filter(lab => lab.everPassed).length / labs.length) * 100);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-6 text-center">Surgical Nursing</h1>
        <CircularProgressBar percentage={completedPercentage} label={`${completedPercentage}%`} />
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {labs.map((lab) => (
            <div key={lab.labInfo._id} className={`bg-white p-4 rounded-lg shadow-md flex flex-col items-center justify-between ${lab.isPass === null ? 'bg-gray-300' : lab.isPass || lab.everPassed ? 'bg-green-300' : 'bg-red-300'}`}>
              <h2 className="text-xl font-semibold">Lab {lab.labInfo.labNumber}</h2>
              <p className="text-sm text-gray-600">{lab.labInfo.labName}</p>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center`}>
                {lab.isPass === null ? ' ' : lab.isPass || lab.everPassed ? '✓' : '✗'}
              </div>
              <p className="mt-4">
                {lab.isPass === null ? 'Not attempted' : lab.isPass ? 'Passed' : lab.everPassed ? 'Previously passed' : 'Try again'}
              </p>
              {lab.everPassed && !lab.isPass && (
                <p className="text-sm text-green-600 mt-2">Previously passed</p>
              )}
              <button
                onClick={() => navigate(`/student/surgical/${lab.labInfo.labNumber}`)}
                className="mt-4 bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 transition duration-200"
              >
                View
              </button>
              {lab.isPass !== null && (
                <button
                  onClick={() => navigate(`/student/surgical/${lab.labInfo.labNumber}/history`)}
                  className="mt-4 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition duration-200"
                >
                  View Lab History
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SurgicalStudentDashboard;