import { Link } from 'react-router-dom';

const labs = [
  { id: 'breastfeeding', title: 'Breastfeeding' },
  { id: 'baby-bath', title: 'Baby Bath' },
  // Add more labs as needed
];

export const LabList = () => {
  return (
    <div className="w-1/4 p-4 bg-gray-100 h-screen overflow-y-auto">
      <h2 className="text-2xl font-bold mb-4">Labs Available</h2>
      <ul>
        {labs.map(lab => (
          <li key={lab.id} className="mb-4">
            <Link to={`/labs/${lab.id}`} className="text-blue-500 hover:underline">
              {lab.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
