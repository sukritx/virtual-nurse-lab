// src/components/PrivateRoute.jsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PropTypes from 'prop-types';
import { jwtDecode } from 'jwt-decode'

export const PrivateRoute = ({ role }) => {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/signin" />;
  }

  if (role) {
    try {
      const decodedToken = jwtDecode(token);
      if (role === 'admin' && !decodedToken.isAdmin) {
        return <Navigate to="/admin/dashboard" />;
      }
      if (role === 'professor' && !decodedToken.isProfessor) {
        return <Navigate to="/professor/dashboard" />;
      }
    } catch (error) {
      console.error('Error decoding token:', error);
      return <Navigate to="/signin" />;
    }
  }

  return <Outlet />;
};

PrivateRoute.propTypes = {
  role: PropTypes.string
};

PrivateRoute.defaultProps = {
  role: undefined
};