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

  const completedPercentage = Math.floor((labs.filter(lab => lab.isPass !== null && lab.isPass).length / labs.length) * 100);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-6 text-center">Student's Dashboard</h1>
        <div className="flex flex-col items-center mb-6">
          <CircularProgressBar percentage={completedPercentage} label={`${completedPercentage}%`} />
          <div className="mt-4 p-4 bg-white rounded shadow-md text-gray-600">
            <h2 className="text-center text-2xl font-bold text-indigo-700 mb-6">แนะนำการใช้งาน</h2>
            <ul className="space-y-4">
              <li className="flex items-start">
                <svg className="w-6 h-6 text-green-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span className="text-gray-700">นักศึกษาสามารถเลือกให้การพยาบาลในห้องปฏิบัติการใดก่อนก็ได้</span>
              </li>
              <li className="flex items-start">
                <svg className="w-6 h-6 text-green-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span className="text-gray-700">เมื่อท่านเลือกแล้ว ขอให้ท่านให้การพยาบาลพร้อมกับอัดคลิปด้วยอุปกรณ์ของท่าน (ความยาวของคลิปต่อฐาน ไม่ควรยาวกว่า 3 นาที) และ upload ในระบบ</span>
              </li>
              <li className="flex items-start">
                <svg className="w-6 h-6 text-green-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span className="text-gray-700">ขอให้ท่านพูดในลักษณะเสียงดัง ฟังชัด ไม่ปรับคลิปที่อัดเสร็จให้มีความเร็วมากกว่า 1x</span>
              </li>
              <li className="flex items-start">
                <svg className="w-6 h-6 text-green-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span className="text-gray-700">หลังท่านนำส่งคลิปในระบบ ท่านสามารถดูผลการประเมิน หากคำตอบของท่านถูกเกินกว่า 60% ถือว่าท่านผ่านในห้องปฏิบัติการนั้น และระบบจะให้ข้อเสนอแนะแก่ท่าน ทั้งนี้ หากท่านยังทำไม่ผ่าน สามารถทำซ้ำได้</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {labs.map((lab, index) => (
            <div key={lab.labInfo._id} className={`bg-white p-4 rounded-lg shadow-md flex flex-col items-center justify-between ${lab.isPass === null ? 'bg-gray-300' : lab.isPass ? 'bg-green-300' : 'bg-red-300'}`}>
              <h2 className="text-xl font-semibold">Lab {lab.labInfo.labNumber}</h2>
              <p className="text-sm text-gray-600">{lab.labInfo.labName}</p>
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
              {lab.isPass !== null && (
                <button
                  onClick={() => navigate(`/student/lab/${lab.labInfo.labNumber}/history`)}
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
