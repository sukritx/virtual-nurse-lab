export const FeaturedLabs = () => {
  const labs = [
    { title: 'Breastfeeding', description: 'Learn the basics of breastfeeding.' },
    { title: 'Baby Bath', description: 'Understand the process of bathing a newborn.' },
    { title: 'Contraceptive Recommendations', description: 'Explore contraceptive options for new mothers.' },
  ];

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold text-center">Featured Labs</h2>
      <div className="flex flex-wrap justify-center mt-4">
        {labs.map((lab, index) => (
          <div key={index} className="bg-white shadow-md rounded-lg m-4 p-4 w-64">
            <h3 className="text-xl font-semibold">{lab.title}</h3>
            <p className="mt-2 text-gray-600">{lab.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
