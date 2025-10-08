// medical-5.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from './MedicalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab5Recording = () => {
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
                const lab5 = response.data.labs.find(lab => lab.labInfo.labNumber === 5);
                if (lab5) {
                    setAttemptsLeft(lab5.attemptsLeft);
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
            labNumber={5}
            title="สถานการณ์ที่5: การให้เลือด"
            subtitle=""
            description="
            ผู้ป่วยโรคมะเร็งเม็ดเลือดขาวรายหนึ่ง ผู้ป่วยมีภาวะซีด และผลตรวจ hemoglobin เท่ากับ  6.0 gm%  แพทย์มีแผนการรักษาให้ Leucocyte poor red blood cells (LPRC) 1 unit หลังจากติดตามเลือดมาให้ผู้ป่วยได้
            "
            questions={[
                "ให้นักศึกษาอธิบายวิธีการพยาบาลผู้ป่วยที่ได้รับเลือด"
            ]}
            videoSrc="/medical/medical5.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab5Recording;