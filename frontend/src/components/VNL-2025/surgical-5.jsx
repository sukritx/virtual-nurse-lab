// surgical-5.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from './SurgicalRecordingComponent';

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
                const response = await axios.get('/api/v1/student/surgical/labs', {
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
            labNumber={5}
            title="สถานการณ์ที่5: การพยาบาลผู้ป่วยที่ได้รับการใส่เฝือก"
            subtitle=""
            description="
            ผู้ป่วยหญิงอายุ 18 ปี เล่นโทรศัพท์ขณะกำลังเดินเปลี่ยนห้องเรียน สะดุดหกล้ม ข้อเท้าพลิก ได้รับการรักษาโดยการใส่เฝือก (Short leg cast) ดังรูป หลังใส่เฝือกเสร็จแพทย์ให้กลับไปพักผ่อนที่บ้าน
            "
            questions={[
                "ขอให้ท่านให้คำแนะนำเรื่อง การดูแลเฝือก แก่ผู้ป่วยรายนี้ โดยให้ครอบคลุม หลังใส่เฝือกใหม่เมื่อเฝือกยังไม่แห้ง และเมื่อเฝือกแห้งแล้ว"
            ]}
            videoSrc="/surgical/surgical5.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab5Recording;