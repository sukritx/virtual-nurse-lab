import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import LabRecordingComponent from '../../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab19Recording = () => {
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
                const lab19 = response.data.labs.find(lab => lab.labInfo.labNumber === 19);
                if (lab19) {
                    setAttemptsLeft(lab19.attemptsLeft);
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
            navigate('/student/maternalchild19cn');
        } else if (newLanguage === 'en') {
            navigate('/student/maternalchild19en');
        } else if (newLanguage === 'jp') {
            navigate('/student/maternalchild19jp');
        } else if (newLanguage === 'id') {
            navigate('/student/maternalchild19indo');
        }
    };

    return (
        <LabRecordingComponent
            labNumber={19}
            title="สถานการณ์ที่ 19 การพยาบาลในระยะที่ 2 ของการคลอด"
            subtitle="การพยาบาลในระยะที่ 2 ของการคลอด"
            description="ณ ห้องคลอด
            รับใหม่ผู้คลอดครรภ์แรก อายุ 20 ปี GA 39 สัปดาห์ ตรวจภายในพบ Cervix dilated 8 cm. Effacement 100% Membrane intact Station 0 ส่วนนำเป็น Vertex ท่าทารก ROA FHR 148 bpm คาดคะเนน้ำหนักของทารกได้ 3,000 grams. ประเมินการหดรัดตัวของมดลูก Interval 3 นาที Duration 45 วินาที Strong Intensity 
            2 ชั่วโมงต่อมา ประเมินการหดรัดตัวของมดลูก Interval 2 นาที Duration 50 วินาที Strong Intensity มีเลือดออกเปื้อนผ้าถุง ขณะรอคลอดอยู่บนเตียงผู้ป่วย “พี่พยาบาลคะ หนูปวดถ่าย เหมือนอยากจะเบ่งแล้วค่ะ อั้นไม่ไหวแล้วค่ะ” 

            Scene: ผู้คลอดนอนอยู่บนเตียงผู้ป่วย 
            “พี่พยาบาลคะ หนูปวดถ่าย เหมือนอยากจะเบ่งแล้วค่ะ อั้นไม่ไหวแล้วค่ะ” 
            "
            questions={[
                "ควรพิจารณาย้ายผู้คลอดรายนี้ไปยังห้องคลอดหรือไม่ พร้อมอธิบายเหตุผล",
                "อธิบายการพยาบาลผู้คลอด สอนและสาธิตวิธีการหายใจในระยะที่ 2 ของการคลอด และแนะนำการเบ่งคลอดอย่างมีประสิทธิภาพ"
            ]}
            videoSrc="/maternalchild/situation19.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab19Recording;