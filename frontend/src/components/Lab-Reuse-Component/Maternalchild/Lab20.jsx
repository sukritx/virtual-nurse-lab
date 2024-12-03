import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import LabRecordingComponent from '../../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab20Recording = () => {
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
            navigate('/student/maternalchild20cn');
        } else if (newLanguage === 'en') {
            navigate('/student/maternalchild20en');
        } else if (newLanguage === 'jp') {
            navigate('/student/maternalchild20jp');
        } else if (newLanguage === 'id') {
            navigate('/student/maternalchild20indo');
        }
    };

    return (
        <LabRecordingComponent
            labNumber={20}
            title="สถานการณ์ที่ 20 การพยาบาลในระยะที่ 3 ของการคลอด"
            subtitle="การพยาบาลในระยะที่ 3 ของการคลอด"
            description="ณ ห้องคลอด
            เวลา 10.00 น. ผู้คลอดครรภ์แรก คลอดทารกเพศหญิง BW 2,700 grams. Apgar’s score นาทีที่ 1 = 9 คะแนน  
            เวลา 10.05 น. มีเลือดไหลออกทางช่องคลอดเล็กน้อย มดลูกแบนอยู่ตรงกลางระดับสะดือ สายสะดือบิดเป็นเกลียว  คลำพบการเต้นของชีพจร

            Scene: ผู้คลอดหลังทารกคลอด กำลังรอรกลอกตัว
            “พี่พยาบาลคะ หนูปวดถ่าย เหมือนอยากจะเบ่งแล้วค่ะ อั้นไม่ไหวแล้วค่ะ” 
            "
            questions={[
                "จะประเมินการลอกตัวของรกในผู้คลอดรายนี้อย่างไร พร้อมอธิบายเหตุผล",
                "ควรตัดสินใจทำคลอดรกเลยหรือไม่ พร้อมอธิบายเหตุผล",
                "จะตัดสินใจทำคลอดรกเมื่อใด อธิบายเหตุผล พร้อมอธิบายวิธีการทำคลอดรกแบบ Modified Crede’ Maneuver"
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

export default Lab20Recording;