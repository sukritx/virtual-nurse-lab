import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from '../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab5Recording = () => {
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
                const lab5 = response.data.labs.find(lab => lab.labInfo.labNumber === 5);
                if (lab5) {
                    setAttemptsLeft(lab5.attemptsLeft);
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
            navigate('/student/upload5cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload5en');
        } else if (newLanguage === 'jp') {
            navigate('/student/upload5jp');
        }
        // For Thai, we stay on the current page
    };

    return (
        <LabRecordingComponent
            labNumber={5}
            title="Lab 5: การวางแผนครอบครัว"
            subtitle="ยาฝังคุมกำเนิด"
            description="มารดาหลังคลอดอายุ 17 ปี สามีอายุ 18 ปี ปัจจุบันทั้งคู่กำลังเรียน ปวช. ประจำเดือนมาไม่สม่ำเสมอ การตั้งครรภ์ครั้งนี้ไม่ได้วางแผน ก่อนตั้งครรภ์คุมกำเนิดโดยการหลั่งภายนอก และรับประทานยาคุมกำเนิดแต่มักจะลืมรับประทาน หลังคลอดตั้งใจเลี้ยงบุตรด้วยนมมารดา และจะต้องกลับไปเรียนหนังสือเมื่อครบ 3 เดือนหลังคลอด"
            questions={[
                "ท่านจะให้คำแนะนำเกี่ยวกับวิธีการคุมกำเนิดที่เหมาะสมแก่มารดาหลังคลอดรายนี้อย่างไร แนะนำ 1 วิธี",
                "หากมารดาหลังคลอดรายนี้ กำลังพิจารณาเลือกใช้ยาฝังคุมกำเนิด จะให้คำแนะนำอย่างไร เกี่ยวกับการใช้ยาฝังคุมกำเนิด ผลข้างเคียงที่อาจจะเกิดขึ้น และวิธีการแก้ไขปัญหาอย่างเหมาะสม"
            ]}
            videoSrc="/maternalchild/situation5.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
            instructionsLink="/library/1"
        />
    );
};

export default Lab5Recording;