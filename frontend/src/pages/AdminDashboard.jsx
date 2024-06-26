// AdminDashboard.jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

export const AdminDashboard = () => {
  const [universityName, setUniversityName] = useState('');
  const [numberOfStudents, setNumberOfStudents] = useState('');
  const [universities, setUniversities] = useState([]);

  useEffect(() => {
    fetchUniversities();
  }, []);

  const fetchUniversities = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/v1/admin/universities');
      setUniversities(response.data);
    } catch (error) {
      console.error('Error fetching universities:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:3000/api/v1/admin/generate-code', {
        universityName,
        numberOfStudents: parseInt(numberOfStudents)
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

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={universityName}
          onChange={(e) => setUniversityName(e.target.value)}
          placeholder="University Name"
          required
        />
        <input
          type="number"
          value={numberOfStudents}
          onChange={(e) => setNumberOfStudents(e.target.value)}
          placeholder="Number of Students"
          required
        />
        <button type="submit">Create University</button>
      </form>
      <h2>Registered Universities</h2>
      <ul>
        {universities.map((uni) => (
          <li key={uni._id}>
            {uni.universityName} - Students: {uni.students.length}/{uni.numberOfStudents}
          </li>
        ))}
      </ul>
    </div>
  );
};