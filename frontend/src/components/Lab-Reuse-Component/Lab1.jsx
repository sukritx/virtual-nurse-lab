import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import LabRecordingComponent from '../LabRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab1Recording = () => {
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
                const lab1 = response.data.labs.find(lab => lab.labInfo.labNumber === 1);
                if (lab1) {
                    setAttemptsLeft(lab1.attemptsLeft);
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
            navigate('/student/upload1cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload1en');
        } else if (newLanguage === 'jp') {
            navigate('/student/upload1jp');
        }
    };

    return (
        <LabRecordingComponent
            labNumber={1}
            title="Lab 1: การเลี้ยงลูกด้วยนมแม่"
            subtitle="มารดาเจ็บหัวนมด้านขวา"
            description="มารดาอายุ 17 ปี หลังคลอดบุตรคนแรกเพศชายได้ 1 วัน บุตรสุขภาพแข็งแรงดี บุตรหนัก 2,800 กรัม 
                        มารดายังอุ้มบุตรดูดนมเองไม่ได้ น้ำนมเริ่มไหล มีอาการเจ็บหัวนมขณะที่บุตรดูดนม เจ็บข้างขวามากกว่าข้างซ้าย 
                        ประเมิน LATCH score = 5 (latch on=1, audible=1, type of nipple=2, comfort=1, holding= 0)"
            questions={[
                "ท่านจะให้คำแนะนำใดแก่มารดารายนี้ เช่น การดูดอย่างถูกวิธี 4 ดูด การแก้ไขปัญหา",
                "ท่านจะสาธิตท่าอุ้มที่ถูกต้อง และการบรรเทา/ป้องกันการเจ็บหัวนม ให้กับมารดารายนี้อย่างไร"
            ]}
            videoSrc="/questionVideos/situation1.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab1Recording;