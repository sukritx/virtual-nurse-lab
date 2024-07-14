import { NavigationMenu } from '../components/NavigationMenu';
import { useNavigate } from 'react-router-dom';

const Sale = () => {
  const navigate = useNavigate();

  const handleRequestDemo = () => {
    navigate('/request-demo');
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-100">
      <header className="w-full">
        <NavigationMenu />
      </header>
      <main className="w-full max-w-7xl px-4 py-10 text-center">
        <h1 className="text-4xl font-bold mb-8">Our Pricing Packages</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold mb-4">Class A</h2>
            <p className="text-lg mb-4">Up to 100 students</p>
            <p className="text-4xl font-bold mb-6">$499</p>
            <ul className="mb-6 text-left">
              <li className="mb-2">✔ Access to all labs</li>
              <li className="mb-2">✔ AI-assisted feedback</li>
              <li className="mb-2">✔ Customizable modules</li>
            </ul>
            <button onClick={handleRequestDemo} className="py-2 px-4 bg-purple-600 text-white rounded hover:bg-purple-700">
              Request Demo
            </button>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold mb-4">Class B</h2>
            <p className="text-lg mb-4">101-149 students</p>
            <p className="text-4xl font-bold mb-6">$999</p>
            <ul className="mb-6 text-left">
              <li className="mb-2">✔ Access to all labs</li>
              <li className="mb-2">✔ AI-assisted feedback</li>
              <li className="mb-2">✔ Customizable modules</li>
              <li className="mb-2">✔ Priority support</li>
            </ul>
            <button onClick={handleRequestDemo} className="py-2 px-4 bg-purple-600 text-white rounded hover:bg-purple-700">
              Request Demo
            </button>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold mb-4">Class C</h2>
            <p className="text-lg mb-4">150+ students</p>
            <p className="text-4xl font-bold mb-6">$1499</p>
            <ul className="mb-6 text-left">
              <li className="mb-2">✔ Access to all labs</li>
              <li className="mb-2">✔ AI-assisted feedback</li>
              <li className="mb-2">✔ Customizable modules</li>
              <li className="mb-2">✔ Priority support</li>
              <li className="mb-2">✔ Dedicated account manager</li>
            </ul>
            <button onClick={handleRequestDemo} className="py-2 px-4 bg-purple-600 text-white rounded hover:bg-purple-700">
              Request Demo
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Sale;
