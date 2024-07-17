import { Link } from 'react-router-dom';

export const AnnouncementBar = () => {
  return (
    <div className="bg-blue-600 text-white text-center py-2">
      <span>
        ทดลองใช้งานระบบได้แล้ววันนี้
        <Link to="/contact" className="underline ml-2">สนใจใช้งาน</Link>
      </span>
    </div>
  );
};
