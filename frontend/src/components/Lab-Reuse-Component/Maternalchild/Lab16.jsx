import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import LabRecordingComponent from '../../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab16Recording = () => {
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
                const lab16 = response.data.labs.find(lab => lab.labInfo.labNumber === 16);
                if (lab16) {
                    setAttemptsLeft(lab16.attemptsLeft);
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
            navigate('/student/maternalchild16cn');
        } else if (newLanguage === 'en') {
            navigate('/student/maternalchild16en');
        } else if (newLanguage === 'jp') {
            navigate('/student/maternalchild16jp');
        } else if (newLanguage === 'id') {
            navigate('/student/maternalchild16indo');
        }
    };

    return (
        <LabRecordingComponent
            labNumber={16}
            title="สถานการณ์ที่ 16 การพิจารณารับใหม่ผู้คลอด"
            subtitle="การพิจารณารับใหม่ผู้คลอด"
            description="หญิงตั้งครรภ์รายหนึ่ง อายุ 23 ปี GA 38 สัปดาห์ มาโรงพยาบาลด้วยอาการปวดหน่วงหัวหน่าว หน้าท้องร้าวไปที่หลัง มีมูกเลือดออกทางช่องคลอด Cervix dilated 2 cm. Effacement 75% Membrane intact Station -3 ส่วนนำเป็น Vertex ท่าทารก LOA FHR 152 ครั้งต่อนาที ประเมินการหดรัดตัวของมดลูก
            Scene: หญิงตั้งครรภ์ใส่ชุดคลุมท้องเดินเข้ามา ร้องโอดครวญ บ่นปวดท้อง Interval 3 นาที 10 วินาที Duration 45 วินาที Intensity Moderate
            "
            questions={[
                "การซักประวัติผู้คลอดรายนี้ควรครอบคลุมประเด็นใดบ้าง และพิจารณาข้อมูลสำคัญจากสมุดฝากครรภ์อะไรบ้าง",
                "จะพิจารณารับผู้คลอดรายนี้ไว้ในโรงพยาบาลหรือไม่ พร้อมอธิบายเหตุผล"
            ]}
            videoSrc="/maternalchild/situation16.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab16Recording;