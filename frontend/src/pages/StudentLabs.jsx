import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

const StudentLabs = () => {
  const [labs, setLabs] = useState([]);
  const [student, setStudent] = useState(null);
  const { token } = useAuth();
  const { studentId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    fetchStudentLabs();
  }, [token, studentId]);

  const fetchStudentLabs = async () => {
    try {
      const response = await axios.get(`http://localhost:3000/api/v1/professor/student/${studentId}/labs`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setLabs(response.data.labs);
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
              className={`flex flex-col items-center bg-white p-4 rounded-lg shadow-md ${lab.isPass === null ? 'border-gray-500' : lab.isPass ? 'border-green-500' : 'border-red-500'}`}
            >
              <h2 className="text-xl font-bold mb-2">Lab {lab.labNumber}</h2>
              <div className="flex items-center mb-2">
                {lab.isPass === null ? (
                  <div className="w-4 h-4 rounded-full bg-gray-500 mr-2"></div>
                ) : lab.isPass ? (
                  <FaCheckCircle className="text-green-700 mr-2" />
                ) : (
                  <FaTimesCircle className="text-red-700 mr-2" />
                )}
                <span className="text-lg font-semibold">
                  {lab.isPass === null ? 'Not Done' : lab.isPass ? 'Passed' : 'Failed'}
                </span>
              </div>
              {lab.isPass !== null && (
                <button
                  onClick={() => navigate(`/professor/view-lab/${studentId}/${lab.labNumber}`)}
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

export default StudentLabs;
