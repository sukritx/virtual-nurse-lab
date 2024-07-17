// src/pages/Homepage.jsx
import { DemoMessage } from '../components/DemoMessage';
import { FeaturedLabs } from '../components/FeaturedLabs';
import WelcomeSection from '../components/WelcomeSection';

export const Homepage = () => {
  return (
    <div className="homepage min-h-screen flex flex-col items-center justify-center">
      <header className="w-full">
      </header>
      <main className="w-full max-w-6xl">
        <WelcomeSection />
        <div className="px-4 text-center">
          <DemoMessage />
          <FeaturedLabs />
        </div>
      </main>
    </div>
  );
};
