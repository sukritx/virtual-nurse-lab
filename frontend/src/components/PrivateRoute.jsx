// src/components/PrivateRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PropTypes from 'prop-types';
import * as jwt_decode from "jwt-decode";

export const PrivateRoute = ({ children, role }) => {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/signin" />;
  }

  if (role) {
    try {
      const decodedToken = jwt_decode.default(token);
      if (role === 'admin' && !decodedToken.isAdmin) {
        return <Navigate to="/dashboard" />;
      }
      if (role === 'professor' && !decodedToken.isProfessor) {
        return <Navigate to="/dashboard" />;
      }
    } catch (error) {
      console.error('Error decoding token:', error);
      return <Navigate to="/signin" />;
    }
  }

  return children;
};

PrivateRoute.propTypes = {
  children: PropTypes.node.isRequired,
  role: PropTypes.string
};

PrivateRoute.defaultProps = {
  role: undefined
};