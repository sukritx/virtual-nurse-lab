import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useParams } from 'react-router-dom';

const LabHistory = () => {
  const [labHistory, setLabHistory] = useState([]);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const { token } = useAuth();
  const { labNumber } = useParams();
  const { subject } = useParams();

  useEffect(() => {
    fetchLabHistory();
  }, [token, labNumber, subject]);

  const fetchLabHistory = async () => {
    try {
      const response = await axios.get(`/api/v1/student/${subject}/${labNumber}/history`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setLabHistory(response.data.labSubmissions);
      if (response.data.labSubmissions.length > 0) {
        setSelectedAttempt(response.data.labSubmissions[0]);
      }
    } catch (error) {
      console.error('Error fetching lab history:', error);
    }
  };

  const handleAttemptChange = (event) => {
    const attempt = labHistory.find(attempt => attempt.attempt === parseInt(event.target.value));
    setSelectedAttempt(attempt);
  };

  const renderMediaElement = () => {
    if (!selectedAttempt) return null;

    if (selectedAttempt.fileType === 'video') {
      return (
        <video key={selectedAttempt._id} width="100%" controls>
          <source src={selectedAttempt.fileUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      );
    } else if (selectedAttempt.fileType === 'audio') {
      return (
        <audio key={selectedAttempt._id} width="100%" controls>
          <source src={selectedAttempt.fileUrl} type="audio/mpeg" />
          Your browser does not support the audio tag.
        </audio>
      );
    }
    return null;
  };

  if (!labHistory.length) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-100">
      <header className="w-full">
      </header>
      <main className="w-full max-w-4xl px-4 py-10">
        <h1 className="text-4xl font-bold mb-8 text-center">Lab {labNumber} History</h1>
        <div className="bg-white p-8 rounded-lg shadow-md">
          <label htmlFor="attempt-select" className="block text-lg font-bold mb-2">Select Attempt:</label>
          <select 
            id="attempt-select" 
            className="mb-4 p-2 border rounded" 
            onChange={handleAttemptChange}
            value={selectedAttempt ? selectedAttempt.attempt : ''}
          >
            {labHistory.map((attempt) => (
              <option key={attempt._id} value={attempt.attempt}>Attempt {attempt.attempt}</option>
            ))}
          </select>
          {selectedAttempt && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Score: {selectedAttempt.studentScore}</h2>
              <div className="mb-4">
                <p className="mb-2"><strong>Pros:</strong> {selectedAttempt.pros}</p>
                <p className="mb-2"><strong>Recommendations:</strong> {selectedAttempt.recommendations}</p>
                {renderMediaElement()}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default LabHistory;