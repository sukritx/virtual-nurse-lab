import { useParams } from 'react-router-dom';

const labDetails = {
  breastfeeding: {
    title: 'Breastfeeding',
    introduction: 'An overview of breastfeeding techniques and benefits.',
    scenarios: [
      { description: 'Scenario 1: Proper latch techniques', link: 'https://zoom.us/record1' },
      { description: 'Scenario 2: Common breastfeeding positions', link: 'https://zoom.us/record2' },
    ],
    resources: [
      { title: 'WHO Breastfeeding Guidelines', link: 'https://www.who.int/breastfeeding' },
      { title: 'CDC Breastfeeding Resources', link: 'https://www.cdc.gov/breastfeeding' },
    ]
  },
  'baby-bath': {
    title: 'Baby Bath',
    introduction: 'Learn the steps for safely bathing a newborn.',
    scenarios: [
      { description: 'Scenario 1: Bathing supplies preparation', link: 'https://zoom.us/record3' },
      { description: 'Scenario 2: Bathing techniques', link: 'https://zoom.us/record4' },
    ],
    resources: [
      { title: 'AAP Bathing Guidelines', link: 'https://www.aap.org/bathing' },
      { title: 'Baby Bath Safety Tips', link: 'https://www.safekids.org/bathing-safety' },
    ]
  },
  // Add more lab details as needed
};

export const LabDetail = () => {
  const { labId } = useParams();
  const lab = labDetails[labId];

  if (!lab) {
    return <p>Lab not found</p>;
  }

  return (
    <div className="w-full">
      <h2 className="text-3xl font-bold">{lab.title}</h2>
      <p className="mt-2 text-gray-600">{lab.introduction}</p>
      <div className="mt-8">
        <h3 className="text-2xl font-bold">Interactive Scenarios</h3>
        <ul className="mt-4 list-disc list-inside">
          {lab.scenarios.map((scenario, index) => (
            <li key={index}>
              <a href={scenario.link} target="_blank" rel="noopener noreferrer" className="text-blue-500">{scenario.description}</a>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-8">
        <h3 className="text-2xl font-bold">Resources and Guidelines</h3>
        <ul className="mt-4 list-disc list-inside">
          {lab.resources.map((resource, index) => (
            <li key={index}>
              <a href={resource.link} target="_blank" rel="noopener noreferrer" className="text-blue-500">{resource.title}</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
