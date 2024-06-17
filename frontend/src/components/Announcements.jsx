export const Announcements = () => {
    const announcements = [
      'ประกาศ1',
      'ประกาศ2',
      'ประกาศ3',
    ];
  
    return (
      <div className="mt-8">
        <h2 className="text-2xl font-bold text-center">Announcements</h2>
        <ul className="mt-4 space-y-2">
          {announcements.map((announcement, index) => (
            <li key={index} className="bg-white shadow-md rounded-lg p-4 text-gray-800">
              {announcement}
            </li>
          ))}
        </ul>
      </div>
    );
};