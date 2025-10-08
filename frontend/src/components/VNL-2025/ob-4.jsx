// ob-4.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from './OBRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab4Recording = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth(); // Still need token for API calls for logged-in users
    const navigate = useNavigate();

    useEffect(() => {
        // Since this page is now behind a PrivateRoute, we know the user is logged in.
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/ob/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab4 = response.data.labs.find(lab => lab.labInfo.labNumber === 4);
                if (lab4) {
                    setAttemptsLeft(lab4.attemptsLeft);
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
            navigate('/ob/cn');
        } else if (newLanguage === 'en') {
            navigate('/ob/en');
        } else if (newLanguage === 'jp') {
            navigate('/ob/jp');
        } else if (newLanguage === 'id') {
            navigate('/ob/id');
        }
    };

    const handleSignupClick = () => {
        navigate('/signup');
    };

    return (
        <LabRecordingComponent
            labNumber={4}
            title="สถานการณ์ที่4: การพยาบาลในระยะที่ 1 ของการคลอด"
            subtitle="การดูแลในระยะที่ 1 ของการคลอด"
            description="
            ณ ห้องคลอด
            ผู้คลอดครรภ์แรก อายุ 20 ปี GA 39 สัปดาห์ ตรวจภายในพบ Cervix dilated 5 cm. Effacement 75% Membrane intact Station -1 ส่วนนำเป็น Vertex ท่าทารก ROA FHR 148 ครั้งต่อนาที คาดคะเนน้ำหนักของทารกได้ 3,000 g. ประเมินการหดรัดตัวของมดลูก Interval 4 นาที Duration 45 วินาที Intensity strong

            Scene: ผู้คลอดนอนอยู่บนเตียงผู้ป่วย
            ขณะรอคลอดอยู่บนเตียงผู้ป่วย สีหน้าอิดโรย ริมฝีปากแห้ง บ่นเจ็บ
            "
            questions={[
                "อธิบายวิธีการบรรเทาความเจ็บปวดในระยะรอคลอดโดยไม่ใช้ยาให้แก่ผู้คลอดรายนี้ พร้อมระบุเหตุผลทำไมแต่ละวิธีช่วยลดความเจ็บปวดได้",
                "อธิบายวิธีบรรเทาความเจ็บปวดในระยะรอคลอดโดยไม่ใช้ยาขณะที่เจ็บครรภ์คลอดให้แก่ผู้คลอดรายนี้อย่างไร (เช่น การหายใจ การเพ่งจุดสนใจ การลูบหน้าท้อง เป็นต้น)"
            ]}
            videoSrc="/ob/ob4.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab4Recording;