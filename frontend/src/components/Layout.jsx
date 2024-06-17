import PropTypes from 'prop-types';
import { NavigationMenu } from './NavigationMenu';

export const Layout = ({ children }) => {
  return (
    <div>
      <NavigationMenu />
      <div className="mt-4">
        {children}
      </div>
    </div>
  );
};

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};
