import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from '../LabRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab2Recording = () => {
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
                const lab2 = response.data.labs.find(lab => lab.labInfo.labNumber === 2);
                if (lab2) {
                    setAttemptsLeft(lab2.attemptsLeft);
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
            navigate('/student/upload2cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload2en');
        } else if (newLanguage === 'jp') {
            navigate('/student/upload2jp');
        }
        // For Thai, we stay on the current page
    };

    return (
        <LabRecordingComponent
            labNumber={2}
            title="Lab 2: การเลี้ยงลูกด้วยนมแม่"
            subtitle="มารดาต้องการเก็บน้ำนมไว้ให้ลูก"
            description="มารดาอายุ 32 ปี อาชีพรับราชการครู หลังคลอดบุตรคนแรกเพศหญิงได้ 14 วัน ให้บุตรกินนมมารดาอย่างเดียว บุตรสุขภาพแข็งแรงดี ปัจจุบันบุตรหนัก 3,750 กรัม มาที่คลินิกนมแม่เนื่องจากจะต้องกลับไปทำงานเมื่อครบกำหนดลาคลอด 3 เดือน เมื่อกลับไปทำงานคุณยาย(ของทารก)จะเป็นคนเลี้ยงดูบุตรให้ มารดาต้องการให้บุตรได้ กินนมมารดาอย่างเดียวไปจนถึง 6 เดือน จึงมาปรึกษาพยาบาลที่คลินิกนมแม่ว่าจะต้องทำอย่างไร"
            questions={[
                "ท่านจะให้คำแนะนำใดแก่มารดารายนี้ที่เตรียมตัวออกไปทำงานนอกบ้านอย่างไร (ครอบคลุมในประเด็น ประโยชน์ของนมแม่ อายุนมในตู้เย็น การใช้ถุงเก็บน้ำนม วิธีการละลายน้ำนม และอาหารเพิ่มน้ำนม)",
                "ท่านจะสาธิตวิธีบีบนมเก็บ ให้กับมารดารายนี้อย่างไร"
            ]}
            videoSrc="/questionVideos/situation2.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab2Recording;