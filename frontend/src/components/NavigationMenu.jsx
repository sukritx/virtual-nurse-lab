import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import { FaBars, FaTimes } from 'react-icons/fa';
import logo from '../assets/virtual-nurse-lab-logo-2.png';

export const NavigationMenu = () => {
  const { token, user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <nav className="bg-white shadow-md w-full">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            <a href="/" className="flex items-center">
              <img src={logo} alt="Virtual Nurse Lab Logo" className="h-12" />
            </a>
            <div className="hidden md:flex items-center space-x-4">
              {/*<a href="/library" className="py-5 px-3 text-gray-700 hover:text-gray-900">Library</a>*/}
              <a
                href="/contact"
                className="py-5 px-3 text-gray-700 hover:text-gray-900"
              >
                Contact
              </a>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-4">
            {token && user ? (
              <div className="flex items-center space-x-4">
                <span className="py-5 px-3 text-gray-700">
                  Hello, {user.firstName} {user.lastName}
                </span>
                <button
                  onClick={logout}
                  className="py-2 px-3 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Logout
                </button>
              </div>
            ) : (
              <>
                <a
                  href="/signin"
                  className="py-5 px-3 text-gray-700 hover:text-gray-900"
                >
                  Login
                </a>
                <a
                  href="/signup"
                  className="py-2 px-4 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  Signup
                </a>
              </>
            )}
          </div>
          <div className="md:hidden flex items-center">
            <button
              onClick={handleMobileMenuToggle}
              className="text-gray-700 focus:outline-none"
            >
              {isMobileMenuOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
            </button>
          </div>
        </div>
      </div>
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col justify-center items-center space-y-6">
          <button
            onClick={handleMobileMenuToggle}
            className="absolute top-4 right-4 text-gray-700 focus:outline-none"
          >
            <FaTimes size={24} />
          </button>
          {/* Main navigation links for mobile */}
          {/*<a href="/library" className="text-2xl text-gray-700 hover:text-gray-900">Library</a>*/}
          <a href="/contact" className="text-2xl text-gray-700 hover:text-gray-900">
            Contact
          </a>

          {/* Conditional content for mobile menu */}
          {token && user ? (
            // Logged-in state
            <>
              <span className="text-2xl text-gray-700">
                Hello, {user.firstName} {user.lastName}
              </span>
              <button
                onClick={logout}
                className="py-3 px-8 bg-red-600 text-white text-2xl rounded hover:bg-red-700"
              >
                Logout
              </button>
            </>
          ) : (
            // Logged-out state
            <>
              <a
                href="/signin"
                className="py-3 px-8 bg-gray-200 text-gray-700 text-2xl rounded hover:bg-gray-300"
              >
                Login
              </a>
              <a
                href="/signup"
                className="py-3 px-8 bg-purple-600 text-white text-2xl rounded hover:bg-purple-700"
              >
                Signup
              </a>
            </>
          )}
        </div>
      )}
    </nav>
  );
};