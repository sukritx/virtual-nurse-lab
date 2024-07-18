// src/components/WelcomeSection.jsx
import { useNavigate } from 'react-router-dom';
import welcomeImage from '../assets/homepage-1.jpg'; // Adjust the path as necessary

const WelcomeSection = () => {
  const navigate = useNavigate();

  const handleProfessorClick = () => {
    navigate('/signin'); // Adjust the path as necessary
  };

  const handleStudentClick = () => {
    navigate('/signin'); // Adjust the path as necessary
  };

  return (
    <div className="welcome-section flex flex-col md:flex-row items-center justify-between w-full px-8 py-12 bg-white">
      <div className="md:w-1/2 mb-6 md:mb-0">
        <img src={welcomeImage} alt="Welcome" className="w-full rounded-lg shadow-lg" />
      </div>
      <div className="md:w-1/2 text-center md:text-left md:pl-8">
        <h2 className="text-4xl font-bold mb-4">Next Level Learning, Real Results</h2>
        <p className="text-xl mb-6">
          นักศึกษาสามารถฝึกการพยาบาลในห้องปฎิบัติการเสมือนโดยอัพโหลดวิดีโอ ระบบจะประเมินผลผ่าน AI โดยแสดงผลตามเกณฑ์ "ผ่าน" หรือ "ไม่ผ่าน" พร้อมระบุข้อดีและข้อเสนอแนะแก่ผู้เรียน
        </p>
        <div className="flex justify-center md:justify-start space-x-4">
          <button
            onClick={handleProfessorClick}
            className="bg-blue-600 text-white py-2 px-6 rounded-full hover:bg-blue-700 transition duration-200"
          >
            Professor
          </button>
          <button
            onClick={handleStudentClick}
            className="bg-blue-600 text-white py-2 px-6 rounded-full hover:bg-blue-700 transition duration-200"
          >
            Student
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeSection;
