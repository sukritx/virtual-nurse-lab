import React from 'react';
import { useAuth } from '../context/AuthContext';

export const NavigationMenu = () => {
  const { token, user, logout } = useAuth();

  console.log('Token:', token);
  console.log('User:', user);

  return (
    <nav className="bg-white shadow-md">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between">
          <div className="flex space-x-4">
            <div>
              <a href="/" className="flex items-center py-5 px-2 text-gray-700">
                <span className="font-bold">Virtual Nurse Lab</span>
              </a>
            </div>
            <div className="hidden md:flex items-center space-x-1">
              <a href="/labs" className="py-5 px-3 text-gray-700 hover:text-gray-900">Labs</a>
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
        </div>
      </div>
    </nav>
  );
};
