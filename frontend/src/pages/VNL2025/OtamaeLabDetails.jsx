import { useState, useEffect } from 'react';
import axios from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useParams } from 'react-router-dom';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

const OtamaeLabDetails = () => {
  const [labSubmissions, setLabSubmissions] = useState([]);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const { token } = useAuth();
  const { userId, labNumber } = useParams();

  useEffect(() => {
    fetchLabDetails();
  }, [token, userId, labNumber]);

  const fetchLabDetails = async () => {
    try {
      const response = await axios.get(`/api/v1/professor/student/${userId}/lab/otamae/${labNumber}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setLabSubmissions(response.data.labSubmissions);
      setSelectedAttempt(response.data.labSubmissions[0]);
    } catch (error) {
      console.error('Error fetching lab details:', error);
    }
  };

  const handleAttemptChange = (event) => {
    const attempt = labSubmissions.find(submission => submission.attempt === parseInt(event.target.value));
    setSelectedAttempt(attempt);
  };

  const renderMediaElement = () => {
    if (!selectedAttempt) return null;

    if (selectedAttempt.fileType === 'audio') {
      return (
        <audio key={selectedAttempt._id} controls className="w-full mt-4">
          <source src={selectedAttempt.fileUrl} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
      );
    } else if (selectedAttempt.fileType === 'video') {
      return (
        <video key={selectedAttempt._id} controls className="w-full mt-4">
          <source src={selectedAttempt.fileUrl} type={selectedAttempt.fileUrl?.includes('.webm') ? 'video/webm' : 'video/mp4'} />
          Your browser does not support the video tag.
        </video>
      );
    }
    return null;
  };

  if (labSubmissions.length === 0) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-100">
      <main className="w-full max-w-4xl px-4 py-10">
        <h1 className="text-4xl font-bold mb-8 text-center">Lab {labNumber} Details</h1>
        <div className="bg-white p-8 rounded-lg shadow-md">
          <label htmlFor="attempt-select" className="block text-lg font-bold mb-2">Select Attempt:</label>
          <select 
            id="attempt-select" 
            className="mb-4 p-2 border rounded" 
            onChange={handleAttemptChange}
            value={selectedAttempt ? selectedAttempt.attempt : ''}
          >
            {labSubmissions.map((submission) => (
              <option key={submission._id} value={submission.attempt}>Attempt {submission.attempt}</option>
            ))}
          </select>
          {selectedAttempt && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Score: {selectedAttempt.studentScore}</h2>
              <div className="flex items-center mb-4">
                {selectedAttempt.isPass ? (
                  <FaCheckCircle className="text-green-700 mr-2" size={24} />
                ) : (
                  <FaTimesCircle className="text-red-700 mr-2" size={24} />
                )}
                <span className={`text-lg font-bold ${selectedAttempt.isPass ? 'text-green-700' : 'text-red-700'}`}>
                  {selectedAttempt.isPass ? 'Passed' : 'Not Passed'}
                </span>
              </div>
              <div className="mb-4">
                <p className="mb-2"><strong>Transcription:</strong></p>
                <p className="mb-4">{selectedAttempt.studentAnswer}</p>
                <p className="mb-2"><strong>Pros:</strong></p>
                <p className="mb-4">{selectedAttempt.pros}</p>
                <p className="mb-2"><strong>Recommendations:</strong></p>
                <p className="mb-4">{selectedAttempt.recommendations}</p>
                {renderMediaElement()}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default OtamaeLabDetails;
