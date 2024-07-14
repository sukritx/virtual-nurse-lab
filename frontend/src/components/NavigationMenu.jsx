import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import { FaBars, FaTimes } from 'react-icons/fa';

export const NavigationMenu = () => {
  const { token, user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <nav className="bg-white shadow-md">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center py-5">
          <div className="flex items-center space-x-4">
            <a href="/" className="flex items-center text-gray-700">
              <span className="font-bold">Virtual Nurse Lab</span>
            </a>
            <div className="hidden md:flex items-center space-x-1">
              <a href="/library" className="py-5 px-3 text-gray-700 hover:text-gray-900">Library</a>
              <a href="/contact" className="py-5 px-3 text-gray-700 hover:text-gray-900">Contact</a>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-1">
            {token && user ? (
              <div className="flex items-center space-x-4">
                <span className="py-5 px-3 text-gray-700">Hello, {user.firstName} {user.lastName}</span>
                <button onClick={logout} className="py-2 px-3 bg-red-600 text-white rounded hover:bg-red-700">Logout</button>
              </div>
            ) : (
              <>
                <a href="/signin" className="py-5 px-3 text-gray-700 hover:text-gray-900">Login</a>
                <a href="/signup" className="py-2 px-3 bg-purple-600 text-white rounded hover:bg-purple-700">Signup</a>
              </>
            )}
          </div>
          <div className="md:hidden flex items-center">
            <button onClick={handleMobileMenuToggle} className="text-gray-700 focus:outline-none">
              {isMobileMenuOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
            </button>
          </div>
        </div>
        {isMobileMenuOpen && (
          <div className="md:hidden">
            <a href="/labs" className="block py-2 px-4 text-gray-700 hover:bg-gray-200">Labs</a>
            <a href="/library" className="block py-2 px-4 text-gray-700 hover:bg-gray-200">Library</a>
            <a href="/contact" className="block py-2 px-4 text-gray-700 hover:bg-gray-200">Contact</a>
            {token && user ? (
              <>
                <span className="block py-2 px-4 text-gray-700">Hello, {user.firstName} {user.lastName}</span>
                <button onClick={logout} className="block w-full text-left py-2 px-4 bg-red-600 text-white hover:bg-red-700">Logout</button>
              </>
            ) : (
              <>
                <a href="/signin" className="block py-2 px-4 text-gray-700 hover:bg-gray-200">Login</a>
                <a href="/signup" className="block py-2 px-4 bg-purple-600 text-white hover:bg-purple-700">Signup</a>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};
