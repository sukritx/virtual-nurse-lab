import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export const AdminDashboard = () => {
  const [universityName, setUniversityName] = useState('');
  const [numberOfStudents, setNumberOfStudents] = useState('');
  const [universities, setUniversities] = useState([]);
  const [registerCode, setRegisterCode] = useState('');
  const [professorUsername, setProfessorName] = useState('');
  const { token } = useAuth();

  useEffect(() => {
    fetchUniversities();
  }, [token]);

  const fetchUniversities = async () => {
    try {
      const response = await axios.get('/api/v1/admin/universities', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setUniversities(response.data);
    } catch (error) {
      console.error('Error fetching universities:', error);
    }
  };

  const handleSubmitUniversity = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/v1/admin/generate-code', {
        universityName,
        numberOfStudents: parseInt(numberOfStudents)
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      alert(`University created! Register code: ${response.data.registerCode}`);
      setUniversityName('');
      setNumberOfStudents('');
      fetchUniversities();
    } catch (error) {
      console.error('Error creating university:', error);
      alert('Failed to create university');
    }
  };

  const handleAssignProfessor = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/v1/admin/assign-professor', {
        registerCode,
        professorUsername
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      alert('Professor assigned successfully');
      setRegisterCode('');
      setProfessorName('');
      fetchUniversities();
    } catch (error) {
      console.error('Error assigning professor:', error);
      alert('Failed to assign professor');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
        
        {/* Create University Form */}
        <form onSubmit={handleSubmitUniversity} className="bg-white p-6 rounded shadow-md mb-8">
          <h2 className="text-2xl font-bold mb-4">Create University</h2>
          <div className="mb-4">
            <label className="block text-gray-700">University Name</label>
            <input
              type="text"
              value={universityName}
              onChange={(e) => setUniversityName(e.target.value)}
              placeholder="University Name"
              className="mt-1 p-2 w-full border rounded"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700">Number of Students</label>
            <input
              type="number"
              value={numberOfStudents}
              onChange={(e) => setNumberOfStudents(e.target.value)}
              placeholder="Number of Students"
              className="mt-1 p-2 w-full border rounded"
              required
            />
          </div>
          <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
            Create University
          </button>
        </form>

        {/* Assign Professor Form */}
        <form onSubmit={handleAssignProfessor} className="bg-white p-6 rounded shadow-md mb-8">
          <h2 className="text-2xl font-bold mb-4">Assign Professor</h2>
          <div className="mb-4">
            <label className="block text-gray-700">Registration Code</label>
            <input
              type="text"
              value={registerCode}
              onChange={(e) => setRegisterCode(e.target.value)}
              placeholder="Registration Code"
              className="mt-1 p-2 w-full border rounded"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700">Professor Username</label>
            <input
              type="text"
              value={professorUsername}
              onChange={(e) => setProfessorName(e.target.value)}
              placeholder="Professor Username"
              className="mt-1 p-2 w-full border rounded"
              required
            />
          </div>
          <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
            Assign Professor
          </button>
        </form>

        {/* Registered Universities */}
        <h2 className="text-2xl font-bold mb-4">Registered Universities</h2>
        <ul className="bg-white p-6 rounded shadow-md">
          {universities.map((uni) => (
            <li key={uni._id} className="mb-4 border-b pb-2">
              <div className="text-lg font-semibold">{uni.universityName}</div>
              <div>Students: {uni.students.length}/{uni.numberOfStudents}</div>
              <div>Registration code: {uni.registerCode}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
