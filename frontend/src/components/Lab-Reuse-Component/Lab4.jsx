import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from '../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab4Recording = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab4 = response.data.labs.find(lab => lab.labInfo.labNumber === 4);
                if (lab4) {
                    setAttemptsLeft(lab4.attemptsLeft);
                }
            } catch (error) {
                console.error('Error fetching lab info:', error);
            }
        };

        fetchLabInfo();
    }, [token]);

    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage);
        
        if (newLanguage === 'zh') {
            navigate('/student/upload4cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload4en');
        } else if (newLanguage === 'jp') {
            navigate('/student/upload4jp');
        }
        // For Thai, we stay on the current page
    };

    return (
        <LabRecordingComponent
            labNumber={4}
            title="Lab 4: การวางแผนครอบครัว"
            subtitle="ยาเม็ดคุมกำเนิด"
            description="มารดาอายุ 30 ปี หลังคลอดบุตรคนแรกได้ 5 วัน ต้องการเลี้ยงลูกด้วยนมแม่อย่างเดียวอย่างน้อย 6 เดือน และมีความกังวลเกี่ยวกับการคุมกำเนิดหลังคลอดขณะให้นมบุตร"
            questions={[
                "ท่านจะให้คำแนะนำเกี่ยวกับวิธีการคุมกำเนิดที่เหมาะสมแก่มารดาหลังคลอดรายนี้อย่างไร แนะนำ 1 วิธี",
                "หากมารดาหลังคลอดรายนี้ กำลังพิจารณาเลือกใช้ยาเม็ดคุมกำเนิดที่มีฮอร์โมนโปรเจสเตอโรนเพียงอย่างเดียว จะให้คำแนะนำอย่างไร เกี่ยวกับการใช้ยาเม็ดคุมกำเนิด ผลข้างเคียงที่อาจจะเกิดขึ้น และวิธีการแก้ไขปัญหาอย่างเหมาะสมกรณีที่ลืมรับประทานยาเม็ดคุมกำเนิด"
            ]}
            videoSrc="/maternalchild/situation4.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
            instructionsLink="/library/1"
        />
    );
};

export default Lab4Recording;