// LabPage.jsx
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import CircularProgressBar from '../components/CircularProgressBar';

export const LabPage = ({ match }) => {
  const [lab, setLab] = useState(null);
  const { token } = useAuth();
  const labId = match.params.labId;

  useEffect(() => {
    fetchLab();
  }, [token, labId]);

  const fetchLab = async () => {
    try {
      const response = await axios.get(`http://localhost:3000/api/v1/student/lab/${labId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setLab(response.data.lab);
    } catch (error) {
      console.error('Error fetching lab:', error);
    }
  };

  if (!lab) {
    return <div>Loading...</div>;
  }

  const { isPass, feedback, attempts, grading } = lab;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-6">Lab {lab.labNumber}</h1>
        <div className="flex justify-between items-center mb-6">
          <span className="text-xl">Attempt: {attempts.length}</span>
          <div className={`text-xl ${isPass ? 'text-green-500' : 'text-red-500'}`}>
            {isPass ? 'Passed' : 'Try again'}
          </div>
        </div>
        <div className="flex justify-center mb-6">
          <CircularProgressBar percentage={grading} label={`${grading}%`} />
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4">Feedback:</h2>
          <p className="text-gray-700">{feedback}</p>
        </div>
        <button
          onClick={() => navigate(`/retake-lab/${lab._id}`)}
          className="mt-6 bg-purple-600 text-white py-3 px-6 rounded hover:bg-purple-700 transition duration-200"
        >
          Retake
        </button>
      </div>
    </div>
  );
};
