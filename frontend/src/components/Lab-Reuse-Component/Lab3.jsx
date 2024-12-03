import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from '../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab3Recording = () => {
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
            navigate('/student/upload3cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload3en');
        } else if (newLanguage === 'jp') {
            navigate('/student/upload3jp');
        }
        // For Thai, we stay on the current page
    };

    return (
        <LabRecordingComponent
            labNumber={3}
            title="Lab 3: การเลี้ยงลูกด้วยนมแม่"
            subtitle="เต้านมคัดตึง"
            description="มารดาหลังคลอด 7 วัน มาปรึกษาที่คลินิกนมแม่ เนื่องจากเต้านมข้างขวาแข็งตึง กดเจ็บ น้ำนมข้างขวาไหลน้อยลง และลูกดูดนมข้างขวาไม่ได้มา 2 วัน

ตรวจร่างกายพบ เต้านมและลานนมข้างขวาแข็ง ตึง กดเจ็บ คลำไม่พบก้อน น้ำนมไหล 1-2 หยด ส่วนเต้านมข้างซ้ายปกติ น้ำนมไหลดี

ข้อมูลจากการซักประวัติ มารดาถนัดให้ลูกดูดนมข้างซ้ายมากกว่าข้างขวา แต่ละมื้อที่ให้นมลูกจะดูดนมข้างเดียว ส่วนเต้านมอีกข้างที่ลูกไม่ได้ดูด ไม่ได้บีบน้ำนมออก เพราะเสียดายน้ำนมจะเก็บเอาไว้ให้ลูกกินมื้อถัดไป หลังจากดูดนมลูกจะหลับนาน 2-3 ชั่วโมง"
            questions={[
                "ท่านจะให้คำแนะนำใดแก่มารดารายนี้ เพื่อบรรเทาอาการคัดตึงเต้านมก่อนให้ลูกดูดนม ขณะลูกดูดนม และหลังจากลูกดูดนม"
            ]}
            videoSrc="/maternalchild/situation3.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab3Recording;