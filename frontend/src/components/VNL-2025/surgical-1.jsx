// surgical-1.jsx
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
                const response = await axios.get('/api/v1/student/surgical/labs', {
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
        <LabRecordingComponent
            labNumber={1}
            title="การพยาบาลผู้ป่วยก่อนผ่าตัด"
            subtitle="คำแนะนำก่อนผ่าตัด"
            description="ผู้ป่วยชายอายุ 25 ปี กระดูกต้นขาขวาหักแบบปิด (Closed Fx. Right femur) จากอุบัติเหตุรถมอเตอร์ไซค์ล้ม ขณะนี้ On skeletal traction with weight 7 kgs. วันนี้แพทย์มีแผนการรักษาให้เตรียมผ่าตัด ดังนี้ 
                NPO after midnight
                On 5% D/S/2 1000 cc. IV drip 80 cc./hr.
                Prep skin ขาขวา
                Void ก่อนไป OR
                Pre-medication
                - Diazepam (5 mg.) 1 tab oral hs.
            "
            questions={[
                "ขอให้ท่านแนะนำการเตรียมร่างกาย ด้านจิตใจ ด้านกฎหมาย และ เอกสารที่เกี่ยวข้องก่อนการผ่าตัดแก่ผู้ป่วยรายนี้"
            ]}
            videoSrc="/surgical/surgical1.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab1Recording;