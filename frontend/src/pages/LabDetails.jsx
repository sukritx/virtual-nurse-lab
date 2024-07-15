import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useParams } from 'react-router-dom';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

const LabDetails = () => {
  const [labDetails, setLabDetails] = useState(null);
  const { token } = useAuth();
  const { studentId, labNumber } = useParams();

  useEffect(() => {
    fetchLabDetails();
  }, [token, studentId, labNumber]);

  const fetchLabDetails = async () => {
    try {
      const response = await axios.get(`http://localhost:3000/api/v1/professor/student/${studentId}/lab/${labNumber}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setLabDetails(response.data.lab);
    } catch (error) {
      console.error('Error fetching lab details:', error);
    }
  };

  if (!labDetails) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-100">
      <header className="w-full">
      </header>
      <main className="w-full max-w-4xl px-4 py-10">
        <h1 className="text-4xl font-bold mb-8 text-center">Lab {labNumber} Details</h1>
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold mb-4">Score: {labDetails.studentScore}</h2>
          <div className="mb-6 flex justify-center">
            <div style={{ width: '100px', height: '100px' }}>
              <CircularProgressbar
                value={labDetails.studentScore}
                maxValue={100}
                text={`${labDetails.studentScore}%`}
                styles={buildStyles({
                  textColor: '#333',
                  pathColor: labDetails.studentScore >= 50 ? 'green' : 'red',
                  trailColor: '#d6d6d6',
                })}
              />
            </div>
          </div>
          <div className="flex items-center justify-center mt-4">
            {labDetails.studentScore >= 50 ? (
              <FaCheckCircle className="text-green-700 mr-2" />
            ) : (
              <FaTimesCircle className="text-red-700 mr-2" />
            )}
            <h3 className={`text-lg font-bold ${labDetails.studentScore >= 50 ? 'text-green-700' : 'text-red-700'}`}>
              Status: {labDetails.studentScore >= 50 ? 'Passed' : 'Failed'}
            </h3>
          </div>
          <h3 className="text-lg font-bold mb-4">Pros:</h3>
          <p className="mb-4">{labDetails.pros}</p>
          <h3 className="text-lg font-bold mb-4">Recommendations:</h3>
          <p className="mb-4">{labDetails.recommendations}</p>
          {labDetails.videoPath && (
            <div className="mb-4">
              <video width="100%" controls>
                <source src={`http://localhost:3000/${labDetails.videoPath}`} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default LabDetails;
