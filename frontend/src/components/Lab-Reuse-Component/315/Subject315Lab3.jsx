import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import Subject315RecordingComponent from '../../Subject315RecordingComponent';

const MAX_ATTEMPTS = 3;

const Subject315Lab3 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/315/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab3 = response.data.labs.find(lab => lab.labInfo.labNumber === 3);
                if (lab3) {
                    setAttemptsLeft(lab3.attemptsLeft);
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
            labNumber={3}
            title="ประเมิน LATCH score แนะนำการดูดนม"
            subtitle=""
            description="มารดาหลังคลอดปกติ 1 วัน หัวนมทั้ง 2 ข้างยาว 0.5 cm น้ำนมยังไม่ไหล พยายามให้ลูกดูดนมตนเองแต่ยังทำไม่ได้ พยาบาลเข้าไปประเมินผลว่า บุตรอมไม่ลึกถึงลานนม ไม่ได้ยินเสียงกลืน อุ้มบุตรดูดนมไม่ถูกวิธี บ่นเจ็บหัวนมขณะที่บุตรดูดนมมาก ให้นักศึกษาประเมิน LATCH score ของมารดารายนี้ และจากนั้นให้แนะนำการดูดนมที่ถูกวิธีแก่มารดารายนี้ (ตั้งแต่การนำทารกเข้าเต้า ไปจนถึงการนำทารกออกจากเต้านม) (100)"
            questions={[
                "ประเมิน LATCH score (50 คะแนน)",
                "แนะนำการดูดนมที่ถูกวิธี (50 คะแนน)"
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

export default Subject315Lab3;