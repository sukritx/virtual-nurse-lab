// surgical-2.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from './SurgicalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab2Recording = () => {
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
                const lab2 = response.data.labs.find(lab => lab.labInfo.labNumber === 2);
                if (lab2) {
                    setAttemptsLeft(lab2.attemptsLeft);
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
            navigate('/surgical/cn');
        } else if (newLanguage === 'en') {
            navigate('/surgical/en');
        } else if (newLanguage === 'jp') {
            navigate('/surgical/jp');
        } else if (newLanguage === 'id') {
            navigate('/surgical/id');
        }
    };

    const handleSignupClick = () => {
        navigate('/signup');
    };

    return (
        <LabRecordingComponent
            labNumber={2}
            title="สถานการณ์ที่2: การพยาบาลผู้ป่วยก่อนผ่าตัด"
            subtitle="การเตรียมบริเวณก่อนผ่าตัด"
            description="ผู้ป่วยชายอายุ 25 ปี กระดูกต้นขาขวาหักแบบปิด (Closed Fx. Right femur) จากอุบัติเหตุรถมอเตอร์ไซค์ล้ม ขณะนี้ On skeletal traction with weight 7 kgs. วันนี้แพทย์มีแผนการรักษาให้เตรียมผ่าตัด ดังนี้ 
                NPO after midnight
                On 5% D/S/2 1000 cc. IV drip 80 cc./hr.
                Prep skin ขาขวา
                Void ก่อนไป OR
                Pre-medication
                - Diazepam (5 mg.) 1 tab oral hs.
            "
            questions={[
                "จงอธิบายวัตถุประสงค์ของการเตรียมผิวหนังบริเวณผ่าตัด",
                "จงอธิบายขอบเขตบริเวณที่จะเตรียมผิวหนัง",
                "จงอธิบายการเตรียมผิวหนังบริเวณผ่าตัดตอนบ่าย/เย็นก่อนวันผ่าตัด",
                "จงอธิบายการเตรียมผิวหนังบริเวณผ่าตัดตอนเช้าวันผ่าตัด"
            ]}
            videoSrc="/surgical/surgical2.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab2Recording;