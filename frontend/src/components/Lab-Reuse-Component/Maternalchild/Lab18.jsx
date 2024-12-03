import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import LabRecordingComponent from '../../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab18Recording = () => {
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
                const lab18 = response.data.labs.find(lab => lab.labInfo.labNumber === 18);
                if (lab18) {
                    setAttemptsLeft(lab18.attemptsLeft);
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
            navigate('/student/maternalchild18cn');
        } else if (newLanguage === 'en') {
            navigate('/student/maternalchild18en');
        } else if (newLanguage === 'jp') {
            navigate('/student/maternalchild18jp');
        } else if (newLanguage === 'id') {
            navigate('/student/maternalchild18indo');
        }
    };

    return (
        <LabRecordingComponent
            labNumber={18}
            title="สถานการณ์ที่ 18 การดูแลในระยะที่ 1 ของการคลอด"
            subtitle="การดูแลในระยะที่ 1 ของการคลอด"
            description="ณ ห้องคลอด
            ผู้คลอดครรภ์แรก อายุ 20 ปี GA 39 สัปดาห์ ตรวจภายในพบ Cervix dilated 5 cm. Effacement 75% Membrane intact Station -1 ส่วนนำเป็น Vertex ท่าทารก ROA FHR 148 ครั้งต่อนาที คาดคะเนน้ำหนักของทารกได้ 3,000 g. ประเมินการหดรัดตัวของมดลูก Interval 4 นาที Duration 45 วินาที Intensity strong

            Scene: ผู้คลอดนอนอยู่บนเตียงผู้ป่วย
            ขณะรอคลอดอยู่บนเตียงผู้ป่วย สีหน้าอิดโรย ริมฝีปากแห้ง บ่นเจ็บ 
            "
            questions={[
                "อธิบายวิธีการบรรเทาความเจ็บปวดในระยะรอคลอดโดยไม่ใช้ยาให้แก่ผู้คลอดรายนี้ พร้อมระบุเหตุผลทำไมแต่ละวิธีช่วยลดความเจ็บปวดได้",
                "อธิบายวิธีบรรเทาความเจ็บปวดในระยะรอคลอดโดยไม่ใช้ยาขณะที่เจ็บครรภ์คลอดให้แก่ผู้คลอดรายนี้อย่างไร (เช่น การหายใจ การเพ่งจุดสนใจ การลูบหน้าท้อง เป็นต้น)"
            ]}
            videoSrc="/maternalchild/situation18.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab18Recording;