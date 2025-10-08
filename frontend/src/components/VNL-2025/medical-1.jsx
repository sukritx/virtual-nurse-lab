// medical-1.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from './SurgicalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab1Recording = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth(); // Still need token for API calls for logged-in users
    const navigate = useNavigate();

    useEffect(() => {
        // Since this page is now behind a PrivateRoute, we know the user is logged in.
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/medical/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab1 = response.data.labs.find(lab => lab.labInfo.labNumber === 1);
                if (lab1) {
                    setAttemptsLeft(lab1.attemptsLeft);
                }
            } catch (error) {
                console.error('Error fetching lab info:', error);
                // Optionally handle errors, e.g., by navigating away or showing an error message
                // If a 401/403 error occurs here, PrivateRoute should have already handled it,
                // but you might want specific error handling for API failures.
            }
        };
        fetchLabInfo();
    }, [token]); // token is the only dependency needed now

    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage);
        
        if (newLanguage === 'zh') {
            navigate('/medical/cn');
        } else if (newLanguage === 'en') {
            navigate('/medical/en');
        } else if (newLanguage === 'jp') {
            navigate('/medical/jp');
        } else if (newLanguage === 'id') {
            navigate('/medical/id');
        }
    };

    const handleSignupClick = () => {
        navigate('/signup');
    };

    return (
        <LabRecordingComponent
            labNumber={1}
            title="สถานการณ์ที่1: การพยาบาลผู้ป่วยที่ได้รับการดูดเสมหะ"
            subtitle=""
            description="
            ผู้ป่วยที่มีภาวะ Respiratory failure ได้รับการรักษาโดยการ on ET-tube with carina’s ventilator ในขณะที่ตรวจเยี่ยมผู้ป่วยพบว่ามีเสียงหายใจครืดคราด
            "
            questions={[
                "ให้นักศึกษาอธิบายขั้นตอนการดูดเสมหะและแสดงการดูดเสมหะกับหุ่นจำลอง"
            ]}
            videoSrc="/medical/medical1.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab1Recording;