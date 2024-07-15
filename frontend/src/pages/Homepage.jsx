import { WelcomeMessage } from '../components/WelcomeMessage';
import { FeaturedLabs } from '../components/FeaturedLabs';
import { Announcements } from '../components/Announcements';
import { useNavigate } from 'react-router-dom';

export const Homepage = () => {
  const navigate = useNavigate();

  const handleLoginClick = () => {
    navigate('/signin');
  };

  return (
    <div className="homepage min-h-screen flex flex-col items-center justify-center bg-slate-100">
      <header className="w-full">
      </header>
      <main className="w-full max-w-2xl px-4 text-center">
        <WelcomeMessage />
        <button
          onClick={handleLoginClick}
          className="mt-6 bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700"
        >
          Login
        </button>
        <FeaturedLabs />
        <Announcements />
      </main>
    </div>
  );
};
