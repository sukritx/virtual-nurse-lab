import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import Subject315RecordingComponent from '../../Subject315RecordingComponent';

const MAX_ATTEMPTS = 3;

const Subject315Lab1 = () => {
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
                const lab20 = response.data.labs.find(lab => lab.labInfo.labNumber === 20);
                if (lab20) {
                    setAttemptsLeft(lab20.attemptsLeft);
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
            navigate('/student/315/1cn');
        } else if (newLanguage === 'en') {
            navigate('/student/315/1en');
        } else if (newLanguage === 'jp') {
            navigate('/student/315/1jp');
        } else if (newLanguage === 'id') {
            navigate('/student/315/1indo');
        }
    };

    return (
        <Subject315RecordingComponent
            labNumber={1}
            title="อธิบายเกี่ยวกับการกลับคืนสู่สภาพเดิม"
            subtitle=""
            description="มารดาครรภ์ที่ 3 หลังคลอด 2 วัน ซักถามเกี่ยวกับอาการปวดมดลูก และก้อนที่คลำพบบริเวณหน้าท้อง ให้นักศึกษาแนะนำมารดารายนี้เกี่ยวกับการเปลี่ยนแปลงของมดลูกที่เกิดขึ้นภายหลังคลอด (โดยอธิบายเกี่ยวกับการกลับคืนสู่สภาพเดิม การลดระดับของมดลูก และอาการปวดมดลูก)"
            questions={[
                "การกลับคืนสู่สภาพเดิม (10 คะแนน)",
                "การลดระดับของมดลูก (50 คะแนน)",
                "อาการปวดมดลูก (50 คะแนน)"
            ]}
            videoSrc="/maternalchild/situation20.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Subject315Lab1;