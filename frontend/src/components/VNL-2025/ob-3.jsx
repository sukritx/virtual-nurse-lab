// ob-3.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from './SurgicalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab3Recording = () => {
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
                const lab3 = response.data.labs.find(lab => lab.labInfo.labNumber === 3);
                if (lab3) {
                    setAttemptsLeft(lab3.attemptsLeft);
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
            labNumber={3}
            title="สถานการณ์ที่3: การพิจารณารับใหม่ผู้คลอด"
            subtitle="การพิจารณารับใหม่ผู้คลอด"
            description="
            หญิงตั้งครรภ์รายหนึ่ง อายุ 23 ปี GA 38 สัปดาห์ มาโรงพยาบาลด้วยอาการปวดหน่วงหัวหน่าว หน้าท้องร้าวไปที่หลัง มีมูกเลือดออกทางช่องคลอด Cervix dilated 2 cm. Effacement 75% Membrane intact Station -3 ส่วนนำเป็น Vertex ท่าทารก LOA FHR 152 ครั้งต่อนาที ประเมินการหดรัดตัวของมดลูก
            Scene: หญิงตั้งครรภ์ใส่ชุดคลุมท้องเดินเข้ามา ร้องโอดครวญ บ่นปวดท้อง Interval 3 นาที 10 วินาที Duration 45 วินาที Intensity Moderate
            "
            questions={[
                "การซักประวัติผู้คลอดรายนี้ควรครอบคลุมประเด็นใดบ้าง และพิจารณาข้อมูลสำคัญจากสมุดฝากครรภ์อะไรบ้าง",
                "จะพิจารณารับผู้คลอดรายนี้ไว้ในโรงพยาบาลหรือไม่ พร้อมอธิบายเหตุผล"
            ]}
            videoSrc="/ob/ob3.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab3Recording;