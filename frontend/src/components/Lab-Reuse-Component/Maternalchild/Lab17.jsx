import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import LabRecordingComponent from '../../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab17Recording = () => {
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
                const lab17 = response.data.labs.find(lab => lab.labInfo.labNumber === 17);
                if (lab17) {
                    setAttemptsLeft(lab17.attemptsLeft);
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
            navigate('/student/maternalchild17cn');
        } else if (newLanguage === 'en') {
            navigate('/student/maternalchild17en');
        } else if (newLanguage === 'jp') {
            navigate('/student/maternalchild17jp');
        } else if (newLanguage === 'id') {
            navigate('/student/maternalchild17indo');
        }
    };

    return (
        <LabRecordingComponent
            labNumber={17}
            title="สถานการณ์ที่ 17 การประเมินองค์ประกอบของการคลอด"
            subtitle="การประเมินองค์ประกอบการคลอด (5P)"
            description="ณ ห้องคลอด
            ผู้คลอดครรภ์แรก อายุ 20 ปี GA 39 สัปดาห์ ส่วนสูง 152 cms. ปฏิเสธประวัติการผ่าตัดเกี่ยวกับกระดูกอุ้งเชิงกราน/อุบัติเหตุเกี่ยวกับกระดูกอุ้งเชิงกราน/โรค ประเมินลักษณะช่องเชิงกรานตามแนวของ Caldwell-Moloy classification พบว่าเป็นแบบ Gynecoid
            เวลา 08.00 น. ตรวจภายในพบ Cervix dilated 3 cm. Effacement 100% Membrane intact Station 0 ส่วนนำเป็น Vertex ท่าทารก ROA FHR 148 bpm คาดคะเนน้ำหนักของทารกได้ 2,700 grams. ประเมินการหดรัดตัวของมดลูก Interval 5 นาที Duration 40 วินาที Moderate Intensity 

            Scene: ผู้คลอดนอนอยู่บนเตียงผู้ป่วย อยากให้ผ่าตัดคลอดทางหน้าท้อง
            “พี่พยาบาลคะ อีกนานไหมกว่าจะคลอด ขอผ่าคลอดเลยได้ไหม”
            "
            questions={[
                "ประเมินองค์ประกอบการคลอด (5P) ของผู้คลอดรายนี้ว่ามีความผิดปกติหรือไม่ พร้อมอธิบายเหตุผล",
                "ให้คำแนะนำเกี่ยวกับการคลอดแก่ผู้คลอดรายนี้ พร้อมระบุระยะเวลาคลอดตามหลักของ Friedman"
            ]}
            videoSrc="/maternalchild/situation17.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab17Recording;