import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from '../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab9Recording = () => {
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
                const lab9 = response.data.labs.find(lab => lab.labInfo.labNumber === 9);
                if (lab9) {
                    setAttemptsLeft(lab9.attemptsLeft);
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
            navigate('/student/upload9cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload9en');
        } else if (newLanguage === 'jp') {
            navigate('/student/upload9jp');
        }
        // For Thai, we stay on the current page
    };

    return (
        <LabRecordingComponent
            labNumber={9}
            title="Lab 9: การส่งเสริมพัฒนาการทารก"
            subtitle=""
            description=""
            questions={[
                "ท่านจะให้คำแนะนำแก่มารดาหลังคลอดรายนี้อย่างไร เพื่อเตรียมตัวกลับบ้าน เมื่อมารดาสอบถามว่า \"จะสามารถกระตุ้นพัฒนาการของลูกในช่วงแรกเกิดถึง 2 เดือนได้อย่างไร\""
            ]}
            videoSrc="/maternalchild/situation9.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
            instructionsLink="/library/1"
        />
    );
};

export default Lab9Recording;