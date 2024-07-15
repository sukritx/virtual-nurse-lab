import { Outlet } from 'react-router-dom';
import { NavigationMenu } from '../components/NavigationMenu';
import Footer from '../components/Footer';

const MainLayout = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <NavigationMenu />
      <main className="flex-grow">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout;
