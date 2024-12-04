import { useState, useEffect } from 'react';
import axios from '../api/axios';
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

  const completedPercentage = Math.floor((labs.filter(lab => lab.everPassed).length / labs.length) * 100);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-6 text-center">Student's Dashboard</h1>
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

        <div className="flex flex-col md:flex-row justify-center mb-6 mt-6 space-y-4 md:space-y-0 md:space-x-4">
          <button
            onClick={() => navigate('/student/postpartum')}
            className="px-10 py-6 rounded bg-purple-500 text-white text-lg hover:bg-purple-600 transition duration-200 w-full md:w-auto"
          >
            Postpartum Labs
          </button>
          <button
            onClick={() => navigate('/student/antenatal')}
            className="px-10 py-6 rounded bg-purple-500 text-white text-lg hover:bg-purple-600 transition duration-200 w-full md:w-auto"
          >
            Antenatal Labs
          </button>
          <button
            onClick={() => navigate('/student/intrapartum')}
            className="px-10 py-6 rounded bg-purple-500 text-white text-lg hover:bg-purple-600 transition duration-200 w-full md:w-auto"
          >
            Intrapartum Labs
          </button>
        </div>
      </div>
    </div>
  );
};
