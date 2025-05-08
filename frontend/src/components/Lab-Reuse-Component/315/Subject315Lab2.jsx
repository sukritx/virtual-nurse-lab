import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import Subject315RecordingComponent from '../../Subject315RecordingComponent';

const MAX_ATTEMPTS = 3;

const Subject315Lab2 = () => {
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
            labNumber={2}
            title="แนะนำการทำความสะอาดแผลฝีเย็บ"
            subtitle=""
            description="มารดาหลังคลอดปกติทางช่องคลอด 12 ชั่วโมง แผลฝีเย็บฉีกขาดระดับ 3 ประเมิน REEDA score = 7 (R=2, E=2, Ec=2, D=0, A=1) ปวดแผลฝีเย็บระดับ 8 ให้นักศึกษาแนะนำมารดารายนี้เกี่ยวกับการทำความสะอาดแผลฝีเย็บ การใช้ผ้าอนามัย และการบรรเทาปวดแผลฝีเย็บ"
            questions={[
                "การทำความสะอาดแผลฝีเย็บ (30 คะแนน)",
                "การใช้ผ้าอนามัย  (30 คะแนน)",
                "การบรรเทาปวดแผลฝีเย็บ (40 คะแนน)"
            ]}
            videoSrc=""
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Subject315Lab2;