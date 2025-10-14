import { useState, useEffect } from 'react';
import axios from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaTimesCircle, FaQuestionCircle } from 'react-icons/fa';

const SurgicalStudentLabs = () => {
  const [labs, setLabs] = useState([]);
  const [student, setStudent] = useState(null);
  const { token } = useAuth();
  const { userId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    fetchStudentLabs();
  }, [token, userId]);

  const fetchStudentLabs = async () => {
    try {
      const response = await axios.get(`/api/v1/professor/student/${userId}/surgical/labs`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setLabs(response.data.labs.sort((a, b) => a.labNumber - b.labNumber));
      setStudent(response.data.student);
    } catch (error) {
      console.error('Error fetching student labs:', error);
    }
  };

  if (!student) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-100">
      <header className="w-full">
      </header>
      <main className="w-full max-w-7xl px-4 py-10 flex flex-col items-center">
        <div className="bg-white p-6 rounded-lg shadow-md mb-8 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold mb-2">{student.firstName} {student.lastName}</h2>
          <p className="text-lg"><strong>Student ID:</strong> {student.studentId}</p>
          <p className="text-lg"><strong>University:</strong> {student.university}</p>
        </div>
        <h1 className="text-4xl font-bold mb-8 text-center">Student Labs</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8 w-full">
          {labs.map((lab) => (
            <div
              key={lab.labNumber}
              className={`flex flex-col items-center bg-white p-4 rounded-lg shadow-md ${
                lab.isPass === null ? 'border-gray-500' : lab.isPass ? 'border-green-500' : 'border-red-500'
              }`}
            >
              <h2 className="text-xl font-bold mb-2">Lab {lab.labNumber}</h2>
              <div className="flex items-center mb-2">
                {lab.isPass === null ? (
                  <FaQuestionCircle className="text-gray-500 mr-2" />
                ) : lab.isPass ? (
                  <FaCheckCircle className="text-green-700 mr-2" />
                ) : (
                  <FaTimesCircle className="text-red-700 mr-2" />
                )}
                <span className="text-lg font-semibold">
                  {lab.isPass === null ? 'Not Attempted' : lab.isPass ? 'Passed' : 'Not Passed'}
                </span>
              </div>
              {lab.attemptCount > 0 && (
                <p className="text-sm mb-2">
                  Attempts: {lab.attemptCount} | Latest: {lab.latestAttempt.isPass ? 'Pass' : 'Fail'}
                </p>
              )}
              {lab.attemptCount > 0 && (
                <button
                  onClick={() => navigate(`/professor/surgical/view-lab/${userId}/${lab.labNumber}`)}
                  className="py-2 px-4 bg-purple-600 text-white rounded hover:bg-purple-700 transition duration-200"
                >
                  View Details
                </button>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default SurgicalStudentLabs;