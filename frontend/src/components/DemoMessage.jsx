// src/components/DemoMessage.jsx
import { useNavigate } from 'react-router-dom';

export const DemoMessage = () => {
  const navigate = useNavigate();

  const handleContactClick = () => {
    navigate('/contact');
  };

  return (
    <div className="text-center mt-8">
      <h1 className="text-4xl font-bold">Try us with your faculty now!</h1>
      <p className="mt-2 text-gray-600">Free 15 days for 10 students</p>
      <button
        onClick={handleContactClick}
        className="mt-4 bg-purple-600 text-white py-3 px-10 rounded-full hover:bg-purple-700 transition duration-200"
      >
        สนใจ
      </button>
    </div>
  );
};
