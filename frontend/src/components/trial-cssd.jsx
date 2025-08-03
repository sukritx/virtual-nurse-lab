// trial-cssd.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from '../api/axios';
import LabRecordingComponent from './TrialRecordingComponent';
import PropTypes from 'prop-types'; // Import PropTypes

const MAX_ATTEMPTS = 3;

// Destructure isLoggedIn from props
const Lab1Recording = ({ isLoggedIn }) => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth(); // Still need token for API calls for logged-in users
    const navigate = useNavigate();

    useEffect(() => {
        // Only fetch lab info if the user is logged in
        if (isLoggedIn) {
            const fetchLabInfo = async () => {
                try {
                    const response = await axios.get('/api/v1/student/trial-cssd/labs', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const lab1 = response.data.labs.find(lab => lab.labInfo.labNumber === 1);
                    if (lab1) {
                        setAttemptsLeft(lab1.attemptsLeft);
                    }
                } catch (error) {
                    console.error('Error fetching lab info:', error);
                }
            };
            fetchLabInfo();
        }
    }, [token, isLoggedIn]); // Add isLoggedIn to dependency array

    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage);
        
        if (newLanguage === 'zh') {
            navigate('/trial-cssd');
        } else if (newLanguage === 'en') {
            navigate('/trial-cssd');
        } else if (newLanguage === 'jp') {
            navigate('/trial-cssd');
        } else if (newLanguage === 'id') {
            navigate('/trial-cssd');
        }
    };

    const handleSignupClick = () => {
        navigate('/signup');
    };

    return (
        <>
            {/* Conditional rendering based on login status */}
            {isLoggedIn ? (
                <LabRecordingComponent
                    labNumber={1}
                    title="For staff ระดับปฏิบัติการ"
                    subtitle="อธิบายตัวชี้วัดทางชีวภาพ (BI) "
                    description="จงอธิบายว่าเหตุใด ตัวชี้วัดทางชีวภาพ (BI) จึงให้ความเชื่อมั่นในระดับที่สูงกว่า ตัวชี้วัดทางเคมี Class 5? อะไรคือสิ่งที่ BI ยืนยันได้ แต่ CI ทำไม่ได้?"
                    questions={[
                        "กดอัด 'Ready' เพื่อตอบคำถาม"
                    ]}
                    imageSrc="/trial-cssd/trial-cssd-cover-1.jpg"
                    attemptsLeft={attemptsLeft}
                    setAttemptsLeft={setAttemptsLeft}
                    language={language}
                    setLanguage={setLanguage}
                    onLanguageChange={handleLanguageChange}
                    isLoggedIn={isLoggedIn} // Pass isLoggedIn to LabRecordingComponent
                />
            ) : (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                    <h2>You need to sign up to use this feature.</h2>
                    <button
                        onClick={handleSignupClick}
                        style={{
                            padding: '10px 20px',
                            fontSize: '18px',
                            cursor: 'pointer',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px'
                        }}
                    >
                        Sign Up
                    </button>
                    {/* Display the rest of the lab content for non-logged-in users */}
                    <LabRecordingComponent
                        labNumber={1}
                        title="For staff ระดับปฏิบัติการ"
                        subtitle="อธิบายตัวชี้วัดทางชีวภาพ (BI) "
                        description="จงอธิบายว่าเหตุใด ตัวชี้วัดทางชีวภาพ (BI) จึงให้ความเชื่อมั่นในระดับที่สูงกว่า ตัวชี้วัดทางเคมี Class 5? อะไรคือสิ่งที่ BI ยืนยันได้ แต่ CI ทำไม่ได้?"
                        questions={["Login to answer questions"]}
                        imageSrc="/trial-cssd/trial-cssd-cover-1.jpg"
                        attemptsLeft={0} // No attempts for non-logged-in users
                        setAttemptsLeft={() => {}} // Disable setter
                        language={language}
                        setLanguage={setLanguage}
                        onLanguageChange={handleLanguageChange}
                        isLoggedIn={isLoggedIn} // Pass isLoggedIn to LabRecordingComponent
                        disableReadyButton={true} // New prop to disable button
                    />
                </div>
            )}
        </>
    );
};

// Add PropTypes for isLoggedIn
Lab1Recording.propTypes = {
    isLoggedIn: PropTypes.bool.isRequired,
};

export default Lab1Recording;