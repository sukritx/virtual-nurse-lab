// ProfessorDashboard.jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

export const ProfessorDashboard = () => {
  const [university, setUniversity] = useState(null);

  useEffect(() => {
    fetchUniversityData();
  }, []);

  const fetchUniversityData = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/v1/professor/university');
      setUniversity(response.data);
    } catch (error) {
      console.error('Error fetching university data:', error);
    }
  };

  if (!university) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Professor Dashboard</h1>
      <h2>{university.universityName}</h2>
      <p>Total Students: {university.students.length}/{university.numberOfStudents}</p>
      <h3>Registered Students:</h3>
      <ul>
        {university.students.map((student) => (
          <li key={student._id}>
            {student.firstName} {student.lastName} - {student.studentId}
          </li>
        ))}
      </ul>
    </div>
  );
};