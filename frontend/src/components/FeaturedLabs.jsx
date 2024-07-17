import { useRef } from 'react';
import img1 from '../assets/GettyImages-1289379328.png';

export const FeaturedLabs = () => {
  const labs = [
    {
      title: 'Breastfeeding',
      description: 'Learn the basics of breastfeeding.',
      image: img1,
      duration: '1 Hour',
      level: 'Beginner'
    },
    {
      title: 'Baby Bath',
      description: 'Understand the process of bathing a newborn.',
      image: img1,
      duration: '2 Hours',
      level: 'Beginner'
    },
    {
      title: 'Contraceptive Recommendations',
      description: 'Explore contraceptive options for new mothers.',
      image: img1,
      duration: '3 Hours',
      level: 'Intermediate'
    },
    {
      title: 'Newborn Care',
      description: 'Basics of caring for a newborn.',
      image: img1,
      duration: '2 Hours',
      level: 'Beginner'
    },
    {
      title: 'Postpartum Care',
      description: 'Understand postpartum care.',
      image: img1,
      duration: '2 Hours',
      level: 'Beginner'
    },
    {
      title: 'Nutrition for New Mothers',
      description: 'Learn about nutrition after childbirth.',
      image: img1,
      duration: '1.5 Hours',
      level: 'Intermediate'
    },
    {
      title: 'Infant Sleep Training',
      description: 'Tips for infant sleep training.',
      image: img1,
      duration: '2.5 Hours',
      level: 'Intermediate'
    },
    {
      title: 'Vaccination',
      description: 'Understand the vaccination schedule for infants.',
      image: img1,
      duration: '1 Hour',
      level: 'Beginner'
    },
    {
      title: 'Developmental Milestones',
      description: 'Learn about infant developmental milestones.',
      image: img1,
      duration: '3 Hours',
      level: 'Intermediate'
    }
  ];

  const scrollRef = useRef(null);

  const scrollLeft = () => {
    scrollRef.current.scrollBy({ left: -250, behavior: 'smooth' });
  };

  const scrollRight = () => {
    scrollRef.current.scrollBy({ left: 250, behavior: 'smooth' });
  };

  return (
    <div className="w-full max-w-6xl mt-6">
      <h2 className="text-2xl font-bold text-center mb-6">Featured Labs</h2>
      <div className="relative">
        <div className="flex items-center justify-between">
          <button
            onClick={scrollLeft}
            className="bg-white p-2 rounded-full shadow-md hover:bg-gray-200 transition duration-200"
          >
            <svg
              className="w-6 h-6 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 19l-7-7 7-7"
              ></path>
            </svg>
          </button>
          <button
            onClick={scrollRight}
            className="bg-white p-2 rounded-full shadow-md hover:bg-gray-200 transition duration-200"
          >
            <svg
              className="w-6 h-6 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5l7 7-7 7"
              ></path>
            </svg>
          </button>
        </div>
        <div
          ref={scrollRef}
          className="flex overflow-x-auto gap-6 mt-4 pb-4 scrollbar-hide"
        >
          {labs.map((lab, index) => (
            <div
              key={index}
              className="shadow-md rounded-lg overflow-hidden w-64 flex-none transition transform hover:scale-105 hover:shadow-lg"
            >
              <img
                src={lab.image}
                alt={lab.title}
                className="w-full h-40 object-cover"
              />
              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-800">{lab.title}</h3>
                <p className="mt-2 text-gray-700">{lab.description}</p>
                <div className="mt-4 flex justify-between items-center">
                  <span className="text-sm text-gray-600">{lab.duration}</span>
                  <span className="text-sm text-gray-600">{lab.level}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
