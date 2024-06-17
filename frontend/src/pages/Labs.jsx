import { LabList } from '../components/LabList';
import { LabDetail } from '../components/LabDetail';
import { Route, Routes } from 'react-router-dom';
import { Layout } from '../components/Layout';

export const Labs = () => {
  return (
    <Layout>
      <div className="flex">
        <LabList />
        <div className="w-3/4 p-4">
          <Routes>
            <Route path="/" element={<div className="w-full"><h2 className="text-3xl font-bold">Select a lab to see the details</h2></div>} />
            <Route path=":labId" element={<LabDetail />} />
          </Routes>
        </div>
      </div>
    </Layout>
  );
};
